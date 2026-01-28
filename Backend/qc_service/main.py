from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from typing import List, Optional
from uuid import UUID
from datetime import datetime

from common.database import get_session
from common.models import (
    User, UserRole, Batch, Upload, QCAllocation, QCBatchStatus, 
    Project, Source, Location, RecordOwner, RecordType, RecordName, 
    QC, QCStatus, Image, get_ist_now
)
from common.auth_utils import get_current_user, role_required
from common.notification_utils import create_notification
from common.models import NotificationType
from pydantic import BaseModel
from sqlalchemy.orm import aliased
from sqlalchemy import func

router = APIRouter(prefix="/qc", tags=["QC User Operations"])

class QCUserTask(BaseModel):
    qc_allocation_id: UUID
    batch_uid: UUID
    batch_id: str
    project_name: str
    source_name: str
    location_name: str
    record_owner_name: str
    record_type_name: str
    book_name: str
    total_count: int
    upload_count: int
    qc_done_count: int 
    accepted_count: int = 0
    rejected_count: int = 0
    allocation_date: datetime
    qc_completed_date: Optional[datetime] = None
    qc_batch_status: QCBatchStatus
    upload_type: str

class QCImageDetail(BaseModel):
    qc_id: UUID
    image_id: UUID
    image_name: str
    qc_s3_path: Optional[str]
    original_s3_path: str  # Added fallback path
    qc_status: QCStatus
    orientation_error: bool
    remarks: Optional[str]
    conversion_status: str

class QCDecisionRequest(BaseModel):
    qc_status: QCStatus
    orientation_error: bool = False
    remarks: Optional[str] = None

@router.get("/my-tasks", response_model=List[QCUserTask])
def get_my_tasks(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """List all active QC tasks for the current user (QC User or Supervisor)"""
    if current_user.user_role not in [UserRole.QC_User, UserRole.QC_Supervisor, UserRole.Upload_Supervisor]:
        raise HTTPException(status_code=403, detail="Access denied.")

    statement = (
        select(
            QCAllocation,
            Batch,
            Project.project_name,
            Source.source_name,
            Location.location_name,
            RecordOwner.record_owner_name,
            RecordType.record_type_name,
            RecordName.record_name
        )
        .join(Batch, QCAllocation.batch_uid == Batch.batch_uid)
        .join(Source, Batch.source_id == Source.source_id)
        .join(Location, Batch.location_id == Location.location_id)
        .join(Project, Source.project_id == Project.project_id)
        .join(RecordOwner, Batch.record_owner_id == RecordOwner.record_owner_id)
        .join(RecordType, Batch.record_type_id == RecordType.record_type_id)
        .join(RecordName, Batch.record_name_id == RecordName.record_name_id)
        .where(QCAllocation.allocated_to_qc_user == current_user.user_id)
        .where(QCAllocation.qc_batch_status.in_([QCBatchStatus.Allocated, QCBatchStatus.QC_Pending, QCBatchStatus.QC_In_Progress]))
        .order_by(QCAllocation.allocation_date.desc())
    )

    results = session.exec(statement).all()
    
    tasks = []
    for qca, batch, proj, src, loc, owner, rtype, rname in results:
        qc_done = session.exec(
            select(func.count(QC.qc_id))
            .where(QC.qc_allocation_id == qca.qc_allocation_id)
            .where(QC.qc_status != QCStatus.Pending)
        ).first() or 0

        tasks.append(QCUserTask(
            qc_allocation_id=qca.qc_allocation_id,
            batch_uid=batch.batch_uid,
            batch_id=batch.batch_id,
            project_name=proj,
            source_name=src,
            location_name=loc,
            record_owner_name=owner,
            record_type_name=rtype,
            book_name=rname,
            total_count=batch.total_count,
            upload_count=batch.upload_count,
            qc_done_count=qc_done,
            accepted_count=0, # Not strictly needed for tasks but satisfies schema
            rejected_count=0,
            allocation_date=qca.allocation_date,
            qc_completed_date=None,
            qc_batch_status=qca.qc_batch_status,
            upload_type="Re-upload" if batch.is_reupload else ("Partial" if batch.is_partial else "Complete")
        ))
    
    return tasks

@router.get("/my-history", response_model=List[QCUserTask])
def get_my_history(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """List all completed and verified batches for the current user"""
    if current_user.user_role not in [UserRole.QC_User, UserRole.QC_Supervisor, UserRole.Upload_Supervisor]:
        raise HTTPException(status_code=403, detail="Access denied.")

    statement = (
        select(
            QCAllocation,
            Batch,
            Project.project_name,
            Source.source_name,
            Location.location_name,
            RecordOwner.record_owner_name,
            RecordType.record_type_name,
            RecordName.record_name
        )
        .join(Batch, QCAllocation.batch_uid == Batch.batch_uid)
        .join(Source, Batch.source_id == Source.source_id)
        .join(Location, Batch.location_id == Location.location_id)
        .join(Project, Source.project_id == Project.project_id)
        .join(RecordOwner, Batch.record_owner_id == RecordOwner.record_owner_id)
        .join(RecordType, Batch.record_type_id == RecordType.record_type_id)
        .join(RecordName, Batch.record_name_id == RecordName.record_name_id)
        .where(QCAllocation.allocated_to_qc_user == current_user.user_id)
        .where(QCAllocation.qc_batch_status.in_([
            QCBatchStatus.Completed, 
            QCBatchStatus.Verified, 
            QCBatchStatus.Verified_With_Rejection
        ]))
        .order_by(QCAllocation.qc_completed_date.desc())
    )

    results = session.exec(statement).all()
    
    history = []
    for qca, batch, proj, src, loc, owner, rtype, rname in results:
        qc_done = session.exec(
            select(func.count(QC.qc_id))
            .where(QC.qc_allocation_id == qca.qc_allocation_id)
            .where(QC.qc_status != QCStatus.Pending)
        ).first() or 0

        accepted = session.exec(
            select(func.count(QC.qc_id))
            .where(QC.qc_allocation_id == qca.qc_allocation_id)
            .where(QC.qc_status == QCStatus.Approved)
        ).first() or 0

        rejected = session.exec(
            select(func.count(QC.qc_id))
            .where(QC.qc_allocation_id == qca.qc_allocation_id)
            .where(QC.qc_status == QCStatus.Rejected)
        ).first() or 0

        history.append(QCUserTask(
            qc_allocation_id=qca.qc_allocation_id,
            batch_uid=batch.batch_uid,
            batch_id=batch.batch_id,
            project_name=proj,
            source_name=src,
            location_name=loc,
            record_owner_name=owner,
            record_type_name=rtype,
            book_name=rname,
            total_count=batch.total_count,
            upload_count=batch.upload_count,
            qc_done_count=qc_done,
            accepted_count=accepted,
            rejected_count=rejected,
            allocation_date=qca.allocation_date,
            qc_completed_date=qca.qc_completed_date,
            qc_batch_status=qca.qc_batch_status,
            upload_type="Re-upload" if batch.is_reupload else ("Partial" if batch.is_partial else "Complete")
        ))
    
    return history

@router.get("/batch-images/{batch_uid}")
def get_batch_images(
    batch_uid: UUID,
    filter_status: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Get images for a batch with their QC status (paginated)"""
    # Verify allocation
    allocation = session.exec(
        select(QCAllocation)
        .where(QCAllocation.batch_uid == batch_uid)
        .where(QCAllocation.allocated_to_qc_user == current_user.user_id)
    ).first()
    
    if not allocation:
        raise HTTPException(status_code=404, detail="Batch not found or not allocated to you")
    
    # Auto-create missing QC records if any (robustness fix)
    from sqlalchemy import func
    from common.models import QC, QCStatus, Image
    
    # Get all images for this batch
    all_images = session.exec(select(Image).where(Image.batch_uid == batch_uid)).all()
    # Get count of existing QC records for this allocation
    qc_count = session.exec(
        select(func.count(QC.qc_id))
        .where(QC.qc_allocation_id == allocation.qc_allocation_id)
    ).first() or 0
    
    if len(all_images) > qc_count:
        # Some images are missing QC records for this allocation, create them
        for img in all_images:
            existing_qc = session.exec(
                select(QC)
                .where(QC.qc_allocation_id == allocation.qc_allocation_id)
                .where(QC.image_id == img.image_id)
            ).first()
            if not existing_qc:
                session.add(QC(
                    qc_allocation_id=allocation.qc_allocation_id,
                    image_id=img.image_id,
                    qc_status=QCStatus.Pending
                ))
        session.commit()
        # Refresh allocation if needed (not strictly required here but good practice)
        session.refresh(allocation)

    # Build base query
    statement = (
        select(QC, Image)
        .join(Image, QC.image_id == Image.image_id)
        .where(QC.qc_allocation_id == allocation.qc_allocation_id)
    )
    
    # Apply filter if provided
    if filter_status and filter_status != 'all':
        if filter_status == 'pending':
            statement = statement.where(QC.qc_status == QCStatus.Pending)
        elif filter_status == 'accepted':
            statement = statement.where(QC.qc_status == QCStatus.Approved)
        elif filter_status == 'rejected':
            statement = statement.where(QC.qc_status == QCStatus.Rejected)
    
    # Get total count before pagination
    count_statement = select(func.count()).select_from(statement.subquery())
    total_count = session.exec(count_statement).first() or 0
    
    # Apply pagination
    statement = statement.offset(offset).limit(limit)
    
    results = session.exec(statement).all()
    
    # Import S3 client
    import boto3
    import os
    from botocore.client import Config
    
    # Initialize S3 clients for both buckets
    qc_s3_client = boto3.client(
        's3',
        endpoint_url=os.getenv('QC_ENDPOINT_URL'),
        aws_access_key_id=os.getenv('QC_AWS_ACCESS_KEY_ID'),
        aws_secret_access_key=os.getenv('QC_AWS_SECRET_ACCESS_KEY'),
        region_name=os.getenv('QC_AWS_REGION'),
        config=Config(signature_version='s3v4')
    )
    
    original_s3_client = boto3.client(
        's3',
        endpoint_url=os.getenv('ENDPOINT_URL'),
        aws_access_key_id=os.getenv('AWS_ACCESS_KEY_ID'),
        aws_secret_access_key=os.getenv('AWS_SECRET_ACCESS_KEY'),
        region_name=os.getenv('AWS_REGION'),
        config=Config(signature_version='s3v4')
    )
    
    images = []
    for qc, img in results:
        # Generate presigned URLs
        qc_url = None
        if img.qc_s3_path:
            try:
                # Remove bucket name from path if present
                qc_key = img.qc_s3_path.replace(f"{os.getenv('QC_S3_BUCKET_NAME')}/", "")
                qc_url = qc_s3_client.generate_presigned_url(
                    'get_object',
                    Params={
                        'Bucket': os.getenv('QC_S3_BUCKET_NAME'),
                        'Key': qc_key
                    },
                    ExpiresIn=3600  # 1 hour
                )
            except Exception as e:
                print(f"Error generating QC presigned URL: {e}")
        
        # Generate presigned URL for original image
        try:
            original_key = img.original_s3_path.replace(f"{os.getenv('S3_BUCKET_NAME')}/", "")
            original_url = original_s3_client.generate_presigned_url(
                'get_object',
                Params={
                    'Bucket': os.getenv('S3_BUCKET_NAME'),
                    'Key': original_key
                },
                ExpiresIn=3600  # 1 hour
            )
        except Exception as e:
            print(f"Error generating original presigned URL: {e}")
            original_url = img.original_s3_path
        
        images.append({
            "qc_id": qc.qc_id,
            "image_id": img.image_id,
            "image_name": img.image_name,
            "qc_s3_path": qc_url,
            "original_s3_path": original_url,
            "qc_status": qc.qc_status,
            "orientation_error": qc.orientation_error,
            "remarks": qc.remarks,
            "conversion_status": img.conversion_status
        })
    
    return {
        "images": images,
        "total": total_count,
        "limit": limit,
        "offset": offset,
        "has_more": (offset + limit) < total_count
    }

@router.post("/decision/{qc_id}")
def submit_qc_decision(
    qc_id: UUID,
    decision: QCDecisionRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Submit QC decision for an image"""
    qc = session.get(QC, qc_id)
    if not qc:
        raise HTTPException(status_code=404, detail="QC record not found")
    
    # Verify this QC belongs to user's allocation
    allocation = session.get(QCAllocation, qc.qc_allocation_id)
    if not allocation or allocation.allocated_to_qc_user != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Update QC record
    qc.qc_status = decision.qc_status
    qc.orientation_error = decision.orientation_error
    
    # Clear remarks if approved
    if qc.qc_status == QCStatus.Approved:
        qc.remarks = None
    else:
        qc.remarks = decision.remarks
        
    qc.qc_date = get_ist_now()
    
    session.add(qc)
    
    # Update allocation status if needed
    if allocation.qc_batch_status == QCBatchStatus.Allocated:
        allocation.qc_batch_status = QCBatchStatus.QC_In_Progress
        session.add(allocation)
    
    session.commit()
    
    return {"message": "QC decision recorded successfully"}

@router.post("/complete-task/{allocation_id}")
def complete_qc_task(
    allocation_id: UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Mark a QC allocation as completed"""
    allocation = session.get(QCAllocation, allocation_id)
    if not allocation:
        raise HTTPException(status_code=404, detail="Allocation not found")
        
    if allocation.allocated_to_qc_user != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized to complete this task")
        
    # Optional: Verify if all images are actually QC'd
    # For now, we trust the UI/Frontend request as per user plan
    
    allocation.qc_batch_status = QCBatchStatus.Completed
    allocation.qc_completed_date = get_ist_now()
    session.add(allocation)
    
    # --- Trigger Notification ---
    try:
        # Get batch ID for message
        batch = session.get(Batch, allocation.batch_uid)
        batch_id_str = batch.batch_id if batch else "Unknown"
        
        create_notification(
            session=session,
            user_id=allocation.allocated_by_supervisor,
            notif_type=NotificationType.Conversion_Complete, # Reusing for verification ready
            title="QC Task Completed",
            message=f"QC User {current_user.name} has completed quality check for Batch {batch_id_str}. Ready for your verification.",
            link="/qc-review-queue"  # QC Supervisor review queue
        )
    except Exception as e:
        print(f"⚠️ Failed to create notification: {e}")

    session.commit()
    
    return {"message": "QC Task marked as completed successfully"}
@router.get("/export-batch/{batch_uid}")
def export_batch_details(
    batch_uid: UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Get all image QC details for a batch for export purposes"""
    # Allow QC_Supervisor and SuperAdmin to export any batch report
    # QC_User can only export batches allocated to them
    statement = select(QCAllocation).where(QCAllocation.batch_uid == batch_uid)
    
    if current_user.user_role == UserRole.QC_User:
        statement = statement.where(QCAllocation.allocated_to_qc_user == current_user.user_id)
    elif current_user.user_role not in [UserRole.QC_Supervisor, UserRole.SuperAdmin]:
        raise HTTPException(status_code=403, detail="Access denied")

    allocation = session.exec(statement).first()
    
    if not allocation:
        raise HTTPException(status_code=404, detail="Batch not found or not authorized")
    
    # Get all images and their QC records
    statement = (
        select(QC, Image)
        .join(Image, QC.image_id == Image.image_id)
        .where(QC.qc_allocation_id == allocation.qc_allocation_id)
        .order_by(Image.image_name)
    )
    
    results = session.exec(statement).all()
    
    export_data = []
    for qc, img in results:
        export_data.append({
            "image_name": img.image_name,
            "qc_status": qc.qc_status,
            "orientation_error": "Yes" if qc.orientation_error else "No",
            "remarks": qc.remarks or "",
            "qc_date": qc.qc_date.strftime("%Y-%m-%d %H:%M:%S") if qc.qc_date else ""
        })
    
    return export_data
