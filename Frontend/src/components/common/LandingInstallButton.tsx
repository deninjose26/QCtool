import React from 'react';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { cn } from '@/lib/utils';

interface LandingInstallButtonProps {
    className?: string;
    variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
    size?: "default" | "sm" | "lg" | "icon";
}

/**
 * PWA Install Button for Landing Page
 * Only visible when the app is installable and not already installed
 */
export const LandingInstallButton: React.FC<LandingInstallButtonProps> = ({
    className,
}) => {
    const { isInstallable, install, isStandalone } = usePWAInstall();

    if (!isInstallable || isStandalone) return null;

    return (
        <Button
            variant="outline"
            size="sm"
            className={cn(
                "relative group overflow-hidden border-accent/30 bg-accent/5 hover:bg-accent/10 text-accent hover:text-black font-bold px-4 h-9 rounded-xl transition-all duration-300 animate-in fade-in slide-in-from-right-4",
                "hover:border-accent hover:shadow-[0_0_15px_rgba(34,197,94,0.2)]",
                className
            )}
            onClick={install}
        >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-shimmer" />
            <Download className="h-4 w-4 relative z-10 group-hover:scale-110 transition-transform" />
            <span className="relative z-10 whitespace-nowrap">Install App</span>
        </Button>
    );
};

export default LandingInstallButton;
