import React from 'react';
import PageHeader from '@/components/common/PageHeader';
import DataTable from '@/components/common/DataTable';
import StatusBadge from '@/components/common/StatusBadge';
import { mockUploadHistory } from '@/lib/mock-data';

const AdminUploadHistory: React.FC = () => {
    const columns = [
        { key: 'batchCode', header: 'Batch Code', sortable: true },
        { key: 'imageCount', header: 'Images', sortable: true },
        { key: 'uploadedBy', header: 'Uploaded By' },
        {
            key: 'uploadedAt',
            header: 'Upload Date',
            sortable: true,
            render: (value: string) => new Date(value).toLocaleString()
        },
        {
            key: 'status',
            header: 'Status',
            render: (value: string) => <StatusBadge status={value as any} />
        },
    ];

    return (
        <div className="space-y-6 animate-fade-in">
            <PageHeader
                title="Admin - Upload History"
                description="View and monitor all uploaded batches across the system"
            />

            <DataTable
                data={mockUploadHistory}
                columns={columns}
                searchPlaceholder="Search upload history..."
            />
        </div>
    );
};

export default AdminUploadHistory;
