import { API_BASE_URL } from '@/config';
import { db, updateFileStatus, updateFileProgress, QueuedFile } from './uploadDB';

interface UploadProgress {
    fileName: string;
    progress: number;
    status: 'uploading' | 'uploaded' | 'failed';
}

interface BatchProgress {
    completed: number;
    total: number;
    percentage: number;
    currentFile?: string;
}

export class UploadManager {
    private token: string;
    private isPaused: boolean = false;
    private static activeInstances: Set<UploadManager> = new Set();
    private activeRequests: Set<XMLHttpRequest> = new Set();
    private onOfflineDetected?: () => void;

    constructor(token: string, onOfflineDetected?: () => void) {
        this.token = token;
        this.onOfflineDetected = onOfflineDetected;
        UploadManager.activeInstances.add(this);
    }

    public static stopAllInstances() {
        for (const instance of UploadManager.activeInstances) {
            instance.destroy();
        }
        UploadManager.activeInstances.clear();
    }

    public static resetGlobalStop() {
        // Reset global state if needed - currently just clears any stale data
        UploadManager.activeInstances.clear();
        console.log('🔄 UploadManager: Global state reset');
    }

    public pause() {
        this.isPaused = true;
        for (const xhr of this.activeRequests) {
            xhr.abort();
        }
        this.activeRequests.clear();
    }

    public resume() {
        this.isPaused = false;
    }

    public destroy() {
        this.pause();
        UploadManager.activeInstances.delete(this);
    }

    private async requestPresignedUrl(batch_uid: string, file_name: string, file_size: number): Promise<{ upload_url: string, s3_path: string }> {
        const res = await fetch(`${API_BASE_URL}/operator/batches/${batch_uid}/request-upload-url`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ batch_uid, file_name, file_size })
        });

        if (!res.ok) {
            if (res.status === 401 || res.status === 403) throw new Error('AUTH_ERROR');
            throw new Error('Failed to get presigned URL');
        }

        return await res.json();
    }

    private uploadToS3(
        batch_uid: string,
        file_name: string,
        upload_url: string,
        blob: Blob,
        onProgress?: (progress: number) => void
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            this.activeRequests.add(xhr);

            xhr.open('PUT', upload_url);

            xhr.upload.onprogress = (e) => {
                if (e.lengthComputable && onProgress) {
                    const percent = Math.round((e.loaded / e.total) * 100);
                    onProgress(percent);
                }
            };

            xhr.onload = () => {
                this.activeRequests.delete(xhr);
                if (xhr.status === 200) resolve();
                else reject(new Error(`S3 Upload failed: ${xhr.status}`));
            };

            xhr.onerror = () => {
                this.activeRequests.delete(xhr);
                if (!navigator.onLine && this.onOfflineDetected) this.onOfflineDetected();
                reject(new Error('S3 Network Error'));
            };

            xhr.onabort = () => {
                this.activeRequests.delete(xhr);
                reject(new Error('UPLOAD_ABORTED'));
            };

            xhr.send(blob);
        });
    }

    private async notifyUploadComplete(batch_uid: string, file_name: string, s3_path: string, file_size: number): Promise<void> {
        const res = await fetch(`${API_BASE_URL}/operator/batches/${batch_uid}/upload-complete`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ batch_uid, file_name, s3_path, file_size })
        });

        if (!res.ok) throw new Error('Failed to notify server');
    }

    async uploadSingleFile(
        workerId: number,
        batch_uid: string,
        db_file: QueuedFile,
        actual_blob: Blob,
        onProgress?: (progress: UploadProgress) => void
    ): Promise<void> {
        try {
            if (this.isPaused) throw new Error('Paused');

            // 1. Get URL
            const { upload_url, s3_path } = await this.requestPresignedUrl(batch_uid, db_file.file_name, db_file.file_size);

            // 2. Status -> Uploading
            await updateFileStatus(batch_uid, db_file.file_name, 'uploading');

            // 3. To S3
            await this.uploadToS3(batch_uid, db_file.file_name, upload_url, actual_blob, (progress) => {
                updateFileProgress(batch_uid, db_file.file_name, progress);
                if (onProgress) onProgress({ fileName: db_file.file_name, progress, status: 'uploading' });
            });

            // 4. Status -> Uploaded
            await updateFileStatus(batch_uid, db_file.file_name, 'uploaded', s3_path);
            if (onProgress) onProgress({ fileName: db_file.file_name, progress: 100, status: 'uploaded' });

            // 5. Notify
            await this.notifyUploadComplete(batch_uid, db_file.file_name, s3_path, db_file.file_size);

        } catch (error) {
            console.error(`[Worker ${workerId}] Error uploading ${db_file.file_name}:`, error);
            throw error;
        }
    }

    async processUploadQueue(
        batch_uid: string,
        fileNames: string[],
        onFileProgress?: (progress: UploadProgress) => void,
        onBatchProgress?: (progress: BatchProgress) => void,
        onComplete?: () => void,
        onError?: (error: Error) => void,
        concurrency: number = 8,
        filesArray?: File[] // These are the files user picked
    ): Promise<void> {
        const total = fileNames.length;
        let completedCount = 0;
        let activeCount = 0;
        const queue = [...fileNames];

        // Create a quick lookup map for the files currently in memory
        const inMemoryFiles = new Map<string, File>();
        if (filesArray) {
            filesArray.forEach(f => inMemoryFiles.set(f.name, f));
        }

        console.log(`[Manager] 🚀 Starting queue for ${total} files`);

        const processNext = async (workerId: number) => {
            if (this.isPaused || queue.length === 0) return;

            const fileName = queue.shift()!;
            activeCount++;

            try {
                // Get metadata from DB
                const db_file = await db.upload_queue.get([batch_uid, fileName]);
                if (!db_file) throw new Error(`Metadata missing for ${fileName}`);

                // Get actual content from memory (FAST) or from the user's handle
                let actual_blob = inMemoryFiles.get(fileName);

                // Fallback: If not in immediate memory, try reading from directory handle
                if (!actual_blob) {
                    const batchMeta = await db.batch_queue.get(batch_uid);
                    if (batchMeta?.directory_handle) {
                        try {
                            // Find entry in handle
                            const entry = await batchMeta.directory_handle.getFileHandle(fileName);
                            actual_blob = await entry.getFile();
                        } catch (e) {
                            console.warn(`Could not read ${fileName} from handle:`, e);
                        }
                    }
                }

                if (!actual_blob) {
                    throw new Error(`File content not found for ${fileName}. Please reconnect folder.`);
                }

                await this.uploadSingleFile(workerId, batch_uid, db_file, actual_blob, onFileProgress);

                completedCount++;
                activeCount--;

                if (onBatchProgress) {
                    onBatchProgress({
                        completed: completedCount,
                        total,
                        percentage: Math.round((completedCount / total) * 100),
                        currentFile: fileName
                    });
                }

                await processNext(workerId);
            } catch (err: any) {
                activeCount--;
                if (err.message === 'UPLOAD_ABORTED') return;

                if (onError) onError(err);

                if (queue.length > 0) {
                    await processNext(workerId);
                }
            }
        };

        const workers = [];
        for (let i = 0; i < Math.min(concurrency, total); i++) {
            workers.push(processNext(i));
        }

        await Promise.all(workers);

        if (completedCount === total && onComplete) {
            onComplete();
        }
    }
}

export async function syncWithServer(batch_uid: string, token: string): Promise<string[]> {
    const res = await fetch(`${API_BASE_URL}/operator/batches/${batch_uid}/progress`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) throw new Error(`Failed to sync: ${res.status}`);
    const data = await res.json();
    return data.uploaded_files || [];
}
