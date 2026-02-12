from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlmodel import Session, select
from datetime import timedelta, datetime
from uuid import UUID
from pydantic import BaseModel
from common.database import get_session
from common.models import User, UserRole
from common.security import get_password_hash, verify_password, create_access_token, validate_password_strength
from common.email_utils import send_welcome_email
from common.auth_utils import get_current_user
from fastapi import BackgroundTasks

router = APIRouter(prefix="/auth", tags=["Authentication"])

# --- Schemas ---
class UserCreate(BaseModel):
    name: str
    username: str
    email: str
    password: str
    user_role: UserRole = UserRole.SuperAdmin
    created_by: UUID | None = None

class Token(BaseModel):
    access_token: str
    token_type: str
    user_id: str
    username: str
    name: str | None = None
    role: str

@router.get("/")
def read_root():
    return {"service": "Auth Service", "port": 8001}

from common.auth_utils import role_required

@router.post("/register", response_model=User)
def register(
    user_data: UserCreate, 
    background_tasks: BackgroundTasks, 
    session: Session = Depends(get_session),
    current_role: str = Depends(role_required([UserRole.SuperAdmin, UserRole.Upload_Supervisor, UserRole.Vendor, UserRole.QC_Supervisor])),
    current_user: User = Depends(get_current_user)
):
    from common.audit_logger import log_action
    
    print(f"Registration request by {current_role} for {user_data.username} as {user_data.user_role}")
    
    # Restriction: Upload_Supervisor can ONLY create Vendors
    if current_role == UserRole.Upload_Supervisor and user_data.user_role != UserRole.Vendor:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="Upload Supervisors are restricted to creating Vendor accounts only."
        )
    
    # Restriction: Vendor can ONLY create Scanning Operators
    if current_role == UserRole.Vendor and user_data.user_role != UserRole.Scanning_Operator:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Vendors are restricted to creating Scanning Operator accounts only."
        )

    # Restriction: QC_Supervisor can ONLY create QC Users
    if current_role == UserRole.QC_Supervisor and user_data.user_role != UserRole.QC_User:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="QC Supervisors are restricted to creating QC User accounts only."
        )

    # Restriction: SuperAdmin can NOT create Scanning Operators
    if current_role == UserRole.SuperAdmin and user_data.user_role == UserRole.Scanning_Operator:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="SuperAdmins are not authorized to create Scanning Operator accounts. These are managed by Vendors."
        )

    # Password validation
    if not validate_password_strength(user_data.password):
        raise HTTPException(
            status_code=400,
            detail="Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one digit, and one special character."
        )

    # Check if user already exists
    existing_user_name = session.exec(select(User).where(User.username == user_data.username)).first()
    if existing_user_name:
        raise HTTPException(status_code=400, detail="Username already registered")
        
    existing_user_email = session.exec(select(User).where(User.email == user_data.email)).first()
    if existing_user_email:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Create new user
    db_user = User(
        name=user_data.name,
        username=user_data.username,
        email=user_data.email,
        password_hash=get_password_hash(user_data.password),
        user_role=user_data.user_role,
        created_by=user_data.created_by
    )
    session.add(db_user)
    session.commit()
    session.refresh(db_user)
    
    # Log user registration
    log_action(
        session=session,
        user_id=current_user.user_id,
        username=current_user.username,
        action="User Registered",
        endpoint="/auth/register",
        method="POST",
        payload={
            "new_user_name": db_user.name,
            "new_username": db_user.username,
            "new_user_role": db_user.user_role,
            "created_by_role": current_role
        },
        result="success"
    )
    
    # Send welcome email in background
    background_tasks.add_task(
        send_welcome_email,
        to_email=db_user.email,
        name=db_user.name,
        username=db_user.username,
        password=user_data.password,
        role=db_user.user_role
    )
    
    return db_user

@router.post("/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), session: Session = Depends(get_session)):
    from common.audit_logger import log_action
    
    user = session.exec(select(User).where(User.username == form_data.username)).first()
    if not user or not verify_password(form_data.password, user.password_hash):
        # Log failed login attempt
        if user:
            log_action(
                session=session,
                user_id=user.user_id,
                username=user.username,
                action="Login Failed",
                endpoint="/auth/login",
                method="POST",
                payload={"reason": "Invalid password"},
                result="failure"
            )
        
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token = create_access_token(
        data={"sub": user.username, "role": user.user_role}
    )
    
    # Log successful login
    log_action(
        session=session,
        user_id=user.user_id,
        username=user.username,
        action="User Logged In",
        endpoint="/auth/login",
        method="POST",
        payload={
            "role": user.user_role,
            "name": user.name
        },
        result="success"
    )
    
    return {
        "access_token": access_token, 
        "token_type": "bearer",
        "user_id": str(user.user_id),
        "username": user.username,
        "name": user.name,
        "role": user.user_role
    }

@router.post("/logout")
def logout(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Log user logout for audit trail"""
    from common.audit_logger import log_action
    
    # Log the logout
    log_action(
        session=session,
        user_id=current_user.user_id,
        username=current_user.username,
        action="User Logged Out",
        endpoint="/auth/logout",
        method="POST",
        payload={
            "role": current_user.user_role,
            "name": current_user.name
        },
        result="success"
    )
    
    return {"message": "Logged out successfully"}


# --- Enhanced Schemas ---
class UpdateProfileRequest(BaseModel):
    name: str
    username: str
    email: str

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str
    confirm_password: str

@router.put("/profile/update", response_model=User)
def update_profile(
    profile_data: UpdateProfileRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Update current user's profile details"""
    # Check if username/email is taken by someone else
    existing_username = session.exec(select(User).where(User.username == profile_data.username).where(User.user_id != current_user.user_id)).first()
    if existing_username:
        raise HTTPException(status_code=400, detail="Username already taken")
        
    existing_email = session.exec(select(User).where(User.email == profile_data.email).where(User.user_id != current_user.user_id)).first()
    if existing_email:
        raise HTTPException(status_code=400, detail="Email already taken")

    current_user.name = profile_data.name
    current_user.username = profile_data.username
    current_user.email = profile_data.email
    current_user.last_updated = datetime.utcnow() # Use UTC directly or helper
    
    session.add(current_user)
    session.commit()
    session.refresh(current_user)
    return current_user

@router.get("/me", response_model=User)
def get_me(current_user: User = Depends(get_current_user)):
    """Get current user's profile"""
    return current_user

@router.post("/profile/change-password")
def change_password(
    password_data: ChangePasswordRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Change current user's password"""
    from common.audit_logger import log_action
    
    if not verify_password(password_data.current_password, current_user.password_hash):
        # Log failed password change attempt
        log_action(
            session=session,
            user_id=current_user.user_id,
            username=current_user.username,
            action="Password Change Failed",
            endpoint="/auth/profile/change-password",
            method="POST",
            payload={"reason": "Incorrect current password"},
            result="failure"
        )
        raise HTTPException(status_code=400, detail="Incorrect current password")
        
    if password_data.new_password != password_data.confirm_password:
        # Log failed password change attempt
        log_action(
            session=session,
            user_id=current_user.user_id,
            username=current_user.username,
            action="Password Change Failed",
            endpoint="/auth/profile/change-password",
            method="POST",
            payload={"reason": "New passwords do not match"},
            result="failure"
        )
        raise HTTPException(status_code=400, detail="New passwords do not match")
        
    if not validate_password_strength(password_data.new_password):
        # Log failed password change attempt
        log_action(
            session=session,
            user_id=current_user.user_id,
            username=current_user.username,
            action="Password Change Failed",
            endpoint="/auth/profile/change-password",
            method="POST",
            payload={"reason": "Password does not meet strength requirements"},
            result="failure"
        )
        raise HTTPException(
            status_code=400,
            detail="Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one digit, and one special character."
        )
        
    current_user.password_hash = get_password_hash(password_data.new_password)
    current_user.last_updated = datetime.utcnow()
    
    session.add(current_user)
    session.commit()
    
    # Log successful password change
    log_action(
        session=session,
        user_id=current_user.user_id,
        username=current_user.username,
        action="Password Changed",
        endpoint="/auth/profile/change-password",
        method="POST",
        payload={"success": True},
        result="success"
    )
    
    return {"message": "Password updated successfully"}

from fastapi import File, UploadFile
import boto3
import os
from botocore.client import Config

@router.post("/profile/upload-picture")
async def upload_profile_picture(
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Upload a profile picture to S3"""
    # 1. Validate file type (basic check)
    if file.content_type not in ["image/jpeg", "image/png", "image/jpg"]:
        raise HTTPException(status_code=400, detail="Only JPEG/PNG images are allowed")
    
    # 2. Prepare S3 Key
    file_extension = file.filename.split('.')[-1]
    base_folder = os.getenv('Base_folder', 'FamilyaConnect-QCTool')
    s3_key = f"{base_folder}/USERPROFILES/{current_user.user_id}.{file_extension}"
    
    # 3. Upload to S3
    s3_client = boto3.client(
        's3',
        endpoint_url=os.getenv('ENDPOINT_URL'),
        aws_access_key_id=os.getenv('AWS_ACCESS_KEY_ID'),
        aws_secret_access_key=os.getenv('AWS_SECRET_ACCESS_KEY'),
        region_name=os.getenv('AWS_REGION'),
        config=Config(signature_version='s3v4')
    )
    
    try:
        s3_client.upload_fileobj(
            file.file,
            os.getenv('S3_BUCKET_NAME'),
            s3_key,
            ExtraArgs={'ContentType': file.content_type}
        )
    except Exception as e:
        print(f"Profile upload failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to upload image to storage")
        
    # 4. Generate Presigned URL for immediate display (Optional return)
    # But crucially, save the key to DB
    current_user.profile_picture_path = s3_key
    session.add(current_user)
    session.commit()
    session.refresh(current_user)
    
    # Generate a fresh URL to return
    presigned_url = s3_client.generate_presigned_url(
        'get_object',
        Params={
            'Bucket': os.getenv('S3_BUCKET_NAME'),
            'Key': s3_key
        },
        ExpiresIn=3600 * 24 # 24 hours
    )

    return {
        "message": "Profile picture uploaded successfully",
        "profile_picture_path": s3_key,
        "presigned_url": presigned_url
    }

@router.get("/profile/me/picture")
def get_my_profile_picture(
    current_user: User = Depends(get_current_user)
):
    """Get presigned URL for current user's profile picture"""
    if not current_user.profile_picture_path:
        return {"url": None}
        
    s3_client = boto3.client(
        's3',
        endpoint_url=os.getenv('ENDPOINT_URL'),
        aws_access_key_id=os.getenv('AWS_ACCESS_KEY_ID'),
        aws_secret_access_key=os.getenv('AWS_SECRET_ACCESS_KEY'),
        region_name=os.getenv('AWS_REGION'),
        config=Config(signature_version='s3v4')
    )
    
    try:
        url = s3_client.generate_presigned_url(
            'get_object',
            Params={
                'Bucket': os.getenv('S3_BUCKET_NAME'),
                'Key': current_user.profile_picture_path
            },
            ExpiresIn=3600 * 12
        )
        return {"url": url}
    except Exception:
        return {"url": None}


class EmailNotificationPreference(BaseModel):
    enabled: bool


@router.put("/profile/email-notifications")
def update_email_notifications(
    preference: EmailNotificationPreference,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Toggle email notifications for current user"""
    current_user.email_notifications_enabled = preference.enabled
    current_user.last_updated = datetime.utcnow()
    
    session.add(current_user)
    session.commit()
    session.refresh(current_user)
    
    return {
        "message": f"Email notifications {'enabled' if preference.enabled else 'disabled'} successfully",
        "email_notifications_enabled": current_user.email_notifications_enabled
    }


@router.get("/profile/email-notifications")
def get_email_notification_status(
    current_user: User = Depends(get_current_user)
):
    """Get current email notification preference"""
    return {
        "email_notifications_enabled": current_user.email_notifications_enabled
    }
