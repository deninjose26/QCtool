/**
 * Network Status Hook
 * Monitors online/offline status and provides reconnection detection
 */

import { useState, useEffect } from 'react';

interface NetworkStatus {
    isOnline: boolean;
    wasOffline: boolean;
}

export function useNetworkStatus(): NetworkStatus {
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [wasOffline, setWasOffline] = useState(false);

    useEffect(() => {
        const handleOnline = () => {
            setIsOnline(true);
            setWasOffline(true);

            // Reset wasOffline after 3 seconds
            setTimeout(() => {
                setWasOffline(false);
            }, 3000);
        };

        const handleOffline = () => {
            setIsOnline(false);
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    return { isOnline, wasOffline };
}
