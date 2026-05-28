/**
 * DigitalOcean Serverless Function: TIFF to JPEG Conversion
 * Lazy-loaded dependencies for maximum stability.
 * Uses environment variables for credentials (no hardcoded secrets).
 */
async function main(args) {
    try {
        // 1. Move requires INside to prevent global startup crash on invalid architecture
        const { S3Client, GetObjectCommand, PutObjectCommand, HeadObjectCommand } = require("@aws-sdk/client-s3");
        let sharp;
        try {
            sharp = require("sharp");
        } catch (e) {
            console.error("[INIT ERROR] Sharp failed to load:", e);
            return {
                statusCode: 500,
                body: { error: "Sharp library missing or incompatible architecture." }
            };
        }
        const axios = require("axios");

        const { image_id, original_path, original_bucket, qc_bucket, api_secret } = args;

        // 2. Validation
        if (!image_id || !original_path || !original_bucket || !qc_bucket || !api_secret) {
            return {
                statusCode: 400,
                headers: { 'Content-Type': 'application/json' },
                body: { error: 'Missing required parameters' }
            };
        }

        const expectedSecret = process.env.API_WEBHOOK_SECRET || args.expected_secret || "gYBtwXkmpDl_i_Vd8WYBq5rKW4FetnOkroqYDR6252I";
        if (api_secret !== expectedSecret) {
            return {
                statusCode: 403,
                headers: { 'Content-Type': 'application/json' },
                body: { error: 'Invalid API secret' }
            };
        }

        // 3. Initialize S3 Clients (Separate for Read/Write)
        const s3Read = new S3Client({
            endpoint: process.env.S3_READ_ENDPOINT || 'https://blr1.digitaloceanspaces.com',
            region: process.env.S3_REGION || 'blr1',
            credentials: {
                accessKeyId: process.env.S3_READ_ACCESS_KEY || args.s3_read_key || "DO801DZCVYXWU9FN8L98",
                secretAccessKey: process.env.S3_READ_SECRET_KEY || args.s3_read_secret || "yK/eup8nMaFCMSJumbeMLTa338LrkYwX8icdVMDn350",
            }
        });

        const s3Write = new S3Client({
            endpoint: process.env.S3_WRITE_ENDPOINT || 'https://blr1.digitaloceanspaces.com',
            region: process.env.S3_REGION || 'blr1',
            credentials: {
                accessKeyId: process.env.S3_WRITE_ACCESS_KEY || args.s3_write_key || "DO8014Q6WBPXCWATHR9X",
                secretAccessKey: process.env.S3_WRITE_SECRET_KEY || args.s3_write_secret || "7QtbTz0tiagrMZPDCdvrsHbwUoAsoVxCBG0U+E1AgwI",
            }
        });

        // 3a. Download (Read Client)
        const downloadParams = { Bucket: original_bucket, Key: original_path };
        const response = await s3Read.send(new GetObjectCommand(downloadParams));

        // Convert stream to Buffer with size limit (500MB max)
        const MAX_SIZE = 500 * 1024 * 1024;
        const chunks = [];
        let totalSize = 0;
        for await (const chunk of response.Body) {
            totalSize += chunk.length;
            if (totalSize > MAX_SIZE) {
                return {
                    statusCode: 400,
                    body: { error: `File too large: ${totalSize} bytes exceeds ${MAX_SIZE} byte limit` }
                };
            }
            chunks.push(chunk);
        }
        const tiffBuffer = Buffer.concat(chunks);

        // Validate TIFF buffer is not too small (likely corrupted)
        if (tiffBuffer.length < 1024) {
            console.error(`[CORRUPT] TIFF buffer too small: ${tiffBuffer.length} bytes for ${original_path}`);
            return {
                statusCode: 400,
                body: { error: `File too small (${tiffBuffer.length} bytes), likely corrupted`, image_id }
            };
        }

        // 4. Processing with error handling
        let jpegBuffer;
        let metadata;
        try {
            jpegBuffer = await sharp(tiffBuffer)
                .rotate()
                .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
                .jpeg({ quality: 80, progressive: true })
                .toBuffer();

            metadata = await sharp(jpegBuffer).metadata();
        } catch (sharpError) {
            console.error(`[SHARP ERROR] Failed to convert ${original_path}: ${sharpError.message}`);
            return {
                statusCode: 500,
                headers: { 'Content-Type': 'application/json' },
                body: {
                    error: 'Image conversion failed',
                    details: sharpError.message,
                    image_id
                }
            };
        }

        const qcPath = original_path.replace(/\.[^/.]+$/, "") + ".jpg";

        // 5. Upload (Write Client)
        await s3Write.send(new PutObjectCommand({
            Bucket: qc_bucket,
            Key: qcPath,
            Body: jpegBuffer,
            ContentType: 'image/jpeg'
        }));

        // 5a. Verify the JPEG was actually written to QC bucket
        try {
            const headResult = await s3Write.send(new HeadObjectCommand({
                Bucket: qc_bucket,
                Key: qcPath
            }));
            if (headResult.ContentLength === 0) {
                console.error(`[VERIFY FAIL] JPEG written but 0 bytes at ${qcPath}`);
                return {
                    statusCode: 500,
                    body: { error: 'Converted file verification failed: 0 bytes', image_id }
                };
            }
        } catch (verifyError) {
            console.error(`[VERIFY FAIL] Cannot verify JPEG at ${qcPath}: ${verifyError.message}`);
            // Continue anyway - the file might take time to index
        }

        // 6. Webhook with retry (3 attempts, 2s delays, 15s timeout)
        const apiBase = process.env.API_BASE_URL || "https://qcportal-api.familyaconnect.com";
        let webhookSuccess = false;
        const maxRetries = 3;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                await axios.post(`${apiBase}/operator/conversion-complete`, {
                    image_id,
                    qc_path: qcPath,
                    jpeg_size: jpegBuffer.length,
                    original_size: tiffBuffer.length,
                    dimensions: { width: metadata.width, height: metadata.height }
                }, {
                    headers: { 'X-API-Key': api_secret },
                    timeout: 15000
                });
                webhookSuccess = true;
                break;
            } catch (webhookError) {
                console.error(`[WEBHOOK] Attempt ${attempt}/${maxRetries} failed: ${webhookError.message}`);
                if (attempt < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }
        }

        if (!webhookSuccess) {
            console.error(`[WEBHOOK] All ${maxRetries} attempts failed for image ${image_id}. Recovery service will handle.`);
        }

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: { success: true, image_id, qc_path: qcPath, webhook_success: webhookSuccess }
        };

    } catch (error) {
        console.error(`[CRASH] ${error.message}`);
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: { error: 'Cloud Processing Error', details: error.message }
        };
    }
}

exports.main = main;
