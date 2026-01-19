import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { 
  Activity, FolderKanban, Database, MapPin, Building2, Upload, 
  CheckCircle, Users, GitBranch, UserCog, Layers, XCircle, Clock,
  ClipboardList, PlusCircle, History, Image, RefreshCw, Briefcase, 
  FileText, Shield
} from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: string;
  change?: string;
  changeType?: 'positive' | 'negative' | 'neutral';
  className?: string;
}

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Activity,
  FolderKanban,
  Database,
  MapPin,
  Building2,
  Upload,
  CheckCircle,
  Users,
  GitBranch,
  UserCog,
  Layers,
  XCircle,
  Clock,
  ClipboardList,
  PlusCircle,
  History,
  Image,
  RefreshCw,
  Briefcase,
  FileText,
  Shield,
};

const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  icon,
  change,
  changeType = 'neutral',
  className,
}) => {
  const IconComponent = iconMap[icon] || Activity;

  return (
    <Card className={cn('stat-card group', className)}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-3xl font-bold text-foreground">{value}</p>
            {change && (
              <p className={cn(
                'text-xs font-medium',
                changeType === 'positive' && 'text-success',
                changeType === 'negative' && 'text-destructive',
                changeType === 'neutral' && 'text-muted-foreground'
              )}>
                {change} from last month
              </p>
            )}
          </div>
          <div className="p-3 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
            <IconComponent className="h-6 w-6 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default StatCard;
