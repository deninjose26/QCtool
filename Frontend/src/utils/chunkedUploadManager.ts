/**
 * Chunked Upload Manager
 * Handles large batches by processing files in chunks to avoid IndexedDB quota issues
 */

import { storeFilesInQueue, clearBatch, getPendingFiles } from './uploadDB';
import { UploadManager, syncWithServer } from './uploadManager';

interface ChunkedUploadOptions {
    chunkSize: number;  // Number of files per chunk (default: 50)
    onChunkProgress?: (chunk: number, totalChunks: number) => void;
    onFileProgress?: (file: string, progress: number) => void;
    onComplete?: () => void;
    onError?: (error: Error) => void;
}

export class ChunkedUploadManager {
    private uploadManager: UploadManager;
    private isPaused: boolean = false;
    private userId: string;

    constructor(token: string, userId: string) {
        this.uploadManager = new UploadManager(token);
        this.userId = userId;
    }

    /**
     * Upload large batch in chunks to avoid IndexedDB quota issues
     */
    async uploadLargeBatch(
        batch_uid: string,
        allFiles: File[],
        options: ChunkedUploadOptions
    ): Promise<void> {
        const {
            chunkSize = 50,
            onChunkProgress,
            onFileProgress,
            onComplete,
            onError
        } = options;

        const totalFiles = allFiles.length;
        const totalChunks = Math.ceil(totalFiles / chunkSize);

        console.log(`📦 Starting chunked upload: ${totalFiles} files in ${totalChunks} chunks`);

        try {
            // Sync with server to get already uploaded files
            const uploadedFiles = await syncWithServer(batch_uid, this.uploadManager['token']);
            const uploadedSet = new Set(uploadedFiles.map(f => f.toLowerCase()));

            // Filter out already uploaded files (case-insensitive)
            const remainingFiles = allFiles.filter(f => !uploadedSet.has(f.name.toLowerCase()));

            if (remainingFiles.length === 0) {
                console.log('✅ All files already uploaded');
                if (onComplete) onComplete();
                return;
            }

            console.log(`📊 ${remainingFiles.length} files remaining to upload`);

            // Process in chunks
            for (let i = 0; i < totalChunks; i++) {
                if (this.isPaused) {
                    console.log('⏸️ Upload paused');
                    return;
                }

                const start = i * chunkSize;
                const end = Math.min(start + chunkSize, remainingFiles.length);
                const chunk = remainingFiles.slice(start, end);

                console.log(`\n📤 Processing chunk ${i + 1}/${totalChunks} (${chunk.length} files)`);

                if (onChunkProgress) {
                    onChunkProgress(i + 1, totalChunks);
                }

                // Store this chunk in IndexedDB with user_id
                await storeFilesInQueue(this.userId, batch_uid, chunk);

                // Get pending files for this chunk (RAM SAVER)
                const pendingFiles = await getPendingFiles(batch_uid);
                const fileNames = pendingFiles.map(f => f.file_name);

                // Upload this chunk
                await this.uploadManager.processUploadQueue(
                    batch_uid,
                    fileNames,
                    (fileProgress) => {
                        if (onFileProgress) {
                            onFileProgress(fileProgress.fileName, fileProgress.progress);
                        }
                    },
                    (batchProgress) => {
                        console.log(`  Progress: ${batchProgress.completed}/${batchProgress.total} files`);
                    },
                    () => {
                        console.log(`✅ Chunk ${i + 1}/${totalChunks} complete`);
                    },
                    (error) => {
                        console.error(`❌ Error in chunk ${i + 1}:`, error);
                        if (onError) onError(error);
                    }
                );

                // Clear IndexedDB after this chunk completes
                await clearBatch(batch_uid);
                console.log(`🧹 Cleared IndexedDB for chunk ${i + 1}`);

                // Small delay between chunks to avoid overwhelming the browser
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            console.log('\n🎉 All chunks uploaded successfully!');
            if (onComplete) onComplete();

        } catch (error) {
            console.error('❌ Chunked upload failed:', error);
            if (onError) {
                onError(error instanceof Error ? error : new Error('Upload failed'));
            }
        }
    }

    /**
     * Pause ongoing upload
     */
    pause(): void {
        this.isPaused = true;
        this.uploadManager.pause();
    }

    /**
     * Resume paused upload
     */
    resume(): void {
        this.isPaused = false;
        this.uploadManager.resume();
    }
}

/**
 * Calculate optimal chunk size based on file sizes
 */
export function calculateOptimalChunkSize(files: File[]): number {
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    const avgFileSize = totalSize / files.length;

    // Target ~2GB per chunk
    const targetChunkSize = 2 * 1024 * 1024 * 1024; // 2GB
    const optimalChunkSize = Math.floor(targetChunkSize / avgFileSize);

    // Clamp between 25 and 100 files per chunk
    return Math.max(25, Math.min(100, optimalChunkSize));
}
