import { db, SyncAction } from './uploadDB';

/**
 * Sync Manager
 * Handles processing the sync queue when the user comes back online
 */
export class SyncManager {
    private static instance: SyncManager;
    private isSyncing = false;

    private constructor() {
        // Private constructor for singleton
        window.addEventListener('online', () => {
            console.log('🌐 Online event detected, starting sync...');
            this.processQueue();
        });
    }

    public static getInstance(): SyncManager {
        if (!SyncManager.instance) {
            SyncManager.instance = new SyncManager();
        }
        return SyncManager.instance;
    }

    /**
     * Add an action to the sync queue
     */
    public async addToQueue(action: SyncAction['action'], endpoint: string, data: any) {
        const id = crypto.randomUUID();
        await db.sync_queue.add({
            id,
            action,
            endpoint,
            data,
            timestamp: Date.now()
        });

        if (navigator.onLine) {
            this.processQueue();
        }
    }

    /**
     * Process all actions in the sync queue
     */
    public async processQueue() {
        if (this.isSyncing || !navigator.onLine) return;

        try {
            this.isSyncing = true;
            const actions = await db.sync_queue.orderBy('timestamp').toArray();

            for (const action of actions) {
                try {
                    const success = await this.performSync(action);
                    if (success) {
                        await db.sync_queue.delete(action.id);
                        console.log(`✅ Synced action: ${action.action} to ${action.endpoint}`);
                    }
                } catch (error) {
                    console.error(`❌ Failed to sync action ${action.id}:`, error);
                    // Stop processing for now if a sync fails (preserves order)
                    break;
                }
            }
        } finally {
            this.isSyncing = false;
        }
    }

    /**
     * Perform the actual network request
     */
    private async performSync(action: SyncAction): Promise<boolean> {
        const token = localStorage.getItem('qc_token');
        if (!token) return false;

        const method = action.action === 'create' ? 'POST' :
            action.action === 'update' ? 'PUT' : 'DELETE';

        const response = await fetch(action.endpoint, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(action.data)
        });

        return response.ok;
    }
}

export const syncManager = SyncManager.getInstance();
