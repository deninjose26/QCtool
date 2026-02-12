from fastapi import APIRouter, Depends, HTTPException, status, Header, BackgroundTasks, Request
from sqlmodel import Session, select
from uuid import UUID
from pydantic import BaseModel
from typing import List, Optional
from common.database import get_session, get_retry_session
from common.models import (
    User, UserRole, ScanningOperatorAllocation, VendorAllocation,
    Project, Source, Location, RecordOwner, RecordType, RecordName, Batch, Upload, get_ist_now,
    QCAllocation, QC, QCStatus, QCBatchStatus, Image, FileType, ConversionStatus, NotificationType, UploadStatus
)
from common.auth_utils import get_current_user
from common.notification_utils import create_notification
from datetime import datetime
import boto3
from botocore.client import Config
from botocore.exceptions import ClientError
import os
import httpx

router = APIRouter(prefix="/operator", tags=["Operator Operations"])

# --- Schemas ---
class BatchCreate(BaseModel):
    project_id: UUID
    source_id: UUID
    location_id: UUID
    record_owner_id: UUID
    record_type_id: UUID
    book_name: str
    upload_type: str # complete, partial, re-upload
    total_images: int
    uploading_count: int
    parent_batch_uid: Optional[UUID] = None

class BatchUpdate(BaseModel):
    book_name: Optional[str] = None
    total_images: Optional[int] = None
    uploading_count: Optional[int] = None

class ProjectRead(BaseModel):
    project_id: UUID
    project_name: str

class SourceRead(BaseModel):
    source_id: UUID
    source_name: str
    project_id: UUID

class LocationRead(BaseModel):
    location_id: UUID
    location_name: str
    source_id: UUID

class RecordOwnerRead(BaseModel):
    record_owner_id: UUID
    record_owner_name: str
    location_id: UUID

class RecordTypeRead(BaseModel):
    record_type_id: UUID
    record_type_name: str
    source_id: UUID

class RecordNameRead(BaseModel):
    record_name_id: UUID
    record_name: str
    project_id: UUID

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
    allocation_date: Optional[datetime] = None
    qc_completed_date: Optional[datetime] = None

# --- Endpoints ---

@router.get("/assigned-projects", response_model=List[ProjectRead])
def get_assigned_projects(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    if current_user.user_role != UserRole.Scanning_Operator:
        raise HTTPException(status_code=403, detail="Only Operators can access this.")
    
    statement = select(Project).join(
        VendorAllocation, Project.project_id == VendorAllocation.project_id
    ).join(
        ScanningOperatorAllocation, VendorAllocation.vendor_allocation_id == ScanningOperatorAllocation.vendor_allocation_id
    ).where(ScanningOperatorAllocation.allocated_to_operator == current_user.user_id)\
     .where(ScanningOperatorAllocation.is_active == True)\
     .distinct()
    
    return session.exec(statement).all()

@router.get("/existing-books", response_model=List[RecordNameRead])
def get_existing_books(
    project_id: UUID,
    source_id: Optional[UUID] = None,
    location_id: Optional[UUID] = None,
    record_owner_id: Optional[UUID] = None,
    record_type_id: Optional[UUID] = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Fetch existing books (RecordName) filtered by hierarchy selection."""
    if current_user.user_role != UserRole.Scanning_Operator:
        raise HTTPException(status_code=403, detail="Only Operators can access this.")
    
    # Join RecordName with Batch to filter by hierarchy and operator
    # RecordName only has project_id, other hierarchy info is in Batch
    statement = select(RecordName).join(
        Batch, RecordName.record_name_id == Batch.record_name_id
    ).join(
        ScanningOperatorAllocation, Batch.scanning_operator_allocation_id == ScanningOperatorAllocation.scanning_operator_allocation_id
    ).where(
        RecordName.project_id == project_id
    ).where(
        ScanningOperatorAllocation.allocated_to_operator == current_user.user_id
    )
    
    if source_id:
        statement = statement.where(Batch.source_id == source_id)
    if location_id:
        statement = statement.where(Batch.location_id == location_id)
    if record_owner_id:
        statement = statement.where(Batch.record_owner_id == record_owner_id)
    if record_type_id:
        statement = statement.where(Batch.record_type_id == record_type_id)
    
    statement = statement.distinct().order_by(RecordName.record_name)
    return session.exec(statement).all()

@router.get("/validate-book-name")
def validate_book_name(
    project_id: UUID,
    book_name: str,
    source_id: Optional[UUID] = None,
    location_id: Optional[UUID] = None,
    record_owner_id: Optional[UUID] = None,
    record_type_id: Optional[UUID] = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Validate book name uniqueness within a specific hierarchy branch."""
    if current_user.user_role != UserRole.Scanning_Operator:
        raise HTTPException(status_code=403, detail="Only Operators can access this.")
    
    book_name_upper = book_name.upper().strip()
    
    # 1. First find if a RecordName with this name exists in the project
    record = session.exec(
        select(RecordName)
        .where(RecordName.record_name == book_name_upper)
        .where(RecordName.project_id == project_id)
    ).first()
    
    if not record:
        return {"exists": False, "batches": []}
    
    # 2. If record exists, check if there are any batches in the SAME HIERARCHY for THIS operator
    # If the user provided source/loc etc, we filter by them.
    statement = (
        select(Batch)
        .join(ScanningOperatorAllocation, Batch.scanning_operator_allocation_id == ScanningOperatorAllocation.scanning_operator_allocation_id)
        .where(Batch.record_name_id == record.record_name_id)
        .where(ScanningOperatorAllocation.allocated_to_operator == current_user.user_id)
    )
    
    if source_id:
        statement = statement.where(Batch.source_id == source_id)
    if location_id:
        statement = statement.where(Batch.location_id == location_id)
    if record_owner_id:
        statement = statement.where(Batch.record_owner_id == record_owner_id)
    if record_type_id:
        statement = statement.where(Batch.record_type_id == record_type_id)
        
    batches = session.exec(statement).all()
    
    if not batches:
        return {"exists": False, "batches": []}
    
    batch_info = []
    total_book_pages = 0
    uploaded_pages = 0
    
    for b in batches:
        # Use total_count from the first batch as the book total
        if total_book_pages == 0:
            total_book_pages = b.total_count
            
        uploaded_pages += b.upload_count
        
        b_type = "Complete" if b.is_complete else "Partial" if b.is_partial else "Re-upload"
        batch_info.append({
            "batch_id": b.batch_id,
            "type": b_type,
            "upload_count": b.upload_count
        })
        
    return {
        "exists": True,
        "record_name_id": record.record_name_id,
        "total_pages": total_book_pages,
        "uploaded_pages": uploaded_pages,
        "remaining_pages": max(0, total_book_pages - uploaded_pages),
        "batches": batch_info
    }

@router.get("/book-upload-summary/{record_name_id}")
def get_book_upload_summary(
    record_name_id: UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Get upload summary for a book: total pages and already uploaded pages."""
    if current_user.user_role != UserRole.Scanning_Operator:
        raise HTTPException(status_code=403, detail="Only Operators can access this.")
    
    # Get all batches for this book
    batches = session.exec(
        select(Batch).where(Batch.record_name_id == record_name_id)
    ).all()
    
    if not batches:
        return {
            "record_name_id": str(record_name_id),
            "total_count": 0,
            "already_uploaded": 0,
            "remaining": 0
        }
    
    # Total count is from the first batch (all batches should have same total_count)
    total_count = batches[0].total_count
    
    # Sum of upload_count from all batches (P1 + P2 + P3...)
    already_uploaded = sum(batch.upload_count for batch in batches)
    
    remaining = max(0, total_count - already_uploaded)
    
    return {
        "record_name_id": str(record_name_id),
        "total_count": total_count,
        "already_uploaded": already_uploaded,
        "remaining": remaining
    }

@router.get("/assigned-sources/{project_id}", response_model=List[SourceRead])
def get_assigned_sources(
    project_id: UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    statement = select(Source).join(
        VendorAllocation, Source.source_id == VendorAllocation.source_id
    ).join(
        ScanningOperatorAllocation, VendorAllocation.vendor_allocation_id == ScanningOperatorAllocation.vendor_allocation_id
    ).where(ScanningOperatorAllocation.allocated_to_operator == current_user.user_id)\
     .where(VendorAllocation.project_id == project_id)\
     .where(ScanningOperatorAllocation.is_active == True)\
     .distinct()
    
    return session.exec(statement).all()

@router.get("/assigned-locations/{source_id}", response_model=List[LocationRead])
def get_assigned_locations(
    source_id: UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    statement = select(Location).join(
        VendorAllocation, Location.location_id == VendorAllocation.location_id
    ).join(
        ScanningOperatorAllocation, VendorAllocation.vendor_allocation_id == ScanningOperatorAllocation.vendor_allocation_id
    ).where(ScanningOperatorAllocation.allocated_to_operator == current_user.user_id)\
     .where(VendorAllocation.source_id == source_id)\
     .where(ScanningOperatorAllocation.is_active == True)\
     .distinct()
    
    return session.exec(statement).all()

@router.get("/assigned-owners/{location_id}", response_model=List[RecordOwnerRead])
def get_assigned_owners(
    location_id: UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    statement = select(RecordOwner).join(
        VendorAllocation, RecordOwner.record_owner_id == VendorAllocation.record_owner_id
    ).join(
        ScanningOperatorAllocation, VendorAllocation.vendor_allocation_id == ScanningOperatorAllocation.vendor_allocation_id
    ).where(ScanningOperatorAllocation.allocated_to_operator == current_user.user_id)\
     .where(VendorAllocation.location_id == location_id)\
     .where(ScanningOperatorAllocation.is_active == True)\
     .distinct()
    
    return session.exec(statement).all()

@router.get("/record-types/{source_id}", response_model=List[RecordTypeRead])
def get_record_types_by_source(
    source_id: UUID,
    session: Session = Depends(get_session)
):
    statement = select(RecordType).where(RecordType.source_id == source_id)
    return session.exec(statement).all()

class AllocationRead(BaseModel):
    allocation_id: str
    project_name: str
    source_name: str
    location_name: str
    record_owner_name: str
    is_enabled: bool
    allocated_date: datetime

@router.get("/my-allocations", response_model=List[AllocationRead])
def get_my_allocations(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Get all resource allocations for the current scanning operator."""
    if current_user.user_role != UserRole.Scanning_Operator:
        raise HTTPException(status_code=403, detail="Only Operators can access this.")
    
    # Join operator allocations with vendor allocations to get full resource details
    statement = select(
        ScanningOperatorAllocation,
        VendorAllocation,
        Project,
        Source,
        Location,
        RecordOwner
    ).join(
        VendorAllocation,
        ScanningOperatorAllocation.vendor_allocation_id == VendorAllocation.vendor_allocation_id
    ).join(
        Project,
        VendorAllocation.project_id == Project.project_id
    ).join(
        Source,
        VendorAllocation.source_id == Source.source_id
    ).join(
        Location,
        VendorAllocation.location_id == Location.location_id
    ).join(
        RecordOwner,
        VendorAllocation.record_owner_id == RecordOwner.record_owner_id
    ).where(
        ScanningOperatorAllocation.allocated_to_operator == current_user.user_id
    ).order_by(
        ScanningOperatorAllocation.created_date.desc()
    )
    
    results = session.exec(statement).all()
    
    allocations = []
    for op_alloc, vendor_alloc, project, source, location, owner in results:
        allocations.append(AllocationRead(
            allocation_id=str(op_alloc.scanning_operator_allocation_id),
            project_name=project.project_name,
            source_name=source.source_name,
            location_name=location.location_name,
            record_owner_name=owner.record_owner_name,
            is_enabled=op_alloc.is_active and vendor_alloc.is_active,
            allocated_date=op_alloc.created_date
        ))
    
    return allocations


@router.post("/batches")
def create_batch(
    data: BatchCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    if current_user.user_role != UserRole.Scanning_Operator:
        raise HTTPException(status_code=403, detail="Only Operators can create batches.")

    # Validate and sanitize book name
    import re
    book_name_upper = data.book_name.upper().strip()
    
    # Check if book name contains only allowed characters (letters, numbers, spaces, hyphens)
    if not re.match(r'^[A-Z0-9\s-]+$', book_name_upper):
        raise HTTPException(
            status_code=400,
            detail="Book name must contain only letters, numbers, spaces, and hyphens (-). Special characters are not allowed."
        )
    
    # Update the book name to uppercase
    data.book_name = book_name_upper

    # 1. Fetch all codes for Batch ID generation
    project = session.get(Project, data.project_id)
    source = session.get(Source, data.source_id)
    location = session.get(Location, data.location_id)
    owner = session.get(RecordOwner, data.record_owner_id)
    rtype = session.get(RecordType, data.record_type_id)

    if not (project and source and location and owner and rtype):
        raise HTTPException(status_code=400, detail="Invalid hierarchy selection.")

    # 2. Find Allocation
    allocation = session.exec(
        select(ScanningOperatorAllocation)
        .join(VendorAllocation, ScanningOperatorAllocation.vendor_allocation_id == VendorAllocation.vendor_allocation_id)
        .where(ScanningOperatorAllocation.allocated_to_operator == current_user.user_id)
        .where(VendorAllocation.project_id == data.project_id)
        .where(VendorAllocation.source_id == data.source_id)
        .where(VendorAllocation.location_id == data.location_id)
        .where(VendorAllocation.record_owner_id == data.record_owner_id)
        .where(ScanningOperatorAllocation.is_active == True)
    ).first()

    if not allocation:
        raise HTTPException(status_code=403, detail="No active allocation found for this resource stack.")

    # 3. Check/Create RecordName (Book)
    # Search by name and project to see if book exists
    record_name = session.exec(
        select(RecordName)
        .where(RecordName.record_name == data.book_name)
        .where(RecordName.project_id == data.project_id)
    ).first()

    if not record_name:
        # Fetch next value from the database sequence
        from sqlalchemy import text
        result = session.execute(text("SELECT nextval('record_code_seq')"))
        next_seq = result.scalar()
        new_code = f"B{str(next_seq).zfill(6)}"
        
        # Use ON CONFLICT to handle race condition if another process created it since our check
        from sqlalchemy.dialects.postgresql import insert as pg_insert
        stmt = pg_insert(RecordName).values(
            project_id=data.project_id,
            record_code=new_code,
            record_name=data.book_name,
            created_by=current_user.user_id,
            created_date=get_ist_now(),
            last_updated=get_ist_now()
        ).on_conflict_do_nothing(
            index_elements=['record_code'] # record_code is unique
        )
        
        session.execute(stmt)
        session.commit()
        
        # Fetch it again (it either just went in, or existed)
        record_name = session.exec(
            select(RecordName)
            .where(RecordName.record_name == data.book_name)
            .where(RecordName.project_id == data.project_id)
        ).first()

        if not record_name:
             raise HTTPException(status_code=500, detail="Failed to create/retrieve book record")

    # 4. Determine Upload Type Code (C1, P2, R1 etc)
    prefix_map = {"complete": "C", "partial": "P", "re-upload": "R"}
    prefix = prefix_map.get(data.upload_type, "X")
    
    # Count existing batches for this specific book, upload type, HIERARCHY and OPERATOR
    existing_count = session.exec(
        select(Batch)
        .join(ScanningOperatorAllocation, Batch.scanning_operator_allocation_id == ScanningOperatorAllocation.scanning_operator_allocation_id)
        .where(Batch.record_name_id == record_name.record_name_id)
        .where(Batch.source_id == data.source_id)
        .where(Batch.location_id == data.location_id)
        .where(Batch.record_owner_id == data.record_owner_id)
        .where(Batch.record_type_id == data.record_type_id)
        .where(ScanningOperatorAllocation.allocated_to_operator == current_user.user_id)
        .where(
            Batch.is_complete if data.upload_type == "complete" else
            Batch.is_partial if data.upload_type == "partial" else
            Batch.is_reupload
        )
    ).all()
    
    # Prevent duplicate Complete batches for the same book
    if data.upload_type == "complete" and len(existing_count) > 0:
        raise HTTPException(
            status_code=400,
            detail=f"A batch already created against this book"
        )
    
    # Prevent Partial batches if a Complete batch already exists for THIS operator
    if data.upload_type == "partial":
        complete_batches = session.exec(
            select(Batch)
            .join(ScanningOperatorAllocation, Batch.scanning_operator_allocation_id == ScanningOperatorAllocation.scanning_operator_allocation_id)
            .where(Batch.record_name_id == record_name.record_name_id)
            .where(Batch.source_id == data.source_id)
            .where(Batch.location_id == data.location_id)
            .where(Batch.record_owner_id == data.record_owner_id)
            .where(Batch.record_type_id == data.record_type_id)
            .where(ScanningOperatorAllocation.allocated_to_operator == current_user.user_id)
            .where(Batch.is_complete == True)
        ).all()
        
        if len(complete_batches) > 0:
            raise HTTPException(
                status_code=400,
                detail=f"Book '{data.book_name}' already has a Complete batch. Partial uploads are not allowed. Use Re-upload to fix specific pages."
            )
    
    # Prevent Complete batches if Partial batches already exist for THIS operator
    if data.upload_type == "complete":
        partial_batches = session.exec(
            select(Batch)
            .join(ScanningOperatorAllocation, Batch.scanning_operator_allocation_id == ScanningOperatorAllocation.scanning_operator_allocation_id)
            .where(Batch.record_name_id == record_name.record_name_id)
            .where(Batch.source_id == data.source_id)
            .where(Batch.location_id == data.location_id)
            .where(Batch.record_owner_id == data.record_owner_id)
            .where(Batch.record_type_id == data.record_type_id)
            .where(ScanningOperatorAllocation.allocated_to_operator == current_user.user_id)
            .where(Batch.is_partial == True)
        ).all()
        
        if len(partial_batches) > 0:
            raise HTTPException(
                status_code=400,
                detail=f"Book '{data.book_name}' already has {len(partial_batches)} Partial batch(es). Complete the partial uploads or delete them before creating a Complete batch."
            )
    
    seq = len(existing_count) + 1
    upload_type_code = f"{prefix}{seq}"

    # 5. Generate Batch ID
    # Format: {proj}_{src}_{loc}_{owner}_{rtype}_{book}_{type_code}
    batch_id_str = f"{project.project_code}_{source.source_code}_{location.location_code}_{owner.record_owner_code}_{rtype.record_type_code}_{record_name.record_code}_{upload_type_code}"

    # 6. Validate upload counts
    if data.upload_type == "complete":
        if data.uploading_count != data.total_images:
            raise HTTPException(
                status_code=400,
                detail=f"For complete upload, uploading count ({data.uploading_count}) must equal total images ({data.total_images})."
            )
    else:  # partial or re-upload
        if data.uploading_count >= data.total_images:
            if data.uploading_count == data.total_images:
                detail_msg = f"For {data.upload_type} upload, uploading count must be less than total images. If you want to upload {data.uploading_count} = {data.total_images}, then use the Complete option."
            else:
                detail_msg = f"For {data.upload_type} upload, uploading count ({data.uploading_count}) must be less than total images ({data.total_images})."
            
            raise HTTPException(
                status_code=400,
                detail=detail_msg
            )
    
    # 7. Create Batch
    new_batch = Batch(
        batch_id=batch_id_str,
        scanning_operator_allocation_id=allocation.scanning_operator_allocation_id,
        source_id=data.source_id,
        location_id=data.location_id,
        record_owner_id=data.record_owner_id,
        record_name_id=record_name.record_name_id,
        record_type_id=data.record_type_id,
        total_count=data.total_images,        # Book Total Size
        upload_count=data.uploading_count,    # Target for this Batch
        is_complete=(data.upload_type == "complete"),
        is_partial=(data.upload_type == "partial"),
        is_reupload=(data.upload_type == "re-upload"),
        parent_batch_uid=data.parent_batch_uid
    )

    try:
        session.add(new_batch)
        session.commit()
        session.refresh(new_batch)
    except Exception as e:
        session.rollback()
        raise HTTPException(status_code=400, detail=f"Batch ID conflict or database error: {str(e)}")

    # Log the action
    from common.audit_logger import log_action
    log_action(
        session=session,
        user_id=current_user.user_id,
        username=current_user.username,
        action="Batch Created",
        endpoint="/operator/batches",
        method="POST",
        payload={
            "batch_uid": str(new_batch.batch_uid),
            "batch_id": new_batch.batch_id,
            "book_name": book_name_upper,
            "upload_type": data.upload_type,
            "total_images": data.total_images
        },
        result="success"
    )

    return {
        "batch_uid": new_batch.batch_uid,
        "batch_id": new_batch.batch_id,
        "message": "Batch created successfully"
    }

@router.get("/rejected-batches")
def list_rejected_batches(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """List batches that were rejected and need rework, to be selected by operator."""
    if current_user.user_role != UserRole.Scanning_Operator:
        raise HTTPException(status_code=403, detail="Only Operators can access this.")

    # A batch is 'rejected' if it has a QCAllocation with status Verified_With_Rejection
    # and it hasn't been 'Fixed' by a rework yet
    statement = select(Batch, QCAllocation)\
        .join(QCAllocation, Batch.batch_uid == QCAllocation.batch_uid)\
        .join(ScanningOperatorAllocation, Batch.scanning_operator_allocation_id == ScanningOperatorAllocation.scanning_operator_allocation_id)\
        .where(ScanningOperatorAllocation.allocated_to_operator == current_user.user_id)\
        .where(QCAllocation.qc_batch_status == QCBatchStatus.Verified_With_Rejection)\
        .order_by(Batch.created_date.desc())
    
    results = session.exec(statement).all()
    
    # Filter out batches that already have a child rework
    output = []
    for b, qca in results:
        has_rework = session.exec(select(Batch).where(Batch.parent_batch_uid == b.batch_uid)).first()
        if not has_rework:
            output.append({
                "batch_uid": b.batch_uid,
                "batch_id": b.batch_id,
                "book_name": session.get(RecordName, b.record_name_id).record_name,
                "total_count": b.total_count,
                "rejected_count": session.exec(
                    select(func.count(QC.qc_id))
                    .where(QC.qc_allocation_id == qca.qc_allocation_id)
                    .where(QC.qc_status == QCStatus.Rejected)
                ).first() or 0
            })
    
    return output

@router.get("/batches")
def list_operator_batches(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    if current_user.user_role != UserRole.Scanning_Operator:
        raise HTTPException(status_code=403, detail="Only Operators can access this.")
    
    from sqlmodel import or_, and_
    
    # We join with Source, Location, RecordOwner, RecordType, RecordName, Project, and optionally Upload
    statement = select(
        Batch, Source, Location, RecordOwner, RecordType, RecordName, Project, Upload
    ).join(Source, Batch.source_id == Source.source_id)\
     .join(Location, Batch.location_id == Location.location_id)\
     .join(RecordOwner, Batch.record_owner_id == RecordOwner.record_owner_id)\
     .join(RecordType, Batch.record_type_id == RecordType.record_type_id)\
     .join(RecordName, Batch.record_name_id == RecordName.record_name_id)\
     .join(Project, Source.project_id == Project.project_id)\
     .outerjoin(Upload, Batch.batch_uid == Upload.batch_uid)\
     .join(ScanningOperatorAllocation, Batch.scanning_operator_allocation_id == ScanningOperatorAllocation.scanning_operator_allocation_id)\
     .where(
         and_(
             Batch.vendor_approved == True,
             or_(
                 # Case 1: Assigned to them AND (not uploaded yet OR uploaded by them)
                 and_(
                     ScanningOperatorAllocation.allocated_to_operator == current_user.user_id,
                     or_(Upload.uploaded_by == None, Upload.uploaded_by == current_user.user_id)
                 ),
                 # Case 2: They were the one who uploaded it (covers history even if assignment changed)
                 Upload.uploaded_by == current_user.user_id
             )
         )
     )\
     .order_by(Batch.created_date.desc())
    
    results = session.exec(statement).all()
    
    output = []
    for batch, src, loc, owner, rtype, rname, proj, upload_rec in results:
        completed = upload_rec.completed_count if upload_rec else 0
        target = batch.upload_count
        
        status = "pending"
        if completed > 0 and completed < target:
            status = "uploading"
        elif completed >= target and target > 0:
            status = "uploaded"
            
        upload_type = "Complete"
        if batch.is_partial:
            upload_type = "Partial"
        elif batch.is_reupload:
            upload_type = "Re-upload"
            
        is_locked = False
        if upload_rec and upload_rec.locked_at:
            # Check if lock is stale (>24 hours)
            time_diff = get_ist_now() - upload_rec.locked_at
            if time_diff.total_seconds() < 86400:
                is_locked = True

        output.append({
            "batch_uid": batch.batch_uid,
            "batch_id": batch.batch_id,
            "project_name": proj.project_name,
            "source_name": src.source_name,
            "location_name": loc.location_name,
            "record_owner_name": owner.record_owner_name,
            "record_type_name": rtype.record_type_name,
            "book_name": rname.record_name,
            "total_count": batch.total_count,    # Book Total
            "target_count": target,              # Batch Target
            "completed_count": completed,        # Actual Uploaded
            "upload_type": upload_type,
            "is_reupload": batch.is_reupload,
            "is_partial": batch.is_partial,
            "status": status,
            "created_date": batch.created_date,
            "upload_end_date": upload_rec.upload_end_date if upload_rec else None,
            "is_locked": is_locked,
            "locked_device": upload_rec.locked_device if is_locked else None,
            "locked_device_id": upload_rec.locked_device_id if is_locked else None,
            "locked_at": upload_rec.locked_at if is_locked else None
        })
    return output

@router.put("/batches/{batch_uid}")
def update_batch(
    batch_uid: UUID,
    data: BatchUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Allows an operator to edit a batch before it starts uploading."""
    if current_user.user_role != UserRole.Scanning_Operator:
        raise HTTPException(status_code=403, detail="Only Operators can edit batches.")

    batch = session.get(Batch, batch_uid)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    # 1. Verify ownership (allow editing if allocated or if they created it)
    is_owner = False
    allocation = session.get(ScanningOperatorAllocation, batch.scanning_operator_allocation_id)
    if allocation and allocation.allocated_to_operator == current_user.user_id:
        is_owner = True
        
    if not is_owner:
        raise HTTPException(status_code=403, detail="You do not have permission to edit this batch.")

    # 2. Check if batch is already uploading or uploaded
    upload_rec = session.exec(select(Upload).where(Upload.batch_uid == batch_uid)).first()
    if upload_rec and upload_rec.completed_count > 0:
         raise HTTPException(
            status_code=400, 
            detail=f"Cannot edit batch that already has uploaded images. Use a new batch for changes."
        )

    # 3. Update fields
    if data.book_name:
        # Sanitize and validate
        import re
        book_name_upper = data.book_name.upper().strip()
        if not re.match(r'^[A-Z0-9\s-]+$', book_name_upper):
            raise HTTPException(status_code=400, detail="Invalid characters in book name.")
        
        record_name = session.get(RecordName, batch.record_name_id)
        if record_name:
            existing = session.exec(
                select(RecordName)
                .where(RecordName.record_name == book_name_upper)
                .where(RecordName.project_id == record_name.project_id)
                .where(RecordName.record_name_id != record_name.record_name_id)
            ).first()
            if existing:
                batch.record_name_id = existing.record_name_id
            else:
                record_name.record_name = book_name_upper
                session.add(record_name)

    # 4. Handle Counts with Type Consistency
    new_total = data.total_images if data.total_images is not None else batch.total_count
    new_upload = data.uploading_count if data.uploading_count is not None else batch.upload_count
    
    if batch.is_complete:
        # For complete, we use uploading_count as the master count for both total and upload
        if data.uploading_count is not None:
            batch.total_count = data.uploading_count
            batch.upload_count = data.uploading_count
        elif data.total_images is not None:
            # Fallback if they only sent total
            batch.total_count = data.total_images
            batch.upload_count = data.total_images
    else:
        # For partial/rework, total must be GREATER than upload
        batch.total_count = new_total
        batch.upload_count = new_upload
        
        if batch.upload_count >= batch.total_count:
            raise HTTPException(
                status_code=400, 
                detail=f"For { 'Partial' if batch.is_partial else 'Rework' } batches, Total Images ({batch.total_count}) must be greater than Batch Target ({batch.upload_count})."
            )

    batch.last_updated = get_ist_now()
    session.add(batch)
    session.commit()
    session.refresh(batch)
    
    # Log the action
    from common.audit_logger import log_action
    log_action(
        session=session,
        user_id=current_user.user_id,
        username=current_user.username,
        action="Batch Updated",
        endpoint=f"/operator/batches/{batch_uid}",
        method="PUT",
        payload={
            "batch_uid": str(batch_uid),
            "batch_id": batch.batch_id,
            "new_total": batch.total_count,
            "new_target": batch.upload_count
        },
        result="success"
    )

    return {"message": "Batch updated successfully", "batch_id": batch.batch_id}


# --- Conversion Webhook (Called by DigitalOcean Function) ---
from fastapi import Header
from common.models import Image, ConversionStatus, FileType

class ConversionCompleteData(BaseModel):
    image_id: UUID
    qc_path: str
    jpeg_size: int
    original_size: Optional[int] = None
    compression_ratio: Optional[float] = None
    dimensions: Optional[dict] = None

@router.post("/conversion-complete")
async def conversion_complete(
    data: ConversionCompleteData,
    x_api_key: str = Header(..., alias="X-API-Key"),
    session: Session = Depends(get_session)
):
    """
    Webhook endpoint called by DigitalOcean Function after successful conversion.
    Updates the image record with QC path and conversion status.
    """
    import os
    
    # Verify API key from serverless function
    expected_key = os.getenv('API_WEBHOOK_SECRET')
    if not expected_key or x_api_key != expected_key:
        raise HTTPException(
            status_code=403,
            detail="Invalid API key"
        )
    
    # Update image record
    image = session.get(Image, data.image_id)
    if not image:
        raise HTTPException(
            status_code=404,
            detail=f"Image not found: {data.image_id}"
        )
    
    # Update conversion status
    image.qc_s3_path = data.qc_path
    image.converted_file_type = FileType.JPEG
    image.conversion_status = ConversionStatus.Jpeg_Converted
    
    session.commit()
    session.refresh(image)
    
    return {
        "success": True,
        "image_id": str(image.image_id),
        "conversion_status": image.conversion_status,
        "message": "Image conversion status updated successfully"
    }

# --- Batch Progress Tracking ---
class BatchProgressResponse(BaseModel):
    batch_uid: UUID
    total_count: int
    uploaded_count: int
    converted_count: int
    uploaded_files: List[str]

@router.get("/batches/{batch_uid}/progress", response_model=BatchProgressResponse)
def get_batch_progress(
    batch_uid: UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """
    Get upload and conversion progress for a batch.
    Used by frontend to resume uploads after network disconnection.
    """
    from sqlalchemy import func
    # Verify batch exists and belongs to current operator
    batch = session.get(Batch, batch_uid)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    # Get allocation to verify ownership
    allocation = session.get(ScanningOperatorAllocation, batch.scanning_operator_allocation_id)
    if not allocation or allocation.allocated_to_operator != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized to access this batch")
    
    # Count uploaded images
    uploaded_images = session.exec(
        select(Image).where(Image.batch_uid == batch_uid)
    ).all()
    
    uploaded_count = len(uploaded_images)
    
    # Count converted images
    converted_count = sum(
        1 for img in uploaded_images 
        if img.conversion_status == ConversionStatus.Jpeg_Converted
    )
    
    # Get list of uploaded file names
    uploaded_files = [img.image_name for img in uploaded_images]
    
    return BatchProgressResponse(
        batch_uid=batch_uid,
        total_count=batch.total_count,
        uploaded_count=uploaded_count,
        converted_count=converted_count,
        uploaded_files=uploaded_files
    )

# --- Real-Time Progress Sync & Upload Lock ---

class LiveProgressBatch(BaseModel):
    batch_uid: UUID
    batch_id: str
    completed_count: int
    total_count: int
    status: str
    current_file_name: Optional[str] = None
    queue_position: Optional[int] = None

class LiveProgressResponse(BaseModel):
    batches: List[LiveProgressBatch]

@router.get("/batches/live-progress", response_model=LiveProgressResponse)
def get_live_progress(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """
    Get real-time progress for all batches being uploaded by this operator.
    Used for syncing progress across multiple devices/browsers.
    """
    # Get all uploads for this operator
    uploads = session.exec(
        select(Upload, Batch)
        .join(Batch, Upload.batch_uid == Batch.batch_uid)
        .join(ScanningOperatorAllocation, Batch.scanning_operator_allocation_id == ScanningOperatorAllocation.scanning_operator_allocation_id)
        .where(ScanningOperatorAllocation.allocated_to_operator == current_user.user_id)
        .where(Upload.upload_status.in_(["In_Progress", "Pending"]))
    ).all()
    
    batches_list = []
    for upload, batch in uploads:
        status = "pending"
        if upload.completed_count > 0 and upload.completed_count < batch.upload_count:
            status = "uploading"
        elif upload.completed_count >= batch.upload_count:
            status = "uploaded"
        
        batches_list.append(LiveProgressBatch(
            batch_uid=batch.batch_uid,
            batch_id=batch.batch_id,
            completed_count=upload.completed_count,
            total_count=batch.upload_count,
            status=status,
            current_file_name=upload.current_file_name,
            queue_position=None  # TODO: Add queue position if needed
        ))
    
    return LiveProgressResponse(batches=batches_list)

class UpdateProgressRequest(BaseModel):
    completed: int
    current_file: str

@router.post("/batches/{batch_uid}/update-progress")
def update_batch_progress(
    batch_uid: UUID,
    request: UpdateProgressRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """
    Update progress from uploading system.
    Called periodically by the frontend to sync progress to server.
    """
    # Verify batch ownership
    batch = session.get(Batch, batch_uid)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    allocation = session.get(ScanningOperatorAllocation, batch.scanning_operator_allocation_id)
    if not allocation or allocation.allocated_to_operator != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Update upload record
    upload_record = session.exec(
        select(Upload).where(Upload.batch_uid == batch_uid)
    ).first()
    
    if upload_record:
        upload_record.completed_count = request.completed
        upload_record.current_file_name = request.current_file
        upload_record.last_updated = get_ist_now()
        session.commit()
    
    return {"success": True}

class DeviceInfo(BaseModel):
    browser: str
    os: str
    hostname: str
    device_id: str  # Unique ID generated by the frontend for each browser/system instance

class RequestLockRequest(BaseModel):
    device_info: DeviceInfo

class LockStatusResponse(BaseModel):
    success: bool
    message: str
    locked_device: Optional[str] = None
    locked_at: Optional[datetime] = None
    progress: Optional[int] = None

@router.post("/batches/{batch_uid}/request-lock", response_model=LockStatusResponse)
def request_upload_lock(
    batch_uid: UUID,
    request: RequestLockRequest,
    fastapi_request: Request,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """
    Request a lock on a batch to prevent duplicate uploads from multiple devices.
    Returns success if lock acquired, or information about existing lock.
    """
    # Get the real client IP from the network connection
    client_ip = fastapi_request.client.host if fastapi_request.client else "unknown"

    # Verify batch ownership
    batch = session.get(Batch, batch_uid)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    allocation = session.get(ScanningOperatorAllocation, batch.scanning_operator_allocation_id)
    if not allocation or allocation.allocated_to_operator != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Get or create upload record
    upload_record = session.exec(
        select(Upload).where(Upload.batch_uid == batch_uid)
    ).first()
    
    if not upload_record:
        # Create new upload record with lock
        upload_record = Upload(
            batch_uid=batch_uid,
            completed_count=0,
            s3_folder_path="",  # Will be set on first file upload
            upload_status="Pending",
            uploaded_by=current_user.user_id,
            locked_by=current_user.user_id,
            locked_at=get_ist_now(),
            locked_device=f"{client_ip} ({request.device_info.browser})",
            locked_device_id=request.device_info.device_id,
            locked_ip=client_ip
        )
        session.add(upload_record)
        session.commit()
        
        return LockStatusResponse(
            success=True,
            message="Lock acquired"
        )
    
    # Check if already locked
    if upload_record.locked_at:
        # Check if lock is stale (>24 hours old)
        time_diff = get_ist_now() - upload_record.locked_at
        if time_diff.total_seconds() < 86400:  # 24 hours
            # Lock is still active
            if upload_record.locked_by == current_user.user_id and upload_record.locked_device_id == request.device_info.device_id:
                # Same user AND same device - allow (likely resuming)
                # Update info in case IP changed (e.g. WiFi to LAN)
                upload_record.locked_ip = client_ip
                upload_record.locked_device = f"{client_ip} ({request.device_info.browser})"
                upload_record.locked_at = get_ist_now()
                session.commit()
                
                return LockStatusResponse(
                    success=True,
                    message="Lock already held by this device"
                )
            else:
                # Different user OR different device - deny
                return LockStatusResponse(
                    success=False,
                    message=f"Batch is already being uploaded by another system. Please wait or use a different batch.",
                    locked_device=upload_record.locked_device,
                    locked_at=upload_record.locked_at,
                    progress=upload_record.completed_count
                )
    
    # Acquire lock (either no lock or stale lock)
    upload_record.locked_by = current_user.user_id
    upload_record.locked_at = get_ist_now()
    upload_record.locked_device = f"{client_ip} ({request.device_info.browser})"
    upload_record.locked_device_id = request.device_info.device_id
    upload_record.locked_ip = client_ip
    session.commit()
    
    return LockStatusResponse(
        success=True,
        message="Lock acquired"
    )

@router.delete("/batches/{batch_uid}/release-lock")
def release_upload_lock(
    batch_uid: UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """
    Release the upload lock on a batch.
    Called when upload completes or is cancelled.
    """
    # Verify batch ownership
    batch = session.get(Batch, batch_uid)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    allocation = session.get(ScanningOperatorAllocation, batch.scanning_operator_allocation_id)
    if not allocation or allocation.allocated_to_operator != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Get upload record
    upload_record = session.exec(
        select(Upload).where(Upload.batch_uid == batch_uid)
    ).first()
    
    # Check for global override setting
    from common.models import SystemSettings
    manual_release_setting = session.get(SystemSettings, "enable_manual_lock_release")
    manual_release_enabled = manual_release_setting.setting_value == "true" if manual_release_setting else False

    if upload_record and (
        upload_record.locked_by == current_user.user_id or 
        current_user.user_role == UserRole.SuperAdmin or
        manual_release_enabled
    ):
        upload_record.locked_by = None
        upload_record.locked_at = None
        upload_record.locked_device = None
        upload_record.locked_device_id = None
        upload_record.locked_ip = None
        session.commit()

        # Log the action
        from common.audit_logger import log_action
        log_action(
            session=session,
            user_id=current_user.user_id,
            username=current_user.username,
            action="Batch Lock Released",
            endpoint=f"/operator/batches/{batch_uid}/release-lock",
            method="DELETE",
            payload={
                "batch_uid": str(batch_uid),
                "manual_override": manual_release_enabled
            },
            result="success"
        )
    
    return {"success": True}

# --- S3 Upload Endpoints ---

class PresignedUrlRequest(BaseModel):
    batch_uid: UUID
    file_name: str
    file_size: int
    content_type: str = "image/tiff"

class PresignedUrlResponse(BaseModel):
    upload_url: str
    s3_path: str
    expires_in: int

class BatchHierarchyResponse(BaseModel):
    project_name: str
    source_name: str
    location_name: str
    record_owner_name: str
    record_type_name: str
    book_name: str
    upload_code: str
    base_folder: str

class UploadCompleteRequest(BaseModel):
    batch_uid: UUID
    file_name: str
    s3_path: str
    file_size: int

@router.get("/batches/{batch_uid}/hierarchy", response_model=BatchHierarchyResponse)
def get_batch_hierarchy(
    batch_uid: UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """
    Get the hierarchy names for a batch to build S3 paths.
    Returns sanitized names (uppercase, underscores instead of spaces).
    """
    # Get batch
    batch = session.get(Batch, batch_uid)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    # Verify ownership
    allocation = session.get(ScanningOperatorAllocation, batch.scanning_operator_allocation_id)
    if not allocation or allocation.allocated_to_operator != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Fetch all related entities
    source = session.get(Source, batch.source_id)
    location = session.get(Location, batch.location_id)
    owner = session.get(RecordOwner, batch.record_owner_id)
    rtype = session.get(RecordType, batch.record_type_id)
    rname = session.get(RecordName, batch.record_name_id)
    project = session.get(Project, source.project_id)
    
    # Sanitize names for S3 (uppercase, replace spaces with underscores)
    def sanitize(name: str) -> str:
        return name.upper().replace(' ', '_').replace('-', '_')
    
    # Determine upload code based on Batch ID lineage
    # Strategy: Parse suffix like _C1R1 into C1/R1
    import re
    upload_code = "UNKNOWN"
    
    # Match the suffix after the last underscore: C1, P1, C1R1, P2R1 etc.
    match = re.search(r'_([CP]\d+)(R\d+)?$', batch.batch_id)
    if match:
        parent = match.group(1) # C1, P2 etc
        rework = match.group(2) # R1, R2 etc or None
        
        if rework:
            upload_code = f"{parent}/{rework}"
        else:
            upload_code = parent
    else:
        # Fallback: Extract strictly the last component from the Batch ID (e.g., C1)
        upload_code = batch.batch_id.split('_')[-1] if '_' in batch.batch_id else "C1"
    
    return BatchHierarchyResponse(
        project_name=sanitize(project.project_name),
        source_name=sanitize(source.source_name),
        location_name=sanitize(location.location_name),
        record_owner_name=sanitize(owner.record_owner_name),
        record_type_name=sanitize(rtype.record_type_name),
        book_name=sanitize(rname.record_name),
        upload_code=upload_code,
        base_folder=os.getenv('Base_folder', 'FamilyaConnect-QCTool')
    )

@router.get("/batches/{batch_uid}/rejected-filenames")
def get_rejected_filenames(
    batch_uid: UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Returns the list of filenames that were rejected in the parent batch and need fixing."""
    batch = session.get(Batch, batch_uid)
    if not batch or not batch.is_reupload:
        return []
        
    parent_uid = batch.parent_batch_uid
    if not parent_uid:
        import re
        match = re.search(r'R(\d+)$', batch.batch_id)
        if match:
            rework_num = int(match.group(1))
            if rework_num > 1:
                parent_batch_id = re.sub(r'R\d+$', f'R{rework_num-1}', batch.batch_id)
            else:
                parent_batch_id = re.sub(r'R\d+$', '', batch.batch_id)
            parent_batch = session.exec(select(Batch).where(Batch.batch_id == parent_batch_id)).first()
            if parent_batch:
                parent_uid = parent_batch.batch_uid

    if not parent_uid:
        return []
        
    rejected_names = session.exec(
        select(Image.image_name)
        .join(QC, Image.image_id == QC.image_id)
        .where(Image.batch_uid == parent_uid)
        .where(QC.qc_status == QCStatus.Rejected)
    ).all()
    
    return rejected_names

from functools import lru_cache

@lru_cache(maxsize=100)
def get_cached_hierarchy(batch_uid: UUID, user_id: UUID):
    # This is a helper to cache the expensive DB joins during bulk uploads
    from common.database import engine
    with get_retry_session() as session:
        user = session.get(User, user_id)
        hierarchy = get_batch_hierarchy(batch_uid, session, user)
        # FORCE LOAD relationship fields before session closes to avoid DetachedInstanceError
        _ = [hierarchy.base_folder, hierarchy.project_name, hierarchy.source_name, 
             hierarchy.location_name, hierarchy.record_owner_name, hierarchy.record_type_name, 
             hierarchy.book_name, hierarchy.upload_code]
        return hierarchy

@router.post("/batches/{batch_uid}/request-upload-url", response_model=PresignedUrlResponse)
async def request_upload_url(
    batch_uid: UUID,
    request: PresignedUrlRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """
    Generate a pre-signed URL for direct upload to DigitalOcean Spaces.
    Optimized with caching for high-concurrency uploads.
    """
    # 1. Enforce TIFF-only policy (Fast)
    file_lower = request.file_name.lower()
    if not (file_lower.endswith('.tif') or file_lower.endswith('.tiff')):
        raise HTTPException(status_code=400, detail="Only TIFF files allowed.")

    # 2. Build S3 path with NONE-PROTECTION
    try:
        hierarchy = get_cached_hierarchy(batch_uid, current_user.user_id)
    except Exception as e:
        print(f"⚠️ Cache missed/failed: {e}")
        hierarchy = get_batch_hierarchy(batch_uid, session, current_user)

    # Sanitization function to prevent 'None/None' paths which S3 rejects
    def s(val): return str(val or "MISSING").strip() or "MISSING"

    s3_path = "/".join([
        s(hierarchy.base_folder),
        s(hierarchy.project_name),
        s(hierarchy.source_name),
        s(hierarchy.location_name),
        s(hierarchy.record_owner_name),
        s(hierarchy.record_type_name),
        s(hierarchy.book_name),
        s(hierarchy.upload_code),
        request.file_name
    ])

    try:
        s3_client = boto3.client(
            's3',
            endpoint_url=os.getenv('ENDPOINT_URL'),
            aws_access_key_id=os.getenv('AWS_ACCESS_KEY_ID'),
            aws_secret_access_key=os.getenv('AWS_SECRET_ACCESS_KEY'),
            region_name=os.getenv('AWS_REGION', 'blr1'),
            config=Config(signature_version='s3v4')
        )
        
        # LOG THE PATH: Critical for seeing why progress is stuck
        # Using flush=True to ensure it shows up in multi-worker logs
        print(f"[S3_URL] {request.file_name} -> {s3_path}", flush=True)

        presigned_url = s3_client.generate_presigned_url(
            'put_object',
            Params={'Bucket': os.getenv('S3_BUCKET_NAME'), 'Key': s3_path, 'ContentType': 'image/tiff'},
            ExpiresIn=3600
        )
        
        return PresignedUrlResponse(upload_url=presigned_url, s3_path=s3_path, expires_in=3600)
        
    except ClientError as e:
        raise HTTPException(status_code=500, detail=f"S3 Error: {str(e)}")

@router.post("/batches/{batch_uid}/sync-conversion")
def sync_batch_conversion(
    batch_uid: UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """
    Manually checks S3 and updates status of images that were converted
    but missed the webhook (e.g. detailed during local dev).
    """
    # 1. Get images that are stuck in Tiff_Received or Jpeg_Converting
    images = session.exec(
        select(Image)
        .where(Image.batch_uid == batch_uid)
        .where(Image.conversion_status.in_([ConversionStatus.Tiff_Received, ConversionStatus.Jpeg_Converting]))
    ).all()
    
    if not images:
        return {"message": "All images are already marked as converted."}

    # 2. Check S3 for each
    import boto3
    from botocore.exceptions import ClientError
    
    qc_bucket = os.getenv('QC_S3_BUCKET_NAME', 'purvaj-panda-qc')
    s3_client = boto3.client(
        's3',
        endpoint_url=os.getenv('QC_ENDPOINT_URL'),
        aws_access_key_id=os.getenv('QC_AWS_ACCESS_KEY_ID'),
        aws_secret_access_key=os.getenv('QC_AWS_SECRET_ACCESS_KEY'),
        region_name=os.getenv('QC_AWS_REGION')
    )

    updated_count = 0
    for img in images:
        # Check if the .jpg exists
        expected_key = img.original_s3_path.replace('.tif', '.jpg').replace('.tiff', '.jpg')
        
        try:
            s3_client.head_object(Bucket=qc_bucket, Key=expected_key)
            # If no error, it exists!
            img.qc_s3_path = expected_key
            img.conversion_status = ConversionStatus.Jpeg_Converted
            img.converted_file_type = FileType.JPEG
            session.add(img)
            updated_count += 1
        except ClientError:
            pass # Still waiting
            
    session.commit()
    return {"message": f"Synced {updated_count} images from S3.", "updated_count": updated_count}

def trigger_conversion_task(image_id: str, s3_path: str):
    """Background task to trigger serverless conversion with state tracking."""
    # Note: Using 'def' instead of 'async def' so FastAPI runs it in a thread pool,
    # avoiding event loop blocking during synchronous database calls.
    function_url = os.getenv('DO_FUNCTION_CONVERT_URL', '').strip()
    if not function_url or "placeholder" in function_url:
        return

    # 1. Mark as Converting in DB so we know it was at least triggered
    from common.models import Image, ConversionStatus
    from common.database import engine
    import httpx
    
    # Robustly get environment variables
    s3_bucket = os.getenv('S3_BUCKET_NAME', 'purvaj-scan-original').strip('"')
    qc_bucket = os.getenv('QC_S3_BUCKET_NAME', 'purvaj-panda-qc').strip('"')
    api_secret = os.getenv('API_WEBHOOK_SECRET', 'gYBtwXkmpDl_i_Vd8WYBq5rKW4FetnOkroqYDR6252I')

    with get_retry_session() as session:
        img = session.get(Image, UUID(image_id))
        if img:
            img.conversion_status = ConversionStatus.Jpeg_Converting
            session.add(img)
            session.commit()

    try:
        # We use a synchronous request here since we're in a thread pool
        # Adding .json ensures the DigitalOcean web action parses the body correctly
        target_url = function_url
        if not target_url.endswith('.json'):
            target_url += '.json'
            
        payload = {
            "image_id": str(image_id),
            "original_path": s3_path,
            "original_bucket": s3_bucket,
            "qc_bucket": qc_bucket,
            "api_secret": api_secret
        }
        
        print(f"[CONV] Triggering conversion for {image_id} with payload: {payload}")
        
        # Increase timeout to 60s for conversion tasks
        with httpx.Client(timeout=60.0) as client:
            response = client.post(
                target_url,
                json=payload
            )
            
            if response.status_code in [200, 202]:
                print(f"[INFO] Successfully triggered conversion for {image_id}")
            else:
                print(f"[ERROR] Serverless function returned {response.status_code} for {image_id}: {response.text}")
                with get_retry_session() as session:
                    img = session.get(Image, UUID(image_id))
                    if img:
                        img.conversion_status = ConversionStatus.Tiff_Received
                        session.add(img)
                        session.commit()
                
    except Exception as e:
        print(f"[ERROR] Background conversion trigger failed for {image_id}: {repr(e)}")
        try:
            with get_retry_session() as session:
                img = session.get(Image, UUID(image_id))
                if img:
                    img.conversion_status = ConversionStatus.Tiff_Received
                    session.add(img)
                    session.commit()
        except: pass

@router.post("/batches/{batch_uid}/upload-complete")
async def upload_complete(
    batch_uid: UUID,
    request: UploadCompleteRequest,
    fastapi_request: Request,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """
    Called by frontend after successfully uploading a file to S3.
    Strictly accepts TIFF files and triggers serverless conversion.
    """
    # 1. Enforce TIFF-only policy (secondary check)
    file_lower = request.file_name.lower()
    if not (file_lower.endswith('.tif') or file_lower.endswith('.tiff')):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type: {request.file_name}. Only TIFF (.tif, .tiff) files are accepted."
        )

    # Verify batch ownership
    batch = session.get(Batch, batch_uid)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    allocation = session.get(ScanningOperatorAllocation, batch.scanning_operator_allocation_id)
    if not allocation or allocation.allocated_to_operator != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # 2. Re-upload Validation: Ensure file matches a rejected name from parent
    if batch.is_reupload:
        parent_uid = batch.parent_batch_uid
        # Fallback lineage logic (same as used in image list)
        if not parent_uid:
            import re
            match = re.search(r'R(\d+)$', batch.batch_id)
            if match:
                rework_num = int(match.group(1))
                if rework_num > 1:
                    parent_batch_id = re.sub(r'R\d+$', f'R{rework_num-1}', batch.batch_id)
                else:
                    parent_batch_id = re.sub(r'R\d+$', '', batch.batch_id)
                
                if parent_batch_id != batch.batch_id:
                    parent_batch = session.exec(select(Batch).where(Batch.batch_id == parent_batch_id)).first()
                    if parent_batch:
                        parent_uid = parent_batch.batch_uid

        if parent_uid:
            # Fetch all rejected image names from parent batch
            rejected_names = session.exec(
                select(Image.image_name)
                .join(QC, Image.image_id == QC.image_id)
                .where(Image.batch_uid == parent_uid)
                .where(QC.qc_status == QCStatus.Rejected)
            ).all()
            
            # Check if uploaded file is in the rejected list
            if request.file_name not in rejected_names:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Re-upload Validation Error: The file '{request.file_name}' does not match "
                           f"any rejected image from the previous batch. In a rework batch, "
                           f"you must upload files with the EXACT same names as those rejected. "
                           f"Please check for extra/missing zeros (e.g., IMAGE000002.TIFF vs IMAGE00002.TIFF)."
                )
    
    # Check if image already exists (Case-Insensitive Check)
    from sqlalchemy import func
    existing = session.exec(
        select(Image)
        .where(Image.batch_uid == batch_uid)
        .where(func.lower(Image.image_name) == func.lower(request.file_name))
    ).first()
    
    # If image already exists, check if it was successfully converted.
    # If not converted, it might be a "Zombie" record from a previous glitch.
    if existing:
        if existing.conversion_status == ConversionStatus.Jpeg_Converted:
            return {
                "success": True,
                "image_id": str(existing.image_id),
                "message": "Image already exists and is healthy",
                "conversion_triggered": False
            }
        else:
            print(f"[RE-VERIFY] Image {request.file_name} exists but not converted. Checking S3...")
            # Fall through to the S3 Verification logic below to ensure the file is actually healthy.
            # We don't want to skip a corrupted file just because it has a DB entry.
    
    # Get or create upload record using UPSERT to prevent race conditions
    from sqlalchemy.dialects.postgresql import insert as pg_insert
    
    s3_folder = '/'.join(request.s3_path.split('/')[:-1]) + '/'
    
    # Upsert: Insert if not exists, do nothing if exists (prevents race condition)
    stmt = pg_insert(Upload).values(
        batch_uid=batch_uid,
        completed_count=0,
        s3_folder_path=s3_folder,
        upload_status="In_Progress",
        uploaded_by=current_user.user_id,
        upload_start_date=get_ist_now(),
        last_updated=get_ist_now()
    ).on_conflict_do_nothing(
        index_elements=['batch_uid']  # Conflict on unique batch_uid
    )
    
    session.execute(stmt)
    session.commit()
    
    # Now fetch the record (either just created or already existing)
    upload_record = session.exec(
        select(Upload).where(Upload.batch_uid == batch_uid)
    ).first()
    
    if not upload_record:
        raise HTTPException(status_code=500, detail="Failed to create/fetch upload record")

    # Extract user info BEFORE closing session (prevents DetachedInstanceError)
    user_id = current_user.user_id
    username = current_user.username
    user_name = current_user.name

    # CRITICAL: Close the session BEFORE the S3 wait to prevent pool exhaustion
    # We'll reopen it after verification
    session.close()
    
    # --- S3 Verification Step (PREVENT CORRUPTION) ---
    actual_size = -1
    s3_verified = False
    
    import asyncio
    s3_client = boto3.client(
        's3',
        endpoint_url=os.getenv('ENDPOINT_URL'),
        aws_access_key_id=os.getenv('AWS_ACCESS_KEY_ID'),
        aws_secret_access_key=os.getenv('AWS_SECRET_ACCESS_KEY'),
        region_name=os.getenv('AWS_REGION', 'blr1'),
        config=Config(signature_version='s3v4')
    )

    client_ip = fastapi_request.client.host if fastapi_request.client else "unknown"
    
    # Wait up to 20 seconds for S3 to index the file with high-resolution polling
    for attempt in range(100):
        try:
            # Immediate check without sleep on first attempt
            if attempt > 0:
                await asyncio.sleep(0.2)
                
            s3_meta = s3_client.head_object(Bucket=os.getenv('S3_BUCKET_NAME'), Key=request.s3_path)
            actual_size = s3_meta['ContentLength']
            
            if actual_size == request.file_size:
                s3_verified = True
                break
        except ClientError:
            pass

    if not s3_verified:
        # If actual_size is -1, it means head_object threw a 404 (S3 hasn't indexed it yet)
        if actual_size == -1:
            print(f"[VERIFY] {request.file_name} NOT FOUND in S3 after 30s. Key: {request.s3_path}")
            raise HTTPException(
                status_code=503, 
                detail="S3_LAG: File not yet indexed. Automatic retry in progress..."
            )
        else:
            # File exists but is NOT the right size (could be 0 bytes or partial)
            print(f"[CORRUPT] {'Ghost File' if actual_size == 0 else 'Size Mismatch'}: {request.file_name} ({actual_size} vs {request.file_size}) at {client_ip}")
            
            try: s3_client.delete_object(Bucket=os.getenv('S3_BUCKET_NAME'), Key=request.s3_path)
            except: pass
            
            # Open temp session for cleanup using retry logic
            with get_retry_session() as temp_session:
                zombie = temp_session.exec(
                    select(Image)
                    .where(Image.batch_uid == batch_uid)
                    .where(Image.image_name == request.file_name)
                ).first()
                
                if zombie:
                    temp_session.delete(zombie)
                    temp_session.commit()
                    print(f"[CLEANUP] Deleted zombie record for {request.file_name}")

            error_msg = "S3 received 0 bytes. Connection likely failed." if actual_size == 0 else f"S3 received {actual_size} of {request.file_size} bytes."
            raise HTTPException(
                status_code=400,
                detail=f"Upload Failed: {error_msg} Please RE-UPLOAD."
            )

    with get_retry_session() as session:
        # Re-fetch the records we need
        upload_record = session.exec(
            select(Upload).where(Upload.batch_uid == batch_uid)
        ).first()
        
        existing = session.exec(
            select(Image)
            .where(Image.batch_uid == batch_uid)
            .where(Image.image_name == request.file_name)
        ).first()
        
        batch = session.get(Batch, batch_uid)
        allocation = session.get(ScanningOperatorAllocation, batch.scanning_operator_allocation_id)

        image_id = None
        if existing:
            # Re-trigger conversion for existing healthy but not-yet-converted file
            image_id = existing.image_id
            print(f"[RE-HEAL] Re-triggering conversion for {request.file_name}")
        else:
            try:
                # Create fresh image record
                new_image = Image(
                    upload_id=upload_record.upload_id,
                    batch_uid=batch_uid,
                    image_name=request.file_name,
                    original_s3_path=request.s3_path,
                    qc_s3_path=None,
                    original_file_type=FileType.TIFF,
                    converted_file_type=None,
                    conversion_status=ConversionStatus.Tiff_Received,
                    file_size_bytes=request.file_size
                )
                session.add(new_image)
                session.commit() # Commit image creation immediately to claim the record
                image_id = new_image.image_id
            except Exception as e:
                # If another worker inserted it in the last few ms, fetch it
                session.rollback()
                existing_now = session.exec(
                    select(Image)
                    .where(Image.batch_uid == batch_uid)
                    .where(func.lower(Image.image_name) == func.lower(request.file_name))
                ).first()
                if existing_now:
                    image_id = existing_now.image_id
                    print(f"[RACE] Caught duplicate record creation for {request.file_name}, using existing ID.")
                else:
                    raise e
            
            # Update progress by counting ACTUAL images in DB for this batch
            # This is "None-Proof" and self-correcting even with high concurrency
            from sqlalchemy import func
            actual_count = session.exec(
                select(func.count(Image.image_id))
                .where(Image.batch_uid == batch_uid)
            ).first() or 0
            
            # Update progress using GREATEST to prevent parallel workers from rolling back progress
            from sqlalchemy import update as sql_update, func
            stmt = (
                sql_update(Upload)
                .where(Upload.upload_id == upload_record.upload_id)
                .values(
                    completed_count=func.greatest(Upload.completed_count, actual_count),
                    current_file_name=request.file_name,
                    last_updated=get_ist_now()
                )
            )
            session.execute(stmt)
            session.commit()
            
            # Re-fetch for completion check
            session.refresh(upload_record)
            print(f"[DB] Progress Updated: {upload_record.completed_count}/{batch.upload_count} for {request.file_name}")
    
        # Check if upload is complete (Using direct count for finality)
        with session.no_autoflush:
            # We use actual_count directly here to be extra sure the status matches reality
            final_count = upload_record.completed_count
            print(f"[PROGRESS] Batch {batch.batch_id}: {final_count}/{batch.upload_count}")
            
            if final_count >= batch.upload_count and upload_record.upload_status != "Completed":
                # Only the first thread/worker to reach this block will proceed
                upload_record.upload_status = "Completed"
                upload_record.upload_end_date = get_ist_now()
                session.add(upload_record)
                session.commit()
                
                # Log Batch Upload Completed
                from common.audit_logger import log_action
                log_action(
                    session=session,
                    user_id=user_id,
                    username=username,
                    action="Batch Upload Completed",
                    endpoint=f"/operator/batches/{batch_uid}/upload",
                    method="POST",
                    payload={
                        "batch_uid": str(batch_uid),
                        "batch_id": batch.batch_id,
                        "completed_count": final_count
                    },
                    result="success"
                )

                # --- Trigger Notifications ---
                try:
                    # 1. Notify Supervisor
                    vendor_alloc = session.get(VendorAllocation, allocation.vendor_allocation_id)
                    if vendor_alloc:
                        create_notification(
                            session=session,
                            user_id=vendor_alloc.allocated_by_supervisor,
                            notif_type=NotificationType.batch_uploaded.value,
                            title="New Batch Uploaded",
                            message=f"Operator {user_name} has completed upload for Batch {batch.batch_id} ({batch.total_count} images).",
                            link="/upload-history"
                        )
                    
                    # 2. Notify Operator (Confirmation)
                    create_notification(
                        session=session,
                        user_id=user_id,
                        notif_type=NotificationType.batch_uploaded.value,
                        title="Upload Successful",
                        message=f"Batch {batch.batch_id} has been uploaded and sent for quality check.",
                        link="/upload"
                    )
                    session.commit() # Commit the notifications
                except Exception as e:
                    print(f"⚠️ Failed to create notification: {e}")
            elif final_count == 1:
                # Log Batch Upload Started (only on first image)
                from common.audit_logger import log_action
                log_action(
                    session=session,
                    user_id=user_id,
                    username=username,
                    action="Batch Upload Started",
                    endpoint=f"/operator/batches/{batch_uid}/upload",
                    method="POST",
                    payload={
                        "batch_uid": str(batch_uid),
                        "batch_id": batch.batch_id
                    },
                    result="success"
                )
                session.commit()
        
        # 7. Trigger conversion in background to avoid timeouts
        background_tasks.add_task(trigger_conversion_task, str(image_id), request.s3_path)
    
        return {
            "success": True,
            "image_id": str(image_id),
            "upload_progress": {
                "completed": upload_record.completed_count,
                "total": batch.upload_count,
                "percentage": round((upload_record.completed_count / batch.upload_count) * 100, 2)
            },
            "conversion_triggered": True,
            "message": "Image uploaded successfully (Conversion queued in background)"
        }

@router.get("/batches/{batch_uid}/images")
def get_batch_images(
    batch_uid: UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """
    Get list of images in a batch with presigned URLs for preview.
    Favors JPEG converted images if available.
    """
    # 1. Verify batch exists
    batch = session.get(Batch, batch_uid)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    # 2. Verify ownership (Must be assigned to or uploaded by this operator)
    allocation = session.get(ScanningOperatorAllocation, batch.scanning_operator_allocation_id)
    if not allocation or allocation.allocated_to_operator != current_user.user_id:
        # Check if they uploaded it even if allocation changed
        upload_rec = session.exec(select(Upload).where(Upload.batch_uid == batch_uid)).first()
        if not upload_rec or upload_rec.uploaded_by != current_user.user_id:
            raise HTTPException(status_code=403, detail="Not authorized to access these batch images")
    
    # 3. Identify related batches for image fetching (Lineage Support)
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

    # 4. Fetch images. For re-upload batches, we show:
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

    # 5. Generate presigned URLs
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
                ExpiresIn=3600 # 1 hour
            )
        except Exception:
            url = None
            
        status = "Pending"
        if qc_rec:
            status = qc_rec.qc_status
        elif source_type == "parent":
            status = "Rejected"
        else:
            status = "Pending"

        output.append({
            "image_id": img.image_id,
            "image_name": img.image_name,
            "url": url,
            "is_converted": True,
            "status": status
        })
        
    return output
@router.get("/qc-history", response_model=List[BatchQCHistoryRead])
def get_operator_qc_history(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Get QC history for batches uploaded by this operator"""
    if current_user.user_role != UserRole.Scanning_Operator:
        raise HTTPException(status_code=403, detail="Access denied")

    from sqlalchemy import func
    
    # Filter by batches where Upload.uploaded_by is current_user and status is verified
    statement = select(
        Batch, Source, Location, RecordOwner, RecordType, RecordName, Project, QCAllocation
    ).join(Source, Batch.source_id == Source.source_id)\
     .join(Location, Batch.location_id == Location.location_id)\
     .join(RecordOwner, Batch.record_owner_id == RecordOwner.record_owner_id)\
     .join(RecordType, Batch.record_type_id == RecordType.record_type_id)\
     .join(RecordName, Batch.record_name_id == RecordName.record_name_id)\
     .join(Project, Source.project_id == Project.project_id)\
     .join(Upload, Batch.batch_uid == Upload.batch_uid)\
     .join(QCAllocation, Batch.batch_uid == QCAllocation.batch_uid)\
     .where(Upload.uploaded_by == current_user.user_id)\
     .where(QCAllocation.qc_batch_status.in_([QCBatchStatus.Verified, QCBatchStatus.Verified_With_Rejection]))\
     .order_by(Batch.created_date.desc())
    
    results = session.exec(statement).all()
    
    output = []
    for b, s, l, ro, rt, rn, p, qca in results:
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
            
            # Count QC stats
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

        # Determine upload type
        upload_type = "Complete"
        if b.is_reupload: upload_type = "Re-upload"
        elif b.is_partial: upload_type = "Partial"

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
            upload_type=upload_type,
            allocation_date=allocation_date,
            qc_completed_date=qc_completed_date
        ))
    
    return output
@router.get("/qc-report/{batch_uid}")
def get_operator_batch_qc_report(
    batch_uid: UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Get detailed image-by-image QC report for an operator's verified batch"""
    if current_user.user_role != UserRole.Scanning_Operator:
        raise HTTPException(status_code=403, detail="Access denied")

    # Verify batch was uploaded by this operator and is verified
    statement = select(QCAllocation)\
        .join(Batch, QCAllocation.batch_uid == Batch.batch_uid)\
        .join(Upload, Batch.batch_uid == Upload.batch_uid)\
        .where(Batch.batch_uid == batch_uid)\
        .where(Upload.uploaded_by == current_user.user_id)\
        .where(QCAllocation.qc_batch_status.in_([QCBatchStatus.Verified, QCBatchStatus.Verified_With_Rejection]))

    allocation = session.exec(statement).first()
    if not allocation:
        raise HTTPException(status_code=404, detail="Verified batch report not found for your uploads")

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
def get_operator_dashboard_stats(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Get statistics for the Operator Dashboard"""
    if current_user.user_role != UserRole.Scanning_Operator:
        raise HTTPException(status_code=403, detail="Not authorized.")

    from sqlalchemy import func

    # 1. Performance Metrics
    batches_stmt = (
        select(Batch, Upload)
        .join(ScanningOperatorAllocation, Batch.scanning_operator_allocation_id == ScanningOperatorAllocation.scanning_operator_allocation_id)
        .outerjoin(Upload, Batch.batch_uid == Upload.batch_uid)
        .where(ScanningOperatorAllocation.allocated_to_operator == current_user.user_id)
    )
    batches_results = session.exec(batches_stmt).all()
    
    total_batches = len(batches_results)
    uploaded_images = sum(u.completed_count for b, u in batches_results if u)
    
    # Rework Assignments
    rework_batches = len([b for b, u in batches_results if b.is_reupload and not (u and u.upload_status == 'Completed')])

    # 2. Quality Stats
    all_qca_stmt = (
        select(QCAllocation)
        .join(Batch, QCAllocation.batch_uid == Batch.batch_uid)
        .join(ScanningOperatorAllocation, Batch.scanning_operator_allocation_id == ScanningOperatorAllocation.scanning_operator_allocation_id)
        .where(ScanningOperatorAllocation.allocated_to_operator == current_user.user_id)
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

    # 3. Recent Activity 
    recent_uploads = []
    sorted_batches = sorted(batches_results, key=lambda x: x[0].created_date, reverse=True)[:5]
    for b, u in sorted_batches:
        recent_uploads.append({
            "batch_id": b.batch_id,
            "status": u.upload_status if u else "Pending",
            "images": u.completed_count if u else 0,
            "date": b.created_date
        })

    return {
        "metrics": {
            "total_batches": total_batches,
            "uploaded_images": uploaded_images,
            "rework_batches": rework_batches,
            "accuracy": round((total_accepted / (total_accepted + total_rejected) * 100), 2) if (total_accepted + total_rejected) > 0 else 100
        },
        "recent_uploads": recent_uploads
    }
