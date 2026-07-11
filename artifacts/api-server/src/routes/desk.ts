import { Router } from "express";
import { randomBytes, randomUUID } from "crypto";
import {
  ListAccountsResponseItem,
  AddAccountBody,
  DeleteAccountParams,
  RunNowBody,
  GetBotStatusResponse,
  GetRunLogsResponseItem,
} from "@workspace/api-zod";
import { z } from "zod/v4";

const router = Router();

// ─── In-memory state (desk prototype — no DB needed) ─────────────────────────

interface DeskAccount {
  id: string;
  email: string;
  name: string;
  status: "idle" | "running" | "done" | "failed";
  totalPoints: number;
  todayPoints: number;
  lastRun: string | null;
  searchesCompleted: number;
}

interface BotState {
  isRunning: boolean;
  currentAccount: string | null;
  lastRunAt: string | null;
  totalSearchesToday: number;
  activeRunId: string | null;
}

interface RunLog {
  id: string;
  accountId: string;
  accountName: string;
  timestamp: string;
  searchesDone: number;
  pointsEarned: number;
  status: "success" | "failed" | "running";
  errorMessage: string | null;
}

// Seed some demo accounts
const accounts: DeskAccount[] = [
  {
    id: "acc-001",
    email: "demo.user1@outlook.com",
    name: "Demo User 1",
    status: "done",
    totalPoints: 12450,
    todayPoints: 120,
    lastRun: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    searchesCompleted: 30,
  },
  {
    id: "acc-002",
    email: "demo.user2@hotmail.com",
    name: "Demo User 2",
    status: "idle",
    totalPoints: 8340,
    todayPoints: 0,
    lastRun: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
    searchesCompleted: 0,
  },
  {
    id: "acc-003",
    email: "rewards.acct3@live.com",
    name: "Rewards Acct 3",
    status: "failed",
    totalPoints: 5200,
    todayPoints: 45,
    lastRun: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
    searchesCompleted: 12,
  },
];

const botState: BotState = {
  isRunning: false,
  currentAccount: null,
  lastRunAt: null,
  totalSearchesToday: accounts.reduce((s, a) => s + a.searchesCompleted, 0),
  activeRunId: null,
};

const runLogs: RunLog[] = [
  {
    id: randomUUID(),
    accountId: "acc-001",
    accountName: "Demo User 1",
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    searchesDone: 30,
    pointsEarned: 120,
    status: "success",
    errorMessage: null,
  },
  {
    id: randomUUID(),
    accountId: "acc-003",
    accountName: "Rewards Acct 3",
    timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
    searchesDone: 12,
    pointsEarned: 45,
    status: "failed",
    errorMessage: "Network request failed after 12 searches",
  },
];

// ─── Routes ──────────────────────────────────────────────────────────────────

// GET /desk/accounts
router.get("/desk/accounts", (_req, res): void => {
  res.json(accounts);
});

// POST /desk/accounts
router.post("/desk/accounts", (req, res): void => {
  const parsed = AddAccountBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const account: DeskAccount = {
    id: `acc-${randomBytes(4).toString("hex")}`,
    email: parsed.data.email,
    name: parsed.data.name,
    status: "idle",
    totalPoints: 0,
    todayPoints: 0,
    lastRun: null,
    searchesCompleted: 0,
  };
  accounts.push(account);
  res.status(201).json(account);
});

// DELETE /desk/accounts/:id
router.delete("/desk/accounts/:id", (req, res): void => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const idx = accounts.findIndex((a) => a.id === raw);
  if (idx === -1) {
    res.status(404).json({ error: "Account not found" });
    return;
  }
  accounts.splice(idx, 1);
  res.json({ success: true });
});

// POST /desk/run-now
router.post("/desk/run-now", (req, res): void => {
  const parsed = RunNowBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (botState.isRunning) {
    res.status(409).json({ started: false, message: "Bot is already running" });
    return;
  }

  const runId = `run-${randomBytes(4).toString("hex")}`;
  const targetIds = parsed.data.accountIds?.length
    ? parsed.data.accountIds
    : accounts.map((a) => a.id);

  const targets = accounts.filter((a) => targetIds.includes(a.id));
  if (targets.length === 0) {
    res.status(400).json({ started: false, message: "No matching accounts found" });
    return;
  }

  // Kick off a simulated run
  botState.isRunning = true;
  botState.activeRunId = runId;
  botState.currentAccount = targets[0].name;

  targets.forEach((a) => {
    a.status = "running";
  });

  // Simulate completion after a short delay
  let idx = 0;
  const tick = () => {
    if (idx >= targets.length) {
      botState.isRunning = false;
      botState.activeRunId = null;
      botState.currentAccount = null;
      botState.lastRunAt = new Date().toISOString();
      return;
    }
    const account = targets[idx];
    const searches = 25 + Math.floor(Math.random() * 10);
    const points = searches * 4 + Math.floor(Math.random() * 20);
    account.status = "done";
    account.searchesCompleted = searches;
    account.todayPoints += points;
    account.totalPoints += points;
    account.lastRun = new Date().toISOString();
    botState.totalSearchesToday += searches;
    botState.currentAccount = targets[idx + 1]?.name ?? null;
    runLogs.unshift({
      id: randomUUID(),
      accountId: account.id,
      accountName: account.name,
      timestamp: new Date().toISOString(),
      searchesDone: searches,
      pointsEarned: points,
      status: "success",
      errorMessage: null,
    });
    // Keep only 50 logs
    if (runLogs.length > 50) runLogs.pop();
    idx++;
    setTimeout(tick, 2500 + Math.random() * 1500);
  };
  setTimeout(tick, 1000);

  res.json({ started: true, message: `Run started for ${targets.length} account(s)`, runId });
});

// GET /desk/status
router.get("/desk/status", (_req, res): void => {
  res.json(botState);
});

// GET /desk/logs
router.get("/desk/logs", (_req, res): void => {
  res.json(runLogs.slice(0, 50));
});

export default router;
