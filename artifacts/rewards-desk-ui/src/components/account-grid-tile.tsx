import { DeskAccount } from '@workspace/api-client-react';
import { StatusChip } from '@/components/status-chip';
import { Button } from '@/components/ui/button';
import { Play, Star, Clock, Shield, AlertCircle, Loader2 } from 'lucide-react';
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
  return (Date.now() - new Date(lastRun).getTime()) / (1000 * 60 * 60) > 24;
}

export function AccountGridTile({ account, onRun, isRunningGlobal }: Props) {
  const isRunning = account.status === 'running';
  const stale = isSessionStale(account.lastRun);
  const noRun = account.lastRun === null;
  const initial = account.name.charAt(0).toUpperCase();
  const progressPercent = Math.min(((account.searchesCompleted ?? 0) / 30) * 100, 100);

  return (
    <div
      className={cn(
        'group relative flex flex-col gap-3 p-4 rounded-xl border transition-all duration-200 overflow-hidden',
        'bg-white/5 border-border/40 hover:border-primary/30 hover:bg-white/[0.08]',
        isRunning && 'border-primary/40 bg-primary/5'
      )}
    >
      {/* Status badge — absolute top-right */}
      <div className="absolute top-3 right-3">
        <StatusChip status={account.status} />
      </div>

      {/* Avatar + name block */}
      <div className="flex items-center gap-3 pr-20">
        <div className="relative shrink-0">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-bold text-xl shadow-md">
            {initial}
          </div>
          {account.totalPoints > 0 && (
            <div className="absolute -top-2 -right-2 flex items-center gap-0.5 bg-background border border-amber-500/60 rounded-full px-1.5 py-0.5 z-10">
              <Star className="w-2.5 h-2.5 text-amber-400 fill-amber-400" />
              <span className="text-[9px] font-mono font-bold text-amber-400">
                {account.totalPoints >= 1000
                  ? `${(account.totalPoints / 1000).toFixed(1)}k`
                  : account.totalPoints}
              </span>
            </div>
          )}
        </div>
        <div className="min-w-0">
          <p className="font-bold text-sm text-white truncate">{account.name}</p>
          <p className="font-mono text-[11px] text-muted-foreground truncate">{account.email}</p>
        </div>
      </div>

      {/* Progress bar when running */}
      {isRunning && (
        <div className="h-1 rounded-full bg-border overflow-hidden -mx-1">
          <div
            className="h-full bg-primary rounded-full transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}

      {/* Stats */}
      <div className="flex items-center justify-between text-xs font-mono text-muted-foreground">
        <span>{account.searchesCompleted} searches</span>
        {account.todayPoints > 0 && (
          <span className="text-green-400">+{account.todayPoints.toLocaleString()}</span>
        )}
      </div>

      {/* Last run */}
      {account.lastRun && (
        <p className="text-[10px] font-mono text-muted-foreground flex items-center gap-1">
          <Clock className="w-2.5 h-2.5" />
          {formatRelativeTime(account.lastRun)}
        </p>
      )}

      {/* Session banner */}
      {account.status !== 'running' && (
        <div
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-mono',
            noRun
              ? 'border-red-500/30 bg-red-500/5 text-red-400'
              : stale
              ? 'border-amber-500/30 bg-amber-500/5 text-amber-400'
              : 'border-green-500/30 bg-green-500/5 text-green-400'
          )}
        >
          {noRun ? (
            <AlertCircle className="w-2.5 h-2.5 shrink-0" />
          ) : stale ? (
            <Clock className="w-2.5 h-2.5 shrink-0" />
          ) : (
            <Shield className="w-2.5 h-2.5 shrink-0" />
          )}
          <span className="truncate">
            {noRun ? 'Never run' : stale ? 'Session stale' : 'Session active'}
          </span>
        </div>
      )}

      {/* Run button */}
      <Button
        size="sm"
        disabled={isRunning || isRunningGlobal}
        onClick={() => onRun(account.id)}
        className={cn(
          'w-full font-mono text-xs uppercase tracking-wider transition-all',
          isRunning
            ? 'bg-primary/10 text-primary border border-primary/30 cursor-not-allowed'
            : 'bg-primary hover:bg-primary/90 text-primary-foreground opacity-0 group-hover:opacity-100'
        )}
      >
        {isRunning ? (
          <>
            <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
            Running…
          </>
        ) : (
          <>
            <Play className="w-3 h-3 mr-1.5" />
            Run
          </>
        )}
      </Button>
    </div>
  );
}
