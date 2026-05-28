import os
from datetime import datetime, timedelta
from typing import Optional
from jose import jwt
import bcrypt
from dotenv import load_dotenv
from common.models import get_ist_now

load_dotenv()

# --- Configuration ---
SECRET_KEY = os.getenv("SECRET_KEY", "y0ur_sup3r_s3cr3t_v3ry_l0ng_k3y_h3r3_f0r_jwt_t0k3ns")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = min(int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "480")), 1440)  # Max 24 hours

# --- Password Hashing ---
def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against a bcrypt hash"""
    # Bcrypt has a 72-byte limit, truncate if necessary
    password_bytes = plain_password.encode('utf-8')[:72]
    hash_bytes = hashed_password.encode('utf-8')
    return bcrypt.checkpw(password_bytes, hash_bytes)

def get_password_hash(password: str) -> str:
    """Generate a bcrypt hash for a password"""
    # Bcrypt has a 72-byte limit, truncate if necessary
    password_bytes = password.encode('utf-8')[:72]
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password_bytes, salt)
    return hashed.decode('utf-8')


def validate_password_strength(password: str) -> bool:
    """
    Validates that a password contains at least:
    - 1 uppercase letter
    - 1 lowercase letter
    - 1 special character
    - 1 digit
    and minimum 8 characters.
    """
    import re
    if len(password) < 8:
        return False
    if not re.search(r"[A-Z]", password):
        return False
    if not re.search(r"[a-z]", password):
        return False
    if not re.search(r"\d", password):
        return False
    if not re.search(r"[!@#$%^&*(),.?\":{}|<>]", password):
        return False
    return True

# --- JWT Token ---
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = get_ist_now() + expires_delta
    else:
        expire = get_ist_now() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def decode_access_token(token: str) -> Optional[dict]:
    try:
        decoded_token = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        # Check expiration (jwt.decode already does this, but we'll be extra clear)
        exp = decoded_token.get("exp")
        if exp and exp < get_ist_now().timestamp():
            print(f"Token expired: {exp} < {get_ist_now().timestamp()}")
            return None
        return decoded_token
    except jwt.ExpiredSignatureError:
        return None
    except jwt.JWTError:
        return None
    except Exception:
        return None
