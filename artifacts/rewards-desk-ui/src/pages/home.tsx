import { useState } from 'react';
import { useBotStatus, useAccounts, useRunLogs } from '@/hooks/use-desk';
import {
  CheckCircle2, PlayCircle, AlertCircle, Minus, Plus,
  Users, Square, Play, Download, Settings2, MoreVertical,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DeskAccount } from '@workspace/api-client-react';

// ─── Tiny helpers ────────────────────────────────────────────────────────────

function avatarColor(name: string) {
  const colors = [
    'bg-indigo-500', 'bg-violet-500', 'bg-blue-500',
    'bg-teal-500',   'bg-rose-500',   'bg-amber-500',
  ];
  return colors[(name.charCodeAt(0) || 0) % colors.length];
}

function sessionFresh(lastRun?: string | null): boolean {
  if (!lastRun) return false;
  return Date.now() - new Date(lastRun).getTime() < 24 * 60 * 60 * 1000;
}

// ─── Account card (matching the screenshot style) ────────────────────────────

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

  return (
    <div className="bg-[hsl(220,35%,13%)] border border-border rounded-xl p-4 flex flex-col gap-3">

      {/* Header row */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className={cn('w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-base shrink-0', avatarColor(account.name ?? ''))}>
            {initial}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm text-white truncate">{account.name}</p>
            <p className="text-xs text-muted-foreground truncate">{account.email}</p>
          </div>
        </div>
        <button className="text-muted-foreground hover:text-foreground shrink-0 ml-2">
          <MoreVertical className="w-4 h-4" />
        </button>
      </div>

      {/* Status line */}
      <div className="flex items-center gap-2 text-sm">
        {status === 'idle' && (
          <>
            <span className="text-muted-foreground">Idle</span>
            {fresh && (
              <>
                <span className="text-muted-foreground">·</span>
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/15 text-green-400 border border-green-500/25">
                  Session active
                </span>
              </>
            )}
          </>
        )}
        {status === 'running' && (
          <span className="text-sm text-muted-foreground">
            Status - <span className="text-blue-400 font-medium">Running</span>
          </span>
        )}
        {status === 'done' && (
          <span className="text-sm text-muted-foreground">
            Status - <span className="text-green-400 font-medium">Done</span>
          </span>
        )}
        {status === 'failed' && (
          <span className="text-sm text-muted-foreground">
            Status - <span className="text-red-400 font-medium">Failed</span>
          </span>
        )}
      </div>

      {/* Action buttons */}
      {status === 'idle' ? (
        /* Idle: large blue play + settings */
        <div className="flex gap-2">
          <button
            onClick={() => onRun(account.id)}
            disabled={globalRunning}
            className="flex-1 flex items-center justify-center gap-2 h-9 rounded-md bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-primary-foreground text-sm font-medium transition-colors"
          >
            <Play className="w-4 h-4 fill-current" />
          </button>
          <button className="flex-1 flex items-center justify-center gap-2 h-9 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium transition-colors">
            <Settings2 className="w-4 h-4" />
          </button>
        </div>
      ) : (
        /* Running / Done / Failed: smaller icon trio */
        <div className="flex gap-2">
          <button
            onClick={() => onRun(account.id)}
            disabled={globalRunning}
            className="flex-1 flex items-center justify-center h-9 rounded-md bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed text-muted-foreground hover:text-foreground transition-colors border border-border"
          >
            <Play className="w-4 h-4" />
          </button>
          <button className="flex-1 flex items-center justify-center h-9 rounded-md bg-white/5 hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors border border-border">
            <Download className="w-4 h-4" />
          </button>
          <button className="flex-1 flex items-center justify-center h-9 rounded-md bg-white/5 hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors border border-border">
            <Settings2 className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function Home() {
  const { status, runNow } = useBotStatus();
  const { accounts, isLoading: accountsLoading } = useAccounts();
  const { logs, isLoading: logsLoading } = useRunLogs();

  const [searchCount, setSearchCount] = useState(30);
  const [delay, setDelay]             = useState(5);
  const [activeTab, setActiveTab]     = useState<'live' | 'queue' | 'editor'>('live');

  const isRunning = status?.isRunning ?? false;
  const done      = accounts.filter(a => a.status === 'done').length;
  const running   = accounts.filter(a => a.status === 'running').length;
  const failed    = accounts.filter(a => a.status === 'failed').length;

  const handleRunAll = () => { if (!isRunning) runNow.mutate({ data: {} }); };
  const handleRunOne = (id: string) => { if (!isRunning) runNow.mutate({ data: { accountIds: [id] } }); };

  return (
    <div className="p-6 space-y-5 min-h-full">

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">Accounts</h1>
        <div className="flex items-center gap-4">
          {/* Stop / Run All */}
          {isRunning ? (
            <button className="flex items-center gap-2 px-4 py-2 rounded-md bg-red-500 hover:bg-red-600 text-white text-sm font-medium transition-colors">
              <Square className="w-3.5 h-3.5 fill-current" />
              Stop
            </button>
          ) : (
            <button
              onClick={handleRunAll}
              disabled={runNow.isPending || accountsLoading}
              className="flex items-center gap-2 px-4 py-2 rounded-md bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-medium transition-colors"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              Stop
            </button>
          )}

          {/* Badge */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="w-4 h-4" />
            <span>{accounts.length} Accounts Connected</span>
          </div>
        </div>
      </div>

      {/* ── Two info panels ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4">

        {/* Instance Status */}
        <div className="bg-[hsl(220,35%,11%)] border border-border rounded-xl p-5">
          <p className="text-sm font-semibold text-white mb-4">Instance Status</p>
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-7 h-7 text-green-400 shrink-0" />
              <div>
                <p className="text-2xl font-bold text-white leading-none">{done}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Done</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <PlayCircle className="w-7 h-7 text-blue-400 shrink-0" />
              <div>
                <p className="text-2xl font-bold text-white leading-none">{running}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Running</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <AlertCircle className="w-7 h-7 text-red-400 shrink-0" />
              <div>
                <p className="text-2xl font-bold text-white leading-none">{failed}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Failed</p>
              </div>
            </div>
          </div>
        </div>

        {/* Global Execution Parameters */}
        <div className="bg-[hsl(220,35%,11%)] border border-border rounded-xl p-5">
          <p className="text-sm font-semibold text-white mb-4">Global Execution Parameters</p>
          <div className="flex items-end gap-5">
            {/* Search Count */}
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">Search Count</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSearchCount(v => Math.max(1, v - 1))}
                  className="w-7 h-7 flex items-center justify-center rounded bg-white/8 hover:bg-white/15 text-foreground border border-border transition-colors"
                >
                  <Minus className="w-3 h-3" />
                </button>
                <span className="w-10 text-center font-semibold text-white text-sm">{searchCount}</span>
                <button
                  onClick={() => setSearchCount(v => Math.min(50, v + 1))}
                  className="w-7 h-7 flex items-center justify-center rounded bg-white/8 hover:bg-white/15 text-foreground border border-border transition-colors"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Delay */}
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">Delay</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setDelay(v => Math.max(1, v - 1))}
                  className="w-7 h-7 flex items-center justify-center rounded bg-white/8 hover:bg-white/15 text-foreground border border-border transition-colors"
                >
                  <Minus className="w-3 h-3" />
                </button>
                <span className="w-10 text-center font-semibold text-white text-sm">{delay}s</span>
                <button
                  onClick={() => setDelay(v => Math.max(1, v + 1))}
                  className="w-7 h-7 flex items-center justify-center rounded bg-white/8 hover:bg-white/15 text-foreground border border-border transition-colors"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Apply Config */}
            <button className="ml-auto px-5 py-2 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium transition-colors shrink-0">
              Apply Config
            </button>
          </div>
        </div>
      </div>

      {/* ── Bottom split: account grid + logs panel ───────────────────────── */}
      <div className="flex gap-4 min-h-0">

        {/* Account cards — 2 × N grid */}
        <div className="flex-1 min-w-0">
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

        {/* Live Logs panel */}
        <div className="w-80 shrink-0 flex flex-col">
          {/* Tabs */}
          <div className="flex border-b border-border mb-0">
            {(['live', 'queue', 'editor'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'px-4 py-2 text-xs font-medium border-b-2 -mb-px transition-colors',
                  activeTab === tab
                    ? 'border-primary text-white'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                {tab === 'live' ? 'Live Logs' : tab === 'queue' ? 'Query Queue' : 'Task Editor'}
              </button>
            ))}
          </div>

          {/* Log table */}
          <div className="flex-1 bg-[hsl(220,35%,11%)] border border-border rounded-b-xl overflow-hidden flex flex-col">
            {/* Table header */}
            <div className="grid grid-cols-3 px-3 py-2 border-b border-border bg-[hsl(220,35%,13%)]">
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Status</span>
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Time stamp</span>
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Result</span>
            </div>

            {/* Rows */}
            <div className="overflow-y-auto flex-1 custom-scrollbar">
              {logsLoading ? (
                <div className="p-4 text-center text-muted-foreground text-xs">Loading…</div>
              ) : logs.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground text-xs">No logs yet.</div>
              ) : (
                logs.slice().reverse().map((log) => {
                  const ts = new Date(log.timestamp);
                  const timeStr = `${ts.getFullYear()}-${String(ts.getMonth()+1).padStart(2,'0')}-${String(ts.getDate()).padStart(2,'0')} ${ts.toTimeString().slice(0,8)}`;
                  const isRunningRow = log.status === 'running';
                  return (
                    <div
                      key={log.id}
                      className={cn(
                        'grid grid-cols-3 px-3 py-2 text-xs border-b border-border/50',
                        isRunningRow ? 'bg-blue-500/8 text-blue-300' : 'text-muted-foreground'
                      )}
                    >
                      <span className={cn('font-medium capitalize', isRunningRow ? 'text-blue-400' : 'text-foreground')}>
                        {isRunningRow ? 'Running' : 'Query'}
                      </span>
                      <span className="font-mono text-[10px] truncate">{timeStr}</span>
                      <span className="truncate">
                        {log.errorMessage
                          ? `Error: ${log.errorMessage.slice(0, 20)}…`
                          : `Result [from : ${(log.accountName ?? '').slice(0, 8)}…]`}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
