import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { getNavItems, roleLabels } from '@/lib/role-config';
import {
  Shield, Circle, LayoutDashboard, FolderKanban, Database, MapPin,
  Building2, FileText, Users, Upload, CheckCircle, Briefcase, GitBranch,
  UserCog, History, Image, RefreshCw, PlusCircle, ClipboardList, ShieldCheck, FileStack
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import defaultAvatar from '@/assets/default-avatar.png';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import logo from '@/assets/logo.png';
import { API_BASE_URL } from '@/config';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard,
  FolderKanban,
  Database,
  MapPin,
  Building2,
  FileText,
  Users,
  Upload,
  CheckCircle,
  Briefcase,
  GitBranch,
  UserCog,
  History,
  Image,
  RefreshCw,
  PlusCircle,
  ClipboardList,
  Shield,
  ShieldCheck,
  Circle,
  FileStack,
};

const Sidebar: React.FC<SidebarProps> = ({ open, onClose }) => {
  const { user, apiFetch } = useAuth();
  const location = useLocation();
  const [auditLogsEnabled, setAuditLogsEnabled] = useState(false);

  // Fetch audit logs setting for SuperAdmin
  useEffect(() => {
    const fetchAuditLogsSetting = async () => {
      if (user?.role === 'SuperAdmin') {
        try {
          const res = await apiFetch(`${API_BASE_URL}/admin/settings/enable_audit_logs`);
          if (res.ok) {
            const data = await res.json();
            setAuditLogsEnabled(data.setting_value === 'true');
          }
        } catch (error) {
          console.error('Failed to fetch audit logs setting:', error);
        }
      }
    };

    fetchAuditLogsSetting();

    // Listen for setting changes from other components
    window.addEventListener('settings-updated', fetchAuditLogsSetting);
    return () => window.removeEventListener('settings-updated', fetchAuditLogsSetting);
  }, [user?.role, apiFetch]);

  // Get base nav items and conditionally add Audit Logs
  let navItems = user ? getNavItems(user.role) : [];

  // Add Audit Logs to SuperAdmin menu if enabled
  if (user?.role === 'SuperAdmin' && auditLogsEnabled) {
    navItems = [
      ...navItems,
      { title: 'Audit Logs', href: '/audit-logs', icon: 'FileStack' }
    ];
  }

  return (
    <>
      {/* No overlay needed as sidebar is always visible in rail mode */}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed top-0 left-0 z-50 h-screen bg-sidebar flex flex-col transition-all duration-300 ease-in-out border-r border-sidebar-border shadow-sm',
          open ? 'w-72' : 'w-20'
        )}
      >
        {/* Header */}
        <div className={cn(
          "h-16 flex items-center px-4 border-b border-sidebar-border transition-all duration-300",
          open ? "justify-between" : "justify-center"
        )}>
          <div className={cn("flex items-center justify-center overflow-hidden transition-all duration-300", open ? "w-full" : "w-10")}>
            <img
              src={open ? logo : "/favicon.ico"}
              alt="Logo"
              className={cn("h-14 w-auto object-contain transition-all duration-300", open ? "min-w-[56px]" : "h-10")}
            />
          </div>
        </div>

        {/* User Info */}
        <div className={cn("px-4 py-6 border-b border-sidebar-border overflow-hidden bg-sidebar/50", !open && "px-2 py-4")}>
          <div className={cn("flex items-center gap-4", !open && "justify-center")}>
            <Avatar className={cn("border-2 border-white/10 shadow-sm", open ? "h-12 w-12" : "h-10 w-10")}>
              <AvatarImage src={user?.avatar || defaultAvatar} className="object-cover" />
              <AvatarFallback className="bg-sidebar-accent text-sidebar-accent-foreground font-bold">
                {user?.name.charAt(0)}
              </AvatarFallback>
            </Avatar>
            {open && (
              <div className="flex-1 min-w-0 transition-all duration-300">
                <p className="text-sm font-bold text-white uppercase tracking-wider truncate">
                  {user?.name}
                </p>
                <p className="text-xs text-sidebar-foreground/60 truncate font-medium">
                  {user ? roleLabels[user.role] : ''}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-6 px-3 overflow-x-hidden custom-scrollbar">
          <ul className="space-y-1.5">
            {navItems.map((item) => {
              const IconComponent = iconMap[item.icon] || Circle;
              const isActive = location.pathname === item.href;

              return (
                <li key={item.href}>
                  <Tooltip delayDuration={0}>
                    <TooltipTrigger asChild>
                      <NavLink
                        to={item.href}
                        className={cn(
                          'flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-semibold transition-all group relative overflow-hidden',
                          isActive
                            ? 'bg-primary/20 text-blue-400 shadow-sm'
                            : 'text-gray-400 hover:bg-white/5 hover:text-white',
                          !open && "justify-center px-0 h-10 w-10 mx-auto"
                        )}
                      >
                        {isActive && (
                          <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500 rounded-r-full" />
                        )}
                        <IconComponent className={cn("h-5 w-5 flex-shrink-0 transition-all", isActive ? "text-blue-400" : "text-gray-400 group-hover:text-white")} />
                        {open && <span className="truncate tracking-wide">{item.title}</span>}
                        {open && item.badge && (
                          <span className="ml-auto bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm">
                            {item.badge}
                          </span>
                        )}
                      </NavLink>
                    </TooltipTrigger>
                    {!open && (
                      <TooltipContent side="right" className="font-medium bg-sidebar text-white border-sidebar-border">
                        {item.title}
                      </TooltipContent>
                    )}
                  </Tooltip>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Footer */}
        <div className={cn("p-4 border-t border-sidebar-border overflow-hidden", !open && "px-2 text-center")}>
          {open ? (
            <p className="text-xs text-sidebar-foreground/50 text-center">
              © {new Date().getFullYear()} All Rights Reserved familyaConnect.com
            </p>
          ) : (
            <p className="text-[10px] text-sidebar-foreground/50 font-bold">FC</p>
          )}
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
