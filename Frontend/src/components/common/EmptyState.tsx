import React from 'react';
import { Button } from '@/components/ui/button';
import { 
  FileQuestion, FolderKanban, Database, MapPin, Building2, Upload, 
  CheckCircle, Users, GitBranch, UserCog, Layers, XCircle, Clock,
  ClipboardList, PlusCircle, History, Image, RefreshCw, Briefcase, 
  FileText, Shield
} from 'lucide-react';

interface EmptyStateProps {
  icon: string;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  FileQuestion,
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

const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
}) => {
  const IconComponent = iconMap[icon] || FileQuestion;

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="p-4 rounded-full bg-muted mb-4">
        <IconComponent className="h-12 w-12 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
      <p className="text-muted-foreground max-w-sm mb-6">{description}</p>
      {action && (
        <Button onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
};

export default EmptyState;
