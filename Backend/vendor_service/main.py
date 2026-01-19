from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select
from uuid import UUID
from pydantic import BaseModel
from typing import List, Optional
from common.database import get_session
from common.models import (
    User, UserRole, VendorAllocation, ScanningOperatorAllocation,
    Project, Source, Location, RecordOwner
)
from common.auth_utils import get_current_user, role_required

router = APIRouter(prefix="/vendor", tags=["Vendor Operations"])

# --- Schemas ---
class OperatorAllocationCreate(BaseModel):
    vendor_allocation_id: UUID
    operator_id: UUID

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
     .where(ScanningOperatorAllocation.is_active == True)
    
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

@router.delete("/operator-allocations/{allocation_id}")
def delete_operator_allocation(
    allocation_id: UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Soft delete an operator allocation."""
    oa = session.get(ScanningOperatorAllocation, allocation_id)
    if not oa:
        raise HTTPException(status_code=404, detail="Allocation not found")
    
    # Verify ownership
    va = session.get(VendorAllocation, oa.vendor_allocation_id)
    if not va or va.allocated_to_vendor != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this allocation.")
    
    oa.is_active = False
    session.add(oa)
    session.commit()
    return {"message": "Allocation deleted successfully"}
