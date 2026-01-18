import { TournamentStatus } from '@/lib/types/tournament';
import { Badge } from '@/components/ui/badge';
import { 
  Clock, 
  Users, 
  Play, 
  Pause, 
  CheckCircle2, 
  XCircle 
} from 'lucide-react';

interface TournamentStatusBadgeProps {
  status: TournamentStatus;
  className?: string;
}

const statusConfig: Record<TournamentStatus, {
  label: string;
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}> = {
  setup: {
    label: 'Setup',
    variant: 'outline',
    icon: Clock,
    color: 'text-slate-400',
  },
  registration: {
    label: 'Registration Open',
    variant: 'default',
    icon: Users,
    color: 'text-blue-400',
  },
  active: {
    label: 'Active',
    variant: 'default',
    icon: Play,
    color: 'text-green-400',
  },
  paused: {
    label: 'Paused',
    variant: 'secondary',
    icon: Pause,
    color: 'text-yellow-400',
  },
  completed: {
    label: 'Completed',
    variant: 'default',
    icon: CheckCircle2,
    color: 'text-emerald-400',
  },
  cancelled: {
    label: 'Cancelled',
    variant: 'destructive',
    icon: XCircle,
    color: 'text-red-400',
  },
};

export function TournamentStatusBadge({ 
  status, 
  className = '' 
}: TournamentStatusBadgeProps) {
  // Safety check: handle undefined or invalid status values
  const config = statusConfig[status];
  
  if (!config) {
    console.warn(`Unknown tournament status: ${status}`);
    // Fallback to a default config
    return (
      <Badge variant="outline" className={`text-slate-400 ${className}`}>
        {status || 'Unknown'}
      </Badge>
    );
  }

  const Icon = config.icon;

  return (
    <Badge 
      variant={config.variant}
      className={`${config.color} ${className}`}
    >
      <Icon className="h-3 w-3 mr-1" />
      {config.label}
    </Badge>
  );
}
