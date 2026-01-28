import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";

// Pages
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Settings from "./pages/Settings";
import Profile from "./pages/Profile";
import NotFound from "./pages/NotFound";
import Notifications from "./pages/common/Notifications";
import Documentation from "./pages/Documentation";

// Admin Pages
import Projects from "./pages/admin/Projects";
import Sources from "./pages/admin/Sources";
import Locations from "./pages/admin/Locations";
import RecordOwners from "./pages/admin/RecordOwners";
import RecordTypes from "./pages/admin/AdminRecordTypes";
import Users from "./pages/admin/Users";
import AdminUploadHistory from "./pages/admin/UploadHistory";
import AdminQCHistory from "./pages/admin/QCHistory";

// Upload Supervisor Pages
import Vendors from "@/pages/upload-supervisor/Vendors";
import VendorAllocation from "@/pages/upload-supervisor/VendorAllocation";
import SupervisorUploadHistory from "@/pages/upload-supervisor/UploadHistory";
import SupervisorSources from "@/pages/upload-supervisor/Sources";
import SupervisorLocations from "@/pages/upload-supervisor/Locations";
import SupervisorRecordOwners from "@/pages/upload-supervisor/RecordOwners";
import SupervisorRecordTypes from "@/pages/upload-supervisor/RecordTypes";
import SupervisorImagePreview from "@/pages/upload-supervisor/ImagePreview";

// Vendor Pages
import Operators from "./pages/vendor/Operators";
import VendorUploadHistory from "./pages/vendor/UploadHistory";
import VendorImagePreview from "./pages/vendor/ImagePreview";
import OperatorAllocation from "./pages/vendor/OperatorAllocation";
import ReworkBatches from "./pages/vendor/ReworkBatches";
import VendorQCHistory from "./pages/vendor/QCHistory";

// Operator Pages
import CreateBatch from "./pages/S_operator/CreateBatch";
import Upload from "./pages/S_operator/Upload";
import ReuploadBatches from "./pages/S_operator/ReuploadBatches";
import OperatorUploadHistory from "./pages/S_operator/UploadHistory";
import OperatorImagePreview from "./pages/S_operator/ImagePreview";
import OperatorQCHistory from "./pages/S_operator/QCHistory";

// QC Pages
import QCTasks from "./pages/qc-user/Tasks";
import QCPanel from "./pages/qc-user/Viewer";
import QCUserHistory from "./pages/qc-user/History";
import QCUsers from "./pages/qc-supervisor/Users";
import BatchAllocation from "./pages/qc-supervisor/BatchAllocation";
import QCSupervisorHistory from "./pages/qc-supervisor/History";
import QCReviewQueue from "./pages/qc-supervisor/ReviewQueue";
import AllocationHistory from "./pages/qc-supervisor/AllocationHistory";
import QCReview from "./pages/qc-supervisor/QCReview";

// Layout
import DashboardLayout from "./components/layout/DashboardLayout";

const queryClient = new QueryClient();

const AppRoutes = () => {
  const { user } = useAuth();

  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/documentation" element={<Documentation />} />

      {/* Protected Routes */}
      <Route element={<DashboardLayout />}>
        <Route path="/dashboard" element={<Dashboard />} />

        {/* Shared Management Routes (Conditional Based on Role) */}
        <Route path="/projects" element={
          user?.role === 'SuperAdmin' ? <Projects /> : <Dashboard /> // Projects is mostly admin
        } />
        <Route path="/sources" element={
          user?.role === 'SuperAdmin' ? <Sources /> : <SupervisorSources />
        } />
        <Route path="/locations" element={
          user?.role === 'SuperAdmin' ? <Locations /> : <SupervisorLocations />
        } />
        <Route path="/record-owners" element={
          user?.role === 'SuperAdmin' ? <RecordOwners /> : <SupervisorRecordOwners />
        } />
        <Route path="/record-types" element={
          user?.role === 'SuperAdmin' ? <RecordTypes /> : <SupervisorRecordTypes />
        } />
        <Route path="/users" element={<Users />} />

        {/* Supervisor Specific Routes */}
        <Route path="/vendors" element={<Vendors />} />
        <Route path="/vendor-allocation" element={<VendorAllocation />} />

        {/* Vendor Routes */}
        <Route path="/operators" element={<Operators />} />
        <Route path="/operator-allocation" element={<OperatorAllocation />} />
        <Route path="/reallocation" element={<ReworkBatches />} />

        {/* Operator Routes */}
        <Route path="/create-batch" element={<CreateBatch />} />
        <Route path="/upload" element={<Upload />} />
        <Route path="/re-upload" element={<ReuploadBatches />} />

        {/* QC Routes */}
        <Route path="/tasks" element={<QCTasks />} />
        <Route path="/qc/:batchId" element={<QCPanel />} />
        <Route path="/qc-users" element={<QCUsers />} />
        <Route path="/batch-allocation" element={<BatchAllocation />} />
        <Route path="/allocation-history" element={<AllocationHistory />} />
        <Route path="/qc-review/:batchId" element={<QCReview />} />
        <Route path="/qc-review-queue" element={<QCReviewQueue />} />
        <Route path="/second-level-qc" element={<QCUserHistory />} />

        {/* Dedicated Role-based Routes */}
        <Route path="/upload-history" element={
          user?.role === 'SuperAdmin' ? <AdminUploadHistory /> :
            user?.role === 'Upload_Supervisor' ? <SupervisorUploadHistory /> :
              user?.role === 'Vendor' ? <VendorUploadHistory /> :
                <OperatorUploadHistory />
        } />

        <Route path="/qc-history" element={
          (user?.role === 'SuperAdmin' || user?.role === 'Upload_Supervisor') ? <AdminQCHistory /> :
            user?.role === 'QC_Supervisor' ? <QCSupervisorHistory /> :
              user?.role === 'Vendor' ? <VendorQCHistory /> :
                user?.role === 'Scanning_Operator' ? <OperatorQCHistory /> : <QCUserHistory />
        } />

        <Route path="/vendor/image-preview/:batchUid?" element={<VendorImagePreview />} />

        <Route path="/supervisor/image-preview/:batchUid?" element={<SupervisorImagePreview />} />

        <Route path="/image-preview/:batchUid?" element={
          user?.role === 'Scanning_Operator' ? <OperatorImagePreview /> : <VendorImagePreview />
        } />

        <Route path="/settings" element={<Settings />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/notifications" element={<Notifications />} />
      </Route>

      {/* 404 */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
