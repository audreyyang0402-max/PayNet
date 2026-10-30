import os
import bcrypt
import hashlib
import hmac
import re
from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import get_db
from models import User

# Configuration
SECRET_KEY = os.getenv("SECRET_KEY", "")
if len(SECRET_KEY) < 32:
    raise RuntimeError("Set SECRET_KEY to a random secret of at least 32 characters before starting PayNet.")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days expiration

# Deleted accounts are anonymized to an email on this domain; their old tokens are rejected.
DELETED_EMAIL_DOMAIN = "deleted.invalid"

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")


# --- PASSWORD HASHING (UPDATED TO USE BCRYPT DIRECTLY) ---

def validate_password(password: str):
    if (len(password) < 12 or len(password.encode("utf-8")) > 72
        or not re.search(r"[a-z]", password) or not re.search(r"[A-Z]", password)
        or not re.search(r"[0-9]", password) or not re.search(r"[^a-zA-Z0-9\s]", password)):
        raise HTTPException(400, "Use at least 12 characters with uppercase, lowercase, a number and a symbol (maximum 72 UTF-8 bytes).")

def password_stamp(password_hash: str):
    return hmac.new(SECRET_KEY.encode(), password_hash.encode(), hashlib.sha256).hexdigest()

def hash_password(password: str) -> str:
    # bcrypt requires bytes, so we encode the string to utf-8 first
    salt = bcrypt.gensalt()
    hashed_bytes = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed_bytes.decode('utf-8')  # Decode back to a normal string for PostgreSQL


def verify_password(plain_password: str, hashed_password: str) -> bool:
    # Both need to be bytes for bcrypt to compare them securely
    if len(plain_password.encode("utf-8")) > 72:
        return False
    return bcrypt.checkpw(
        plain_password.encode('utf-8'), 
        hashed_password.encode('utf-8')
    )


# --- JWT TOKEN MANAGEMENT ---

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


# --- AUTH DEPENDENCY / ROUTE GUARD ---

async def get_current_user(
    token: str = Depends(oauth2_scheme), 
    db: AsyncSession = Depends(get_db)
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalars().first()
    
    if user is None or user.is_deleted or user.email.endswith("@" + DELETED_EMAIL_DOMAIN):
        raise credentials_exception
    if not hmac.compare_digest(str(payload.get("pwd", "")), password_stamp(user.password_hash)):
        raise credentials_exception
    return user