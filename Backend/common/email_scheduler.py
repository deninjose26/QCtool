"""
Background scheduler for email notifications
Integrated with FastAPI application
"""

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from datetime import datetime, timedelta
from sqlmodel import Session, select
from common.database import engine
from common.models import User, Batch, QCAllocation, UserRole, get_ist_now
from common.email_notifications import send_daily_upload_summary_email, send_daily_qc_summary_email
from common.system_logger import cleanup_old_logs
# from common.utils import get_ist_now  -- Fixed: This module does not exist
import logging

logger = logging.getLogger(__name__)

# Create scheduler instance
scheduler = AsyncIOScheduler()


async def send_daily_upload_reports():
    """Send daily upload summary to all Upload Managers at 9 AM"""
    logger.info("Running daily upload report task...")
    
    try:
        with Session(engine) as session:
            # Get all Upload Managers with email notifications enabled
            upload_managers = session.exec(
                select(User).where(
                    User.user_role == UserRole.Upload_Supervisor,
                    User.is_active == True,
                    User.email_notifications_enabled == True,
                    User.email != None
                )
            ).all()
            
            # Get batches from last 24 hours
            yesterday = get_ist_now() - timedelta(days=1)
            batches = session.exec(
                select(Batch).where(
                    Batch.created_date >= yesterday
                )
            ).all()
            
            # Prepare summary data
            summary_data = {
                'date': get_ist_now().strftime('%Y-%m-%d'),
                'total_batches': len(batches),
                'complete_uploads': len([b for b in batches if b.upload_type == 'Complete']),
                'partial_uploads': len([b for b in batches if b.upload_type == 'Partial']),
                'reuploads': len([b for b in batches if b.upload_type == 'Re-upload']),
                'total_images': sum(b.upload_count or 0 for b in batches),
                'batches': [
                    {
                        'vendor_name': b.vendor.name if b.vendor else 'N/A',
                        'project_name': b.project.project_name if b.project else 'N/A',
                        'source_name': b.source.source_name if b.source else 'N/A',
                        'location_name': b.location.location_name if b.location else 'N/A',
                        'record_owner_name': b.record_owner.name if b.record_owner else 'N/A',
                        'book_name': b.book_name or 'N/A',
                        'upload_type': b.upload_type,
                        'upload_count': b.upload_count or 0,
                        'status': b.status
                    }
                    for b in batches
                ]
            }
            
            # Send email to each manager
            for manager in upload_managers:
                try:
                    send_daily_upload_summary_email(
                        manager.email,
                        manager.name,
                        summary_data
                    )
                    logger.info(f"Sent upload summary to {manager.name} ({manager.email})")
                except Exception as e:
                    logger.error(f"Failed to send to {manager.name}: {str(e)}")
                    
    except Exception as e:
        logger.error(f"Error in daily upload reports: {str(e)}")


async def send_daily_qc_reports():
    """Send daily QC summary to all QC Managers at 9 AM"""
    logger.info("Running daily QC report task...")
    
    try:
        with Session(engine) as session:
            # Get all QC Managers with email notifications enabled
            qc_managers = session.exec(
                select(User).where(
                    User.user_role == UserRole.QC_Supervisor,
                    User.is_active == True,
                    User.email_notifications_enabled == True,
                    User.email != None
                )
            ).all()
            
            # Get QC allocations completed in last 24 hours
            yesterday = get_ist_now() - timedelta(days=1)
            completed_allocations = session.exec(
                select(QCAllocation).where(
                    QCAllocation.qc_completed_date >= yesterday,
                    QCAllocation.qc_batch_status == 'Completed'
                )
            ).all()
            
            # Calculate summary
            total_images = sum(a.batch.total_count or 0 for a in completed_allocations if a.batch)
            total_accepted = sum(a.accepted_count or 0 for a in completed_allocations)
            total_rejected = sum(a.rejected_count or 0 for a in completed_allocations)
            accuracy_rate = round((total_accepted / total_images * 100) if total_images > 0 else 0, 2)
            
            summary_data = {
                'date': get_ist_now().strftime('%Y-%m-%d'),
                'completed_batches': len(completed_allocations),
                'total_images': total_images,
                'total_accepted': total_accepted,
                'total_rejected': total_rejected,
                'accuracy_rate': accuracy_rate,
                'batches': [
                    {
                        'qc_user_name': a.qc_user.name if a.qc_user else 'N/A',
                        'project_name': a.batch.project.project_name if a.batch and a.batch.project else 'N/A',
                        'source_name': a.batch.source.source_name if a.batch and a.batch.source else 'N/A',
                        'location_name': a.batch.location.location_name if a.batch and a.batch.location else 'N/A',
                        'record_owner_name': a.batch.record_owner.name if a.batch and a.batch.record_owner else 'N/A',
                        'book_name': a.batch.book_name if a.batch else 'N/A',
                        'total_count': a.batch.total_count or 0 if a.batch else 0,
                        'accepted_count': a.accepted_count or 0,
                        'rejected_count': a.rejected_count or 0
                    }
                    for a in completed_allocations
                ]
            }
            
            # Send email to each manager
            for manager in qc_managers:
                try:
                    send_daily_qc_summary_email(
                        manager.email,
                        manager.name,
                        summary_data
                    )
                    logger.info(f"Sent QC summary to {manager.name} ({manager.email})")
                except Exception as e:
                    logger.error(f"Failed to send to {manager.name}: {str(e)}")
                    
    except Exception as e:
        logger.error(f"Error in daily QC reports: {str(e)}")


def start_scheduler():
    """Initialize and start the scheduler"""
    # Schedule daily reports at 9:00 AM IST
    scheduler.add_job(
        send_daily_upload_reports,
        CronTrigger(hour=9, minute=0, timezone='Asia/Kolkata'),
        id='daily_upload_reports',
        name='Send daily upload summary emails',
        replace_existing=True
    )
    
    scheduler.add_job(
        send_daily_qc_reports,
        CronTrigger(hour=9, minute=0, timezone='Asia/Kolkata'),
        id='daily_qc_reports',
        name='Send daily QC summary emails',
        replace_existing=True
    )
    
    scheduler.add_job(
        cleanup_old_logs,
        CronTrigger(hour=0, minute=0, timezone='Asia/Kolkata'),
        id='system_logs_cleanup',
        name='Clean up system logs older than 30 days',
        replace_existing=True
    )
    
    scheduler.start()
    logger.info("Email scheduler started successfully")
    logger.info("Scheduled tasks:")
    logger.info("  - Daily Upload Reports: 09:00 AM IST")
    logger.info("  - Daily QC Reports: 09:00 AM IST")


def shutdown_scheduler():
    """Shutdown the scheduler gracefully"""
    scheduler.shutdown()
    logger.info("Email scheduler shut down")
