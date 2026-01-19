import React from 'react';
import PageHeader from '@/components/common/PageHeader';
import DataTable from '@/components/common/DataTable';
import StatusBadge from '@/components/common/StatusBadge';
import { mockQCTasks } from '@/lib/mock-data';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { Play } from 'lucide-react';

const QCTasks: React.FC = () => {
  const columns = [
    { key: 'batchCode', header: 'Batch Code', sortable: true },
    { key: 'sourceName', header: 'Source' },
    { key: 'locationName', header: 'Location' },
    { key: 'recordOwnerName', header: 'Record Owner' },
    { key: 'imageCount', header: 'Images', sortable: true },
    { 
      key: 'assignedAt', 
      header: 'Assigned',
      render: (value: string) => new Date(value).toLocaleDateString()
    },
    { 
      key: 'status', 
      header: 'Status',
      render: (value: string) => <StatusBadge status={value as any} />
    },
    {
      key: 'actions',
      header: 'Action',
      render: (_: any, item: any) => (
        item.status === 'pending' ? (
          <Link to={`/qc/${item.batchId}`}>
            <Button size="sm" className="gap-2">
              <Play className="h-4 w-4" />
              Start QC
            </Button>
          </Link>
        ) : item.status === 'completed' ? (
          <span className="text-success text-sm">Completed</span>
        ) : (
          <Link to={`/qc/${item.batchId}`}>
            <Button size="sm" variant="outline">
              Continue
            </Button>
          </Link>
        )
      )
    }
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="My QC Tasks"
        description="View and manage your assigned quality control tasks"
      />

      <DataTable
        data={mockQCTasks}
        columns={columns}
        searchPlaceholder="Search tasks..."
      />
    </div>
  );
};

export default QCTasks;
