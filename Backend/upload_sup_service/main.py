from fastapi import APIRouter, Depends, HTTPException, FastAPI
from sqlmodel import Session, select, func
from sqlalchemy.orm import aliased
from pydantic import BaseModel
from common.database import get_session
from common.models import (
    Project, Source, Location, RecordOwner, RecordType, UserRole, User, 
    Batch, Upload, VendorAllocation, ScanningOperatorAllocation, RecordName,
    get_ist_now
)
from common.auth_utils import role_required, get_current_user
from datetime import datetime
from typing import Optional, List
from uuid import UUID

app = FastAPI(title="Upload Supervisor Service")
router = APIRouter(prefix="/upload-sup", tags=["Upload Supervisor"])

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
    vendor_name: str
    operator_name: str
    upload_type: str
    status: str
    upload_end_date: Optional[datetime] = None

class SourceCreate(BaseModel):
    project_id: UUID
    source_code: str | None = None
    source_name: str
    created_by: UUID

class LocationCreate(BaseModel):
    project_id: UUID
    source_id: UUID
    location_code: str | None = None
    location_name: str
    created_by: UUID

class RecordOwnerCreate(BaseModel):
    project_id: UUID
    source_id: UUID
    location_id: UUID
    record_owner_code: str | None = None
    record_owner_name: str
    created_by: UUID

class RecordTypeCreate(BaseModel):
    source_id: UUID
    record_type_code: str | None = None
    record_type_name: str
    created_by: UUID

# --- Endpoints ---

@router.post("/sources", response_model=Source)
def create_source(
    source_data: SourceCreate,
    session: Session = Depends(get_session),
    role: str = Depends(role_required([UserRole.SuperAdmin, UserRole.Upload_Supervisor])),
    current_user: User = Depends(get_current_user)
):
    from common.audit_logger import log_action
    
    last_source = session.exec(
        select(Source)
        .where(Source.project_id == source_data.project_id)
        .order_by(Source.source_code.desc())
    ).first()

    if not last_source:
        next_num = 1
    else:
        try:
            next_num = int(last_source.source_code[1:]) + 1
        except (ValueError, IndexError):
            next_num = session.exec(
                select(func.count(Source.source_id))
                .where(Source.project_id == source_data.project_id)
            ).one() + 1

    source_code = f"S{str(next_num).zfill(3)}"
    source_name_upper = source_data.source_name.strip().upper()

    # Check for duplicate name within the project
    existing_source = session.exec(
         select(Source).where(
            Source.source_name == source_name_upper,
            Source.project_id == source_data.project_id
        )
    ).first()
    if existing_source:
        raise HTTPException(
            status_code=400, 
            detail=f"Source with name '{source_name_upper}' already exists in this project."
        )

    db_source = Source(
        project_id=source_data.project_id,
        source_code=source_code,
        source_name=source_name_upper,
        created_by=source_data.created_by
    )
    session.add(db_source)
    session.commit()
    session.refresh(db_source)
    
    # Log the action
    log_action(
        session=session,
        user_id=current_user.user_id,
        username=current_user.username,
        action="Source Created",
        endpoint="/upload-sup/sources",
        method="POST",
        payload={
            "source_code": source_code,
            "source_name": source_name_upper,
            "project_id": str(source_data.project_id)
        },
        result="success"
    )
    
    return db_source

@router.post("/locations", response_model=Location)
def create_location(
    location_data: LocationCreate,
    session: Session = Depends(get_session),
    role: str = Depends(role_required([UserRole.SuperAdmin, UserRole.Upload_Supervisor])),
    current_user: User = Depends(get_current_user)
):
    from common.audit_logger import log_action
    
    last_loc = session.exec(
        select(Location)
        .where(Location.source_id == location_data.source_id)
        .order_by(Location.location_code.desc())
    ).first()

    if not last_loc:
        next_num = 1
    else:
        try:
            next_num = int(last_loc.location_code[1:]) + 1
        except (ValueError, IndexError):
            next_num = session.exec(
                select(func.count(Location.location_id))
                .where(Location.source_id == location_data.source_id)
            ).one() + 1

    location_code = f"L{str(next_num).zfill(3)}"
    location_name_upper = location_data.location_name.strip().upper()

    # Check for duplicate name within the source and project
    existing_loc = session.exec(
         select(Location).where(
            Location.location_name == location_name_upper,
            Location.source_id == location_data.source_id,
            Location.project_id == location_data.project_id
        )
    ).first()
    if existing_loc:
        raise HTTPException(
            status_code=400, 
            detail=f"Location with name '{location_name_upper}' already exists in this source branch."
        )

    db_loc = Location(
        project_id=location_data.project_id,
        source_id=location_data.source_id,
        location_code=location_code,
        location_name=location_name_upper,
        created_by=location_data.created_by
    )
    session.add(db_loc)
    session.commit()
    session.refresh(db_loc)
    
    # Log the action
    log_action(
        session=session,
        user_id=current_user.user_id,
        username=current_user.username,
        action="Location Created",
        endpoint="/upload-sup/locations",
        method="POST",
        payload={
            "location_code": location_code,
            "location_name": location_name_upper,
            "source_id": str(location_data.source_id)
        },
        result="success"
    )
    
    return db_loc

@router.post("/record-owners", response_model=RecordOwner)
def create_record_owner(
    ro_data: RecordOwnerCreate,
    session: Session = Depends(get_session),
    role: str = Depends(role_required([UserRole.SuperAdmin, UserRole.Upload_Supervisor])),
    current_user: User = Depends(get_current_user)
):
    from common.audit_logger import log_action
    
    last_ro = session.exec(
        select(RecordOwner)
        .where(RecordOwner.location_id == ro_data.location_id)
        .order_by(RecordOwner.record_owner_code.desc())
    ).first()

    if not last_ro:
        next_num = 1
    else:
        try:
            next_num = int(last_ro.record_owner_code[1:]) + 1
        except (ValueError, IndexError):
            next_num = session.exec(
                select(func.count(RecordOwner.record_owner_id))
                .where(RecordOwner.location_id == ro_data.location_id)
            ).one() + 1

    ro_code = f"R{str(next_num).zfill(4)}"
    ro_name_upper = ro_data.record_owner_name.strip().upper()

    # Check for duplicate name within the project, source and location
    existing_ro = session.exec(
         select(RecordOwner).where(
            RecordOwner.record_owner_name == ro_name_upper,
            RecordOwner.location_id == ro_data.location_id,
            RecordOwner.source_id == ro_data.source_id,
            RecordOwner.project_id == ro_data.project_id
        )
    ).first()
    if existing_ro:
        raise HTTPException(
            status_code=400, 
            detail=f"Record Owner with name '{ro_name_upper}' already exists in this location branch."
        )

    db_ro = RecordOwner(
        project_id=ro_data.project_id,
        source_id=ro_data.source_id,
        location_id=ro_data.location_id,
        record_owner_code=ro_code,
        record_owner_name=ro_name_upper,
        created_by=ro_data.created_by
    )
    session.add(db_ro)
    session.commit()
    session.refresh(db_ro)
    
    # Log the action
    log_action(
        session=session,
        user_id=current_user.user_id,
        username=current_user.username,
        action="Record Owner Created",
        endpoint="/upload-sup/record-owners",
        method="POST",
        payload={
            "record_owner_code": ro_code,
            "record_owner_name": ro_name_upper,
            "location_id": str(ro_data.location_id)
        },
        result="success"
    )
    
    return db_ro

@router.post("/record-types", response_model=RecordType)
def create_record_type(
    rt_data: RecordTypeCreate,
    session: Session = Depends(get_session),
    role: str = Depends(role_required([UserRole.SuperAdmin, UserRole.Upload_Supervisor])),
    current_user: User = Depends(get_current_user)
):
    from common.audit_logger import log_action
    
    last_rt = session.exec(
        select(RecordType)
        .where(RecordType.source_id == rt_data.source_id)
        .order_by(RecordType.record_type_code.desc())
    ).first()

    if not last_rt:
        next_num = 1
    else:
        try:
            next_num = int(last_rt.record_type_code[2:]) + 1
        except (ValueError, IndexError):
            next_num = session.exec(
                select(func.count(RecordType.record_type_id))
                .where(RecordType.source_id == rt_data.source_id)
            ).one() + 1

    rt_code = f"RT{str(next_num).zfill(3)}"
    rt_name_upper = rt_data.record_type_name.strip().upper()

    # Check for duplicate name within the source
    existing_rt = session.exec(
         select(RecordType).where(
            RecordType.record_type_name == rt_name_upper,
            RecordType.source_id == rt_data.source_id
        )
    ).first()
    if existing_rt:
        raise HTTPException(
            status_code=400, 
            detail=f"Record Type with name '{rt_name_upper}' already exists in this source."
        )

    db_rt = RecordType(
        source_id=rt_data.source_id,
        record_type_code=rt_code,
        record_type_name=rt_name_upper,
        created_by=rt_data.created_by
    )
    session.add(db_rt)
    session.commit()
    session.refresh(db_rt)
    
    # Log the action
    log_action(
        session=session,
        user_id=current_user.user_id,
        username=current_user.username,
        action="Record Type Created",
        endpoint="/upload-sup/record-types",
        method="POST",
        payload={
            "record_type_code": rt_code,
            "record_type_name": rt_name_upper,
            "source_id": str(rt_data.source_id)
        },
        result="success"
    )
    
    return db_rt

# --- Vendor Allocation ---

from common.models import VendorAllocation

class VendorAllocationCreate(BaseModel):
    project_id: UUID
    source_id: UUID
    location_id: UUID
    record_owner_id: UUID
    allocated_to_vendor: UUID
    allocated_by_supervisor: UUID

class VendorAllocationUpdate(BaseModel):
    project_id: Optional[UUID] = None
    source_id: Optional[UUID] = None
    location_id: Optional[UUID] = None
    record_owner_id: Optional[UUID] = None
    allocated_to_vendor: Optional[UUID] = None
    is_active: Optional[bool] = None

@router.post("/allocations", response_model=VendorAllocation)
def create_allocation(
    alloc_data: VendorAllocationCreate,
    session: Session = Depends(get_session),
    role: str = Depends(role_required([UserRole.SuperAdmin, UserRole.Upload_Supervisor])),
    current_user: User = Depends(get_current_user)
):
    from common.audit_logger import log_action
    
    # Check if this active combination is already allocated
    # Provision: Admin can toggle if multiple vendors are allowed for same combination
    from common.models import SystemSettings
    allow_multiple = session.exec(
        select(SystemSettings).where(SystemSettings.setting_id == "allow_multiple_vendor_allocations")
    ).first()
    
    # Default is False (only 1 vendor)
    should_restrict = True
    if allow_multiple and allow_multiple.setting_value.lower() == "true":
        should_restrict = False

    if should_restrict:
        # Check if already exists for ANOTHER vendor (same vendor re-allocation might be okay if it's inactive, 
        # but here we check for ANY active one including self)
        existing = session.exec(
            select(VendorAllocation).where(
                VendorAllocation.project_id == alloc_data.project_id,
                VendorAllocation.source_id == alloc_data.source_id,
                VendorAllocation.location_id == alloc_data.location_id,
                VendorAllocation.record_owner_id == alloc_data.record_owner_id,
                VendorAllocation.is_active == True
            )
        ).first()
        
        if existing:
            raise HTTPException(status_code=400, detail="This combination is already active for a vendor.")

    db_alloc = VendorAllocation(
        project_id=alloc_data.project_id,
        source_id=alloc_data.source_id,
        location_id=alloc_data.location_id,
        record_owner_id=alloc_data.record_owner_id,
        allocated_to_vendor=alloc_data.allocated_to_vendor,
        allocated_by_supervisor=alloc_data.allocated_by_supervisor
    )
    session.add(db_alloc)
    session.commit()
    session.refresh(db_alloc)
    
    # Get vendor name for audit log
    vendor = session.get(User, alloc_data.allocated_to_vendor)
    vendor_name = vendor.name if vendor else "Unknown"
    
    # Log the action
    log_action(
        session=session,
        user_id=current_user.user_id,
        username=current_user.username,
        action="Vendor Allocated",
        endpoint="/upload-sup/allocations",
        method="POST",
        payload={
            "vendor_name": vendor_name,
            "vendor_id": str(alloc_data.allocated_to_vendor),
            "record_owner_id": str(alloc_data.record_owner_id)
        },
        result="success"
    )
    
    return db_alloc

@router.get("/allocations", response_model=list[VendorAllocation])
def get_allocations(
    session: Session = Depends(get_session),
    role: str = Depends(role_required([UserRole.SuperAdmin, UserRole.Upload_Supervisor]))
):
    # Return all allocations (active and disabled) for management
    return session.exec(select(VendorAllocation).order_by(VendorAllocation.created_date.desc())).all()

@router.put("/allocations/{alloc_id}", response_model=VendorAllocation)
def update_allocation(
    alloc_id: UUID,
    alloc_data: VendorAllocationUpdate,
    session: Session = Depends(get_session),
    role: str = Depends(role_required([UserRole.SuperAdmin, UserRole.Upload_Supervisor])),
    current_user: User = Depends(get_current_user)
):
    from common.audit_logger import log_action
    db_alloc = session.get(VendorAllocation, alloc_id)
    if not db_alloc:
        raise HTTPException(status_code=404, detail="Allocation not found")
    
    changes = {}

    if alloc_data.project_id:
        # For simplicity, we just log that IDs changed, or we could fetch names
        if db_alloc.project_id != alloc_data.project_id:
            changes["project_id"] = {"old": str(db_alloc.project_id), "new": str(alloc_data.project_id)}
        db_alloc.project_id = alloc_data.project_id
    if alloc_data.source_id:
        if db_alloc.source_id != alloc_data.source_id:
            changes["source_id"] = {"old": str(db_alloc.source_id), "new": str(alloc_data.source_id)}
        db_alloc.source_id = alloc_data.source_id
    if alloc_data.location_id:
        if db_alloc.location_id != alloc_data.location_id:
            changes["location_id"] = {"old": str(db_alloc.location_id), "new": str(alloc_data.location_id)}
        db_alloc.location_id = alloc_data.location_id
    if alloc_data.record_owner_id:
        if db_alloc.record_owner_id != alloc_data.record_owner_id:
            changes["record_owner_id"] = {"old": str(db_alloc.record_owner_id), "new": str(alloc_data.record_owner_id)}
        db_alloc.record_owner_id = alloc_data.record_owner_id
    if alloc_data.allocated_to_vendor:
        if db_alloc.allocated_to_vendor != alloc_data.allocated_to_vendor:
            changes["allocated_to_vendor"] = {"old": str(db_alloc.allocated_to_vendor), "new": str(alloc_data.allocated_to_vendor)}
        db_alloc.allocated_to_vendor = alloc_data.allocated_to_vendor
    if alloc_data.is_active is not None:
        if db_alloc.is_active != alloc_data.is_active:
            changes["is_active"] = {"old": db_alloc.is_active, "new": alloc_data.is_active}
        db_alloc.is_active = alloc_data.is_active
    
    db_alloc.last_updated = get_ist_now()
    session.add(db_alloc)
    session.commit()
    session.refresh(db_alloc)

    # Log the action
    if changes:
        log_action(
            session=session,
            user_id=current_user.user_id,
            username=current_user.username,
            action="Vendor Allocation Updated",
            endpoint=f"/upload-sup/allocations/{alloc_id}",
            method="PUT",
            payload={
                "allocation_id": str(alloc_id),
                "changes": changes
            },
            result="success"
        )

    return db_alloc

@router.delete("/allocations/{alloc_id}")
def delete_allocation(
    alloc_id: UUID,
    session: Session = Depends(get_session),
    role: str = Depends(role_required([UserRole.SuperAdmin])),
    current_user: User = Depends(get_current_user)
):
    # Deletion is still available for SuperAdmins if needed, 
    # but we will emphasize 'is_active' toggle in UI
    from common.audit_logger import log_action
    db_alloc = session.get(VendorAllocation, alloc_id)
    if not db_alloc:
        raise HTTPException(status_code=404, detail="Allocation not found")
    
    vendor_id = db_alloc.allocated_to_vendor

    session.delete(db_alloc)
    session.commit()

    # Log the action
    log_action(
        session=session,
        user_id=current_user.user_id,
        username=current_user.username,
        action="Vendor Allocation Deleted",
        endpoint=f"/upload-sup/allocations/{alloc_id}",
        method="DELETE",
        payload={
            "allocation_id": str(alloc_id),
            "vendor_id": str(vendor_id)
        },
        result="success"
    )
    
    return {"ok": True}

# Include the router in the app
app.include_router(router)

@app.get("/")
def read_root():
    return {"service": "Upload Supervisor Service", "port": 8003}

# --- Batch History ---

@router.get("/batches", response_model=List[BatchRead])
def list_sup_batches(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    if current_user.user_role not in [UserRole.SuperAdmin, UserRole.Upload_Supervisor]:
        raise HTTPException(status_code=403, detail="Not authorized.")
    
    OperatorUser = aliased(User)
    VendorUser = aliased(User)
    
    # Use a subquery to get actual unique image counts from the Image table
    # Using DISTINCT on image_name to handle cases where duplicate records might exist
    from sqlalchemy import distinct
    from common.models import Image
    image_counts = select(
        Image.batch_uid,
        func.count(distinct(Image.image_name)).label("actual_count")
    ).group_by(Image.batch_uid).subquery()

    statement = select(
        Batch, Source, Location, RecordOwner, RecordType, RecordName, Project, Upload, OperatorUser, VendorUser,
        image_counts.c.actual_count
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
     .join(VendorUser, VendorAllocation.allocated_to_vendor == VendorUser.user_id)\
     .outerjoin(image_counts, Batch.batch_uid == image_counts.c.batch_uid)\
     .order_by(Batch.created_date.desc())
    
    results = session.exec(statement).all()
    
    output = []
    for b, s, l, ro, rt, rn, p, u, opt, vnd, actual_count in results:
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
            target_count=b.upload_count,
            completed_count=actual_count or 0,
            vendor_name=vnd.name,
            operator_name=opt.name,
            upload_type=upload_type,
            status=status,
            upload_end_date=u.upload_end_date if u else None
        ))
    
    return output

# Alias endpoint for clarity in frontend
@router.get("/all-batches", response_model=List[BatchRead])
def list_all_batches(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Get all batches uploaded by all scanning operators (same as /batches)"""
    return list_sup_batches(session, current_user)

@router.get("/batch-images/{batch_uid}")
def get_supervisor_batch_images(
    batch_uid: UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Get all images for a specific batch"""
    if current_user.user_role not in [UserRole.SuperAdmin, UserRole.Upload_Supervisor]:
        raise HTTPException(status_code=403, detail="Only Supervisors can access this.")
    
    # Verify the batch exists
    batch = session.get(Batch, batch_uid)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    
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

@router.get("/dashboard-stats")
def get_upload_sup_dashboard_stats(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Get statistics for the Upload Supervisor Dashboard"""
    if current_user.user_role not in [UserRole.SuperAdmin, UserRole.Upload_Supervisor]:
        raise HTTPException(status_code=403, detail="Not authorized.")

    # 1. Basic Counts
    counts = {
        "vendors": session.exec(select(func.count(User.user_id)).where(User.user_role == UserRole.Vendor)).one(),
        "allocations": session.exec(select(func.count(VendorAllocation.vendor_allocation_id)).where(VendorAllocation.is_active == True)).one(),
        "sources": session.exec(select(func.count(Source.source_id))).one(),
        "locations": session.exec(select(func.count(Location.location_id))).one(),
    }

    # 2. Upload Performance
    all_batches = session.exec(select(Batch)).all()
    total_batches = len(all_batches)
    target_images = sum(b.total_count for b in all_batches)
    
    all_uploads = session.exec(select(Upload)).all()
    uploaded_images = sum(u.completed_count for u in all_uploads)
    
    # Completed vs In-Progress Batches
    completed_batches = len([u for u in all_uploads if u.upload_status == 'Completed'])
    in_progress_batches = len([u for u in all_uploads if u.upload_status == 'In_Progress'])

    # 3. Recent Allocations
    recent_allocs_stmt = (
        select(VendorAllocation, Project, Source, User)
        .join(Project, VendorAllocation.project_id == Project.project_id)
        .join(Source, VendorAllocation.source_id == Source.source_id)
        .join(User, VendorAllocation.allocated_to_vendor == User.user_id)
        .where(VendorAllocation.is_active == True)
        .order_by(VendorAllocation.created_date.desc())
        .limit(5)
    )
    recent_allocs_results = session.exec(recent_allocs_stmt).all()
    
    formatted_allocs = []
    for va, p, s, v in recent_allocs_results:
        formatted_allocs.append({
            "project": p.project_name,
            "source": s.source_name,
            "vendor": v.name,
            "date": va.created_date
        })

    # 4. Recent Batches
    recent_batches = list_sup_batches(session, current_user)[:5]

    return {
        "counts": counts,
        "performance": {
            "total_batches": total_batches,
            "completed_batches": completed_batches,
            "in_progress_batches": in_progress_batches,
            "target_images": target_images,
            "uploaded_images": uploaded_images
        },
        "recent_allocations": formatted_allocs,
        "recent_batches": recent_batches
    }
