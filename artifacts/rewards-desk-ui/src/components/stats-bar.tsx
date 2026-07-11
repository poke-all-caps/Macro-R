import { DeskAccount } from '@workspace/api-client-react';
import { CheckCircle2, RefreshCw, XCircle } from 'lucide-react';

interface Props {
  accounts: DeskAccount[];
}

export function StatsBar({ accounts }: Props) {
  const doneCount    = accounts.filter((a) => a.status === 'done').length;
  const runningCount = accounts.filter((a) => a.status === 'running').length;
  const failedCount  = accounts.filter((a) => a.status === 'failed').length;
  const total        = accounts.length;

  return (
    <div className="flex items-center rounded-xl border border-border/50 bg-gradient-to-r from-blue-950/40 to-slate-900/40 overflow-hidden divide-x divide-border/50">
      <StatItem
        icon={<CheckCircle2 className="w-3.5 h-3.5 text-green-500" />}
        label="Done"
        value={`${doneCount}/${total}`}
        color="text-green-400"
      />
      <StatItem
        icon={<RefreshCw className="w-3.5 h-3.5 text-primary animate-spin [animation-duration:2s]" />}
        label="Running"
        value={String(runningCount)}
        color="text-primary"
        active={runningCount > 0}
      />
      <StatItem
        icon={<XCircle className="w-3.5 h-3.5 text-destructive" />}
        label="Failed"
        value={String(failedCount)}
        color="text-destructive"
      />
    </div>
  );
}

function StatItem({
  icon,
  label,
  value,
  color,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
  active?: boolean;
}) {
  return (
    <div className={`flex items-center justify-center gap-2 px-5 py-2.5 flex-1 ${active ? 'bg-primary/5' : ''}`}>
      {icon}
      <span className={`font-mono font-bold text-sm ${color}`}>{value}</span>
      <span className="font-mono text-xs text-muted-foreground">{label}</span>
    </div>
  );
}
