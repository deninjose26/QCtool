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

import boto3
import os
from botocore.client import Config

# Initialize S3 clients once at module level to avoid overhead on every request
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

    from sqlalchemy import case, func
    qc_stats = select(
        QC.qc_allocation_id,
        func.count(QC.qc_id).filter(QC.qc_status != QCStatus.Pending).label("done_count")
    ).group_by(QC.qc_allocation_id).subquery()

    statement = (
        select(
            QCAllocation,
            Batch,
            Project.project_name,
            Source.source_name,
            Location.location_name,
            RecordOwner.record_owner_name,
            RecordType.record_type_name,
            RecordName.record_name,
            qc_stats.c.done_count
        )
        .join(Batch, QCAllocation.batch_uid == Batch.batch_uid)
        .join(Source, Batch.source_id == Source.source_id)
        .join(Location, Batch.location_id == Location.location_id)
        .join(Project, Source.project_id == Project.project_id)
        .join(RecordOwner, Batch.record_owner_id == RecordOwner.record_owner_id)
        .join(RecordType, Batch.record_type_id == RecordType.record_type_id)
        .join(RecordName, Batch.record_name_id == RecordName.record_name_id)
        .outerjoin(qc_stats, QCAllocation.qc_allocation_id == qc_stats.c.qc_allocation_id)
        .where(QCAllocation.allocated_to_qc_user == current_user.user_id)
        .where(QCAllocation.qc_batch_status.in_([QCBatchStatus.Allocated, QCBatchStatus.QC_Pending, QCBatchStatus.QC_In_Progress]))
        .order_by(QCAllocation.allocation_date.desc())
    )

    results = session.exec(statement).all()
    
    tasks = []
    for qca, batch, proj, src, loc, owner, rtype, rname, qc_done in results:
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
            qc_done_count=qc_done or 0,
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

    from sqlalchemy import case, func
    qc_stats = select(
        QC.qc_allocation_id,
        func.sum(case((QC.qc_status != QCStatus.Pending, 1), else_=0)).label("done_count"),
        func.sum(case((QC.qc_status == QCStatus.Approved, 1), else_=0)).label("accepted_count"),
        func.sum(case((QC.qc_status == QCStatus.Rejected, 1), else_=0)).label("rejected_count")
    ).group_by(QC.qc_allocation_id).subquery()

    statement = (
        select(
            QCAllocation,
            Batch,
            Project.project_name,
            Source.source_name,
            Location.location_name,
            RecordOwner.record_owner_name,
            RecordType.record_type_name,
            RecordName.record_name,
            qc_stats.c.done_count, qc_stats.c.accepted_count, qc_stats.c.rejected_count
        )
        .join(Batch, QCAllocation.batch_uid == Batch.batch_uid)
        .join(Source, Batch.source_id == Source.source_id)
        .join(Location, Batch.location_id == Location.location_id)
        .join(Project, Source.project_id == Project.project_id)
        .join(RecordOwner, Batch.record_owner_id == RecordOwner.record_owner_id)
        .join(RecordType, Batch.record_type_id == RecordType.record_type_id)
        .join(RecordName, Batch.record_name_id == RecordName.record_name_id)
        .outerjoin(qc_stats, QCAllocation.qc_allocation_id == qc_stats.c.qc_allocation_id)
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
    for qca, batch, proj, src, loc, owner, rtype, rname, qc_done, accepted, rejected in results:
        qc_done = qc_done or 0
        accepted = accepted or 0
        rejected = rejected or 0

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
    limit: int = 200,
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
    # Using a single set-based query to find missing images instead of a loop
    missing_images_stmt = (
        select(Image.image_id)
        .where(Image.batch_uid == batch_uid)
        .where(
            Image.image_id.not_in(
                select(QC.image_id).where(QC.qc_allocation_id == allocation.qc_allocation_id)
            )
        )
    )
    missing_image_ids = session.exec(missing_images_stmt).all()
    
    if missing_image_ids:
        print(f"[QC-INIT] Creating {len(missing_image_ids)} missing QC records for batch {batch_uid}")
        new_records = [
            QC(
                qc_allocation_id=allocation.qc_allocation_id,
                image_id=img_id,
                qc_status=QCStatus.Pending
            )
            for img_id in missing_image_ids
        ]
        session.add_all(new_records)
        session.commit()

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
    
    images = []
    qc_bucket_name = os.getenv('QC_S3_BUCKET_NAME')
    original_bucket_name = os.getenv('S3_BUCKET_NAME')
    
    for qc, img in results:
        # Generate presigned URLs
        qc_url = None
        if img.qc_s3_path:
            try:
                # Remove bucket name from path if present
                qc_key = img.qc_s3_path.replace(f"{qc_bucket_name}/", "")
                qc_url = qc_s3_client.generate_presigned_url(
                    'get_object',
                    Params={
                        'Bucket': qc_bucket_name,
                        'Key': qc_key
                    },
                    ExpiresIn=3600  # 1 hour
                )
            except Exception as e:
                print(f"Error generating QC presigned URL: {e}")
        
        # Generate presigned URL for original image (Used for fallback/details)
        original_url = None
        try:
            original_key = img.original_s3_path.replace(f"{original_bucket_name}/", "")
            original_url = original_s3_client.generate_presigned_url(
                'get_object',
                Params={
                    'Bucket': original_bucket_name,
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
    
    # Get global statistics for this allocation (only for images currently in the batch)
    stats_statement = (
        select(QC.qc_status, func.count(QC.qc_id))
        .join(Image, QC.image_id == Image.image_id)
        .where(QC.qc_allocation_id == allocation.qc_allocation_id)
        .where(Image.batch_uid == batch_uid)
        .group_by(QC.qc_status)
    )
    stats_results = session.exec(stats_statement).all()
    
    pending_count = 0
    accepted_count = 0
    rejected_count = 0
    
    for status, count in stats_results:
        if status == QCStatus.Pending:
            pending_count = count
        elif status == QCStatus.Approved:
            accepted_count = count
        elif status == QCStatus.Rejected:
            rejected_count = count

    return {
        "images": images,
        "total": total_count,
        "limit": limit,
        "offset": offset,
        "has_more": (offset + limit) < total_count,
        "pending_count": pending_count,
        "accepted_count": accepted_count,
        "rejected_count": rejected_count
    }

@router.post("/decision/{qc_id}")
def submit_qc_decision(
    qc_id: UUID,
    decision: QCDecisionRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Submit QC decision for an image"""
    from common.audit_logger import log_action
    qc = session.get(QC, qc_id)
    if not qc:
        raise HTTPException(status_code=404, detail="QC record not found")
    
    # Verify this QC belongs to user's allocation
    allocation = session.get(QCAllocation, qc.qc_allocation_id)
    if not allocation or allocation.allocated_to_qc_user != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Get image name for logging
    image = session.get(Image, qc.image_id)
    image_name = image.image_name if image else "Unknown"
    old_status = qc.qc_status.value

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
        
        # Log QC Started
        log_action(
            session=session,
            user_id=current_user.user_id,
            username=current_user.username,
            action="QC Started",
            endpoint=f"/qc/decision/{qc_id}",
            method="POST",
            payload={
                "allocation_id": str(qc.qc_allocation_id),
                "batch_uid": str(allocation.batch_uid)
            },
            result="success"
        )
    
    session.commit()

    # Log the action (Optional: might be noisy, but good for critical audits)
    # log_action(
    #     session=session,
    #     user_id=current_user.user_id,
    #     username=current_user.username,
    #     action="Image QC Updated",
    #     endpoint=f"/qc/decision/{qc_id}",
    #     method="POST",
    #     payload={
    #         "qc_id": str(qc_id),
    #         "image_name": image_name,
    #         "old_status": old_status,
    #         "new_status": qc.qc_status.value
    #     },
    #     result="success"
    # )
    
    return {"message": "QC decision recorded successfully"}

@router.post("/complete-task/{allocation_id}")
def complete_qc_task(
    allocation_id: UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Mark a QC allocation as completed"""
    from common.audit_logger import log_action
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
    
    # Get batch ID for naming/logging
    batch = session.get(Batch, allocation.batch_uid)
    batch_id_str = batch.batch_id if batch else "Unknown"

    # --- Trigger Notification ---
    try:
        create_notification(
            session=session,
            user_id=allocation.allocated_by_supervisor,
            notif_type=NotificationType.conversion_complete, # Reusing for verification ready
            title="QC Task Completed",
            message=f"QC User {current_user.name} has completed quality check for Batch {batch_id_str}. Ready for your verification.",
            link="/qc-review-queue"  # QC Supervisor review queue
        )
    except Exception as e:
        print(f"⚠️ Failed to create notification: {e}")

    session.commit()

    # Log the action
    log_action(
        session=session,
        user_id=current_user.user_id,
        username=current_user.username,
        action="QC Task Completed",
        endpoint=f"/qc/complete-task/{allocation_id}",
        method="POST",
        payload={
            "allocation_id": str(allocation_id),
            "batch_id": batch_id_str
        },
        result="success"
    )
    
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
    elif current_user.user_role not in [UserRole.QC_Supervisor, UserRole.SuperAdmin, UserRole.Upload_Supervisor]:
        raise HTTPException(status_code=403, detail="Access denied")

    allocation = session.exec(statement).first()
    
    if not allocation:
        raise HTTPException(status_code=404, detail="Batch not found or not authorized")
    
    # Lineage awareness: if this is a rework batch, we should include images from parent versions
    all_allocation_ids = [allocation.qc_allocation_id]
    curr_batch = session.get(Batch, batch_uid)
    
    if curr_batch and curr_batch.is_reupload:
        curr_parent_uid = curr_batch.parent_batch_uid
        visited = {batch_uid}
        while curr_parent_uid and curr_parent_uid not in visited:
            p_batch = session.get(Batch, curr_parent_uid)
            if not p_batch: break
            
            p_qca = session.exec(select(QCAllocation).where(QCAllocation.batch_uid == p_batch.batch_uid)).first()
            if p_qca:
                all_allocation_ids.append(p_qca.qc_allocation_id)
            
            visited.add(curr_parent_uid)
            curr_parent_uid = p_batch.parent_batch_uid

    # Get all images and their QC records for the entire lineage
    # We order by date desc so if an image was rejected then fixed, we can potentially filter (though for accepted batches they should all be good)
    statement = (
        select(QC, Image)
        .join(Image, QC.image_id == Image.image_id)
        .where(QC.qc_allocation_id.in_(all_allocation_ids))
        .order_by(Image.image_name, QC.qc_date.desc())
    )
    
    results = session.exec(statement).all()
    
    # Fetch batch metadata for enriched export (Pandit Name, Bahi Name, Location)
    batch_info = {}
    if curr_batch:
        record_owner = session.get(RecordOwner, curr_batch.record_owner_id)
        record_name = session.get(RecordName, curr_batch.record_name_id)
        location = session.get(Location, curr_batch.location_id)
        batch_info = {
            "record_owner_name": record_owner.record_owner_name if record_owner else "",
            "record_name": record_name.record_name if record_name else "",
            "location_name": location.location_name if location else "",
            "batch_id": curr_batch.batch_id
        }

    export_data = []
    seen_images = set()

    for qc, img in results:
        if img.image_name in seen_images:
            continue

        export_data.append({
            "record_owner_name": batch_info.get("record_owner_name", ""),
            "record_name": batch_info.get("record_name", ""),
            "location_name": batch_info.get("location_name", ""),
            "image_name": img.image_name,
            "qc_status": qc.qc_status,
            "orientation_error": "Yes" if qc.orientation_error else "No",
            "remarks": qc.remarks or "",
            "qc_date": qc.qc_date.strftime("%Y-%m-%d %H:%M:%S") if qc.qc_date else "",
            "batch_id": batch_info.get("batch_id", "")
        })
        seen_images.add(img.image_name)

    export_data.sort(key=lambda x: x['image_name'])

    return export_data

@router.get("/export-combined-report")
def export_combined_report(
    record_owner_ids: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    project_id: Optional[UUID] = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """
    Combined CSV/Excel export across multiple pandits/batches.
    Includes: Pandit Name, Bahi Name, Location, Image Number, Status, Date.
    """
    # Access control
    if current_user.user_role not in [UserRole.QC_Supervisor, UserRole.SuperAdmin, UserRole.Upload_Supervisor]:
        raise HTTPException(status_code=403, detail="Access denied")

    # Build base query: QC -> Image -> QCAllocation -> Batch -> RecordOwner, RecordName, Location
    statement = (
        select(QC, Image, Batch, RecordOwner, RecordName, Location)
        .join(Image, QC.image_id == Image.image_id)
        .join(QCAllocation, QC.qc_allocation_id == QCAllocation.qc_allocation_id)
        .join(Batch, QCAllocation.batch_uid == Batch.batch_uid)
        .join(RecordOwner, Batch.record_owner_id == RecordOwner.record_owner_id)
        .join(RecordName, Batch.record_name_id == RecordName.record_name_id)
        .join(Location, Batch.location_id == Location.location_id)
    )

    # Filter by record owners (pandits)
    if record_owner_ids:
        try:
            owner_uuids = [UUID(uid.strip()) for uid in record_owner_ids.split(",") if uid.strip()]
            if owner_uuids:
                statement = statement.where(Batch.record_owner_id.in_(owner_uuids))
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid record_owner_ids format")

    # Filter by date range
    if date_from:
        try:
            from_date = datetime.strptime(date_from, "%Y-%m-%d")
            statement = statement.where(QC.qc_date >= from_date)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date_from format (use YYYY-MM-DD)")

    if date_to:
        try:
            to_date = datetime.strptime(date_to, "%Y-%m-%d").replace(hour=23, minute=59, second=59)
            statement = statement.where(QC.qc_date <= to_date)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date_to format (use YYYY-MM-DD)")

    # Filter by project
    if project_id:
        statement = statement.where(Batch.source_id.in_(
            select(Source.source_id).where(Source.project_id == project_id)
        ))

    statement = statement.order_by(RecordOwner.record_owner_name, RecordName.record_name, Image.image_name)

    results = session.exec(statement).all()

    export_data = []
    for qc, img, batch, owner, rec_name, loc in results:
        export_data.append({
            "record_owner_name": owner.record_owner_name,
            "record_name": rec_name.record_name,
            "location_name": loc.location_name,
            "image_name": img.image_name,
            "qc_status": qc.qc_status,
            "orientation_error": "Yes" if qc.orientation_error else "No",
            "remarks": qc.remarks or "",
            "qc_date": qc.qc_date.strftime("%Y-%m-%d %H:%M:%S") if qc.qc_date else "",
            "batch_id": batch.batch_id
        })

    return export_data

@router.get("/record-owners")
def get_record_owners_for_export(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Get list of record owners (pandits) for combined report filter."""
    if current_user.user_role not in [UserRole.QC_Supervisor, UserRole.SuperAdmin, UserRole.Upload_Supervisor]:
        raise HTTPException(status_code=403, detail="Access denied")

    owners = session.exec(
        select(RecordOwner.record_owner_id, RecordOwner.record_owner_name)
        .distinct()
    ).all()

    return [{"record_owner_id": str(o[0]), "record_owner_name": o[1]} for o in owners]
