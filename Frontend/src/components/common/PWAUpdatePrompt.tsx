import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { RefreshCw, X } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';

/**
 * PWA Update Prompt
 * Shows notification when new version is available
 * Allows user to reload and get latest version
 */
export const PWAUpdatePrompt: React.FC = () => {
    const {
        offlineReady: [offlineReady, setOfflineReady],
        needRefresh: [needRefresh, setNeedRefresh],
        updateServiceWorker,
    } = useRegisterSW({
        onRegistered(r) {
            console.log('✅ Service Worker registered:', r);
        },
        onRegisterError(error) {
            console.error('❌ Service Worker registration error:', error);
        },
    });

    const close = () => {
        setOfflineReady(false);
        setNeedRefresh(false);
    };

    const handleUpdate = () => {
        updateServiceWorker(true);
    };

    // Don't show if no update needed (removing "offlineReady" prompt as requested)
    if (!needRefresh) return null;

    return (
        <div className="fixed bottom-4 right-4 z-50 animate-slide-up max-w-md">
            <Card className="shadow-2xl border-2 border-primary">
                <CardContent className="p-4 flex items-center gap-4">
                    <div className="p-2 bg-primary/10 rounded-lg flex-shrink-0">
                        <RefreshCw className="h-6 w-6 text-primary" />
                    </div>

                    <div className="flex-1">
                        <h4 className="font-bold text-sm mb-1">
                            {offlineReady ? 'App ready to work offline' : 'New version available'}
                        </h4>
                        <p className="text-xs text-muted-foreground">
                            {offlineReady
                                ? 'You can now use the app without internet'
                                : 'Click reload to get the latest features and improvements'}
                        </p>
                    </div>

                    <div className="flex gap-2 flex-shrink-0">
                        {needRefresh && (
                            <Button
                                size="sm"
                                onClick={handleUpdate}
                                className="gap-2"
                            >
                                <RefreshCw className="h-4 w-4" />
                                Reload
                            </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={close}>
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};
