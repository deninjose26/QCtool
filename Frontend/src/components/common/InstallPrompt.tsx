import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Download, X } from 'lucide-react';
import { usePWAInstall } from '@/hooks/usePWAInstall';

/**
 * PWA Install Prompt
 * Shows prompt to install app to home screen
 * Appears after user has used app for a while
 */
export const InstallPrompt: React.FC = () => {
    const { isInstallable, install } = usePWAInstall();
    const [showPrompt, setShowPrompt] = useState(false);

    useEffect(() => {
        if (isInstallable) {
            // Show prompt after 5 seconds of usage
            const timer = setTimeout(() => {
                setShowPrompt(true);
            }, 5000);
            return () => clearTimeout(timer);
        } else {
            setShowPrompt(false);
        }
    }, [isInstallable]);

    const handleInstall = async () => {
        const success = await install();
        if (success) {
            setShowPrompt(false);
        }
    };

    const handleDismiss = () => {
        setShowPrompt(false);
    };

    if (!showPrompt || !isInstallable) return null;

    return (
        <div className="fixed bottom-6 right-6 z-[60] animate-in fade-in slide-in-from-bottom-4 max-w-sm">
            <Card className="shadow-2xl border-2 border-primary bg-card/95 backdrop-blur-sm">
                <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                        <div className="p-2 bg-primary/10 rounded-lg flex-shrink-0">
                            <Download className="h-6 w-6 text-primary" />
                        </div>

                        <div className="flex-1">
                            <div className="flex items-center justify-between mb-1">
                                <h4 className="font-bold">Install QC Portal</h4>
                                <button onClick={handleDismiss} className="text-muted-foreground hover:text-foreground">
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                            <p className="text-sm text-muted-foreground mb-4">
                                Add to home screen for faster access and a dedicated app experience.
                            </p>

                            <div className="flex gap-2">
                                <Button size="sm" className="flex-1" onClick={handleInstall}>
                                    Install Now
                                </Button>
                                <Button size="sm" variant="outline" className="flex-1" onClick={handleDismiss}>
                                    Later
                                </Button>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default InstallPrompt;
