from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from sqlalchemy.orm import aliased
from typing import List, Optional
from uuid import UUID

from common.database import get_session
from common.models import (
    User, UserRole, Batch, Upload, QCAllocation, QCBatchStatus, UploadStatus,
    Project, Source, Location, RecordOwner, RecordType, ScanningOperatorAllocation,
    RecordName, VendorAllocation, get_ist_now
)
from common.auth_utils import get_current_user, role_required
from common.security import get_password_hash
from common.notification_utils import create_notification
from common.models import NotificationType

router = APIRouter(prefix="/qc-sup", tags=["QC Supervisor"])

from datetime import datetime
from pydantic import BaseModel

# --- Schemas ---
class QCUserRead(BaseModel):
    user_id: UUID
    name: str
    username: str
    email: str
    user_role: UserRole
    created_date: datetime
    created_by_name: str

class QCUserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None

@router.get("/qc-users", response_model=List[QCUserRead])
def get_qc_users(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """List all QC Users created by the current QC Supervisor"""
    if current_user.user_role != UserRole.QC_Supervisor:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Fetch QC Users created by this supervisor
    users = session.exec(
        select(User)
        .where(User.user_role == UserRole.QC_User)
        .where(User.created_by == current_user.user_id)
    ).all()
    
    # Map to schema
    return [
        QCUserRead(
            user_id=u.user_id,
            name=u.name,
            username=u.username,
            email=u.email,
            user_role=u.user_role,
            created_date=u.created_date,
            created_by_name=current_user.name
        ) for u in users
    ]

@router.put("/qc-users/{user_id}", response_model=QCUserRead)
def update_qc_user(
    user_id: UUID,
    user_data: QCUserUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Update a QC User created by this supervisor"""
    if current_user.user_role != UserRole.QC_Supervisor:
        raise HTTPException(status_code=403, detail="Access denied")
        
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    if user.created_by != current_user.user_id:
        raise HTTPException(status_code=403, detail="You can only update users you created")
    
    if user_data.name:
        user.name = user_data.name
    if user_data.email:
        if user_data.email != user.email:
            existing = session.exec(select(User).where(User.email == user_data.email)).first()
            if existing:
                raise HTTPException(status_code=400, detail="Email already registered")
        user.email = user_data.email
    if user_data.password:
        user.password_hash = get_password_hash(user_data.password)
        
    session.add(user)
    session.commit()
    session.refresh(user)
    
    return QCUserRead(
        user_id=user.user_id,
        name=user.name,
        username=user.username,
        email=user.email,
        user_role=user.user_role,
        created_date=user.created_date,
        created_by_name=current_user.name
    )

@router.delete("/qc-users/{user_id}")
def delete_qc_user(
    user_id: UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Delete a QC User created by this supervisor"""
    if current_user.user_role != UserRole.QC_Supervisor:
        raise HTTPException(status_code=403, detail="Access denied")
        
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    if user.created_by != current_user.user_id:
        raise HTTPException(status_code=403, detail="You can only delete users you created")
        
    session.delete(user)
    session.commit()
    
    return {"message": "QC User deleted successfully"}

# --- Allocation Schemas ---

class QCBatchInfo(BaseModel):
    batch_uid: UUID
    batch_id: str
    project_name: str
    source_name: str
    location_name: str
    record_owner_name: str
    record_type_name: str
    record_name: str  # Added record_name
    vendor_name: str  # Added vendor_name
    total_count: int
    upload_count: int
    operator_name: str
    upload_status: UploadStatus
    qc_status: Optional[QCBatchStatus] = None
    allocated_to_user_name: Optional[str] = None
    upload_type: str
    created_date: datetime

class QCHistoryRead(BaseModel):
    qc_allocation_id: UUID
    batch_uid: UUID
    batch_id: str
    project_name: str
    source_name: str
    location_name: str
    record_owner_name: str
    record_type_name: str
    record_name: str
    vendor_name: str # Added vendor name
    total_count: int
    upload_count: int
    qc_done_count: int
    accepted_count: int
    rejected_count: int
    qc_user_name: str
    allocated_by_name: Optional[str] = None
    allocation_date: datetime
    qc_completed_date: Optional[datetime] = None
    qc_batch_status: QCBatchStatus
    upload_type: str
    parent_batch_uid: Optional[UUID] = None
    replaced_by_batch_uid: Optional[UUID] = None
    status_detail: Optional[str] = None

class QCAllocationCreate(BaseModel):
    batch_uid: UUID
    qc_user_id: UUID

@router.get("/batches", response_model=List[QCBatchInfo])
def get_batches(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """List batches available for QC allocation or already allocated"""
    if current_user.user_role != UserRole.QC_Supervisor:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Re-writing query with aliases for clarity
    from sqlmodel import col
    from sqlalchemy.orm import aliased
    
    QCUser = aliased(User)
    OperatorUser = aliased(User)
    VendorUser = aliased(User) # Added Vendor User alias
    
    statement = (
        select(
            Batch,
            Project.project_name,
            Source.source_name,
            Location.location_name,
            RecordOwner.record_owner_name,
            RecordType.record_type_name,
            RecordName.record_name, # Added RecordName.record_name
            VendorUser.name.label("vendor_name"), # Added Vendor Name
            Upload.upload_status,
            QCAllocation.qc_batch_status,
            QCUser.name.label("qc_user_name"),
            OperatorUser.name.label("operator_name")
        )
        .join(Upload, Batch.batch_uid == Upload.batch_uid)
        .join(Source, Batch.source_id == Source.source_id)
        .join(Location, Batch.location_id == Location.location_id)
        .join(Project, Source.project_id == Project.project_id)
        .join(RecordOwner, Batch.record_owner_id == RecordOwner.record_owner_id)
        .join(RecordType, Batch.record_type_id == RecordType.record_type_id)
        .join(RecordName, Batch.record_name_id == RecordName.record_name_id) # Join RecordName
        .join(ScanningOperatorAllocation, Batch.scanning_operator_allocation_id == ScanningOperatorAllocation.scanning_operator_allocation_id)
        .join(OperatorUser, ScanningOperatorAllocation.allocated_to_operator == OperatorUser.user_id)
        .join(VendorAllocation, ScanningOperatorAllocation.vendor_allocation_id == VendorAllocation.vendor_allocation_id) # Join VendorAllocation
        .join(VendorUser, VendorAllocation.allocated_to_vendor == VendorUser.user_id) # Join Vendor User
        .outerjoin(QCAllocation, Batch.batch_uid == QCAllocation.batch_uid)
        .outerjoin(QCUser, QCAllocation.allocated_to_qc_user == QCUser.user_id)
        .where(Upload.upload_status == UploadStatus.Completed)
    )
    
    results = session.exec(statement).all()
    
    batches = []
    for row in results:
        (batch, proj, src, loc, owner, rtype, rname, vname, up_stat, qc_stat, qc_name, op_name) = row
        
        up_type = "Complete"
        if batch.is_reupload:
            up_type = "Re-upload"
        elif batch.is_partial:
            up_type = "Partial"

        batches.append(QCBatchInfo(
            batch_uid=batch.batch_uid,
            batch_id=batch.batch_id,
            project_name=proj,
            source_name=src,
            location_name=loc,
            record_owner_name=owner,
            record_type_name=rtype,
            record_name=rname,
            vendor_name=vname,
            total_count=batch.total_count,
            upload_count=batch.upload_count,
            operator_name=op_name,
            upload_status=up_stat,
            qc_status=qc_stat,
            allocated_to_user_name=qc_name,
            upload_type=up_type,
            created_date=batch.created_date
        ))
        
    return batches

@router.post("/allocate")
def allocate_batch(
    allocation: QCAllocationCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Allocate a batch to a QC User"""
    if current_user.user_role != UserRole.QC_Supervisor:
        raise HTTPException(status_code=403, detail="Access denied")
        
    batch = session.get(Batch, allocation.batch_uid)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
        
    qc_user = session.get(User, allocation.qc_user_id)
    if not qc_user or qc_user.user_role != UserRole.QC_User:
        raise HTTPException(status_code=400, detail="Invalid QC User")
        
    existing_alloc = session.exec(select(QCAllocation).where(QCAllocation.batch_uid == allocation.batch_uid)).first()
    
    if existing_alloc:
        existing_alloc.allocated_to_qc_user = allocation.qc_user_id
        existing_alloc.allocated_by_supervisor = current_user.user_id
        existing_alloc.allocation_date = get_ist_now()
        session.add(existing_alloc)
        qc_allocation_id = existing_alloc.qc_allocation_id
    else:
        new_alloc = QCAllocation(
            batch_uid=allocation.batch_uid,
            allocated_to_qc_user=allocation.qc_user_id,
            allocated_by_supervisor=current_user.user_id,
            qc_batch_status=QCBatchStatus.Allocated
        )
        session.add(new_alloc)
        session.flush()  # Get the allocation ID
        qc_allocation_id = new_alloc.qc_allocation_id
        
    # Import QC and Image models
    from common.models import QC, QCStatus, Image
    
    # Get all images for this batch
    images = session.exec(select(Image).where(Image.batch_uid == allocation.batch_uid)).all()
    
    # Create QC records for each image if they don't exist
    for img in images:
        existing_qc = session.exec(
            select(QC)
            .where(QC.qc_allocation_id == qc_allocation_id)
            .where(QC.image_id == img.image_id)
        ).first()
        
        if not existing_qc:
            qc_record = QC(
                qc_allocation_id=qc_allocation_id,
                image_id=img.image_id,
                qc_status=QCStatus.Pending,
                orientation_error=False
            )
            session.add(qc_record)
    
    # --- Trigger Notification ---
    try:
        create_notification(
            session=session,
            user_id=allocation.qc_user_id,
            notif_type=NotificationType.QC_Assigned,
            title="New QC Task Assigned",
            message=f"Supervisor {current_user.name} has assigned Batch {batch.batch_id} to you for quality check.",
            link="/tasks"  # QC user tasks page
        )
    except Exception as e:
        print(f"⚠️ Failed to create notification: {e}")
        
    session.commit()
    return {"message": f"Batch allocated successfully with {len(images)} images ready for QC"}

@router.delete("/revoke-allocation/{allocation_id}")
def revoke_allocation(
    allocation_id: UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Revoke a QC allocation (Supervisor only)"""
    if current_user.user_role != UserRole.QC_Supervisor:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Get the allocation
    allocation = session.get(QCAllocation, allocation_id)
    if not allocation:
        raise HTTPException(status_code=404, detail="Allocation not found")
        
    # Check if already completed?
    # Usually we revoke things that are in Allocated, QC_Pending, or QC_In_Progress
    if allocation.qc_batch_status in [QCBatchStatus.Completed, QCBatchStatus.Verified, QCBatchStatus.Verified_With_Rejection]:
         raise HTTPException(status_code=400, detail="Cannot revoke a completed or verified batch")

    from sqlalchemy import delete
    from sqlmodel import col
    from common.models import QC
    
    # Delete associated QC records
    session.exec(delete(QC).where(col(QC.qc_allocation_id) == allocation_id))
    
    # Delete the allocation itself
    session.delete(allocation)
    session.commit()
    
    return {"message": "Allocation revoked successfully"}

@router.get("/history", response_model=List[QCHistoryRead])
def get_all_qc_history(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """List all completed QC batches for the supervisor to review"""
    if current_user.user_role != UserRole.QC_Supervisor:
        raise HTTPException(status_code=403, detail="Access denied")
    
    from common.models import QC, QCStatus, Image
    from sqlalchemy import func
    
    SupervisorUser = aliased(User)
    QCUser = aliased(User)
    VendorUser = aliased(User)

    from common.models import ScanningOperatorAllocation, VendorAllocation

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
            VendorUser.name.label("vendor_name"),
            QCUser.name.label("qc_user_name"),
            SupervisorUser.name.label("supervisor_name")
        )
        .join(Batch, QCAllocation.batch_uid == Batch.batch_uid)
        .join(Source, Batch.source_id == Source.source_id)
        .join(Location, Batch.location_id == Location.location_id)
        .join(Project, Source.project_id == Project.project_id)
        .join(RecordOwner, Batch.record_owner_id == RecordOwner.record_owner_id)
        .join(RecordType, Batch.record_type_id == RecordType.record_type_id)
        .join(RecordName, Batch.record_name_id == RecordName.record_name_id)
        .join(ScanningOperatorAllocation, Batch.scanning_operator_allocation_id == ScanningOperatorAllocation.scanning_operator_allocation_id)
        .join(VendorAllocation, ScanningOperatorAllocation.vendor_allocation_id == VendorAllocation.vendor_allocation_id)
        .join(VendorUser, VendorAllocation.allocated_to_vendor == VendorUser.user_id)
        .join(QCUser, QCAllocation.allocated_to_qc_user == QCUser.user_id)
        .join(SupervisorUser, QCAllocation.allocated_by_supervisor == SupervisorUser.user_id)
        .where(QCAllocation.qc_batch_status.in_([
            QCBatchStatus.Completed, 
            QCBatchStatus.Verified, 
            QCBatchStatus.Verified_With_Rejection
        ]))
        .order_by(QCAllocation.qc_completed_date.desc())
    )
    
    results = session.exec(statement).all()
    
    history = []
    for qca, batch, proj, src, loc, owner, rtype, rname, vname, qc_user_name, sup_name in results:
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

        up_type = "Complete"
        if batch.is_reupload:
            up_type = "Re-upload"
        elif batch.is_partial:
            up_type = "Partial"

        history.append(QCHistoryRead(
            qc_allocation_id=qca.qc_allocation_id,
            batch_uid=batch.batch_uid,
            batch_id=batch.batch_id,
            project_name=proj,
            source_name=src,
            location_name=loc,
            record_owner_name=owner,
            record_type_name=rtype,
            record_name=rname,
            vendor_name=vname,
            total_count=batch.total_count,
            upload_count=batch.upload_count,
            qc_done_count=qc_done,
            accepted_count=accepted,
            rejected_count=rejected,
            qc_user_name=qc_user_name,
            allocated_by_name=sup_name,
            allocation_date=qca.allocation_date,
            qc_completed_date=qca.qc_completed_date,
            qc_batch_status=qca.qc_batch_status,
            upload_type=up_type,
            parent_batch_uid=batch.parent_batch_uid,
            replaced_by_batch_uid=session.exec(select(Batch.batch_uid).where(Batch.parent_batch_uid == batch.batch_uid)).first(),
            status_detail="Replaced by Rework" if session.exec(select(Batch.batch_uid).where(Batch.parent_batch_uid == batch.batch_uid)).first() else "Rework Batch" if batch.is_reupload else None
        ))
    
    return history

@router.get("/allocation-history", response_model=List[QCHistoryRead])
def get_allocation_history(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """List all QC allocations including in-progress ones for audit/history view"""
    if current_user.user_role != UserRole.QC_Supervisor:
        raise HTTPException(status_code=403, detail="Access denied")
    
    from common.models import QC, QCStatus, Image
    from sqlalchemy import func
    from sqlalchemy.orm import aliased
    
    SupervisorUser = aliased(User)
    QCUser = aliased(User)
    VendorUser = aliased(User)

    from common.models import ScanningOperatorAllocation, VendorAllocation

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
            VendorUser.name.label("vendor_name"),
            QCUser.name.label("qc_user_name"),
            SupervisorUser.name.label("supervisor_name")
        )
        .join(Batch, QCAllocation.batch_uid == Batch.batch_uid)
        .join(Source, Batch.source_id == Source.source_id)
        .join(Location, Batch.location_id == Location.location_id)
        .join(Project, Source.project_id == Project.project_id)
        .join(RecordOwner, Batch.record_owner_id == RecordOwner.record_owner_id)
        .join(RecordType, Batch.record_type_id == RecordType.record_type_id)
        .join(RecordName, Batch.record_name_id == RecordName.record_name_id)
        .join(ScanningOperatorAllocation, Batch.scanning_operator_allocation_id == ScanningOperatorAllocation.scanning_operator_allocation_id)
        .join(VendorAllocation, ScanningOperatorAllocation.vendor_allocation_id == VendorAllocation.vendor_allocation_id)
        .join(VendorUser, VendorAllocation.allocated_to_vendor == VendorUser.user_id)
        .join(QCUser, QCAllocation.allocated_to_qc_user == QCUser.user_id)
        .join(SupervisorUser, QCAllocation.allocated_by_supervisor == SupervisorUser.user_id)
        .order_by(QCAllocation.allocation_date.desc())
    )
    
    results = session.exec(statement).all()
    
    history = []
    for qca, batch, proj, src, loc, owner, rtype, rname, vendor_name, qc_user_name, sup_name in results:
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

        up_type = "Complete"
        if batch.is_reupload:
            up_type = "Re-upload"
        elif batch.is_partial:
            up_type = "Partial"

        history.append(QCHistoryRead(
            qc_allocation_id=qca.qc_allocation_id,
            batch_uid=batch.batch_uid,
            batch_id=batch.batch_id,
            project_name=proj,
            source_name=src,
            location_name=loc,
            record_owner_name=owner,
            record_type_name=rtype,
            record_name=rname,
            vendor_name=vendor_name,
            total_count=batch.total_count,
            upload_count=batch.upload_count,
            qc_done_count=qc_done,
            accepted_count=accepted,
            rejected_count=rejected,
            qc_user_name=qc_user_name,
            allocated_by_name=sup_name,
            allocation_date=qca.allocation_date,
            qc_completed_date=qca.qc_completed_date,
            qc_batch_status=qca.qc_batch_status,
            upload_type=up_type,
            parent_batch_uid=batch.parent_batch_uid,
            replaced_by_batch_uid=session.exec(select(Batch.batch_uid).where(Batch.parent_batch_uid == batch.batch_uid)).first(),
            status_detail="Replaced by Rework" if session.exec(select(Batch.batch_uid).where(Batch.parent_batch_uid == batch.batch_uid)).first() else "Rework Batch" if batch.is_reupload else None
        ))
    
    return history

# --- QC Review Endpoints for Supervisors ---

class QCImageReview(BaseModel):
    qc_id: UUID
    image_id: UUID
    image_name: str
    qc_s3_path: Optional[str]
    original_s3_path: str
    qc_status: str  # 'Pending', 'Approved', 'Rejected'
    orientation_error: bool
    remarks: Optional[str]
    qc_date: datetime

class QCStatusUpdate(BaseModel):
    qc_status: str  # 'Approved' or 'Rejected'
    orientation_error: bool = False
    remarks: Optional[str] = None

@router.get("/batch-images/{batch_uid}", response_model=List[QCImageReview])
def get_batch_images_for_review(
    batch_uid: UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Get all images in a batch with their QC status for supervisor review"""
    if current_user.user_role != UserRole.QC_Supervisor:
        raise HTTPException(status_code=403, detail="Access denied")
    
    from common.models import QC, QCStatus, Image
    
    # Get the QC allocation for this batch
    allocation = session.exec(
        select(QCAllocation).where(QCAllocation.batch_uid == batch_uid)
    ).first()
    
    if not allocation:
        raise HTTPException(status_code=404, detail="No QC allocation found for this batch")
    
    # Get all QC records with image details - only include converted images
    from common.models import ConversionStatus
    
    statement = (
        select(QC, Image)
        .join(Image, QC.image_id == Image.image_id)
        .where(QC.qc_allocation_id == allocation.qc_allocation_id)
        .where(Image.qc_s3_path.isnot(None))  # Only include images with QC path
        .where(Image.conversion_status.in_([ConversionStatus.Jpeg_Converted, ConversionStatus.QC_Moved]))  # Only successfully converted
        .order_by(Image.image_name)
    )
    
    results = session.exec(statement).all()
    
    # Initialize S3 client for presigned URLs
    import boto3
    from botocore.client import Config
    import os
    
    qc_s3_client = boto3.client(
        's3',
        endpoint_url=os.getenv('QC_ENDPOINT_URL'),
        aws_access_key_id=os.getenv('QC_AWS_ACCESS_KEY_ID'),
        aws_secret_access_key=os.getenv('QC_AWS_SECRET_ACCESS_KEY'),
        region_name=os.getenv('QC_AWS_REGION'),
        config=Config(signature_version='s3v4')
    )
    
    images = []
    for qc, img in results:
        # Convert image name to show .jpg extension instead of .tif
        display_name = img.image_name
        if display_name.lower().endswith('.tif'):
            display_name = display_name[:-4] + '.jpg'
        elif display_name.lower().endswith('.tiff'):
            display_name = display_name[:-5] + '.jpg'
        
        # Generate presigned URL for QC image
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
                print(f"Error generating presigned URL for {img.image_name}: {e}")
                qc_url = img.qc_s3_path  # Fallback to path
        
        images.append(QCImageReview(
            qc_id=qc.qc_id,
            image_id=img.image_id,
            image_name=display_name,  # Show converted filename
            qc_s3_path=qc_url or img.qc_s3_path,  # Use presigned URL
            original_s3_path=qc_url or img.qc_s3_path,  # Use presigned URL for both
            qc_status=qc.qc_status.value,
            orientation_error=qc.orientation_error,
            remarks=qc.remarks,
            qc_date=qc.qc_date
        ))
    
    return images

@router.put("/update-qc-status/{qc_id}")
def update_qc_status(
    qc_id: UUID,
    update_data: QCStatusUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Update QC status and remarks for a specific image (Supervisor only)"""
    if current_user.user_role != UserRole.QC_Supervisor:
        raise HTTPException(status_code=403, detail="Access denied")
    
    from common.models import QC, QCStatus
    
    # Get the QC record
    qc_record = session.get(QC, qc_id)
    if not qc_record:
        raise HTTPException(status_code=404, detail="QC record not found")
    
    # Update the QC status
    try:
        qc_record.qc_status = QCStatus(update_data.qc_status)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid QC status: {update_data.qc_status}")
    
    qc_record.orientation_error = update_data.orientation_error
    
    # Clear remarks if approved
    if qc_record.qc_status == QCStatus.Approved:
        qc_record.remarks = None
    else:
        qc_record.remarks = update_data.remarks
        
    qc_record.qc_date = get_ist_now()
    
    session.add(qc_record)
    session.commit()
    session.refresh(qc_record)
    
    return {
        "message": "QC status updated successfully",
        "qc_id": str(qc_id),
        "new_status": qc_record.qc_status.value
    }

@router.post("/verify-batch/{batch_uid}")
def verify_batch(
    batch_uid: UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Verify a completed QC batch by supervisor and create rework batch if rejections exist"""
    if current_user.user_role != UserRole.QC_Supervisor:
        raise HTTPException(status_code=403, detail="Access denied")
    
    import re
    from common.models import QCAllocation, QCBatchStatus, Batch, QC, QCStatus
    from sqlalchemy import func
    
    # Get the QC allocation for this batch
    allocation = session.exec(
        select(QCAllocation).where(QCAllocation.batch_uid == batch_uid)
    ).first()
    
    if not allocation:
        raise HTTPException(status_code=404, detail="QC Allocation not found")
        
    if allocation.qc_batch_status != QCBatchStatus.Completed:
        raise HTTPException(status_code=400, detail="Only completed batches can be verified")
        
    # Get original batch details
    original_batch = session.get(Batch, batch_uid)
    if not original_batch:
        raise HTTPException(status_code=404, detail="Original batch record not found")

    # Check if there are any rejected images in this allocation
    rejected_count = session.exec(
        select(func.count(QC.qc_id))
        .where(QC.qc_allocation_id == allocation.qc_allocation_id)
        .where(QC.qc_status == QCStatus.Rejected)
    ).first() or 0
    
    rework_batch_id = None
    if rejected_count > 0:
        allocation.qc_batch_status = QCBatchStatus.Verified_With_Rejection
        
        # Generate new Batch ID for rework
        # Eg. ..._C1 -> ..._C1R1, ..._C1R1 -> ..._C1R2
        original_id = original_batch.batch_id
        match = re.search(r'R(\d+)$', original_id)
        if match:
            current_r = int(match.group(1))
            new_batch_id = re.sub(r'R\d+$', f'R{current_r + 1}', original_id)
        else:
            new_batch_id = f"{original_id}R1"
        
        rework_batch_id = new_batch_id

        # Create new Batch entry
        rework_batch = Batch(
            batch_id=new_batch_id,
            scanning_operator_allocation_id=original_batch.scanning_operator_allocation_id,
            source_id=original_batch.source_id,
            location_id=original_batch.location_id,
            record_owner_id=original_batch.record_owner_id,
            record_name_id=original_batch.record_name_id,
            record_type_id=original_batch.record_type_id,
            total_count=rejected_count,
            upload_count=rejected_count, # Per user requirement "total count and uplod count is same"
            is_complete=False,
            is_partial=original_batch.is_partial,
            is_reupload=True,
            parent_batch_uid=original_batch.batch_uid, # Link to parent for traceability
            vendor_approved=False,
            created_date=get_ist_now(),
            last_updated=get_ist_now()
        )
        session.add(rework_batch)
    else:
        allocation.qc_batch_status = QCBatchStatus.Verified
        
    session.add(allocation)
    
    # --- Trigger Notifications for Rejection ---
    if rejected_count > 0:
        try:
            # Notify Vendor that a batch requires rework
            vendor_alloc = session.get(VendorAllocation, original_batch.scanning_operator_allocation_id) # Wait, need vendor allocation
            # Actually ScanningOperatorAllocation has vendor_allocation_id
            op_alloc = session.get(ScanningOperatorAllocation, original_batch.scanning_operator_allocation_id)
            if op_alloc:
                vendor_alloc = session.get(VendorAllocation, op_alloc.vendor_allocation_id)
                if vendor_alloc:
                    create_notification(
                        session=session,
                        user_id=vendor_alloc.allocated_to_vendor,
                        notif_type=NotificationType.Batch_Rejected,
                        title="Batch Rejected (Rework Required)",
                        message=f"Batch {original_batch.batch_id} has {rejected_count} rejections. Rework Batch {rework_batch_id} has been created and requires your approval.",
                        link="/reallocation"  # Vendor rework batches page
                    )
        except Exception as e:
            print(f"⚠️ Failed to create notification: {e}")

    session.commit()
    
    return {
        "message": "Batch verified successfully", 
        "status": allocation.qc_batch_status.value,
        "rework_batch_id": rework_batch_id
    }

@router.get("/dashboard-stats")
def get_qc_sup_dashboard_stats(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Get statistics for the QC Supervisor Dashboard"""
    if current_user.user_role != UserRole.QC_Supervisor:
        raise HTTPException(status_code=403, detail="Not authorized.")

    from sqlalchemy import func
    from common.models import QC, QCStatus, Upload, UploadStatus

    # 1. Resource Counts
    counts = {
        "qc_users": session.exec(select(func.count(User.user_id)).where(User.created_by == current_user.user_id)).one(),
        "allocations": session.exec(select(func.count(QCAllocation.qc_allocation_id)).where(QCAllocation.allocated_by_supervisor == current_user.user_id)).one(),
    }

    # 2. Key Metrics
    pending_review_count = session.exec(
        select(func.count(QCAllocation.qc_allocation_id))
        .where(QCAllocation.qc_batch_status == QCBatchStatus.Completed)
    ).one()

    total_accepted = session.exec(
        select(func.count(QC.qc_id))
        .join(QCAllocation, QC.qc_allocation_id == QCAllocation.qc_allocation_id)
        .where(QCAllocation.qc_batch_status.in_([QCBatchStatus.Verified, QCBatchStatus.Verified_With_Rejection]))
        .where(QC.qc_status == QCStatus.Approved)
    ).one()
    
    total_rejected = session.exec(
        select(func.count(QC.qc_id))
        .join(QCAllocation, QC.qc_allocation_id == QCAllocation.qc_allocation_id)
        .where(QCAllocation.qc_batch_status.in_([QCBatchStatus.Verified, QCBatchStatus.Verified_With_Rejection]))
        .where(QC.qc_status == QCStatus.Rejected)
    ).one()

    # 3. Pending Allocation
    completed_uploads_count = session.exec(select(func.count(Upload.batch_uid)).where(Upload.upload_status == UploadStatus.Completed)).one()
    allocated_batch_uids = session.exec(select(QCAllocation.batch_uid)).all()
    pending_allocation = max(0, completed_uploads_count - len(allocated_batch_uids))

    # 4. Recent History
    recent_history = get_all_qc_history(session, current_user)[:5]

    return {
        "counts": counts,
        "metrics": {
            "pending_review": pending_review_count,
            "pending_allocation": pending_allocation,
            "total_accepted": total_accepted,
            "total_rejected": total_rejected,
            "accuracy": round((total_accepted / (total_accepted + total_rejected) * 100), 2) if (total_accepted + total_rejected) > 0 else 100
        },
        "recent_history": recent_history
    }
