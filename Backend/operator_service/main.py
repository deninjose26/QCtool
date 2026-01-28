from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlmodel import Session, select
from uuid import UUID
from pydantic import BaseModel
from typing import List, Optional
from common.database import get_session
from common.models import (
    User, UserRole, ScanningOperatorAllocation, VendorAllocation,
    Project, Source, Location, RecordOwner, RecordType, RecordName, Batch, Upload, get_ist_now,
    QCAllocation, QC, QCStatus, QCBatchStatus, Image, FileType, ConversionStatus, NotificationType
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
            "status": status,
            "created_date": batch.created_date,
            "upload_end_date": upload_rec.upload_end_date if upload_rec else None
        })
    return output

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
        # Fallback to sanitized Batch ID if suffix pattern doesn't match
        upload_code = sanitize(batch.batch_id)
    
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

@router.post("/batches/{batch_uid}/request-upload-url", response_model=PresignedUrlResponse)
async def request_upload_url(
    batch_uid: UUID,
    request: PresignedUrlRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """
    Generate a pre-signed URL for direct upload to DigitalOcean Spaces.
    Enforces TIFF-only policy for Normal and Re-upload batches.
    """
    # 1. Enforce TIFF-only policy
    file_lower = request.file_name.lower()
    if not (file_lower.endswith('.tif') or file_lower.endswith('.tiff')):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type: {request.file_name}. Only TIFF (.tif, .tiff) files are accepted for processing."
        )

    # Verify batch ownership
    batch = session.get(Batch, batch_uid)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    allocation = session.get(ScanningOperatorAllocation, batch.scanning_operator_allocation_id)
    if not allocation or allocation.allocated_to_operator != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Get hierarchy for path building
    hierarchy = get_batch_hierarchy(batch_uid, session, current_user)
    
    # Build S3 path
    s3_path = f"{hierarchy.base_folder}/{hierarchy.project_name}/{hierarchy.source_name}/{hierarchy.location_name}/{hierarchy.record_owner_name}/{hierarchy.record_type_name}/{hierarchy.book_name}/{hierarchy.upload_code}/{request.file_name}"
    
    # Initialize S3 client (rest of the code remains the same)
    try:
        s3_client = boto3.client(
            's3',
            endpoint_url=os.getenv('ENDPOINT_URL'),
            aws_access_key_id=os.getenv('AWS_ACCESS_KEY_ID'),
            aws_secret_access_key=os.getenv('AWS_SECRET_ACCESS_KEY'),
            region_name=os.getenv('AWS_REGION', 'blr1'),
            config=Config(signature_version='s3v4')
        )
        
        # Force standard content type for all TIFF variants
        content_type = "image/tiff"
        
        presigned_url = s3_client.generate_presigned_url(
            'put_object',
            Params={
                'Bucket': os.getenv('S3_BUCKET_NAME'),
                'Key': s3_path,
                'ContentType': content_type
            },
            ExpiresIn=300
        )
        
        return PresignedUrlResponse(
            upload_url=presigned_url,
            s3_path=s3_path,
            expires_in=300
        )
        
    except ClientError as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate pre-signed URL: {str(e)}")

@router.post("/batches/{batch_uid}/upload-complete")
async def upload_complete(
    batch_uid: UUID,
    request: UploadCompleteRequest,
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
    
    # Check if image already exists
    existing = session.exec(
        select(Image)
        .where(Image.batch_uid == batch_uid)
        .where(Image.image_name == request.file_name)
    ).first()
    
    if existing:
        return {
            "success": True,
            "image_id": str(existing.image_id),
            "message": "Image already exists",
            "conversion_triggered": False
        }
    
    # Get or create upload record
    upload_record = session.exec(
        select(Upload).where(Upload.batch_uid == batch_uid)
    ).first()
    
    if not upload_record:
        s3_folder = '/'.join(request.s3_path.split('/')[:-1]) + '/'
        upload_record = Upload(
            batch_uid=batch_uid,
            completed_count=0,
            s3_folder_path=s3_folder,
            upload_status="In_Progress",
            uploaded_by=current_user.user_id
        )
        session.add(upload_record)
        session.commit()
        session.refresh(upload_record)
    
    # Create image record (assuming TIFF)
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
    
    # Update upload progress
    upload_record.completed_count += 1
    if upload_record.completed_count >= batch.upload_count:
        upload_record.upload_status = "Completed"
        upload_record.upload_end_date = get_ist_now()
        
        # --- Trigger Notifications ---
        try:
            # 1. Notify Supervisor
            vendor_alloc = session.get(VendorAllocation, allocation.vendor_allocation_id)
            if vendor_alloc:
                create_notification(
                    session=session,
                    user_id=vendor_alloc.allocated_by_supervisor,
                    notif_type=NotificationType.Batch_Uploaded,
                    title="New Batch Uploaded",
                    message=f"Operator {current_user.name} has completed upload for Batch {batch.batch_id} ({batch.total_count} images).",
                    link="/upload-history"  # Supervisor upload history
                )
            
            # 2. Notify Operator (Confirmation)
            create_notification(
                session=session,
                user_id=current_user.user_id,
                notif_type=NotificationType.Batch_Uploaded,
                title="Upload Successful",
                message=f"Batch {batch.batch_id} has been uploaded and sent for conversion.",
                link="/upload"  # Operator upload page
            )
        except Exception as e:
            print(f"⚠️ Failed to create notification: {e}")
    
    session.commit()
    session.refresh(new_image)
    
    # Trigger conversion
    conversion_triggered = False
    function_url = os.getenv('DO_FUNCTION_CONVERT_URL')
    
    if function_url and function_url != 'https://placeholder-will-update-later.com':
        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                await client.post(
                    function_url,
                    json={
                        "image_id": str(new_image.image_id),
                        "original_path": request.s3_path,
                        "original_bucket": os.getenv('S3_BUCKET_NAME'),
                        "qc_bucket": os.getenv('QC_S3_BUCKET_NAME'),
                        "api_secret": os.getenv('API_WEBHOOK_SECRET')
                    }
                )
                conversion_triggered = True
        except Exception as e:
            print(f"[WARNING] Failed to trigger conversion: {str(e)}")
    
    return {
        "success": True,
        "image_id": str(new_image.image_id),
        "upload_progress": {
            "completed": upload_record.completed_count,
            "total": batch.upload_count,
            "percentage": round((upload_record.completed_count / batch.upload_count) * 100, 2)
        },
        "conversion_triggered": conversion_triggered,
        "message": "Image uploaded successfully (TIFF processed for conversion)"
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
    
    # 3. Fetch images (Filter for only converted JPEGs)
    images = session.exec(
        select(Image)
        .where(Image.batch_uid == batch_uid)
        .where(Image.conversion_status == ConversionStatus.Jpeg_Converted)
        .order_by(Image.image_name)
    ).all()
    
    # 4. Generate presigned URLs
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
                ExpiresIn=3600 # 1 hour
            )
        except Exception:
            url = None
            
        output.append({
            "image_id": img.image_id,
            "image_name": img.image_name,
            "url": url,
            "is_converted": True,
            "status": img.conversion_status
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
