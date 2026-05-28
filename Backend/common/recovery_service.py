"""
Automatic Background Recovery Service
Runs continuously to detect and retry stuck conversions.
Enhanced with QC bucket pre-check and retry limits.
"""

import os
import asyncio
from datetime import datetime, timedelta
from sqlmodel import Session, select
from common.database import engine
from common.models import Image, ConversionStatus, get_ist_now
import httpx
import boto3
from botocore.client import Config
from botocore.exceptions import ClientError
import logging

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('recovery_service')

# Track retry counts per image to prevent infinite loops
_retry_counts: dict[str, int] = {}
MAX_RETRIES_PER_IMAGE = 3


class RecoveryService:
    """Background service to automatically recover stuck conversions"""

    def __init__(self, check_interval_seconds: int = 300):
        self.check_interval = check_interval_seconds
        self.function_url = os.getenv('DO_FUNCTION_CONVERT_URL')
        self.running = False

    def _check_qc_bucket_exists(self, image: Image) -> bool:
        """Check if the converted JPEG already exists in QC bucket."""
        try:
            qc_s3_client = boto3.client(
                's3',
                endpoint_url=os.getenv('QC_ENDPOINT_URL', os.getenv('ENDPOINT_URL')),
                aws_access_key_id=os.getenv('QC_AWS_ACCESS_KEY_ID'),
                aws_secret_access_key=os.getenv('QC_AWS_SECRET_ACCESS_KEY'),
                region_name=os.getenv('AWS_REGION', 'blr1'),
                config=Config(signature_version='s3v4')
            )
            # Construct expected QC path from original path
            qc_path = image.original_s3_path.rsplit('.', 1)[0] + '.jpg'
            head = qc_s3_client.head_object(
                Bucket=os.getenv('QC_S3_BUCKET_NAME'),
                Key=qc_path
            )
            if head['ContentLength'] > 0:
                # File exists! Update DB directly
                with Session(engine) as session:
                    db_image = session.get(Image, image.image_id)
                    if db_image:
                        db_image.qc_s3_path = qc_path
                        db_image.converted_file_type = 'JPEG'
                        db_image.conversion_status = ConversionStatus.Jpeg_Converted
                        session.commit()
                        logger.info(f"✅ Found existing JPEG, updated DB: {image.image_name}")
                return True
            return False
        except ClientError:
            return False
        except Exception as e:
            logger.debug(f"QC bucket check error for {image.image_name}: {e}")
            return False

    async def retry_stuck_conversion(self, image: Image) -> bool:
        """Retry conversion for a single stuck image"""
        image_key = str(image.image_id)

        # Check retry limit
        count = _retry_counts.get(image_key, 0)
        if count >= MAX_RETRIES_PER_IMAGE:
            logger.warning(f"⏭️ Skipping {image.image_name}: exceeded {MAX_RETRIES_PER_IMAGE} retries")
            return False

        # First check if JPEG already exists in QC bucket (skip conversion if so)
        if self._check_qc_bucket_exists(image):
            return True

        _retry_counts[image_key] = count + 1

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    self.function_url,
                    json={
                        "image_id": str(image.image_id),
                        "original_path": image.original_s3_path,
                        "original_bucket": os.getenv('S3_BUCKET_NAME'),
                        "qc_bucket": os.getenv('QC_S3_BUCKET_NAME'),
                        "api_secret": os.getenv('API_WEBHOOK_SECRET')
                    }
                )

                if response.status_code in [200, 202]:
                    logger.info(f"✅ Retried conversion ({count+1}/{MAX_RETRIES_PER_IMAGE}): {image.image_name}")
                    return True
                else:
                    logger.error(f"❌ Retry failed ({response.status_code}): {image.image_name}")
                    return False

        except Exception as e:
            logger.error(f"❌ Retry error for {image.image_name}: {e}")
            return False

    async def check_and_recover(self):
        """Main recovery loop - checks for stuck images and retries them"""
        if not self.function_url:
            logger.warning("⚠️  DO_FUNCTION_CONVERT_URL not set, recovery disabled")
            return

        # Find images stuck in Converting status for more than 10 minutes
        cutoff_time = get_ist_now() - timedelta(minutes=10)

        with Session(engine) as session:
            stuck_images = session.exec(
                select(Image)
                .where(Image.conversion_status == ConversionStatus.Jpeg_Converting)
                .where(Image.upload_date < cutoff_time)
            ).all()

            if not stuck_images:
                logger.debug("✅ No stuck images found")
                return

            logger.warning(f"🔍 Found {len(stuck_images)} stuck images, retrying with rate limiting...")

            batch_size = 5
            retry_count = 0

            for i in range(0, len(stuck_images), batch_size):
                batch = stuck_images[i:i + batch_size]
                logger.info(f"📦 Processing batch {i//batch_size + 1} ({len(batch)} images)")

                tasks = [self.retry_stuck_conversion(img) for img in batch]
                results = await asyncio.gather(*tasks, return_exceptions=True)

                batch_success = sum(1 for r in results if r is True)
                retry_count += batch_success

                if i + batch_size < len(stuck_images):
                    logger.info("⏳ Waiting 2s before next batch...")
                    await asyncio.sleep(2)

            logger.info(f"📊 Recovery complete: {retry_count}/{len(stuck_images)} retried")

    async def run(self):
        """Run the recovery service continuously"""
        self.running = True
        logger.info(f"🚀 Recovery service started (checking every {self.check_interval}s)")

        while self.running:
            try:
                await self.check_and_recover()
            except Exception as e:
                logger.error(f"❌ Recovery loop error: {e}")

            await asyncio.sleep(self.check_interval)

    def stop(self):
        """Stop the recovery service"""
        self.running = False
        logger.info("🛑 Recovery service stopped")


recovery_service = RecoveryService(check_interval_seconds=300)

async def start_recovery_service():
    await recovery_service.run()

def stop_recovery_service():
    recovery_service.stop()
