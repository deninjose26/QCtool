import React from 'react';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import defaultAvatar from '@/assets/default-avatar.png';
import { Badge } from '@/components/ui/badge';
import { Bell, LogOut, Settings, User, Menu, Clock, Calendar } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { roleLabels } from '@/lib/role-config';
import { useNavigate } from 'react-router-dom';
import NotificationBell from './NotificationBell';
import SyncQueueBadge from '../common/SyncQueueBadge';
import PWAInstallButton from '../common/PWAInstallButton';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { cn } from '@/lib/utils';

const LiveClock: React.FC = () => {
    const [time, setTime] = React.useState(new Date());

    React.useEffect(() => {
        const timer = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    return (
        <span className="text-sm font-bold font-mono">
            {time.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </span>
    );
};

interface TopBarProps {
    onMenuClick?: () => void;
}

const TopBar: React.FC<TopBarProps> = ({ onMenuClick }) => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const { isOnline } = useNetworkStatus();

    const handleLogout = () => {
        logout();
    };

    const getInitials = (name: string) => {
        return name
            .split(' ')
            .map((n) => n[0])
            .join('')
            .toUpperCase()
            .slice(0, 2);
    };

    return (
        <header className="h-16 border-b bg-card px-4 lg:px-6 flex items-center justify-between sticky top-0 z-40">
            <div className="flex items-center gap-4">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={onMenuClick}
                    className="hover:bg-sidebar-accent transition-colors"
                >
                    <Menu className="h-5 w-5" />
                </Button>
                <Badge variant="outline" className="hidden lg:flex bg-primary/5 text-primary border-primary/20 font-bold px-3 py-1 rounded-md text-[10px] uppercase tracking-wider animate-in fade-in slide-in-from-left-2 duration-500">
                    {user ? roleLabels[user.role] : 'Guest'} Panel
                </Badge>
            </div>

            <div className="flex items-center gap-2 sm:gap-6">
                {/* System Health & Time Cluster */}
                <div className="flex items-center bg-muted/30 px-2 sm:px-3 lg:px-4 py-1.5 rounded-full border border-border/50 gap-2 sm:gap-3 lg:gap-6">
                    {/* Status */}
                    <div className="flex items-center gap-1.5 sm:gap-2 lg:gap-3">
                        <div className="relative flex h-2 w-2 sm:h-2.5 sm:w-2.5">
                            <span className={cn(
                                "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
                                isOnline ? "bg-emerald-400" : "bg-rose-400"
                            )}></span>
                            <span className={cn(
                                "relative inline-flex rounded-full h-2 w-2 sm:h-2.5 sm:w-2.5",
                                isOnline ? "bg-emerald-500" : "bg-rose-500"
                            )}></span>
                        </div>
                        <div className="flex flex-col leading-none">
                            <span className="text-[8px] sm:text-[9px] uppercase font-heavy text-muted-foreground tracking-tighter hidden xl:block">System</span>
                            <span className={cn(
                                "text-[10px] sm:text-xs font-bold whitespace-nowrap",
                                isOnline ? "text-foreground" : "text-rose-600"
                            )}>
                                {isOnline ? 'Secure' : 'Offline'}
                            </span>
                        </div>
                    </div>

                    <div className="w-px h-6 bg-border/60" />

                    {/* Date & Time */}
                    <div className="flex items-center gap-2 sm:gap-4">
                        <div className="flex items-center gap-2 text-primary">
                            <Calendar className="h-3.5 w-3.5 opacity-70" />
                            <span className="text-[10px] sm:text-xs font-bold whitespace-nowrap">
                                {new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                            </span>
                        </div>
                        <div className="flex items-center gap-1.5 sm:gap-2 text-primary border-l border-border/60 pl-2 lg:pl-4">
                            <Clock className="h-3 sm:h-3.5 w-3 sm:w-3.5 opacity-70" />
                            <LiveClock />
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2 sm:gap-3 border-l pl-2 sm:pl-6 border-border/50">
                    <PWAInstallButton />
                    <SyncQueueBadge />
                    <NotificationBell />

                    {/* User Menu */}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="flex items-center gap-2 px-1 sm:px-2 h-8 sm:h-10">
                                <Avatar className="h-6 w-6 sm:h-8 sm:w-8">
                                    <AvatarImage src={user?.avatar || defaultAvatar} />
                                    <AvatarFallback className="bg-primary text-primary-foreground text-[10px] sm:text-sm">
                                        {user ? getInitials(user.name) : 'U'}
                                    </AvatarFallback>
                                </Avatar>
                                <div className="hidden lg:block text-left">
                                    <p className="text-[10px] sm:text-sm font-medium leading-tight">{user?.name}</p>
                                    <p className="text-[8px] sm:text-xs text-muted-foreground leading-tight">
                                        {user ? roleLabels[user.role] : ''}
                                    </p>
                                </div>
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuLabel>My Account</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="cursor-pointer" onClick={() => navigate('/profile')}>
                                <User className="mr-2 h-4 w-4" />
                                Profile
                            </DropdownMenuItem>
                            <DropdownMenuItem className="cursor-pointer" onClick={() => navigate('/settings')}>
                                <Settings className="mr-2 h-4 w-4" />
                                Settings
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                                className="cursor-pointer text-destructive focus:text-destructive"
                                onClick={handleLogout}
                            >
                                <LogOut className="mr-2 h-4 w-4" />
                                Logout
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>
        </header>
    );
};

export default TopBar;
