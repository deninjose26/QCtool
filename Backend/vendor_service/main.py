from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select
from uuid import UUID
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from common.database import get_session
from common.models import (
    User, UserRole, VendorAllocation, ScanningOperatorAllocation,
    Project, Source, Location, RecordOwner, Batch, Upload, RecordType, RecordName,
    QCAllocation, QC, QCStatus, QCBatchStatus
)
from common.auth_utils import get_current_user, role_required
from common.notification_utils import create_notification
from common.models import NotificationType

router = APIRouter(prefix="/vendor", tags=["Vendor Operations"])

# --- Schemas ---
class BatchRead(BaseModel):
    batch_uid: UUID
    batch_id: str
    project_name: str
    source_name: str
    location_name: str
    record_owner_name: str
    record_type_name: str
    book_name: str
    target_count: int
    completed_count: int
    operator_name: str
    upload_type: str
    status: str
    vendor_approved: bool = True
    upload_end_date: Optional[datetime] = None

class BatchQCHistoryRead(BaseModel):
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
    accepted_count: int
    rejected_count: int
    qc_status: str
    upload_type: str
    operator_name: str
    allocation_date: Optional[datetime] = None
    qc_completed_date: Optional[datetime] = None
class OperatorAllocationCreate(BaseModel):
    vendor_allocation_id: UUID
    operator_id: UUID

class ReallocateBatch(BaseModel):
    operator_id: UUID

class OperatorAllocationUpdate(BaseModel):
    operator_id: Optional[UUID] = None
    vendor_allocation_id: Optional[UUID] = None
    is_active: Optional[bool] = None

class OperatorAllocationRead(BaseModel):
    id: UUID
    operator_id: UUID
    operator_name: str
    project_id: UUID
    project_name: str
    source_id: UUID
    source_name: str
    location_id: UUID
    location_name: str
    record_owner_id: UUID
    record_owner_name: str
    is_active: bool

@router.get("/")
def read_root():
    return {"service": "Vendor Service", "port": 8003}

# --- Operator Allocation ---

@router.get("/my-allocations", response_model=List[dict])
def get_vendor_allocations(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """List all allocations assigned to this vendor by the supervisor."""
    if current_user.user_role != UserRole.Vendor:
        raise HTTPException(status_code=403, detail="Only Vendors can access this.")
    
    statement = select(
        VendorAllocation, Project, Source, Location, RecordOwner
    ).join(Project, VendorAllocation.project_id == Project.project_id)\
     .join(Source, VendorAllocation.source_id == Source.source_id)\
     .join(Location, VendorAllocation.location_id == Location.location_id)\
     .join(RecordOwner, VendorAllocation.record_owner_id == RecordOwner.record_owner_id)\
     .where(VendorAllocation.allocated_to_vendor == current_user.user_id)\
     .where(VendorAllocation.is_active == True)
    
    results = session.exec(statement).all()
    
    allocations = []
    for va, p, s, l, ro in results:
        allocations.append({
            "vendor_allocation_id": va.vendor_allocation_id,
            "project_id": p.project_id,
            "project_name": p.project_name,
            "source_id": s.source_id,
            "source_name": s.source_name,
            "location_id": l.location_id,
            "location_name": l.location_name,
            "record_owner_id": ro.record_owner_id,
            "record_owner_name": ro.record_owner_name
        })
    return allocations

@router.post("/operator-allocations", response_model=ScanningOperatorAllocation)
def create_operator_allocation(
    data: OperatorAllocationCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Allocate a vendor's resource to one of their operators."""
    if current_user.user_role != UserRole.Vendor:
        raise HTTPException(status_code=403, detail="Only Vendors can perform allocations.")
    
    # 1. Verify VendorAllocation belongs to this vendor
    va = session.get(VendorAllocation, data.vendor_allocation_id)
    if not va or va.allocated_to_vendor != current_user.user_id or not va.is_active:
        raise HTTPException(status_code=404, detail="Vendor allocation not found or not yours.")
    
    # 2. Verify Operator belongs to this vendor OR is a Scanning Operator
    operator = session.get(User, data.operator_id)
    if not operator or operator.user_role != UserRole.Scanning_Operator:
        raise HTTPException(status_code=400, detail="Invalid operator.")
    
    # Check if already exists
    existing = session.exec(
        select(ScanningOperatorAllocation)
        .where(ScanningOperatorAllocation.vendor_allocation_id == data.vendor_allocation_id)
        .where(ScanningOperatorAllocation.allocated_to_operator == data.operator_id)
        .where(ScanningOperatorAllocation.is_active == True)
    ).first()
    
    if existing:
        raise HTTPException(status_code=400, detail="Operator already has this allocation.")
    
    new_allocation = ScanningOperatorAllocation(
        vendor_allocation_id=data.vendor_allocation_id,
        allocated_to_operator=data.operator_id
    )
    session.add(new_allocation)
    session.commit()
    session.refresh(new_allocation)
    return new_allocation

@router.get("/operator-allocations", response_model=List[OperatorAllocationRead])
def get_operator_allocations(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """List all allocations made by this vendor to their operators."""
    if current_user.user_role != UserRole.Vendor:
        raise HTTPException(status_code=403, detail="Only Vendors can access this.")

    statement = select(
        ScanningOperatorAllocation, User, VendorAllocation, Project, Source, Location, RecordOwner
    ).join(User, ScanningOperatorAllocation.allocated_to_operator == User.user_id)\
     .join(VendorAllocation, ScanningOperatorAllocation.vendor_allocation_id == VendorAllocation.vendor_allocation_id)\
     .join(Project, VendorAllocation.project_id == Project.project_id)\
     .join(Source, VendorAllocation.source_id == Source.source_id)\
     .join(Location, VendorAllocation.location_id == Location.location_id)\
     .join(RecordOwner, VendorAllocation.record_owner_id == RecordOwner.record_owner_id)\
     .where(VendorAllocation.allocated_to_vendor == current_user.user_id)\
     .order_by(ScanningOperatorAllocation.is_active.desc())
    
    results = session.exec(statement).all()
    
    output = []
    for oa, u, va, p, s, l, ro in results:
        output.append(OperatorAllocationRead(
            id=oa.scanning_operator_allocation_id,
            operator_id=u.user_id,
            operator_name=u.name,
            project_id=p.project_id,
            project_name=p.project_name,
            source_id=s.source_id,
            source_name=s.source_name,
            location_id=l.location_id,
            location_name=l.location_name,
            record_owner_id=ro.record_owner_id,
            record_owner_name=ro.record_owner_name,
            is_active=oa.is_active
        ))
    return output

@router.put("/operator-allocations/{allocation_id}", response_model=ScanningOperatorAllocation)
def update_operator_allocation(
    allocation_id: UUID,
    data: OperatorAllocationUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Update or toggle an operator allocation."""
    if current_user.user_role != UserRole.Vendor:
        raise HTTPException(status_code=403, detail="Only Vendors can perform updates.")
    
    oa = session.get(ScanningOperatorAllocation, allocation_id)
    if not oa:
        raise HTTPException(status_code=404, detail="Allocation not found")
    
    # Verify ownership
    va = session.get(VendorAllocation, oa.vendor_allocation_id)
    if not va or va.allocated_to_vendor != current_user.user_id:
        raise HTTPException(status_code=403, detail="Access denied")

    if data.operator_id:
        oa.allocated_to_operator = data.operator_id
    if data.vendor_allocation_id:
        # Check if they have access to the new resource
        new_va = session.get(VendorAllocation, data.vendor_allocation_id)
        if not new_va or new_va.allocated_to_vendor != current_user.user_id:
            raise HTTPException(status_code=400, detail="Invalid target resource")
        oa.vendor_allocation_id = data.vendor_allocation_id
    
    if data.is_active is not None:
        oa.is_active = data.is_active

    session.add(oa)
    session.commit()
    session.refresh(oa)
    return oa

@router.delete("/operator-allocations/{allocation_id}")
def delete_operator_allocation(
    allocation_id: UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Hard delete an operator allocation."""
    if current_user.user_role != UserRole.Vendor:
        raise HTTPException(status_code=403, detail="Only Vendors can perform deletions.")

    oa = session.get(ScanningOperatorAllocation, allocation_id)
    if not oa:
        raise HTTPException(status_code=404, detail="Allocation not found")
    
    # Verify ownership
    va = session.get(VendorAllocation, oa.vendor_allocation_id)
    if not va or va.allocated_to_vendor != current_user.user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    session.delete(oa)
    session.commit()
    return {"message": "Allocation removed successfully"}

# --- Upload History ---

@router.get("/batches", response_model=List[BatchRead])
def list_vendor_batches(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    if current_user.user_role != UserRole.Vendor:
        raise HTTPException(status_code=403, detail="Only Vendors can access this.")
    
    # Joining everything to get full context for the Vendor
    # We join with Operator User to show who uploaded it
    from sqlmodel import select, or_
    
    OperatorUser = User
    
    statement = select(
        Batch, Source, Location, RecordOwner, RecordType, RecordName, Project, Upload, OperatorUser
    ).join(Source, Batch.source_id == Source.source_id)\
     .join(Location, Batch.location_id == Location.location_id)\
     .join(RecordOwner, Batch.record_owner_id == RecordOwner.record_owner_id)\
     .join(RecordType, Batch.record_type_id == RecordType.record_type_id)\
     .join(RecordName, Batch.record_name_id == RecordName.record_name_id)\
     .join(Project, Source.project_id == Project.project_id)\
     .outerjoin(Upload, Batch.batch_uid == Upload.batch_uid)\
     .join(ScanningOperatorAllocation, Batch.scanning_operator_allocation_id == ScanningOperatorAllocation.scanning_operator_allocation_id)\
     .join(VendorAllocation, ScanningOperatorAllocation.vendor_allocation_id == VendorAllocation.vendor_allocation_id)\
     .join(OperatorUser, ScanningOperatorAllocation.allocated_to_operator == OperatorUser.user_id)\
     .where(VendorAllocation.allocated_to_vendor == current_user.user_id)\
     .order_by(Batch.created_date.desc())
    
    results = session.exec(statement).all()
    
    output = []
    for b, s, l, ro, rt, rn, p, u, opt in results:
        status = 'pending'
        if u:
            if u.upload_status == 'Completed':
                status = 'uploaded'
            elif u.upload_status == 'In_Progress':
                status = 'uploading'
        
        upload_type = "Complete"
        if b.is_partial:
            upload_type = "Partial"
        elif b.is_reupload:
            upload_type = "Re-upload"
            
        output.append(BatchRead(
            batch_uid=b.batch_uid,
            batch_id=b.batch_id,
            project_name=p.project_name,
            source_name=s.source_name,
            location_name=l.location_name,
            record_owner_name=ro.record_owner_name,
            record_type_name=rt.record_type_name,
            book_name=rn.record_name,
            target_count=b.total_count,
            completed_count=u.completed_count if u else 0,
            operator_name=opt.name,
            upload_type=upload_type,
            status=status,
            upload_end_date=u.upload_end_date if u else None
        ))
    
    return output

@router.get("/rework-batches", response_model=List[BatchRead])
def list_vendor_rework_batches(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Get only re-upload (rework) batches for this vendor"""
    if current_user.user_role != UserRole.Vendor:
        raise HTTPException(status_code=403, detail="Only Vendors can access this.")
    
    from sqlmodel import select
    OperatorUser = User
    
    statement = select(
        Batch, Source, Location, RecordOwner, RecordType, RecordName, Project, Upload, OperatorUser
    ).join(Source, Batch.source_id == Source.source_id)\
     .join(Location, Batch.location_id == Location.location_id)\
     .join(RecordOwner, Batch.record_owner_id == RecordOwner.record_owner_id)\
     .join(RecordType, Batch.record_type_id == RecordType.record_type_id)\
     .join(RecordName, Batch.record_name_id == RecordName.record_name_id)\
     .join(Project, Source.project_id == Project.project_id)\
     .outerjoin(Upload, Batch.batch_uid == Upload.batch_uid)\
     .join(ScanningOperatorAllocation, Batch.scanning_operator_allocation_id == ScanningOperatorAllocation.scanning_operator_allocation_id)\
     .join(VendorAllocation, ScanningOperatorAllocation.vendor_allocation_id == VendorAllocation.vendor_allocation_id)\
     .join(OperatorUser, ScanningOperatorAllocation.allocated_to_operator == OperatorUser.user_id)\
     .where(VendorAllocation.allocated_to_vendor == current_user.user_id)\
     .where(Batch.is_reupload == True)\
     .order_by(Batch.created_date.desc())
    
    results = session.exec(statement).all()
    
    output = []
    for b, s, l, ro, rt, rn, p, u, opt in results:
        status = 'pending'
        if u:
            if u.upload_status == 'Completed':
                status = 'uploaded'
            elif u.upload_status == 'In_Progress':
                status = 'uploading'
        
        output.append(BatchRead(
            batch_uid=b.batch_uid,
            batch_id=b.batch_id,
            project_name=p.project_name,
            source_name=s.source_name,
            location_name=l.location_name,
            record_owner_name=ro.record_owner_name,
            record_type_name=rt.record_type_name,
            book_name=rn.record_name,
            target_count=b.total_count,
            completed_count=u.completed_count if u else 0,
            operator_name=opt.name,
            upload_type="Re-upload",
            status=status,
            vendor_approved=b.vendor_approved,
            upload_end_date=u.upload_end_date if u else None
        ))
    
    return output

# Alias endpoint for clarity in frontend
@router.get("/operator-batches", response_model=List[BatchRead])
def list_operator_batches(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Get all batches uploaded by vendor's operators (same as /batches)"""
    return list_vendor_batches(session, current_user)

@router.get("/batch-images/{batch_uid}")
def get_vendor_batch_images(
    batch_uid: UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Get all images for a specific batch uploaded by vendor's operators"""
    if current_user.user_role != UserRole.Vendor:
        raise HTTPException(status_code=403, detail="Only Vendors can access this.")
    
    # Verify the batch belongs to this vendor's operators
    batch = session.get(Batch, batch_uid)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    # Check if this batch is allocated to this vendor
    allocation = session.exec(
        select(ScanningOperatorAllocation)
        .join(VendorAllocation, ScanningOperatorAllocation.vendor_allocation_id == VendorAllocation.vendor_allocation_id)
        .where(ScanningOperatorAllocation.scanning_operator_allocation_id == batch.scanning_operator_allocation_id)
        .where(VendorAllocation.allocated_to_vendor == current_user.user_id)
    ).first()
    
    if not allocation:
        raise HTTPException(status_code=403, detail="You don't have access to this batch")
    
    # Import required models and libraries
    from common.models import Image, ConversionStatus
    import boto3
    from botocore.client import Config
    import os
    
    # Fetch converted images from database
    images = session.exec(
        select(Image)
        .where(Image.batch_uid == batch_uid)
        .where(Image.conversion_status == ConversionStatus.Jpeg_Converted)
        .order_by(Image.image_name)
    ).all()
    
    # Generate presigned URLs
    s3_client = boto3.client(
        's3',
        endpoint_url=os.getenv('QC_ENDPOINT_URL') or os.getenv('ENDPOINT_URL'),
        aws_access_key_id=os.getenv('QC_AWS_ACCESS_KEY_ID') or os.getenv('AWS_ACCESS_KEY_ID'),
        aws_secret_access_key=os.getenv('QC_AWS_SECRET_ACCESS_KEY') or os.getenv('AWS_SECRET_ACCESS_KEY'),
        region_name=os.getenv('QC_AWS_REGION') or os.getenv('AWS_REGION', 'blr1'),
        config=Config(signature_version='s3v4')
    )
    
    output = []
    qc_bucket_name = os.getenv('QC_S3_BUCKET_NAME')
    
    for img in images:
        # Use JPEG (QC Bucket) exclusively
        if not img.qc_s3_path:
            continue

        try:
            url = s3_client.generate_presigned_url(
                'get_object',
                Params={
                    'Bucket': qc_bucket_name,
                    'Key': img.qc_s3_path
                },
                ExpiresIn=3600  # 1 hour
            )
        except Exception:
            url = None
            
        output.append({
            "image_id": str(img.image_id),
            "image_name": img.image_name,
            "url": url,
            "is_converted": True,
            "status": img.conversion_status
        })
        
    return output

@router.put("/reallocate-batch/{batch_uid}")
def reallocate_batch(
    batch_uid: UUID,
    data: ReallocateBatch,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Reallocate a batch to a different operator under the same resource allocation"""
    if current_user.user_role != UserRole.Vendor:
        raise HTTPException(status_code=403, detail="Only Vendors can reallocate batches.")

    batch = session.get(Batch, batch_uid)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    # Get current operator allocation to find the VendorAllocation ID
    current_soa = session.get(ScanningOperatorAllocation, batch.scanning_operator_allocation_id)
    if not current_soa:
        raise HTTPException(status_code=404, detail="Current batch allocation not found")

    # Verify vendor owns this allocation
    va = session.get(VendorAllocation, current_soa.vendor_allocation_id)
    if not va or va.allocated_to_vendor != current_user.user_id:
        raise HTTPException(status_code=403, detail="You do not have access to this batch's allocation.")

    # Check if a ScanningOperatorAllocation already exists for the NEW operator for this SAME resource (VendorAllocation)
    new_soa = session.exec(
        select(ScanningOperatorAllocation)
        .where(ScanningOperatorAllocation.vendor_allocation_id == va.vendor_allocation_id)
        .where(ScanningOperatorAllocation.allocated_to_operator == data.operator_id)
        .where(ScanningOperatorAllocation.is_active == True)
    ).first()

    if not new_soa:
        # Create new SOA if it doesn't exist
        new_soa = ScanningOperatorAllocation(
            vendor_allocation_id=va.vendor_allocation_id,
            allocated_to_operator=data.operator_id,
            is_active=True
        )
        session.add(new_soa)
        session.commit()
        session.refresh(new_soa)

    # Update batch to point to new allocation and approve it
    batch.scanning_operator_allocation_id = new_soa.scanning_operator_allocation_id
    batch.vendor_approved = True
    session.add(batch)
    
    # --- Trigger Notification ---
    try:
        create_notification(
            session=session,
            user_id=data.operator_id,
            notif_type=NotificationType.QC_Assigned, # Reusing type for assignment
            title="New Batch Allocated",
            message=f"Vendor {current_user.name} has allocated Batch {batch.batch_id} to you.",
            link="/upload"  # Operator upload page
        )
    except Exception as e:
        print(f"⚠️ Failed to create notification: {e}")

    session.commit()

    return {"message": "Batch reallocated successfully", "new_operator_id": str(data.operator_id)}

@router.post("/approve-rework/{batch_uid}")
def approve_rework_batch(
    batch_uid: UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Vendor approves/releases a rework batch for the operator"""
    if current_user.user_role != UserRole.Vendor:
        raise HTTPException(status_code=403, detail="Only Vendors can approve rework.")

    batch = session.get(Batch, batch_uid)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    # Verify vendor owns this batch via ScanningOperatorAllocation
    soa = session.get(ScanningOperatorAllocation, batch.scanning_operator_allocation_id)
    if not soa:
         raise HTTPException(status_code=404, detail="Batch allocation not found")
    
    va = session.get(VendorAllocation, soa.vendor_allocation_id)
    if not va or va.allocated_to_vendor != current_user.user_id:
        raise HTTPException(status_code=403, detail="Access denied")

    batch.vendor_approved = True
    session.add(batch)
    
    # --- Trigger Notification ---
    try:
        create_notification(
            session=session,
            user_id=soa.allocated_to_operator,
            notif_type=NotificationType.Batch_Rejected,
            title="Rework Batch Released",
            message=f"Vendor {current_user.name} has approved and released Rework Batch {batch.batch_id} to you.",
            link="/re-upload"  # Operator re-upload page
        )
    except Exception as e:
        print(f"⚠️ Failed to create notification: {e}")

    session.commit()

    return {"message": "Rework batch approved and released to operator"}

@router.get("/operators", response_model=List[dict])
def list_vendor_operators(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """List all scanning operators created by or managed by this vendor"""
    if current_user.user_role != UserRole.Vendor:
        raise HTTPException(status_code=403, detail="Access denied")

    operators = session.exec(
        select(User)
        .where(User.user_role == UserRole.Scanning_Operator)
        .where(User.created_by == current_user.user_id)
        .where(User.is_active == True)
    ).all()

    return [{"user_id": str(u.user_id), "name": u.name, "username": u.username} for u in operators]
@router.get("/qc-history", response_model=List[BatchQCHistoryRead])
def list_vendor_qc_history(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Get QC history for all batches uploaded by this vendor's operators"""
    if current_user.user_role != UserRole.Vendor:
        raise HTTPException(status_code=403, detail="Only Vendors can access this.")

    from sqlalchemy import func
    OperatorUser = User

    # Filter by batches where QC status is Verified or Verified_With_Rejection
    statement = select(
        Batch, Source, Location, RecordOwner, RecordType, RecordName, Project, OperatorUser, QCAllocation
    ).join(Source, Batch.source_id == Source.source_id)\
     .join(Location, Batch.location_id == Location.location_id)\
     .join(RecordOwner, Batch.record_owner_id == RecordOwner.record_owner_id)\
     .join(RecordType, Batch.record_type_id == RecordType.record_type_id)\
     .join(RecordName, Batch.record_name_id == RecordName.record_name_id)\
     .join(Project, Source.project_id == Project.project_id)\
     .join(ScanningOperatorAllocation, Batch.scanning_operator_allocation_id == ScanningOperatorAllocation.scanning_operator_allocation_id)\
     .join(VendorAllocation, ScanningOperatorAllocation.vendor_allocation_id == VendorAllocation.vendor_allocation_id)\
     .join(OperatorUser, ScanningOperatorAllocation.allocated_to_operator == OperatorUser.user_id)\
     .join(QCAllocation, Batch.batch_uid == QCAllocation.batch_uid)\
     .where(VendorAllocation.allocated_to_vendor == current_user.user_id)\
     .where(QCAllocation.qc_batch_status.in_([QCBatchStatus.Verified, QCBatchStatus.Verified_With_Rejection]))\
     .order_by(Batch.created_date.desc())
    
    results = session.exec(statement).all()
    
    output = []
    for b, s, l, ro, rt, rn, p, opt, qca in results:
        qc_done = 0
        accepted = 0
        rejected = 0
        qc_status = "Pending Allocation"
        allocation_date = None
        qc_completed_date = None

        if qca:
            qc_status = qca.qc_batch_status
            allocation_date = qca.allocation_date
            qc_completed_date = qca.qc_completed_date
            
            # Count QC stats (Approximations based on QC table)
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

        output.append(BatchQCHistoryRead(
            batch_uid=b.batch_uid,
            batch_id=b.batch_id,
            project_name=p.project_name,
            source_name=s.source_name,
            location_name=l.location_name,
            record_owner_name=ro.record_owner_name,
            record_type_name=rt.record_type_name,
            book_name=rn.record_name,
            total_count=b.total_count,
            upload_count=b.upload_count,
            qc_done_count=qc_done,
            accepted_count=accepted,
            rejected_count=rejected,
            qc_status=qc_status,
            upload_type="Re-upload" if b.is_reupload else ("Partial" if b.is_partial else "Complete"),
            operator_name=opt.name,
            allocation_date=allocation_date,
            qc_completed_date=qc_completed_date
        ))
    
    return output
@router.get("/qc-report/{batch_uid}")
def get_vendor_batch_qc_report(
    batch_uid: UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Get detailed image-by-image QC report for a verified batch"""
    if current_user.user_role != UserRole.Vendor:
        raise HTTPException(status_code=403, detail="Access denied")

    # Verify the batch belongs to this vendor's operators and is verified
    statement = select(QCAllocation)\
        .join(Batch, QCAllocation.batch_uid == Batch.batch_uid)\
        .join(ScanningOperatorAllocation, Batch.scanning_operator_allocation_id == ScanningOperatorAllocation.scanning_operator_allocation_id)\
        .join(VendorAllocation, ScanningOperatorAllocation.vendor_allocation_id == VendorAllocation.vendor_allocation_id)\
        .where(Batch.batch_uid == batch_uid)\
        .where(VendorAllocation.allocated_to_vendor == current_user.user_id)\
        .where(QCAllocation.qc_batch_status.in_([QCBatchStatus.Verified, QCBatchStatus.Verified_With_Rejection]))

    allocation = session.exec(statement).first()
    if not allocation:
        raise HTTPException(status_code=404, detail="Verified batch report not found or not specialized to you")

    # Get all images and their QC records
    from common.models import Image
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

@router.get("/dashboard-stats")
def get_vendor_dashboard_stats(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Get statistics for the Vendor Dashboard"""
    if current_user.user_role != UserRole.Vendor:
        raise HTTPException(status_code=403, detail="Not authorized.")

    from sqlalchemy.orm import aliased
    from sqlalchemy import func

    # 1. Resource Counts
    counts = {
        "operators": session.exec(select(func.count(User.user_id)).where(User.created_by == current_user.user_id)).one(),
        "allocations": session.exec(
            select(func.count(VendorAllocation.vendor_allocation_id))
            .where(VendorAllocation.allocated_to_vendor == current_user.user_id)
            .where(VendorAllocation.is_active == True)
        ).one(),
    }

    # 2. Upload Performance
    batches_stmt = (
        select(Batch, Upload)
        .join(ScanningOperatorAllocation, Batch.scanning_operator_allocation_id == ScanningOperatorAllocation.scanning_operator_allocation_id)
        .join(VendorAllocation, ScanningOperatorAllocation.vendor_allocation_id == VendorAllocation.vendor_allocation_id)
        .outerjoin(Upload, Batch.batch_uid == Upload.batch_uid)
        .where(VendorAllocation.allocated_to_vendor == current_user.user_id)
    )
    batches_results = session.exec(batches_stmt).all()
    
    total_batches = len(batches_results)
    target_images = sum(b.total_count for b, u in batches_results)
    uploaded_images = sum(u.completed_count for b, u in batches_results if u)
    completed_batches = len([u for b, u in batches_results if u and u.upload_status == 'Completed'])
    
    # Rework Needed
    rework_batches = len([b for b, u in batches_results if b.is_reupload and not b.vendor_approved])

    # 3. QC Insights
    all_qca_stmt = (
        select(QCAllocation)
        .join(Batch, QCAllocation.batch_uid == Batch.batch_uid)
        .join(ScanningOperatorAllocation, Batch.scanning_operator_allocation_id == ScanningOperatorAllocation.scanning_operator_allocation_id)
        .join(VendorAllocation, ScanningOperatorAllocation.vendor_allocation_id == VendorAllocation.vendor_allocation_id)
        .where(VendorAllocation.allocated_to_vendor == current_user.user_id)
        .where(QCAllocation.qc_batch_status.in_([QCBatchStatus.Verified, QCBatchStatus.Verified_With_Rejection]))
    )
    all_qca = session.exec(all_qca_stmt).all()
    
    total_accepted = 0
    total_rejected = 0
    for qca in all_qca:
        accepted = session.exec(select(func.count(QC.qc_id)).where(QC.qc_allocation_id == qca.qc_allocation_id).where(QC.qc_status == QCStatus.Approved)).one()
        rejected = session.exec(select(func.count(QC.qc_id)).where(QC.qc_allocation_id == qca.qc_allocation_id).where(QC.qc_status == QCStatus.Rejected)).one()
        total_accepted += accepted
        total_rejected += rejected

    # 4. Recent Activity
    recent_batches = list_vendor_batches(session, current_user)[:5]

    return {
        "counts": counts,
        "performance": {
            "total_batches": total_batches,
            "completed_batches": completed_batches,
            "target_images": target_images,
            "uploaded_images": uploaded_images,
            "rework_needed": rework_batches
        },
        "qc_stats": {
            "total_accepted": total_accepted,
            "total_rejected": total_rejected,
            "accuracy": round((total_accepted / (total_accepted + total_rejected) * 100), 2) if (total_accepted + total_rejected) > 0 else 100
        },
        "recent_batches": recent_batches
    }
