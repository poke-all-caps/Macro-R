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

// ── Bot account sync ──────────────────────────────────────────────────────────
// Keeps references/bot-source/accounts.json in sync with desk UI changes.
// The bot reads this file on startup; without it, it falls back to
// accounts.example.json (which has placeholder email_2 entries).

const BOT_ACCOUNTS_FILE = path.join(WORKSPACE_ROOT, 'references', 'bot-source', 'accounts.json');

interface BotAccount {
  email:           string;
  enabled:         boolean;
  password:        string;
  totpSecret:      string;
  recoveryEmail:   string;
  geoLocale:       string;
  langCode:        string;
  dashboardMode:   string;
  strictProxy:     string;
  proxy: {
    proxyAxios: boolean;
    url:        string;
    port:       number;
    username:   string;
    password:   string;
  };
  saveFingerprint: { mobile: boolean; desktop: boolean };
}

function loadBotAccounts(): BotAccount[] {
  try {
    return JSON.parse(fs.readFileSync(BOT_ACCOUNTS_FILE, 'utf8')) as BotAccount[];
  } catch {
    return [];
  }
}

function saveBotAccounts(accounts: BotAccount[]): void {
  const tmp = BOT_ACCOUNTS_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(accounts, null, 2), 'utf8');
  try {
    fs.renameSync(tmp, BOT_ACCOUNTS_FILE);
  } catch {
    fs.copyFileSync(tmp, BOT_ACCOUNTS_FILE);
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
  }
}

export interface BotAccountFields {
  email:           string;
  password?:       string;
  totpSecret?:     string;
  recoveryEmail?:  string;
  geoLocale?:      string;
  langCode?:       string;
  proxy?:          { url?: string; port?: number | string; username?: string; password?: string };
  saveFingerprint?: { mobile?: boolean; desktop?: boolean };
}

export function addBotAccount(fields: BotAccountFields): void {
  const accounts = loadBotAccounts();
  if (accounts.find(a => a.email === fields.email)) return; // already exists — skip
  const proxy = fields.proxy ?? {};
  accounts.push({
    email:           fields.email,
    enabled:         true,
    password:        fields.password        ?? '',
    totpSecret:      fields.totpSecret      ?? '',
    recoveryEmail:   fields.recoveryEmail   ?? '',
    geoLocale:       fields.geoLocale       ?? 'auto',
    langCode:        fields.langCode        ?? 'en',
    dashboardMode:   'auto',
    strictProxy:     'auto',
    proxy: {
      proxyAxios: true,
      url:        proxy.url      ?? '',
      port:       Number(proxy.port) || 0,
      username:   proxy.username ?? '',
      password:   proxy.password ?? '',
    },
    saveFingerprint: {
      mobile:  Boolean(fields.saveFingerprint?.mobile),
      desktop: Boolean(fields.saveFingerprint?.desktop),
    },
  });
  saveBotAccounts(accounts);
}

export function updateBotAccount(currentEmail: string, patch: Partial<BotAccountFields>): void {
  const accounts = loadBotAccounts();
  const idx = accounts.findIndex(a => a.email === currentEmail);
  if (idx === -1) return; // not in bot store — that's fine
  const acc = accounts[idx];
  if (patch.email         !== undefined) acc.email         = patch.email;
  if (patch.password      !== undefined) acc.password      = patch.password;
  if (patch.totpSecret    !== undefined) acc.totpSecret    = patch.totpSecret;
  if (patch.recoveryEmail !== undefined) acc.recoveryEmail = patch.recoveryEmail;
  if (patch.geoLocale     !== undefined) acc.geoLocale     = patch.geoLocale;
  if (patch.langCode      !== undefined) acc.langCode      = patch.langCode;
  if (patch.proxy !== undefined) {
    acc.proxy = {
      ...acc.proxy,
      url:      patch.proxy.url      ?? acc.proxy.url,
      port:     Number(patch.proxy.port) || acc.proxy.port,
      username: patch.proxy.username ?? acc.proxy.username,
      password: patch.proxy.password ?? acc.proxy.password,
    };
  }
  if (patch.saveFingerprint !== undefined) {
    acc.saveFingerprint = { ...acc.saveFingerprint, ...patch.saveFingerprint };
  }
  accounts[idx] = acc;
  saveBotAccounts(accounts);
}

export function deleteBotAccount(email: string): void {
  const accounts = loadBotAccounts();
  const filtered = accounts.filter(a => a.email !== email);
  if (filtered.length !== accounts.length) saveBotAccounts(filtered);
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
