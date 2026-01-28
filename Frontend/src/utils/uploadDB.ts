/**
 * IndexedDB Database for Upload Queue Management
 * Provides persistent storage for files during upload process
 * Enables resume capability after network failures or browser crashes
 */

import Dexie, { Table } from 'dexie';

export interface QueuedFile {
    id?: number;
    batch_uid: string;
    file_name: string;
    file_blob: Blob;
    file_size: number;
    status: 'pending' | 'uploading' | 'uploaded' | 'failed';
    s3_path?: string;
    upload_progress: number;
    error_message?: string;
    created_at: Date;
    updated_at: Date;
}

export interface QueuedBatch {
    batch_uid: string;
    status: 'pending' | 'queued' | 'uploading' | 'completed';
    total_files: number;
    queued_at: Date;
    is_reupload: boolean;
}

class UploadDatabase extends Dexie {
    upload_queue!: Table<QueuedFile, number>;
    batch_queue!: Table<QueuedBatch, string>;

    constructor() {
        super('QCToolUploads');
        this.version(2).stores({
            upload_queue: '++id, batch_uid, status, file_name',
            batch_queue: 'batch_uid, status, queued_at'
        });
    }
}

export const db = new UploadDatabase();

/**
 * Store files in the upload queue for a specific batch
 */
export async function storeFilesInQueue(batch_uid: string, files: File[]): Promise<void> {
    const queuedFiles: QueuedFile[] = files.map(file => ({
        batch_uid,
        file_name: file.name,
        file_blob: file,
        file_size: file.size,
        status: 'pending',
        upload_progress: 0,
        created_at: new Date(),
        updated_at: new Date()
    }));

    await db.upload_queue.bulkAdd(queuedFiles);
}

/**
 * Get all queued files for a specific batch
 */
export async function getQueuedFiles(batch_uid: string): Promise<QueuedFile[]> {
    return await db.upload_queue
        .where('batch_uid')
        .equals(batch_uid)
        .toArray();
}

/**
 * Get pending files (not yet uploaded) for a batch
 */
export async function getPendingFiles(batch_uid: string): Promise<QueuedFile[]> {
    return await db.upload_queue
        .where('batch_uid')
        .equals(batch_uid)
        .and(file => file.status === 'pending' || file.status === 'failed')
        .toArray();
}

/**
 * Update file status
 */
export async function updateFileStatus(
    id: number,
    status: QueuedFile['status'],
    s3_path?: string,
    error_message?: string
): Promise<void> {
    await db.upload_queue.update(id, {
        status,
        s3_path,
        error_message,
        updated_at: new Date()
    });
}

/**
 * Update file upload progress
 */
export async function updateFileProgress(id: number, progress: number): Promise<void> {
    await db.upload_queue.update(id, {
        upload_progress: progress,
        status: 'uploading',
        updated_at: new Date()
    });
}

/**
 * Remove a specific file from queue
 */
export async function removeFile(id: number): Promise<void> {
    await db.upload_queue.delete(id);
}

/**
 * Clear all files for a batch (after successful upload)
 */
export async function clearBatch(batch_uid: string): Promise<void> {
    await db.upload_queue
        .where('batch_uid')
        .equals(batch_uid)
        .delete();
}

/**
 * Get upload statistics for a batch
 */
export async function getBatchStats(batch_uid: string): Promise<{
    total: number;
    pending: number;
    uploading: number;
    uploaded: number;
    failed: number;
}> {
    const files = await getQueuedFiles(batch_uid);

    return {
        total: files.length,
        pending: files.filter(f => f.status === 'pending').length,
        uploading: files.filter(f => f.status === 'uploading').length,
        uploaded: files.filter(f => f.status === 'uploaded').length,
        failed: files.filter(f => f.status === 'failed').length
    };
}

/**
 * Check if there are any pending uploads for any batch
 */
export async function hasPendingUploads(): Promise<boolean> {
    const count = await db.upload_queue
        .where('status')
        .anyOf(['pending', 'uploading'])
        .count();

    return count > 0;
}

/**
 * Add a batch to the global queue
 */
export async function addToBatchQueue(batch_uid: string, total_files: number, is_reupload: boolean): Promise<void> {
    await db.batch_queue.put({
        batch_uid,
        status: 'queued',
        total_files,
        queued_at: new Date(),
        is_reupload
    });
}

/**
 * Get the next batch waiting in the queue
 */
export async function getNextBatchInQueue(): Promise<QueuedBatch | undefined> {
    return await db.batch_queue
        .where('status')
        .equals('queued')
        .sortBy('queued_at')
        .then(batches => batches[0]);
}

/**
 * Update batch status in the queue
 */
export async function updateBatchStatus(
    batch_uid: string,
    status: QueuedBatch['status']
): Promise<void> {
    await db.batch_queue.update(batch_uid, { status });
}

/**
 * Remove batch from queue
 */
export async function removeBatchFromQueue(batch_uid: string): Promise<void> {
    await db.batch_queue.delete(batch_uid);
}

/**
 * Get currently uploading batch
 */
export async function getActiveBatch(): Promise<QueuedBatch | undefined> {
    return await db.batch_queue
        .where('status')
        .equals('uploading')
        .first();
}

/**
 * Get count of batches in queue
 */
export async function getQueueCount(): Promise<number> {
    return await db.batch_queue
        .where('status')
        .anyOf(['queued', 'uploading'])
        .count();
}

/**
 * Get all batches with pending uploads
 */
export async function getBatchesWithPendingUploads(): Promise<string[]> {
    const batches = await db.batch_queue
        .where('status')
        .anyOf(['queued', 'uploading'])
        .toArray();

    return batches.map(b => b.batch_uid);
}
