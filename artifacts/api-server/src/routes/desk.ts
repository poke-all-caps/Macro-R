import { Router } from "express";
import { randomBytes } from "crypto";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import {
  ListAccountsResponseItem,
  AddAccountBody,
  DeleteAccountParams,
  RunNowBody,
  GetBotStatusResponse,
  GetRunLogsResponseItem,
} from "@workspace/api-zod";
import { z } from "zod";

import {
  getAgentStatus,
  requestAgentRun,
  requestAgentStop,
  spawnBotProcess,
  waitForAgent,
  getBufferedLogs,
  ensureLogSubscription,
  pushLog,
  WORKSPACE_ROOT,
} from "../lib/agent-client.js";

import {
  loadAccounts,
  addAccount,
  updateAccount,
  deleteAccount,
  loadLogs,
  appendLog,
  type DeskAccount,
} from "../lib/desk-storage.js";

// ─── Cookie-capture session registry ─────────────────────────────────────────

interface CaptureSession {
  child: ReturnType<typeof spawn>;
  statusFile: string;
  email: string;
}
const captureSessions = new Map<string, CaptureSession>();

const CAPTURE_DIR = path.join(WORKSPACE_ROOT, "data", "agent");

/** Resolve the tsx binary — prefer the api-server's own node_modules. */
function resolveTsx(): string {
  const candidates = [
    path.join(WORKSPACE_ROOT, "artifacts", "api-server", "node_modules", ".bin", "tsx"),
    path.join(WORKSPACE_ROOT, "node_modules", ".bin", "tsx"),
    "tsx",
  ];
  return candidates.find(p => p === "tsx" || fs.existsSync(p)) ?? "tsx";
}

function readCaptureStatus(statusFile: string): Record<string, unknown> | null {
  try { return JSON.parse(fs.readFileSync(statusFile, "utf8")); } catch { return null; }
}

const router = Router();

// ─── In-memory bot state overlay ─────────────────────────────────────────────
//
// We track a lightweight overlay on top of the agent IPC state so the desk UI
// can show "which account is currently running" without a separate IPC call on
// every poll tick.

interface BotOverlay {
  currentAccount:    string | null;
  lastRunAt:         string | null;
  totalSearchesToday: number;
  activeRunId:       string | null;
}

const overlay: BotOverlay = {
  currentAccount:    null,
  lastRunAt:         null,
  totalSearchesToday: 0,
  activeRunId:       null,
};

// Kick off log subscription in background on startup.
void ensureLogSubscription();

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * After a run completes, read the most recent run log entry per account and
 * update accounts.json with the accumulated points, searches, status and lastRun.
 */
function syncAccountStatsFromLogs(): void {
  try {
    const logs     = loadLogs();
    const accounts = loadAccounts();

    // Build a map: accountId → most recent log entry
    const latest = new Map<string, ReturnType<typeof loadLogs>[number]>();
    for (const log of logs) {
      if (!latest.has(log.accountId)) latest.set(log.accountId, log);
    }

    let changed = false;
    for (const account of accounts) {
      const log = latest.get(account.id);
      if (!log) continue;

      const newStatus = log.status === "success" ? "done" : log.status === "failed" ? "failed" : account.status;
      const newPoints = Math.max(account.totalPoints, log.pointsEarned);
      const newSearches = Math.max(account.searchesCompleted, log.searchesDone);

      if (
        account.status !== newStatus ||
        account.totalPoints !== newPoints ||
        account.searchesCompleted !== newSearches
      ) {
        try {
          updateAccount(account.id, {
            status:            newStatus as "done" | "failed" | "idle" | "running",
            totalPoints:       newPoints,
            searchesCompleted: newSearches,
            lastRun:           log.timestamp,
          });
          changed = true;
        } catch { /* ignore unknown ids */ }
      }
    }

    if (changed) {
      pushLog({
        userName: "DESK",
        level:    "info",
        platform: "MAIN",
        title:    "SYNC",
        message:  "Account stats synced from run logs.",
      });
    }
  } catch { /* never crash the status endpoint */ }
}

// ─── Routes ──────────────────────────────────────────────────────────────────

// GET /desk/accounts
router.get("/desk/accounts", (_req, res): void => {
  res.json(loadAccounts());
});

// POST /desk/accounts
router.post("/desk/accounts", (req, res): void => {
  const parsed = AddAccountBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const account = addAccount({ email: parsed.data.email, name: parsed.data.name });
    res.status(201).json(account);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(409).json({ error: message });
  }
});

// PATCH /desk/accounts/:id
router.patch("/desk/accounts/:id", (req, res): void => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const body = z.object({
    name:   z.string().min(1).optional(),
    email:  z.string().email().optional(),
    resync: z.boolean().optional(),
  }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  try {
    const patch: Partial<DeskAccount> = {};
    if (body.data.name)  patch.name  = body.data.name;
    if (body.data.email) patch.email = body.data.email;
    if (body.data.resync) {
      patch.status           = "idle";
      patch.searchesCompleted = 0;
      patch.todayPoints      = 0;
    }
    const account = updateAccount(id, patch);
    res.json(account);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(404).json({ error: message });
  }
});

// DELETE /desk/accounts/:id
router.delete("/desk/accounts/:id", (req, res): void => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (!deleteAccount(id)) {
    res.status(404).json({ error: "Account not found" });
    return;
  }
  res.json({ success: true });
});

// GET /desk/status
router.get("/desk/status", async (_req, res): Promise<void> => {
  try {
    const agentStatus = await getAgentStatus();
    const isRunning   = agentStatus.active && agentStatus.runState === "running";

    if (!isRunning && overlay.activeRunId) {
      // Run finished — record final overlay state
      overlay.lastRunAt    = new Date().toISOString();
      overlay.activeRunId  = null;
      overlay.currentAccount = null;

      // Sync account stats from the most recent run log per account
      syncAccountStatsFromLogs();
    }

    // Also fix any accounts stuck in "running" status when the agent is idle
    if (!isRunning) {
      const stuckAccounts = loadAccounts().filter(a => a.status === "running");
      for (const a of stuckAccounts) {
        try { updateAccount(a.id, { status: "done" }); } catch { /* ignore */ }
      }
    }

    res.json({
      isRunning,
      currentAccount:    overlay.currentAccount,
      lastRunAt:         overlay.lastRunAt,
      totalSearchesToday: overlay.totalSearchesToday,
      activeRunId:       overlay.activeRunId,
      agentActive:       agentStatus.active,
      agentPid:          agentStatus.pid,
    });
  } catch {
    res.json({
      isRunning:          false,
      currentAccount:     null,
      lastRunAt:          overlay.lastRunAt,
      totalSearchesToday: overlay.totalSearchesToday,
      activeRunId:        null,
      agentActive:        false,
    });
  }
});

// POST /desk/run-now
router.post("/desk/run-now", async (req, res): Promise<void> => {
  const parsed = RunNowBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Check if already running via the overlay (fast, no IPC)
  if (overlay.activeRunId) {
    res.status(409).json({ started: false, message: "Bot is already running" });
    return;
  }

  const accounts = loadAccounts();
  if (accounts.length === 0) {
    res.status(400).json({ started: false, message: "No accounts configured. Add accounts first." });
    return;
  }

  // ── Ensure agent is running ──────────────────────────────────────────────
  let agentStatus = await getAgentStatus();

  if (!agentStatus.active) {
    pushLog({
      userName: "DESK",
      level:    "info",
      platform: "MAIN",
      title:    "BOT-START",
      message:  "Spawning bot background process…",
    });
    spawnBotProcess();
    const ready = await waitForAgent(10_000);
    if (!ready) {
      res.status(503).json({
        started: false,
        message: "Bot process did not start within 10 seconds. Check that src/accounts.json exists and packages are installed.",
      });
      return;
    }
    agentStatus = await getAgentStatus();
    // Re-subscribe to logs after the new process starts
    void ensureLogSubscription();
  }

  if (agentStatus.runState === "running") {
    res.status(409).json({ started: false, message: "Bot is already running a task" });
    return;
  }

  // ── Send run_now via IPC ─────────────────────────────────────────────────
  const result = await requestAgentRun();

  if (!result.accepted) {
    res.status(409).json({ started: false, message: result.reason ?? "Bot rejected the run" });
    return;
  }

  const runId = `run-${randomBytes(4).toString("hex")}`;
  overlay.activeRunId    = runId;
  overlay.currentAccount = accounts[0]?.name ?? null;

  // Update account statuses to "running"
  const targetIds = parsed.data.accountIds?.length
    ? parsed.data.accountIds
    : accounts.map(a => a.id);
  for (const id of targetIds) {
    try { updateAccount(id, { status: "running" }); } catch { /* ignore unknown ids */ }
  }

  pushLog({
    userName: "DESK",
    level:    "info",
    platform: "MAIN",
    title:    "RUN-START",
    message:  `Run ${runId} started for ${targetIds.length} account(s)`,
  });

  res.json({ started: true, message: `Run started for ${targetIds.length} account(s)`, runId });
});

// POST /desk/stop
router.post("/desk/stop", async (_req, res): Promise<void> => {
  const stopped = await requestAgentStop();

  if (overlay.activeRunId) {
    overlay.activeRunId    = null;
    overlay.currentAccount = null;
    overlay.lastRunAt      = new Date().toISOString();
  }

  // Mark all running accounts as idle
  const accounts = loadAccounts();
  for (const account of accounts) {
    if (account.status === "running") {
      try { updateAccount(account.id, { status: "idle" }); } catch { /* ignore */ }
    }
  }

  pushLog({
    userName: "DESK",
    level:    "info",
    platform: "MAIN",
    title:    "STOP-REQUESTED",
    message:  stopped ? "Stop signal sent to bot" : "Bot was not running",
  });

  res.json({ stopped, message: stopped ? "Stop signal sent" : "Bot was not running" });
});

// GET /desk/logs
//
// Returns a merged view: buffered agent logs + desk run-logs from disk.
// Sorted by time, most recent first.
router.get("/desk/logs", (_req, res): void => {
  // Refresh subscription in case the bot restarted
  void ensureLogSubscription();

  const diskLogs = loadLogs();
  res.json(diskLogs.slice(0, 50));
});

// GET /desk/agent-logs — raw agent log stream buffer
router.get("/desk/agent-logs", (_req, res): void => {
  res.json(getBufferedLogs().slice(0, 100));
});

// POST /desk/seed-demo — add demo accounts for dev/preview
router.post("/desk/seed-demo", (_req, res): void => {
  const demos = [
    { name: "Demo User A", email: "demo.a@outlook.com" },
    { name: "Demo User B", email: "demo.b@hotmail.com" },
    { name: "Demo User C", email: "demo.c@live.com" },
    { name: "Demo User D", email: "demo.d@msn.com" },
  ];
  let added = 0;
  const existing = loadAccounts();
  for (const d of demos) {
    if (!existing.some(a => a.email === d.email)) {
      try { addAccount(d); added++; } catch { /* skip duplicates */ }
    }
  }
  res.json({ added, total: loadAccounts().length });
});

// DELETE /desk/seed-demo — remove demo accounts
router.delete("/desk/seed-demo", (_req, res): void => {
  const demoEmails = ["demo.a@outlook.com", "demo.b@hotmail.com", "demo.c@live.com", "demo.d@msn.com"];
  const accounts = loadAccounts();
  const before = accounts.length;
  for (const a of accounts) {
    if (demoEmails.includes(a.email)) {
      try { deleteAccount(a.id); } catch { /* ignore */ }
    }
  }
  res.json({ removed: before - loadAccounts().length, total: loadAccounts().length });
});

// ─── Manual cookie import ─────────────────────────────────────────────────────

// POST /desk/import-cookies — save a user-pasted cookie JSON blob to disk
router.post("/desk/import-cookies", (req, res): void => {
  const body = req.body as Record<string, unknown>;
  const email   = (typeof body.email   === "string" ? body.email   : "").trim();
  const cookies = typeof body.cookies === "string" ? body.cookies : "";

  if (!email || !cookies) {
    res.status(400).json({ error: "email and cookies are required" });
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(cookies);
  } catch {
    res.status(400).json({ error: "Invalid JSON — paste the raw cookie array exported by Cookie-Editor." });
    return;
  }

  if (!Array.isArray(parsed)) {
    res.status(400).json({ error: "Expected a JSON array of cookie objects." });
    return;
  }

  // Require at least one cookie from a Microsoft / Bing domain so we know the
  // user exported from the right site.
  const msCount = (parsed as Array<{ domain?: string }>).filter(c =>
    typeof c.domain === "string" &&
    (c.domain.includes(".microsoft.com") || c.domain.includes(".bing.com") || c.domain.includes(".live.com"))
  ).length;

  if (msCount === 0) {
    res.status(400).json({
      error: "No Microsoft / Bing cookies found. Make sure you exported from rewards.microsoft.com.",
    });
    return;
  }

  const sessionDir  = path.join(WORKSPACE_ROOT, "sessions", email);
  fs.mkdirSync(sessionDir, { recursive: true });
  const sessionFile = path.join(sessionDir, "session_desktop.json");
  fs.writeFileSync(sessionFile, JSON.stringify(parsed, null, 2), "utf8");

  res.json({ saved: true, count: (parsed as unknown[]).length, sessionFile });
});

// ─── Cookie-capture routes ────────────────────────────────────────────────────

// POST /desk/capture-session — spawn the cookie-capture browser helper
router.post("/desk/capture-session", (req, res): void => {
  const email = ((req.body as Record<string, unknown>)?.email as string | undefined ?? "").trim();
  if (!email) { res.status(400).json({ error: "email is required" }); return; }

  const sessionId  = randomBytes(6).toString("hex");
  const statusFile = path.join(CAPTURE_DIR, `capture-${sessionId}.json`);
  fs.mkdirSync(CAPTURE_DIR, { recursive: true });

  // Pre-write the status file so the poll endpoint always has something to
  // return, even if the child process crashes before running a single line.
  fs.writeFileSync(
    statusFile,
    JSON.stringify({ sessionId, email, status: "opening" }, null, 2)
  );

  const tsxBin     = resolveTsx();
  const scriptPath = path.join(WORKSPACE_ROOT, "scripts", "desk", "cookie-capture.ts");

  const child = spawn(tsxBin, [scriptPath, sessionId, email, statusFile], {
    cwd:   WORKSPACE_ROOT,
    stdio: ["ignore", "ignore", "pipe"], // capture stderr for error reporting
    env:   { ...process.env },
  });

  // Collect stderr so early crashes (tsx compile error, missing binary, etc.)
  // show a meaningful error in the UI instead of silently staying at "opening".
  let stderrBuf = "";
  (child.stderr as NodeJS.ReadableStream | null)?.on("data", (chunk: Buffer) => {
    stderrBuf += chunk.toString();
  });

  child.on("error", (err: Error) => {
    try {
      fs.writeFileSync(statusFile, JSON.stringify({ sessionId, email, status: "failed", error: err.message }, null, 2));
    } catch { /* best-effort */ }
  });

  child.on("exit", (code: number | null) => {
    const s = readCaptureStatus(statusFile);
    const currentStatus = s?.["status"] as string | undefined;
    if (currentStatus !== "done") {
      try {
        // Use captured stderr as the error message when available.
        const errMsg = stderrBuf.trim().split("\n")[0]?.trim()
          || `Process exited with code ${code}`;
        fs.writeFileSync(
          statusFile,
          JSON.stringify({ sessionId, email, status: "failed", error: errMsg }, null, 2)
        );
      } catch { /* best-effort */ }
    }
    captureSessions.delete(sessionId);
  });

  captureSessions.set(sessionId, { child, statusFile, email });
  res.json({ sessionId });
});

// GET /desk/capture-session/:id — poll status
router.get("/desk/capture-session/:id", (req, res): void => {
  const sid  = req.params.id;
  const sess = captureSessions.get(sid);
  const statusFile = sess
    ? sess.statusFile
    : path.join(CAPTURE_DIR, `capture-${sid}.json`);
  const status = readCaptureStatus(statusFile);
  if (!status) { res.status(404).json({ error: "Session not found" }); return; }
  res.json(status);
});

// DELETE /desk/capture-session/:id — abort
router.delete("/desk/capture-session/:id", (req, res): void => {
  const sid  = req.params.id;
  const sess = captureSessions.get(sid);
  if (sess) {
    try { sess.child.kill(); } catch { /* ignore */ }
    captureSessions.delete(sid);
  }
  try { fs.rmSync(path.join(CAPTURE_DIR, `capture-${sid}.json`), { force: true }); } catch { /* ignore */ }
  res.json({ aborted: true });
});

export default router;
