import { useState, useEffect, useCallback } from 'react';

/**
 * Hook to handle PWA installation
 * Captures beforeinstallprompt event and provides install functionality
 */
export function usePWAInstall() {
    const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
    const [isInstallable, setIsInstallable] = useState(false);
    const [isStandalone, setIsStandalone] = useState(false);

    useEffect(() => {
        // Check if already installed
        if (window.matchMedia('(display-mode: standalone)').matches) {
            setIsStandalone(true);
        }

        const handler = (e: Event) => {
            // Prevent the mini-infobar from appearing on mobile
            e.preventDefault();
            // Stash the event so it can be triggered later
            setDeferredPrompt(e);
            setIsInstallable(true);
        };

        window.addEventListener('beforeinstallprompt', handler);

        const appInstalledHandler = () => {
            setIsInstallable(false);
            setDeferredPrompt(null);
            setIsStandalone(true);
            console.log('✅ PWA was installed');
        };

        window.addEventListener('appinstalled', appInstalledHandler);

        return () => {
            window.removeEventListener('beforeinstallprompt', handler);
            window.removeEventListener('appinstalled', appInstalledHandler);
        };
    }, []);

    const install = useCallback(async () => {
        if (!deferredPrompt) return false;

        // Show the install prompt
        deferredPrompt.prompt();

        // Wait for the user to respond to the prompt
        const { outcome } = await deferredPrompt.userChoice;

        // Clear the deferredPrompt so it can't be used again
        setDeferredPrompt(null);
        setIsInstallable(false);

        return outcome === 'accepted';
    }, [deferredPrompt]);

    return { isInstallable, isStandalone, install };
}
