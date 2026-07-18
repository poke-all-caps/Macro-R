/**
 * desk-storage.ts
 * ----------------
 * File-based persistence for the Rewards Desk accounts and run logs.
 * Stores JSON in data/accounts.json and data/run-logs.json at the workspace
 * root — the same directory used by scripts/desk/account-storage.js so both
 * launchers share the same data.
 *
 * All writes use an atomic copy-then-replace pattern to avoid corruption.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { WORKSPACE_ROOT } from './agent-client.js';

// ── Paths ─────────────────────────────────────────────────────────────────────

const DATA_DIR       = path.join(WORKSPACE_ROOT, 'data');
const ACCOUNTS_FILE  = path.join(DATA_DIR, 'accounts.json');
const LOGS_FILE      = path.join(DATA_DIR, 'run-logs.json');
const MAX_LOGS       = 200;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DeskAccount {
  id:               string;
  email:            string;
  name:             string;
  status:           'idle' | 'running' | 'done' | 'failed';
  totalPoints:      number;
  todayPoints:      number;
  lastRun:          string | null;
  searchesCompleted: number;
  createdAt:        string;
}

export interface RunLog {
  id:          string;
  accountId:   string;
  accountName: string;
  timestamp:   string;
  searchesDone: number;
  pointsEarned: number;
  status:      'success' | 'failed' | 'running';
  errorMessage: string | null;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readJson<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(filePath: string, data: unknown): void {
  ensureDataDir();
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  try {
    fs.renameSync(tmp, filePath);
  } catch {
    // renameSync can fail on Windows if the target is open — copy+delete fallback
    fs.copyFileSync(tmp, filePath);
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
  }
}

// ── Accounts ──────────────────────────────────────────────────────────────────

export function loadAccounts(): DeskAccount[] {
  ensureDataDir();
  if (!fs.existsSync(ACCOUNTS_FILE)) {
    fs.writeFileSync(ACCOUNTS_FILE, '[]', 'utf8');
  }
  return readJson<DeskAccount[]>(ACCOUNTS_FILE, []);
}

export function saveAccounts(accounts: DeskAccount[]): void {
  writeJsonAtomic(ACCOUNTS_FILE, accounts);
}

export function addAccount(fields: { email: string; name: string }): DeskAccount {
  const accounts = loadAccounts();
  if (accounts.some(a => a.email === fields.email)) {
    throw new Error(`Account ${fields.email} already exists`);
  }
  const account: DeskAccount = {
    id:               `acc-${crypto.randomBytes(4).toString('hex')}`,
    email:            fields.email,
    name:             fields.name,
    status:           'idle',
    totalPoints:      0,
    todayPoints:      0,
    lastRun:          null,
    searchesCompleted: 0,
    createdAt:        new Date().toISOString(),
  };
  accounts.push(account);
  saveAccounts(accounts);
  return account;
}

export function updateAccount(id: string, patch: Partial<DeskAccount>): DeskAccount {
  const accounts = loadAccounts();
  const idx = accounts.findIndex(a => a.id === id);
  if (idx === -1) throw new Error(`Account ${id} not found`);
  accounts[idx] = { ...accounts[idx], ...patch };
  saveAccounts(accounts);
  return accounts[idx];
}

export function deleteAccount(id: string): boolean {
  const accounts = loadAccounts();
  const filtered = accounts.filter(a => a.id !== id);
  if (filtered.length === accounts.length) return false;
  saveAccounts(filtered);
  return true;
}

// ── Run logs ──────────────────────────────────────────────────────────────────

export function loadLogs(): RunLog[] {
  ensureDataDir();
  if (!fs.existsSync(LOGS_FILE)) {
    fs.writeFileSync(LOGS_FILE, '[]', 'utf8');
  }
  return readJson<RunLog[]>(LOGS_FILE, []);
}

export function appendLog(log: Omit<RunLog, 'id'> & { id?: string }): RunLog {
  const logs = loadLogs();
  const entry: RunLog = {
    ...log,
    id: log.id ?? `log-${crypto.randomBytes(4).toString('hex')}`,
  };
  logs.unshift(entry);
  if (logs.length > MAX_LOGS) logs.length = MAX_LOGS;
  writeJsonAtomic(LOGS_FILE, logs);
  return entry;
}
