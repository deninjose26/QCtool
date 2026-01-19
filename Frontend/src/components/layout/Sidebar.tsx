import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { getNavItems, roleLabels } from '@/lib/role-config';
import {
  Shield, Circle, LayoutDashboard, FolderKanban, Database, MapPin,
  Building2, FileText, Users, Upload, CheckCircle, Briefcase, GitBranch,
  UserCog, History, Image, RefreshCw, PlusCircle, ClipboardList
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import logo from '@/assets/logo.png';

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
  Circle,
};

const Sidebar: React.FC<SidebarProps> = ({ open, onClose }) => {
  const { user } = useAuth();
  const location = useLocation();
  const navItems = user ? getNavItems(user.role) : [];

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
        <div className={cn("px-4 py-4 border-b border-sidebar-border overflow-hidden", !open && "px-2")}>
          <div className={cn("flex items-center gap-3", !open && "justify-center")}>
            <div className="h-10 w-10 rounded-full bg-sidebar-accent flex-shrink-0 flex items-center justify-center">
              <span className="text-sidebar-accent-foreground font-semibold">
                {user?.name.charAt(0)}
              </span>
            </div>
            {open && (
              <div className="flex-1 min-w-0 transition-all duration-300">
                <p className="text-base font-medium text-sidebar-foreground truncate">
                  {user?.name}
                </p>
                <p className="text-xs text-sidebar-foreground/60 truncate">
                  {user ? roleLabels[user.role] : ''}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 overflow-x-hidden">
          <ul className="space-y-1">
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
                          'flex items-center gap-3 px-3 py-2.5 rounded-lg text-base font-medium transition-all group',
                          'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                          isActive
                            ? 'bg-sidebar-accent text-sidebar-primary'
                            : 'text-sidebar-foreground/80',
                          !open && "justify-center px-0 h-10 w-10 mx-auto"
                        )}
                      >
                        <IconComponent className={cn("h-5 w-5 flex-shrink-0 transition-all", isActive ? "text-sidebar-primary" : "group-hover:text-sidebar-accent-foreground")} />
                        {open && <span className="truncate">{item.title}</span>}
                        {open && item.badge && (
                          <span className="ml-auto bg-sidebar-primary text-sidebar-primary-foreground text-xs px-2 py-0.5 rounded-full">
                            {item.badge}
                          </span>
                        )}
                      </NavLink>
                    </TooltipTrigger>
                    {!open && (
                      <TooltipContent side="right" className="font-medium">
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
