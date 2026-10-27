# backend/auth_endpoints.py
# Add these endpoints to your main.py FastAPI app

from datetime import datetime, timezone
from fastapi import HTTPException, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import delete
from pydantic import BaseModel, EmailStr
from typing import Optional
from uuid import UUID

from database import get_db
from models import User, EmailVerification
from email_service import generate_verification_code, hash_code, send_verification_email, get_expiration_time
from auth import hash_password, verify_password, create_access_token, get_current_user


# ============= PYDANTIC MODELS =============
class SendVerificationRequest(BaseModel):
    email: EmailStr
    purpose: str = "register"  # "register" or "reset"


class VerifyCodeRequest(BaseModel):
    email: EmailStr
    code: str
    purpose: str = "register"
    password: Optional[str] = None  # Only for reset purposes
    name: Optional[str] = None  # Only for register purposes
    phone_number: Optional[str] = None  # Only for register purposes


class DeleteAccountRequest(BaseModel):
    password: str


# ============= ENDPOINTS (Add to main.py) =============

# 1. SEND VERIFICATION CODE
# POST /auth/send-verification
async def send_verification(
    req: SendVerificationRequest,
    db: AsyncSession = Depends(get_db)
):
    """Send a 6-digit verification code to user's email"""
    
    if req.purpose == "register":
        # Check if email already exists
        result = await db.execute(select(User).where(User.email == req.email))
        existing_user = result.scalars().first()
        if existing_user and not existing_user.is_deleted:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered"
            )
    elif req.purpose == "reset":
        # Check if user exists and is not deleted
        result = await db.execute(select(User).where(User.email == req.email))
        user = result.scalars().first()
        if not user or user.is_deleted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
    
    # Generate code
    code = generate_verification_code()
    code_hash = hash_code(code)
    
    # Delete any previous codes for this email & purpose (FIXED SQLAlchemy 2.0 syntax)
    await db.execute(
        delete(EmailVerification).where(
            (EmailVerification.email == req.email) &
            (EmailVerification.purpose == req.purpose)
        )
    )
    await db.commit()
    
    # Store new code
    verification = EmailVerification(
        email=req.email,
        purpose=req.purpose,
        code_hash=code_hash,
        attempts=0,
        expires_at=get_expiration_time()
    )
    db.add(verification)
    await db.commit()
    
    # Send email
    success = await send_verification_email(req.email, code, req.purpose)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to send verification email"
        )
    
    return {"message": "Verification code sent to email"}


# 2. VERIFY CODE & COMPLETE ACTION
# POST /auth/verify-code
async def verify_code(
    req: VerifyCodeRequest,
    db: AsyncSession = Depends(get_db)
):
    """Verify the code and complete registration or password reset"""
    
    # Find verification record
    result = await db.execute(
        select(EmailVerification).where(
            (EmailVerification.email == req.email) &
            (EmailVerification.purpose == req.purpose)
        )
    )
    verification = result.scalars().first()
    
    if not verification:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No verification code found for this email"
        )
    
    # Check expiration
    if datetime.now(timezone.utc) > verification.expires_at:
        await db.execute(delete(EmailVerification).where(EmailVerification.id == verification.id))
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification code expired"
        )
    
    # Check attempts (max 5)
    if verification.attempts >= 5:
        await db.execute(delete(EmailVerification).where(EmailVerification.id == verification.id))
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed attempts. Please request a new code."
        )
    
    # Verify code
    if hash_code(req.code) != verification.code_hash:
        verification.attempts += 1
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid verification code"
        )
    
    # Code is valid
    if req.purpose == "register":
        # Create new user
        if not req.name or not req.password:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Name and password required for registration"
            )
        
        # Check if email already exists (shouldn't happen but double-check)
        result = await db.execute(select(User).where(User.email == req.email))
        if result.scalars().first():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered"
            )
        
        new_user = User(
            name=req.name,
            email=req.email,
            phone_number=req.phone_number,
            password_hash=hash_password(req.password),
            email_verified=True,
            role="customer"
        )
        db.add(new_user)
        await db.commit()
        await db.refresh(new_user)
        
        # Delete verification record
        await db.execute(delete(EmailVerification).where(EmailVerification.id == verification.id))
        await db.commit()
        
        # Create access token
        access_token = create_access_token(str(new_user.id))
        
        return {
            "message": "Registration successful",
            "user_id": str(new_user.id),
            "access_token": access_token,
            "token_type": "bearer"
        }
    
    elif req.purpose == "reset":
        # Reset password
        if not req.password:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Password required for password reset"
            )
        
        # Find user
        result = await db.execute(select(User).where(User.email == req.email))
        user = result.scalars().first()
        if not user or user.is_deleted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        
        # Update password
        user.password_hash = hash_password(req.password)
        await db.commit()
        
        # Delete verification record
        await db.execute(delete(EmailVerification).where(EmailVerification.id == verification.id))
        await db.commit()
        
        return {"message": "Password reset successful"}


# 3. DELETE ACCOUNT (SOFT DELETE)
# DELETE /users/me/account
async def delete_account(
    req: DeleteAccountRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Soft delete user account (admins cannot be deleted)"""
    
    # Prevent admin deletion
    if current_user.role == "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin accounts cannot be deleted"
        )
    
    # Verify password
    if not verify_password(req.password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid password"
        )
    
    # Soft delete
    current_user.is_deleted = True
    current_user.deleted_at = datetime.now(timezone.utc)
    await db.commit()
    
    return {"message": "Account deleted successfully"}
