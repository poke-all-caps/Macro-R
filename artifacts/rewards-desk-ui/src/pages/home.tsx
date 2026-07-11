import { useBotStatus, useAccounts } from '@/hooks/use-desk';
import {
  CheckCircle2, PlayCircle, AlertCircle,
  Play, Download, Settings2, MoreVertical,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DeskAccount } from '@workspace/api-client-react';

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
    <div className="bg-[hsl(220,32%,14%)] rounded-2xl p-4 flex flex-col gap-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-lg shrink-0">
            {initial}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-[15px] text-white leading-snug truncate">{account.name}</p>
            <p className="text-[13px] text-muted-foreground truncate">{account.email}</p>
          </div>
        </div>
        <button className="text-muted-foreground hover:text-foreground shrink-0 ml-2 mt-0.5">
          <MoreVertical className="w-4 h-4" />
        </button>
      </div>

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
          <span className="text-muted-foreground">Status - {statusLabel}</span>
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => onRun(account.id)}
          disabled={globalRunning}
          className="flex-1 flex items-center justify-center h-10 rounded-xl bg-[hsl(220,28%,19%)] hover:bg-[hsl(220,28%,23%)] disabled:opacity-40 disabled:cursor-not-allowed text-muted-foreground hover:text-white transition-colors"
        >
          <Play className="w-[18px] h-[18px]" />
        </button>
        <button className="flex-1 flex items-center justify-center h-10 rounded-xl bg-[hsl(220,28%,19%)] hover:bg-[hsl(220,28%,23%)] text-muted-foreground hover:text-white transition-colors">
          <Download className="w-[18px] h-[18px]" />
        </button>
        <button className="flex-1 flex items-center justify-center h-10 rounded-xl bg-[hsl(220,28%,19%)] hover:bg-[hsl(220,28%,23%)] text-muted-foreground hover:text-white transition-colors">
          <Settings2 className="w-[18px] h-[18px]" />
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
    <div className="p-6 space-y-5 min-h-full">

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <h1 className="text-xl font-bold text-white">Accounts</h1>

      {/* ── Instance Status (full width) ─────────────────────────────────── */}
      <div className="bg-[hsl(220,35%,11%)] border border-border rounded-xl p-5">
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
        <h2 className="text-sm font-semibold text-white mb-3">Accounts</h2>

        {accountsLoading ? (
          <div className="grid grid-cols-2 gap-3">
            {Array(4).fill(0).map((_, i) => (
              <div key={i} className="h-40 rounded-xl bg-white/5 border border-border animate-pulse" />
            ))}
          </div>
        ) : accounts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 border border-dashed border-border rounded-xl text-muted-foreground text-sm">
            No accounts yet — add one from the Accounts page.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
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
