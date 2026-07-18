import { useRunLogs } from '@/hooks/use-desk';
import { useBotStatus } from '@/hooks/use-desk';
import { Terminal, Activity, Clock, Wifi, WifiOff } from 'lucide-react';
import { useRef, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { LogStatusBadge } from '@/components/status-chip';

type Tab = 'terminal' | 'history';

// ─── Level colours ────────────────────────────────────────────────────────────
const LEVEL_COLOR: Record<string, string> = {
  info:  'text-green-400',
  warn:  'text-yellow-400',
  error: 'text-red-400',
  debug: 'text-slate-500',
};

const PLATFORM_COLOR: Record<string, string> = {
  MAIN:    'text-blue-400',
  MOBILE:  'text-purple-400',
  DESKTOP: 'text-cyan-400',
};

// ─── Terminal Line ────────────────────────────────────────────────────────────
function TermLine({
  time, userName, level, platform, title, message,
}: {
  time: string;
  userName: string;
  level: string;
  platform: string;
  title: string;
  message: string;
}) {
  const ts = new Date(time).toISOString().substring(11, 23);
  const lvl = level.toUpperCase().padEnd(5);
  const plat = (platform ?? 'MAIN').substring(0, 7).padEnd(7);

  return (
    <div className={cn(
      'flex gap-2 font-mono text-xs leading-5 px-3 py-0.5 hover:bg-white/5 rounded group',
      level === 'error' && 'bg-red-950/30',
    )}>
      {/* timestamp */}
      <span className="text-slate-600 shrink-0 w-[90px]">{ts}</span>
      {/* platform */}
      <span className={cn('shrink-0 w-[60px]', PLATFORM_COLOR[platform] ?? 'text-slate-400')}>{plat}</span>
      {/* level */}
      <span className={cn('shrink-0 w-[40px] font-semibold', LEVEL_COLOR[level] ?? 'text-slate-400')}>{lvl}</span>
      {/* user */}
      <span className="text-slate-400 shrink-0 max-w-[90px] truncate">{userName}</span>
      {/* title */}
      <span className="text-slate-300 shrink-0 font-semibold">[{title}]</span>
      {/* message */}
      <span className={cn(
        'flex-1 break-all whitespace-pre-wrap',
        level === 'error' ? 'text-red-300' : level === 'warn' ? 'text-yellow-200' : 'text-slate-200'
      )}>{message}</span>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function Console() {
  const { logs, agentLogs, isLoading } = useRunLogs();
  const { status } = useBotStatus();
  const [tab, setTab] = useState<Tab>('terminal');
  const [autoScroll, setAutoScroll] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const isRunning  = status?.isRunning ?? false;
  const agentAlive = status?.agentActive ?? false;

  // Auto-scroll when new logs arrive
  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [agentLogs, logs, autoScroll]);

  // Pause auto-scroll if user scrolls up
  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    setAutoScroll(atBottom);
  }

  return (
    <div className="flex flex-col h-full bg-[#0d1117]">

      {/* ── Header bar ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 px-4 py-2.5 border-b border-slate-800 bg-[#0d1117] shrink-0">
        <Terminal className="w-4 h-4 text-green-400" />
        <span className="font-mono text-sm font-semibold text-white">System Terminal</span>

        {/* Status pills */}
        <div className="flex items-center gap-2 ml-2">
          <div className={cn(
            'flex items-center gap-1.5 text-xs font-mono px-2 py-0.5 rounded-full border',
            isRunning
              ? 'text-green-400 border-green-800 bg-green-950/40'
              : 'text-slate-500 border-slate-700 bg-slate-900/40'
          )}>
            <div className={cn('w-1.5 h-1.5 rounded-full', isRunning ? 'bg-green-400 animate-pulse' : 'bg-slate-600')} />
            {isRunning ? 'RUNNING' : 'IDLE'}
          </div>

          <div className={cn(
            'flex items-center gap-1.5 text-xs font-mono px-2 py-0.5 rounded-full border',
            agentAlive
              ? 'text-blue-400 border-blue-800 bg-blue-950/40'
              : 'text-slate-500 border-slate-700 bg-slate-900/40'
          )}>
            {agentAlive
              ? <Wifi className="w-3 h-3" />
              : <WifiOff className="w-3 h-3" />}
            {agentAlive ? 'AGENT ONLINE' : 'AGENT OFFLINE'}
          </div>
        </div>

        <div className="flex-1" />

        {/* Tabs */}
        <div className="flex items-center gap-0.5 bg-slate-900 rounded-lg p-0.5 border border-slate-800">
          <button
            onClick={() => setTab('terminal')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1 rounded text-xs font-mono font-medium transition-colors',
              tab === 'terminal'
                ? 'bg-slate-700 text-white'
                : 'text-slate-500 hover:text-slate-300'
            )}
          >
            <Terminal className="w-3 h-3" />
            Live Output
          </button>
          <button
            onClick={() => setTab('history')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1 rounded text-xs font-mono font-medium transition-colors',
              tab === 'history'
                ? 'bg-slate-700 text-white'
                : 'text-slate-500 hover:text-slate-300'
            )}
          >
            <Activity className="w-3 h-3" />
            Run History
          </button>
        </div>

        {/* Auto-scroll indicator */}
        {tab === 'terminal' && (
          <button
            onClick={() => {
              setAutoScroll(true);
              bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
            }}
            className={cn(
              'text-xs font-mono px-2 py-1 rounded border transition-colors',
              autoScroll
                ? 'text-green-400 border-green-800 bg-green-950/30'
                : 'text-slate-500 border-slate-700 hover:text-slate-300'
            )}
          >
            ↓ {autoScroll ? 'Following' : 'Jump to bottom'}
          </button>
        )}
      </div>

      {/* ── Terminal / History ──────────────────────────────────────────── */}
      {tab === 'terminal' ? (
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto py-2 space-y-0.5"
        >
          {/* Startup banner */}
          <div className="px-3 py-2 font-mono text-xs text-slate-600 border-b border-slate-800/50 mb-1">
            ── Macro Rewards Agent Terminal ── {agentAlive ? 'connected' : 'waiting for agent…'} ──
          </div>

          {agentLogs.length === 0 && !isLoading ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3 font-mono">
              <WifiOff className="w-8 h-8 text-slate-700" />
              <p className="text-slate-600 text-sm">No output yet.</p>
              <p className="text-slate-700 text-xs">
                {agentAlive
                  ? 'Agent is online — click Start All to begin a run.'
                  : 'Agent is offline. Start a run to spawn the bot process.'}
              </p>
            </div>
          ) : (
            /* Render oldest-first (agentLogs comes newest-first from API) */
            [...agentLogs].reverse().map((log, i) => (
              <TermLine key={i} {...log} />
            ))
          )}

          <div ref={bottomRef} className="h-2" />
        </div>
      ) : (
        /* ── Run History ─────────────────────────────────────────────── */
        <div className="flex-1 overflow-y-auto">
          {/* Column headers */}
          <div className="flex items-center gap-4 px-4 py-2 border-b border-slate-800 font-mono text-xs text-slate-600 uppercase tracking-widest shrink-0 sticky top-0 bg-[#0d1117] z-10">
            <Clock className="w-3 h-3" />
            <span className="w-36">Time</span>
            <span className="flex-1">Account</span>
            <span className="w-20 text-right">Searches</span>
            <span className="w-20 text-right">Points</span>
            <span className="w-20 text-right">Status</span>
          </div>

          {isLoading ? (
            <div className="flex items-center gap-2 px-4 py-6 text-slate-600 font-mono text-sm">
              <span className="animate-pulse">_</span> Loading run history…
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-2 font-mono">
              <p className="text-slate-600 text-sm">No runs recorded yet.</p>
            </div>
          ) : (
            logs.map((log) => (
              <div
                key={log.id}
                className="flex items-center gap-4 px-4 py-2.5 border-b border-slate-800/50 font-mono text-xs hover:bg-white/5 transition-colors"
              >
                <Clock className="w-3 h-3 text-slate-700 shrink-0" />
                <span className="w-36 text-slate-500 shrink-0">
                  {new Date(log.timestamp).toLocaleString(undefined, {
                    month: 'short', day: 'numeric',
                    hour: '2-digit', minute: '2-digit', second: '2-digit',
                  })}
                </span>
                <div className="flex-1 min-w-0">
                  <span className="text-white font-medium">{log.accountName}</span>
                  {log.errorMessage && (
                    <p className="text-red-400 text-[11px] mt-0.5 break-all">[ERR] {log.errorMessage}</p>
                  )}
                </div>
                <span className="w-20 text-right text-slate-400">{log.searchesDone}</span>
                <span className="w-20 text-right text-yellow-500/80">+{log.pointsEarned}</span>
                <span className="w-20 text-right">
                  <LogStatusBadge status={log.status} />
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-1.5 border-t border-slate-800 bg-[#0d1117] shrink-0 font-mono text-xs text-slate-600">
        <div className="w-2 h-3 bg-green-400/80 animate-pulse" />
        <span>
          {tab === 'terminal'
            ? `${agentLogs.length} log entries · refreshing every 2s`
            : `${logs.length} runs in history`}
        </span>
        {status?.currentAccount && (
          <>
            <span className="mx-2 text-slate-700">|</span>
            <span className="text-blue-400">current: {status.currentAccount}</span>
          </>
        )}
      </div>
    </div>
  );
}
