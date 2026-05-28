import { useState, useEffect, useRef, useCallback } from 'react';

interface NetworkStatus {
    isOnline: boolean;
    wasOffline: boolean;
    reportNetworkFailure: () => void;
    reportNetworkSuccess: () => void;
}

/**
 * HIGH-PERFORMANCE NETWORK MONITOR
 * 1. Trusts browser events for instant feedback.
 * 2. Uses "Passive Monitoring" (success reports) to confirm connectivity without pings.
 * 3. Uses "On-Demand Validation" to only verify connectivity when a failure actually occurs.
 */
export function useNetworkStatus(): NetworkStatus {
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [wasOffline, setWasOffline] = useState(false);
    
    // Internal state tracking
    const onlineRef = useRef(navigator.onLine);
    const consecutiveFailuresRef = useRef(0);
    const lastVerificationTimeRef = useRef(0);
    const MAX_FAILURES_BEFORE_OFFLINE = 2; // More aggressive detection for instant UI feedback

    /**
     * Verifies actual internet reachability by pinging a 100% reliable public endpoint.
     * This avoids "False Offline" warnings if your backend is just busy/slow.
     */
    const verifyConnectivity = async () => {
        const now = Date.now();
        // Don't verify more than once every 5 seconds to save bandwidth
        if (now - lastVerificationTimeRef.current < 5000) return onlineRef.current;
        
        lastVerificationTimeRef.current = now;

        try {
            // Ping a highly available public favicon (Google)
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            const response = await fetch('https://www.google.com/favicon.ico', { 
                mode: 'no-cors', 
                cache: 'no-store',
                signal: controller.signal 
            });

            clearTimeout(timeoutId);
            return true; // If we reached Google, we have internet
        } catch (err) {
            console.log('📡 Public verification ping failed');
            return false;
        }
    };

    /**
     * Call this when ANY API request succeeds. 
     * It passively confirms we are online without needing a background heartbeat.
     */
    const reportNetworkSuccess = useCallback(() => {
        consecutiveFailuresRef.current = 0;
        if (!onlineRef.current) {
            console.log('📡 Network confirmed ONLINE via passive success report');
            onlineRef.current = true;
            setIsOnline(true);
            setWasOffline(true);
            setTimeout(() => setWasOffline(false), 3000);
        }
    }, []);

    /**
     * Call this when an API request fails.
     * It increments the failure counter and triggers a verification if needed.
     */
    const reportNetworkFailure = useCallback(async () => {
        consecutiveFailuresRef.current += 1;
        
        // If we hit a threshold, verify if we are truly offline or if it was just a server glitch
        if (consecutiveFailuresRef.current >= MAX_FAILURES_BEFORE_OFFLINE && onlineRef.current) {
            const hasInternet = await verifyConnectivity();
            
            if (!hasInternet) {
                console.warn('📡 Confirmed OFFLINE: Internet unreachable');
                onlineRef.current = false;
                setIsOnline(false);
            } else {
                // We have internet, but the API call failed. Reset failures.
                // This means the issue is likely with the specific server, not the connection.
                consecutiveFailuresRef.current = 0;
            }
        }
    }, []);

    useEffect(() => {
        const handleBrowserOnline = () => {
            console.log('🌐 Browser reported network interface is UP');
            reportNetworkSuccess();
        };

        const handleBrowserOffline = () => {
            console.log('🚫 Browser reported network interface is DOWN');
            onlineRef.current = false;
            setIsOnline(false);
            consecutiveFailuresRef.current = MAX_FAILURES_BEFORE_OFFLINE;
        };

        window.addEventListener('online', handleBrowserOnline);
        window.addEventListener('offline', handleBrowserOffline);

        // Periodic slow check (every 2 minutes) just as a safety net if the app is idle
        const idleCheck = setInterval(async () => {
            if (onlineRef.current) {
                // Just check the flag, don't ping unless the browser says we are offline
                if (!navigator.onLine) handleBrowserOffline();
            } else {
                // If we are offline, try to recover
                if (navigator.onLine) {
                    const hasInternet = await verifyConnectivity();
                    if (hasInternet) reportNetworkSuccess();
                }
            }
        }, 120000);

        return () => {
            window.removeEventListener('online', handleBrowserOnline);
            window.removeEventListener('offline', handleBrowserOffline);
            clearInterval(idleCheck);
        };
    }, [reportNetworkSuccess]);

    return { isOnline, wasOffline, reportNetworkFailure, reportNetworkSuccess };
}
