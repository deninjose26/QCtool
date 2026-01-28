import React from 'react';
import { WifiOff, Home, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

/**
 * Offline Fallback Page
 * Shown when the user is offline and tries to navigate to a page not in cache
 */
export const OfflinePage: React.FC = () => {
    return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4 animate-fade-in">
            <div className="text-center max-w-md w-full">
                <div className="relative mb-8">
                    <div className="h-24 w-24 bg-destructive/10 rounded-full flex items-center justify-center mx-auto">
                        <WifiOff className="h-12 w-12 text-destructive animate-pulse" />
                    </div>
                    <div className="absolute -bottom-2 -right-2 bg-background p-1 rounded-full border shadow-sm">
                        <div className="h-4 w-4 bg-destructive rounded-full" />
                    </div>
                </div>

                <h1 className="text-3xl font-bold mb-4 tracking-tight">You're Offline</h1>
                <p className="text-muted-foreground mb-8 text-lg">
                    It looks like you've lost your internet connection. Don't worry, your work is saved locally and will sync once you're back online.
                </p>

                <div className="grid gap-3 sm:grid-cols-2">
                    <Button
                        variant="default"
                        size="lg"
                        className="gap-2"
                        onClick={() => window.location.reload()}
                    >
                        <RefreshCw className="h-4 w-4" />
                        Try Again
                    </Button>
                    <Link to="/" className="w-full">
                        <Button
                            variant="outline"
                            size="lg"
                            className="gap-2 w-full"
                        >
                            <Home className="h-4 w-4" />
                            Back to Home
                        </Button>
                    </Link>
                </div>

                <div className="mt-12 p-4 rounded-xl bg-muted/30 border border-border/50">
                    <p className="text-sm font-medium text-muted-foreground flex items-center justify-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-amber-500" />
                        Queued uploads will resume automatically
                    </p>
                </div>
            </div>
        </div>
    );
};

export default OfflinePage;
