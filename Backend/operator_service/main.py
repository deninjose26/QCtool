from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select
from uuid import UUID
from pydantic import BaseModel
from typing import List, Optional
from common.database import get_session
from common.models import (
    User, UserRole, ScanningOperatorAllocation, VendorAllocation,
    Project, Source, Location, RecordOwner, RecordType, RecordName, Batch, Upload
)
from common.auth_utils import get_current_user
from datetime import datetime

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
    
    # Join RecordName with Batch to filter by hierarchy
    # RecordName only has project_id, other hierarchy info is in Batch
    statement = select(RecordName).join(
        Batch, RecordName.record_name_id == Batch.record_name_id
    ).where(RecordName.project_id == project_id)
    
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
        select(RecordName).where(RecordName.record_name == data.book_name).where(RecordName.project_id == data.project_id)
    ).first()

    if not record_name:
        # Fetch next value from the database sequence
        from sqlalchemy import text
        result = session.execute(text("SELECT nextval('record_code_seq')"))
        next_seq = result.scalar()
        new_code = f"B{str(next_seq).zfill(6)}"
        
        record_name = RecordName(
            project_id=data.project_id,
            record_code=new_code,
            record_name=data.book_name,
            created_by=current_user.user_id
        )
        session.add(record_name)
        session.commit()
        session.refresh(record_name)

    # 4. Determine Upload Type Code (C1, P2, R1 etc)
    prefix_map = {"complete": "C", "partial": "P", "re-upload": "R"}
    prefix = prefix_map.get(data.upload_type, "X")
    
    # Count existing batches for this specific book and upload type to determine sequence
    existing_count = session.exec(
        select(Batch)
        .where(Batch.record_name_id == record_name.record_name_id)
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
            detail=f"A Complete batch already exists for book '{data.book_name}'. Use Partial or Re-upload for additional uploads."
        )
    
    # Prevent Partial batches if a Complete batch already exists
    if data.upload_type == "partial":
        complete_batches = session.exec(
            select(Batch)
            .where(Batch.record_name_id == record_name.record_name_id)
            .where(Batch.is_complete == True)
        ).all()
        
        if len(complete_batches) > 0:
            raise HTTPException(
                status_code=400,
                detail=f"Book '{data.book_name}' already has a Complete batch. Partial uploads are not allowed. Use Re-upload to fix specific pages."
            )
    
    # Prevent Complete batches if Partial batches already exist
    if data.upload_type == "complete":
        partial_batches = session.exec(
            select(Batch)
            .where(Batch.record_name_id == record_name.record_name_id)
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
        is_reupload=(data.upload_type == "re-upload")
    )

    try:
        session.add(new_batch)
        session.commit()
        session.refresh(new_batch)
    except Exception as e:
        session.rollback()
        raise HTTPException(status_code=400, detail=f"Batch ID conflict or database error: {str(e)}")

    return {
        "batch_uid": new_batch.batch_uid,
        "batch_id": new_batch.batch_id,
        "message": "Batch created successfully"
    }

@router.get("/batches")
def list_operator_batches(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    if current_user.user_role != UserRole.Scanning_Operator:
        raise HTTPException(status_code=403, detail="Only Operators can access this.")
    
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
     .where(ScanningOperatorAllocation.allocated_to_operator == current_user.user_id)\
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
            "status": status,
            "created_date": batch.created_date
        })
    return output
