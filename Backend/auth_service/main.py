from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlmodel import Session, select
from datetime import timedelta
from uuid import UUID
from pydantic import BaseModel
from common.database import get_session
from common.models import User, UserRole
from common.security import get_password_hash, verify_password, create_access_token
from common.email_utils import send_welcome_email
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
    current_role: str = Depends(role_required([UserRole.SuperAdmin, UserRole.Upload_Supervisor, UserRole.Vendor]))
):
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

    # Check if user already exists
    existing_user = session.exec(select(User).where(User.username == user_data.username)).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    
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
    user = session.exec(select(User).where(User.username == form_data.username)).first()
    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token = create_access_token(
        data={"sub": user.username, "role": user.user_role}
    )
    
    return {
        "access_token": access_token, 
        "token_type": "bearer",
        "user_id": str(user.user_id),
        "username": user.username,
        "role": user.user_role
    }

