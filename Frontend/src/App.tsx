import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";

// Pages
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import NotFound from "./pages/NotFound";

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

// Vendor Pages
import Operators from "./pages/vendor/Operators";
import VendorUploadHistory from "./pages/vendor/UploadHistory";
import VendorImagePreview from "./pages/vendor/ImagePreview";
import OperatorAllocation from "./pages/vendor/OperatorAllocation";

// Operator Pages
import CreateBatch from "@/pages/S_operator/CreateBatch";
import Upload from "@/pages/S_operator/Upload";
import OperatorUploadHistory from "@/pages/S_operator/UploadHistory";

// QC Pages
import QCTasks from "./pages/qc-user/Tasks";
import QCPanel from "./pages/qc-user/Viewer";
import QCUserHistory from "./pages/qc-user/History";
import QCUsers from "./pages/qc-supervisor/Users";

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
        <Route path="/reallocation" element={<VendorUploadHistory />} />

        {/* Operator Routes */}
        <Route path="/create-batch" element={<CreateBatch />} />
        <Route path="/upload" element={<Upload />} />

        {/* QC Routes */}
        <Route path="/tasks" element={<QCTasks />} />
        <Route path="/qc/:batchId" element={<QCPanel />} />
        <Route path="/qc-users" element={<QCUsers />} />
        <Route path="/batch-allocation" element={<QCTasks />} />
        <Route path="/second-level-qc" element={<QCUserHistory />} />

        {/* Dedicated Role-based Routes */}
        <Route path="/upload-history" element={
          user?.role === 'SuperAdmin' ? <AdminUploadHistory /> :
            user?.role === 'Upload_Supervisor' ? <SupervisorUploadHistory /> :
              user?.role === 'Vendor' ? <VendorUploadHistory /> :
                <OperatorUploadHistory />
        } />

        <Route path="/qc-history" element={
          user?.role === 'SuperAdmin' ? <AdminQCHistory /> : <QCUserHistory />
        } />

        <Route path="/image-preview" element={<VendorImagePreview />} />
      </Route>

      {/* 404 */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
