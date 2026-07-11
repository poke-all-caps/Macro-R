import { useBotStatus, useAccounts } from '@/hooks/use-desk';
import {
  CheckCircle2, PlayCircle, AlertCircle,
  Play, Download, Settings2, MoreVertical, Plus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DeskAccount } from '@workspace/api-client-react';
import { Link } from 'wouter';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sessionFresh(lastRun?: string | null): boolean {
  if (!lastRun) return false;
  return Date.now() - new Date(lastRun).getTime() < 24 * 60 * 60 * 1000;
}

// ─── Account card ─────────────────────────────────────────────────────────────

function AccountCard({
  account,
  onRun,
  globalRunning,
}: {
  account: DeskAccount;
  onRun: (id: string) => void;
  globalRunning: boolean;
}) {
  const initial = (account.name?.[0] ?? account.email?.[0] ?? 'U').toUpperCase();
  const fresh   = sessionFresh(account.lastRun);
  const status  = account.status ?? 'idle';

  const statusLabel = {
    idle:    null,
    running: <span className="text-blue-400  font-medium">Running</span>,
    done:    <span className="text-green-400 font-medium">Done</span>,
    failed:  <span className="text-red-400   font-medium">Failed</span>,
  }[status];

  return (
    <div className="bg-[hsl(220,32%,16%)] rounded-2xl p-6 flex flex-col gap-5 border border-border/30 hover:border-border/60 transition-colors">
      {/* Header row */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-bold text-xl shrink-0 shadow-md">
            {initial}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-[15px] text-white leading-snug truncate">{account.name}</p>
            <p className="text-[13px] text-muted-foreground truncate">{account.email}</p>
          </div>
        </div>
        <button className="text-muted-foreground hover:text-foreground shrink-0 ml-2 mt-0.5 p-1 rounded-md hover:bg-white/5 transition-colors">
          <MoreVertical className="w-4 h-4" />
        </button>
      </div>

      {/* Status */}
      <div className="text-[14px]">
        {status === 'idle' ? (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Idle</span>
            {fresh && (
              <>
                <span className="text-muted-foreground">·</span>
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/15 text-green-400 border border-green-500/25">
                  Session active
                </span>
              </>
            )}
          </div>
        ) : (
          <span className="text-muted-foreground">Status — {statusLabel}</span>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 mt-auto">
        <button
          onClick={() => onRun(account.id)}
          disabled={globalRunning}
          title="Run"
          className="flex-1 flex items-center justify-center h-11 rounded-xl bg-slate-700/50 text-slate-300 hover:bg-blue-600/20 hover:text-blue-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors border border-slate-600/40 hover:border-blue-500/40"
        >
          <Play className="w-5 h-5" />
        </button>
        <button
          title="Export"
          className="flex-1 flex items-center justify-center h-11 rounded-xl bg-slate-700/50 text-slate-300 hover:bg-slate-600/50 hover:text-white transition-colors border border-slate-600/40"
        >
          <Download className="w-5 h-5" />
        </button>
        <button
          title="Settings"
          className="flex-1 flex items-center justify-center h-11 rounded-xl bg-slate-700/50 text-slate-300 hover:bg-slate-600/50 hover:text-white transition-colors border border-slate-600/40"
        >
          <Settings2 className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Home() {
  const { status, runNow } = useBotStatus();
  const { accounts, isLoading: accountsLoading } = useAccounts();

  const isRunning = status?.isRunning ?? false;
  const done      = accounts.filter(a => a.status === 'done').length;
  const running   = accounts.filter(a => a.status === 'running').length;
  const failed    = accounts.filter(a => a.status === 'failed').length;

  const handleRunOne = (id: string) => {
    if (!isRunning) runNow.mutate({ data: { accountIds: [id] } });
  };

  return (
    <div className="max-w-7xl mx-auto px-8 py-6 space-y-6 min-h-full">

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Accounts</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage and run your automation targets</p>
        </div>
        <Link href="/accounts">
          <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-medium text-sm transition-colors">
            <Plus className="w-4 h-4" />
            Add Account
          </button>
        </Link>
      </div>

      {/* ── Instance Status ───────────────────────────────────────────────── */}
      <div className="bg-[hsl(220,35%,13%)] border border-border/50 rounded-xl p-5">
        <p className="text-sm font-semibold text-white mb-5">Instance Status</p>
        <div className="flex items-center">

          <div className="flex flex-1 items-center gap-3">
            <CheckCircle2 className="w-7 h-7 text-green-400 shrink-0" />
            <div>
              <p className="text-3xl font-bold text-white leading-none">{done}</p>
              <p className="text-xs text-muted-foreground mt-1">Done</p>
            </div>
          </div>

          <div className="w-px self-stretch bg-border mx-2" />

          <div className="flex flex-1 items-center gap-3 px-4">
            <PlayCircle className="w-7 h-7 text-blue-400 shrink-0" />
            <div>
              <p className="text-3xl font-bold text-white leading-none">{running}</p>
              <p className="text-xs text-muted-foreground mt-1">Running</p>
            </div>
          </div>

          <div className="w-px self-stretch bg-border mx-2" />

          <div className="flex flex-1 items-center gap-3 px-4">
            <AlertCircle className="w-7 h-7 text-red-400 shrink-0" />
            <div>
              <p className="text-3xl font-bold text-white leading-none">{failed}</p>
              <p className="text-xs text-muted-foreground mt-1">Failed</p>
            </div>
          </div>

        </div>
      </div>

      {/* ── Account grid ─────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Targets</h2>

        {accountsLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array(4).fill(0).map((_, i) => (
              <div key={i} className="h-48 rounded-xl bg-white/5 border border-border animate-pulse" />
            ))}
          </div>
        ) : accounts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 border border-dashed border-border rounded-xl text-muted-foreground text-sm gap-3">
            <p>No accounts yet.</p>
            <Link href="/accounts">
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-xs font-medium transition-colors">
                <Plus className="w-3.5 h-3.5" />
                Add your first account
              </button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {accounts.map(account => (
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

    </div>
  );
}
