import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Bell, Check, ExternalLink, Loader2, Volume2, VolumeX } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAuth } from '@/contexts/AuthContext';
import { formatDistanceToNow } from 'date-fns';
import { API_BASE_URL } from '@/config';

interface Notification {
    notification_id: string;
    type: string;
    title: string;
    message: string;
    link?: string;
    is_read: boolean;
    created_date: string;
}

const NotificationBell: React.FC = () => {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const [open, setOpen] = useState(false);
    const [soundEnabled, setSoundEnabled] = useState(() => {
        const saved = localStorage.getItem('notification_sound_enabled');
        return saved !== 'false'; // Default to true
    });
    const { apiFetch, isAuthenticated } = useAuth();
    const navigate = useNavigate();
    const previousUnreadCount = useRef(0);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // Initialize audio element with iPhone-style notification sound
    useEffect(() => {
        // Create an elegant tri-tone notification sound (similar to iPhone)
        const createNotificationSound = () => {
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            const now = audioContext.currentTime;

            // Create three tones for the tri-tone effect
            const playTone = (frequency: number, startTime: number, duration: number) => {
                const oscillator = audioContext.createOscillator();
                const gainNode = audioContext.createGain();

                oscillator.connect(gainNode);
                gainNode.connect(audioContext.destination);

                oscillator.frequency.value = frequency;
                oscillator.type = 'sine';

                // Smooth envelope for professional sound
                gainNode.gain.setValueAtTime(0, startTime);
                gainNode.gain.linearRampToValueAtTime(0.15, startTime + 0.01);
                gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration);

                oscillator.start(startTime);
                oscillator.stop(startTime + duration);
            };

            // iPhone-style tri-tone: C6, E6, G6 (elegant ascending notes)
            playTone(1046.50, now, 0.15);        // C6
            playTone(1318.51, now + 0.08, 0.15); // E6
            playTone(1567.98, now + 0.16, 0.2);  // G6

            // Add subtle harmonics for richness
            playTone(2093.00, now, 0.1);         // C7 (octave higher, quieter)
            playTone(2637.02, now + 0.08, 0.1);  // E7
            playTone(3135.96, now + 0.16, 0.15); // G7
        };

        audioRef.current = { play: createNotificationSound } as any;
    }, []);

    const playNotificationSound = useCallback(() => {
        if (soundEnabled && audioRef.current) {
            try {
                audioRef.current.play();
            } catch (error) {
                console.error('Failed to play notification sound:', error);
            }
        }
    }, [soundEnabled]);

    const fetchNotifications = useCallback(async () => {
        if (!isAuthenticated) return;
        try {
            // Fetch count
            const countRes = await apiFetch(`${API_BASE_URL}/notifications/unread-count`);
            if (countRes.ok) {
                const countData = await countRes.json();
                const newUnreadCount = countData.count;

                // Play sound if unread count increased
                if (newUnreadCount > previousUnreadCount.current && previousUnreadCount.current > 0) {
                    playNotificationSound();
                }

                previousUnreadCount.current = newUnreadCount;
                setUnreadCount(newUnreadCount);
            }

            // Fetch list
            const listRes = await apiFetch(`${API_BASE_URL}/notifications/?limit=10`);
            if (listRes.ok) {
                const listData = await listRes.json();
                setNotifications(listData);
            }
        } catch (error) {
            console.error('Failed to fetch notifications:', error);
        }
    }, [apiFetch, isAuthenticated, playNotificationSound]);

    useEffect(() => {
        fetchNotifications();
        const interval = setInterval(fetchNotifications, 30000); // 30 seconds
        return () => clearInterval(interval);
    }, [fetchNotifications]);

    const markAsRead = async (id: string, link?: string) => {
        if (!isAuthenticated) return;
        try {
            await apiFetch(`${API_BASE_URL}/notifications/${id}/read`, {
                method: 'PATCH',
            });

            // Update local state
            setNotifications(prev => prev.map(n =>
                n.notification_id === id ? { ...n, is_read: true } : n
            ));
            setUnreadCount(prev => Math.max(0, prev - 1));

            if (link) {
                setOpen(false); // Close dropdown before navigating
                navigate(link);
            }
        } catch (error) {
            console.error('Failed to mark read:', error);
        }
    };

    const markAllRead = async () => {
        if (!isAuthenticated) return;
        setLoading(true);
        try {
            await apiFetch(`${API_BASE_URL}/notifications/read-all`, {
                method: 'PATCH',
            });
            setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
            setUnreadCount(0);
        } catch (error) {
            console.error('Failed to mark all read:', error);
        } finally {
            setLoading(false);
        }
    };

    const toggleSound = () => {
        const newValue = !soundEnabled;
        setSoundEnabled(newValue);
        localStorage.setItem('notification_sound_enabled', String(newValue));
    };

    return (
        <DropdownMenu open={open} onOpenChange={setOpen}>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative h-8 w-8 sm:h-10 sm:w-10">
                    <Bell className="h-4 w-4 sm:h-5 sm:w-5" />
                    {unreadCount > 0 && (
                        <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-[10px] bg-red-500 hover:bg-red-600 border-2 border-white animate-pulse">
                            {unreadCount > 9 ? '9+' : unreadCount}
                        </Badge>
                    )}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80 sm:w-96 p-0 overflow-hidden">
                <div className="flex items-center justify-between p-4 border-b">
                    <DropdownMenuLabel className="p-0 font-bold">Notifications</DropdownMenuLabel>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={toggleSound}
                            title={soundEnabled ? 'Disable sound' : 'Enable sound'}
                        >
                            {soundEnabled ? (
                                <Volume2 className="h-3.5 w-3.5 text-primary" />
                            ) : (
                                <VolumeX className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                        </Button>
                        {unreadCount > 0 && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-auto p-0 text-primary hover:text-primary/80 text-xs flex items-center gap-1"
                                onClick={markAllRead}
                                disabled={loading}
                            >
                                {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                                Mark all as read
                            </Button>
                        )}
                    </div>
                </div>

                <ScrollArea className="h-[400px]">
                    {notifications.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                            <Bell className="h-8 w-8 opacity-20" />
                            <p className="text-sm">No notifications yet</p>
                        </div>
                    ) : (
                        <div className="flex flex-col">
                            {notifications.map((n) => (
                                <div
                                    key={n.notification_id}
                                    className={`p-4 border-b last:border-0 cursor-pointer transition-colors flex gap-3 ${n.is_read ? 'bg-background hover:bg-muted/50' : 'bg-primary/5 hover:bg-primary/10'
                                        }`}
                                    onClick={() => markAsRead(n.notification_id, n.link)}
                                >
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between gap-2 mb-1">
                                            <span className={`text-xs font-bold uppercase tracking-wider ${n.is_read ? 'text-muted-foreground' : 'text-primary'
                                                }`}>
                                                {n.title}
                                            </span>
                                            <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                                                {formatDistanceToNow(new Date(n.created_date), { addSuffix: true })}
                                            </span>
                                        </div>
                                        <p className={`text-sm leading-tight ${n.is_read ? 'text-muted-foreground' : 'text-foreground font-medium'}`}>
                                            {n.message}
                                        </p>
                                        {n.link && (
                                            <div className="mt-2 flex items-center text-[10px] font-bold text-primary gap-1">
                                                View Details <ExternalLink className="h-2.5 w-2.5" />
                                            </div>
                                        )}
                                    </div>
                                    {!n.is_read && (
                                        <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1" />
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </ScrollArea>
                {notifications.length > 0 && (
                    <div className="p-2 bg-muted/50 border-t text-center">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="w-full text-xs font-medium"
                            onClick={() => {
                                setOpen(false);
                                navigate('/notifications');
                            }}
                        >
                            View All Notifications
                        </Button>
                    </div>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
};

export default NotificationBell;
