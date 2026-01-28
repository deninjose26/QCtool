import React, { useState, useEffect } from 'react';
import { Database, RefreshCw } from 'lucide-react';
import { db } from '@/utils/uploadDB';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { cn } from '@/lib/utils';

/**
 * Sync Queue Badge
 * Shows the number of pending actions in the sync queue
 * Spin the icon when online and syncing
 */
export const SyncQueueBadge: React.FC = () => {
    const [queueCount, setQueueCount] = useState(0);
    const { isOnline } = useNetworkStatus();

    const updateCount = async () => {
        try {
            const count = await db.sync_queue.count();
            setQueueCount(count);
        } catch (error) {
            console.error('Error counting sync queue:', error);
        }
    };

    useEffect(() => {
        updateCount();

        // Polling for updates (could use Dexie hooks but this is simpler for now)
        const interval = setInterval(updateCount, 3000);
        return () => clearInterval(interval);
    }, []);

    if (queueCount === 0) return null;

    return (
        <div
            className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-full border shadow-sm transition-all animate-in fade-in slide-in-from-right-4",
                isOnline
                    ? "bg-amber-50 border-amber-200 text-amber-900"
                    : "bg-muted border-border text-muted-foreground"
            )}
            title={isOnline ? "Syncing changes..." : "Changes waiting for connection"}
        >
            <div className="relative">
                <Database className={cn("h-4 w-4", isOnline && "text-amber-600")} />
                <span className="absolute -top-1.5 -right-1.5 h-4 w-4 bg-amber-600 rounded-full text-[10px] text-white flex items-center justify-center font-bold border-2 border-white">
                    {queueCount}
                </span>
            </div>

            <span className="text-xs font-bold whitespace-nowrap hidden sm:inline">
                {queueCount} {queueCount === 1 ? 'change' : 'changes'} pending
            </span>

            {isOnline && (
                <RefreshCw className="h-3 w-3 text-amber-600 animate-spin" />
            )}
        </div>
    );
};

export default SyncQueueBadge;
