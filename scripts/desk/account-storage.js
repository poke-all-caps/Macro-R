/**
 * account-storage.js
 * -------------------
 * Replaces AsyncStorage for the desktop app.
 * Reads and writes account/session data to data/accounts.json on the local
 * filesystem using Node's built-in `fs` module.
 *
 * Usage:
 *   const storage = require('./account-storage');
 *   const accounts = storage.loadAccounts();
 *   storage.saveAccounts([...]);
 */

const fs = require("fs");
const path = require("path");
const { randomBytes } = require("crypto");

// Resolve path relative to the workspace root (two levels up from scripts/desk/)
const DATA_DIR = path.resolve(__dirname, "../../data");
const ACCOUNTS_FILE = path.join(DATA_DIR, "accounts.json");
const SESSION_FILE = path.join(DATA_DIR, "session.json");
const LOGS_FILE = path.join(DATA_DIR, "run-logs.json");

/**
 * Ensure the data directory and required files exist.
 */
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(ACCOUNTS_FILE)) {
    fs.writeFileSync(ACCOUNTS_FILE, "[]", "utf8");
  }
  if (!fs.existsSync(SESSION_FILE)) {
    fs.writeFileSync(SESSION_FILE, "{}", "utf8");
  }
  if (!fs.existsSync(LOGS_FILE)) {
    fs.writeFileSync(LOGS_FILE, "[]", "utf8");
  }
}

/**
 * Read JSON from a file. Returns `fallback` if the file is missing or invalid.
 * @param {string} filePath
 * @param {any} fallback
 */
function readJson(filePath, fallback) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/**
 * Write a value as pretty-printed JSON to a file atomically (write to temp,
 * then rename).
 * @param {string} filePath
 * @param {any} data
 */
function writeJson(filePath, data) {
  ensureDataDir();
  const tmp = filePath + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  // fs.renameSync fails on Windows when antivirus or another handle has the
  // target file open (EPERM). Copy-then-delete is safe on all platforms.
  fs.copyFileSync(tmp, filePath);
  try { fs.unlinkSync(tmp); } catch { /* ignore cleanup failure */ }
}

// ─── Accounts ────────────────────────────────────────────────────────────────

/**
 * Load all saved accounts.
 * @returns {Array<object>}
 */
function loadAccounts() {
  ensureDataDir();
  return readJson(ACCOUNTS_FILE, []);
}

/**
 * Save accounts array to disk, replacing the existing file.
 * @param {Array<object>} accounts
 */
function saveAccounts(accounts) {
  writeJson(ACCOUNTS_FILE, accounts);
}

/**
 * Add a new account. Auto-generates an ID.
 * @param {{ email: string, name: string, cookies?: Record<string, string> }} account
 * @returns {object} The created account
 */
function addAccount({ email, name, cookies = {} }) {
  const accounts = loadAccounts();
  const existing = accounts.find((a) => a.email === email);
  if (existing) {
    throw new Error(`Account ${email} already exists`);
  }
  const account = {
    id: `acc-${randomBytes(4).toString("hex")}`,
    email,
    name,
    status: "idle",
    totalPoints: 0,
    todayPoints: 0,
    lastRun: null,
    searchesCompleted: 0,
    cookies,
    createdAt: new Date().toISOString(),
  };
  accounts.push(account);
  saveAccounts(accounts);
  return account;
}

/**
 * Update fields on an existing account by ID.
 * @param {string} id
 * @param {Partial<object>} patch
 * @returns {object} The updated account
 */
function updateAccount(id, patch) {
  const accounts = loadAccounts();
  const idx = accounts.findIndex((a) => a.id === id);
  if (idx === -1) throw new Error(`Account ${id} not found`);
  accounts[idx] = { ...accounts[idx], ...patch };
  saveAccounts(accounts);
  return accounts[idx];
}

/**
 * Remove an account by ID.
 * @param {string} id
 * @returns {boolean}
 */
function deleteAccount(id) {
  const accounts = loadAccounts();
  const filtered = accounts.filter((a) => a.id !== id);
  if (filtered.length === accounts.length) return false;
  saveAccounts(filtered);
  return true;
}

// ─── Session / cookies ───────────────────────────────────────────────────────

/**
 * Load the session store (arbitrary key-value pairs).
 * @returns {object}
 */
function loadSession() {
  ensureDataDir();
  return readJson(SESSION_FILE, {});
}

/**
 * Persist the session store.
 * @param {object} session
 */
function saveSession(session) {
  writeJson(SESSION_FILE, session);
}

/**
 * Get a single session value.
 * @param {string} key
 * @returns {any}
 */
function getSessionItem(key) {
  return loadSession()[key] ?? null;
}

/**
 * Set a single session value.
 * @param {string} key
 * @param {any} value
 */
function setSessionItem(key, value) {
  const session = loadSession();
  session[key] = value;
  saveSession(session);
}

/**
 * Remove a single session key.
 * @param {string} key
 */
function removeSessionItem(key) {
  const session = loadSession();
  delete session[key];
  saveSession(session);
}

// ─── Run logs ────────────────────────────────────────────────────────────────

const MAX_LOGS = 200;

/**
 * Load stored run logs (most recent first).
 * @returns {Array<object>}
 */
function loadLogs() {
  ensureDataDir();
  return readJson(LOGS_FILE, []);
}

/**
 * Append a run log entry. Trims to MAX_LOGS.
 * @param {object} log
 */
function appendLog(log) {
  const logs = loadLogs();
  logs.unshift({ ...log, id: log.id ?? `log-${randomBytes(4).toString("hex")}` });
  if (logs.length > MAX_LOGS) logs.length = MAX_LOGS;
  writeJson(LOGS_FILE, logs);
}

/**
 * Clear all run logs.
 */
function clearLogs() {
  writeJson(LOGS_FILE, []);
}

module.exports = {
  loadAccounts,
  saveAccounts,
  addAccount,
  updateAccount,
  deleteAccount,
  loadSession,
  saveSession,
  getSessionItem,
  setSessionItem,
  removeSessionItem,
  loadLogs,
  appendLog,
  clearLogs,
};
