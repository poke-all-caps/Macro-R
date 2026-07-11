/**
 * app-window.js — Rewards Desk Command Center
 * --------------------------------------------
 * Spins up a local Express server on port 3000, serves the Vite-built React
 * UI from ui/dist/, and optionally launches a Chromium/Chrome window in
 * "app mode" so the UI looks like a native desktop window (no address bar).
 *
 * Usage:
 *   node scripts/desk/app-window.js
 *
 * Environment variables (optional):
 *   PORT          Override the default port 3000
 *   MSRB_TOKEN    Override the security token (auto-generated if not set)
 *   NO_WINDOW     Set to "1" to skip launching the browser window
 *
 * Build the UI first:
 *   cd ui && npm run build
 */

const express = require("express");
const path = require("path");
const { spawnSync, spawn } = require("child_process");
const { randomBytes } = require("crypto");
const storage = require("./account-storage");

// ─── Configuration ────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT ?? "3000", 10);

/**
 * Security token — set MSRB_TOKEN env var to a fixed value, or let the server
 * generate a random one each launch. The UI reads it from the /api/token
 * endpoint on first load, or you can embed it in the build via VITE_MSRB_TOKEN.
 */
const MSRB_TOKEN =
  process.env.MSRB_TOKEN ?? randomBytes(24).toString("hex");

const OPEN_WINDOW = process.env.NO_WINDOW !== "1";

// Resolve the compiled UI from ui/dist (relative to workspace root)
const UI_DIST = path.resolve(__dirname, "../../ui/dist");

// ─── App ─────────────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());

// ─── Security middleware ──────────────────────────────────────────────────────
//
// All /api/* routes require the x-msrb-token header to match the server token.
// Static UI files are served without authentication so the browser can load.

function requireToken(req, res, next) {
  const provided = req.headers["x-msrb-token"];
  if (!provided || provided !== MSRB_TOKEN) {
    res.status(401).json({ error: "Unauthorized: missing or invalid x-msrb-token header" });
    return;
  }
  next();
}

// ─── Public endpoints ─────────────────────────────────────────────────────────

// The UI calls this on startup to retrieve its token (safe because it only
// works on localhost — never exposed to the internet).
app.get("/api/token", (_req, res) => {
  res.json({ token: MSRB_TOKEN });
});

app.get("/api/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

// ─── Protected API routes ────────────────────────────────────────────────────

app.use("/api", requireToken);

// Bot state (in-memory for the local runner)
const botState = {
  isRunning: false,
  currentAccount: null,
  lastRunAt: null,
  totalSearchesToday: 0,
  activeRunId: null,
};

// GET /api/accounts — list all saved accounts
app.get("/api/accounts", (_req, res) => {
  try {
    res.json(storage.loadAccounts());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/accounts — add an account
app.post("/api/accounts", (req, res) => {
  const { email, name } = req.body ?? {};
  if (!email || !name) {
    res.status(400).json({ error: "email and name are required" });
    return;
  }
  try {
    const account = storage.addAccount({ email, name });
    res.status(201).json(account);
  } catch (err) {
    res.status(409).json({ error: err.message });
  }
});

// DELETE /api/accounts/:id — remove an account
app.delete("/api/accounts/:id", (req, res) => {
  const removed = storage.deleteAccount(req.params.id);
  if (!removed) {
    res.status(404).json({ error: "Account not found" });
    return;
  }
  res.json({ success: true });
});

// GET /api/status — bot status
app.get("/api/status", (_req, res) => {
  res.json(botState);
});

// GET /api/logs — run logs
app.get("/api/logs", (_req, res) => {
  try {
    res.json(storage.loadLogs());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/run-now — trigger automation
//
// In production you would import your Playwright/Patchright runner here.
// For now this is a stub that simulates a run and updates the bot state.
app.post("/api/run-now", (req, res) => {
  if (botState.isRunning) {
    res.status(409).json({ started: false, message: "Bot is already running" });
    return;
  }

  const accounts = storage.loadAccounts();
  const { accountIds } = req.body ?? {};
  const targets = accountIds?.length
    ? accounts.filter((a) => accountIds.includes(a.id))
    : accounts;

  if (targets.length === 0) {
    res.status(400).json({ started: false, message: "No accounts configured. Add accounts first." });
    return;
  }

  const runId = `run-${randomBytes(4).toString("hex")}`;
  botState.isRunning = true;
  botState.activeRunId = runId;
  botState.currentAccount = targets[0]?.name ?? null;

  // Update statuses to "running"
  targets.forEach((t) => storage.updateAccount(t.id, { status: "running" }));

  res.json({
    started: true,
    message: `Run started for ${targets.length} account(s)`,
    runId,
  });

  // Simulate automation (replace this block with your Playwright runner)
  (async () => {
    for (const account of targets) {
      botState.currentAccount = account.name;
      console.log(`[run] Starting account: ${account.name}`);

      // ── Placeholder: call your Playwright/Patchright logic here ──────────
      // Example:
      //   const { runRewardsSearch } = require('../../src/core/rewards-runner');
      //   const result = await runRewardsSearch(account);
      //
      // For now, simulate with a 3-second delay
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
});

// ─── Serve the React UI ──────────────────────────────────────────────────────

app.use(express.static(UI_DIST));

// SPA fallback — send index.html for all non-API routes
app.get("/{*splat}", (req, res) => {
  res.sendFile(path.join(UI_DIST, "index.html"));
});

// ─── Start server ────────────────────────────────────────────────────────────

app.listen(PORT, "127.0.0.1", () => {
  const url = `http://localhost:${PORT}`;
  console.log(`\n╔══════════════════════════════════════════════╗`);
  console.log(`║       Rewards Desk — Command Center          ║`);
  console.log(`╠══════════════════════════════════════════════╣`);
  console.log(`║  Server: ${url.padEnd(37)}║`);
  console.log(`║  Token:  ${MSRB_TOKEN.slice(0, 37).padEnd(37)}║`);
  console.log(`╚══════════════════════════════════════════════╝\n`);

  if (OPEN_WINDOW) {
    launchChromiumWindow(url);
  }
});

// ─── Chromium launcher ───────────────────────────────────────────────────────

/**
 * Launch Chromium/Chrome in "app mode" so the React UI appears as a native
 * desktop window (no address bar, no tabs, no browser chrome).
 *
 * The --app flag strips all browser UI. The window title comes from
 * the <title> tag of the React app.
 *
 * @param {string} url The URL to open in the app window
 */
function launchChromiumWindow(url) {
  const appFlag = `--app=${url}`;
  const windowSizeFlag = "--window-size=1200,800";
  const disableWebSecurity = "--disable-web-security"; // needed for localhost CORS
  const noFirstRun = "--no-first-run";
  const noDefaultBrowserCheck = "--no-default-browser-check";

  // Detect the host OS and find the right browser executable
  const platform = process.platform;

  /** @type {string[]} */
  let candidates = [];

  if (platform === "win32") {
    candidates = [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files\\Chromium\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Chromium\\Application\\chrome.exe",
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe", // Edge also supports --app
    ];
  } else if (platform === "darwin") {
    candidates = [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    ];
  } else {
    // Linux
    candidates = [
      "google-chrome",
      "google-chrome-stable",
      "chromium",
      "chromium-browser",
      "microsoft-edge",
    ];
  }

  /**
   * Find the first available browser by checking if the binary exists.
   * On Linux, we try to resolve the command with `which`.
   * @returns {string|null}
   */
  function findBrowser() {
    for (const candidate of candidates) {
      if (platform === "linux") {
        const result = spawnSync("which", [candidate], { encoding: "utf8" });
        if (result.status === 0 && result.stdout.trim()) {
          return candidate;
        }
      } else {
        try {
          // On Windows/macOS, check if the file exists
          const fs = require("fs");
          if (fs.existsSync(candidate)) return candidate;
        } catch {
          // ignore
        }
      }
    }
    return null;
  }

  const browser = findBrowser();

  if (!browser) {
    console.warn(
      "[window] Could not find Chrome or Chromium. " +
      "Open the URL manually in your browser:\n" +
      `  ${url}\n` +
      "  (Pass --app=<URL> yourself to get the desktop window effect)"
    );
    return;
  }

  const args = [appFlag, windowSizeFlag, disableWebSecurity, noFirstRun, noDefaultBrowserCheck];

  console.log(`[window] Launching: ${browser} ${args[0]}`);

  const child = spawn(browser, args, {
    detached: true,
    stdio: "ignore",
  });

  child.unref(); // Don't hold the Node process open for the browser
}
