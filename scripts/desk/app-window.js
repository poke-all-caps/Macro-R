/**
 * app-window.js — Rewards Desk Command Center
 * --------------------------------------------
 * Spins up a local HTTP server on port 3000 using ONLY Node built-ins,
 * serves the pre-built React UI from dist-desk/, and optionally launches
 * Chrome/Edge in "--app" mode so the UI looks like a native desktop window.
 *
 * Zero npm dependencies — just run:
 *   node scripts\desk\app-window.js
 *
 * Environment variables (optional):
 *   PORT          Override the default port (default: 3000)
 *   MSRB_TOKEN    Fix the security token (auto-generated if not set)
 *   NO_WINDOW     Set to "1" to skip launching the browser window
 */

const http        = require("http");
const fs          = require("fs");
const net         = require("net");
const path        = require("path");
const { spawnSync, spawn } = require("child_process");
const { randomBytes }      = require("crypto");
const storage     = require("./account-storage");

// ─── Configuration ────────────────────────────────────────────────────────────

const PORT        = parseInt(process.env.PORT ?? "3000", 10);
const MSRB_TOKEN  = process.env.MSRB_TOKEN ?? randomBytes(24).toString("hex");
const OPEN_WINDOW = process.env.NO_WINDOW !== "1";

/** Absolute path to the workspace root (two levels up from scripts/desk/). */
const WORKSPACE_ROOT = path.resolve(__dirname, "../../");

/** Root of the bot source package — spawn cwd and data root live here. */
const BOT_ROOT = path.resolve(WORKSPACE_ROOT, "references", "bot-source");

/** Pre-built UI lives at <project-root>/dist-desk/ */
const UI_DIST = path.resolve(__dirname, "../../dist-desk");

// ─── MIME types ───────────────────────────────────────────────────────────────

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js":   "application/javascript",
  ".mjs":  "application/javascript",
  ".css":  "text/css",
  ".svg":  "image/svg+xml",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif":  "image/gif",
  ".ico":  "image/x-icon",
  ".woff": "font/woff",
  ".woff2":"font/woff2",
  ".ttf":  "font/ttf",
  ".json": "application/json",
  ".txt":  "text/plain",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch  { resolve({}); }
    });
    req.on("error", reject);
  });
}

function serveStatic(res, filePath) {
  const ext  = path.extname(filePath).toLowerCase();
  const mime = MIME[ext] ?? "application/octet-stream";
  try {
    const data = fs.readFileSync(filePath);
    res.writeHead(200, { "Content-Type": mime });
    res.end(data);
  } catch {
    try {
      const index = fs.readFileSync(path.join(UI_DIST, "index.html"));
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(index);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  }
}

// ─── Agent IPC client (pure Node built-ins) ──────────────────────────────────
//
// The bot process writes its port + token to data/agent/agent.json.
// We read that file and send JSON-newline messages over a TCP socket.

const AGENT_STATE_FILE = path.join(BOT_ROOT, "data", "agent", "agent.json");

/** In-memory log buffer (most recent first, capped at 150). */
const logBuffer = [];
const MAX_BUFFERED_LOGS = 150;
let   logSocket = null;

function _parseJson(raw) {
  try { return JSON.parse(raw); } catch { return null; }
}

async function _readAgentState() {
  try {
    const raw   = await fs.promises.readFile(AGENT_STATE_FILE, "utf8");
    const state = _parseJson(raw);
    if (
      !state ||
      state.version !== 1 ||
      !state.port   ||
      !state.token  ||
      !state.pid    ||
      state.cwd !== WORKSPACE_ROOT
    ) {
      await fs.promises.rm(AGENT_STATE_FILE, { force: true }).catch(() => {});
      return null;
    }
    return state;
  } catch {
    return null;
  }
}

function _sendMessage(state, message, timeoutMs) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port: state.port });
    socket.setEncoding("utf8");
    let buffer  = "";
    let settled = false;

    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.end();
      resolve(value);
    };

    const timer = setTimeout(() => { settled = true; socket.destroy(); resolve(null); }, timeoutMs);

    socket.on("connect", () => {
      socket.write(JSON.stringify({ token: state.token, ...message }) + "\n");
    });
    socket.on("data", (chunk) => {
      buffer += chunk;
      let nl = buffer.indexOf("\n");
      while (nl >= 0) {
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        finish(_parseJson(line));
        nl = buffer.indexOf("\n");
      }
    });
    socket.on("error", () => finish(null));
    socket.on("close",  () => finish(null));
  });
}

async function getAgentStatus() {
  const state = await _readAgentState();
  if (!state) return { active: false, runState: "idle" };
  const response = await _sendMessage(state, { type: "ping" }, 3000);
  if (!response || response.type !== "pong") return { active: false, runState: "idle" };
  return { active: true, pid: state.pid, runState: response.runState ?? "idle" };
}

async function requestAgentRun() {
  const state = await _readAgentState();
  if (!state) return { accepted: false, reason: "Agent offline" };
  const response = await _sendMessage(state, { type: "run_now" }, 8000);
  if (!response) return { accepted: false, reason: "IPC timeout — agent may be busy" };
  return { accepted: response.accepted === true, reason: response.reason };
}

async function requestAgentStop() {
  const state = await _readAgentState();
  if (!state) return false;
  const response = await _sendMessage(state, { type: "stop" }, 5000);
  return !!response?.stopped;
}

function spawnBotProcess() {
  // Try tsx in every known location before falling back to global tsx.
  const tsxBin = resolveTsx();

  console.log(`[bot] Spawning: ${tsxBin} index.ts --background (cwd: ${BOT_ROOT})`);

  // Capture bot output via pipe so errors are always readable on all platforms.
  const botLogPath = path.join(BOT_ROOT, "bot-crash.log");
  const logStream  = fs.createWriteStream(botLogPath, { flags: "w" });
  console.log(`[bot] Output → ${botLogPath}`);

  const isCmd = tsxBin.endsWith(".cmd") || tsxBin.endsWith(".bat");
  const child = isCmd
    ? spawn("cmd.exe", ["/c", tsxBin, "index.ts", "--background"], {
        cwd:   BOT_ROOT,
        stdio: ["ignore", "pipe", "pipe"],
        env:   { ...process.env, MSRB_UI_CHILD: "1" },
      })
    : spawn(tsxBin, ["index.ts", "--background"], {
        cwd:   BOT_ROOT,
        stdio: ["ignore", "pipe", "pipe"],
        env:   { ...process.env, MSRB_UI_CHILD: "1" },
      });

  child.stdout.pipe(logStream, { end: false });
  child.stderr.pipe(logStream, { end: false });

  child.on("error", (err) => {
    logStream.write(`[spawn-error] ${err.message}\n`);
    logStream.end();
    console.error(`[bot] Failed to start: ${err.message}`);
    _pushLog({ userName: "DESK", level: "error", platform: "MAIN", title: "SPAWN-ERR",
               message: `Failed to start bot: ${err.message}` });
  });
  child.on("close", (code) => {
    logStream.end();
    if (code !== 0) {
      console.error(`[bot] Exited with code ${code} — see bot-crash.log`);
      _pushLog({ userName: "DESK", level: "error", platform: "MAIN", title: "BOT-CRASH",
                 message: `Bot exited (code ${code}). Open bot-crash.log for details.` });
    }
  });
  // Do NOT detach — keeping the child attached to this process is what makes
  // stdio piping work. child.unref() still lets app-window exit independently.
  child.unref();
}

async function waitForAgent(maxMs = 15000) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const status = await getAgentStatus();
    if (status.active) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

function _pushLog(entry) {
  logBuffer.unshift({ time: new Date().toISOString(), ...entry });
  if (logBuffer.length > MAX_BUFFERED_LOGS) logBuffer.pop();
}

/** Attach to the bot's log stream (idempotent). */
async function ensureLogSubscription() {
  if (logSocket && !logSocket.destroyed) return;
  const state = await _readAgentState();
  if (!state) return;

  const socket = net.connect({ host: "127.0.0.1", port: state.port });
  socket.setEncoding("utf8");
  let buffer = "";

  socket.on("connect", () => {
    socket.write(JSON.stringify({ token: state.token, type: "attach" }) + "\n");
  });
  socket.on("data", (chunk) => {
    buffer += chunk;
    let nl = buffer.indexOf("\n");
    while (nl >= 0) {
      const line = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 1);
      const msg = _parseJson(line);
      if (msg?.type === "log" && msg.log) {
        logBuffer.unshift(msg.log);
        if (logBuffer.length > MAX_BUFFERED_LOGS) logBuffer.pop();
      }
      nl = buffer.indexOf("\n");
    }
  });
  socket.on("close", () => { logSocket = null; });
  socket.on("error", () => { logSocket = null; });
  logSocket = socket;
}

// Kick off log subscription in background.
void ensureLogSubscription();

// ─── Bot state overlay ────────────────────────────────────────────────────────

const botState = {
  isRunning:          false,
  currentAccount:     null,
  lastRunAt:          null,
  totalSearchesToday: 0,
  activeRunId:        null,
};

// ─── Cookie-capture session registry ─────────────────────────────────────────
// Tracks in-flight "open browser, capture cookies" sessions.
// key: sessionId, value: { child, statusFile, email }

const captureSessions = new Map();

const DATA_DIR        = path.join(WORKSPACE_ROOT, "data");
const CAPTURE_DIR     = path.join(DATA_DIR, "agent");

function resolveTsx() {
  const isWindows = process.platform === "win32";
  const candidates = [
    // workspace root (populated when running `pnpm install` at root)
    path.join(WORKSPACE_ROOT, "node_modules", ".bin", "tsx.cmd"),
    path.join(WORKSPACE_ROOT, "node_modules", ".bin", "tsx"),
    // api-server's own node_modules (always present after pnpm install)
    path.join(WORKSPACE_ROOT, "artifacts", "api-server", "node_modules", ".bin", "tsx.cmd"),
    path.join(WORKSPACE_ROOT, "artifacts", "api-server", "node_modules", ".bin", "tsx"),
    // scripts package node_modules
    path.join(WORKSPACE_ROOT, "scripts", "node_modules", ".bin", "tsx.cmd"),
    path.join(WORKSPACE_ROOT, "scripts", "node_modules", ".bin", "tsx"),
    // global / PATH fallback
    "tsx",
  ];
  // On Windows, skip extensionless bash scripts — they exist on disk (npm creates
  // both) but Node's CreateProcess cannot execute them. On non-Windows, skip
  // .cmd/.bat wrappers because they require cmd.exe and don't exist on Linux/macOS.
  const filtered = candidates.filter((p) => {
    if (p === "tsx") return true;
    if (isWindows) return p.endsWith(".cmd") || p.endsWith(".bat");
    return !p.endsWith(".cmd") && !p.endsWith(".bat");
  });
  return filtered.find((p) => {
    try { return p === "tsx" || fs.existsSync(p); } catch { return false; }
  }) ?? "tsx";
}

/**
 * Spawn tsx safely on all platforms.
 * On Windows, .cmd files must be invoked via `cmd.exe /c` to avoid both the
 * EINVAL error (no shell) and the DEP0190 deprecation warning (shell + args).
 */
function spawnTsx(tsxBin, args, options = {}) {
  const isCmd = tsxBin.endsWith(".cmd") || tsxBin.endsWith(".bat");
  if (isCmd) {
    return spawn("cmd.exe", ["/c", tsxBin, ...args], { ...options, shell: false });
  }
  return spawn(tsxBin, args, { ...options, shell: false });
}

function readCaptureStatus(statusFile) {
  try {
    return JSON.parse(fs.readFileSync(statusFile, "utf8"));
  } catch {
    return null;
  }
}

/** Sync account cards from run-log data after a run completes. */
function syncAccountStatsFromLogs() {
  try {
    const logs     = storage.loadLogs();
    const accounts = storage.loadAccounts();

    // Build map: accountId → most-recent log entry
    const latest = new Map();
    for (const log of logs) {
      if (!latest.has(log.accountId)) latest.set(log.accountId, log);
    }

    for (const account of accounts) {
      const log = latest.get(account.id);
      if (!log) continue;
      const newStatus   = log.status === "success" ? "done" : log.status === "failed" ? "failed" : account.status;
      const newPoints   = Math.max(account.totalPoints   ?? 0, log.pointsEarned ?? 0);
      const newSearches = Math.max(account.searchesCompleted ?? 0, log.searchesDone ?? 0);
      if (account.status !== newStatus || account.totalPoints !== newPoints || account.searchesCompleted !== newSearches) {
        try {
          storage.updateAccount(account.id, {
            status:            newStatus,
            totalPoints:       newPoints,
            searchesCompleted: newSearches,
            lastRun:           log.timestamp,
          });
        } catch { /* unknown id */ }
      }
    }
  } catch { /* never crash the status endpoint */ }
}

// ─── Request router ───────────────────────────────────────────────────────────

async function handleRequest(req, res) {
  const url      = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;
  const method   = req.method.toUpperCase();

  // CORS headers (localhost only)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-msrb-token");
  if (method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  // ── Public endpoints ──────────────────────────────────────────────────────
  if (pathname === "/api/token" && method === "GET") {
    return sendJson(res, 200, { token: MSRB_TOKEN });
  }
  if (pathname === "/api/healthz" && method === "GET") {
    return sendJson(res, 200, { status: "ok" });
  }

  // ── API routes ────────────────────────────────────────────────────────────
  if (pathname.startsWith("/api/")) {

    // GET /api/desk/accounts
    if (pathname === "/api/desk/accounts" && method === "GET") {
      try { return sendJson(res, 200, storage.loadAccounts()); }
      catch (e) { return sendJson(res, 500, { error: e.message }); }
    }

    // POST /api/desk/accounts
    if (pathname === "/api/desk/accounts" && method === "POST") {
      const body = await readBody(req);
      const { email, name, password, totpSecret, recoveryEmail, geoLocale, langCode, proxy, saveFingerprint, method: authMethod } = body;
      const isCookieMethod = authMethod === "cookies";
      if (!email || !name) return sendJson(res, 400, { error: "email and name are required" });
      if (!isCookieMethod && !password) return sendJson(res, 400, { error: "password is required (or use method: 'cookies')" });
      try {
        const account = storage.addAccount({ email, name });
        try {
          storage.addBotAccount({ email, password: password || "", totpSecret, recoveryEmail, geoLocale, langCode, proxy, saveFingerprint });
        } catch (botErr) {
          return sendJson(res, 201, { ...account, _warning: botErr.message });
        }
        return sendJson(res, 201, account);
      } catch (e) { return sendJson(res, 409, { error: e.message }); }
    }

    // PATCH /api/desk/accounts/:id
    const patchMatch = pathname.match(/^\/api\/desk\/accounts\/(.+)$/);
    if (patchMatch && method === "PATCH") {
      const body = await readBody(req);
      try {
        // Look up old email before patching so we can mirror the change to the bot store.
        const accounts = storage.loadAccounts();
        const existing = accounts.find((a) => a.id === patchMatch[1]);
        const updated = storage.updateAccount(patchMatch[1], body);
        if (existing) {
          storage.updateBotAccount(existing.email, {
            email: body.email,
            password: body.password,
            totpSecret: body.totpSecret,
            recoveryEmail: body.recoveryEmail,
            geoLocale: body.geoLocale,
            langCode: body.langCode,
            proxy: body.proxy,
            saveFingerprint: body.saveFingerprint,
          });
        }
        return sendJson(res, 200, updated);
      } catch (e) { return sendJson(res, 404, { error: e.message }); }
    }

    // DELETE /api/desk/accounts/:id
    const delMatch = pathname.match(/^\/api\/desk\/accounts\/(.+)$/);
    if (delMatch && method === "DELETE") {
      // Fetch the email before deletion so we can remove from the bot store too.
      const allAccounts = storage.loadAccounts();
      const target = allAccounts.find((a) => a.id === delMatch[1]);
      const removed = storage.deleteAccount(delMatch[1]);
      if (!removed) return sendJson(res, 404, { error: "Account not found" });
      if (target) storage.deleteBotAccount(target.email);
      return sendJson(res, 200, { success: true });
    }

    // GET /api/desk/status — real agent IPC check
    if (pathname === "/api/desk/status" && method === "GET") {
      try {
        const agentStatus = await getAgentStatus();
        const agentRunning = agentStatus.active && agentStatus.runState === "running";

        // Detect run completion
        if (!agentRunning && botState.isRunning) {
          botState.isRunning      = false;
          botState.activeRunId    = null;
          botState.currentAccount = null;
          botState.lastRunAt      = new Date().toISOString();
          // Fix any accounts stuck in "running"
          const accs = storage.loadAccounts();
          for (const a of accs) {
            if (a.status === "running") {
              try { storage.updateAccount(a.id, { status: "done" }); } catch { /* ignore */ }
            }
          }
          syncAccountStatsFromLogs();
        }

        return sendJson(res, 200, {
          ...botState,
          isRunning:   agentRunning || botState.isRunning,
          agentActive: agentStatus.active,
          agentPid:    agentStatus.pid ?? null,
        });
      } catch {
        return sendJson(res, 200, { ...botState, agentActive: false });
      }
    }

    // GET /api/desk/logs — run history from disk
    if (pathname === "/api/desk/logs" && method === "GET") {
      void ensureLogSubscription();
      try { return sendJson(res, 200, storage.loadLogs().slice(0, 50)); }
      catch (e) { return sendJson(res, 500, { error: e.message }); }
    }

    // GET /api/desk/agent-logs — live log stream buffer
    if (pathname === "/api/desk/agent-logs" && method === "GET") {
      return sendJson(res, 200, logBuffer.slice(0, 100));
    }

    // POST /api/desk/run-now — spawn bot + IPC run command
    if (pathname === "/api/desk/run-now" && method === "POST") {
      if (botState.isRunning) {
        return sendJson(res, 409, { started: false, message: "Bot is already running" });
      }

      const body     = await readBody(req);
      const accounts = storage.loadAccounts();
      const { accountIds } = body;
      const targets  = accountIds?.length
        ? accounts.filter((a) => accountIds.includes(a.id))
        : accounts;

      if (targets.length === 0) {
        return sendJson(res, 400, { started: false, message: "No accounts configured. Add accounts first." });
      }

      // Ensure agent is running
      let agentStatus = await getAgentStatus();
      if (!agentStatus.active) {
        _pushLog({ userName: "DESK", level: "info", platform: "MAIN", title: "BOT-START",
                   message: "Spawning bot background process…" });
        spawnBotProcess();
        const ready = await waitForAgent(15000);
        if (!ready) {
          _pushLog({ userName: "DESK", level: "error", platform: "MAIN", title: "BOT-TIMEOUT",
                     message: "Bot did not start in 15 s. Check pnpm install and src/accounts.json." });
          return sendJson(res, 503, {
            started: false,
            message: "Bot process did not start within 15 seconds. Make sure `pnpm install` has been run.",
          });
        }
        agentStatus = await getAgentStatus();
        void ensureLogSubscription();
      }

      if (agentStatus.runState === "running") {
        return sendJson(res, 409, { started: false, message: "Bot is already running a task" });
      }

      const result = await requestAgentRun();
      if (!result.accepted) {
        return sendJson(res, 409, { started: false, message: result.reason ?? "Bot rejected the run" });
      }

      const runId            = `run-${randomBytes(4).toString("hex")}`;
      botState.isRunning     = true;
      botState.activeRunId   = runId;
      botState.currentAccount = targets[0]?.name ?? null;
      targets.forEach((t) => {
        try { storage.updateAccount(t.id, { status: "running" }); } catch { /* ignore */ }
      });

      _pushLog({ userName: "DESK", level: "info", platform: "MAIN", title: "RUN-START",
                 message: `Run ${runId} started for ${targets.length} account(s)` });

      return sendJson(res, 200, {
        started: true,
        message: `Run started for ${targets.length} account(s)`,
        runId,
      });
    }

    // POST /api/desk/stop
    if (pathname === "/api/desk/stop" && method === "POST") {
      const stopped = await requestAgentStop();
      if (botState.activeRunId) {
        botState.isRunning      = false;
        botState.activeRunId    = null;
        botState.currentAccount = null;
        botState.lastRunAt      = new Date().toISOString();
        const accs = storage.loadAccounts();
        for (const a of accs) {
          if (a.status === "running") {
            try { storage.updateAccount(a.id, { status: "idle" }); } catch { /* ignore */ }
          }
        }
      }
      return sendJson(res, 200, { stopped, message: stopped ? "Bot stopped" : "Bot was not running" });
    }

    // POST /api/desk/seed-demo
    if (pathname === "/api/desk/seed-demo" && method === "POST") {
      const demos = [
        { name: "Demo User A", email: "demo.a@outlook.com" },
        { name: "Demo User B", email: "demo.b@hotmail.com" },
        { name: "Demo User C", email: "demo.c@live.com" },
        { name: "Demo User D", email: "demo.d@msn.com" },
      ];
      let added = 0;
      const existing = storage.loadAccounts();
      for (const d of demos) {
        if (!existing.some((a) => a.email === d.email)) {
          try { storage.addAccount(d); added++; } catch { /* skip */ }
        }
      }
      return sendJson(res, 200, { added, total: storage.loadAccounts().length });
    }

    // DELETE /api/desk/seed-demo
    if (pathname === "/api/desk/seed-demo" && method === "DELETE") {
      const demoEmails = ["demo.a@outlook.com","demo.b@hotmail.com","demo.c@live.com","demo.d@msn.com"];
      const before = storage.loadAccounts().length;
      for (const a of storage.loadAccounts()) {
        if (demoEmails.includes(a.email)) {
          try { storage.deleteAccount(a.id); } catch { /* ignore */ }
        }
      }
      return sendJson(res, 200, { removed: before - storage.loadAccounts().length, total: storage.loadAccounts().length });
    }

    // POST /api/desk/capture-session — spawn the cookie-capture browser
    if (pathname === "/api/desk/capture-session" && method === "POST") {
      const body  = await readBody(req);
      const email = (body.email || "").trim();
      if (!email) return sendJson(res, 400, { error: "email is required" });

      const sessionId  = randomBytes(6).toString("hex");
      const statusFile = path.join(CAPTURE_DIR, `capture-${sessionId}.json`);
      fs.mkdirSync(CAPTURE_DIR, { recursive: true });

      const tsxBin     = resolveTsx();
      const scriptPath = path.join(WORKSPACE_ROOT, "scripts", "desk", "cookie-capture.ts");

      const child = spawnTsx(tsxBin, [scriptPath, sessionId, email, statusFile], {
        cwd:   WORKSPACE_ROOT,
        stdio: "ignore",
        env:   { ...process.env },
      });
      child.on("error", (err) => {
        try {
          fs.writeFileSync(statusFile, JSON.stringify({ sessionId, email, status: "failed", error: err.message }, null, 2));
        } catch {}
      });
      child.on("close", (code) => {
        const s = readCaptureStatus(statusFile);
        if (s && s.status !== "done") {
          try {
            fs.writeFileSync(statusFile, JSON.stringify({ ...s, status: "failed", error: `Process exited with code ${code}` }, null, 2));
          } catch {}
        }
        captureSessions.delete(sessionId);
      });

      captureSessions.set(sessionId, { child, statusFile, email });
      return sendJson(res, 200, { sessionId });
    }

    // GET /api/desk/capture-session/:id — poll status
    const captureGetMatch = pathname.match(/^\/api\/desk\/capture-session\/([a-f0-9]+)$/);
    if (captureGetMatch && method === "GET") {
      const sid    = captureGetMatch[1];
      const sess   = captureSessions.get(sid);
      const statusFile = sess ? sess.statusFile : path.join(CAPTURE_DIR, `capture-${sid}.json`);
      const status = readCaptureStatus(statusFile);
      if (!status) return sendJson(res, 404, { error: "Session not found" });
      return sendJson(res, 200, status);
    }

    // DELETE /api/desk/capture-session/:id — abort
    const captureDelMatch = pathname.match(/^\/api\/desk\/capture-session\/([a-f0-9]+)$/);
    if (captureDelMatch && method === "DELETE") {
      const sid  = captureDelMatch[1];
      const sess = captureSessions.get(sid);
      if (sess) {
        try { sess.child.kill(); } catch {}
        captureSessions.delete(sid);
      }
      // Clean up the status file regardless
      try { fs.rmSync(path.join(CAPTURE_DIR, `capture-${sid}.json`), { force: true }); } catch {}
      return sendJson(res, 200, { aborted: true });
    }

    return sendJson(res, 404, { error: "Unknown API route" });
  }

  // ── Static file serving ───────────────────────────────────────────────────
  const rel      = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const filePath = path.join(UI_DIST, rel);
  serveStatic(res, filePath);
}

// ─── Start server ─────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch((err) => {
    console.error("[server] Unhandled error:", err.message);
    if (!res.headersSent) { res.writeHead(500); res.end("Internal server error"); }
  });
});

server.listen(PORT, "127.0.0.1", () => {
  const url = `http://localhost:${PORT}`;
  console.log(`\n╔══════════════════════════════════════════════╗`);
  console.log(`║       Rewards Desk — Command Center          ║`);
  console.log(`╠══════════════════════════════════════════════╣`);
  console.log(`║  Server: ${url.padEnd(37)}║`);
  console.log(`║  Token:  ${MSRB_TOKEN.slice(0, 37).padEnd(37)}║`);
  console.log(`╚══════════════════════════════════════════════╝\n`);
  if (OPEN_WINDOW) launchChromiumWindow(url);
});

// ─── Chromium launcher ────────────────────────────────────────────────────────

function launchChromiumWindow(url) {
  const platform = process.platform;
  let candidates = [];

  if (platform === "win32") {
    candidates = [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files\\Chromium\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Chromium\\Application\\chrome.exe",
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    ];
  } else if (platform === "darwin") {
    candidates = [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    ];
  } else {
    candidates = ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "microsoft-edge"];
  }

  function findBrowser() {
    for (const c of candidates) {
      if (platform === "linux") {
        const r = spawnSync("which", [c], { encoding: "utf8" });
        if (r.status === 0 && r.stdout.trim()) return c;
      } else {
        if (fs.existsSync(c)) return c;
      }
    }
    return null;
  }

  const browser = findBrowser();
  if (!browser) {
    console.warn(`[window] Chrome/Edge not found. Open manually: ${url}`);
    return;
  }

  const args = [
    `--app=${url}`,
    "--window-size=1200,800",
    "--no-first-run",
    "--no-default-browser-check",
  ];
  console.log(`[window] Launching: ${path.basename(browser)}`);
  spawn(browser, args, { detached: true, stdio: "ignore" }).unref();
}
