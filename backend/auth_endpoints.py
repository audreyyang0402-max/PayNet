from typing import Literal, Optional
from datetime import datetime, timezone
from fastapi import HTTPException, Depends, status
from pydantic import BaseModel, EmailStr, field_validator
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError
from database import get_db
from models import User, Merchant
from email_verification import issue_code, check_code, normalize_email
from auth import hash_password, validate_password, verify_password, create_access_token, get_current_user, password_stamp

class EmailRequest(BaseModel):
    email: EmailStr
    @field_validator("email", mode="before")
    @classmethod
    def clean_email(cls, value):
        return normalize_email(value)

class SendVerificationRequest(EmailRequest):
    purpose: Literal["register", "reset"] = "register"

class VerifyCodeRequest(SendVerificationRequest):
    code: str
    password: str
    name: Optional[str] = None
    phone_number: Optional[str] = None
    account_type: Literal["customer", "merchant", "popup"] = "customer"
    store_name: Optional[str] = None
    location: Optional[str] = None

class DeleteAccountRequest(BaseModel):
    password: str

async def find_user(db, email):
    return (await db.execute(select(User).where(func.lower(func.trim(User.email)) == normalize_email(email)))).scalars().first()

async def send_verification(req, db):
    user = await find_user(db, req.email)
    if req.purpose == "register" and user:
        raise HTTPException(400, "Email already registered. Please log in or reset your password.")
    if req.purpose == "reset" and (not user or user.is_deleted):
        return {"message": "If this account exists, a verification code has been sent."}
    await issue_code(db, req.email, req.purpose)
    return {"message": "If this account is eligible, a verification code has been sent."}

async def verify_code(req, db):
    validate_password(req.password)
    if req.purpose == "register":
        if not req.name or not req.name.strip():
            raise HTTPException(400, "Name is required.")
        if req.account_type == "merchant" and not (req.store_name or "").strip():
            raise HTTPException(400, "Store name is required.")
    await check_code(db, req.email, req.purpose, req.code.strip())
    user = await find_user(db, req.email)
    if req.purpose == "register":
        if user:
            raise HTTPException(400, "Email already registered.")
        user = User(name=req.name.strip(), email=req.email, phone_number=req.phone_number,
                    password_hash=hash_password(req.password), email_verified=True,
                    role="customer" if req.account_type == "customer" else "merchant")
        db.add(user)
        await db.flush()
        if req.account_type == "merchant":
            db.add(Merchant(user_id=user.id, name=req.store_name.strip(), location=req.location))
    else:
        if not user or user.is_deleted:
            raise HTTPException(400, "Unable to reset this account.")
        user.password_hash = hash_password(req.password)
        user.email_verified = True
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(409, "Account already exists. Please log in.") from None
    if req.purpose == "reset":
        return {"message": "Password reset successful. Please log in again."}
    token = create_access_token({"sub": str(user.id), "role": user.role, "email": user.email, "pwd": password_stamp(user.password_hash)})
    return {"message": "Registration successful", "access_token": token, "token_type": "bearer",
            "user_id": str(user.id), "role": user.role, "name": user.name}

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
