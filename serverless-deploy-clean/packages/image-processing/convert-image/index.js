/**
 * DigitalOcean Serverless Function: TIFF to JPEG Conversion
 * Lazy-loaded dependencies for maximum stability.
 * Clean, minimal, and hardcoded env for remote build compatibility.
 */
async function main(args) {
    try {
        // 1. Move requires INside to prevent global startup crash on invalid architecture
        const { S3Client, GetObjectCommand, PutObjectCommand } = require("@aws-sdk/client-s3");
        // Lazy-load Sharp to prevent ELF error on invocation start
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

        if (api_secret !== "gYBtwXkmpDl_i_Vd8WYBq5rKW4FetnOkroqYDR6252I") {
            return {
                statusCode: 403,
                headers: { 'Content-Type': 'application/json' },
                body: { error: 'Invalid API secret' }
            };
        }

        // 3. Initialize S3 Clients (Separate for Read/Write)
        const s3Read = new S3Client({
            endpoint: 'https://blr1.digitaloceanspaces.com',
            region: 'blr1',
            credentials: {
                accessKeyId: "DO801DZCVYXWU9FN8L98",
                secretAccessKey: "yK/eup8nMaFCMSJumbeMLTa338LrkYwX8icdVMDn350",
            }
        });

        const s3Write = new S3Client({
            endpoint: 'https://blr1.digitaloceanspaces.com',
            region: 'blr1',
            credentials: {
                accessKeyId: "DO8014Q6WBPXCWATHR9X",
                secretAccessKey: "7QtbTz0tiagrMZPDCdvrsHbwUoAsoVxCBG0U+E1AgwI",
            }
        });

        // 3a. Download (Read Client)
        const downloadParams = { Bucket: original_bucket, Key: original_path };
        const response = await s3Read.send(new GetObjectCommand(downloadParams));

        // Convert stream to Buffer
        const chunks = [];
        for await (const chunk of response.Body) {
            chunks.push(chunk);
        }
        const tiffBuffer = Buffer.concat(chunks);

        // 4. Processing
        const jpegBuffer = await sharp(tiffBuffer)
            .rotate()
            .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 80, progressive: true })
            .toBuffer();

        const metadata = await sharp(jpegBuffer).metadata();
        const qcPath = original_path.replace(/\.[^/.]+$/, "") + ".jpg";

        // 5. Upload (Write Client)
        await s3Write.send(new PutObjectCommand({
            Bucket: qc_bucket,
            Key: qcPath,
            Body: jpegBuffer,
            ContentType: 'image/jpeg'
        }));

        // 6. Webhook (Fire and Forget / Graceful Fail)
        const apiBase = "https://qcportal-api.familyaconnect.com";
        try {
            await axios.post(`${apiBase}/operator/conversion-complete`, {
                image_id,
                qc_path: qcPath,
                jpeg_size: jpegBuffer.length,
                original_size: tiffBuffer.length,
                dimensions: { width: metadata.width, height: metadata.height }
            }, {
                headers: { 'X-API-Key': api_secret },
                timeout: 5000 // Short timeout so function doesn't hang
            });
        } catch (webhookError) {
            console.error(`[WARN] Webhook failed (expected if local): ${webhookError.message}`);
            // Do NOT throw error, return success because image IS converted.
        }

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: { success: true, image_id, qc_path: qcPath }
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
