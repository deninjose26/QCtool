from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlmodel import Session, select, func, col
from pydantic import BaseModel
from common.database import get_session
from common.models import (
    Project, UserRole, User, Source, Location, RecordOwner, RecordType,
    Batch, Upload, VendorAllocation, ScanningOperatorAllocation, RecordName,
    QCAllocation, QCBatchStatus, QC, QCStatus, Image
)
from common.auth_utils import role_required, get_current_user
from datetime import datetime
from typing import Optional, List
from sqlalchemy.orm import aliased
from uuid import UUID
import os
import httpx

router = APIRouter(prefix="/admin", tags=["Project Management"])

# --- Schemas ---
class ProjectCreate(BaseModel):
    project_code: str | None = None
    project_name: str
    description: str | None = None
    created_by: UUID
class ProjectUpdate(BaseModel):
    project_name: str
    description: str | None = None

@router.get("/")
def read_root():
    return {"service": "Admin Service", "port": 8002}

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
    vendor_name: str
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

@router.post("/projects", response_model=Project)
def create_project(
    project_data: ProjectCreate, 
    session: Session = Depends(get_session),
    role: str = Depends(role_required([UserRole.SuperAdmin]))
):
    # Auto-generate code P001, P002...
    last_project = session.exec(select(Project).order_by(Project.project_code.desc())).first()
    if not last_project:
        next_num = 1
    else:
        try:
            # Extract numeric part from PXXX
            next_num = int(last_project.project_code[1:]) + 1
        except (ValueError, IndexError):
            # Fallback if code format is unexpected
            next_num = session.exec(select(func.count(Project.project_id))).one() + 1
    
    project_code = f"P{str(next_num).zfill(3)}"
    
    # Ensure name is uppercase
    project_name_upper = project_data.project_name.strip().upper()
    
    db_project = Project(
        project_code=project_code,
        project_name=project_name_upper,
        description=project_data.description,
        created_by=project_data.created_by
    )
    session.add(db_project)
    session.commit()
    session.refresh(db_project)
    return db_project

@router.get("/projects", response_model=list[Project])
def get_projects(
    session: Session = Depends(get_session),
    role: str = Depends(role_required([
        UserRole.SuperAdmin, UserRole.Upload_Supervisor, UserRole.Vendor, 
        UserRole.QC_Supervisor, UserRole.QC_User, UserRole.Scanning_Operator
    ]))
):
    return session.exec(select(Project)).all()

@router.put("/projects/{project_id}", response_model=Project)
def update_project(
    project_id: UUID,
    project_data: ProjectUpdate,
    session: Session = Depends(get_session),
    role: str = Depends(role_required([UserRole.SuperAdmin]))
):
    db_project = session.get(Project, project_id)
    if not db_project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    db_project.project_name = project_data.project_name.strip()
    db_project.description = project_data.description
    session.add(db_project)
    session.commit()
    session.refresh(db_project)
    return db_project

@router.delete("/projects/{project_id}")
def delete_project(
    project_id: UUID,
    session: Session = Depends(get_session),
    role: str = Depends(role_required([UserRole.SuperAdmin]))
):
    db_project = session.get(Project, project_id)
    if not db_project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    try:
        session.delete(db_project)
        session.commit()
    except Exception as e:
        session.rollback()
        # Catch foreign key violations
        if "violates foreign key constraint" in str(e).lower():
            raise HTTPException(
                status_code=400, 
                detail="Cannot delete project because it still has associated sources or other data. Please delete them first."
            )
        raise HTTPException(status_code=500, detail=f"An error occurred: {str(e)}")
    
    return {"ok": True}

# --- Source Management ---

from common.models import Source

class SourceCreate(BaseModel):
    project_id: UUID
    source_code: str | None = None
    source_name: str
    created_by: UUID

class SourceUpdate(BaseModel):
    source_name: str

@router.post("/sources", response_model=Source)
def create_source(
    source_data: SourceCreate,
    session: Session = Depends(get_session),
    role: str = Depends(role_required([UserRole.SuperAdmin, UserRole.Upload_Supervisor]))
):
    # Auto-generate source code (S001, S002...) within the project
    last_source = session.exec(
        select(Source)
        .where(Source.project_id == source_data.project_id)
        .order_by(Source.source_code.desc())
    ).first()

    if not last_source:
        next_num = 1
    else:
        try:
            # Extract numeric part from SXXX
            next_num = int(last_source.source_code[1:]) + 1
        except (ValueError, IndexError):
            # Fallback if code format is unexpected
            next_num = session.exec(
                select(func.count(Source.source_id))
                .where(Source.project_id == source_data.project_id)
            ).one() + 1

    source_code = f"S{str(next_num).zfill(3)}"
    
    # Ensure name is uppercase
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

@router.get("/sources", response_model=list[Source])
def get_sources(
    session: Session = Depends(get_session),
    role: str = Depends(role_required([
        UserRole.SuperAdmin, UserRole.Upload_Supervisor, UserRole.Vendor, 
        UserRole.QC_Supervisor, UserRole.QC_User, UserRole.Scanning_Operator
    ]))
):
    return session.exec(select(Source)).all()

@router.put("/sources/{source_id}", response_model=Source)
def update_source(
    source_id: UUID,
    source_data: SourceUpdate,
    session: Session = Depends(get_session),
    role: str = Depends(role_required([UserRole.SuperAdmin, UserRole.Upload_Supervisor]))
):
    db_source = session.get(Source, source_id)
    if not db_source:
        raise HTTPException(status_code=404, detail="Source not found")
    
    db_source.source_name = source_data.source_name.strip()
    session.add(db_source)
    session.commit()
    session.refresh(db_source)
    return db_source

@router.delete("/sources/{source_id}")
def delete_source(
    source_id: UUID,
    session: Session = Depends(get_session),
    role: str = Depends(role_required([UserRole.SuperAdmin, UserRole.Upload_Supervisor]))
):
    db_source = session.get(Source, source_id)
    if not db_source:
        raise HTTPException(status_code=404, detail="Source not found")
    
    try:
        session.delete(db_source)
        session.commit()
    except Exception as e:
        session.rollback()
        if "violates foreign key constraint" in str(e).lower():
            raise HTTPException(
                status_code=400,
                detail="Cannot delete source because it has associated locations. Please delete them first."
            )
        raise HTTPException(status_code=500, detail=str(e))
    return {"ok": True}

# --- Location Management ---

from common.models import Location

class LocationCreate(BaseModel):
    project_id: UUID
    source_id: UUID
    location_code: str | None = None
    location_name: str
    created_by: UUID

class LocationUpdate(BaseModel):
    location_name: str

@router.post("/locations", response_model=Location)
def create_location(
    location_data: LocationCreate,
    session: Session = Depends(get_session),
    role: str = Depends(role_required([UserRole.SuperAdmin, UserRole.Upload_Supervisor]))
):
    # Auto-generate location code (L001, L002...) within the source
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

@router.get("/locations", response_model=list[Location])
def get_locations(
    session: Session = Depends(get_session),
    role: str = Depends(role_required([
        UserRole.SuperAdmin, UserRole.Upload_Supervisor, UserRole.Vendor, 
        UserRole.QC_Supervisor, UserRole.QC_User, UserRole.Scanning_Operator
    ]))
):
    return session.exec(select(Location)).all()

@router.put("/locations/{location_id}", response_model=Location)
def update_location(
    location_id: UUID,
    location_data: LocationUpdate,
    session: Session = Depends(get_session),
    role: str = Depends(role_required([UserRole.SuperAdmin, UserRole.Upload_Supervisor]))
):
    db_loc = session.get(Location, location_id)
    if not db_loc:
        raise HTTPException(status_code=404, detail="Location not found")
    db_loc.location_name = location_data.location_name.strip()
    session.add(db_loc)
    session.commit()
    session.refresh(db_loc)
    return db_loc

@router.delete("/locations/{location_id}")
def delete_location(
    location_id: UUID,
    session: Session = Depends(get_session),
    role: str = Depends(role_required([UserRole.SuperAdmin, UserRole.Upload_Supervisor]))
):
    db_loc = session.get(Location, location_id)
    if not db_loc:
        raise HTTPException(status_code=404, detail="Location not found")
    try:
        session.delete(db_loc)
        session.commit()
    except Exception as e:
        session.rollback()
        if "violates foreign key constraint" in str(e).lower():
            raise HTTPException(
                status_code=400,
                detail="Cannot delete location because it has associated record owners. Please delete them first."
            )
        raise HTTPException(status_code=500, detail=str(e))
    return {"ok": True}

# --- Record Owner Management ---

from common.models import RecordOwner

class RecordOwnerCreate(BaseModel):
    project_id: UUID
    source_id: UUID
    location_id: UUID
    record_owner_code: str | None = None
    record_owner_name: str
    created_by: UUID

class RecordOwnerUpdate(BaseModel):
    record_owner_name: str

@router.post("/record-owners", response_model=RecordOwner)
def create_record_owner(
    ro_data: RecordOwnerCreate,
    session: Session = Depends(get_session),
    role: str = Depends(role_required([UserRole.SuperAdmin, UserRole.Upload_Supervisor]))
):
    # Auto-generate record owner code (R0001, R0002...) within the location
    last_ro = session.exec(
        select(RecordOwner)
        .where(RecordOwner.location_id == ro_data.location_id)
        .order_by(RecordOwner.record_owner_code.desc())
    ).first()

    if not last_ro:
        next_num = 1
    else:
        try:
            # Extract numeric part from RXXXX
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

@router.get("/record-owners", response_model=list[RecordOwner])
def get_record_owners(
    session: Session = Depends(get_session),
    role: str = Depends(role_required([
        UserRole.SuperAdmin, UserRole.Upload_Supervisor, UserRole.Vendor, 
        UserRole.QC_Supervisor, UserRole.QC_User, UserRole.Scanning_Operator
    ]))
):
    return session.exec(select(RecordOwner)).all()

@router.put("/record-owners/{ro_id}", response_model=RecordOwner)
def update_record_owner(
    ro_id: UUID,
    ro_data: RecordOwnerUpdate,
    session: Session = Depends(get_session),
    role: str = Depends(role_required([UserRole.SuperAdmin, UserRole.Upload_Supervisor]))
):
    db_ro = session.get(RecordOwner, ro_id)
    if not db_ro:
        raise HTTPException(status_code=404, detail="Record Owner not found")
    db_ro.record_owner_name = ro_data.record_owner_name.strip()
    session.add(db_ro)
    session.commit()
    session.refresh(db_ro)
    return db_ro

@router.delete("/record-owners/{ro_id}")
def delete_record_owner(
    ro_id: UUID,
    session: Session = Depends(get_session),
    role: str = Depends(role_required([UserRole.SuperAdmin, UserRole.Upload_Supervisor]))
):
    db_ro = session.get(RecordOwner, ro_id)
    if not db_ro:
        raise HTTPException(status_code=404, detail="Record Owner not found")
    try:
        session.delete(db_ro)
        session.commit()
    except Exception as e:
        session.rollback()
        if "violates foreign key constraint" in str(e).lower():
            raise HTTPException(
                status_code=400,
                detail="Cannot delete record owner because it has associated record types or other data. Please delete them first."
            )
        raise HTTPException(status_code=500, detail=str(e))
    return {"ok": True}

# --- Record Type Management ---

from common.models import RecordType

class RecordTypeCreate(BaseModel):
    source_id: UUID
    record_type_code: str | None = None
    record_type_name: str
    created_by: UUID

class RecordTypeUpdate(BaseModel):
    record_type_name: str

@router.post("/record-types", response_model=RecordType)
def create_record_type(
    rt_data: RecordTypeCreate,
    session: Session = Depends(get_session),
    role: str = Depends(role_required([UserRole.SuperAdmin, UserRole.Upload_Supervisor]))
):
    # Auto-generate record type code (RT001, RT002...) within the source
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

@router.get("/record-types", response_model=list[RecordType])
def get_record_types(
    session: Session = Depends(get_session),
    role: str = Depends(role_required([
        UserRole.SuperAdmin, UserRole.Upload_Supervisor, UserRole.Vendor, 
        UserRole.QC_Supervisor, UserRole.QC_User, UserRole.Scanning_Operator
    ]))
):
    return session.exec(select(RecordType)).all()

@router.put("/record-types/{rt_id}", response_model=RecordType)
def update_record_type(
    rt_id: UUID,
    rt_data: RecordTypeUpdate,
    session: Session = Depends(get_session),
    role: str = Depends(role_required([UserRole.SuperAdmin]))
):
    db_rt = session.get(RecordType, rt_id)
    if not db_rt:
        raise HTTPException(status_code=404, detail="Record Type not found")
    db_rt.record_type_name = rt_data.record_type_name.strip()
    session.add(db_rt)
    session.commit()
    session.refresh(db_rt)
    return db_rt

@router.delete("/record-types/{rt_id}")
def delete_record_type(
    rt_id: UUID,
    session: Session = Depends(get_session),
    role: str = Depends(role_required([UserRole.SuperAdmin]))
):
    db_rt = session.get(RecordType, rt_id)
    if not db_rt:
        raise HTTPException(status_code=404, detail="Record Type not found")
    try:
        session.delete(db_rt)
        session.commit()
    except Exception as e:
        session.rollback()
        if "violates foreign key constraint" in str(e).lower():
            raise HTTPException(
                status_code=400,
                detail="Cannot delete record type because it has associated batches or other data."
            )
        raise HTTPException(status_code=500, detail=str(e))
    return {"ok": True}

# --- User Management ---

class UserUpdate(BaseModel):
    name: str | None = None
    email: str | None = None
    user_role: UserRole | None = None
    is_active: bool | None = None
    password: str | None = None

@router.get("/users", response_model=list[User])
def get_users(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    # SuperAdmins and Upload Supervisors can see everyone
    if current_user.user_role in [UserRole.SuperAdmin, UserRole.Upload_Supervisor]:
        return session.exec(select(User)).all()
    
    # Vendors can only see users they created (their Operators)
    if current_user.user_role == UserRole.Vendor:
        return session.exec(select(User).where(User.created_by == current_user.user_id)).all()
    
    # Others can only see themselves
    return session.exec(select(User).where(User.user_id == current_user.user_id)).all()

@router.put("/users/{user_id}", response_model=User)
def update_user(
    user_id: UUID,
    user_data: UserUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    db_user = session.get(User, user_id)
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Permission check
    is_admin = current_user.user_role == UserRole.SuperAdmin
    is_creator = db_user.created_by == current_user.user_id
    
    if not (is_admin or is_creator):
        raise HTTPException(
            status_code=403, 
            detail="You are not authorized to update this user."
        )

    if user_data.name:
        db_user.name = user_data.name
    if user_data.email:
        db_user.email = user_data.email
    if user_data.user_role and is_admin: # Only admins can change roles
        if user_data.user_role == UserRole.Scanning_Operator:
            raise HTTPException(
                status_code=403, 
                detail="SuperAdmins are not authorized to assign Scanning Operator roles."
            )
        db_user.user_role = user_data.user_role
    if user_data.is_active is not None:
        db_user.is_active = user_data.is_active
    if user_data.password:
        from common.security import get_password_hash
        db_user.password_hash = get_password_hash(user_data.password)
        
    session.add(db_user)
    session.commit()
    session.refresh(db_user)
    return db_user

@router.delete("/users/{user_id}")
def delete_user(
    user_id: UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    db_user = session.get(User, user_id)
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Permission check: ONLY SuperAdmin can delete users
    if current_user.user_role != UserRole.SuperAdmin:
        raise HTTPException(
            status_code=403, 
            detail="Forbidden: Only SuperAdmins can delete users. Please contact administration."
        )
    
    # Don't allow deleting self
    if db_user.user_id == current_user.user_id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account.")
    
    try:
        session.delete(db_user)
        session.commit()
    except Exception as e:
        session.rollback()
        if "violates foreign key constraint" in str(e).lower():
            raise HTTPException(
                status_code=400,
                detail="Cannot delete user because they have assigned tasks, allocations, or other history."
            )
        raise HTTPException(status_code=500, detail=str(e))
    return {"ok": True}

# --- Global Upload History ---

@router.get("/batches", response_model=List[BatchRead])
def list_admin_batches(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    if current_user.user_role != UserRole.SuperAdmin:
        raise HTTPException(status_code=403, detail="SuperAdmin access only.")
    
    OperatorUser = aliased(User)
    VendorUser = aliased(User)
    
    statement = select(
        Batch, Source, Location, RecordOwner, RecordType, RecordName, Project, Upload, OperatorUser, VendorUser
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
     .order_by(Batch.created_date.desc())
    
    results = session.exec(statement).all()
    
    output = []
    for b, s, l, ro, rt, rn, p, u, opt, vnd in results:
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
            vendor_name=vnd.name,
            operator_name=opt.name,
            upload_type=upload_type,
            status=status,
            upload_end_date=u.upload_end_date if u else None
        ))
    
    return output

@router.get("/qc-history", response_model=List[QCHistoryRead])
def get_admin_qc_history(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """List all QC history for Admin review"""
    if current_user.user_role not in [UserRole.SuperAdmin, UserRole.Upload_Supervisor]:
        raise HTTPException(status_code=403, detail="Not authorized.")
    
    SupervisorUser = aliased(User)
    QCUser = aliased(User)
    VendorUser = aliased(User)

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
            .where(col(QC.qc_allocation_id) == qca.qc_allocation_id)
            .where(QC.qc_status != QCStatus.Pending)
        ).first() or 0

        accepted = session.exec(
            select(func.count(QC.qc_id))
            .where(col(QC.qc_allocation_id) == qca.qc_allocation_id)
            .where(QC.qc_status == QCStatus.Approved)
        ).first() or 0

        rejected = session.exec(
            select(func.count(QC.qc_id))
            .where(col(QC.qc_allocation_id) == qca.qc_allocation_id)
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
            upload_type=up_type
        ))
    
    return history

@router.get("/dashboard-stats")
def get_admin_dashboard_stats(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Get comprehensive statistics for the Admin Dashboard"""
    if current_user.user_role != UserRole.SuperAdmin:
        raise HTTPException(status_code=403, detail="SuperAdmin access only.")

    # 1. Basic Counts
    counts = {
        "projects": session.exec(select(func.count(Project.project_id))).one(),
        "sources": session.exec(select(func.count(Source.source_id))).one(),
        "locations": session.exec(select(func.count(Location.location_id))).one(),
        "record_owners": session.exec(select(func.count(RecordOwner.record_owner_id))).one(),
        "record_types": session.exec(select(func.count(RecordType.record_type_id))).one(),
        "users": session.exec(select(func.count(User.user_id))).one(),
        "vendors": session.exec(select(func.count(User.user_id)).where(User.user_role == UserRole.Vendor)).one(),
        "operators": session.exec(select(func.count(User.user_id)).where(User.user_role == UserRole.Scanning_Operator)).one(),
        "qc_users": session.exec(select(func.count(User.user_id)).where(User.user_role == UserRole.QC_User)).one(),
    }

    # 2. Upload Stats
    all_batches = session.exec(select(Batch)).all()
    total_batches = len(all_batches)
    target_images = sum(b.total_count for b in all_batches)
    
    # Upload count from Upload table
    all_uploads = session.exec(select(Upload)).all()
    uploaded_images = sum(u.completed_count for u in all_uploads)

    # 3. QC Stats
    all_qca = session.exec(select(QCAllocation)).all()
    verified_batches = len([q for q in all_qca if q.qc_batch_status in [QCBatchStatus.Completed, QCBatchStatus.Verified, QCBatchStatus.Verified_With_Rejection]])
    
    accepted_images = session.exec(select(func.count(QC.qc_id)).where(QC.qc_status == QCStatus.Approved)).one()
    rejected_images = session.exec(select(func.count(QC.qc_id)).where(QC.qc_status == QCStatus.Rejected)).one()

    # 4. Recent Activity
    recent_uploads_stmt = (
        select(Batch, Upload, User)
        .join(Upload, Batch.batch_uid == Upload.batch_uid)
        .join(ScanningOperatorAllocation, Batch.scanning_operator_allocation_id == ScanningOperatorAllocation.scanning_operator_allocation_id)
        .join(User, ScanningOperatorAllocation.allocated_to_operator == User.user_id)
        .order_by(Upload.upload_end_date.desc())
        .limit(5)
    )
    recent_uploads_results = session.exec(recent_uploads_stmt).all()
    
    formatted_uploads = []
    for b, u, opt in recent_uploads_results:
        formatted_uploads.append({
            "batch_id": b.batch_id,
            "operator": opt.name,
            "images": u.completed_count,
            "date": u.upload_end_date
        })

    # Recent QC
    recent_qc_stmt = (
        select(QCAllocation, Batch, User)
        .join(Batch, QCAllocation.batch_uid == Batch.batch_uid)
        .join(User, QCAllocation.allocated_to_qc_user == User.user_id)
        .where(QCAllocation.qc_batch_status.in_([QCBatchStatus.Completed, QCBatchStatus.Verified, QCBatchStatus.Verified_With_Rejection]))
        .order_by(QCAllocation.qc_completed_date.desc())
        .limit(5)
    )
    recent_qc_results = session.exec(recent_qc_stmt).all()
    
    formatted_qc = []
    for qca, b, qu in recent_qc_results:
        formatted_qc.append({
            "batch_id": b.batch_id,
            "qc_user": qu.name,
            "status": qca.qc_batch_status,
            "date": qca.qc_completed_date
        })

    return {
        "counts": counts,
        "upload_stats": {
            "total_batches": total_batches,
            "target_images": target_images,
            "uploaded_images": uploaded_images
        },
        "qc_stats": {
            "verified_batches": verified_batches,
            "accepted_images": accepted_images,
            "rejected_images": rejected_images
        },
        "recent_uploads": formatted_uploads,
        "recent_qc": formatted_qc
    }

# --- Maintenance Operations ---

async def trigger_conversion_task(image_id: str, s3_path: str):
    """Trigger serverless conversion with state tracking."""
    from common.models import ConversionStatus
    from common.database import engine
    
    function_url = os.getenv('DO_FUNCTION_CONVERT_URL')
    if not function_url or function_url == 'https://placeholder-will-update-later.com':
        return

    # Mark as Converting
    with Session(engine) as session:
        img = session.get(Image, UUID(image_id))
        if img:
            img.conversion_status = ConversionStatus.Jpeg_Converting
            session.add(img)
            session.commit()

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            await client.post(
                function_url,
                json={
                    "image_id": image_id,
                    "original_path": s3_path,
                    "original_bucket": os.getenv('S3_BUCKET_NAME'),
                    "qc_bucket": os.getenv('QC_S3_BUCKET_NAME'),
                    "api_secret": os.getenv('API_WEBHOOK_SECRET')
                }
            )
    except Exception as e:
        print(f"[ERROR] Admin conversion trigger failed for {image_id}: {str(e)}")

@router.post("/maintenance/sync-conversions")
async def sync_all_conversions(
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Trigger all stuck conversions (Self-healing option)"""
    if current_user.user_role != UserRole.SuperAdmin:
        raise HTTPException(status_code=403, detail="SuperAdmin access only.")

    from common.models import ConversionStatus
    
    statement = select(Image).where(
        Image.conversion_status.in_([ConversionStatus.Tiff_Received, ConversionStatus.Jpeg_Converting])
    )
    stuck_images = session.exec(statement).all()
    
    for img in stuck_images:
        background_tasks.add_task(trigger_conversion_task, str(img.image_id), img.original_s3_path)
        
    return {"message": f"Queued {len(stuck_images)} images for re-conversion."}

@router.post("/maintenance/trigger-batch/{batch_uid}")
async def trigger_batch_conversion(
    batch_uid: UUID,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Trigger conversion ONLY for missing/stuck images in a specific batch"""
    if current_user.user_role != UserRole.SuperAdmin:
        raise HTTPException(status_code=403, detail="SuperAdmin access only.")

    from common.models import ConversionStatus
    
    # Only pick images that are NOT yet 'Jpeg_Converted'
    images = session.exec(
        select(Image)
        .where(Image.batch_uid == batch_uid)
        .where(Image.conversion_status.in_([ConversionStatus.Tiff_Received, ConversionStatus.Jpeg_Converting]))
    ).all()
    
    triggered_count = 0
    for img in images:
        background_tasks.add_task(trigger_conversion_task, str(img.image_id), img.original_s3_path)
        triggered_count += 1
        
    return {"message": f"Queued {triggered_count} missing images from batch {batch_uid} for conversion."}
