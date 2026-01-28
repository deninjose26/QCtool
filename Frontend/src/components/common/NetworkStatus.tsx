import React, { useEffect } from 'react';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { WifiOff, Wifi } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

/**
 * Network Status Banner
 * Shows a banner at the top when offline
 * Shows toast notification when connection is restored
 */
export const NetworkStatus: React.FC = () => {
    const { isOnline, wasOffline } = useNetworkStatus();
    const { toast } = useToast();

    useEffect(() => {
        if (wasOffline && isOnline) {
            // Show success toast when reconnected
            toast({
                title: 'Back online!',
                description: 'Your connection has been restored. Syncing data...',
                duration: 3000,
            });
        }
    }, [wasOffline, isOnline, toast]);

    useEffect(() => {
        if (!isOnline) {
            // Show warning toast when going offline
            toast({
                title: 'You are offline',
                description: 'Some features may be limited. Changes will sync when you\'re back online.',
                variant: 'destructive',
                duration: 5000,
            });
        }
    }, [isOnline, toast]);

    // Don't show banner if online
    if (isOnline) return null;

    return (
        <div className="fixed top-16 left-0 right-0 z-40 bg-destructive text-destructive-foreground py-2 px-4 text-center text-sm font-medium animate-slide-down shadow-lg">
            <div className="flex items-center justify-center gap-2">
                <WifiOff className="h-4 w-4 animate-pulse" />
                <span>You're offline. Some features may be limited.</span>
            </div>
        </div>
    );
};
