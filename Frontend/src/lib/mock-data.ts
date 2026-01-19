import {
  User, Project, Source, Location, RecordOwner, RecordType,
  Vendor, VendorAllocation, ScanningOperator, Batch, UploadHistory,
  QCTask, QCImage, QCHistory, DashboardStat, UserRole
} from '@/types';

// Users
export const mockUsers: User[] = [
  { id: '1', name: 'Admin User', username: 'admin', email: 'admin@portal.gov', role: 'SuperAdmin' as UserRole, status: true, createdAt: '2024-01-01' },
  { id: '2', name: 'Upload Manager', username: 'supervisor', email: 'upload@portal.gov', role: 'Upload_Supervisor' as UserRole, status: true, createdAt: '2024-01-15' },
  { id: '3', name: 'Vendor Corp', username: 'vendor', email: 'vendor@corp.com', role: 'Vendor' as UserRole, status: true, createdAt: '2024-02-01' },
  { id: '4', name: 'Scanner John', username: 'john', email: 'john@scanner.com', role: 'Scanning_Operator' as UserRole, status: true, createdAt: '2024-02-15' },
  { id: '5', name: 'QC Manager', username: 'qc_manager', email: 'qcmanager@portal.gov', role: 'QC_Supervisor' as UserRole, status: true, createdAt: '2024-03-01' },
  { id: '6', name: 'QC Reviewer', username: 'qc_user', email: 'qcuser@portal.gov', role: 'QC_User' as UserRole, status: true, createdAt: '2024-03-15' },
];

// Projects
export const mockProjects: Project[] = [
  { id: '1', name: 'National Archives Digitization', code: 'NAD-001', status: 'active', createdAt: '2024-01-01' },
  { id: '2', name: 'Historical Records Project', code: 'HRP-001', status: 'active', createdAt: '2024-01-10' },
];

// Sources
export const mockSources: Source[] = [
  { id: '1', name: 'Central Library', code: 'CL-001', projectId: '1', projectName: 'National Archives Digitization', status: 'active' },
  { id: '2', name: 'State Archives', code: 'SA-001', projectId: '1', projectName: 'National Archives Digitization', status: 'active' },
  { id: '3', name: 'Historical Society', code: 'HS-001', projectId: '2', projectName: 'Historical Records Project', status: 'active' },
];

// Locations
export const mockLocations: Location[] = [
  { id: '1', code: 'LOC-001', name: 'Building A - Floor 1', sourceId: '1', sourceName: 'Central Library', projectId: '1', projectName: 'National Archives Digitization', status: 'active' },
  { id: '2', code: 'LOC-002', name: 'Building A - Floor 2', sourceId: '1', sourceName: 'Central Library', projectId: '1', projectName: 'National Archives Digitization', status: 'active' },
  { id: '3', code: 'LOC-003', name: 'Main Vault', sourceId: '2', sourceName: 'State Archives', projectId: '1', projectName: 'National Archives Digitization', status: 'active' },
];

// Record Owners
export const mockRecordOwners: RecordOwner[] = [
  { id: '1', code: 'RO-001', name: 'Department of Records', locationId: '1', locationName: 'Building A - Floor 1', sourceId: '1', sourceName: 'Central Library', projectId: '1', projectName: 'National Archives Digitization' },
  { id: '2', code: 'RO-002', name: 'Historical Division', locationId: '2', locationName: 'Building A - Floor 2', sourceId: '1', sourceName: 'Central Library', projectId: '1', projectName: 'National Archives Digitization' },
];

// Record Types
export const mockRecordTypes: RecordType[] = [
  { id: '1', name: 'Bahi', code: 'BAHI', recordOwnerId: '1', recordOwnerName: 'Dept', locationId: '1', locationName: 'Loc', sourceId: '1', sourceName: 'Src', projectId: '1', projectName: 'Proj' },
  { id: '2', name: 'Marriage', code: 'MARR', recordOwnerId: '1', recordOwnerName: 'Dept', locationId: '1', locationName: 'Loc', sourceId: '1', sourceName: 'Src', projectId: '1', projectName: 'Proj' },
  { id: '3', name: 'Baptism', code: 'BAPT', recordOwnerId: '1', recordOwnerName: 'Dept', locationId: '1', locationName: 'Loc', sourceId: '1', sourceName: 'Src', projectId: '1', projectName: 'Proj' },
  { id: '4', name: 'Death', code: 'DETH', recordOwnerId: '1', recordOwnerName: 'Dept', locationId: '1', locationName: 'Loc', sourceId: '1', sourceName: 'Src', projectId: '1', projectName: 'Proj' },
  { id: '5', name: 'Land', code: 'LAND', recordOwnerId: '1', recordOwnerName: 'Dept', locationId: '1', locationName: 'Loc', sourceId: '1', sourceName: 'Src', projectId: '1', projectName: 'Proj' },
];

// Vendors
export const mockVendors: Vendor[] = [
  { id: '1', name: 'DigiScan Solutions', code: 'DSS-001', email: 'contact@digiscan.com', phone: '+1-555-0100', status: 'active', createdAt: '2024-01-15' },
  { id: '2', name: 'Archive Pro Services', code: 'APS-001', email: 'info@archivepro.com', phone: '+1-555-0200', status: 'active', createdAt: '2024-02-01' },
];

// Vendor Allocations
export const mockVendorAllocations: VendorAllocation[] = [
  { id: '1', vendorId: '1', vendorName: 'DigiScan Solutions', projectId: '1', projectName: 'National Archives Digitization', sourceId: '1', sourceName: 'Central Library', locationId: '1', locationName: 'Building A - Floor 1', recordOwnerId: '1', recordOwnerName: 'Department of Records', allocatedAt: '2024-01-20' },
];

// Scanning Operators
export const mockScanningOperators: ScanningOperator[] = [
  { id: '1', name: 'John Smith', email: 'john@digiscan.com', vendorId: '1', vendorName: 'DigiScan Solutions', status: 'active', createdAt: '2024-01-20' },
  { id: '2', name: 'Jane Doe', email: 'jane@digiscan.com', vendorId: '1', vendorName: 'DigiScan Solutions', status: 'active', createdAt: '2024-01-22' },
];

// Batches
export const mockBatches: Batch[] = [
  { id: '1', batchCode: 'BATCH-001', sourceId: '1', sourceName: 'Central Library', locationId: '1', locationName: 'Building A - Floor 1', recordOwnerId: '1', recordOwnerName: 'Department of Records', recordTypeId: '1', recordTypeName: 'Bahi', uploadType: 'complete', uploadCount: 150, uploadedCount: 150, operatorId: '1', operatorName: 'John Smith', vendorId: '1', vendorName: 'DigiScan Solutions', status: 'approved', createdAt: '2024-02-01', uploadedAt: '2024-02-02' },
  { id: '2', batchCode: 'BATCH-002', sourceId: '1', sourceName: 'Central Library', locationId: '1', locationName: 'Building A - Floor 1', recordOwnerId: '1', recordOwnerName: 'Department of Records', recordTypeId: '2', recordTypeName: 'Marriage', uploadType: 'partial', totalCount: 200, uploadCount: 100, uploadedCount: 100, operatorId: '1', operatorName: 'John Smith', vendorId: '1', vendorName: 'DigiScan Solutions', status: 'qc_pending', createdAt: '2024-02-05', uploadedAt: '2024-02-06' },
  { id: '3', batchCode: 'BATCH-003', sourceId: '2', sourceName: 'State Archives', locationId: '3', locationName: 'Main Vault', recordOwnerId: '2', recordOwnerName: 'Historical Division', recordTypeId: '1', recordTypeName: 'Bahi', uploadType: 'complete', uploadCount: 75, uploadedCount: 0, operatorId: '2', operatorName: 'Jane Doe', vendorId: '1', vendorName: 'DigiScan Solutions', status: 'pending', createdAt: '2024-02-10' },
  { id: '4', batchCode: 'BATCH-004', sourceId: '1', sourceName: 'Central Library', locationId: '2', locationName: 'Building A - Floor 2', recordOwnerId: '1', recordOwnerName: 'Department of Records', recordTypeId: '3', recordTypeName: 'Baptism', uploadType: 'complete', uploadCount: 50, uploadedCount: 50, operatorId: '1', operatorName: 'John Smith', vendorId: '1', vendorName: 'DigiScan Solutions', status: 'rejected', createdAt: '2024-02-12', uploadedAt: '2024-02-13' },
];

// Upload History
export const mockUploadHistory: UploadHistory[] = [
  { id: '1', batchId: '1', batchCode: 'BATCH-001', imageCount: 150, uploadedBy: 'John Smith', uploadedAt: '2024-02-02T10:30:00', status: 'approved' },
  { id: '2', batchId: '2', batchCode: 'BATCH-002', imageCount: 100, uploadedBy: 'John Smith', uploadedAt: '2024-02-06T14:15:00', status: 'qc_pending' },
  { id: '3', batchId: '4', batchCode: 'BATCH-004', imageCount: 50, uploadedBy: 'John Smith', uploadedAt: '2024-02-13T09:00:00', status: 'rejected' },
];

// QC Tasks
export const mockQCTasks: QCTask[] = [
  { id: '1', batchId: '2', batchCode: 'BATCH-002', sourceName: 'Central Library', locationName: 'Building A - Floor 1', recordOwnerName: 'Department of Records', imageCount: 100, assignedTo: '6', assignedToName: 'QC Reviewer', status: 'pending', assignedAt: '2024-02-07' },
  { id: '2', batchId: '1', batchCode: 'BATCH-001', sourceName: 'Central Library', locationName: 'Building A - Floor 1', recordOwnerName: 'Department of Records', imageCount: 150, assignedTo: '6', assignedToName: 'QC Reviewer', status: 'completed', assignedAt: '2024-02-03', completedAt: '2024-02-04' },
];

// QC Images
export const mockQCImages: QCImage[] = Array.from({ length: 20 }, (_, i) => ({
  id: `img-${i + 1}`,
  batchId: '2',
  imageUrl: `https://picsum.photos/seed/${i + 1}/800/600`,
  imageName: `IMG_${String(i + 1).padStart(4, '0')}.jpg`,
  sequence: i + 1,
  qcStatus: i < 15 ? 'pending' : (i < 18 ? 'accepted' : 'rejected') as any,
  rejectionReason: i >= 18 ? 'Poor Quality' : undefined,
  rejectionNote: i >= 18 ? 'Image is blurry and unreadable' : undefined,
  qcBy: i >= 15 ? '6' : undefined,
  qcAt: i >= 15 ? '2024-02-04T16:30:00' : undefined,
}));

// QC History
export const mockQCHistory: QCHistory[] = [
  { id: '1', batchId: '1', batchCode: 'BATCH-001', totalImages: 150, acceptedCount: 148, rejectedCount: 2, qcBy: '6', qcByName: 'QC Reviewer', completedAt: '2024-02-04T16:30:00' },
];

// Dashboard Stats per Role
export const getDashboardStats = (role: string): DashboardStat[] => {
  switch (role) {
    case 'SuperAdmin':
      return [
        { title: 'Total Projects', value: 3, icon: 'FolderKanban' },
        { title: 'Active Sources', value: 3, icon: 'Database' },
        { title: 'Locations', value: 3, icon: 'MapPin' },
        { title: 'Record Owners', value: 2, icon: 'Building2' },
        { title: 'Upload Statistics', value: '350', change: '+12%', changeType: 'positive', icon: 'Upload' },
        { title: 'QC Statistics', value: '298', change: '+8%', changeType: 'positive', icon: 'CheckCircle' },
      ];
    case 'Upload_Supervisor':
      return [
        { title: 'Total Vendors', value: 2, icon: 'Users' },
        { title: 'Active Allocations', value: 1, icon: 'GitBranch' },
        { title: 'Upload Status', value: '85%', change: '+5%', changeType: 'positive', icon: 'Upload' },
        { title: 'QC Status', value: '92%', change: '+3%', changeType: 'positive', icon: 'CheckCircle' },
      ];
    case 'Vendor':
      return [
        { title: 'Operators', value: 2, icon: 'UserCog' },
        { title: 'Active Batches', value: 3, icon: 'Layers' },
        { title: 'Rejected Batches', value: 1, icon: 'XCircle' },
      ];
    case 'Scanning_Operator':
      return [
        { title: 'Active Batches', value: 2, icon: 'Layers' },
        { title: 'Completed Uploads', value: 3, icon: 'CheckCircle' },
        { title: 'Rejected Uploads', value: 1, icon: 'XCircle' },
      ];
    case 'QC_Supervisor':
      return [
        { title: 'Pending QC', value: 5, icon: 'Clock' },
        { title: 'Assigned QC Users', value: 3, icon: 'Users' },
        { title: 'Rejected Images', value: 12, icon: 'XCircle' },
      ];
    case 'QC_User':
      return [
        { title: 'Assigned Tasks', value: 3, icon: 'ClipboardList' },
        { title: 'Completed Tasks', value: 8, icon: 'CheckCircle' },
      ];
    default:
      return [];
  }
};

// Rejection Reasons
export const rejectionReasons = [
  'Poor Quality',
  'Blurry Image',
  'Incomplete Scan',
  'Wrong Orientation',
  'Missing Pages',
  'Overexposed',
  'Underexposed',
  'Cropped Incorrectly',
  'Other',
];
