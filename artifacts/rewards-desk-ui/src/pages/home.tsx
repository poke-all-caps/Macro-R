import { useState } from 'react';
import { useBotStatus, useAccounts } from '@/hooks/use-desk';
import {
  Play, Download, Settings2, MoreVertical, AlertCircle, Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DeskAccount } from '@workspace/api-client-react';

// ─── Helpers ─────────────────────────────────────────────────────────────────

type Filter = 'all' | 'running' | 'done' | 'failed' | 'idle';

function sessionFresh(lastRun?: string | null): boolean {
  if (!lastRun) return false;
  return Date.now() - new Date(lastRun).getTime() < 24 * 60 * 60 * 1000;
}

// ─── Vertical grid card ───────────────────────────────────────────────────────

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
    idle:    { label: fresh ? 'Session active' : 'Idle', color: 'text-muted-foreground', dot: 'bg-slate-500' },
    running: { label: 'Running…',                        color: 'text-blue-400',          dot: 'bg-blue-400' },
    done:    { label: 'Done',                             color: 'text-green-400',         dot: 'bg-green-400' },
    failed:  { label: 'Failed',                           color: 'text-red-400',           dot: 'bg-red-400' },
  }[status] ?? { label: 'Unknown', color: 'text-muted-foreground', dot: 'bg-slate-500' };

  return (
    <div className="flex flex-col bg-slate-800 rounded-xl p-5 gap-4 hover:bg-slate-700/80 transition-colors">

      {/* ── Top: Avatar + name + status ── */}
      <div className="flex items-center gap-3">
        <div className="relative shrink-0">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-bold text-xl shadow-md select-none">
            {initial}
          </div>
          <span className={cn(
            'absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-slate-800',
            statusConfig.dot,
            isRunning && 'animate-pulse'
          )} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-[15px] text-white leading-snug truncate">{account.name}</p>
          <p className={cn('text-xs font-medium mt-0.5', statusConfig.color)}>{statusConfig.label}</p>
        </div>
        <button className="text-muted-foreground hover:text-white p-1 rounded-md hover:bg-white/5 transition-colors shrink-0">
          <MoreVertical className="w-4 h-4" />
        </button>
      </div>

      {/* ── Middle: Email + stats ── */}
      <div className="space-y-1.5">
        <p className="text-sm text-muted-foreground truncate">{account.email}</p>
        <div className="flex items-center gap-3 text-xs font-mono">
          {account.totalPoints > 0 ? (
            <span className="text-amber-400 font-semibold">{account.totalPoints.toLocaleString()} pts</span>
          ) : (
            <span className="text-muted-foreground">0 pts</span>
          )}
          <span className="text-slate-600">·</span>
          <span className="text-muted-foreground">{account.searchesCompleted ?? 0} searches</span>
        </div>
      </div>

      {/* ── Bottom: Action buttons ── */}
      <div className="flex gap-2 mt-auto pt-1 border-t border-slate-700/50">
        <button
          onClick={() => onRun(account.id)}
          disabled={isRunning || globalRunning}
          title="Run"
          className="flex-1 flex items-center justify-center h-9 rounded-lg bg-slate-700/60 text-slate-300 hover:bg-blue-600/25 hover:text-blue-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors border border-slate-600/40 hover:border-blue-500/30"
        >
          {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
        </button>
        <button
          title="Export"
          className="flex-1 flex items-center justify-center h-9 rounded-lg bg-slate-700/60 text-slate-300 hover:bg-slate-600/60 hover:text-white transition-colors border border-slate-600/40"
        >
          <Download className="w-4 h-4" />
        </button>
        <button
          title="Settings"
          className="flex-1 flex items-center justify-center h-9 rounded-lg bg-slate-700/60 text-slate-300 hover:bg-slate-600/60 hover:text-white transition-colors border border-slate-600/40"
        >
          <Settings2 className="w-4 h-4" />
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
    <div className="max-w-5xl mx-auto px-6 py-5 space-y-4 min-h-full">

      {/* ── Filter pills ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        {PILLS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={cn(
              'flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors border',
              filter === key
                ? 'bg-white text-black border-white'
                : 'bg-[hsl(220,30%,17%)] text-slate-300 border-slate-600/50 hover:bg-[hsl(220,30%,22%)] hover:text-white'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Account list ─────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
          {Array(4).fill(0).map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-white/5 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground text-sm gap-3">
          <AlertCircle className="w-10 h-10 opacity-20" />
          <p>{accounts.length === 0 ? 'No accounts yet — add one above.' : `No ${filter} accounts.`}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
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
