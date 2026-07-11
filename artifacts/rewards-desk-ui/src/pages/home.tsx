import { useBotStatus, useAccounts } from '@/hooks/use-desk';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Activity, Power, Coins, Search, Zap, LayoutList, LayoutGrid,
  Play, Square, CheckSquare, Minus, Plus,
} from 'lucide-react';
import { StatusChip } from '@/components/status-chip';
import { AccountCard } from '@/components/account-card';
import { AccountGridTile } from '@/components/account-grid-tile';
import { StatsBar } from '@/components/stats-bar';
import { useState } from 'react';
import { cn } from '@/lib/utils';

type ViewMode = 'list' | 'grid';

export default function Home() {
  const { status, isLoading: isStatusLoading, runNow } = useBotStatus();
  const { accounts, isLoading: isAccountsLoading } = useAccounts();

  const [viewMode, setViewMode]           = useState<ViewMode>('list');
  const [searchCount, setSearchCount]     = useState(30);
  const [searchDelay, setSearchDelay]     = useState(5);

  const isRunning = status?.isRunning ?? false;

  const totalPoints   = accounts.reduce((s, a) => s + a.todayPoints, 0);
  const totalSearches = accounts.reduce((s, a) => s + (a.searchesCompleted ?? 0), 0);

  const handleRunAll = () => {
    if (isRunning) return;
    runNow.mutate({ data: {} });
  };

  const handleRunAccount = (id: string) => {
    if (isRunning) return;
    runNow.mutate({ data: { accountIds: [id] } });
  };

  const handleStop = () => {
    // Stop is fire-and-forget — the server's simulated run will finish naturally.
    // In a production setup you'd call a /desk/stop endpoint here.
    // For now just show the visual feedback (status polling handles the rest).
  };

  // ── Stepper helpers ──────────────────────────────────────────────────────────
  const decSearch = () => setSearchCount((v) => Math.max(1, v - 1));
  const incSearch = () => setSearchCount((v) => Math.min(50, v + 1));
  const decDelay  = () => setSearchDelay((v) => Math.max(1, v - 1));
  const incDelay  = () => setSearchDelay((v) => Math.min(30, v + 1));

  return (
    <div className="p-8 max-w-7xl mx-auto w-full space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* ── Page header ────────────────────────────────────────────────────── */}
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-mono font-bold tracking-tight text-white mb-2 uppercase flex items-center gap-3">
            <Activity className="w-6 h-6 text-primary" />
            Control Center
          </h2>
          <p className="text-muted-foreground font-mono text-sm">
            System oversight and execution parameters.
          </p>
        </div>
      </div>

      {/* ── Top row: status panel + stats ──────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

        {/* Main status panel */}
        <Card className="md:col-span-2 glass-panel border-primary/20 box-shadow-cyan overflow-hidden relative">
          {isRunning && (
            <div className="absolute top-0 left-0 right-0 h-1 bg-primary animate-pulse" />
          )}
          <div className="p-8 flex flex-col h-full justify-between relative z-10 gap-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-2">
                  Automaton Status
                </p>
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <div className={`w-4 h-4 rounded-full ${isRunning ? 'bg-primary animate-pulse' : 'bg-muted-foreground/50'}`} />
                    {isRunning && (
                      <div className="absolute inset-0 bg-primary rounded-full animate-ping opacity-75" />
                    )}
                  </div>
                  <h3
                    className={`text-3xl font-mono font-bold ${
                      isRunning ? 'text-primary text-shadow-cyan' : 'text-muted-foreground'
                    }`}
                  >
                    {isRunning ? 'EXECUTING' : 'STANDBY'}
                  </h3>
                </div>
              </div>

              {/* Primary action button */}
              {isRunning ? (
                <Button
                  onClick={handleStop}
                  size="lg"
                  className="font-mono tracking-widest uppercase bg-destructive/20 text-destructive border border-destructive/50 hover:bg-destructive/30"
                >
                  <Square className="mr-2 w-4 h-4" />
                  Stop
                </Button>
              ) : (
                <Button
                  onClick={handleRunAll}
                  disabled={runNow.isPending || isAccountsLoading}
                  size="lg"
                  className="font-mono tracking-widest uppercase bg-primary hover:bg-primary/90 text-primary-foreground shadow-[0_0_15px_rgba(6,182,212,0.4)] hover:shadow-[0_0_25px_rgba(6,182,212,0.6)]"
                >
                  {runNow.isPending ? (
                    <>
                      <Zap className="mr-2 w-5 h-5 animate-pulse" />
                      Starting…
                    </>
                  ) : (
                    <>
                      <Power className="mr-2 w-5 h-5" />
                      Initiate Sequence
                    </>
                  )}
                </Button>
              )}
            </div>

            {/* Inline settings: search count + delay steppers */}
            <div className="grid grid-cols-2 gap-4 border border-border/40 rounded-xl p-4 bg-black/20">
              {/* Search count */}
              <div className="flex flex-col items-center gap-3">
                <p className="text-[11px] font-mono text-muted-foreground uppercase tracking-widest">
                  Search Count
                </p>
                <div className="flex items-center gap-4">
                  <button
                    onClick={decSearch}
                    className="w-9 h-9 rounded-full bg-muted/30 hover:bg-muted/60 flex items-center justify-center transition-colors"
                    aria-label="Decrease search count"
                  >
                    <Minus className="w-4 h-4 text-foreground" />
                  </button>
                  <span className="font-mono font-bold text-3xl text-white w-12 text-center">
                    {searchCount}
                  </span>
                  <button
                    onClick={incSearch}
                    className="w-9 h-9 rounded-full bg-muted/30 hover:bg-muted/60 flex items-center justify-center transition-colors"
                    aria-label="Increase search count"
                  >
                    <Plus className="w-4 h-4 text-foreground" />
                  </button>
                </div>
              </div>

              {/* Divider */}
              <div className="relative flex flex-col items-center gap-3">
                <div className="absolute left-0 top-0 bottom-0 w-px bg-border/50" />
                <p className="text-[11px] font-mono text-muted-foreground uppercase tracking-widest">
                  Delay (sec)
                </p>
                <div className="flex items-center gap-4">
                  <button
                    onClick={decDelay}
                    className="w-9 h-9 rounded-full bg-muted/30 hover:bg-muted/60 flex items-center justify-center transition-colors"
                    aria-label="Decrease delay"
                  >
                    <Minus className="w-4 h-4 text-foreground" />
                  </button>
                  <span className="font-mono font-bold text-3xl text-white w-16 text-center">
                    {searchDelay}s
                  </span>
                  <button
                    onClick={incDelay}
                    className="w-9 h-9 rounded-full bg-muted/30 hover:bg-muted/60 flex items-center justify-center transition-colors"
                    aria-label="Increase delay"
                  >
                    <Plus className="w-4 h-4 text-foreground" />
                  </button>
                </div>
              </div>
            </div>

            {/* Active target / last cycle */}
            <div className="grid grid-cols-2 gap-4 border-t border-border/50 pt-4">
              <div>
                <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-1">
                  Active Target
                </p>
                <p className="font-mono text-sm truncate max-w-[200px]">
                  {status?.currentAccount || (
                    <span className="text-muted-foreground opacity-50">NONE</span>
                  )}
                </p>
              </div>
              <div>
                <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-1">
                  Last Cycle
                </p>
                <p className="font-mono text-sm">
                  {status?.lastRunAt ? (
                    new Date(status.lastRunAt).toLocaleTimeString()
                  ) : (
                    <span className="text-muted-foreground opacity-50">N/A</span>
                  )}
                </p>
              </div>
            </div>
          </div>
        </Card>

        {/* Global stats column */}
        <div className="space-y-6">
          <Card className="glass-panel p-6 flex flex-col justify-center">
            <div className="flex items-center gap-3 mb-2">
              <Coins className="w-5 h-5 text-yellow-500" />
              <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                Yield Today
              </p>
            </div>
            <p className="text-4xl font-mono font-bold text-white tracking-tight">
              {isAccountsLoading ? '--' : totalPoints.toLocaleString()}
            </p>
          </Card>

          <Card className="glass-panel p-6 flex flex-col justify-center">
            <div className="flex items-center gap-3 mb-2">
              <Search className="w-5 h-5 text-green-500" />
              <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                Queries Executed
              </p>
            </div>
            <p className="text-4xl font-mono font-bold text-white tracking-tight">
              {isStatusLoading ? '--' : (status?.totalSearchesToday ?? totalSearches).toLocaleString()}
            </p>
          </Card>
        </div>
      </div>

      {/* ── Target Array ────────────────────────────────────────────────────── */}
      <div>
        {/* Section header with stats bar + view toggle */}
        <div className="flex items-center justify-between mb-3 gap-4">
          <h3 className="text-lg font-mono font-bold tracking-tight text-white uppercase shrink-0">
            Target Array
          </h3>

          {/* Stats bar (shown when there are accounts) */}
          {accounts.length > 0 && !isAccountsLoading && (
            <div className="flex-1 max-w-sm">
              <StatsBar accounts={accounts} />
            </div>
          )}

          {/* View toggle + per-account run-all */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Run All / Stop toggle */}
            {accounts.length > 0 && (
              isRunning ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleStop}
                  className="font-mono text-xs uppercase tracking-wider text-destructive border-destructive/40 hover:bg-destructive/10"
                >
                  <Square className="w-3.5 h-3.5 mr-1.5" />
                  Stop All
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={handleRunAll}
                  disabled={runNow.isPending}
                  className="font-mono text-xs uppercase tracking-wider bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                  <Play className="w-3.5 h-3.5 mr-1.5" />
                  Run All
                </Button>
              )
            )}

            {/* View mode toggle */}
            <div className="flex items-center border border-border/50 rounded-lg overflow-hidden bg-black/30">
              <button
                onClick={() => setViewMode('list')}
                className={cn(
                  'flex items-center justify-center w-9 h-8 transition-colors',
                  viewMode === 'list'
                    ? 'bg-primary/20 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                )}
                title="List view"
              >
                <LayoutList className="w-4 h-4" />
              </button>
              <div className="w-px h-4 bg-border/50" />
              <button
                onClick={() => setViewMode('grid')}
                className={cn(
                  'flex items-center justify-center w-9 h-8 transition-colors',
                  viewMode === 'grid'
                    ? 'bg-primary/20 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                )}
                title="Grid view"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Account list / grid */}
        {isAccountsLoading ? (
          viewMode === 'list' ? (
            <div className="space-y-2">
              {Array(3).fill(0).map((_, i) => (
                <div key={i} className="h-28 rounded-xl bg-white/5 border border-border/40 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {Array(4).fill(0).map((_, i) => (
                <div key={i} className="h-52 rounded-xl bg-white/5 border border-border/40 animate-pulse" />
              ))}
            </div>
          )
        ) : accounts.length === 0 ? (
          <div className="py-16 text-center border border-dashed border-border/50 rounded-xl">
            <p className="text-muted-foreground font-mono text-sm">No targets configured.</p>
            <p className="text-muted-foreground/50 font-mono text-xs mt-1">
              Add an account from the Target Directory.
            </p>
          </div>
        ) : viewMode === 'list' ? (
          <div className="space-y-2">
            {accounts.map((account, i) => (
              <div
                key={account.id}
                className="animate-in fade-in slide-in-from-bottom-1"
                style={{ animationDelay: `${i * 60}ms`, animationFillMode: 'both' }}
              >
                <AccountCard
                  account={account}
                  onRun={handleRunAccount}
                  isRunningGlobal={isRunning}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {accounts.map((account, i) => (
              <div
                key={account.id}
                className="animate-in fade-in slide-in-from-bottom-2"
                style={{ animationDelay: `${i * 80}ms`, animationFillMode: 'both' }}
              >
                <AccountGridTile
                  account={account}
                  onRun={handleRunAccount}
                  isRunningGlobal={isRunning}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
