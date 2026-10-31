from typing import Literal, Optional
from datetime import datetime, timezone
from fastapi import HTTPException, Depends, status
from pydantic import BaseModel, EmailStr, field_validator
from sqlalchemy import select, func, update, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError
from database import get_db
from models import User, Merchant, MenuItem, Order, RentalBooking
from email_verification import issue_code, check_code, normalize_email
from auth import hash_password, validate_password, verify_password, create_access_token, get_current_user, password_stamp, DELETED_EMAIL_DOMAIN

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

class DeleteCodeRequest(BaseModel):
    password: str

class DeleteAccountRequest(DeleteCodeRequest):
    code: str

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

async def send_delete_code(req, current_user, db):
    if current_user.role == "admin":
        raise HTTPException(403, "Admin accounts cannot be deleted.")
    if not verify_password(req.password, current_user.password_hash):
        raise HTTPException(400, "Incorrect password.")
    await issue_code(db, normalize_email(current_user.email), "delete")
    return {"message": "Deletion code sent to your account email."}


async def delete_account(req, current_user, db):
    if current_user.role == "admin":
        raise HTTPException(403, "Admin accounts cannot be deleted.")
    if not verify_password(req.password, current_user.password_hash):
        raise HTTPException(400, "Incorrect password.")
    merchants = (await db.execute(select(Merchant).where(Merchant.user_id == current_user.id))).scalars().all()
    ids = [m.id for m in merchants]
    involved = Order.customer_id == current_user.id
    if ids:
        involved = or_(involved, Order.merchant_id.in_(ids))
    active = (await db.execute(select(func.count(Order.id)).where(
        involved, Order.status.in_(["pending", "pending_verification", "preparing", "ready"])
    ))).scalar_one()
    if active:
        raise HTTPException(400, "Finish or resolve your active orders before deleting your account.")
    await check_code(db, normalize_email(current_user.email), "delete", req.code.strip())
    if ids:
        await db.execute(update(Merchant).where(Merchant.id.in_(ids)).values(is_active=False))
        await db.execute(update(MenuItem).where(MenuItem.merchant_id.in_(ids)).values(is_available=False))
    await db.execute(update(RentalBooking).where(
        RentalBooking.vendor_user_id == current_user.id,
        RentalBooking.status.in_(["pending", "approved"])
    ).values(status="cancelled"))
    current_user.is_deleted = True
    current_user.deleted_at = datetime.now(timezone.utc)
    current_user.name = "Deleted User"
    current_user.email = f"deleted-{current_user.id}@{DELETED_EMAIL_DOMAIN}"
    current_user.phone_number = None
    await db.commit()
    return {"message": "Account deleted successfully"}
