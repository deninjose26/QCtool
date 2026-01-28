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
            // Check if paused
            if (this.isPaused) {
                throw new Error('Upload paused');
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
        files: QueuedFile[],
        onFileProgress?: (progress: UploadProgress) => void,
        onBatchProgress?: (progress: BatchProgress) => void,
        onComplete?: () => void,
        onError?: (error: Error) => void,
        concurrency: number = 5 // User requested chunks, 5-10 is safest for TIFF
    ): Promise<void> {
        let completedCount = 0;
        const total = files.length;
        let activeUploads = 0;
        let currentIndex = 0;
        let hasErrorOccurred = false;

        return new Promise((resolve, reject) => {
            const startNext = async () => {
                // Check if all files are done
                if (completedCount === total) {
                    if (onComplete) onComplete();
                    resolve();
                    return;
                }

                // Check if paused or error occurred
                if (this.isPaused || hasErrorOccurred) return;

                // Fill workers up to concurrency limit
                while (activeUploads < concurrency && currentIndex < total) {
                    const file = files[currentIndex];
                    currentIndex++;
                    activeUploads++;

                    // Mark as uploading in UI
                    if (onBatchProgress) {
                        onBatchProgress({
                            completed: completedCount,
                            total,
                            percentage: Math.round((completedCount / total) * 100),
                            currentFile: `Uploading multiple files (${activeUploads} active)...`
                        });
                    }

                    // Execute upload
                    this.uploadSingleFile(batch_uid, file, onFileProgress)
                        .then(() => {
                            activeUploads--;
                            completedCount++;
                            startNext(); // Pull next file
                        })
                        .catch((err) => {
                            console.error(`Error uploading ${file.file_name}:`, err);
                            activeUploads--;
                            completedCount++; // Count as processed to avoid hanging
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
