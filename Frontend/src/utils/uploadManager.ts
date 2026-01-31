/**
 * Upload Manager
 * Handles direct-to-S3 uploads with progress tracking and error handling
 */

import { API_BASE_URL } from '@/config';
import { QueuedFile, updateFileStatus, updateFileProgress } from './uploadDB';

interface UploadProgress {
    fileId: number;
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
    private abortController: AbortController | null = null;
    private isPaused: boolean = false;

    constructor(token: string) {
        this.token = token;
    }

    /**
     * Request a pre-signed URL from the backend
     */
    private async requestPresignedUrl(
        batch_uid: string,
        file_name: string,
        file_size: number
    ): Promise<{ upload_url: string; s3_path: string }> {
        const response = await fetch(
            `${API_BASE_URL}/operator/batches/${batch_uid}/request-upload-url`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    batch_uid,
                    file_name,
                    file_size,
                    content_type: 'image/tiff'
                })
            }
        );

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to get upload URL');
        }

        return await response.json();
    }

    /**
     * Upload file directly to S3 using pre-signed URL
     */
    private async uploadToS3(
        upload_url: string,
        file_blob: Blob,
        onProgress?: (progress: number) => void
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();

            // Track upload progress
            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable && onProgress) {
                    const percentComplete = (e.loaded / e.total) * 100;
                    onProgress(Math.round(percentComplete));
                }
            });

            xhr.addEventListener('load', () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve();
                } else {
                    reject(new Error(`S3 upload failed with status ${xhr.status}`));
                }
            });

            xhr.addEventListener('error', () => {
                reject(new Error('Network error during S3 upload'));
            });

            xhr.addEventListener('abort', () => {
                reject(new Error('Upload aborted'));
            });

            xhr.open('PUT', upload_url);
            xhr.setRequestHeader('Content-Type', 'image/tiff');
            xhr.send(file_blob);

            // Store XHR for potential abort
            this.abortController = {
                abort: () => xhr.abort()
            } as any;
        });
    }

    /**
     * Notify backend that upload is complete
     */
    private async notifyUploadComplete(
        batch_uid: string,
        file_name: string,
        s3_path: string,
        file_size: number
    ): Promise<any> {
        const response = await fetch(
            `${API_BASE_URL}/operator/batches/${batch_uid}/upload-complete`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    batch_uid,
                    file_name,
                    s3_path,
                    file_size
                })
            }
        );

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to notify upload completion');
        }

        return await response.json();
    }

    /**
     * Upload a single file
     */
    async uploadSingleFile(
        batch_uid: string,
        file: QueuedFile,
        onProgress?: (progress: UploadProgress) => void
    ): Promise<void> {
        try {
            // Check if network is available
            if (!navigator.onLine) {
                throw new Error('Network offline');
            }

            // Check if paused
            if (this.isPaused) {
                throw new Error('Upload paused');
            }

            // CRITICAL: Validate file blob exists and has content
            if (!file.file_blob) {
                throw new Error(`File blob missing for ${file.file_name}`);
            }

            if (file.file_blob.size === 0) {
                throw new Error(`File blob is empty (0 bytes) for ${file.file_name}`);
            }

            if (file.file_blob.size !== file.file_size) {
                console.warn(`File size mismatch: blob=${file.file_blob.size}, metadata=${file.file_size}`);
            }

            // Update status to uploading
            if (file.id) {
                await updateFileStatus(file.id, 'uploading');
            }

            // Step 1: Request pre-signed URL
            const { upload_url, s3_path } = await this.requestPresignedUrl(
                batch_uid,
                file.file_name,
                file.file_size
            );

            // Step 2: Upload to S3
            await this.uploadToS3(upload_url, file.file_blob, (progress) => {
                if (file.id) {
                    updateFileProgress(file.id, progress);
                }
                if (onProgress) {
                    onProgress({
                        fileId: file.id!,
                        fileName: file.file_name,
                        progress,
                        status: 'uploading'
                    });
                }
            });

            // Step 3: Notify backend
            await this.notifyUploadComplete(
                batch_uid,
                file.file_name,
                s3_path,
                file.file_size
            );

            // Step 4: Update status to uploaded
            if (file.id) {
                await updateFileStatus(file.id, 'uploaded', s3_path);
            }

            if (onProgress) {
                onProgress({
                    fileId: file.id!,
                    fileName: file.file_name,
                    progress: 100,
                    status: 'uploaded'
                });
            }
        } catch (error) {
            // Update status to failed
            if (file.id) {
                await updateFileStatus(
                    file.id,
                    'failed',
                    undefined,
                    error instanceof Error ? error.message : 'Unknown error'
                );
            }

            if (onProgress) {
                onProgress({
                    fileId: file.id!,
                    fileName: file.file_name,
                    progress: 0,
                    status: 'failed'
                });
            }

            throw error;
        }
    }

    /**
     * Process entire upload queue for a batch using a worker pool for concurrency
     */
    async processUploadQueue(
        batch_uid: string,
        fileIds: number[],
        onFileProgress?: (progress: UploadProgress) => void,
        onBatchProgress?: (progress: BatchProgress) => void,
        onComplete?: () => void,
        onError?: (error: Error) => void,
        concurrency: number = 5,
        filesArray?: File[] // Optional: direct file array for instant access
    ): Promise<void> {
        let completedCount = 0;
        let processedCount = 0;
        const total = fileIds.length;
        let activeUploads = 0;
        let currentIndex = 0;
        let hasErrorOccurred = false;

        return new Promise((resolve, reject) => {
            const startNext = async () => {
                // Physical Network Kill-Switch
                if (!navigator.onLine) {
                    console.warn('📡 Network offline detected. Stopping upload loop.');
                    this.isPaused = true;
                    if (onError) onError(new Error('Network offline'));
                    return;
                }

                // Check if all files are processed
                if (processedCount === total) {
                    if (onComplete) onComplete();
                    resolve();
                    return;
                }

                // Check if paused or error occurred
                if (this.isPaused || hasErrorOccurred) return;

                // Fill workers up to concurrency limit
                while (activeUploads < concurrency && currentIndex < total) {
                    const fileId = fileIds[currentIndex];
                    currentIndex++;
                    activeUploads++;

                    // Fetch file: either from memory array or IndexedDB
                    let file: QueuedFile | undefined;

                    // First, get metadata from IndexedDB
                    const { db } = await import('./uploadDB');
                    const metadata = await db.upload_queue.get(fileId);

                    if (!metadata) {
                        activeUploads--;
                        processedCount++;
                        startNext();
                        continue;
                    }

                    if (filesArray && filesArray.length > 0) {
                        // Use direct file access (INSTANT) - MATCH BY FILENAME
                        const rawFile = filesArray.find(f => f.name === metadata.file_name);

                        if (rawFile) {
                            file = {
                                ...metadata,
                                file_blob: rawFile // Attach the actual file
                            };
                        } else {
                            // File not found in array - fallback to error
                            console.error(`File not found in array: ${metadata.file_name}`);
                            activeUploads--;
                            processedCount++;
                            startNext();
                            continue;
                        }
                    } else {
                        // FALLBACK: Files array lost (tab switch) - try to restore from directory handle
                        console.warn('⚠️ Files array not available - attempting to restore from directory handle');

                        // Get the directory handle from batch queue
                        const batchInfo = await db.batch_queue.get(batch_uid);

                        if (batchInfo?.directory_handle) {
                            try {
                                // Get the file from directory
                                const fileHandle = await (batchInfo.directory_handle as any).getFileHandle(metadata.file_name);
                                const rawFile = await fileHandle.getFile();

                                file = {
                                    ...metadata,
                                    file_blob: rawFile
                                };

                                console.log(`✅ Restored file from directory: ${metadata.file_name}`);
                            } catch (err) {
                                console.error(`❌ Failed to restore file: ${metadata.file_name}`, err);
                                activeUploads--;
                                processedCount++;
                                startNext();
                                continue;
                            }
                        } else {
                            console.error('❌ No directory handle available');
                            activeUploads--;
                            processedCount++;
                            startNext();
                            continue;
                        }
                    }

                    if (!file) {
                        activeUploads--;
                        processedCount++;
                        startNext();
                        continue;
                    }

                    // Mark as uploading in UI
                    if (onBatchProgress) {
                        onBatchProgress({
                            completed: completedCount,
                            total,
                            percentage: Math.round((completedCount / total) * 100),
                            currentFile: `Uploading ${file.file_name}...`
                        });
                    }

                    // Execute upload
                    this.uploadSingleFile(batch_uid, file, onFileProgress)
                        .then(() => {
                            activeUploads--;
                            completedCount++; // High-Water Mark: Only increment on 200 OK
                            processedCount++;
                            startNext(); // Pull next file
                        })
                        .catch((err) => {
                            console.error(`Error uploading ${file.file_name}:`, err);
                            activeUploads--;
                            processedCount++;
                            if (onError) onError(err);
                            startNext();
                        });
                }
            };

            // Start the first batch of workers
            startNext();
        });
    }

    /**
     * Pause ongoing uploads
     */
    pause(): void {
        this.isPaused = true;
        if (this.abortController) {
            this.abortController.abort();
        }
    }

    /**
     * Resume paused uploads
     */
    resume(): void {
        this.isPaused = false;
    }

    /**
     * Check if uploads are paused
     */
    isPausedStatus(): boolean {
        return this.isPaused;
    }
}

/**
 * Sync with server to get already uploaded files
 */
export async function syncWithServer(
    batch_uid: string,
    token: string
): Promise<string[]> {
    const response = await fetch(
        `${API_BASE_URL}/operator/batches/${batch_uid}/progress`,
        {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        }
    );

    if (!response.ok) {
        throw new Error('Failed to sync with server');
    }

    const data = await response.json();
    return data.uploaded_files || [];
}
