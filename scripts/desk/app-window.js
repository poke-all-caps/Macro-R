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

const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawnSync, spawn } = require("child_process");
const { randomBytes } = require("crypto");
const storage = require("./account-storage");

// ─── Configuration ────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT ?? "3000", 10);
const MSRB_TOKEN = process.env.MSRB_TOKEN ?? randomBytes(24).toString("hex");
const OPEN_WINDOW = process.env.NO_WINDOW !== "1";

// Pre-built UI lives at <project-root>/dist-desk/
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
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
    req.on("error", reject);
  });
}

function serveStatic(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME[ext] ?? "application/octet-stream";
  try {
    const data = fs.readFileSync(filePath);
    res.writeHead(200, { "Content-Type": mime });
    res.end(data);
  } catch {
    // File not found — serve SPA index.html
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

// ─── Bot state ────────────────────────────────────────────────────────────────

const botState = {
  isRunning: false,
  currentAccount: null,
  lastRunAt: null,
  totalSearchesToday: 0,
  activeRunId: null,
};

// ─── Request router ───────────────────────────────────────────────────────────

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;
  const method = req.method.toUpperCase();

  // CORS headers (localhost only)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-msrb-token");
  if (method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  // ── Public endpoints (no token required) ──────────────────────────────────
  if (pathname === "/api/token" && method === "GET") {
    return sendJson(res, 200, { token: MSRB_TOKEN });
  }
  if (pathname === "/api/healthz" && method === "GET") {
    return sendJson(res, 200, { status: "ok" });
  }

  // ── API routes ─────────────────────────────────────────────────────────────
  // Token auth is skipped — the server binds to 127.0.0.1 only, which is
  // localhost-only access. No external process can reach these endpoints.
  if (pathname.startsWith("/api/")) {

    // GET /api/desk/accounts
    if (pathname === "/api/desk/accounts" && method === "GET") {
      try { return sendJson(res, 200, storage.loadAccounts()); }
      catch (e) { return sendJson(res, 500, { error: e.message }); }
    }

    // POST /api/desk/accounts
    if (pathname === "/api/desk/accounts" && method === "POST") {
      const body = await readBody(req);
      const { email, name } = body;
      if (!email || !name) return sendJson(res, 400, { error: "email and name are required" });
      try {
        const account = storage.addAccount({ email, name });
        return sendJson(res, 201, account);
      } catch (e) { return sendJson(res, 409, { error: e.message }); }
    }

    // DELETE /api/desk/accounts/:id
    const delMatch = pathname.match(/^\/api\/desk\/accounts\/(.+)$/);
    if (delMatch && method === "DELETE") {
      const removed = storage.deleteAccount(delMatch[1]);
      if (!removed) return sendJson(res, 404, { error: "Account not found" });
      return sendJson(res, 200, { success: true });
    }

    // GET /api/desk/status
    if (pathname === "/api/desk/status" && method === "GET") {
      return sendJson(res, 200, botState);
    }

    // GET /api/desk/logs
    if (pathname === "/api/desk/logs" && method === "GET") {
      try { return sendJson(res, 200, storage.loadLogs()); }
      catch (e) { return sendJson(res, 500, { error: e.message }); }
    }

    // POST /api/desk/run-now
    if (pathname === "/api/desk/run-now" && method === "POST") {
      if (botState.isRunning) {
        return sendJson(res, 409, { started: false, message: "Bot is already running" });
      }
      const body = await readBody(req);
      const accounts = storage.loadAccounts();
      const { accountIds } = body;
      const targets = accountIds?.length
        ? accounts.filter((a) => accountIds.includes(a.id))
        : accounts;

      if (targets.length === 0) {
        return sendJson(res, 400, { started: false, message: "No accounts configured. Add accounts first." });
      }

      const runId = `run-${randomBytes(4).toString("hex")}`;
      botState.isRunning = true;
      botState.activeRunId = runId;
      botState.currentAccount = targets[0]?.name ?? null;
      targets.forEach((t) => storage.updateAccount(t.id, { status: "running" }));

      sendJson(res, 200, {
        started: true,
        message: `Run started for ${targets.length} account(s)`,
        runId,
      });

      // Simulate automation — replace with your Playwright runner
      (async () => {
        for (const account of targets) {
          botState.currentAccount = account.name;
          console.log(`[run] Starting: ${account.name}`);

          // ── Drop your Playwright/Patchright logic here ──────────────────
          // const { runRewardsSearch } = require('../../src/core/rewards-runner');
          // const result = await runRewardsSearch(account);
          await new Promise((r) => setTimeout(r, 3000));

          const searchesDone = 25 + Math.floor(Math.random() * 10);
          const pointsEarned = searchesDone * 4 + Math.floor(Math.random() * 20);

          storage.updateAccount(account.id, {
            status: "done",
            searchesCompleted: searchesDone,
            todayPoints: (account.todayPoints ?? 0) + pointsEarned,
            totalPoints: (account.totalPoints ?? 0) + pointsEarned,
            lastRun: new Date().toISOString(),
          });
          storage.appendLog({
            accountId: account.id,
            accountName: account.name,
            timestamp: new Date().toISOString(),
            searchesDone,
            pointsEarned,
            status: "success",
            errorMessage: null,
          });
          botState.totalSearchesToday += searchesDone;
          console.log(`[run] Done: ${account.name} — ${searchesDone} searches, ${pointsEarned} pts`);
        }
        botState.isRunning = false;
        botState.activeRunId = null;
        botState.currentAccount = null;
        botState.lastRunAt = new Date().toISOString();
        console.log("[run] All accounts complete.");
      })().catch((err) => {
        console.error("[run] Error:", err.message);
        botState.isRunning = false;
        botState.activeRunId = null;
        botState.currentAccount = null;
      });

      return; // response already sent above
    }

    return sendJson(res, 404, { error: "Unknown API route" });
  }

  // ── Static file serving ────────────────────────────────────────────────────
  // Strip the leading "/" before joining so path.join doesn't treat it as an
  // absolute path root on Windows (e.g. "C:\assets\..." instead of the expected
  // "C:\...\dist-desk\assets\...").
  const rel = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
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
