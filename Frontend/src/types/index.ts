// User Roles
export type UserRole =
  | 'SuperAdmin'
  | 'Upload_Supervisor'
  | 'Vendor'
  | 'Scanning_Operator'
  | 'QC_Supervisor'
  | 'QC_User';

export interface User {
  id: string;
  name: string;
  username: string;
  email: string;
  role: UserRole;
  avatar?: string;
  createdBy?: string;
  createdAt: string;
  status: boolean;
  profile_picture_path?: string;
}

// Project & Source Management
export interface Project {
  id: string;
  name: string;
  code: string;
  description?: string;
  status: 'active' | 'inactive';
  createdBy?: string;
  createdAt: string;
}

export interface Source {
  id: string;
  name: string;
  code: string;
  projectId: string;
  projectName: string;
  status: 'active' | 'inactive';
  createdBy?: string;
  createdAt?: string;
}

export interface Location {
  id: string;
  code: string;
  name: string;
  sourceId: string;
  sourceName: string;
  projectId: string;
  projectName: string;
  status: 'active' | 'inactive';
  createdBy?: string;
  createdAt?: string;
}

export interface RecordOwner {
  id: string;
  code: string;
  name: string;
  locationId: string;
  locationName: string;
  sourceId: string;
  sourceName: string;
  projectId: string;
  projectName: string;
  createdBy?: string;
  createdAt?: string;
}

export interface RecordType {
  id: string;
  name: string;
  code: string;
  recordOwnerId: string;
  recordOwnerName: string;
  locationId: string;
  locationName: string;
  sourceId: string;
  sourceName: string;
  projectId: string;
  projectName: string;
  description?: string;
  createdBy?: string;
  createdAt?: string;
}

// Vendor & Operator
export interface Vendor {
  id: string;
  name: string;
  code: string;
  email: string;
  phone?: string;
  status: 'active' | 'inactive';
  createdAt: string;
}

export interface VendorAllocation {
  id: string;
  vendorId: string;
  vendorName: string;
  projectId: string;
  projectName: string;
  sourceId: string;
  sourceName: string;
  locationId: string;
  locationName: string;
  recordOwnerId: string;
  recordOwnerName: string;
  allocatedAt: string;
}

export interface ScanningOperator {
  id: string;
  name: string;
  email: string;
  vendorId: string;
  vendorName: string;
  status: 'active' | 'inactive';
  createdAt: string;
}

// Batch & Upload
export type UploadType = 'complete' | 'partial' | 're-upload';
export type BatchStatus = 'pending' | 'uploaded' | 'qc_pending' | 'qc_in_progress' | 'approved' | 'rejected';

export interface Batch {
  id: string;
  batchCode: string;
  sourceId: string;
  sourceName: string;
  locationId: string;
  locationName: string;
  recordOwnerId: string;
  recordOwnerName: string;
  recordTypeId: string;
  recordTypeName: string;
  uploadType: UploadType;
  totalCount?: number;
  uploadCount: number;
  uploadedCount: number;
  operatorId: string;
  operatorName: string;
  vendorId: string;
  vendorName: string;
  status: BatchStatus;
  createdAt: string;
  uploadedAt?: string;
}

export interface UploadHistory {
  id: string;
  batchId: string;
  batchCode: string;
  imageCount: number;
  uploadedBy: string;
  uploadedAt: string;
  status: BatchStatus;
}

// QC
export type QCStatus = 'pending' | 'accepted' | 'rejected';

export interface QCTask {
  id: string;
  batchId: string;
  batchCode: string;
  sourceName: string;
  locationName: string;
  recordOwnerName: string;
  imageCount: number;
  assignedTo: string;
  assignedToName: string;
  status: 'pending' | 'in_progress' | 'completed';
  assignedAt: string;
  completedAt?: string;
}

export interface QCImage {
  id: string;
  batchId: string;
  imageUrl: string;
  imageName: string;
  sequence: number;
  qcStatus: QCStatus;
  rejectionReason?: string;
  rejectionNote?: string;
  qcBy?: string;
  qcAt?: string;
}

export interface QCHistory {
  id: string;
  batchId: string;
  batchCode: string;
  totalImages: number;
  acceptedCount: number;
  rejectedCount: number;
  qcBy: string;
  qcByName: string;
  completedAt: string;
}

// Dashboard Stats
export interface DashboardStat {
  title: string;
  value: string | number;
  change?: string;
  changeType?: 'positive' | 'negative' | 'neutral';
  icon: string;
}

// Navigation
export interface NavItem {
  title: string;
  href: string;
  icon: string;
  badge?: number;
  children?: NavItem[];
}

export interface RoleConfig {
  role: UserRole;
  label: string;
  navItems: NavItem[];
  dashboardStats: string[];
}
