import Dexie, { Table } from 'dexie';

export interface QueuedFile {
    batch_uid: string;
    file_name: string;
    user_id: string;
    file_size: number;
    // file_blob is now optional - we only store it if strictly necessary
    file_blob?: Blob;
    status: 'pending' | 'uploading' | 'uploaded' | 'failed';
    progress: number;
    s3_path?: string;
    error_message?: string;
    retry_count: number;
    created_at: Date;
    updated_at: Date;
}

export type BatchStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'queued' | 'interrupted' | 'uploading';

export interface BatchQueue {
    batch_uid: string;
    user_id: string;
    total_files: number;
    completed_files: number;
    status: BatchStatus;
    is_reupload: boolean;
    directory_handle?: any;
    last_heartbeat?: Date;
    created_at: Date;
    updated_at: Date;
}

export interface SyncAction {
    id: string;
    action: 'create' | 'update' | 'delete';
    endpoint: string;
    data: any;
    timestamp: number;
}

const DB_NAME = 'QCToolUploadDB';

class UploadDatabase extends Dexie {
    upload_queue!: Table<QueuedFile, [string, string]>;
    batch_queue!: Table<BatchQueue, string>;
    sync_queue!: Table<SyncAction, string>;

    constructor() {
        super(DB_NAME);

        // Version 16: Metadata-only storage for ultra performance
        this.version(16).stores({
            upload_queue: '[batch_uid+file_name], user_id, batch_uid, status',
            batch_queue: 'batch_uid, user_id, status',
            sync_queue: 'id, timestamp'
        });

        this.on('blocked', () => {
            console.error('[DB] VERSION 16 BLOCKED');
            this.close();
        });
    }
}

export const db = new UploadDatabase();

/**
 * Ultra-High Speed Storage V16 - METADATA ONLY
 * Stores 1000+ files in < 2 seconds.
 */
export async function storeFilesInQueue(
    user_id: string,
    batch_uid: string,
    files: File[],
    onProgress?: (progress: number) => void,
    isResume: boolean = false
): Promise<void> {
    console.log(`[DB] ⚡ V16 metadata-only storage: ${files.length} files`);

    if (onProgress) onProgress(1);

    try {
        const total = files.length;
        // In metadata mode, we can do 500 files at a time comfortably
        const CHUNK_SIZE = 500;

        for (let i = 0; i < total; i += CHUNK_SIZE) {
            const chunk = files.slice(i, Math.min(i + CHUNK_SIZE, total));
            const records = chunk.map(file => ({
                batch_uid,
                file_name: file.name,
                user_id,
                file_size: file.size,
                // NO file_blob saved here. Files are read directly from memory/disk during upload.
                status: 'pending' as const,
                progress: 0,
                retry_count: 0,
                created_at: new Date(),
                updated_at: new Date()
            }));

            await db.upload_queue.bulkPut(records);

            if (onProgress) {
                onProgress(Math.round((Math.min(i + CHUNK_SIZE, total) / total) * 100));
            }
        }

        console.log('[DB] ✅ Metadata stored successfully');
    } catch (e) {
        console.error('[DB] ❌ V16 STORE ERROR:', e);
        throw e;
    }
}

export async function addToBatchQueue(
    user_id: string,
    batch_uid: string,
    total_files: number,
    is_reupload: boolean = false,
    directory_handle: any = null
): Promise<void> {
    await db.batch_queue.put({
        batch_uid,
        user_id,
        total_files,
        completed_files: 0,
        status: 'pending',
        is_reupload,
        directory_handle,
        created_at: new Date(),
        updated_at: new Date()
    });
}

export async function updateBatchStatus(batch_uid: string, status: BatchStatus): Promise<void> {
    await db.batch_queue.update(batch_uid, { status, updated_at: new Date() });
}

export async function removeBatchFromQueue(batch_uid: string): Promise<void> {
    await db.upload_queue.where('batch_uid').equals(batch_uid).delete();
    await db.batch_queue.delete(batch_uid);
}

export async function getPendingFiles(batch_uid: string): Promise<QueuedFile[]> {
    return await db.upload_queue
        .where('batch_uid')
        .equals(batch_uid)
        .filter(f => f.status === 'pending' || f.status === 'failed' || f.status === 'uploading')
        .toArray();
}

export async function getQueuedFiles(batch_uid: string): Promise<QueuedFile[]> {
    return await db.upload_queue.where('batch_uid').equals(batch_uid).toArray();
}

export async function updateFileStatus(batch_uid: string, file_name: string, status: any, s3_path?: string, error_message?: string): Promise<void> {
    await db.upload_queue.update([batch_uid, file_name], { status, s3_path, error_message, updated_at: new Date() });
}

export async function updateFileProgress(batch_uid: string, file_name: string, progress: number): Promise<void> {
    await db.upload_queue.update([batch_uid, file_name], { progress, updated_at: new Date() });
}

export async function getBatchStats(batch_uid: string) {
    const files = await getQueuedFiles(batch_uid);
    return {
        total: files.length,
        pending: files.filter(f => f.status === 'pending').length,
        uploading: files.filter(f => f.status === 'uploading').length,
        uploaded: files.filter(f => f.status === 'uploaded').length,
        failed: files.filter(f => f.status === 'failed').length
    };
}

export async function clearBatch(batch_uid: string) {
    await removeBatchFromQueue(batch_uid);
}

export async function getUserBatches(user_id: string) {
    return await db.batch_queue.where('user_id').equals(user_id).toArray();
}

export async function getQueueCount(user_id: string): Promise<number> {
    return await db.batch_queue
        .where('user_id')
        .equals(user_id)
        .filter(b => b.status !== 'completed')
        .count();
}

export async function getBatchesWithPendingUploads(user_id: string): Promise<string[]> {
    const batches = await db.batch_queue
        .where('user_id')
        .equals(user_id)
        .filter(b => b.status !== 'completed')
        .toArray();
    return batches.map(b => b.batch_uid);
}

export async function getActiveBatch(user_id: string) {
    return await db.batch_queue
        .where('user_id')
        .equals(user_id)
        .filter(b => b.status === 'in_progress' || b.status === 'uploading' || b.status === 'interrupted' || b.status === 'failed')
        .first();
}

export async function getNextBatchInQueue(user_id: string) {
    return await db.batch_queue
        .where('user_id')
        .equals(user_id)
        .filter(b => b.status === 'pending' || b.status === 'queued' || b.status === 'interrupted' || b.status === 'failed')
        .first();
}

export async function factoryResetDatabase() {
    await db.delete();
    window.location.reload();
}
