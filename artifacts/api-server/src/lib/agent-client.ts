/**
 * agent-client.ts
 * ----------------
 * Minimal IPC client for communicating with the MicrosoftRewardsBot background
 * process via the AgentRuntime TCP socket.
 *
 * No external dependencies — pure Node built-ins only.
 *
 * The bot process writes its port + token to data/agent/agent.json (relative
 * to the workspace root). We read that file and send JSON-newline messages.
 */

import crypto from 'crypto';
import fs from 'fs';
import net from 'net';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

// ── Paths ─────────────────────────────────────────────────────────────────────

/** Absolute path to the workspace root (4 levels up from src/lib/). */
export const WORKSPACE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../'
);

const AGENT_STATE_FILE = path.join(WORKSPACE_ROOT, 'data', 'agent', 'agent.json');

// ── Types ─────────────────────────────────────────────────────────────────────

interface AgentRuntimeState {
  pid:       number;
  port:      number;
  token:     string;
  startedAt: string;
  cwd:       string;
  version:   1;
}

export interface AgentStatus {
  active:       boolean;
  pid?:         number;
  runState:     'idle' | 'running';
  lastExitCode?: number | null;
}

export interface DashboardLog {
  time:     string;
  userName: string;
  level:    'info' | 'warn' | 'error' | 'debug';
  platform: 'MAIN' | 'MOBILE' | 'DESKTOP';
  title:    string;
  message:  string;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function parseJson<T>(raw: string): T | null {
  try { return JSON.parse(raw) as T; } catch { return null; }
}

async function readAgentState(): Promise<AgentRuntimeState | null> {
  const raw = await fs.promises.readFile(AGENT_STATE_FILE, 'utf8').catch(() => '');
  const state = parseJson<AgentRuntimeState>(raw);
  // Validate: version, port, token, pid, cwd must match workspace root
  if (
    !state ||
    state.version !== 1 ||
    !state.port ||
    !state.token ||
    !state.pid ||
    state.cwd !== WORKSPACE_ROOT
  ) {
    await fs.promises.rm(AGENT_STATE_FILE, { force: true }).catch(() => undefined);
    return null;
  }
  return state;
}

function sendMessage<T = unknown>(
  state: AgentRuntimeState,
  message: Record<string, unknown>,
  timeoutMs: number,
): Promise<T | null> {
  return new Promise(resolve => {
    const socket = net.connect({ host: '127.0.0.1', port: state.port });
    socket.setEncoding('utf8');
    let buffer  = '';
    let settled = false;

    const finish = (value: T | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.end();
      resolve(value);
    };

    const timer = setTimeout(() => {
      settled = true;
      socket.destroy();
      resolve(null);
    }, timeoutMs);

    socket.on('connect', () => {
      socket.write(JSON.stringify({ token: state.token, ...message }) + '\n');
    });
    socket.on('data', chunk => {
      buffer += chunk;
      let nl = buffer.indexOf('\n');
      while (nl >= 0) {
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        finish(parseJson<T>(line));
        nl = buffer.indexOf('\n');
      }
    });
    socket.on('error', () => finish(null));
    socket.on('close', () => finish(null));
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Returns the current bot status, or { active:false, runState:'idle' } when offline. */
export async function getAgentStatus(): Promise<AgentStatus> {
  const state = await readAgentState();
  if (!state) return { active: false, runState: 'idle' };

  const response = await sendMessage<{
    type?:         string;
    pid?:          number;
    cwd?:          string;
    runState?:     'idle' | 'running';
    lastExitCode?: number | null;
  }>(state, { type: 'ping' }, 1000);

  if (response?.type !== 'pong' || response.pid !== state.pid) {
    return { active: false, runState: 'idle' };
  }
  return {
    active:       true,
    pid:          response.pid,
    runState:     response.runState === 'running' ? 'running' : 'idle',
    lastExitCode: response.lastExitCode,
  };
}

/** Sends a run_now command to the bot. Returns whether it was accepted. */
export async function requestAgentRun(): Promise<{ accepted: boolean; reason?: string }> {
  const state = await readAgentState();
  if (!state) return { accepted: false, reason: 'No active bot process' };

  const response = await sendMessage<{ type?: string; reason?: string }>(
    state,
    { type: 'run_now' },
    1500,
  );
  return response?.type === 'run_accepted'
    ? { accepted: true }
    : { accepted: false, reason: response?.reason ?? 'Bot rejected the run' };
}

/** Requests that the bot stop after completing the current account. */
export async function requestAgentStop(): Promise<boolean> {
  const state = await readAgentState();
  if (!state) return false;

  const response = await sendMessage<{ type?: string }>(
    state,
    { type: 'stop_after_current' },
    1500,
  );
  return response?.type === 'stop_accepted';
}

/**
 * Spawns the bot as a detached background process (src/index.ts --background).
 * The process writes data/agent/agent.json once its IPC server is listening.
 * Poll isAgentActive() after calling this to wait for it to be ready.
 */
export function spawnBotProcess(): void {
  const isWindows = process.platform === 'win32';
  const binDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../../node_modules/.bin');

  // Include both .cmd (Windows) and extensionless (Unix) candidates for each location.
  const candidates = [
    path.join(binDir, 'tsx.cmd'),
    path.join(binDir, 'tsx'),
    path.join(WORKSPACE_ROOT, 'node_modules/.bin/tsx.cmd'),
    path.join(WORKSPACE_ROOT, 'node_modules/.bin/tsx'),
    'tsx', // global fallback
  ];

  // On Windows, skip extensionless bash scripts — they exist on disk but
  // Node's CreateProcess cannot execute them. On non-Windows, skip .cmd/.bat.
  const filtered = candidates.filter(p => {
    if (p === 'tsx') return true;
    if (isWindows) return p.endsWith('.cmd') || p.endsWith('.bat');
    return !p.endsWith('.cmd') && !p.endsWith('.bat');
  });

  const tsxBin = filtered.find(p => {
    try { return p === 'tsx' || fs.existsSync(p); } catch { return false; }
  }) ?? 'tsx';

  // On Windows, .cmd files must be invoked via cmd.exe /c — spawning them
  // directly causes a silent CreateProcess failure.
  const isCmd = tsxBin.endsWith('.cmd') || tsxBin.endsWith('.bat');
  const botEntry = path.join('references', 'bot-source', 'index.ts');
  const [spawnCmd, spawnArgs] = isCmd
    ? ['cmd.exe', ['/c', tsxBin, botEntry, '--background']]
    : [tsxBin,    [botEntry, '--background']];

  const botProcess = spawn(spawnCmd, spawnArgs, {
    cwd:      WORKSPACE_ROOT,
    detached: true,
    stdio:    'ignore',
    shell:    false,
    env:      { ...process.env },
  });
  // MUST handle 'error' or an ENOENT/EACCES will propagate as an unhandled
  // exception and crash the API server process.
  botProcess.on('error', (err) => {
    pushLog({
      userName: 'DESK',
      level:    'error',
      platform: 'MAIN',
      title:    'SPAWN-ERR',
      message:  `Failed to start bot process: ${err.message}. Run the automation locally on your Windows machine.`,
    });
  });
  botProcess.unref();
}

/**
 * Waits up to `maxMs` for the bot agent to appear and respond to a ping.
 * Returns true when ready, false on timeout.
 */
export async function waitForAgent(maxMs = 8000): Promise<boolean> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const status = await getAgentStatus();
    if (status.active) return true;
    await new Promise(r => setTimeout(r, 300));
  }
  return false;
}

// ── Log streaming ─────────────────────────────────────────────────────────────

const MAX_BUFFERED_LOGS = 150;
const logBuffer: DashboardLog[] = [];
let logSocket: net.Socket | null = null;

/** Returns a copy of the in-memory log buffer (most recent first). */
export function getBufferedLogs(): DashboardLog[] {
  return [...logBuffer];
}

/**
 * Attaches to the bot's log stream (idempotent — safe to call repeatedly).
 * Logs are buffered in memory and served via getBufferedLogs().
 */
export async function ensureLogSubscription(): Promise<void> {
  if (logSocket && !logSocket.destroyed) return;

  const state = await readAgentState();
  if (!state) return;

  const socket = net.connect({ host: '127.0.0.1', port: state.port });
  socket.setEncoding('utf8');
  let buffer = '';

  socket.on('connect', () => {
    socket.write(JSON.stringify({ token: state.token, type: 'attach' }) + '\n');
  });
  socket.on('data', chunk => {
    buffer += chunk;
    let nl = buffer.indexOf('\n');
    while (nl >= 0) {
      const line = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 1);
      const msg = parseJson<{ type?: string; log?: DashboardLog }>(line);
      if (msg?.type === 'log' && msg.log) {
        logBuffer.unshift(msg.log);
        if (logBuffer.length > MAX_BUFFERED_LOGS) logBuffer.pop();
      }
      nl = buffer.indexOf('\n');
    }
  });
  socket.on('close', () => { logSocket = null; });
  socket.on('error', () => { logSocket = null; });

  logSocket = socket;
}

/** Injects a synthetic log entry into the buffer (used for desk-initiated events). */
export function pushLog(entry: Omit<DashboardLog, 'time'>): void {
  logBuffer.unshift({ time: new Date().toISOString(), ...entry });
  if (logBuffer.length > MAX_BUFFERED_LOGS) logBuffer.pop();
}
