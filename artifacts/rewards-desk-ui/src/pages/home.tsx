import { useState } from 'react';
import { useBotStatus, useAccounts } from '@/hooks/use-desk';
import { useToast } from '@/hooks/use-toast';
import { Play, AlertCircle, Loader2, Square, Power } from 'lucide-react';
import { Link } from 'wouter';
import { cn } from '@/lib/utils';
import type { DeskAccount } from '@workspace/api-client-react';
import { AddAccountDialog } from '@/components/add-account-dialog';

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

      {/* ── Footer: action buttons ── */}
      <div className="flex items-center gap-2 pt-3 border-t border-slate-700/50">
        <Link href="/accounts">
          <button
            title="Settings"
            className="w-8 h-8 rounded-full bg-slate-700/50 hover:bg-slate-700 flex items-center justify-center transition-colors shrink-0"
          >
            <Power className="w-3.5 h-3.5 text-slate-400" />
          </button>
        </Link>

        <div className="flex-1" />

        <button
          onClick={() => onRun(account.id)}
          disabled={globalRunning || isRunning}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all',
            isRunning
              ? 'bg-blue-500/20 text-blue-400 cursor-default'
              : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-40'
          )}
        >
          {isRunning
            ? <><Loader2 className="w-3 h-3 animate-spin" /> Running</>
            : <><Play className="w-3 h-3 fill-emerald-400" /> Run</>
          }
        </button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Home() {
  const { toast } = useToast();
  const { accounts, isLoading, addAccount } = useAccounts();
  const { status, runNow, stopAll } = useBotStatus();
  const [filter, setFilter] = useState<Filter>('all');

  const isRunning = status?.isRunning ?? false;

  const filtered = accounts.filter(a => {
    if (filter === 'all')     return true;
    if (filter === 'running') return a.status === 'running';
    if (filter === 'done')    return a.status === 'done';
    if (filter === 'failed')  return a.status === 'failed';
    if (filter === 'idle')    return !a.status || a.status === 'idle';
    return true;
  });

  function handleRunOne(id: string) {
    runNow.mutate(
      { data: { accountIds: [id] } },
      {
        onError: (err) => {
          toast({
            title: 'Failed to start',
            description: err instanceof Error ? err.message : 'Unknown error — check the Logs page.',
            variant: 'destructive',
          });
        },
      }
    );
  }

  function handleRunAll() {
    if (accounts.length === 0) {
      toast({
        title: 'No accounts',
        description: 'Add at least one account before running.',
        variant: 'destructive',
      });
      return;
    }
    runNow.mutate(
      { data: { accountIds: accounts.map(a => a.id) } },
      {
        onSuccess: (data) => {
          toast({
            title: 'Started',
            description: (data as { message?: string })?.message ?? 'Bot is now running.',
          });
        },
        onError: (err) => {
          const msg = err instanceof Error ? err.message : String(err);
          // Try to parse JSON error body from the server
          let detail = msg;
          try {
            const parsed = JSON.parse(msg) as { message?: string };
            if (parsed.message) detail = parsed.message;
          } catch { /* ignore */ }
          toast({
            title: 'Failed to start',
            description: detail,
            variant: 'destructive',
          });
        },
      }
    );
  }

  function handleStopAll() {
    stopAll.mutate(undefined, {
      onSuccess: () => {
        toast({ title: 'Stopped', description: 'All automation stopped.' });
      },
      onError: (err) => {
        toast({
          title: 'Stop failed',
          description: err instanceof Error ? err.message : 'Unknown error.',
          variant: 'destructive',
        });
      },
    });
  }

  const counts = {
    all:     accounts.length,
    running: accounts.filter(a => a.status === 'running').length,
    done:    accounts.filter(a => a.status === 'done').length,
    failed:  accounts.filter(a => a.status === 'failed').length,
    idle:    accounts.filter(a => !a.status || a.status === 'idle').length,
  };

  const FILTERS: { key: Filter; label: string }[] = [
    { key: 'all',     label: `All (${counts.all})` },
    { key: 'running', label: `Running (${counts.running})` },
    { key: 'done',    label: `Done (${counts.done})` },
    { key: 'failed',  label: `Failed (${counts.failed})` },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto w-full space-y-5">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold text-white">Accounts</h2>
          <p className="text-sm text-muted-foreground">Manage and run your automation targets</p>
        </div>

        {/* Filter pills + action bar */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Filter pills */}
          <div className="flex items-center gap-1">
            {FILTERS.map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
                  filter === f.key
                    ? 'bg-white text-black'
                    : 'text-muted-foreground hover:text-white'
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Add Account */}
          <AddAccountDialog addAccount={addAccount} />

          {/* Start All / Stop All */}
          <div className="flex items-center shrink-0 bg-[#121827] border border-slate-700 rounded-full p-1 shadow-sm">
            <button
              onClick={handleRunAll}
              disabled={isRunning || runNow.isPending}
              className="flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-700 disabled:opacity-50 transition-all"
            >
              {runNow.isPending
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Play className="w-3.5 h-3.5 text-emerald-400 fill-emerald-400" />
              }
              {runNow.isPending ? 'Starting…' : 'Start All'}
            </button>
            <div className="w-[1px] h-4 bg-slate-600 mx-1" />
            <button
              onClick={handleStopAll}
              disabled={!isRunning || stopAll.isPending}
              className="flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-700 disabled:opacity-40 transition-all"
            >
              <Square className="w-3.5 h-3.5 text-rose-400 fill-rose-400" />
              {stopAll.isPending ? 'Stopping…' : 'Stop All'}
            </button>
          </div>
        </div>
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
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
