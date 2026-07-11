import { useBotStatus, useAccounts } from '@/hooks/use-desk';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Activity, Power, Coins, Search, Zap } from 'lucide-react';
import { StatusChip } from '@/components/status-chip';

export default function Home() {
  const { status, isLoading: isStatusLoading, runNow } = useBotStatus();
  const { accounts, isLoading: isAccountsLoading } = useAccounts();

  const handleRunNow = () => {
    runNow.mutate({ data: {} });
  };

  const totalPoints = accounts.reduce((acc, account) => acc + account.todayPoints, 0);
  const totalSearches = accounts.reduce((acc, account) => acc + (account.searchesCompleted || 0), 0);
  
  const isRunning = status?.isRunning;

  return (
    <div className="p-8 max-w-7xl mx-auto w-full space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-mono font-bold tracking-tight text-white mb-2 uppercase flex items-center gap-3">
            <Activity className="w-6 h-6 text-primary" />
            Control Center
          </h2>
          <p className="text-muted-foreground font-mono text-sm">System oversight and execution parameters.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Main Status Panel */}
        <Card className="md:col-span-2 glass-panel border-primary/20 box-shadow-cyan overflow-hidden relative">
          {isRunning && (
            <div className="absolute top-0 left-0 right-0 h-1 bg-primary animate-pulse" />
          )}
          <div className="p-8 flex flex-col h-full justify-between relative z-10">
            <div className="flex items-start justify-between mb-8">
              <div>
                <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-2">Automaton Status</p>
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <div className={`w-4 h-4 rounded-full ${isRunning ? 'bg-primary animate-pulse' : 'bg-muted-foreground/50'}`} />
                    {isRunning && <div className="absolute inset-0 bg-primary rounded-full animate-ping opacity-75" />}
                  </div>
                  <h3 className={`text-3xl font-mono font-bold ${isRunning ? 'text-primary text-shadow-cyan' : 'text-muted-foreground'}`}>
                    {isRunning ? 'EXECUTING' : 'STANDBY'}
                  </h3>
                </div>
              </div>
              <Button 
                onClick={handleRunNow} 
                disabled={isRunning || runNow.isPending}
                size="lg"
                className={`font-mono tracking-widest uppercase transition-all duration-300 ${
                  isRunning 
                    ? 'bg-primary/20 text-primary border border-primary/50' 
                    : 'bg-primary hover:bg-primary/90 text-primary-foreground shadow-[0_0_15px_rgba(6,182,212,0.4)] hover:shadow-[0_0_25px_rgba(6,182,212,0.6)]'
                }`}
              >
                {isRunning ? (
                  <>
                    <Zap className="mr-2 w-5 h-5 animate-pulse" />
                    Running...
                  </>
                ) : (
                  <>
                    <Power className="mr-2 w-5 h-5" />
                    Initiate Sequence
                  </>
                )}
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-4 border-t border-border/50 pt-6">
              <div>
                <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-1">Active Target</p>
                <p className="font-mono text-sm truncate max-w-[200px]">
                  {status?.currentAccount || <span className="text-muted-foreground opacity-50">NONE</span>}
                </p>
              </div>
              <div>
                <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-1">Last Cycle</p>
                <p className="font-mono text-sm">
                  {status?.lastRunAt ? new Date(status.lastRunAt).toLocaleTimeString() : <span className="text-muted-foreground opacity-50">N/A</span>}
                </p>
              </div>
            </div>
          </div>
        </Card>

        {/* Global Stats */}
        <div className="space-y-6">
          <Card className="glass-panel p-6 flex flex-col justify-center">
            <div className="flex items-center gap-3 mb-2">
              <Coins className="w-5 h-5 text-yellow-500" />
              <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Yield Today</p>
            </div>
            <p className="text-4xl font-mono font-bold text-white tracking-tight">
              {isAccountsLoading ? '--' : totalPoints.toLocaleString()}
            </p>
          </Card>
          
          <Card className="glass-panel p-6 flex flex-col justify-center">
            <div className="flex items-center gap-3 mb-2">
              <Search className="w-5 h-5 text-green-500" />
              <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Queries Executed</p>
            </div>
            <p className="text-4xl font-mono font-bold text-white tracking-tight">
              {isStatusLoading ? '--' : (status?.totalSearchesToday || totalSearches).toLocaleString()}
            </p>
          </Card>
        </div>
      </div>

      {/* Target Array */}
      <div>
        <h3 className="text-lg font-mono font-bold tracking-tight text-white mb-4 uppercase border-b border-border/50 pb-2">Target Array</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {isAccountsLoading ? (
            Array(4).fill(0).map((_, i) => (
              <Card key={i} className="glass-panel p-4 h-32 animate-pulse bg-white/5" />
            ))
          ) : accounts.length === 0 ? (
            <div className="col-span-full py-8 text-center border border-dashed border-border/50 rounded-lg">
              <p className="text-muted-foreground font-mono text-sm">No targets configured.</p>
            </div>
          ) : (
            accounts.map((account, i) => (
              <Card 
                key={account.id} 
                className={`glass-panel p-4 hover:border-primary/30 transition-colors animate-in fade-in slide-in-from-bottom-2`}
                style={{ animationDelay: `${i * 100}ms`, animationFillMode: 'both' }}
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="truncate pr-2">
                    <p className="font-bold text-sm text-white truncate">{account.name}</p>
                    <p className="font-mono text-xs text-muted-foreground truncate">{account.email}</p>
                  </div>
                  <StatusChip status={account.status} />
                </div>
                <div className="flex justify-between items-end mt-4 pt-3 border-t border-border/30">
                  <div>
                    <p className="text-[10px] font-mono text-muted-foreground uppercase">Points</p>
                    <p className="font-mono text-sm text-yellow-500">+{account.todayPoints}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-mono text-muted-foreground uppercase">Searches</p>
                    <p className="font-mono text-sm">{account.searchesCompleted || 0}/50</p>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
