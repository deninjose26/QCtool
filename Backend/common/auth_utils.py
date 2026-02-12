from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from common.security import decode_access_token
from common.models import UserRole

from common.database import get_session
from common.models import User, UserRole
from sqlmodel import Session, select

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

async def get_current_user(
    token: str = Depends(oauth2_scheme),
    session: Session = Depends(get_session)
) -> User:
    try:
        payload = decode_access_token(token)
        if not payload:
            raise HTTPException(status_code=401, detail="Invalid token")
        username = payload.get("sub")
        if not username:
            raise HTTPException(status_code=401, detail="Invalid token payload")
        user = session.exec(select(User).where(User.username == username)).first()
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except HTTPException:
        raise
    except Exception as e:
        error_str = str(e).lower()
        # If the DB connection dropped during the request, don't blame the user's token!
        # Return 503 instead of 401 to prevent the frontend from logging the user out.
        is_db_error = any(msg in error_str for msg in ["operationalerror", "ssl", "connection slots", "reset by peer", "closed unexpectedly"])
        
        if is_db_error:
            print(f"❌ DB Capacity/SSL Error during auth: {error_str}")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE, 
                detail="Database temporarily busy. Please try again."
            )
        raise HTTPException(status_code=401, detail=str(e))

async def get_current_user_role(token: str = Depends(oauth2_scheme)) -> str:
    print(f"Verifying token (len: {len(token)}): {token[:10]}...{token[-10:]}")
    try:
        payload = decode_access_token(token)
    except Exception as e:
        print(f"Token decoding exception: {str(e)}")
        payload = None
        
    if not payload:
        print("Token decoding failed - resulting payload is None")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    role = payload.get("role")
    print(f"User role identified: {role}")
    return role

def role_required(allowed_roles: list[UserRole]):
    async def role_checker(role: str = Depends(get_current_user_role)):
        print(f"Role found: {role}, Allowed: {allowed_roles}")
        if role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have enough permissions to perform this action"
            )
        return role
    return role_checker
