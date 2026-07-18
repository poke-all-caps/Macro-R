import { DeskAccount } from '@workspace/api-client-react';
import { StatusChip } from '@/components/status-chip';
import { Button } from '@/components/ui/button';
import { Play, Search, Star, Clock, Shield, AlertCircle, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  account: DeskAccount;
  onRun: (id: string) => void;
  isRunningGlobal: boolean;
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function isSessionStale(lastRun: string | null): boolean {
  if (!lastRun) return true;
  const hoursSince = (Date.now() - new Date(lastRun).getTime()) / (1000 * 60 * 60);
  return hoursSince > 24;
}

function AccountAvatar({ name }: { name: string }) {
  const initial = name.charAt(0).toUpperCase();
  return (
    <div className="w-11 h-11 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-bold text-lg shrink-0 shadow-md">
      {initial}
    </div>
  );
}

export function AccountCard({ account, onRun, isRunningGlobal }: Props) {
  const isRunning = account.status === 'running';
  const stale = isSessionStale(account.lastRun);
  const noRun = account.lastRun === null;

  const progressPercent = (account.searchesCompleted ?? 0) > 0
    ? Math.min(((account.searchesCompleted ?? 0) / 30) * 100, 100)
    : 0;

  return (
    <div
      className={cn(
        'group flex items-start gap-4 p-4 rounded-xl border transition-all duration-200',
        'bg-white/5 border-border/40 hover:border-primary/25 hover:bg-white/[0.07]',
        isRunning && 'border-primary/30 bg-primary/5'
      )}
    >
      {/* Avatar */}
      <div className="mt-0.5 relative">
        <AccountAvatar name={account.name} />
        {isRunning && (
          <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-primary border-2 border-background animate-pulse" />
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0 space-y-2">
        {/* Name + status */}
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-sm text-white truncate">{account.name}</p>
            <p className="font-mono text-xs text-muted-foreground truncate">{account.email}</p>
          </div>
          <StatusChip status={account.status} />
        </div>

        {/* Progress bar (only when running) */}
        {isRunning && (
          <div className="h-1 rounded-full bg-border overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        )}

        {/* Stats row */}
        <div className="flex items-center gap-3 text-xs font-mono text-muted-foreground flex-wrap">
          <span className="flex items-center gap-1">
            <Search className="w-3 h-3" />
            {account.searchesCompleted} searches
          </span>
          {account.totalPoints > 0 && (
            <>
              <span className="text-border">·</span>
              <span className="flex items-center gap-1">
                <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                {account.totalPoints.toLocaleString()} pts
              </span>
            </>
          )}
          {account.todayPoints > 0 && (
            <>
              <span className="text-border">·</span>
              <span className="text-green-400">+{account.todayPoints.toLocaleString()} today</span>
            </>
          )}
          {account.lastRun && (
            <>
              <span className="text-border">·</span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatRelativeTime(account.lastRun)}
              </span>
            </>
          )}
        </div>

        {/* Session status banner */}
        {account.status !== 'running' && (
          <div
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-mono',
              noRun
                ? 'border-red-500/30 bg-red-500/5 text-red-400'
                : stale
                ? 'border-amber-500/30 bg-amber-500/5 text-amber-400'
                : 'border-green-500/30 bg-green-500/5 text-green-400'
            )}
          >
            {noRun ? (
              <AlertCircle className="w-3 h-3 shrink-0" />
            ) : stale ? (
              <Clock className="w-3 h-3 shrink-0" />
            ) : (
              <Shield className="w-3 h-3 shrink-0" />
            )}
            <span>
              {noRun
                ? 'Never run — click to start'
                : stale
                ? 'Last run > 24h ago'
                : 'Recently active'}
            </span>
          </div>
        )}
      </div>

      {/* Run button */}
      <div className="shrink-0 self-center">
        <Button
          size="icon"
          variant="ghost"
          disabled={isRunning || isRunningGlobal}
          onClick={() => onRun(account.id)}
          className={cn(
            'w-9 h-9 rounded-full transition-all',
            isRunning
              ? 'text-primary bg-primary/10 cursor-not-allowed'
              : 'text-muted-foreground hover:text-white hover:bg-primary/20 opacity-0 group-hover:opacity-100'
          )}
          title={isRunning ? 'Running…' : 'Run this account'}
        >
          {isRunning ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Play className="w-4 h-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
