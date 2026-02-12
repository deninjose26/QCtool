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
    from common.audit_logger import log_action
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

    # Log the action
    log_action(
        session=session,
        user_id=current_user.user_id,
        username=current_user.username,
        action="Operator Allocated",
        endpoint="/vendor/operator-allocations",
        method="POST",
        payload={
            "operator_id": str(data.operator_id),
            "operator_name": operator.name,
            "vendor_allocation_id": str(data.vendor_allocation_id)
        },
        result="success"
    )

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
    from common.audit_logger import log_action
    if current_user.user_role != UserRole.Vendor:
        raise HTTPException(status_code=403, detail="Only Vendors can perform updates.")
    
    oa = session.get(ScanningOperatorAllocation, allocation_id)
    if not oa:
        raise HTTPException(status_code=404, detail="Allocation not found")
    
    # Verify ownership
    va = session.get(VendorAllocation, oa.vendor_allocation_id)
    if not va or va.allocated_to_vendor != current_user.user_id:
        raise HTTPException(status_code=403, detail="Access denied")

    changes = {}

    if data.operator_id:
        if oa.allocated_to_operator != data.operator_id:
             changes["operator_id"] = {"old": str(oa.allocated_to_operator), "new": str(data.operator_id)}
        oa.allocated_to_operator = data.operator_id
    if data.vendor_allocation_id:
        # Check if they have access to the new resource
        new_va = session.get(VendorAllocation, data.vendor_allocation_id)
        if not new_va or new_va.allocated_to_vendor != current_user.user_id:
            raise HTTPException(status_code=400, detail="Invalid target resource")
        if oa.vendor_allocation_id != data.vendor_allocation_id:
            changes["vendor_allocation_id"] = {"old": str(oa.vendor_allocation_id), "new": str(data.vendor_allocation_id)}
        oa.vendor_allocation_id = data.vendor_allocation_id
    
    if data.is_active is not None:
        if oa.is_active != data.is_active:
             changes["is_active"] = {"old": oa.is_active, "new": data.is_active}
        oa.is_active = data.is_active

    session.add(oa)
    session.commit()
    session.refresh(oa)

    # Log the action
    if changes:
        log_action(
            session=session,
            user_id=current_user.user_id,
            username=current_user.username,
            action="Operator Allocation Updated",
            endpoint=f"/vendor/operator-allocations/{allocation_id}",
            method="PUT",
            payload={
                "allocation_id": str(allocation_id),
                "changes": changes
            },
            result="success"
        )

    return oa

@router.delete("/operator-allocations/{allocation_id}")
def delete_operator_allocation(
    allocation_id: UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Hard delete an operator allocation."""
    from common.audit_logger import log_action
    if current_user.user_role != UserRole.Vendor:
        raise HTTPException(status_code=403, detail="Only Vendors can perform deletions.")

    oa = session.get(ScanningOperatorAllocation, allocation_id)
    if not oa:
        raise HTTPException(status_code=404, detail="Allocation not found")
    
    # Verify ownership
    va = session.get(VendorAllocation, oa.vendor_allocation_id)
    if not va or va.allocated_to_vendor != current_user.user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    operator_id = oa.allocated_to_operator

    session.delete(oa)
    session.commit()

    # Log the action
    log_action(
        session=session,
        user_id=current_user.user_id,
        username=current_user.username,
        action="Operator Allocation Deleted",
        endpoint=f"/vendor/operator-allocations/{allocation_id}",
        method="DELETE",
        payload={
            "allocation_id": str(allocation_id),
            "operator_id": str(operator_id)
        },
        result="success"
    )

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
    
    # Identiy related batches for image fetching (Lineage Support)
    from sqlmodel import or_, and_
    parent_uid = None
    if batch.is_reupload:
        import re
        # Find the R# suffix
        match = re.search(r'R(\d+)$', batch.batch_id)
        if match:
            rework_num = int(match.group(1))
            if rework_num > 1:
                # If R2, parent is R1
                parent_batch_id = re.sub(r'R\d+$', f'R{rework_num-1}', batch.batch_id)
            else:
                # If R1, parent is the base ID (e.g. C1)
                parent_batch_id = re.sub(r'R\d+$', '', batch.batch_id)
            
            if parent_batch_id != batch.batch_id:
                parent_batch = session.exec(select(Batch).where(Batch.batch_id == parent_batch_id)).first()
                if parent_batch:
                    parent_uid = parent_batch.batch_uid

    # Fetch images. For re-upload batches, we show:
    # - Images already uploaded to the current rework batch
    # - ONLY rejected images from the parent batch (to show what needs fixing)
    images_dict = {}
    
    # 1. Fetch images from current batch
    current_statement = select(Image, QC).outerjoin(
        QC, Image.image_id == QC.image_id
    ).where(Image.batch_uid == batch_uid)\
     .where(Image.conversion_status == ConversionStatus.Jpeg_Converted)
    
    current_results = session.exec(current_statement).all()
    for img, qc_rec in current_results:
        images_dict[img.image_name] = (img, qc_rec, "current")

    # 2. If re-upload, fetch rejected images from parent batch that aren't re-uploaded yet
    if parent_uid:
        parent_statement = select(Image, QC).outerjoin(
            QC, Image.image_id == QC.image_id
        ).where(Image.batch_uid == parent_uid)\
         .where(QC.qc_status == QCStatus.Rejected)\
         .where(Image.conversion_status == ConversionStatus.Jpeg_Converted)
        
        parent_results = session.exec(parent_statement).all()
        for img, qc_rec in parent_results:
            if img.image_name not in images_dict:
                images_dict[img.image_name] = (img, qc_rec, "parent")

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
    
    # Sort by image name for consistent output
    sorted_image_names = sorted(images_dict.keys())
    
    for name in sorted_image_names:
        img, qc_rec, source_type = images_dict[name]
        
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
            
        status = "Pending"
        if qc_rec:
            status = qc_rec.qc_status
        elif source_type == "parent":
            # This shouldn't be reached due to where(QC.qc_status == Rejected) above, but for safety:
            status = "Rejected"
        else:
            # New upload in current batch, no QC record yet
            status = "Pending"

        output.append({
            "image_id": str(img.image_id),
            "image_name": img.image_name,
            "url": url,
            "is_converted": True,
            "status": status
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
    from common.audit_logger import log_action
    if current_user.user_role != UserRole.Vendor:
        raise HTTPException(status_code=403, detail="Only Vendors can reallocate batches.")

    batch = session.get(Batch, batch_uid)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    # Get current operator allocation to find the VendorAllocation ID
    current_soa = session.get(ScanningOperatorAllocation, batch.scanning_operator_allocation_id)
    if not current_soa:
        raise HTTPException(status_code=404, detail="Current batch allocation not found")

    old_operator_id = current_soa.allocated_to_operator

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
            notif_type=NotificationType.qc_assigned, # Reusing type for assignment
            title="New Batch Allocated",
            message=f"{current_user.name} has allocated {'a rework batch' if batch.is_reupload else 'Batch'} {batch.batch_id} to you.",
            link="/upload"  # Operator upload page
        )
    except Exception as e:
        print(f"⚠️ Failed to create notification: {e}")

    session.commit()

    # Log the action
    log_action(
        session=session,
        user_id=current_user.user_id,
        username=current_user.username,
        action="Batch Reallocated",
        endpoint=f"/vendor/reallocate-batch/{batch_uid}",
        method="PUT",
        payload={
            "batch_uid": str(batch_uid),
            "batch_id": batch.batch_id,
            "old_operator_id": str(old_operator_id),
            "new_operator_id": str(data.operator_id)
        },
        result="success"
    )

    return {"message": "Batch reallocated successfully", "new_operator_id": str(data.operator_id)}

@router.post("/approve-rework/{batch_uid}")
def approve_rework_batch(
    batch_uid: UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Vendor approves/releases a rework batch for the operator"""
    from common.audit_logger import log_action
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
            notif_type=NotificationType.batch_rejected,
            title="Rework Batch Released",
            message=f"{current_user.name} has approved and released a rework batch {batch.batch_id} to you.",
            link="/re-upload"  # Operator re-upload page
        )
    except Exception as e:
        print(f"⚠️ Failed to create notification: {e}")

    session.commit()

    # Log the action
    log_action(
        session=session,
        user_id=current_user.user_id,
        username=current_user.username,
        action="Rework Batch Approved",
        endpoint=f"/vendor/approve-rework/{batch_uid}",
        method="POST",
        payload={
            "batch_uid": str(batch_uid),
            "batch_id": batch.batch_id,
            "operator_id": str(soa.allocated_to_operator)
        },
        result="success"
    )

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
    
    # Target images come ONLY from initial allocations (ignores inflation from rework batches)
    target_images = sum(b.total_count for b, u in batches_results if not b.is_reupload)
    
    # Total images that have been physically uploaded across everything
    gross_uploaded = sum(u.completed_count for b, u in batches_results if u)
    
    # Net Uploaded = Gross - (Rejected images that haven't been replaced yet)
    # Actually, for the Progress Bar, the most accurate is to show (Gross - Rejected)
    # This shows Exactly how many 'Good or Pending' images are in the pipe.
    total_rejected_stmt = (
        select(func.count(QC.qc_id))
        .join(QCAllocation, QC.qc_allocation_id == QCAllocation.qc_allocation_id)
        .join(Batch, QCAllocation.batch_uid == Batch.batch_uid)
        .join(ScanningOperatorAllocation, Batch.scanning_operator_allocation_id == ScanningOperatorAllocation.scanning_operator_allocation_id)
        .join(VendorAllocation, ScanningOperatorAllocation.vendor_allocation_id == VendorAllocation.vendor_allocation_id)
        .where(VendorAllocation.allocated_to_vendor == current_user.user_id)
        .where(QC.qc_status == QCStatus.Rejected)
    )
    current_rejected_count = session.exec(total_rejected_stmt).one()
    
    # We subtract active rejections from the gross because re-uploads for these rejections 
    # will add back to the gross count eventually.
    uploaded_images = max(0, gross_uploaded - current_rejected_count)
    
    # Optimization: Ensure Progress Bar doesn't exceed 100% if Target was slightly off
    if target_images > 0:
        uploaded_images = min(uploaded_images, target_images)
    
    # Batches that have been physically uploaded
    uploaded_batches = len([u for b, u in batches_results if u and u.upload_status == 'Completed'])
    
    # Batches that have passed QC Verification (Finalized)
    verified_batches_stmt = (
        select(func.count(QCAllocation.qc_allocation_id))
        .join(Batch, QCAllocation.batch_uid == Batch.batch_uid)
        .join(ScanningOperatorAllocation, Batch.scanning_operator_allocation_id == ScanningOperatorAllocation.scanning_operator_allocation_id)
        .join(VendorAllocation, ScanningOperatorAllocation.vendor_allocation_id == VendorAllocation.vendor_allocation_id)
        .where(VendorAllocation.allocated_to_vendor == current_user.user_id)
        .where(QCAllocation.qc_batch_status.in_([QCBatchStatus.Verified, QCBatchStatus.Verified_With_Rejection]))
    )
    verified_batches = session.exec(verified_batches_stmt).one()
    
    # Rework Needed
    rework_batches = len([b for b, u in batches_results if b.is_reupload and not b.vendor_approved])

    # 3. QC Insights
    # Get all QC records across all allocations for this vendor's batches
    qc_summary_stmt = (
        select(QC.qc_status, func.count(QC.qc_id))
        .join(QCAllocation, QC.qc_allocation_id == QCAllocation.qc_allocation_id)
        .join(Batch, QCAllocation.batch_uid == Batch.batch_uid)
        .join(ScanningOperatorAllocation, Batch.scanning_operator_allocation_id == ScanningOperatorAllocation.scanning_operator_allocation_id)
        .join(VendorAllocation, ScanningOperatorAllocation.vendor_allocation_id == VendorAllocation.vendor_allocation_id)
        .where(VendorAllocation.allocated_to_vendor == current_user.user_id)
        .group_by(QC.qc_status)
    )
    qc_summary_results = session.exec(qc_summary_stmt).all()
    
    qc_counts_map = {status: count for status, count in qc_summary_results}
    total_accepted = qc_counts_map.get(QCStatus.Approved, 0)
    total_rejected = qc_counts_map.get(QCStatus.Rejected, 0)
    
    # Pending QC = Uploaded - (Accepted + Rejected)
    # This includes images in batches not yet allocated, and images in allocated batches with status 'Pending'
    total_qc_pending = max(0, uploaded_images - (total_accepted + total_rejected))

    # 4. Recent Activity
    recent_batches = list_vendor_batches(session, current_user)[:5]

    return {
        "counts": counts,
        "performance": {
            "total_batches": total_batches,
            "uploaded_batches": uploaded_batches,
            "verified_batches": verified_batches,
            "target_images": target_images,
            "uploaded_images": uploaded_images,
            "rework_needed": rework_batches
        },
        "qc_stats": {
            "total_accepted": total_accepted,
            "total_rejected": total_rejected,
            "total_qc_pending": total_qc_pending,
            "accuracy": round((total_accepted / (total_accepted + total_rejected) * 100), 2) if (total_accepted + total_rejected) > 0 else 100
        },
        "recent_batches": recent_batches
    }
