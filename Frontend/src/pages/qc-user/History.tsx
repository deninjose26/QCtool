import React from 'react';
import PageHeader from '@/components/common/PageHeader';
import DataTable from '@/components/common/DataTable';
import { mockQCHistory } from '@/lib/mock-data';
import { Badge } from '@/components/ui/badge';

const QCUserHistory: React.FC = () => {
    const columns = [
        { key: 'batchCode', header: 'Batch Code', sortable: true },
        { key: 'totalImages', header: 'Total Images', sortable: true },
        {
            key: 'acceptedCount',
            header: 'Accepted',
            render: (value: number) => (
                <Badge variant="outline" className="bg-success/10 text-success border-success/20">
                    {value}
                </Badge>
            )
        },
        {
            key: 'rejectedCount',
            header: 'Rejected',
            render: (value: number) => (
                <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20">
                    {value}
                </Badge>
            )
        },
        { key: 'qcByName', header: 'QC By' },
        {
            key: 'completedAt',
            header: 'Completed',
            sortable: true,
            render: (value: string) => new Date(value).toLocaleString()
        },
    ];

    return (
        <div className="space-y-6 animate-fade-in">
            <PageHeader
                title="My QC History"
                description="View your completed quality control tasks"
            />

            <DataTable
                data={mockQCHistory}
                columns={columns}
                searchPlaceholder="Search QC history..."
            />
        </div>
    );
};

export default QCUserHistory;
