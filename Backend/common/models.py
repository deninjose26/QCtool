from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Optional, List
from uuid import UUID, uuid4
from sqlmodel import SQLModel, Field, Relationship, create_engine, Session

def get_ist_now():
    """Helper to get current time in India Standard Time (naive)"""
    return datetime.utcnow() + timedelta(hours=5, minutes=30)

# --- Enums ---

class UserRole(str, Enum):
    SuperAdmin = "SuperAdmin"
    QC_Supervisor = "QC_Supervisor"
    QC_User = "QC_User"
    Upload_Supervisor = "Upload_Supervisor"
    Vendor = "Vendor"
    Scanning_Operator = "Scanning_Operator"

class UploadStatus(str, Enum):
    Pending = "Pending"
    In_Progress = "In_Progress"
    Completed = "Completed"
    Failed = "Failed"

class ConversionStatus(str, Enum):
    Tiff_Received = "Tiff_Received"
    Jpeg_Converting = "Jpeg_Converting"
    Jpeg_Converted = "Jpeg_Converted"
    QC_Moved = "QC_Moved"
    Failed = "Failed"

class FileType(str, Enum):
    TIFF = "TIFF"
    JPEG = "JPEG"
    PNG = "PNG"

class QCBatchStatus(str, Enum):
    Allocated = "Allocated"
    QC_Pending = "QC_Pending"
    QC_In_Progress = "QC_In_Progress"
    Completed = "Completed"
    Verified = "Verified"
    Verified_With_Rejection = "Verified_With_Rejection"

# --- Models ---

class User(SQLModel, table=True):
    __tablename__ = "users"
    __table_args__ = {"schema": "qc_portal"}
    user_id: UUID = Field(default_factory=uuid4, primary_key=True)
    name: str
    username: str = Field(unique=True, index=True)
    email: Optional[str] = Field(unique=True)
    password_hash: str
    user_role: UserRole
    is_active: bool = Field(default=True)
    created_by: Optional[UUID] = Field(default=None, foreign_key="qc_portal.users.user_id")
    created_date: datetime = Field(default_factory=get_ist_now)
    last_updated: datetime = Field(default_factory=get_ist_now)
    profile_picture_path: Optional[str] = None
    email_notifications_enabled: bool = Field(default=True)

class Project(SQLModel, table=True):
    __tablename__ = "projects"
    __table_args__ = {"schema": "qc_portal"}
    project_id: UUID = Field(default_factory=uuid4, primary_key=True)
    project_code: str = Field(unique=True, index=True)
    project_name: str
    description: Optional[str] = None
    created_by: UUID = Field(foreign_key="qc_portal.users.user_id")
    created_date: datetime = Field(default_factory=get_ist_now)
    last_updated: datetime = Field(default_factory=get_ist_now)

class Source(SQLModel, table=True):
    __tablename__ = "source"
    __table_args__ = {"schema": "qc_portal"}
    source_id: UUID = Field(default_factory=uuid4, primary_key=True)
    project_id: UUID = Field(foreign_key="qc_portal.projects.project_id")
    source_code: str
    source_name: str
    created_by: UUID = Field(foreign_key="qc_portal.users.user_id")
    created_date: datetime = Field(default_factory=get_ist_now)
    last_updated: datetime = Field(default_factory=get_ist_now)

class Location(SQLModel, table=True):
    __tablename__ = "location"
    __table_args__ = {"schema": "qc_portal"}
    location_id: UUID = Field(default_factory=uuid4, primary_key=True)
    project_id: UUID = Field(foreign_key="qc_portal.projects.project_id")
    source_id: UUID = Field(foreign_key="qc_portal.source.source_id")
    location_code: str
    location_name: str
    created_by: UUID = Field(foreign_key="qc_portal.users.user_id")
    created_date: datetime = Field(default_factory=get_ist_now)
    last_updated: datetime = Field(default_factory=get_ist_now)

class RecordOwner(SQLModel, table=True):
    __tablename__ = "record_owners"
    __table_args__ = {"schema": "qc_portal"}
    record_owner_id: UUID = Field(default_factory=uuid4, primary_key=True)
    project_id: UUID = Field(foreign_key="qc_portal.projects.project_id")
    source_id: UUID = Field(foreign_key="qc_portal.source.source_id")
    location_id: UUID = Field(foreign_key="qc_portal.location.location_id")
    record_owner_code: str
    record_owner_name: str
    created_by: UUID = Field(foreign_key="qc_portal.users.user_id")
    created_date: datetime = Field(default_factory=get_ist_now)
    last_updated: datetime = Field(default_factory=get_ist_now)

class RecordName(SQLModel, table=True):
    __tablename__ = "record_name"
    __table_args__ = {"schema": "qc_portal"}
    record_name_id: UUID = Field(default_factory=uuid4, primary_key=True)
    project_id: UUID = Field(foreign_key="qc_portal.projects.project_id")
    record_code: str = Field(unique=True, index=True)
    record_name: str
    created_by: UUID = Field(foreign_key="qc_portal.users.user_id")
    created_date: datetime = Field(default_factory=get_ist_now)
    last_updated: datetime = Field(default_factory=get_ist_now)

class RecordType(SQLModel, table=True):
    __tablename__ = "record_type"
    __table_args__ = {"schema": "qc_portal"}
    record_type_id: UUID = Field(default_factory=uuid4, primary_key=True)
    record_type_code: str
    record_type_name: str
    source_id: UUID = Field(foreign_key="qc_portal.source.source_id")
    created_by: UUID = Field(foreign_key="qc_portal.users.user_id")
    created_date: datetime = Field(default_factory=get_ist_now)
    last_updated: datetime = Field(default_factory=get_ist_now)

class VendorAllocation(SQLModel, table=True):
    __tablename__ = "vendor_allocation"
    __table_args__ = {"schema": "qc_portal"}
    vendor_allocation_id: UUID = Field(default_factory=uuid4, primary_key=True)
    project_id: UUID = Field(foreign_key="qc_portal.projects.project_id")
    source_id: UUID = Field(foreign_key="qc_portal.source.source_id")
    location_id: UUID = Field(foreign_key="qc_portal.location.location_id")
    record_owner_id: UUID = Field(foreign_key="qc_portal.record_owners.record_owner_id")
    allocated_to_vendor: UUID = Field(foreign_key="qc_portal.users.user_id")
    allocated_by_supervisor: UUID = Field(foreign_key="qc_portal.users.user_id")
    is_active: bool = Field(default=True)
    created_date: datetime = Field(default_factory=get_ist_now)
    last_updated: datetime = Field(default_factory=get_ist_now)

class ScanningOperatorAllocation(SQLModel, table=True):
    __tablename__ = "scanning_operator_allocation"
    __table_args__ = {"schema": "qc_portal"}
    scanning_operator_allocation_id: UUID = Field(default_factory=uuid4, primary_key=True)
    vendor_allocation_id: UUID = Field(foreign_key="qc_portal.vendor_allocation.vendor_allocation_id")
    allocated_to_operator: UUID = Field(foreign_key="qc_portal.users.user_id")
    is_active: bool = Field(default=True)
    created_date: datetime = Field(default_factory=get_ist_now)
    last_updated: datetime = Field(default_factory=get_ist_now)

class Batch(SQLModel, table=True):
    __tablename__ = "batch"
    __table_args__ = {"schema": "qc_portal"}
    batch_uid: UUID = Field(default_factory=uuid4, primary_key=True)
    batch_id: str = Field(unique=True, index=True)
    scanning_operator_allocation_id: UUID = Field(foreign_key="qc_portal.scanning_operator_allocation.scanning_operator_allocation_id")
    source_id: UUID = Field(foreign_key="qc_portal.source.source_id")
    location_id: UUID = Field(foreign_key="qc_portal.location.location_id")
    record_owner_id: UUID = Field(foreign_key="qc_portal.record_owners.record_owner_id")
    record_name_id: UUID = Field(foreign_key="qc_portal.record_name.record_name_id")
    record_type_id: UUID = Field(foreign_key="qc_portal.record_type.record_type_id")
    total_count: int
    upload_count: int = Field(default=0)
    is_complete: bool = Field(default=False)
    is_partial: bool = Field(default=False)
    is_reupload: bool = Field(default=False)
    parent_batch_uid: Optional[UUID] = Field(default=None, foreign_key="qc_portal.batch.batch_uid")
    vendor_approved: bool = Field(default=True)
    created_date: datetime = Field(default_factory=get_ist_now)
    last_updated: datetime = Field(default_factory=get_ist_now)

class Upload(SQLModel, table=True):
    __tablename__ = "upload"
    __table_args__ = {"schema": "qc_portal"}
    upload_id: UUID = Field(default_factory=uuid4, primary_key=True)
    batch_uid: UUID = Field(foreign_key="qc_portal.batch.batch_uid", unique=True, index=True)
    completed_count: int = Field(default=0)
    s3_folder_path: str
    upload_status: UploadStatus = Field(default=UploadStatus.Pending)
    uploaded_by: UUID = Field(foreign_key="qc_portal.users.user_id")
    upload_start_date: datetime = Field(default_factory=get_ist_now)
    upload_end_date: Optional[datetime] = None
    last_updated: datetime = Field(default_factory=get_ist_now)
    
    # Upload lock fields for multi-device prevention
    locked_by: Optional[UUID] = Field(default=None, foreign_key="qc_portal.users.user_id")
    locked_at: Optional[datetime] = None
    locked_device: Optional[str] = None
    locked_device_id: Optional[str] = None
    locked_ip: Optional[str] = None
    current_file_name: Optional[str] = None

from sqlalchemy import UniqueConstraint

class Image(SQLModel, table=True):
    __tablename__ = "image"
    __table_args__ = (
        UniqueConstraint("batch_uid", "image_name", name="uq_batch_image"),
        {"schema": "qc_portal"}
    )
    image_id: UUID = Field(default_factory=uuid4, primary_key=True)
    upload_id: UUID = Field(foreign_key="qc_portal.upload.upload_id")
    batch_uid: UUID = Field(foreign_key="qc_portal.batch.batch_uid")
    image_name: str
    original_s3_path: str
    qc_s3_path: Optional[str] = None
    original_file_type: FileType
    converted_file_type: Optional[FileType] = None
    conversion_status: ConversionStatus = Field(default=ConversionStatus.Tiff_Received)
    file_size_bytes: Optional[int] = None
    upload_date: datetime = Field(default_factory=get_ist_now)

class QCAllocation(SQLModel, table=True):
    __tablename__ = "qc_allocation"
    __table_args__ = {"schema": "qc_portal"}
    qc_allocation_id: UUID = Field(default_factory=uuid4, primary_key=True)
    batch_uid: UUID = Field(foreign_key="qc_portal.batch.batch_uid")
    allocated_to_qc_user: UUID = Field(foreign_key="qc_portal.users.user_id")
    allocated_by_supervisor: UUID = Field(foreign_key="qc_portal.users.user_id")
    allocation_date: datetime = Field(default_factory=get_ist_now)
    qc_batch_status: QCBatchStatus = Field(default=QCBatchStatus.Allocated)
    qc_completed_date: Optional[datetime] = None

class QCStatus(str, Enum):
    Pending = "Pending"
    Approved = "Approved"
    Rejected = "Rejected"
    Flagged = "Flagged"

class QC(SQLModel, table=True):
    __tablename__ = "qc"
    __table_args__ = {"schema": "qc_portal"}
    qc_id: UUID = Field(default_factory=uuid4, primary_key=True)
    qc_allocation_id: UUID = Field(foreign_key="qc_portal.qc_allocation.qc_allocation_id")
    image_id: UUID = Field(foreign_key="qc_portal.image.image_id")
    qc_status: QCStatus = Field(default=QCStatus.Pending)
    orientation_error: bool = Field(default=False)
    remarks: Optional[str] = None
    qc_date: datetime = Field(default_factory=get_ist_now)

class NotificationType(str, Enum):
    batch_uploaded = "batch_uploaded"
    qc_assigned = "qc_assigned"
    batch_rejected = "batch_rejected"
    conversion_complete = "conversion_complete"

class Notification(SQLModel, table=True):
    __tablename__ = "notifications"
    __table_args__ = {"schema": "qc_portal"}
    notification_id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: UUID = Field(foreign_key="qc_portal.users.user_id", index=True)
    type: str # Use str instead of Enum to bypass serialization issues
    title: str
    message: str
    link: Optional[str] = None
    is_read: bool = Field(default=False)
    created_date: datetime = Field(default_factory=get_ist_now)

class SystemSettings(SQLModel, table=True):
    __tablename__ = "system_settings"
    __table_args__ = {"schema": "qc_portal"}
    setting_id: str = Field(primary_key=True)
    setting_value: str
    description: Optional[str] = None
    last_updated: datetime = Field(default_factory=get_ist_now)

class AuditLog(SQLModel, table=True):
    __tablename__ = "audit_logs"
    __table_args__ = {"schema": "qc_portal"}
    log_id: int = Field(default=None, primary_key=True)
    user_id: UUID = Field(foreign_key="qc_portal.users.user_id")
    username: str
    action: str
    endpoint: Optional[str] = None
    method: Optional[str] = None
    ip_address: Optional[str] = None
    payload: Optional[str] = None
    result: Optional[str] = Field(default="success")
    timestamp: datetime = Field(default_factory=get_ist_now)
