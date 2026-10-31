import os
import logging
import secrets
from datetime import datetime, date, timedelta, timezone
import httpx as httpx_client  # aliased since you might already have httpx elsewhere
from fastapi import UploadFile, File, Form, HTTPException
import shutil

from fastapi_offline import FastAPIOffline
from fastapi import FastAPI, Depends, Query, status
from fastapi.staticfiles import StaticFiles  # <--- Added import for serving static upload files
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import case, func, or_, update
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload  # <--- Added import for eager loading relationships
from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional, Literal
from uuid import UUID

# --- NEW SUPABASE STORAGE IMPORTS ---
from supabase import create_client, Client

from database import engine, get_db
from models import Base, User, Merchant, MenuItem, PickupSlot, Order, OrderItem, BoulevardStall, RentalBooking, Event, EventMerchant

# --- NEW AUTH IMPORTS ---
from auth import hash_password, verify_password, create_access_token, get_current_user, DELETED_EMAIL_DOMAIN, validate_password, password_stamp
from email_verification import check_code, normalize_email
from email_service import send_order_ready_email

logger = logging.getLogger(__name__)

from auth_endpoints import (
    SendVerificationRequest,
    VerifyCodeRequest,
    DeleteAccountRequest,
    send_verification,
    verify_code,
    delete_account,
)


from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPIOffline):
    # Tables are already securely generated in Supabase.
    # Leaving this clear blocks pooler timeouts during fast reloads.
    yield

app = FastAPIOffline(lifespan=lifespan)

# --- MOUNT STATIC UPLOADS DIRECTORY ---
# Fresh deployments may not contain this runtime-created directory.
os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# --- SUPABASE STORAGE CONFIGURATION ---
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") # Service role key to bypass RLS for uploads
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY) if SUPABASE_URL and SUPABASE_KEY else None

async def upload_to_supabase(file: UploadFile) -> str:
    """Helper function to upload files directly to Supabase Storage and return the public URL safely."""
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase Storage client is not configured on the backend.")
    try:
        file_bytes = await file.read()
        file_ext = file.filename.split(".")[-1] if file.filename and "." in file.filename else "png"
        file_name = f"{os.urandom(12).hex()}.{file_ext}"
        file_path = f"images/{file_name}"

        # Upload bytes to Supabase Storage bucket named 'uploads' with upsert enabled
        response = supabase.storage.from_("uploads").upload(
            path=file_path,
            file=file_bytes,
            file_options={"content-type": file.content_type or "image/png", "upsert": "true"}
        )

        # Get the public URL safely handling both string and dictionary returns
        public_url_res = supabase.storage.from_("uploads").get_public_url(file_path)
        
        if isinstance(public_url_res, dict):
            public_url = public_url_res.get("publicUrl") or public_url_res.get("data", {}).get("publicUrl")
        else:
            public_url = str(public_url_res)

        if not public_url:
            raise HTTPException(status_code=500, detail="Failed to generate public URL from Supabase.")

        return public_url
    except Exception as e:
        print(f"CRITICAL SUPABASE UPLOAD ERROR: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Supabase upload failed: {str(e)}")


# --- NEW CORS CONFIGURATION ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        origin.strip().rstrip("/")
        for origin in os.getenv(
            "CORS_ALLOWED_ORIGINS",
            "http://localhost:3000,http://localhost:5000,http://127.0.0.1:3000,https://pay-net-iota.vercel.app,https://payvolution.app,https://www.payvolution.app"
        ).split(",") if origin.strip()
    ], 
    allow_credentials=True, 
    allow_methods=["*"], 
    allow_headers=["*"], 
)

# Pydantic Schemas for validation
class UserCreate(BaseModel):
    name: str
    phone_number: str | None = None
    email: EmailStr
    password: str  # UPDATED: Changed from password_hash since client sends plain text
    verification_code: str  # 6-digit code emailed via /auth/send-code
    role: str = "customer"

# NEW: Schema for updating user profile
class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    phone_number: Optional[str] = None
    password: Optional[str] = None

# NEW: Schema for updating merchant profile & store details
class MerchantProfileUpdate(BaseModel):
    email: Optional[EmailStr] = None
    phone_number: Optional[str] = None
    password: Optional[str] = None
    store_name: Optional[str] = None
    description: Optional[str] = None
    location: Optional[str] = None

# NEW: Schemas for handling login and token generation
class MerchantRegisterRequest(BaseModel):
    name: str
    email: EmailStr
    password: str
    store_name: str
    location: Optional[str] = None
    description: Optional[str] = None
    verification_code: str  # 6-digit code emailed via /auth/send-code
    role: str = "merchant"

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    role: str
    name: str

class MerchantCreate(BaseModel):
    user_id: UUID
    name: str
    description: Optional[str] = None
    location: Optional[str] = None

class MenuItemCreate(BaseModel):
    name: str
    description: Optional[str] = None
    price: float
    image_url: Optional[str] = None
    is_available: bool = True

class OrderItemCreate(BaseModel):
    menu_item_id: UUID
    quantity: int = Field(default=1, ge=1)

class OrderCreate(BaseModel):
    merchant_id: UUID
    pickup_slot_id: UUID
    items: List[OrderItemCreate]

class PickupSlotCreate(BaseModel):
    time_slot: datetime
    max_capacity: int = 10

class ForgotPasswordRequest(BaseModel):
    email: str
    new_password: str
    verification_code: str  # 6-digit code emailed via /auth/send-code

class SendCodeRequest(BaseModel):
    email: EmailStr
    purpose: Literal["register", "reset"]

class DeleteAccountRequest(BaseModel):
    password: str  # re-enter password to confirm deletion

# NEW: Schemas for Boulevard Rental Bookings
class RentalBookingCreate(BaseModel):
    stall_id: UUID
    start_date: date
    end_date: date

class RentalStatusUpdate(BaseModel):
    status: str  # e.g., "approved", "rejected"


class OrderStatusUpdate(BaseModel):
    status: Literal["pending_verification", "pending", "preparing", "ready", "completed"]


# NEW: Schemas for Events
class EventCreate(BaseModel):
    name: str
    description: Optional[str] = None
    location: str
    event_date: date
    start_time: datetime
    end_time: datetime
    banner_image_url: Optional[str] = None
    merchant_ids: List[UUID] = []

class EventMerchantAdd(BaseModel):
    merchant_id: UUID
    stall_number: Optional[str] = None

class RoleUpdateRequest(BaseModel):
    role: Literal["admin", "merchant", "customer"]


# --- ROUTES ---

@app.get("/")
def read_root():
    return {"message": "Click & Collect API is running"}


# --- PHASE 5: RECOMMENDATION ROUTE ---
@app.get("/recommendations/items")
async def get_recommended_items(
    limit: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db)
):
    # Public aggregate counts only: never expose individual customer/order data.
    quantity = func.sum(OrderItem.quantity)
    result = await db.execute(
        select(MenuItem.id, quantity.label("quantity"))
        .join(OrderItem, OrderItem.menu_item_id == MenuItem.id)
        .join(Order, Order.id == OrderItem.order_id)
        .join(Merchant, Merchant.id == MenuItem.merchant_id)
        .where(Order.status == "completed", Order.created_at >= datetime.now(timezone.utc) - timedelta(days=30),
               MenuItem.is_available == True, MenuItem.price > 0,
               MenuItem.image_url.isnot(None), func.length(func.trim(MenuItem.image_url)) > 0,
               Merchant.is_active == True)
        .group_by(MenuItem.id).order_by(quantity.desc(), MenuItem.id).limit(limit)
    )
    return [{"id": str(row.id), "quantity": int(row.quantity)} for row in result]



# 1. Route to create a user first (Merchants need a user_id)
@app.post("/users", response_model=dict)
async def create_user(user_data: UserCreate, db: AsyncSession = Depends(get_db)):
    existing_user = await db.execute(select(User).where(func.lower(func.trim(User.email)) == normalize_email(user_data.email)))
    if existing_user.scalars().first():
        raise HTTPException(status_code=400, detail="Email already registered.")
    validate_password(user_data.password)
    user_data.email = normalize_email(user_data.email)
    await check_code(db, user_data.email, "register", user_data.verification_code)

    new_user = User(
        name=user_data.name,
        email=user_data.email,
        phone_number=user_data.phone_number,
        password_hash=hash_password(user_data.password),
        role="customer",
        email_verified=True
    )
    db.add(new_user)
    try:
        await db.commit()
        await db.refresh(new_user)
        return {"id": str(new_user.id), "name": new_user.name, "email": new_user.email, "role": new_user.role}
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=f"Database error details: {str(e)}")


@app.patch("/users/me")
async def update_my_profile(
    update_data: UserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if update_data.email is not None and normalize_email(update_data.email) != normalize_email(current_user.email):
        raise HTTPException(400, "Changing the account email is not available here. Please contact support.")
    if update_data.email is not None:
        existing = await db.execute(select(User).where(User.email == update_data.email))
        user_with_email = existing.scalars().first()
        if user_with_email and user_with_email.id != current_user.id:
            raise HTTPException(status_code=400, detail="Email is already in use.")
        current_user.email = update_data.email

    if update_data.phone_number is not None:
        current_user.phone_number = update_data.phone_number

    if update_data.password is not None and update_data.password.strip() != "":
        raise HTTPException(400, "Use the email verification password-reset page to change your password.")

    try:
        await db.commit()
        await db.refresh(current_user)
        return {
            "message": "Profile updated successfully",
            "name": current_user.name,
            "email": current_user.email,
            "phone_number": current_user.phone_number,
            "role": current_user.role
        }
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=f"Database error details: {str(e)}")


@app.delete("/users/me")
async def delete_my_account(
    payload: DeleteAccountRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role == "admin":
        raise HTTPException(status_code=403, detail="Admin accounts cannot be deleted.")
    if not verify_password(payload.password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Incorrect password.")

    merchant_result = await db.execute(select(Merchant).where(Merchant.user_id == current_user.id))
    merchant_ids = [m.id for m in merchant_result.scalars().all()]

    involved = Order.customer_id == current_user.id
    if merchant_ids:
        involved = or_(involved, Order.merchant_id.in_(merchant_ids))
    active_count = (await db.execute(
        select(func.count(Order.id)).where(involved, Order.status.in_(["preparing", "ready"]))
    )).scalar_one()
    if active_count:
        raise HTTPException(
            status_code=400,
            detail=f"You still have {active_count} order(s) being prepared or waiting for pickup. Please finish them first."
        )

    if merchant_ids:
        await db.execute(update(Merchant).where(Merchant.id.in_(merchant_ids)).values(is_active=False))
        await db.execute(update(MenuItem).where(MenuItem.merchant_id.in_(merchant_ids)).values(is_available=False))

    await db.execute(
        update(RentalBooking)
        .where(RentalBooking.vendor_user_id == current_user.id, RentalBooking.status.in_(["pending", "approved"]))
        .values(status="cancelled")
    )

    current_user.name = "Deleted User"
    current_user.email = f"deleted-{current_user.id}@{DELETED_EMAIL_DOMAIN}"
    current_user.phone_number = None
    current_user.password_hash = hash_password(secrets.token_urlsafe(32))

    try:
        await db.commit()
        return {"message": "Account deleted successfully."}
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=f"Database error details: {str(e)}")


# --- NEW: Specific API Endpoint for Frontend Profile Deletion ---
@app.delete("/api/users/me")
async def delete_my_account_api(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role == "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrators cannot delete accounts through this endpoint."
        )
    
    try:
        # Check active orders first
        merchant_result = await db.execute(select(Merchant).where(Merchant.user_id == current_user.id))
        merchant_ids = [m.id for m in merchant_result.scalars().all()]

        involved = Order.customer_id == current_user.id
        if merchant_ids:
            involved = or_(involved, Order.merchant_id.in_(merchant_ids))
        
        active_count = (await db.execute(
            select(func.count(Order.id)).where(involved, Order.status.in_(["preparing", "ready"]))
        )).scalar_one()
        
        if active_count:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"You still have {active_count} order(s) being prepared or waiting for pickup."
            )

        if merchant_ids:
            await db.execute(update(Merchant).where(Merchant.id.in_(merchant_ids)).values(is_active=False))
            await db.execute(update(MenuItem).where(MenuItem.merchant_id.in_(merchant_ids)).values(is_available=False))

        # Cancel pending/approved rental bookings safely
        await db.execute(
            update(RentalBooking)
            .where(RentalBooking.vendor_user_id == current_user.id, RentalBooking.status.in_(["pending", "approved"]))
            .values(status="cancelled")
        )

        # Soft delete / anonymize user data to avoid foreign key constraint crashes
        current_user.name = "Deleted User"
        current_user.email = f"deleted-{current_user.id}@{DELETED_EMAIL_DOMAIN}"
        current_user.phone_number = None
        current_user.password_hash = hash_password(secrets.token_urlsafe(32))

        await db.commit()
        
        return {"status": "success", "message": "Account successfully deleted."}
    except HTTPException as he:
        raise he
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete account: {str(e)}"
        )


# --- NEW: Admin Delete User Endpoint (Updated to clean up Rental Bookings & Merchants) ---
@app.delete("/admin/users/{user_id}")
async def admin_delete_user(
    user_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required."
        )
    
    target_user = await db.get(User, user_id)
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found."
        )

    if target_user.role == "admin":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Administrator accounts cannot be deleted."
        )

    try:
        # 1. Delete dependent rental bookings first
        await db.execute(
            RentalBooking.__table__.delete().where(RentalBooking.vendor_user_id == target_user.id)
        )

        # 2. Deactivate menu items and explicitly delete merchant records to avoid foreign key violations
        merchant_result = await db.execute(select(Merchant).where(Merchant.user_id == target_user.id))
        merchant_ids = [m.id for m in merchant_result.scalars().all()]

        if merchant_ids:
            await db.execute(update(MenuItem).where(MenuItem.merchant_id.in_(merchant_ids)).values(is_available=False))
            await db.execute(Merchant.__table__.delete().where(Merchant.user_id == target_user.id))

        # 3. Finally delete the user
        await db.delete(target_user)
        await db.commit()
        return {"status": "success", "message": "User deleted successfully."}
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete user: {str(e)}"
        )


# --- NEW: Admin Update User Role Endpoint ---
@app.put("/admin/users/{user_id}/role")
async def update_user_role(
    user_id: UUID,
    payload: RoleUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required."
        )
    
    target_user = await db.get(User, user_id)
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found."
        )

    target_user.role = payload.role

    if payload.role == "merchant":
        merchant_check = await db.execute(select(Merchant).where(Merchant.user_id == target_user.id))
        if not merchant_check.scalars().first():
            new_merchant = Merchant(
                user_id=target_user.id,
                name=f"{target_user.name}'s Store",
                description="Campus Merchant",
                location="Sunway Campus"
            )
            db.add(new_merchant)

    try:
        await db.commit()
        await db.refresh(target_user)
        return {"status": "success", "message": "User role updated successfully.", "role": target_user.role}
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update user role: {str(e)}"
        )


@app.patch("/merchants/me")
async def update_my_merchant_profile(
    update_data: MerchantProfileUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "merchant":
        raise HTTPException(status_code=403, detail="Access denied. User is not a merchant.")

    if update_data.email is not None and normalize_email(update_data.email) != normalize_email(current_user.email):
        raise HTTPException(400, "Changing the account email is not available here. Please contact support.")
    if update_data.email is not None:
        existing = await db.execute(select(User).where(User.email == update_data.email))
        user_with_email = existing.scalars().first()
        if user_with_email and user_with_email.id != current_user.id:
            raise HTTPException(status_code=400, detail="Email is already in use.")
        current_user.email = update_data.email

    if update_data.phone_number is not None:
        current_user.phone_number = update_data.phone_number

    if update_data.password is not None and update_data.password.strip() != "":
        raise HTTPException(400, "Use the email verification password-reset page to change your password.")

    result = await db.execute(select(Merchant).where(Merchant.user_id == current_user.id))
    merchant = result.scalars().first()
    
    if merchant:
        if update_data.store_name is not None:
            merchant.name = update_data.store_name
        if update_data.description is not None:
            merchant.description = update_data.description
        if update_data.location is not None:
            merchant.location = update_data.location

    try:
        await db.commit()
        await db.refresh(current_user)
        if merchant:
            await db.refresh(merchant)
            
        return {
            "message": "Merchant profile updated successfully",
            "name": current_user.name,
            "email": current_user.email,
            "phone_number": current_user.phone_number,
            "store_name": merchant.name if merchant else None,
            "description": merchant.description if merchant else None,
            "location": merchant.location if merchant else None
        }
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=f"Database error details: {str(e)}")


@app.patch("/merchants/me/qr-upload")
async def upload_merchant_qr(
    qr_file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "merchant":
        raise HTTPException(status_code=403, detail="Access denied. Merchant privileges required.")
    
    result = await db.execute(select(Merchant).where(Merchant.user_id == current_user.id))
    merchant = result.scalars().first()
    if not merchant:
        raise HTTPException(status_code=404, detail="Merchant profile not found.")

    # Upload directly to Supabase Storage bucket for permanent cloud storage
    public_url = await upload_to_supabase(qr_file)

    merchant.duitnow_qr_url = public_url
    try:
        await db.commit()
        await db.refresh(merchant)
        return {"message": "DuitNow QR uploaded successfully", "duitnow_qr_url": merchant.duitnow_qr_url}
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=f"Database error details: {str(e)}")


@app.post("/auth/send-code")
async def send_verification_code(payload: SendCodeRequest, db: AsyncSession = Depends(get_db)):
    return await send_verification(SendVerificationRequest(email=payload.email, purpose=payload.purpose), db)


@app.post("/auth/forgot-password")
async def forgot_password(payload: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    return await verify_code(VerifyCodeRequest(email=payload.email, purpose="reset", code=payload.verification_code, password=payload.new_password), db)


@app.post("/auth/register-merchant", response_model=dict)
async def register_merchant(data: MerchantRegisterRequest, db: AsyncSession = Depends(get_db)):
    existing_user = await db.execute(select(User).where(func.lower(func.trim(User.email)) == normalize_email(data.email)))
    if existing_user.scalars().first():
        raise HTTPException(status_code=400, detail="Email already registered.")
    validate_password(data.password)
    data.email = normalize_email(data.email)
    await check_code(db, data.email, "register", data.verification_code)

    new_user = User(
        name=data.name,
        email=data.email,
        password_hash=hash_password(data.password),
        role="merchant",
        email_verified=True
    )
    db.add(new_user)
    await db.flush() 

    new_merchant = Merchant(
        user_id=new_user.id,
        name=data.store_name,
        location=data.location,
        description=data.description
    )
    db.add(new_merchant)

    try:
        await db.commit()
        await db.refresh(new_user)
        return {
            "id": str(new_user.id),
            "name": new_user.name,
            "email": new_user.email,
            "role": new_user.role
        }
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=f"Database error details: {str(e)}")


@app.get("/merchants/me/profile")
async def get_my_merchant_profile(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "merchant":
        raise HTTPException(status_code=403, detail="Access denied. User is not a merchant.")
    
    result = await db.execute(select(Merchant).where(Merchant.user_id == current_user.id))
    merchant = result.scalars().first()
    
    if not merchant:
        raise HTTPException(status_code=404, detail="No merchant profile found for this user.")
        
    return merchant


@app.post("/auth/login", response_model=TokenResponse)
async def login(login_data: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(func.lower(func.trim(User.email)) == normalize_email(login_data.email)))
    user = result.scalars().first()

    if not user or user.is_deleted or not verify_password(login_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = create_access_token(
        data={"sub": str(user.id), "role": user.role, "email": user.email, "pwd": password_stamp(user.password_hash)}
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user_id": str(user.id),
        "role": user.role,
        "name": user.name
    }


@app.get("/auth/me")
async def get_me(current_user: User = Depends(get_current_user)):
    return {
        "id": str(current_user.id),
        "name": current_user.name,
        "email": current_user.email,
        "phone_number": current_user.phone_number,
        "role": current_user.role,
    }


@app.post("/auth/send-verification")
async def send_verification_endpoint(req: SendVerificationRequest, db: AsyncSession = Depends(get_db)):
    return await send_verification(req, db)


@app.post("/auth/verify-code")
async def verify_code_endpoint(req: VerifyCodeRequest, db: AsyncSession = Depends(get_db)):
    return await verify_code(req, db)


@app.delete("/users/me/account")
async def delete_account_endpoint(req: DeleteAccountRequest, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await delete_account(req, current_user, db)


async def build_order_analytics(db: AsyncSession, days: int, merchant_id: UUID | None = None, customer_id: UUID | None = None):
    now = datetime.now(timezone.utc)
    start = now.astimezone(timezone(timedelta(hours=8))).replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=days - 1)
    filters = [Order.created_at >= start, Order.created_at <= now]
    if merchant_id is not None:
        filters.append(Order.merchant_id == merchant_id)
    if customer_id is not None:
        filters.append(Order.customer_id == customer_id)

    summary_result = await db.execute(
        select(
            func.count(Order.id),
            func.sum(case((Order.status == "completed", 1), else_=0)),
            func.coalesce(func.sum(case((Order.status == "completed", Order.total_price), else_=0)), 0),
            func.count(func.distinct(Order.customer_id)),
        ).where(*filters)
    )
    total_orders, completed_orders, revenue, customers = summary_result.one()
    active_filters = [Order.status.in_(["pending_verification", "pending", "preparing", "ready"])]
    if merchant_id is not None:
        active_filters.append(Order.merchant_id == merchant_id)
    if customer_id is not None:
        active_filters.append(Order.customer_id == customer_id)
    active_result = await db.execute(select(func.count(Order.id)).where(*active_filters))
    active_orders = active_result.scalar_one()

    day_expr = func.date(func.timezone("Asia/Kuala_Lumpur", Order.created_at))
    trend_result = await db.execute(
        select(
            day_expr.label("day"),
            func.count(Order.id).label("orders"),
            func.coalesce(func.sum(case((Order.status == "completed", Order.total_price), else_=0)), 0).label("revenue"),
        ).where(*filters).group_by(day_expr).order_by(day_expr)
    )
    trend_by_day = {
        row.day.isoformat(): {"orders": int(row.orders), "revenue": round(float(row.revenue), 2)}
        for row in trend_result
    }
    trends = []
    for offset in range(days):
        day = (start.date() + timedelta(days=offset)).isoformat()
        values = trend_by_day.get(day, {"orders": 0, "revenue": 0.0})
        trends.append({"date": day, **values})

    item_filters = [Order.created_at >= start, Order.created_at <= now, Order.status == "completed"]
    if merchant_id is not None:
        item_filters.append(Order.merchant_id == merchant_id)
        item_filters.append(MenuItem.merchant_id == merchant_id)
    if customer_id is not None:
        item_filters.append(Order.customer_id == customer_id)
    item_result = await db.execute(
        select(
            MenuItem.id,
            MenuItem.name,
            func.sum(OrderItem.quantity).label("quantity"),
            func.sum(OrderItem.quantity * OrderItem.price_at_order).label("revenue"),
        ).join(OrderItem, OrderItem.menu_item_id == MenuItem.id)
        .join(Order, Order.id == OrderItem.order_id)
        .where(*item_filters).group_by(MenuItem.id, MenuItem.name)
        .order_by(func.sum(OrderItem.quantity).desc()).limit(5)
    )
    top_items = [
        {"id": str(row.id), "name": row.name, "quantity": int(row.quantity), "revenue": round(float(row.revenue or 0), 2)}
        for row in item_result
    ]
    return {
        "period_days": days,
        "summary": {
            "total_revenue": round(float(revenue or 0), 2),
            "total_orders": int(total_orders or 0),
            "completed_orders": int(completed_orders or 0),
            "active_orders": int(active_orders or 0),
            "customers": int(customers or 0),
        },
        "revenue_trend": trends,
        "top_items": top_items,
    }


@app.get("/admin/analytics")
async def get_admin_analytics(days: int = Query(default=30, ge=7, le=90), db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin privileges required.")
    return await build_order_analytics(db, days)


@app.get("/merchants/me/analytics")
async def get_merchant_analytics(days: int = Query(default=30, ge=7, le=90), db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "merchant":
        raise HTTPException(status_code=403, detail="Merchant privileges required.")
    merchant_result = await db.execute(select(Merchant).where(Merchant.user_id == current_user.id))
    merchant = merchant_result.scalars().first()
    if not merchant:
        raise HTTPException(status_code=404, detail="No merchant profile found for this user.")
    return await build_order_analytics(db, days, merchant.id)


@app.get("/users/me/analytics")
async def get_customer_analytics(days: int = Query(default=30, ge=7, le=90), db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "customer":
        raise HTTPException(status_code=403, detail="Customer privileges required.")
    from customer_analytics import build_customer_analytics
    return await build_customer_analytics(db, current_user.id, days)


@app.post("/merchants")
async def create_merchant(merchant_data: MerchantCreate, db: AsyncSession = Depends(get_db)):
    user_check = await db.get(User, merchant_data.user_id)
    if not user_check:
        raise HTTPException(status_code=404, detail="Associated User ID not found.")

    new_merchant = Merchant(
        user_id=merchant_data.user_id,
        name=merchant_data.name,
        description=merchant_data.description,
        location=merchant_data.location
    )
    db.add(new_merchant)
    await db.commit()
    await db.refresh(new_merchant)
    return new_merchant


@app.get("/merchants")
async def list_merchants(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Merchant).where(Merchant.is_active.is_not(False)))
    return result.scalars().all()


@app.get("/merchants/{merchant_id}")
async def get_merchant_details(merchant_id: UUID, db: AsyncSession = Depends(get_db)):
    merchant = await db.get(Merchant, merchant_id)
    if not merchant:
        raise HTTPException(status_code=404, detail="Merchant not found.")
    return {
        "id": str(merchant.id),
        "name": merchant.name,
        "location": merchant.location,
        "description": merchant.description,
        "duitnow_qr_url": getattr(merchant, "duitnow_qr_url", None)
    }


@app.post("/merchants/{merchant_id}/items")
async def create_menu_item(merchant_id: UUID, item_data: MenuItemCreate, db: AsyncSession = Depends(get_db)):
    merchant_check = await db.get(Merchant, merchant_id)
    if not merchant_check:
        raise HTTPException(status_code=404, detail="Merchant not found.")

    new_item = MenuItem(
        merchant_id=merchant_id,
        name=item_data.name,
        description=item_data.description,
        price=item_data.price,
        image_url=item_data.image_url,
        is_available=item_data.is_available
    )
    db.add(new_item)
    try:
        await db.commit()
        await db.refresh(new_item)
        return new_item
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=f"Database error details: {str(e)}")


@app.put("/merchants/items/{item_id}")
async def update_menu_item(item_id: UUID, item_data: MenuItemCreate, db: AsyncSession = Depends(get_db)):
    item = await db.get(MenuItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Menu item not found.")
    
    item.name = item_data.name
    item.description = item_data.description
    item.price = item_data.price
    item.image_url = item_data.image_url
    item.is_available = item_data.is_available

    try:
        await db.commit()
        await db.refresh(item)
        return item
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=f"Database error details: {str(e)}")


@app.delete("/merchants/items/{item_id}")
async def delete_menu_item(item_id: UUID, db: AsyncSession = Depends(get_db)):
    item = await db.get(MenuItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Menu item not found.")
    
    try:
        await db.delete(item)
        await db.commit()
        return {"message": "Menu item deleted successfully"}
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=f"Database error details: {str(e)}")


@app.post("/merchants/{merchant_id}/pickup-slots")
async def create_pickup_slot(merchant_id: UUID, slot_data: PickupSlotCreate, db: AsyncSession = Depends(get_db)):
    merchant_check = await db.get(Merchant, merchant_id)
    if not merchant_check:
        raise HTTPException(status_code=404, detail="Merchant not found.")

    new_slot = PickupSlot(
        merchant_id=merchant_id,
        time_slot=slot_data.time_slot,
        max_capacity=slot_data.max_capacity
    )
    db.add(new_slot)
    try:
        await db.commit()
        await db.refresh(new_slot)
        return new_slot
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=f"Database error details: {str(e)}")


@app.get("/merchants/{merchant_id}/pickup-slots")
async def list_pickup_slots(merchant_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(PickupSlot).where(PickupSlot.merchant_id == merchant_id))
    return result.scalars().all()


@app.delete("/merchants/pickup-slots/{slot_id}")
async def delete_pickup_slot(slot_id: UUID, db: AsyncSession = Depends(get_db)):
    slot = await db.get(PickupSlot, slot_id)
    if not slot:
        raise HTTPException(status_code=404, detail="Pickup slot not found.")
    
    try:
        await db.delete(slot)
        await db.commit()
        return {"message": "Pickup slot deleted successfully"}
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=f"Database error details: {str(e)}")


@app.get("/merchants/{merchant_id}/items")
async def list_menu_items(merchant_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(MenuItem).where(MenuItem.merchant_id == merchant_id))
    return result.scalars().all()


@app.post("/orders")
async def create_order(
    order_data: OrderCreate, 
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    slot = await db.get(PickupSlot, order_data.pickup_slot_id)
    if not slot:
        raise HTTPException(status_code=404, detail="Pickup slot not found.")
    if slot.merchant_id != order_data.merchant_id:
        raise HTTPException(status_code=400, detail="Pickup slot does not belong to this merchant.")
    if slot.current_bookings >= slot.max_capacity:
        raise HTTPException(status_code=400, detail="This pickup slot is fully booked.")

    total_price = 0
    line_items = []
    for line in order_data.items:
        item = await db.get(MenuItem, line.menu_item_id)
        if not item:
            raise HTTPException(status_code=404, detail=f"Menu item {line.menu_item_id} not found.")
        if item.merchant_id != order_data.merchant_id:
            raise HTTPException(status_code=400, detail="Menu item does not belong to this merchant.")
        if not item.is_available:
            raise HTTPException(status_code=400, detail=f"'{item.name}' is currently unavailable.")
        line_total = float(item.price) * line.quantity
        total_price += line_total
        line_items.append((item, line.quantity))

    order_number = f"#EX-{datetime.now().strftime('%H%M%S')}"

    new_order = Order(
        customer_id=current_user.id,
        merchant_id=order_data.merchant_id,
        pickup_slot_id=order_data.pickup_slot_id,
        order_number=order_number,
        status="pending_verification",
        total_price=total_price,
        transaction_ref=None
    )
    db.add(new_order)

    try:
        await db.flush()
        for item, quantity in line_items:
            db.add(OrderItem(
                order_id=new_order.id,
                menu_item_id=item.id,
                quantity=quantity,
                price_at_order=item.price
            ))
        slot.current_bookings += 1
        await db.commit()
        await db.refresh(new_order)
        return new_order
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=f"Database error details: {str(e)}")


@app.patch("/orders/{order_id}/submit-receipt")
async def submit_order_receipt(
    order_id: UUID,
    receipt_file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    order = await db.get(Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found.")
    if order.customer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied. You do not own this order.")

    # Upload directly to Supabase Storage bucket for permanent cloud storage
    public_url = await upload_to_supabase(receipt_file)

    order.transaction_ref = public_url
    order.status = "pending_verification"

    try:
        await db.commit()
        await db.refresh(order)
        return {
            "message": "Payment receipt screenshot submitted successfully.",
            "order_number": order.order_number,
            "status": order.status,
            "receipt_url": order.transaction_ref
        }
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=f"Database error details: {str(e)}")


@app.get("/orders/{order_id}")
async def get_order(order_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Order)
        .where(Order.id == order_id)
        .options(selectinload(Order.items).selectinload(OrderItem.menu_item))
    )
    order = result.scalars().first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found.")
    
    items_data = [
        {
            "id": str(item.id),
            "name": item.menu_item.name if item.menu_item else "Unknown Dish",
            "quantity": item.quantity,
            "price_at_order": float(item.price_at_order)
        }
        for item in order.items
    ]
    
    return {
        "id": str(order.id),
        "merchant_id": str(order.merchant_id),
        "status": order.status,
        "total_price": float(order.total_price),
        "created_at": order.created_at.isoformat() if order.created_at else None,
        "items": items_data
    }


@app.get("/users/me/orders")
async def list_customer_orders(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(
        select(Order)
        .where(Order.customer_id == current_user.id)
        .options(selectinload(Order.items).selectinload(OrderItem.menu_item))
        .order_by(Order.created_at.desc())
    )
    orders = result.scalars().all()
    
    response = []
    for order in orders:
        items_data = [
            {
                "id": str(item.id),
                "name": item.menu_item.name if item.menu_item else "Dish",
                "quantity": item.quantity,
                "price_at_order": float(item.price_at_order)
            }
            for item in order.items
        ]
        response.append({
            "id": str(order.id),
            "merchant_id": str(order.merchant_id),
            "status": order.status,
            "total_price": float(order.total_price),
            "created_at": order.created_at.isoformat() if order.created_at else None,
            "items": items_data
        })
    return response


@app.get("/merchants/{merchant_id}/orders")
async def list_merchant_orders(merchant_id: UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    merchant = await db.get(Merchant, merchant_id)
    if not merchant or (current_user.role != "admin" and (current_user.role != "merchant" or merchant.user_id != current_user.id)):
        raise HTTPException(status_code=403, detail="Access denied.")
    result = await db.execute(
        select(Order)
        .where(Order.merchant_id == merchant_id)
        .options(
            selectinload(Order.items).selectinload(OrderItem.menu_item),
            selectinload(Order.customer)
        )
        .order_by(Order.created_at.desc())
    )
    orders = result.scalars().all()
    
    response = []
    for order in orders:
        items_data = [
            {
                "id": str(item.id),
                "name": item.menu_item.name if item.menu_item else "Dish",
                "quantity": item.quantity,
                "price_at_order": float(item.price_at_order)
            }
            for item in order.items
        ]
        response.append({
            "id": str(order.id),
            "customer_id": str(order.customer_id),
            "customer_name": order.customer.name if order.customer else "Customer",
            "status": order.status,
            "total_price": float(order.total_price),
            "created_at": order.created_at.isoformat() if order.created_at else None,
            "transaction_ref": getattr(order, "transaction_ref", None),
            "order_number": getattr(order, "order_number", None),
            "items": items_data
        })
    return response


@app.patch("/orders/{order_id}/status")
async def update_order_status(
    order_id: UUID,
    status_update: OrderStatusUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    order = await db.get(Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found.")

    if current_user.role != "merchant":
        raise HTTPException(status_code=403, detail="Only merchants can update order status.")
    merchant_result = await db.execute(
        select(Merchant).where(
            Merchant.id == order.merchant_id,
            Merchant.user_id == current_user.id,
        )
    )
    merchant = merchant_result.scalars().first()
    if not merchant:
        raise HTTPException(status_code=403, detail="You can only update orders for your own merchant account.")
    
    order.status = status_update.status
    try:
        await db.commit()

        # ── Send "food is ready" email when merchant marks order ready ──
        if status_update.status == "ready":
            try:
                full_order = await db.execute(
                    select(Order)
                    .where(Order.id == order_id)
                    .options(
                        selectinload(Order.customer),
                        selectinload(Order.items).selectinload(OrderItem.menu_item),
                    )
                )
                full_order = full_order.scalars().first()
                slot = await db.get(PickupSlot, order.pickup_slot_id) if order.pickup_slot_id else None
                pickup_time = (
                    slot.time_slot.strftime("%I:%M %p") if slot else "your scheduled slot"
                )
                items_for_email = [
                    {
                        "name": oi.menu_item.name if oi.menu_item else "Item",
                        "quantity": oi.quantity,
                        "price": float(oi.price_at_order),
                    }
                    for oi in full_order.items
                ]
                send_order_ready_email(
                    customer_email=full_order.customer.email,
                    customer_name=full_order.customer.name,
                    order_number=order.order_number or str(order.id)[:8].upper(),
                    merchant_name=merchant.name,
                    merchant_location=merchant.location or "Campus Stall",
                    pickup_time=pickup_time,
                    items=items_for_email,
                    total_price=float(order.total_price),
                )
            except Exception as email_err:
                # Email failure must NOT roll back the status update
                logger.warning("Order-ready email failed for order %s: %s", order_id, email_err)

        await db.refresh(order)
        return {
            "message": "Order status updated successfully",
            "order_id": str(order.id),
            "new_status": order.status
        }
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=f"Database error details: {str(e)}")


# --- BOULEVARD RENTAL BOOKING ROUTES (PHASE 4) ---

@app.get("/boulevard/stalls")
async def list_boulevard_stalls(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(BoulevardStall))
    return result.scalars().all()


@app.post("/boulevard/bookings")
async def create_rental_booking(
    booking_data: RentalBookingCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    stall = await db.get(BoulevardStall, booking_data.stall_id)
    if not stall:
        raise HTTPException(status_code=404, detail="Stall not found.")

    merchant_res = await db.execute(select(Merchant).where(Merchant.user_id == current_user.id))
    merchant = merchant_res.scalars().first()
    merchant_id = merchant.id if merchant else None

    new_booking = RentalBooking(
        vendor_user_id=current_user.id,
        merchant_id=merchant_id,
        stall_id=booking_data.stall_id,
        start_date=booking_data.start_date,
        end_date=booking_data.end_date,
        status="pending",
        deposit_paid=True
    )
    db.add(new_booking)

    try:
        await db.commit()
        await db.refresh(new_booking)
        return new_booking
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=f"Database error details: {str(e)}")


@app.get("/boulevard/my-bookings")
async def list_my_rental_bookings(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(
        select(RentalBooking).where(RentalBooking.vendor_user_id == current_user.id)
    )
    return result.scalars().all()


@app.get("/admin/boulevard/bookings")
async def list_all_rental_bookings(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Access denied. Admin privileges required.")
    
    result = await db.execute(
        select(RentalBooking)
        .options(
            selectinload(RentalBooking.vendor_user),
            selectinload(RentalBooking.stall)
        )
        .order_by(RentalBooking.created_at.desc())
    )
    bookings = result.scalars().all()
    
    response_data = []
    for b in bookings:
        response_data.append({
            "id": str(b.id),
            "start_date": b.start_date,
            "end_date": b.end_date,
            "status": b.status,
            "deposit_paid": b.deposit_paid,
            "vendor_name": b.vendor_user.name if b.vendor_user else "Unknown Vendor",
            "vendor_email": b.vendor_user.email if b.vendor_user else "N/A",
            "stall_name": f"Stall {b.stall.stall_number}" if b.stall else "Boulevard Stall"
        })
    return response_data


@app.get("/admin/users")
async def list_all_users(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Access denied. Admin privileges required.")
    
    result = await db.execute(select(User).order_by(User.created_at.desc()))
    users = result.scalars().all()
    
    response_data = []
    for u in users:
        response_data.append({
            "id": str(u.id),
            "name": u.name,
            "email": u.email,
            "phone_number": u.phone_number or "N/A",
            "role": u.role,
            "created_at": u.created_at.isoformat() if u.created_at else None
        })
    return response_data


@app.patch("/boulevard/bookings/{booking_id}/status")
async def update_rental_status(
    booking_id: UUID,
    status_data: RentalStatusUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Access denied. Admin privileges required.")

    booking = await db.get(RentalBooking, booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail="Rental booking not found.")

    booking.status = status_data.status

    if status_data.status == "approved":
        vendor_user = await db.get(User, booking.vendor_user_id)
        if vendor_user:
            if vendor_user.role == "customer":
                vendor_user.role = "merchant"

            existing_merchant = await db.execute(
                select(Merchant).where(Merchant.user_id == vendor_user.id)
            )
            merchant = existing_merchant.scalars().first()
            if not merchant:
                new_merchant = Merchant(
                    user_id=vendor_user.id,
                    name=f"{vendor_user.name}'s Pop-up Stall",
                    description="Temporary Boulevard Pop-up Vendor",
                    location="Sunway Boulevard"
                )
                db.add(new_merchant)
                await db.flush()
                booking.merchant_id = new_merchant.id
            else:
                booking.merchant_id = merchant.id

    try:
        await db.commit()
        await db.refresh(booking)
        return {"message": "Booking status updated successfully", "status": booking.status}
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=f"Database error details: {str(e)}")


# --- EVENT ENDPOINTS ---

@app.post("/events", response_model=dict)
async def create_event(
    event_data: EventCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admins can create events.")
    
    if event_data.start_time.tzinfo is None or event_data.end_time.tzinfo is None or event_data.end_time <= event_data.start_time:
        raise HTTPException(status_code=422, detail="Provide a valid start and end time with timezone.")
    for merchant_id in set(event_data.merchant_ids):
        if not await db.get(Merchant, merchant_id):
            raise HTTPException(status_code=404, detail="Merchant not found.")
    new_event = Event(
        name=event_data.name,
        description=event_data.description,
        location=event_data.location,
        event_date=event_data.event_date,
        start_time=event_data.start_time,
        end_time=event_data.end_time,
        banner_image_url=event_data.banner_image_url
    )
    db.add(new_event)
    await db.flush()
    
    for merchant_id in set(event_data.merchant_ids):
        event_merchant = EventMerchant(event_id=new_event.id, merchant_id=merchant_id)
        db.add(event_merchant)
    
    await db.commit()
    await db.refresh(new_event)
    return {"id": str(new_event.id), "name": new_event.name, "message": "Event created successfully"}


@app.get("/events")
async def list_events(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Event).where(Event.is_active.is_(True)).order_by(Event.event_date.desc())
    )
    events = result.scalars().all()
    return [
        {
            "id": str(e.id),
            "name": e.name,
            "description": e.description,
            "location": e.location,
            "event_date": e.event_date,
            "start_time": e.start_time,
            "end_time": e.end_time,
            "banner_image_url": e.banner_image_url,
            "created_at": e.created_at
        }
        for e in events
    ]


@app.get("/events/featured-merchants")
async def featured_event_merchants(db: AsyncSession = Depends(get_db)):
    # Upcoming and current events; expired assignments return to the campus list.
    result = await db.execute(
        select(Merchant).join(EventMerchant, EventMerchant.merchant_id == Merchant.id)
        .join(Event, Event.id == EventMerchant.event_id)
        .where(Event.is_active.is_(True), Event.end_time >= datetime.now(timezone.utc),
               EventMerchant.is_active.is_(True), Merchant.is_active.is_not(False)).distinct()
    )
    return [{"id": str(m.id), "name": m.name, "location": m.location, "description": m.description}
            for m in result.scalars().all()]


@app.get("/admin/merchants")
async def admin_merchants(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin privileges required.")
    rows = (await db.execute(select(Merchant, User).join(User, Merchant.user_id == User.id).order_by(Merchant.name))).all()
    return [{"id": str(m.id), "name": m.name, "location": m.location, "description": m.description,
             "duitnow_qr_url": m.duitnow_qr_url, "is_active": m.is_active,
             "owner_name": u.name, "email": u.email, "phone_number": u.phone_number}
            for m, u in rows]


@app.get("/events/{event_id}")
async def get_event(event_id: UUID, db: AsyncSession = Depends(get_db)):
    event = await db.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found.")
    
    result = await db.execute(
        select(EventMerchant).where(EventMerchant.event_id == event_id, EventMerchant.is_active.is_(True))
    )
    event_merchants = result.scalars().all()
    merchant_ids = [em.merchant_id for em in event_merchants]
    
    merchants = []
    for merchant_id in merchant_ids:
        merchant = await db.get(Merchant, merchant_id)
        if merchant and merchant.is_active is not False:
            merchants.append({
                "id": str(merchant.id),
                "name": merchant.name,
                "description": merchant.description,
                "location": merchant.location
            })
    
    return {
        "id": str(event.id),
        "name": event.name,
        "description": event.description,
        "location": event.location,
        "event_date": event.event_date,
        "start_time": event.start_time,
        "end_time": event.end_time,
        "banner_image_url": event.banner_image_url,
        "merchants": merchants,
        "created_at": event.created_at
    }


@app.get("/events/{event_id}/merchants")
async def get_event_merchants(event_id: UUID, db: AsyncSession = Depends(get_db)):
    event = await db.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found.")
    
    result = await db.execute(
        select(EventMerchant).where(EventMerchant.event_id == event_id, EventMerchant.is_active.is_(True))
    )
    event_merchants = result.scalars().all()
    
    merchants_with_items = []
    for em in event_merchants:
        merchant = await db.get(Merchant, em.merchant_id)
        if merchant and merchant.is_active is not False:
            items_result = await db.execute(
                select(MenuItem).where(MenuItem.merchant_id == merchant.id)
            )
            items = items_result.scalars().all()
            
            merchants_with_items.append({
                "id": str(merchant.id),
                "name": merchant.name,
                "description": merchant.description,
                "location": merchant.location,
                "stall_number": getattr(em, "stall_number", None),
                "items": [
                    {
                        "id": str(item.id),
                        "name": item.name,
                        "description": item.description,
                        "price": float(item.price),
                        "image_url": item.image_url,
                        "is_available": item.is_available
                    }
                    for item in items
                ]
            })
    
    return merchants_with_items


@app.post("/events/{event_id}/merchants")
async def add_merchant_to_event(
    event_id: UUID,
    merchant_data: EventMerchantAdd,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admins can manage event merchants.")
    
    event = await db.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found.")
    
    merchant = await db.get(Merchant, merchant_data.merchant_id)
    if not merchant:
        raise HTTPException(status_code=404, detail="Merchant not found.")
    
    existing = await db.execute(
        select(EventMerchant).where(
            (EventMerchant.event_id == event_id) & (EventMerchant.merchant_id == merchant_data.merchant_id)
        )
    )
    if existing.scalars().first():
        raise HTTPException(status_code=400, detail="Merchant already added to this event.")
    
    event_merchant = EventMerchant(
        event_id=event_id,
        merchant_id=merchant_data.merchant_id,
        stall_number=merchant_data.stall_number
    )
    db.add(event_merchant)
    await db.commit()
    
    return {"message": "Merchant added to event successfully"}