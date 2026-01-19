from fastapi import APIRouter, Depends, HTTPException, FastAPI
from sqlmodel import Session, select, func
from pydantic import BaseModel
from common.database import get_session
from common.models import Project, Source, Location, RecordOwner, RecordType, UserRole
from common.auth_utils import role_required
from uuid import UUID

app = FastAPI(title="Upload Supervisor Service")
router = APIRouter(prefix="/upload-sup", tags=["Upload Supervisor"])

# --- Schemas ---

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
    role: str = Depends(role_required([UserRole.SuperAdmin, UserRole.Upload_Supervisor]))
):
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
    
    db_source = Source(
        project_id=source_data.project_id,
        source_code=source_code,
        source_name=source_name_upper,
        created_by=source_data.created_by
    )
    session.add(db_source)
    session.commit()
    session.refresh(db_source)
    return db_source

@router.post("/locations", response_model=Location)
def create_location(
    location_data: LocationCreate,
    session: Session = Depends(get_session),
    role: str = Depends(role_required([UserRole.SuperAdmin, UserRole.Upload_Supervisor]))
):
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
    return db_loc

@router.post("/record-owners", response_model=RecordOwner)
def create_record_owner(
    ro_data: RecordOwnerCreate,
    session: Session = Depends(get_session),
    role: str = Depends(role_required([UserRole.SuperAdmin, UserRole.Upload_Supervisor]))
):
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
    return db_ro

@router.post("/record-types", response_model=RecordType)
def create_record_type(
    rt_data: RecordTypeCreate,
    session: Session = Depends(get_session),
    role: str = Depends(role_required([UserRole.SuperAdmin, UserRole.Upload_Supervisor]))
):
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
    
    db_rt = RecordType(
        source_id=rt_data.source_id,
        record_type_code=rt_code,
        record_type_name=rt_name_upper,
        created_by=rt_data.created_by
    )
    session.add(db_rt)
    session.commit()
    session.refresh(db_rt)
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

@router.post("/allocations", response_model=VendorAllocation)
def create_allocation(
    alloc_data: VendorAllocationCreate,
    session: Session = Depends(get_session),
    role: str = Depends(role_required([UserRole.SuperAdmin, UserRole.Upload_Supervisor]))
):
    # Check if this combination is already allocated
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
        raise HTTPException(status_code=400, detail="This combination is already allocated to a vendor.")

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
    return db_alloc

@router.get("/allocations", response_model=list[VendorAllocation])
def get_allocations(
    session: Session = Depends(get_session),
    role: str = Depends(role_required([UserRole.SuperAdmin, UserRole.Upload_Supervisor]))
):
    return session.exec(select(VendorAllocation).where(VendorAllocation.is_active == True)).all()

@router.delete("/allocations/{alloc_id}")
def delete_allocation(
    alloc_id: UUID,
    session: Session = Depends(get_session),
    role: str = Depends(role_required([UserRole.SuperAdmin, UserRole.Upload_Supervisor]))
):
    db_alloc = session.get(VendorAllocation, alloc_id)
    if not db_alloc:
        raise HTTPException(status_code=404, detail="Allocation not found")
    
    # Soft delete
    db_alloc.is_active = False
    session.add(db_alloc)
    session.commit()
    return {"ok": True}

# Include the router in the app
app.include_router(router)

@app.get("/")
def read_root():
    return {"service": "Upload Supervisor Service", "port": 8003}
