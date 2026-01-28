import React from 'react';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { usePWAInstall } from '@/hooks/usePWAInstall';

/**
 * PWA Install Button for Header
 * Only visible when the app is installable and not already installed
 */
export const PWAInstallButton: React.FC = () => {
    const { isInstallable, install, isStandalone } = usePWAInstall();

    if (!isInstallable || isStandalone) return null;

    return (
        <Button
            variant="outline"
            size="sm"
            className="hidden sm:flex items-center gap-2 bg-primary/5 hover:bg-primary/10 border-primary/20 text-primary hover:text-black font-bold h-9 px-4 rounded-xl transition-all animate-in fade-in slide-in-from-top-2"
            onClick={install}
        >
            <Download className="h-4 w-4" />
            <span>Install App</span>
        </Button>
    );
};

export default PWAInstallButton;
