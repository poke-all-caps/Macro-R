import { DeskAccountStatus, RunLogStatus } from '@workspace/api-client-react';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Clock, XCircle, Play } from 'lucide-react';

export function StatusChip({ status }: { status: DeskAccountStatus }) {
  switch (status) {
    case 'running':
      return (
        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 gap-1.5 px-2 py-0.5 font-mono text-xs uppercase">
          <Play className="w-3 h-3 animate-pulse" />
          Running
        </Badge>
      );
    case 'done':
      return (
        <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/30 gap-1.5 px-2 py-0.5 font-mono text-xs uppercase">
          <CheckCircle2 className="w-3 h-3" />
          Complete
        </Badge>
      );
    case 'failed':
      return (
        <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30 gap-1.5 px-2 py-0.5 font-mono text-xs uppercase">
          <XCircle className="w-3 h-3" />
          Failed
        </Badge>
      );
    case 'idle':
    default:
      return (
        <Badge variant="outline" className="bg-muted/50 text-muted-foreground border-border gap-1.5 px-2 py-0.5 font-mono text-xs uppercase">
          <Clock className="w-3 h-3" />
          Idle
        </Badge>
      );
  }
}

export function LogStatusBadge({ status }: { status: RunLogStatus }) {
  switch (status) {
    case 'running':
      return <span className="text-primary animate-pulse">[RUNNING]</span>;
    case 'success':
      return <span className="text-green-500">[SUCCESS]</span>;
    case 'failed':
      return <span className="text-destructive">[FAILED] </span>;
    default:
      return <span className="text-muted-foreground">[UNKNOWN]</span>;
  }
}
