import React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type StatusType = 'pending' | 'approved' | 'rejected' | 'active' | 'inactive' | 'allocated' |
  'uploaded' | 'qc_pending' | 'qc_in_progress' | 'completed' | 'in_progress' | 'accepted' | 'Allocated';

interface StatusBadgeProps {
  status: string;
  className?: string;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-warning/10 text-warning border-warning/20' },
  approved: { label: 'Approved', className: 'bg-success/10 text-success border-success/20' },
  rejected: { label: 'Rejected', className: 'bg-destructive/10 text-destructive border-destructive/20' },
  active: { label: 'Active', className: 'bg-success/10 text-success border-success/20' },
  inactive: { label: 'Inactive', className: 'bg-muted text-muted-foreground border-muted' },
  uploaded: { label: 'Uploaded', className: 'bg-info/10 text-info border-info/20' },
  qc_pending: { label: 'QC Pending', className: 'bg-warning/10 text-warning border-warning/20' },
  qc_in_progress: { label: 'QC In Progress', className: 'bg-info/10 text-info border-info/20' },
  completed: { label: 'Completed', className: 'bg-success/10 text-success border-success/20' },
  in_progress: { label: 'In Progress', className: 'bg-info/10 text-info border-info/20' },
  accepted: { label: 'Accepted', className: 'bg-success/10 text-success border-success/20' },
  allocated: { label: 'Allocated', className: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
};

const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className }) => {
  const normalizedStatus = status?.toLowerCase() || '';
  const config = statusConfig[normalizedStatus] || { label: status, className: 'bg-muted text-muted-foreground' };

  return (
    <Badge
      variant="outline"
      className={cn('font-medium', config.className, className)}
    >
      {config.label}
    </Badge>
  );
};

export default StatusBadge;
