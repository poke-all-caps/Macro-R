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

// ─── Bot engine account store (src/accounts.json) ────────────────────────────
// These functions keep src/accounts.json (the file the bot actually reads) in
// sync with any changes made through the desk UI.

const BOT_ACCOUNTS_FILE = path.resolve(__dirname, "../../references/bot-source/accounts.json");
const BOT_ACCOUNTS_ENC_FILE = path.resolve(__dirname, "../../references/bot-source/accounts.enc.json");

/**
 * Returns true when the bot store is encrypted (accounts.enc.json exists).
 * NOTE: This no longer blocks reads or writes — it only warns.
 * Encryption is not yet implemented; the enc file is treated as a stale
 * artefact and plain-JSON access proceeds normally in all cases.
 */
function isBotStoreEncrypted() {
  return fs.existsSync(BOT_ACCOUNTS_ENC_FILE);
}

function loadBotAccounts() {
  if (isBotStoreEncrypted()) {
    console.warn("[account-storage] accounts.enc.json found but encryption is not implemented — using plain JSON store.");
  }
  return readJson(BOT_ACCOUNTS_FILE, []);
}

/**
 * Add a full account entry to src/accounts.json.
 * Throws only if the email already exists.
 */
function addBotAccount({ email, password, totpSecret = "", recoveryEmail = "", geoLocale = "auto", langCode = "en", proxy = {}, saveFingerprint = {} }) {
  if (isBotStoreEncrypted()) {
    console.warn("[account-storage] accounts.enc.json found but encryption is not implemented — writing to plain JSON store.");
  }
  const accounts = loadBotAccounts();
  if (accounts.find((a) => a.email === email)) {
    throw new Error(`Bot account ${email} already exists`);
  }
  const entry = {
    email,
    enabled: true,
    password: password || "",
    totpSecret: totpSecret || "",
    recoveryEmail: recoveryEmail || "",
    geoLocale: geoLocale || "auto",
    langCode: langCode || "en",
    dashboardMode: "auto",
    strictProxy: "auto",
    proxy: {
      proxyAxios: true,
      url: proxy.url || "",
      port: Number(proxy.port) || 0,
      username: proxy.username || "",
      password: proxy.password || "",
    },
    saveFingerprint: {
      mobile: Boolean(saveFingerprint.mobile),
      desktop: Boolean(saveFingerprint.desktop),
    },
  };
  accounts.push(entry);
  writeJson(BOT_ACCOUNTS_FILE, accounts);
}

/**
 * Update an existing bot account entry identified by its current email.
 * Only the fields present in `patch` are changed.
 */
function updateBotAccount(currentEmail, patch) {
  if (isBotStoreEncrypted()) {
    console.warn("[account-storage] accounts.enc.json found but encryption is not implemented — updating plain JSON store.");
  }
  const accounts = loadBotAccounts();
  const idx = accounts.findIndex((a) => a.email === currentEmail);
  if (idx === -1) return; // account not in bot store — that's fine, skip
  const acc = accounts[idx];
  if (patch.email !== undefined) acc.email = patch.email;
  if (patch.password !== undefined) acc.password = patch.password;
  if (patch.totpSecret !== undefined) acc.totpSecret = patch.totpSecret;
  if (patch.recoveryEmail !== undefined) acc.recoveryEmail = patch.recoveryEmail;
  if (patch.geoLocale !== undefined) acc.geoLocale = patch.geoLocale;
  if (patch.langCode !== undefined) acc.langCode = patch.langCode;
  if (patch.proxy !== undefined) {
    acc.proxy = {
      ...acc.proxy,
      ...patch.proxy,
      port: Number(patch.proxy.port) || acc.proxy.port || 0,
    };
  }
  if (patch.saveFingerprint !== undefined) {
    acc.saveFingerprint = { ...acc.saveFingerprint, ...patch.saveFingerprint };
  }
  accounts[idx] = acc;
  writeJson(BOT_ACCOUNTS_FILE, accounts);
}

/**
 * Remove an account from src/accounts.json by email.
 */
function deleteBotAccount(email) {
  if (isBotStoreEncrypted()) {
    console.warn("[account-storage] accounts.enc.json found but encryption is not implemented — deleting from plain JSON store.");
  }
  const accounts = loadBotAccounts();
  const filtered = accounts.filter((a) => a.email !== email);
  if (filtered.length !== accounts.length) {
    writeJson(BOT_ACCOUNTS_FILE, filtered);
  }
}

module.exports = {
  loadAccounts,
  saveAccounts,
  addAccount,
  updateAccount,
  deleteAccount,
  addBotAccount,
  updateBotAccount,
  deleteBotAccount,
  isBotStoreEncrypted,
  loadSession,
  saveSession,
  getSessionItem,
  setSessionItem,
  removeSessionItem,
  loadLogs,
  appendLog,
  clearLogs,
};
