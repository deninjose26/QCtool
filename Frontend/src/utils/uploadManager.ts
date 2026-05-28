import { API_BASE_URL } from '@/config';
import { db, QueuedFile } from './uploadDB';
import { computeFileMD5 } from './tiffValidator';

// Threshold for multipart upload (files > 10MB use multipart for resumability)
const MULTIPART_THRESHOLD = 10 * 1024 * 1024; // 10MB
const MULTIPART_CHUNK_SIZE = 5 * 1024 * 1024; // 5MB per part (S3 minimum)

export const syncWithServer = async (batchUid: string, token: string): Promise<string[]> => {
    try {
        const response = await fetch(`${API_BASE_URL}/operator/batches/${batchUid}/progress`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) return [];
        const data = await response.json();
        return data.uploaded_files || [];
    } catch (error) {
        console.error('Failed to sync with server:', error);
        return [];
    }
};

interface PrefetchedUrl {
    file_name: string;
    upload_url: string;
    s3_path: string;
    expires_in: number;
}

interface CompletionEntry {
    file_name: string;
    s3_path: string;
    file_size: number;
    content_md5: string;
}

export class UploadManager {
    public token: string;
    private onNetworkFailure?: () => void;
    private onNetworkSuccess?: () => void;
    private static globalStop = false;
    private isDestroyed = false;
    private isPaused = false;
    private activeWorkers = 0;
    private worker: Worker | null = null;
    private urlCache: Map<string, PrefetchedUrl> = new Map();
    private completionBuffer: CompletionEntry[] = [];
    private completionTimer: ReturnType<typeof setTimeout> | null = null;
    private currentBatchUid: string = '';

    // Track in-flight uploads so we can abort them on pause/destroy
    private activeXhrs: Set<XMLHttpRequest> = new Set();
    private activeTusUploads: Set<any> = new Set();
    private activeAbortControllers: Set<AbortController> = new Set();

    constructor(token: string, onNetworkFailure?: () => void, onNetworkSuccess?: () => void) {
        this.token = token;
        this.onNetworkFailure = onNetworkFailure;
        this.onNetworkSuccess = onNetworkSuccess;
        this.initWorker();
    }

    private initWorker() {
        try {
            this.worker = new Worker(
                new URL('../workers/uploadWorker.ts', import.meta.url),
                { type: 'module' }
            );
        } catch {
            console.warn('Web Worker not available, using main thread XHR');
            this.worker = null;
        }
    }

    static stopAllInstances() {
        this.globalStop = true;
        console.log('🛑 Global upload stop triggered');
    }

    static resetGlobalStop() {
        this.globalStop = false;
        console.log('🔄 Global upload stop reset');
    }

    pause() {
        this.isPaused = true;
        // Actively abort all in-flight uploads so they truly stop
        this.abortAllActive();
        console.log(`⏸️ UploadManager paused - aborted in-flight requests`);
    }

    resume() {
        this.isPaused = false;
        console.log('▶️ UploadManager resumed');
    }

    private abortAllActive() {
        // Abort in-flight XHR uploads
        this.activeXhrs.forEach(xhr => {
            try { xhr.abort(); } catch {}
        });
        this.activeXhrs.clear();

        // Abort TUS uploads (tus-js-client exposes .abort())
        this.activeTusUploads.forEach(tusUpload => {
            try { tusUpload.abort(); } catch {}
        });
        this.activeTusUploads.clear();

        // Abort fetch requests
        this.activeAbortControllers.forEach(ctrl => {
            try { ctrl.abort(); } catch {}
        });
        this.activeAbortControllers.clear();
    }

    destroy() {
        this.isDestroyed = true;
        this.isPaused = false;
        this.abortAllActive();
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
        if (this.completionTimer) {
            clearTimeout(this.completionTimer);
        }
        // Flush any remaining completions
        this.flushCompletionBuffer().catch(() => {});
        console.log('💀 UploadManager destroyed');
    }

    /**
     * Prefetch presigned URLs in batch (up to 50 at once).
     * Eliminates per-file round trips for URL generation.
     */
    private async prefetchUrls(
        batchUid: string,
        fileNames: string[],
        fileSizes: Map<string, number>
    ): Promise<void> {
        const files = fileNames
            .filter(name => !this.urlCache.has(name))
            .slice(0, 50)
            .map(name => ({
                file_name: name,
                file_size: fileSizes.get(name) || 0,
                content_type: 'image/tiff'
            }));

        if (files.length === 0) return;

        try {
            const response = await fetch(
                `${API_BASE_URL}/operator/batches/${batchUid}/request-upload-urls`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ files }),
                    keepalive: true
                }
            );

            if (response.ok) {
                if (this.onNetworkSuccess) this.onNetworkSuccess();
                const data = await response.json();
                for (const url of data.urls) {
                    this.urlCache.set(url.file_name, url);
                }
                return;
            }
        } catch (error) {
            console.warn('Batch URL prefetch failed, falling back to individual requests', error);
        }

        // Fallback: fetch individually if batch endpoint not available
    }

    /**
     * Get presigned URL for a single file (fallback if batch fails).
     */
    private async getPresignedUrl(batchUid: string, fileName: string, fileSize: number): Promise<{ upload_url: string; s3_path: string }> {
        // Check cache first
        const cached = this.urlCache.get(fileName);
        if (cached) {
            this.urlCache.delete(fileName);
            return { upload_url: cached.upload_url, s3_path: cached.s3_path };
        }

        const urlRes = await fetch(`${API_BASE_URL}/operator/batches/${batchUid}/request-upload-url`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                batch_uid: batchUid,
                file_name: fileName,
                file_size: fileSize,
                content_type: 'image/tiff'
            }),
            keepalive: true
        });

        if (!urlRes.ok) {
            const errorData = await urlRes.json();
            throw new Error(errorData.detail || 'Failed to get upload URL');
        }

        const { upload_url, s3_path } = await urlRes.json();
        return { upload_url, s3_path };
    }

    /**
     * Upload file to S3 using Web Worker (or fallback to XHR on main thread).
     */
    private uploadToS3(
        uploadUrl: string,
        fileBlob: Blob,
        contentMd5Base64: string,
        onProgress: (loaded: number, total: number) => void
    ): Promise<void> {
        if (this.worker) {
            return this.uploadViaWorker(uploadUrl, fileBlob, contentMd5Base64, onProgress);
        }
        return this.uploadViaXHR(uploadUrl, fileBlob, contentMd5Base64, onProgress);
    }

    private uploadViaWorker(
        url: string,
        fileBlob: Blob,
        contentMd5: string,
        onProgress: (loaded: number, total: number) => void
    ): Promise<void> {
        return new Promise(async (resolve, reject) => {
            const id = crypto.randomUUID();
            const arrayBuffer = await fileBlob.arrayBuffer();

            const handler = (event: MessageEvent) => {
                const msg = event.data;
                if (msg.id !== id) return;

                if (msg.type === 'progress') {
                    onProgress(msg.loaded, msg.total);
                } else if (msg.type === 'complete') {
                    this.worker?.removeEventListener('message', handler);
                    if (msg.success) {
                        resolve();
                    } else {
                        reject(new Error(msg.error || 'Upload failed'));
                    }
                }
            };

            this.worker!.addEventListener('message', handler);
            this.worker!.postMessage(
                { type: 'upload', id, url, fileData: arrayBuffer, contentType: 'image/tiff', contentMd5 },
                [arrayBuffer]
            );
        });
    }

    private uploadViaXHR(
        uploadUrl: string,
        fileBlob: Blob,
        contentMd5Base64: string,
        onProgress: (loaded: number, total: number) => void
    ): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('PUT', uploadUrl);
            xhr.setRequestHeader('Content-Type', 'image/tiff');
            if (contentMd5Base64) {
                xhr.setRequestHeader('Content-MD5', contentMd5Base64);
            }

            // Track so pause/destroy can abort this XHR
            this.activeXhrs.add(xhr);

            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable) {
                    onProgress(event.loaded, event.total);
                }
            };

            xhr.onabort = () => {
                this.activeXhrs.delete(xhr);
                reject(new Error('Upload aborted'));
            };

            xhr.onload = () => {
                this.activeXhrs.delete(xhr);
                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve();
                } else {
                    reject(new Error(`S3 upload failed with status ${xhr.status}`));
                }
            };

            xhr.onerror = () => {
                this.activeXhrs.delete(xhr);
                reject(new Error('S3 upload network error'));
            };

            if (UploadManager.globalStop || this.isDestroyed) {
                xhr.abort();
                reject(new Error('Upload aborted'));
                return;
            }

            xhr.send(fileBlob);
        });
    }

    /**
     * S3 Multipart Upload for large files (>10MB).
     * Supports resumability - if upload fails, only the failed part needs retry.
     */
    private async uploadMultipart(
        batchUid: string,
        fileName: string,
        fileBlob: Blob,
        onProgress: (loaded: number, total: number) => void
    ): Promise<{ s3_path: string }> {
        const totalSize = fileBlob.size;
        const numParts = Math.ceil(totalSize / MULTIPART_CHUNK_SIZE);

        // 1. Initiate multipart upload
        const initRes = await fetch(`${API_BASE_URL}/operator/batches/${batchUid}/initiate-multipart`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${this.token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ file_name: fileName, file_size: totalSize, content_type: 'image/tiff', num_parts: numParts })
        });
        if (!initRes.ok) throw new Error('Failed to initiate multipart upload');
        const { upload_id, s3_path, part_urls } = await initRes.json();

        // 2. Upload each part with its presigned URL
        let uploadedBytes = 0;
        const completedParts: { PartNumber: number; ETag: string }[] = [];

        for (let i = 0; i < numParts; i++) {
            if (UploadManager.globalStop || this.isDestroyed) throw new Error('Upload aborted');

            while (this.isPaused && !this.isDestroyed && !UploadManager.globalStop) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            const start = i * MULTIPART_CHUNK_SIZE;
            const end = Math.min(start + MULTIPART_CHUNK_SIZE, totalSize);
            const chunk = fileBlob.slice(start, end);

            // Retry each part up to 3 times (with abort support)
            let partETag = '';
            for (let attempt = 0; attempt < 3; attempt++) {
                if (this.isPaused || this.isDestroyed || UploadManager.globalStop) throw new Error('Upload aborted');

                const controller = new AbortController();
                this.activeAbortControllers.add(controller);
                try {
                    const response = await fetch(part_urls[i], {
                        method: 'PUT',
                        body: chunk,
                        headers: { 'Content-Type': 'image/tiff' },
                        signal: controller.signal
                    });
                    this.activeAbortControllers.delete(controller);
                    if (!response.ok) throw new Error(`Part ${i + 1} upload failed: ${response.status}`);
                    partETag = response.headers.get('ETag') || '';
                    break;
                } catch (err: any) {
                    this.activeAbortControllers.delete(controller);
                    if (err.name === 'AbortError') throw new Error('Upload aborted');
                    if (attempt === 2) throw err;
                    await new Promise(resolve => setTimeout(resolve, 2000 * (attempt + 1)));
                }
            }

            completedParts.push({ PartNumber: i + 1, ETag: partETag.replace(/"/g, '') });
            uploadedBytes += (end - start);
            onProgress(uploadedBytes, totalSize);
        }

        // 3. Complete the multipart upload
        const completeRes = await fetch(`${API_BASE_URL}/operator/batches/${batchUid}/complete-multipart`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${this.token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ upload_id, s3_path, parts: completedParts })
        });
        if (!completeRes.ok) throw new Error('Failed to complete multipart upload');

        return { s3_path };
    }

    /**
     * Buffer completion signals and flush in batches for speed.
     */
    private async addToCompletionBuffer(entry: CompletionEntry): Promise<void> {
        this.completionBuffer.push(entry);

        // Flush every 10 completions
        if (this.completionBuffer.length >= 10) {
            await this.flushCompletionBuffer();
        } else if (!this.completionTimer) {
            // Or flush after 5 seconds
            this.completionTimer = setTimeout(() => this.flushCompletionBuffer(), 5000);
        }
    }

    private async flushCompletionBuffer(): Promise<void> {
        if (this.completionTimer) {
            clearTimeout(this.completionTimer);
            this.completionTimer = null;
        }

        if (this.completionBuffer.length === 0) return;

        const batch = [...this.completionBuffer];
        this.completionBuffer = [];

        try {
            const response = await fetch(
                `${API_BASE_URL}/operator/batches/${this.currentBatchUid}/upload-complete-batch`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        batch_uid: this.currentBatchUid,
                        files: batch
                    }),
                    keepalive: true
                }
            );

            if (response.ok) {
                if (this.onNetworkSuccess) this.onNetworkSuccess();
                return;
            }
        } catch (error) {
            console.warn('Batch completion failed, falling back to individual calls', error);
        }

        // Fallback: send individual completion calls
        for (const entry of batch) {
            try {
                await fetch(`${API_BASE_URL}/operator/batches/${this.currentBatchUid}/upload-complete`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        batch_uid: this.currentBatchUid,
                        file_name: entry.file_name,
                        s3_path: entry.s3_path,
                        file_size: entry.file_size,
                        content_md5: entry.content_md5
                    }),
                    keepalive: true
                });
            } catch (err) {
                console.error(`Individual completion failed for ${entry.file_name}:`, err);
            }
        }
    }

    async processUploadQueue(
        batchUid: string,
        fileNamesOrIds: (string | number)[],
        onFileProgress: (fileProgress: { fileName: string; progress: number; status: string }) => void,
        onBatchProgress: (batchProgress: { completed: number; total: number; percentage: number; currentFile?: string }) => void,
        onComplete: () => Promise<void>,
        onError: (error: string) => void,
        concurrency: number = 3,
        filesArray?: File[]
    ) {
        if (UploadManager.globalStop || this.isDestroyed) return;

        this.currentBatchUid = batchUid;
        const total = fileNamesOrIds.length;
        let completed = 0;
        const queue = [...fileNamesOrIds];
        const activePromises: Promise<void>[] = [];

        // Build file size map and prefetch URLs in batch
        const fileSizes = new Map<string, number>();
        const fileNamesList: string[] = [];
        if (filesArray) {
            for (const f of filesArray) {
                fileSizes.set(f.name, f.size);
                fileNamesList.push(f.name);
            }
        }

        // Prefetch URLs for first batch of files
        if (fileNamesList.length > 0) {
            await this.prefetchUrls(batchUid, fileNamesList.slice(0, 50), fileSizes).catch(() => {});
        }

        const updateBatchProgress = (currentFile?: string) => {
            onBatchProgress({
                completed,
                total,
                percentage: Math.round((completed / total) * 100),
                currentFile
            });
        };

        const processNext = async (): Promise<void> => {
            if (queue.length === 0 || UploadManager.globalStop || this.isDestroyed) return;

            // If paused, exit worker immediately (it will be restarted by resume())
            if (this.isPaused) return;

            if (queue.length === 0 || UploadManager.globalStop || this.isDestroyed) return;

            // Aggressive pre-fetch: if cache has fewer than 25 URLs, refill
            if (this.urlCache.size < 25 && fileNamesList.length > 0) {
                const nextBatch = queue.slice(0, 50).filter(id => typeof id === 'string') as string[];
                this.prefetchUrls(batchUid, nextBatch, fileSizes).catch(() => {});
            }

            const identifier = queue.shift()!;
            let currentFileName = '';

            try {
                // Find file in filesArray or IndexedDB
                let fileBlob: Blob | undefined;
                let fileName: string = '';

                if (filesArray) {
                    let fileObj: File | undefined;
                    if (typeof identifier === 'string') {
                        fileObj = filesArray.find(f => f.name === identifier);
                    } else if (typeof identifier === 'number') {
                        fileObj = filesArray[identifier];
                    }
                    if (fileObj) {
                        fileBlob = fileObj;
                        fileName = fileObj.name;
                    }
                }

                if (!fileBlob) {
                    const records = await db.upload_queue
                        .where('batch_uid').equals(batchUid)
                        .toArray();

                    let fileRecord: QueuedFile | undefined;
                    if (typeof identifier === 'number') {
                        fileRecord = records[identifier];
                    } else {
                        fileRecord = records.find(r => r.file_name === identifier);
                    }

                    if (fileRecord) {
                        fileBlob = fileRecord.file_blob;
                        fileName = fileRecord.file_name;
                    }
                }

                if (!fileBlob || !fileName) {
                    throw new Error(`File not found: ${identifier}`);
                }

                currentFileName = fileName;
                onFileProgress({ fileName, progress: 0, status: 'uploading' });

                // Check again for pause/stop before starting upload
                if (UploadManager.globalStop || this.isDestroyed) {
                    queue.unshift(identifier);
                    return;
                }

                let s3_path: string;
                let md5Hex = '';

                if (fileBlob.size > MULTIPART_THRESHOLD) {
                    // Large file: Use S3 multipart upload (resumable)
                    const result = await this.uploadMultipart(batchUid, fileName, fileBlob, (loaded, total) => {
                        const progress = Math.round((loaded * 100) / total);
                        onFileProgress({ fileName, progress, status: 'uploading' });
                    });
                    s3_path = result.s3_path;
                } else {
                    // Small file: Use presigned URL with MD5 checksum
                    const { hex, base64: md5Base64 } = await computeFileMD5(fileBlob);
                    md5Hex = hex;
                    const urlResult = await this.getPresignedUrl(batchUid, fileName, fileBlob.size);
                    s3_path = urlResult.s3_path;

                    await this.uploadToS3(urlResult.upload_url, fileBlob, md5Base64, (loaded, total) => {
                        const progress = Math.round((loaded * 100) / total);
                        onFileProgress({ fileName, progress, status: 'uploading' });
                    });
                }

                // If we got this far, the network is definitely working
                if (this.onNetworkSuccess) this.onNetworkSuccess();

                // Signal completion (batched for speed)
                await this.addToCompletionBuffer({
                    file_name: fileName,
                    s3_path: s3_path,
                    file_size: fileBlob.size,
                    content_md5: md5Hex
                });

                // 5. Update local DB status
                await db.upload_queue
                    .where({ batch_uid: batchUid, file_name: fileName })
                    .modify({ status: 'uploaded', progress: 100, updated_at: new Date() });

                completed++;
                updateBatchProgress(fileName);
                onFileProgress({ fileName, progress: 100, status: 'uploaded' });

            } catch (error: any) {
                if (error.message === 'Upload aborted') return;

                console.error(`Error uploading ${currentFileName || identifier}:`, error);

                if (!navigator.onLine) {
                    if (this.onNetworkFailure) this.onNetworkFailure();
                }

                onError(error.message || `Failed to upload ${currentFileName || identifier}`);

                if (currentFileName) {
                    await db.upload_queue
                        .where({ batch_uid: batchUid, file_name: currentFileName })
                        .modify({ status: 'failed', error_message: error.message, updated_at: new Date() });
                }
            }

            return processNext();
        };

        // Start initial workers
        for (let i = 0; i < Math.min(concurrency, queue.length); i++) {
            activePromises.push(processNext());
        }

        await Promise.all(activePromises);

        // Flush any remaining completion signals
        await this.flushCompletionBuffer();

        if (!UploadManager.globalStop && !this.isDestroyed) {
            await onComplete();
        }
    }
}
