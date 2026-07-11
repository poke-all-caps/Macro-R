import { useState } from 'react';
import { useBotStatus, useAccounts } from '@/hooks/use-desk';
import { Play, Download, RefreshCw, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DeskAccount } from '@workspace/api-client-react';

// ─── Helpers ─────────────────────────────────────────────────────────────────

type Filter = 'all' | 'running' | 'done' | 'failed' | 'idle';

function sessionFresh(lastRun?: string | null): boolean {
  if (!lastRun) return false;
  return Date.now() - new Date(lastRun).getTime() < 24 * 60 * 60 * 1000;
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function AccountCard({
  account,
  onRun,
  globalRunning,
}: {
  account: DeskAccount;
  onRun: (id: string) => void;
  globalRunning: boolean;
}) {
  const initial   = (account.name?.[0] ?? account.email?.[0] ?? 'U').toUpperCase();
  const fresh     = sessionFresh(account.lastRun);
  const status    = account.status ?? 'idle';
  const isRunning = status === 'running';

  const statusConfig = {
    idle:    { label: fresh ? 'Session Active' : 'Idle', color: 'text-muted-foreground', dot: 'bg-slate-500' },
    running: { label: 'Running…',                        color: 'text-blue-400',          dot: 'bg-blue-400' },
    done:    { label: 'Done',                             color: 'text-green-400',         dot: 'bg-green-400' },
    failed:  { label: 'Failed',                           color: 'text-red-400',           dot: 'bg-red-400' },
  }[status] ?? { label: 'Unknown', color: 'text-muted-foreground', dot: 'bg-slate-500' };

  return (
    <div className="flex flex-col bg-slate-800/80 border border-slate-700/50 rounded-xl p-5 gap-4 hover:border-slate-600/70 hover:bg-slate-800 transition-colors">

      {/* ── Top: Avatar + info ── */}
      <div className="flex items-center gap-4">
        {/* Avatar */}
        <div className="relative shrink-0">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-bold text-2xl shadow-md select-none">
            {initial}
          </div>
          <span className={cn(
            'absolute bottom-0.5 right-0.5 w-3 h-3 rounded-full border-2 border-slate-800',
            statusConfig.dot,
            isRunning && 'animate-pulse'
          )} />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-[15px] text-white leading-snug truncate">
              {account.name}
            </p>
            <span className={cn('text-xs font-semibold', statusConfig.color)}>
              {statusConfig.label}
            </span>
          </div>
          <p className="text-sm text-muted-foreground truncate">
            {account.email}
          </p>
          <div className="flex items-center gap-2 text-xs font-mono">
            {account.totalPoints > 0 ? (
              <span className="text-amber-400 font-semibold">{account.totalPoints.toLocaleString()} pts</span>
            ) : (
              <span className="text-muted-foreground">0 pts</span>
            )}
            <span className="text-slate-600">·</span>
            <span className="text-muted-foreground">{account.searchesCompleted ?? 0} searches</span>
          </div>
        </div>
      </div>

      {/* ── Bottom: Action buttons ── */}
      <div className="flex gap-2 pt-3 border-t border-slate-700/50">
        <button
          onClick={() => onRun(account.id)}
          disabled={isRunning || globalRunning}
          className="flex-1 flex items-center justify-center gap-2 h-9 rounded-lg bg-slate-700/60 text-slate-300 text-sm font-medium hover:bg-blue-600/25 hover:text-blue-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors border border-slate-600/40 hover:border-blue-500/30"
        >
          {isRunning
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <Play className="w-4 h-4" />}
          <span>{isRunning ? 'Running' : 'Play'}</span>
        </button>
        <button
          className="flex-1 flex items-center justify-center gap-2 h-9 rounded-lg bg-slate-700/60 text-slate-300 text-sm font-medium hover:bg-slate-600/60 hover:text-white transition-colors border border-slate-600/40"
        >
          <Download className="w-4 h-4" />
          <span>Download</span>
        </button>
        <button
          className="flex-1 flex items-center justify-center gap-2 h-9 rounded-lg bg-slate-700/60 text-slate-300 text-sm font-medium hover:bg-slate-600/60 hover:text-white transition-colors border border-slate-600/40"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Re-Sync</span>
        </button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Home() {
  const { status, runNow } = useBotStatus();
  const { accounts, isLoading } = useAccounts();
  const [filter, setFilter] = useState<Filter>('all');

  const isRunning = status?.isRunning ?? false;

  const counts = {
    all:     accounts.length,
    running: accounts.filter(a => a.status === 'running').length,
    done:    accounts.filter(a => a.status === 'done').length,
    failed:  accounts.filter(a => a.status === 'failed').length,
    idle:    accounts.filter(a => !a.status || a.status === 'idle').length,
  };

  const filtered = filter === 'all' ? accounts : accounts.filter(a => {
    if (filter === 'idle') return !a.status || a.status === 'idle';
    return a.status === filter;
  });

  const handleRunOne = (id: string) => {
    if (!isRunning) runNow.mutate({ data: { accountIds: [id] } });
  };

  const PILLS: { key: Filter; label: string }[] = [
    { key: 'all',     label: `All (${counts.all})` },
    { key: 'running', label: `Running (${counts.running})` },
    { key: 'done',    label: `Done (${counts.done})` },
    { key: 'failed',  label: `Failed (${counts.failed})` },
    { key: 'idle',    label: `Idle (${counts.idle})` },
  ];

  return (
    <div className="px-6 py-6 space-y-5 min-h-full">

      {/* ── Page title ───────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold text-white">Accounts</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage and run your automation targets</p>
      </div>

      {/* ── Filter pills ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {PILLS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={cn(
              'flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors border',
              filter === key
                ? 'bg-white text-black border-white'
                : 'bg-[hsl(220,30%,17%)] text-slate-300 border-transparent hover:bg-[hsl(220,30%,22%)] hover:text-white'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Account grid ─────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array(4).fill(0).map((_, i) => (
            <div key={i} className="h-44 rounded-xl bg-white/5 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground text-sm gap-3">
          <AlertCircle className="w-10 h-10 opacity-20" />
          <p>{accounts.length === 0 ? 'No accounts yet — add one above.' : `No ${filter} accounts.`}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(account => (
            <AccountCard
              key={account.id}
              account={account}
              onRun={handleRunOne}
              globalRunning={isRunning}
            />
          ))}
        </div>
      )}

    </div>
  );
}
