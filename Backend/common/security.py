import os
from datetime import datetime, timedelta
from typing import Optional, Union, Any
from jose import jwt
from passlib.context import CryptContext
from dotenv import load_dotenv

load_dotenv()

# --- Configuration ---
SECRET_KEY = os.getenv("SECRET_KEY", "y0ur_sup3r_s3cr3t_v3ry_l0ng_k3y_h3r3_f0r_jwt_t0k3ns")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "480"))

# --- Password Hashing ---
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

# --- JWT Token ---
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def decode_access_token(token: str) -> Optional[dict]:
    try:
        decoded_token = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        # Check expiration (jwt.decode already does this, but we'll be extra clear)
        exp = decoded_token.get("exp")
        if exp and exp < datetime.utcnow().timestamp():
            print(f"Token expired: {exp} < {datetime.utcnow().timestamp()}")
            return None
        return decoded_token
    except jwt.ExpiredSignatureError:
        print("Token signature has expired")
        return None
    except jwt.JWTError as e:
        print(f"JWT decode error: {str(e)}")
        return None
    except Exception as e:
        print(f"Unexpected token error: {str(e)}")
        return None
