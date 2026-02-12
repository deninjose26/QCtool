import React, { useState } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import { cn } from '@/lib/utils';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { WifiOff } from 'lucide-react';

const DashboardLayout: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth >= 1280);
  const { isOnline } = useNetworkStatus();

  React.useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) {
        setSidebarOpen(false);
      } else if (window.innerWidth >= 1280) {
        setSidebarOpen(true);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex flex-col h-screen w-full bg-background relative overflow-hidden">
      {/* GLOBAL NETWORK WARNING BANNER */}
      {!isOnline && (
        <div className="bg-amber-500 text-white px-4 py-2 flex items-center justify-center gap-3 z-[100] animate-in slide-in-from-top duration-300 shadow-lg border-b border-amber-600 font-bold uppercase tracking-widest text-[10px] sm:text-xs">
          <WifiOff className="h-4 w-4 animate-pulse" />
          <span>Connection Lost. Please check your internet connection.</span>
        </div>
      )}

      <div className="flex flex-1 w-full relative overflow-hidden">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        <div className={cn(
          "flex-1 flex flex-col min-w-0 transition-all duration-300 ease-in-out h-full overflow-hidden",
          sidebarOpen ? "ml-72" : "ml-20"
        )}>
          <TopBar onMenuClick={() => setSidebarOpen(!sidebarOpen)} />

          <main className="flex-1 p-4 lg:p-8 overflow-y-auto custom-scrollbar bg-[#F8FAFC]">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
};

export default DashboardLayout;
