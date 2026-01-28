import React, { useState, useEffect } from 'react';
import { Bell, Check, CheckCheck, Filter, ExternalLink, Loader2, Trash2, Clock, TrendingUp, Archive } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { API_BASE_URL } from '@/config';
import { formatDistanceToNow, format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import PageHeader from '@/components/common/PageHeader';
import { cn } from '@/lib/utils';

interface Notification {
    notification_id: string;
    type: string;
    title: string;
    message: string;
    link?: string;
    is_read: boolean;
    created_date: string;
}

const NotificationsPage: React.FC = () => {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'unread' | 'read'>('all');
    const [markingAll, setMarkingAll] = useState(false);
    const { apiFetch, isAuthenticated } = useAuth();
    const navigate = useNavigate();

    const fetchNotifications = async () => {
        if (!isAuthenticated) return;
        setLoading(true);
        try {
            const res = await apiFetch(`${API_BASE_URL}/notifications/?limit=100`);
            if (res.ok) {
                const data = await res.json();
                setNotifications(data);
            }
        } catch (error) {
            console.error('Failed to fetch notifications:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchNotifications();
    }, [isAuthenticated]);

    const markAsRead = async (id: string, link?: string) => {
        try {
            await apiFetch(`${API_BASE_URL}/notifications/${id}/read`, {
                method: 'PATCH',
            });

            setNotifications(prev =>
                prev.map(n => (n.notification_id === id ? { ...n, is_read: true } : n))
            );

            if (link) {
                navigate(link);
            }
        } catch (error) {
            console.error('Failed to mark as read:', error);
        }
    };

    const markAllAsRead = async () => {
        setMarkingAll(true);
        try {
            await apiFetch(`${API_BASE_URL}/notifications/read-all`, {
                method: 'PATCH',
            });
            setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
        } catch (error) {
            console.error('Failed to mark all as read:', error);
        } finally {
            setMarkingAll(false);
        }
    };

    const filteredNotifications = notifications.filter(n => {
        if (filter === 'unread') return !n.is_read;
        if (filter === 'read') return n.is_read;
        return true;
    });

    const unreadCount = notifications.filter(n => !n.is_read).length;
    const readCount = notifications.filter(n => n.is_read).length;

    const getNotificationStyle = (type: string) => {
        switch (type.toLowerCase()) {
            case 'batch_uploaded':
                return {
                    gradient: 'from-green-500/10 to-emerald-500/5',
                    border: 'border-green-200',
                    icon: 'bg-green-100 text-green-600',
                    badge: 'bg-green-500',
                };
            case 'qc_assigned':
                return {
                    gradient: 'from-blue-500/10 to-cyan-500/5',
                    border: 'border-blue-200',
                    icon: 'bg-blue-100 text-blue-600',
                    badge: 'bg-blue-500',
                };
            case 'batch_rejected':
                return {
                    gradient: 'from-red-500/10 to-rose-500/5',
                    border: 'border-red-200',
                    icon: 'bg-red-100 text-red-600',
                    badge: 'bg-red-500',
                };
            case 'conversion_complete':
                return {
                    gradient: 'from-purple-500/10 to-violet-500/5',
                    border: 'border-purple-200',
                    icon: 'bg-purple-100 text-purple-600',
                    badge: 'bg-purple-500',
                };
            default:
                return {
                    gradient: 'from-gray-500/10 to-slate-500/5',
                    border: 'border-gray-200',
                    icon: 'bg-gray-100 text-gray-600',
                    badge: 'bg-gray-500',
                };
        }
    };

    const getNotificationIcon = (type: string) => {
        const style = getNotificationStyle(type);
        return (
            <div className={cn("h-12 w-12 rounded-xl flex items-center justify-center shadow-sm", style.icon)}>
                <Bell className="h-6 w-6" />
            </div>
        );
    };

    return (
        <div className="space-y-6 animate-fade-in">
            <PageHeader
                title="Notifications"
                description="Stay updated with your workflow activities"
            />

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="border-2 hover:shadow-lg transition-all cursor-pointer" onClick={() => setFilter('all')}>
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">Total</p>
                                <p className="text-3xl font-bold mt-1">{notifications.length}</p>
                            </div>
                            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                                <Bell className="h-6 w-6 text-primary" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-2 hover:shadow-lg transition-all cursor-pointer border-orange-200 bg-gradient-to-br from-orange-50 to-white" onClick={() => setFilter('unread')}>
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-orange-600">Unread</p>
                                <p className="text-3xl font-bold mt-1 text-orange-600">{unreadCount}</p>
                            </div>
                            <div className="h-12 w-12 rounded-xl bg-orange-100 flex items-center justify-center">
                                <TrendingUp className="h-6 w-6 text-orange-600" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-2 hover:shadow-lg transition-all cursor-pointer border-green-200 bg-gradient-to-br from-green-50 to-white" onClick={() => setFilter('read')}>
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-green-600">Read</p>
                                <p className="text-3xl font-bold mt-1 text-green-600">{readCount}</p>
                            </div>
                            <div className="h-12 w-12 rounded-xl bg-green-100 flex items-center justify-center">
                                <Archive className="h-6 w-6 text-green-600" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Filters and Actions */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-card p-4 rounded-xl border shadow-sm">
                <div className="flex items-center gap-4">
                    <Select value={filter} onValueChange={(value: any) => setFilter(value)}>
                        <SelectTrigger className="w-[180px]">
                            <Filter className="h-4 w-4 mr-2" />
                            <SelectValue placeholder="Filter notifications" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Notifications</SelectItem>
                            <SelectItem value="unread">Unread Only</SelectItem>
                            <SelectItem value="read">Read Only</SelectItem>
                        </SelectContent>
                    </Select>

                    <Badge variant="secondary" className="text-sm px-3 py-1">
                        {filteredNotifications.length} {filter === 'all' ? 'Total' : filter === 'unread' ? 'Unread' : 'Read'}
                    </Badge>
                </div>

                {unreadCount > 0 && (
                    <Button
                        onClick={markAllAsRead}
                        disabled={markingAll}
                        size="sm"
                        className="gap-2 shadow-sm"
                    >
                        {markingAll ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <CheckCheck className="h-4 w-4" />
                        )}
                        Mark All as Read
                    </Button>
                )}
            </div>

            {/* Notifications List */}
            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            ) : filteredNotifications.length === 0 ? (
                <Card className="border-2">
                    <CardContent className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                        <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center mb-4">
                            <Bell className="h-10 w-10 opacity-30" />
                        </div>
                        <p className="text-lg font-semibold mb-2">No notifications found</p>
                        <p className="text-sm text-center max-w-md">
                            {filter === 'unread'
                                ? "You're all caught up! No unread notifications at the moment."
                                : filter === 'read'
                                    ? 'No read notifications yet. New notifications will appear here once you read them.'
                                    : 'Notifications about your workflow activities will appear here.'}
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-3">
                    {filteredNotifications.map((notification, index) => {
                        const style = getNotificationStyle(notification.type);
                        return (
                            <Card
                                key={notification.notification_id}
                                className={cn(
                                    "group transition-all duration-300 hover:shadow-lg cursor-pointer border-2 overflow-hidden",
                                    !notification.is_read
                                        ? `${style.border} bg-gradient-to-r ${style.gradient}`
                                        : 'hover:bg-muted/30',
                                    "animate-in fade-in slide-in-from-top-2"
                                )}
                                style={{ animationDelay: `${index * 50}ms` }}
                                onClick={() => markAsRead(notification.notification_id, notification.link)}
                            >
                                <CardContent className="p-5">
                                    <div className="flex gap-4">
                                        <div className="flex-shrink-0">
                                            {getNotificationIcon(notification.type)}
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-start justify-between gap-2 mb-2">
                                                <div className="flex items-center gap-2 flex-1">
                                                    <h3
                                                        className={cn(
                                                            "font-bold text-sm uppercase tracking-wider",
                                                            !notification.is_read ? 'text-foreground' : 'text-muted-foreground'
                                                        )}
                                                    >
                                                        {notification.title}
                                                    </h3>
                                                    {!notification.is_read && (
                                                        <div className={cn("w-2 h-2 rounded-full animate-pulse", style.badge)} />
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                    <Clock className="h-3 w-3" />
                                                    <span className="whitespace-nowrap">
                                                        {formatDistanceToNow(new Date(notification.created_date), {
                                                            addSuffix: true,
                                                        })}
                                                    </span>
                                                </div>
                                            </div>

                                            <p
                                                className={cn(
                                                    "text-sm leading-relaxed mb-3",
                                                    !notification.is_read
                                                        ? 'text-foreground font-medium'
                                                        : 'text-muted-foreground'
                                                )}
                                            >
                                                {notification.message}
                                            </p>

                                            <div className="flex items-center justify-between">
                                                <span className="text-xs text-muted-foreground">
                                                    {format(new Date(notification.created_date), 'MMM dd, yyyy • hh:mm a')}
                                                </span>
                                                {notification.link && (
                                                    <div className="flex items-center text-xs font-bold text-primary gap-1 group-hover:gap-2 transition-all">
                                                        View Details <ExternalLink className="h-3 w-3" />
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default NotificationsPage;
