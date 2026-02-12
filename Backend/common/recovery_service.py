"""
Automatic Background Recovery Service
Runs continuously to detect and retry stuck conversions
"""

import os
import asyncio
from datetime import datetime, timedelta
from sqlmodel import Session, select
from common.database import engine
from common.models import Image, ConversionStatus
import httpx
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('recovery_service')

class RecoveryService:
    """Background service to automatically recover stuck conversions"""
    
    def __init__(self, check_interval_seconds: int = 300):  # 5 minutes default
        self.check_interval = check_interval_seconds
        self.function_url = os.getenv('DO_FUNCTION_CONVERT_URL')
        self.running = False
        
    async def retry_stuck_conversion(self, image: Image) -> bool:
        """Retry conversion for a single stuck image"""
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
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
                    logger.info(f"✅ Retried conversion: {image.image_name}")
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
        cutoff_time = datetime.utcnow() - timedelta(minutes=10)
        
        with Session(engine) as session:
            stuck_images = session.exec(
                select(Image)
                .where(Image.conversion_status == ConversionStatus.Jpeg_Converting)
                .where(Image.upload_date < cutoff_time)
            ).all()
            
            if not stuck_images:
                logger.debug(f"✅ No stuck images found")
                return
            
            logger.warning(f"🔍 Found {len(stuck_images)} stuck images, retrying with rate limiting...")
            
            # Rate limiting: Process in batches of 5 to avoid overloading server
            batch_size = 5
            retry_count = 0
            
            for i in range(0, len(stuck_images), batch_size):
                batch = stuck_images[i:i + batch_size]
                logger.info(f"📦 Processing batch {i//batch_size + 1} ({len(batch)} images)")
                
                # Process batch concurrently (but limited to batch_size)
                tasks = [self.retry_stuck_conversion(img) for img in batch]
                results = await asyncio.gather(*tasks, return_exceptions=True)
                
                # Count successes
                batch_success = sum(1 for r in results if r is True)
                retry_count += batch_success
                
                # Delay between batches to avoid overwhelming the system
                if i + batch_size < len(stuck_images):
                    logger.info(f"⏳ Waiting 2s before next batch...")
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
            
            # Wait before next check
            await asyncio.sleep(self.check_interval)
    
    def stop(self):
        """Stop the recovery service"""
        self.running = False
        logger.info("🛑 Recovery service stopped")

# Global instance
recovery_service = RecoveryService(check_interval_seconds=300)  # Check every 5 minutes

async def start_recovery_service():
    """Start the background recovery service"""
    await recovery_service.run()

def stop_recovery_service():
    """Stop the background recovery service"""
    recovery_service.stop()
