import { NavItem, UserRole } from '@/types';

export const roleLabels: Record<UserRole, string> = {
    SuperAdmin: 'Super Admin',
    Upload_Supervisor: 'Upload Manager',
    Vendor: 'Vendor',
    Scanning_Operator: 'Scanning Operator',
    QC_Supervisor: 'QC Manager',
    QC_User: 'QC User',
};

export const getNavItems = (role: UserRole): NavItem[] => {
    const common: NavItem[] = [
        { title: 'Dashboard', href: '/dashboard', icon: 'LayoutDashboard' },
    ];

    switch (role) {
        case 'SuperAdmin':
            return [
                ...common,
                { title: 'Projects', href: '/projects', icon: 'FolderKanban' },
                { title: 'Sources', href: '/sources', icon: 'Database' },
                { title: 'Locations', href: '/locations', icon: 'MapPin' },
                { title: 'Record Owners', href: '/record-owners', icon: 'Building2' },
                { title: 'Record Types', href: '/record-types', icon: 'FileText' },
                { title: 'User Management', href: '/users', icon: 'Users' },
                { title: 'Upload History', href: '/upload-history', icon: 'Upload' },
                { title: 'QC History', href: '/qc-history', icon: 'CheckCircle' },
                { title: 'Accepted Batches', href: '/accepted-batches', icon: 'ShieldCheck' },
            ];

        case 'Upload_Supervisor':
            return [
                ...common,
                { title: 'Vendor Management', href: '/vendors', icon: 'Briefcase' },
                { title: 'Sources', href: '/sources', icon: 'Database' },
                { title: 'Locations', href: '/locations', icon: 'MapPin' },
                { title: 'Record Owners', href: '/record-owners', icon: 'Building2' },
                { title: 'Record Types', href: '/record-types', icon: 'FileText' },
                { title: 'Vendor Allocation', href: '/vendor-allocation', icon: 'GitBranch' },
                { title: 'Upload History', href: '/upload-history', icon: 'Upload' },
                { title: 'QC History', href: '/qc-history', icon: 'CheckCircle' },
                { title: 'Accepted Batches', href: '/accepted-batches', icon: 'ShieldCheck' },
                { title: 'Audit Console', href: '/supervisor/image-preview', icon: 'Image' },
            ];

        case 'Vendor':
            return [
                ...common,
                { title: 'Operator Management', href: '/operators', icon: 'UserCog' },
                { title: 'Operator Allocation', href: '/operator-allocation', icon: 'GitBranch' },
                { title: 'Upload History', href: '/upload-history', icon: 'Upload' },
                { title: 'QC History', href: '/qc-history', icon: 'CheckCircle' },
                { title: 'Image Preview', href: '/vendor/image-preview', icon: 'Image' },
                { title: 'Re-upload Queue', href: '/reallocation', icon: 'RefreshCw' },
            ];

        case 'Scanning_Operator':
            return [
                ...common,
                { title: 'Create Batch', href: '/create-batch', icon: 'PlusCircle' },
                { title: 'Active Uploads', href: '/upload', icon: 'Upload' },
                { title: 'Re-upload Batches', href: '/re-upload', icon: 'RefreshCw' },
                { title: 'Upload History', href: '/upload-history', icon: 'History' },
                { title: 'Image Preview', href: '/image-preview', icon: 'Image' },
                { title: 'QC History', href: '/qc-history', icon: 'CheckCircle' },
            ];

        case 'QC_Supervisor':
            return [
                ...common,
                { title: 'QC Users', href: '/qc-users', icon: 'Users' },
                { title: 'Batch Allocation', href: '/batch-allocation', icon: 'GitBranch' },
                { title: 'Allocation History', href: '/allocation-history', icon: 'ClipboardList' },
                { title: 'QC Review', href: '/qc-review-queue', icon: 'CheckCircle' },
                { title: 'QC Master History', href: '/qc-history', icon: 'History' },
                { title: 'Accepted Batches', href: '/accepted-batches', icon: 'ShieldCheck' },
            ];

        case 'QC_User':
            return [
                ...common,
                { title: 'My Tasks', href: '/tasks', icon: 'ClipboardList' },
                { title: 'QC History', href: '/qc-history', icon: 'History' },
            ];

        default:
            return common;
    }
};
