import { useState, useEffect, useRef, useCallback } from 'react';
import { API_BASE_URL } from '@/config';

interface NetworkStatus {
    isOnline: boolean;
    wasOffline: boolean;
    reportNetworkFailure: () => void;
}

/**
 * Monitors online/offline status using both native events and active pinging.
 * Refactored for extreme stability to prevent flip-flopping.
 */
export function useNetworkStatus(): NetworkStatus {
    // We use a ref to track the "truth" without triggering re-renders or closure issues in intervals
    const onlineRef = useRef(navigator.onLine);
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [wasOffline, setWasOffline] = useState(false);

    const checkConnectivity = async (): Promise<boolean> => {
        // CRITICAL FIX: If the browser itself says we are offline, don't even try to ping.
        // This prevents "localhost" success from tricking us into thinking we have internet.
        // If navigator.onLine is false, we are DEFINITELY offline for internet purposes.
        if (!navigator.onLine) return false;

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            const response = await fetch(`${API_BASE_URL}/health?t=${Date.now()}`, {
                method: 'GET',
                signal: controller.signal,
                cache: 'no-store'
            });

            clearTimeout(timeoutId);
            return response.ok;
        } catch (err) {
            return false;
        }
    };

    const runCheck = useCallback(async () => {
        const result = await checkConnectivity();

        // Only update state if the status has actually changed
        if (result !== onlineRef.current) {
            console.log(`📡 Network status change detected: ${onlineRef.current} -> ${result}`);

            if (result) {
                // Recovered
                setWasOffline(true);
                setTimeout(() => setWasOffline(false), 3000);
            }

            onlineRef.current = result;
            setIsOnline(result);
        }
    }, []);

    useEffect(() => {
        const handleBrowserOnline = () => {
            console.log('🌐 Browser reported Online event');
            runCheck();
        };

        const handleBrowserOffline = () => {
            console.log('🚫 Browser reported Offline event');
            // Immediate forced offline state
            onlineRef.current = false;
            setIsOnline(false);
        };

        window.addEventListener('online', handleBrowserOnline);
        window.addEventListener('offline', handleBrowserOffline);

        // Heartbeat: Check every 15 seconds (reduced frequency for stability)
        const interval = setInterval(runCheck, 15000);

        // Run an initial check immediately
        runCheck();

        return () => {
            window.removeEventListener('online', handleBrowserOnline);
            window.removeEventListener('offline', handleBrowserOffline);
            clearInterval(interval);
        };
    }, [runCheck]);

    const reportNetworkFailure = () => {
        if (onlineRef.current) {
            console.warn('⚡ Manual network failure reported by external service');
            onlineRef.current = false;
            setIsOnline(false);
        }
    };

    return { isOnline, wasOffline, reportNetworkFailure };
}
