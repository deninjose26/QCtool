import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import SuperAdminDashboard from './admin/Dashboard';
import UploadSupervisorDashboard from './upload-supervisor/Dashboard';
import VendorDashboard from './vendor/Dashboard';
import ScanningOperatorDashboard from './S_operator/Dashboard';
import QCSupervisorDashboard from './qc-supervisor/Dashboard';
import QCUserDashboard from './qc-user/Dashboard';

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const role = user?.role || 'SuperAdmin';

  switch (role) {
    case 'SuperAdmin':
      return <SuperAdminDashboard />;
    case 'Upload_Supervisor':
      return <UploadSupervisorDashboard />;
    case 'Vendor':
      return <VendorDashboard />;
    case 'Scanning_Operator':
      return <ScanningOperatorDashboard />;
    case 'QC_Supervisor':
      return <QCSupervisorDashboard />;
    case 'QC_User':
      return <QCUserDashboard />;
    default:
      return <SuperAdminDashboard />;
  }
};

export default Dashboard;
