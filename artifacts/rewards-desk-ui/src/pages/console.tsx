import { useRunLogs, useBotStatus } from '@/hooks/use-desk';
import { Card } from '@/components/ui/card';
import { Terminal, Download, ShieldAlert, Cpu } from 'lucide-react';
import { LogStatusBadge } from '@/components/status-chip';
import { useRef, useEffect } from 'react';

export default function Console() {
  const { logs, isLoading } = useRunLogs();
  const { status } = useBotStatus();
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of logs
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  return (
    <div className="p-8 max-w-7xl mx-auto w-full space-y-6 animate-in fade-in duration-500 h-full flex flex-col">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-mono font-bold tracking-tight text-white mb-2 uppercase flex items-center gap-3">
            <Terminal className="w-6 h-6 text-primary" />
            System Output
          </h2>
          <p className="text-muted-foreground font-mono text-sm">Real-time execution logs and telemetry.</p>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="flex items-center gap-2 bg-black/40 px-3 py-1.5 rounded border border-border/50">
            <Cpu className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-muted-foreground uppercase tracking-wider">Engine:</span>
            <span className={status?.isRunning ? "text-primary" : "text-muted-foreground"}>
              {status?.isRunning ? "ACTIVE" : "STANDBY"}
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 relative">
        <Card className="glass-panel border-primary/20 absolute inset-0 overflow-hidden flex flex-col font-mono text-sm">
          <div className="p-3 border-b border-border/50 bg-black/40 flex items-center justify-between text-xs text-muted-foreground uppercase tracking-widest">
            <div className="flex gap-4">
              <span>Timestamp</span>
              <span>Process</span>
            </div>
            <div className="flex gap-4">
              <span>Searches</span>
              <span>Yield</span>
              <span>Status</span>
            </div>
          </div>

          <div className="overflow-y-auto flex-1 p-4 space-y-1.5 custom-scrollbar bg-[#0a0a0a]">
            {isLoading ? (
              <div className="flex items-center gap-2 text-primary opacity-50">
                <span className="animate-pulse">_</span> Initializing telemetry stream...
              </div>
            ) : logs.length === 0 ? (
              <div className="text-muted-foreground opacity-50">No execution logs available in current buffer.</div>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="group hover:bg-white/5 py-1 px-2 rounded -mx-2 transition-colors flex items-start justify-between break-all">
                  <div className="flex gap-4 min-w-0 pr-4">
                    <span className="text-muted-foreground/60 whitespace-nowrap">
                      {new Date(log.timestamp).toISOString().substring(11, 23)}
                    </span>
                    <span className="text-white truncate">
                      <span className="text-primary/60 mr-2">root@desk:~$</span>
                      EXEC {log.accountName} 
                      {log.errorMessage && (
                        <span className="block text-destructive mt-1 text-xs break-words">
                          <ShieldAlert className="inline w-3 h-3 mr-1" />
                          ERR: {log.errorMessage}
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="flex gap-6 whitespace-nowrap text-right shrink-0">
                    <span className="w-16">[{log.searchesDone}]</span>
                    <span className="w-16 text-yellow-500/80">+{log.pointsEarned}</span>
                    <span className="w-24 text-left"><LogStatusBadge status={log.status} /></span>
                  </div>
                </div>
              ))
            )}
            <div ref={bottomRef} className="h-4" />
          </div>
          <div className="p-2 border-t border-border/50 bg-black/40 text-xs text-muted-foreground flex items-center gap-2">
            <div className="w-2 h-4 bg-primary animate-pulse" />
            Awaiting input...
          </div>
        </Card>
      </div>
    </div>
  );
}
