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
import shutil
import boto3
from botocore.client import Config
from concurrent.futures import ThreadPoolExecutor
import threading
import requests

router = APIRouter(prefix="/admin", tags=["Project Management"])

# Global status tracker for localized downloads
download_progress = {}

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

# --- System Settings Management ---

@router.get("/settings/{setting_id}")
def get_system_setting(
    setting_id: str,
    session: Session = Depends(get_session),
    role: str = Depends(role_required([UserRole.SuperAdmin]))
):
    from common.models import SystemSettings
    setting = session.get(SystemSettings, setting_id)
    if not setting:
        # Return default if not found
        if setting_id == "allow_multiple_vendor_allocations":
             return {"setting_id": setting_id, "setting_value": "false"}
        raise HTTPException(status_code=404, detail="Setting not found")
    return setting

@router.put("/settings/{setting_id}")
def update_system_setting(
    setting_id: str,
    payload: dict,
    session: Session = Depends(get_session),
    role: str = Depends(role_required([UserRole.SuperAdmin]))
):
    from common.models import SystemSettings
    setting = session.get(SystemSettings, setting_id)
    if not setting:
        setting = SystemSettings(setting_id=setting_id, setting_value=payload.get("value", "false"))
    else:
        setting.setting_value = payload.get("value", "false")
    
    setting.last_updated = datetime.utcnow()
    session.add(setting)
    session.commit()
    session.refresh(setting)
    return setting

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
    parent_batch_uid: Optional[UUID] = None
    replaced_by_batch_uid: Optional[UUID] = None
    status_detail: Optional[str] = None
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
    parent_batch_id: Optional[str] = None
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
    parent_batch_uid: Optional[UUID] = None
    replaced_by_batch_uid: Optional[UUID] = None
    status_detail: Optional[str] = None

class BatchDownloadRequest(BaseModel):
    download_path: str

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
        elif b.is_reupload and b.parent_batch_uid:
            status_detail = "Rework Batch"

        output.append(BatchRead(
            batch_uid=b.batch_uid,
            batch_id=b.batch_id,
            project_name=p.project_name,
            source_name=s.source_name,
            location_name=l.location_name,
            record_owner_name=ro.record_owner_name,
            record_type_name=rt.record_type_name,
            book_name=rn.record_name,
            target_count=b.target_count,
            completed_count=b.completed_count,
            vendor_name=vnd.name,
            operator_name=opt.name,
            upload_type=upload_type,
            status=status,
            parent_batch_uid=b.parent_batch_uid,
            replaced_by_batch_uid=replaced_by,
            status_detail=status_detail,
            upload_end_date=u.upload_end_date if u else None
        ))
    
    return output

@router.post("/download-batch-files/{batch_uid}")
def download_batch_files(
    batch_uid: UUID,
    payload: dict,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Sync accepted images from a batch lineage directly to server local storage"""
    if current_user.user_role not in [UserRole.SuperAdmin, UserRole.QC_Supervisor, UserRole.Upload_Supervisor]:
        raise HTTPException(status_code=403, detail="Not authorized")

    local_root = payload.get("download_path", "C:\\QC_Output")
    
    # 1. Fetch Hierarchy Info
    stmt = (
        select(
            Batch, Project.project_name, Source.source_name, Location.location_name,
            RecordOwner.record_owner_name, RecordType.record_type_name, RecordName.record_name
        )
        .join(Source, Batch.source_id == Source.source_id)
        .join(Location, Batch.location_id == Location.location_id)
        .join(Project, Source.project_id == Project.project_id)
        .join(RecordOwner, Batch.record_owner_id == RecordOwner.record_owner_id)
        .join(RecordType, Batch.record_type_id == RecordType.record_type_id)
        .join(RecordName, Batch.record_name_id == RecordName.record_name_id)
        .where(Batch.batch_uid == batch_uid)
    )
    result = session.exec(stmt).first()
    if not result:
        raise HTTPException(status_code=404, detail="Batch not found")

    batch, p_name, src, loc, owner, rtype, rname = result

    # 2. Build local directory path
    batch_base_dir = os.path.join(
        local_root, 
        p_name, 
        src, 
        loc, 
        owner, 
        rtype, 
        rname.replace(" ", "_")
    )

    # 3. Get latest approved images across lineage
    all_allocation_ids = []
    this_qca = session.exec(select(QCAllocation).where(QCAllocation.batch_uid == batch_uid)).first()
    if this_qca: all_allocation_ids.append(this_qca.qc_allocation_id)

    curr_batch = batch
    visited = {batch_uid}
    while curr_batch.parent_batch_uid and curr_batch.parent_batch_uid not in visited:
        p_batch = session.get(Batch, curr_batch.parent_batch_uid)
        if not p_batch: break
        p_qca = session.exec(select(QCAllocation).where(QCAllocation.batch_uid == p_batch.batch_uid)).first()
        if p_qca: all_allocation_ids.append(p_qca.qc_allocation_id)
        visited.add(curr_batch.parent_batch_uid)
        curr_batch = p_batch

    images_stmt = (
        select(Image, QC)
        .join(QC, Image.image_id == QC.image_id)
        .where(QC.qc_allocation_id.in_(all_allocation_ids))
        .where(QC.qc_status == QCStatus.Approved)
        .order_by(Image.image_name, QC.qc_date.desc())
    )
    all_results = session.exec(images_stmt).all()

    to_download = {}
    for img, qc in all_results:
        if img.image_name not in to_download:
            to_download[img.image_name] = img.original_s3_path

    if not to_download:
        raise HTTPException(status_code=400, detail="No accepted images found to download for this batch.")

    # 4. Perform Download (Run as background task)
    background_tasks.add_task(
        perform_local_file_download,
        batch_uid=str(batch_uid),
        download_map=to_download,
        target_dir=batch_base_dir
    )

    return {
        "message": f"Started localized download of {len(to_download)} images.",
        "target_directory": batch_base_dir,
        "count": len(to_download),
        "batch_uid": str(batch_uid)
    }

@router.get("/download-status/{batch_uid}")
def get_download_status(batch_uid: str):
    """Check progress of a localized download"""
    return download_progress.get(batch_uid, {"status": "not_found"})

def perform_local_file_download(batch_uid: str, download_map: dict, target_dir: str):
    """Sync S3 files to server disk using Pre-signed URLs for efficient internal fetching"""
    download_progress[batch_uid] = {
        "status": "processing",
        "current": 0,
        "total": len(download_map),
        "errors": 0,
        "target_dir": target_dir,
        "start_time": datetime.utcnow()
    }
    
    os.makedirs(target_dir, exist_ok=True)
    progress_lock = threading.Lock()
    
    s3_client = boto3.client(
        's3',
        endpoint_url=os.getenv('ENDPOINT_URL'),
        aws_access_key_id=os.getenv('AWS_ACCESS_KEY_ID'),
        aws_secret_access_key=os.getenv('AWS_SECRET_ACCESS_KEY'),
        region_name=os.getenv('AWS_REGION'),
        config=Config(signature_version='s3v4')
    )
    bucket_name = os.getenv('S3_BUCKET_NAME')

    def download_single_file(image_name, s3_path):
        try:
            # More robust S3 key extraction
            if bucket_name in s3_path:
                s3_key = s3_path.split(bucket_name)[-1].lstrip('/')
            else:
                s3_key = s3_path.lstrip('/')
            
            local_file_path = os.path.join(target_dir, image_name)
            
            if not os.path.exists(local_file_path):
                presigned_url = s3_client.generate_presigned_url(
                    'get_object', Params={'Bucket': bucket_name, 'Key': s3_key}, ExpiresIn=3600
                )
                r = requests.get(presigned_url, stream=True, timeout=30)
                if r.status_code == 200:
                    with open(local_file_path, 'wb') as f:
                        for chunk in r.iter_content(chunk_size=1024*64):
                            f.write(chunk)
                else:
                    print(f"Failed to fetch {image_name}: Status {r.status_code}")
                    with progress_lock:
                        download_progress[batch_uid]["errors"] += 1
            
            with progress_lock:
                download_progress[batch_uid]["current"] += 1
        except Exception as e:
            print(f"Error downloading {image_name}: {e}")
            with progress_lock:
                download_progress[batch_uid]["errors"] += 1

    with ThreadPoolExecutor(max_workers=10) as executor:
        for image_name, s3_path in download_map.items():
            executor.submit(download_single_file, image_name, s3_path)
    
    download_progress[batch_uid]["status"] = "completed"
    download_progress[batch_uid]["end_time"] = datetime.utcnow()

@router.get("/maintenance/list-directories")
def list_directories(
    path: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """List subdirectories for folder browsing in Settings"""
    if current_user.user_role not in [UserRole.SuperAdmin, UserRole.QC_Supervisor, UserRole.Upload_Supervisor]:
        raise HTTPException(status_code=403, detail="Not authorized")

    def get_roots():
        if os.name == 'nt':
            import string
            return [f"{d}:\\" for d in string.ascii_uppercase if os.path.exists(f"{d}:\\")]
        return ["/"]

    if not path or not os.path.exists(path) or not os.path.isdir(path):
        return {"current_path": "", "directories": get_roots(), "parent": None}

    try:
        dirs = [d for d in os.listdir(path) if os.path.isdir(os.path.join(path, d))]
        dirs.sort(key=str.lower)
        return {
            "current_path": os.path.abspath(path),
            "directories": dirs,
            "parent": os.path.dirname(os.path.abspath(path))
        }
    except:
        return {"current_path": "", "directories": get_roots(), "parent": None}
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
            parent_batch_uid=b.parent_batch_uid,
            replaced_by_batch_uid=replaced_by,
            status_detail=status_detail,
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
            upload_type=up_type,
            parent_batch_uid=batch.parent_batch_uid,
            replaced_by_batch_uid=session.exec(select(Batch.batch_uid).where(Batch.parent_batch_uid == batch.batch_uid)).first(),
            status_detail="Replaced by Rework" if session.exec(select(Batch.batch_uid).where(Batch.parent_batch_uid == batch.batch_uid)).first() else "Rework Batch" if batch.is_reupload else None
        ))
    
    return history

@router.get("/accepted-batches", response_model=List[QCHistoryRead])
def get_accepted_batches(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """List all batches that have been final verified (Accepted)"""
    if current_user.user_role not in [UserRole.SuperAdmin, UserRole.Upload_Supervisor, UserRole.QC_Supervisor]:
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
        .where(QCAllocation.qc_batch_status == QCBatchStatus.Verified)
        .order_by(QCAllocation.qc_completed_date.desc())
    )
    
    results = session.exec(statement).all()
    
    accepted_list = []
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

        # Baseline stats for this specific batch
        acc_count = accepted
        tot_count = batch.total_count
        root_batch_id = batch.batch_id
        
        # If it's a rework, we want to show the "Full Picture" (Cumulative lineage stats)
        if batch.is_reupload:
            curr_parent_uid = batch.parent_batch_uid
            visited = {batch.batch_uid}
            while curr_parent_uid and curr_parent_uid not in visited:
                p_batch = session.get(Batch, curr_parent_uid)
                if not p_batch: break
                
                # Update the root parent ID as we walk up
                root_batch_id = p_batch.batch_id
                
                # The furthest ancestor defines the "True" target count
                tot_count = p_batch.total_count
                
                # Add accepted images from this ancestor
                p_qca = session.exec(select(QCAllocation).where(QCAllocation.batch_uid == p_batch.batch_uid)).first()
                if p_qca:
                    p_acc = session.exec(
                        select(func.count(QC.qc_id))
                        .where(col(QC.qc_allocation_id) == p_qca.qc_allocation_id)
                        .where(QC.qc_status == QCStatus.Approved)
                    ).first() or 0
                    acc_count += p_acc
                
                visited.add(curr_parent_uid)
                curr_parent_uid = p_batch.parent_batch_uid

        accepted_list.append(QCHistoryRead(
            qc_allocation_id=qca.qc_allocation_id,
            batch_uid=batch.batch_uid,
            batch_id=batch.batch_id,
            project_name=proj,
            source_name=src,
            location_name=loc,
            record_owner_name=owner,
            record_type_name=rtype,
            record_name=rname,
            parent_batch_id=root_batch_id if batch.is_reupload else None,
            vendor_name=vname,
            total_count=tot_count, # Show aggregated scope
            upload_count=batch.upload_count,
            qc_done_count=qc_done,
            accepted_count=acc_count, # Show aggregated accepted
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
    
    return accepted_list

@router.get("/batch-lineage/{batch_uid}", response_model=List[QCHistoryRead])
def get_batch_lineage(
    batch_uid: UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Fetch the entire history/lineage of a batch (parents and children)"""
    if current_user.user_role not in [UserRole.SuperAdmin, UserRole.Upload_Supervisor, UserRole.QC_Supervisor]:
        raise HTTPException(status_code=403, detail="Not authorized.")

    # 1. Find the root parent
    curr = session.get(Batch, batch_uid)
    if not curr:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    root_uid = batch_uid
    visited = {batch_uid}
    while curr.parent_batch_uid and curr.parent_batch_uid not in visited:
        root_uid = curr.parent_batch_uid
        curr = session.get(Batch, root_uid)
        if not curr: break
        visited.add(root_uid)

    # 2. Collect all batches in this lineage (depth-first search down from root)
    lineage_uids = [root_uid]
    to_process = [root_uid]
    processed = set()
    while to_process:
        pid = to_process.pop()
        if pid in processed: continue
        processed.add(pid)
        children = session.exec(select(Batch.batch_uid).where(Batch.parent_batch_uid == pid)).all()
        for cid in children:
            if cid not in lineage_uids:
                lineage_uids.append(cid)
                to_process.append(cid)

    # 3. Fetch full details for all batches in lineage
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
        .where(Batch.batch_uid.in_(lineage_uids))
        .order_by(Batch.created_date.asc())
    )

    results = session.exec(statement).all()
    
    lineage_data = []
    for qca, batch, proj, src, loc, owner, rtype, rname, vname, qc_user_name, sup_name in results:
        qc_done = session.exec(select(func.count(QC.qc_id)).where(col(QC.qc_allocation_id) == qca.qc_allocation_id).where(QC.qc_status != QCStatus.Pending)).first() or 0
        accepted = session.exec(select(func.count(QC.qc_id)).where(col(QC.qc_allocation_id) == qca.qc_allocation_id).where(QC.qc_status == QCStatus.Approved)).first() or 0
        rejected = session.exec(select(func.count(QC.qc_id)).where(col(QC.qc_allocation_id) == qca.qc_allocation_id).where(QC.qc_status == QCStatus.Rejected)).first() or 0
        
        up_type = "Re-upload" if batch.is_reupload else ("Partial" if batch.is_partial else "Complete")
        
        lineage_data.append(QCHistoryRead(
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

    return lineage_data

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
    all_batches_uploads = session.exec(select(Batch, Upload).outerjoin(Upload, Batch.batch_uid == Upload.batch_uid)).all()
    total_batches = len(all_batches_uploads)
    
    # Target images ONLY from initial allocations (ignores inflation from rework batches)
    target_images = sum(b.total_count for b, u in all_batches_uploads if not b.is_reupload)
    
    # Total images physically uploaded across ALL batches
    gross_uploaded = sum(u.completed_count for b, u in all_batches_uploads if u)
    
    # All-time rejections (Cumulative Defense)
    total_rejected_all_time = session.exec(select(func.count(QC.qc_id)).where(QC.qc_status == QCStatus.Rejected)).one()
    
    # Net Uploaded (Progress toward target)
    # We subtract rejections because they need to be replaced. 
    # The replacement (rework) will eventually add back to the gross count.
    uploaded_images = max(0, gross_uploaded - total_rejected_all_time)
    if target_images > 0:
        uploaded_images = min(uploaded_images, target_images)

    # 3. QC Stats
    all_qca = session.exec(select(QCAllocation)).all()
    verified_batches = len([q for q in all_qca if q.qc_batch_status in [QCBatchStatus.Verified, QCBatchStatus.Verified_With_Rejection]])
    
    total_accepted = session.exec(select(func.count(QC.qc_id)).where(QC.qc_status == QCStatus.Approved)).one()
    
    # Accuracy reflects "First-Time Right" performance (Cumulative)
    accuracy = round((total_accepted / (total_accepted + total_rejected_all_time) * 100), 2) if (total_accepted + total_rejected_all_time) > 0 else 100
    
    # Pending QC = Gross Uploaded - (Total Decisions)
    total_qc_pending = max(0, gross_uploaded - (total_accepted + total_rejected_all_time))

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
            "uploaded_images": uploaded_images,
            "gross_uploaded": gross_uploaded
        },
        "qc_stats": {
            "verified_batches": verified_batches,
            "accepted_images": total_accepted,
            "rejected_images": total_rejected_all_time,
            "accuracy": accuracy,
            "total_qc_pending": total_qc_pending
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

@router.get("/batch-download-script/{batch_uid}")
def generate_batch_download_script(
    batch_uid: UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """
    Generates a Windows (.bat) or Linux (.sh) script containing Pre-signed URLs
    to download a batch directly from S3 to the local machine.
    """
    if current_user.user_role not in [UserRole.SuperAdmin, UserRole.QC_Supervisor, UserRole.Upload_Supervisor]:
        raise HTTPException(status_code=403, detail="Not authorized")

    # 1. Fetch Hierarchy Info
    stmt = (
        select(
            Batch, Project.project_code, Source.source_name, Location.location_name,
            RecordOwner.record_owner_name, RecordType.record_type_name, RecordName.record_name
        )
        .join(Source, Batch.source_id == Source.source_id)
        .join(Location, Batch.location_id == Location.location_id)
        .join(Project, Source.project_id == Project.project_id)
        .join(RecordOwner, Batch.record_owner_id == RecordOwner.record_owner_id)
        .join(RecordType, Batch.record_type_id == RecordType.record_type_id)
        .join(RecordName, Batch.record_name_id == RecordName.record_name_id)
        .where(Batch.batch_uid == batch_uid)
    )
    result = session.exec(stmt).first()
    if not result:
        raise HTTPException(status_code=404, detail="Batch not found")

    batch, p_code, src, loc, owner, rtype, rname = result

    # 2. Get accepted images lineage
    all_allocation_ids = []
    this_qca = session.exec(select(QCAllocation).where(QCAllocation.batch_uid == batch_uid)).first()
    if this_qca: all_allocation_ids.append(this_qca.qc_allocation_id)

    curr_batch = batch
    visited = {batch_uid}
    while curr_batch.parent_batch_uid and curr_batch.parent_batch_uid not in visited:
        p_batch = session.get(Batch, curr_batch.parent_batch_uid)
        if not p_batch: break
        p_qca = session.exec(select(QCAllocation).where(QCAllocation.batch_uid == p_batch.batch_uid)).first()
        if p_qca: all_allocation_ids.append(p_qca.qc_allocation_id)
        visited.add(curr_batch.parent_batch_uid)
        curr_batch = p_batch

    images_stmt = (
        select(Image, QC)
        .join(QC, Image.image_id == QC.image_id)
        .where(QC.qc_allocation_id.in_(all_allocation_ids))
        .where(QC.qc_status == QCStatus.Approved)
        .order_by(Image.image_name, QC.qc_date.desc())
    )
    all_results = session.exec(images_stmt).all()

    to_download = {}
    for img, qc in all_results:
        if img.image_name not in to_download:
            to_download[img.image_name] = img.original_s3_path

    # 3. Generate Pre-signed URLs
    s3_client = boto3.client(
        's3',
        endpoint_url=os.getenv('ENDPOINT_URL'),
        aws_access_key_id=os.getenv('AWS_ACCESS_KEY_ID'),
        aws_secret_access_key=os.getenv('AWS_SECRET_ACCESS_KEY'),
        region_name=os.getenv('AWS_REGION'),
        config=Config(signature_version='s3v4')
    )
    bucket_name = os.getenv('S3_BUCKET_NAME')

    base_dir = f"{p_code}_{src}_{loc}_{rname}".replace(" ", "_")
    
    # Building Windows .BAT script
    script_lines = ["@echo off", f"echo Starting Download for Batch: {batch.batch_id}", f"mkdir \"{base_dir}\" 2>nul", f"cd \"{base_dir}\""]
    
    for filename, s3_path in to_download.items():
        try:
            s3_key = s3_path.split(f"{bucket_name}/")[-1]
            presigned_url = s3_client.generate_presigned_url(
                'get_object',
                Params={'Bucket': bucket_name, 'Key': s3_key},
                ExpiresIn=3600*24 # 24 Hour validity
            )
            script_lines.append(f"if not exist \"{filename}\" (")
            script_lines.append(f"  echo Downloading {filename}...")
            script_lines.append(f"  curl -L -o \"{filename}\" \"{presigned_url}\"")
            script_lines.append(")")
        except: continue

    script_lines.append("echo Download Complete!")
    script_lines.append("pause")
    
    return {
        "script_content": "\n".join(script_lines),
        "filename": f"sync_{batch.batch_id}.bat"
    }


