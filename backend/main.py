import os
import base64
import binascii
import logging
import secrets
from datetime import datetime, date, timedelta, timezone
import httpx as httpx_client  # aliased since you might already have httpx elsewhere
from fastapi import UploadFile, File, Form, HTTPException
import shutil

from fastapi_offline import FastAPIOffline
from fastapi import FastAPI, Depends, Query, status, BackgroundTasks
from fastapi.staticfiles import StaticFiles  # <--- Added import for serving static upload files
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import case, func, or_, update, text
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload  # <--- Added import for eager loading relationships
from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional, Literal
from uuid import UUID

# --- NEW SUPABASE STORAGE IMPORTS ---
from supabase import create_client, Client

from database import engine, get_db
from models import Base, User, Merchant, MenuItem, PickupSlot, Order, OrderItem, Event, EventMerchant

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
    delete_account, DeleteCodeRequest, send_delete_code,
)


from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPIOffline):
    # Idempotent lightweight migrations for fields introduced after the
    # original Supabase schema was created.
    async with engine.begin() as connection:
        await connection.execute(text(
            "ALTER TABLE order_items ADD COLUMN IF NOT EXISTS special_instructions TEXT"
        ))
        await connection.execute(text(
            "ALTER TABLE merchants ADD COLUMN IF NOT EXISTS is_preview BOOLEAN NOT NULL DEFAULT TRUE"
        ))
        await connection.execute(text(
            "ALTER TABLE merchants ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0"
        ))
        # ADD COLUMN IF NOT EXISTS never changes an existing column, so set the default separately.
        # Existing stalls keep their current value; only stalls created from now on start hidden.
        await connection.execute(text(
            "ALTER TABLE merchants ALTER COLUMN is_preview SET DEFAULT TRUE"
        ))
        await connection.execute(text(
            "ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS approval_status VARCHAR NOT NULL DEFAULT 'approved'"
        ))
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

ALLOWED_IMAGE_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_IMAGE_BYTES = 5 * 1024 * 1024


def validate_menu_image_url(image_url: Optional[str]) -> Optional[str]:
    """Keep menu payloads small and restrict images to normal web URLs."""
    if not image_url or not image_url.strip():
        return None

    value = image_url.strip()
    if value.lower().startswith("data:"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Embedded base64 images are not supported. Upload the image file instead.",
        )
    if len(value) > 2048 or not value.lower().startswith(("https://", "http://", "/uploads/")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Image must use a valid http(s) URL.",
        )
    return value


def public_menu_item(item: MenuItem) -> dict:
    """Serialize a menu item without leaking legacy multi-megabyte data URLs."""
    image_url = item.image_url
    if image_url and image_url.lstrip().lower().startswith("data:"):
        image_url = f"/menu-items/{item.id}/image"
    return {
        "id": str(item.id),
        "merchant_id": str(item.merchant_id),
        "name": item.name,
        "description": item.description,
        "price": float(item.price),
        "image_url": image_url,
        "is_available": item.is_available,
        "created_at": item.created_at,
    }

PUBLIC_BUCKET = os.getenv("SUPABASE_PUBLIC_BUCKET", "uploads")      # QR codes, menu photos, banners: meant to be public
RECEIPT_BUCKET = os.getenv("SUPABASE_RECEIPT_BUCKET", "receipts")   # payment receipts: PRIVATE bucket, signed links only
RECEIPT_LINK_SECONDS = 60 * 60


def detect_image(data: bytes):
    """Decide the image type from the file's first bytes, never from the filename or the browser's claim."""
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png", "image/png"
    if data.startswith(b"\xff\xd8\xff"):
        return "jpg", "image/jpeg"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp", "image/webp"
    return None


async def upload_to_supabase(file: UploadFile, private: bool = False) -> str:
    """Validate an image and store it. Public uploads return a public URL; private ones return a storage path."""
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase Storage client is not configured on the backend.")
    file_bytes = await file.read(MAX_IMAGE_BYTES + 1)
    if len(file_bytes) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Image must be 5 MB or smaller.")
    detected = detect_image(file_bytes)
    if not detected:
        raise HTTPException(status_code=400, detail="Only JPG, PNG, and WebP images are supported.")
    ext, content_type = detected
    bucket = RECEIPT_BUCKET if private else PUBLIC_BUCKET
    file_path = f"images/{secrets.token_hex(12)}.{ext}"
    try:
        supabase.storage.from_(bucket).upload(path=file_path, file=file_bytes, file_options={"content-type": content_type})
        if private:
            return file_path
        public_url = supabase.storage.from_(bucket).get_public_url(file_path)
        if isinstance(public_url, dict):
            public_url = public_url.get("publicUrl") or public_url.get("data", {}).get("publicUrl")
        if not public_url:
            raise HTTPException(status_code=500, detail="Failed to generate public URL from Supabase.")
        return str(public_url)
    except HTTPException:
        raise
    except Exception:
        logger.exception("Supabase storage upload failed")
        raise HTTPException(status_code=502, detail="Could not store the image. Please try again.")


def receipt_link(stored: Optional[str]) -> Optional[str]:
    """Old rows hold full public URLs; new rows hold a private path that gets a 1-hour signed link."""
    if not stored:
        return None
    if stored.startswith("http") or not supabase:
        return stored if stored.startswith("http") else None
    try:
        signed = supabase.storage.from_(RECEIPT_BUCKET).create_signed_url(stored, RECEIPT_LINK_SECONDS)
        if isinstance(signed, dict):
            return signed.get("signedURL") or signed.get("signedUrl")
        return str(signed)
    except Exception:
        logger.exception("Could not sign receipt link")
        return None


# --- ORDER RULES ---

MALAYSIA_TZ = timezone(timedelta(hours=8))   # Malaysia has no daylight saving
DRAFT_HOLD_MINUTES = 15                       # an unpaid checkout keeps its pickup place this long

# The only moves a stall may make. Drafts become pending_verification only when the customer uploads a receipt.
ORDER_TRANSITIONS = {
    "pending_verification": {"preparing", "rejected"},
    "pending": {"preparing", "rejected"},
    "preparing": {"ready"},
    "ready": {"completed"},
}


def new_order_number() -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"   # no 0/O or 1/I mix-ups
    return "#EX-" + "".join(secrets.choice(alphabet) for _ in range(8))


def as_malaysia_time(when: datetime) -> datetime:
    """A time with no zone (e.g. from <input type=datetime-local>) means Malaysia time, not UTC."""
    return when.replace(tzinfo=MALAYSIA_TZ) if when.tzinfo is None else when


async def release_slot(order, db: AsyncSession):
    if order.pickup_slot_id:
        slot = await db.get(PickupSlot, order.pickup_slot_id)
        if slot and slot.current_bookings > 0:
            slot.current_bookings -= 1


async def expire_stale_drafts(db: AsyncSession):
    """Cancel checkouts that were never paid, so they stop blocking pickup slots."""
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=DRAFT_HOLD_MINUTES)
    stale = (await db.execute(
        select(Order).where(Order.status == "draft", Order.created_at < cutoff).with_for_update(skip_locked=True)
    )).scalars().all()
    for order in stale:
        order.status = "cancelled"
        await release_slot(order, db)
    if stale:
        await db.commit()


async def anonymize_account(user, db: AsyncSession):
    """Close an account but keep order history intact (orders still point at this row). Does not commit."""
    merchant_ids = [m.id for m in (await db.execute(select(Merchant).where(Merchant.user_id == user.id))).scalars().all()]
    involved = Order.customer_id == user.id
    if merchant_ids:
        involved = or_(involved, Order.merchant_id.in_(merchant_ids))
    for order in (await db.execute(select(Order).where(involved, Order.status.in_(["draft", "pending_verification", "pending"])))).scalars().all():
        order.status = "cancelled"
        await release_slot(order, db)
    if merchant_ids:
        await db.execute(update(Merchant).where(Merchant.id.in_(merchant_ids)).values(is_active=False))
        await db.execute(update(MenuItem).where(MenuItem.merchant_id.in_(merchant_ids)).values(is_available=False))
    user.name = "Deleted User"
    user.email = f"deleted-{user.id}@{DELETED_EMAIL_DOMAIN}"
    user.phone_number = None
    user.password_hash = hash_password(secrets.token_urlsafe(32))
    user.is_deleted = True
    user.deleted_at = datetime.now(timezone.utc)


# --- BULLETPROOF CORS CONFIGURATION ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://payvolution.app",
        "https://www.payvolution.app",
        "https://pay-net-iota.vercel.app",
        "http://localhost:3000",
        "http://localhost:5000",
        "http://127.0.0.1:3000",
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

# Public merchant data includes the merchant ID because customers need it to
# load menus and pickup slots. It does not expose the owner's user ID.
class MerchantPublic(BaseModel):
    id: UUID
    name: str
    location: Optional[str] = None
    description: Optional[str] = None
    duitnow_qr_url: Optional[str] = None
    is_active: Optional[bool] = True

    class Config:
        from_attributes = True

class MenuItemCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: Optional[str] = Field(default=None, max_length=1000)
    price: float = Field(gt=0, le=10000)
    image_url: Optional[str] = None
    is_available: bool = True

class OrderItemCreate(BaseModel):
    menu_item_id: UUID
    quantity: int = Field(default=1, ge=1, le=50)
    special_instructions: Optional[str] = Field(default=None, max_length=300)

class OrderCreate(BaseModel):
    merchant_id: UUID
    pickup_slot_id: UUID
    items: List[OrderItemCreate] = Field(min_length=1, max_length=50)

class PickupSlotCreate(BaseModel):
    time_slot: datetime
    max_capacity: int = Field(default=10, ge=1, le=500)

class ForgotPasswordRequest(BaseModel):
    email: str
    new_password: str
    verification_code: str  # 6-digit code emailed via /auth/send-code

class SendCodeRequest(BaseModel):
    email: EmailStr
    purpose: Literal["register", "reset"]


class OrderStatusUpdate(BaseModel):
    status: Literal["preparing", "ready", "completed", "rejected"]


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
    store_name: Optional[str] = None    # Required when promoting to merchant
    location: Optional[str] = None
    description: Optional[str] = None


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
@app.delete("/api/users/me")
async def delete_my_account(
    payload: DeleteAccountRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return await delete_account(payload, current_user, db)


@app.post("/users/me/deletion-code")
async def request_deletion_code(
    payload: DeleteCodeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return await send_delete_code(payload, current_user, db)


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

    if target_user.id == current_user.id:
        raise HTTPException(status_code=400, detail="You cannot delete your own account here.")
    # Hard-deleting fails once the user has orders (foreign keys), and would erase sales history.
    # Anonymising keeps history, removes personal data, hides their stall and stops their logins.
    await anonymize_account(target_user, db)
    await db.commit()
    return {"status": "success", "message": "User deleted successfully."}


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

    if target_user.id == current_user.id and payload.role != "admin":
        raise HTTPException(status_code=400, detail="You cannot remove your own admin role.")
    target_user.role = payload.role

    if payload.role == "merchant":
        if not (payload.store_name or "").strip():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="store_name is required when promoting a user to the merchant role.",
            )
        existing_merchant = (await db.execute(select(Merchant).where(Merchant.user_id == target_user.id))).scalars().first()
        if not existing_merchant:
            new_merchant = Merchant(
                user_id=target_user.id,
                name=payload.store_name.strip(),
                description=payload.description or "Campus Merchant",
                location=payload.location or "Sunway Campus"
            )
            db.add(new_merchant)
        else:
            # Update existing merchant record with supplied details
            if existing_merchant:
                existing_merchant.name = payload.store_name.strip()
                if payload.description:
                    existing_merchant.description = payload.description
                if payload.location:
                    existing_merchant.location = payload.location

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
        if update_data.store_name is not None and update_data.store_name != merchant.name:
            raise HTTPException(400, "The registered stall name cannot be changed.")
        if update_data.description is not None:
            merchant.description = update_data.description
        if update_data.location is not None and update_data.location != merchant.location:
            raise HTTPException(400, "The registered campus location cannot be changed.")

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


@app.post("/merchants/menu-image")
async def upload_menu_image(
    image_file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "merchant":
        raise HTTPException(status_code=403, detail="Access denied. Merchant privileges required.")

    public_url = await upload_to_supabase(image_file)
    return {"image_url": public_url}


@app.post("/auth/send-code")
async def send_verification_code(payload: SendCodeRequest, db: AsyncSession = Depends(get_db)):
    return await send_verification(SendVerificationRequest(email=payload.email, purpose=payload.purpose), db)


@app.post("/auth/forgot-password")
async def forgot_password(payload: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    return await verify_code(VerifyCodeRequest(email=payload.email, purpose="reset", code=payload.verification_code, password=payload.new_password), db)


@app.post("/auth/register-merchant", response_model=dict, deprecated=True)
async def register_merchant(data: MerchantRegisterRequest, db: AsyncSession = Depends(get_db)):
    """
    DEPRECATED — Merchant self-registration is no longer permitted.
    All accounts must register via /auth/verify-code as customers.
    Admins promote users to the merchant role via PUT /admin/users/{user_id}/role.
    """
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=(
            "Merchant self-registration is disabled. "
            "Please create a standard customer account and contact an administrator "
            "to have your account upgraded to merchant."
        ),
    )


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
async def create_merchant(merchant_data: MerchantCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin privileges required.")
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


# Merchant IDs are safe public shop identifiers. The frontend needs them to
# fetch that shop's menu and pickup slots; the internal `user_id` remains hidden.
@app.get("/merchants", response_model=List[MerchantPublic])
async def list_merchants(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Merchant)
        .where(Merchant.is_active.is_not(False))
        .where(Merchant.name != "--")
        .where(Merchant.name != "")
        .where(func.lower(func.trim(Merchant.name)) != "payvolution")
        .where(Merchant.is_preview.is_not(True))
    )
    merchants = result.scalars().all()
    return [MerchantPublic.model_validate(m) for m in merchants]


# Keep this static route above /merchants/{merchant_id}; FastAPI resolves
# routes in declaration order and would otherwise parse "sorted" as a UUID.
@app.get("/merchants/sorted", response_model=List[MerchantPublic])
async def list_merchants_sorted(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Merchant)
        .where(Merchant.is_active.is_not(False))
        .where(Merchant.name != "--")
        .where(Merchant.name != "")
        .where(func.lower(func.trim(Merchant.name)) != "payvolution")
        .where(Merchant.is_preview.is_not(True))
        .order_by(Merchant.display_order.asc().nulls_last(), Merchant.name)
    )
    merchants = result.scalars().all()
    return [MerchantPublic.model_validate(m) for m in merchants]


# Public detail likewise needs the shop ID while excluding the owner user ID.
@app.get("/merchants/{merchant_id}", response_model=MerchantPublic)
async def get_merchant_details(merchant_id: UUID, db: AsyncSession = Depends(get_db)):
    merchant = await db.get(Merchant, merchant_id)
    if not merchant or merchant.is_active is False:
        raise HTTPException(status_code=404, detail="Merchant not found.")
    return MerchantPublic.model_validate(merchant)


# --- 1. SECURED: Create Menu Item (Merchant Owner or Admin Only) ---
@app.post("/merchants/{merchant_id}/items")
async def create_menu_item(
    merchant_id: UUID, 
    item_data: MenuItemCreate, 
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    merchant = await db.get(Merchant, merchant_id)
    if not merchant:
        raise HTTPException(status_code=404, detail="Merchant not found.")
    
    if current_user.role != "admin" and (current_user.role != "merchant" or merchant.user_id != current_user.id):
        raise HTTPException(status_code=403, detail="Access denied. You do not own this merchant account.")

    new_item = MenuItem(
        merchant_id=merchant_id,
        name=item_data.name,
        description=item_data.description,
        price=item_data.price,
        image_url=validate_menu_image_url(item_data.image_url),
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


# --- 2. SECURED: Update Menu Item ---
@app.put("/merchants/items/{item_id}")
async def update_menu_item(
    item_id: UUID, 
    item_data: MenuItemCreate, 
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    item = await db.get(MenuItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Menu item not found.")
    
    merchant = await db.get(Merchant, item.merchant_id)
    if current_user.role != "admin" and (current_user.role != "merchant" or merchant.user_id != current_user.id):
        raise HTTPException(status_code=403, detail="Access denied.")

    item.name = item_data.name
    item.description = item_data.description
    item.price = item_data.price
    item.image_url = validate_menu_image_url(item_data.image_url)
    item.is_available = item_data.is_available

    try:
        await db.commit()
        await db.refresh(item)
        return item
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=f"Database error details: {str(e)}")


# --- 3. SECURED: Delete Menu Item ---
@app.delete("/merchants/items/{item_id}")
async def delete_menu_item(
    item_id: UUID, 
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    item = await db.get(MenuItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Menu item not found.")
    
    merchant = await db.get(Merchant, item.merchant_id)
    if current_user.role != "admin" and (current_user.role != "merchant" or merchant.user_id != current_user.id):
        raise HTTPException(status_code=403, detail="Access denied.")

    used = (await db.execute(select(func.count(OrderItem.id)).where(OrderItem.menu_item_id == item.id))).scalar_one()
    if used:
        # Past orders point at this item; deleting it would break receipts and sales history.
        item.is_available = False
        await db.commit()
        return {"message": "This item has past orders, so it was hidden instead of deleted.", "hidden": True}
    try:
        await db.delete(item)
        await db.commit()
        return {"message": "Menu item deleted successfully"}
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=f"Database error details: {str(e)}")


# --- 4. SECURED: Create Pickup Slot ---
@app.post("/merchants/{merchant_id}/pickup-slots")
async def create_pickup_slot(
    merchant_id: UUID, 
    slot_data: PickupSlotCreate, 
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    merchant = await db.get(Merchant, merchant_id)
    if not merchant:
        raise HTTPException(status_code=404, detail="Merchant not found.")
        
    if current_user.role != "admin" and (current_user.role != "merchant" or merchant.user_id != current_user.id):
        raise HTTPException(status_code=403, detail="Access denied.")

    when = as_malaysia_time(slot_data.time_slot)
    if when < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Pickup time must be in the future.")
    new_slot = PickupSlot(
        merchant_id=merchant_id,
        time_slot=when,
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


# --- PUBLIC: List Pickup Slots ---
@app.get("/merchants/{merchant_id}/pickup-slots")
async def list_pickup_slots(merchant_id: UUID, db: AsyncSession = Depends(get_db)):
    await expire_stale_drafts(db)
    result = await db.execute(select(PickupSlot).where(PickupSlot.merchant_id == merchant_id).order_by(PickupSlot.time_slot))
    return result.scalars().all()


# --- 5. SECURED: Delete Pickup Slot ---
@app.delete("/merchants/pickup-slots/{slot_id}")
async def delete_pickup_slot(
    slot_id: UUID, 
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    slot = await db.get(PickupSlot, slot_id)
    if not slot:
        raise HTTPException(status_code=404, detail="Pickup slot not found.")
    
    merchant = await db.get(Merchant, slot.merchant_id)
    if current_user.role != "admin" and (current_user.role != "merchant" or merchant.user_id != current_user.id):
        raise HTTPException(status_code=403, detail="Access denied.")
    has_orders = (await db.execute(select(func.count(Order.id)).where(Order.pickup_slot_id == slot.id))).scalar_one()
    if has_orders:
        raise HTTPException(status_code=400, detail="This pickup slot already has orders, so it can't be deleted.")
    try:
        await db.delete(slot)
        await db.commit()
        return {"message": "Pickup slot deleted successfully"}
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=f"Database error details: {str(e)}")


# --- PUBLIC: List Menu Items ---
@app.get("/merchants/{merchant_id}/items")
async def list_menu_items(merchant_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(MenuItem).where(MenuItem.merchant_id == merchant_id))
    return [public_menu_item(item) for item in result.scalars().all()]


@app.get("/menu-items/{item_id}/image")
async def get_legacy_menu_image(item_id: UUID, db: AsyncSession = Depends(get_db)):
    """Serve old data-URL photos separately so menu JSON remains small and fast."""
    item = await db.get(MenuItem, item_id)
    data_url = item.image_url if item else None
    if not data_url or not data_url.lstrip().lower().startswith("data:image/"):
        raise HTTPException(status_code=404, detail="Menu image not found.")

    try:
        header, encoded = data_url.split(",", 1)
        media_type = header[5:].split(";", 1)[0].lower()
        if media_type not in ALLOWED_IMAGE_CONTENT_TYPES or ";base64" not in header.lower():
            raise ValueError("Unsupported image data URL")
        image_bytes = base64.b64decode(encoded, validate=True)
    except (ValueError, binascii.Error):
        raise HTTPException(status_code=404, detail="Menu image is invalid.") from None

    if len(image_bytes) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Legacy menu image is too large.")

    return Response(
        content=image_bytes,
        media_type=media_type,
        headers={"Cache-Control": "public, max-age=86400"},
    )


@app.post("/orders")
async def create_order(
    order_data: OrderCreate, 
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    merchant = await db.get(Merchant, order_data.merchant_id)
    if not merchant or merchant.is_active is False:
        raise HTTPException(status_code=400, detail="This stall is not taking orders right now.")
    await expire_stale_drafts(db)
    # Lock the slot row so two customers can't both take the last place.
    slot = (await db.execute(
        select(PickupSlot).where(PickupSlot.id == order_data.pickup_slot_id).with_for_update()
    )).scalars().first()
    if not slot:
        raise HTTPException(status_code=404, detail="Pickup slot not found.")
    if slot.merchant_id != order_data.merchant_id:
        raise HTTPException(status_code=400, detail="Pickup slot does not belong to this merchant.")
    if slot.time_slot < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="This pickup time has already passed.")
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
        if not item.is_available or item.approval_status == "rejected" or float(item.price) <= 0:
            raise HTTPException(status_code=400, detail=f"'{item.name}' is currently unavailable.")
        line_total = float(item.price) * line.quantity
        total_price += line_total
        instructions = line.special_instructions.strip() if line.special_instructions else None
        line_items.append((item, line.quantity, instructions or None))

    order_number = new_order_number()
    while (await db.execute(select(Order.id).where(Order.order_number == order_number))).first():
        order_number = new_order_number()

    new_order = Order(
        customer_id=current_user.id,
        merchant_id=order_data.merchant_id,
        pickup_slot_id=order_data.pickup_slot_id,
        order_number=order_number,
        status="draft", # <--- UPDATED: Initial state is draft so merchant is not notified yet
        total_price=round(total_price, 2),
        transaction_ref=None
    )
    db.add(new_order)

    try:
        await db.flush()
        for item, quantity, instructions in line_items:
            db.add(OrderItem(
                order_id=new_order.id,
                menu_item_id=item.id,
                quantity=quantity,
                price_at_order=item.price,
                special_instructions=instructions,
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
    if order.status not in ("draft", "pending_verification", "pending"):
        raise HTTPException(status_code=400, detail="This order has already been checked by the stall, so the receipt can't be changed.")

    # Receipts go to a PRIVATE bucket; the customer, the stall and admins get short-lived links.
    order.transaction_ref = await upload_to_supabase(receipt_file, private=True)
    order.status = "pending_verification" # <--- UPDATED: Transitions status from draft to pending_verification

    try:
        await db.commit()
        await db.refresh(order)
        return {
            "message": "Payment receipt screenshot submitted successfully.",
            "order_number": order.order_number,
            "status": order.status,
            "receipt_url": receipt_link(order.transaction_ref)
        }
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=f"Database error details: {str(e)}")


@app.get("/orders/{order_id}")
async def get_order(order_id: UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(
        select(Order)
        .where(Order.id == order_id)
        .options(selectinload(Order.items).selectinload(OrderItem.menu_item))
    )
    order = result.scalars().first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found.")
    allowed = order.customer_id == current_user.id or current_user.role == "admin"
    if not allowed:
        owner = await db.get(Merchant, order.merchant_id)
        allowed = owner is not None and owner.user_id == current_user.id
    if not allowed:
        # Same answer as "not found" so order IDs can't be probed.
        raise HTTPException(status_code=404, detail="Order not found.")

    items_data = [
        {
            "id": str(item.id),
            "name": item.menu_item.name if item.menu_item else "Unknown Dish",
            "quantity": item.quantity,
            "price_at_order": float(item.price_at_order),
            "special_instructions": item.special_instructions,
        }
        for item in order.items
    ]
    
    return {
        "id": str(order.id),
        "merchant_id": str(order.merchant_id),
        "status": order.status,
        "total_price": float(order.total_price),
        "created_at": order.created_at.isoformat() if order.created_at else None,
        "order_number": order.order_number,
        "transaction_ref": receipt_link(order.transaction_ref),
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
                "price_at_order": float(item.price_at_order),
                "special_instructions": item.special_instructions,
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
        .where(
            Order.merchant_id == merchant_id,
            Order.status != "draft" # <--- UPDATED: Hides draft/unpaid orders from the merchant dashboard
        )
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
                "price_at_order": float(item.price_at_order),
                "special_instructions": item.special_instructions,
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
            "transaction_ref": receipt_link(order.transaction_ref),
            "order_number": getattr(order, "order_number", None),
            "items": items_data
        })
    return response


@app.patch("/orders/{order_id}/status")
async def update_order_status(
    order_id: UUID,
    status_update: OrderStatusUpdate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(Order).where(Order.id == order_id).options(
            selectinload(Order.customer),
            selectinload(Order.items).selectinload(OrderItem.menu_item),
        )
    )
    order = result.scalars().first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found.")

    if current_user.role != "merchant":
        raise HTTPException(status_code=403, detail="Only merchants can update order status.")
    merchant = (await db.execute(
        select(Merchant).where(Merchant.id == order.merchant_id, Merchant.user_id == current_user.id)
    )).scalars().first()
    if not merchant:
        raise HTTPException(status_code=403, detail="You can only update orders for your own merchant account.")

    new_status = status_update.status
    if order.status == "draft":
        raise HTTPException(status_code=400, detail="The customer hasn't uploaded a payment receipt yet.")
    if new_status not in ORDER_TRANSITIONS.get(order.status, set()):
        raise HTTPException(status_code=400, detail=f"An order that is '{order.status}' can't be changed to '{new_status}'.")

    order.status = new_status
    if new_status == "rejected":
        await release_slot(order, db)
    await db.commit()

    customer = order.customer
    if new_status == "ready" and customer and customer.email and not customer.email.endswith("@" + DELETED_EMAIL_DOMAIN):
        slot = await db.get(PickupSlot, order.pickup_slot_id) if order.pickup_slot_id else None
        pickup_time = slot.time_slot.astimezone(MALAYSIA_TZ).strftime("%I:%M %p") if slot else "your scheduled slot"
        # Runs after the response is sent (in a worker thread), so slow SMTP never holds up the stall's screen.
        background_tasks.add_task(
            send_order_ready_email,
            customer_email=customer.email,
            customer_name=customer.name,
            order_number=order.order_number or str(order.id)[:8].upper(),
            merchant_name=merchant.name,
            merchant_location=merchant.location or "Campus Stall",
            pickup_time=pickup_time,
            items=[
                {
                    "name": oi.menu_item.name if oi.menu_item else "Item",
                    "quantity": oi.quantity,
                    "price": float(oi.price_at_order),
                    "special_instructions": oi.special_instructions,
                }
                for oi in order.items
            ],
            total_price=float(order.total_price),
        )

    return {
        "message": "Order status updated successfully",
        "order_id": str(order.id),
        "new_status": order.status
    }


# --- ADMIN USERS ---

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
    # Event placement is always explicit. Shops remain on the normal campus
    # marketplace until an administrator selects them for this event.
    merchant_ids = set(event_data.merchant_ids)

    for merchant_id in merchant_ids:
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
    
    for merchant_id in merchant_ids:
        event_merchant = EventMerchant(event_id=new_event.id, merchant_id=merchant_id)
        db.add(event_merchant)
    
    await db.commit()
    await db.refresh(new_event)
    return {
        "id": str(new_event.id),
        "name": new_event.name,
        "merchant_count": len(merchant_ids),
        "message": "Event created successfully",
    }


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
    # Only vendors deliberately assigned by an administrator belong in the
    # Payvolution widget. Everyone else remains in Browse Campus Stalls.
    now = datetime.now(timezone.utc)
    event = (await db.execute(
        select(Event)
        .where(Event.is_active.is_(True), Event.start_time <= now, Event.end_time >= now)
        .order_by(Event.start_time.asc())
        .limit(1)
    )).scalars().first()
    if not event:
        return []
    result = await db.execute(
        select(Merchant).join(EventMerchant, EventMerchant.merchant_id == Merchant.id)
        .where(EventMerchant.event_id == event.id, EventMerchant.is_active.is_(True),
               Merchant.is_active.is_not(False)).distinct()
    )
    merchants = result.scalars().all()
    return [{"id": str(m.id), "name": m.name, "location": m.location, "description": m.description}
            for m in merchants]


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
    
    # An empty event stays empty until an administrator selects vendors.
    merchant_rows = [(await db.get(Merchant, membership.merchant_id), getattr(membership, "stall_number", None))
                     for membership in event_merchants]

    for merchant, stall_number in merchant_rows:
        if not merchant or merchant.is_active is False:
            continue
            
        items_result = await db.execute(select(MenuItem).where(MenuItem.merchant_id == merchant.id))
        items = items_result.scalars().all()
        
        merchants_with_items.append({
            "id": str(merchant.id),
            "name": merchant.name,
            "description": merchant.description,
            "location": merchant.location,
            "stall_number": stall_number,
            "items": [
                {
                    "id": str(item.id),
                    "name": item.name,
                    "description": item.description,
                    "price": float(item.price),
                    "image_url": item.image_url,
                    # Fallbacks to ensure both frontend properties are met without throwing errors
                    "is_active": getattr(item, "is_active", True),
                    "is_available": getattr(item, "is_available", True)
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
    
    result = await db.execute(
        select(EventMerchant).where(
            (EventMerchant.event_id == event_id) & (EventMerchant.merchant_id == merchant_data.merchant_id)
        )
    )
    if result.scalars().first():
        raise HTTPException(status_code=400, detail="Merchant already added to this event.")
    
    event_merchant = EventMerchant(
        event_id=event_id,
        merchant_id=merchant_data.merchant_id,
        stall_number=merchant_data.stall_number
    )
    db.add(event_merchant)
    await db.commit()
    
    return {"message": "Merchant added to event successfully"}


@app.get("/admin/events/{event_id}/merchant-ids")
async def admin_event_merchant_ids(
    event_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin privileges required.")
    if not await db.get(Event, event_id):
        raise HTTPException(status_code=404, detail="Event not found.")
    result = await db.execute(
        select(EventMerchant.merchant_id).where(
            EventMerchant.event_id == event_id,
            EventMerchant.is_active.is_(True),
        )
    )
    return [str(row[0]) for row in result]


@app.delete("/events/{event_id}")
async def delete_event(
    event_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admins can delete events.")
    event = await db.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found.")
    memberships = (await db.execute(select(EventMerchant).where(EventMerchant.event_id == event_id))).scalars().all()
    for membership in memberships:
        await db.delete(membership)
    await db.delete(event)
    await db.commit()
    return {"message": "Event deleted. Its vendors are back in Browse Campus Stalls."}


@app.delete("/events/{event_id}/merchants/{merchant_id}")
async def remove_merchant_from_event(
    event_id: UUID,
    merchant_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admins can manage event merchants.")
    membership = (await db.execute(select(EventMerchant).where(
        EventMerchant.event_id == event_id,
        EventMerchant.merchant_id == merchant_id,
    ))).scalars().first()
    if not membership:
        raise HTTPException(status_code=404, detail="Merchant is not assigned to this event.")
    await db.delete(membership)
    await db.commit()
    return {"message": "Merchant removed from event."}


# ──────────────────────────────────────────────────────────────────────────────
# ADMIN EXTENDED ENDPOINTS (added for full admin authority)
# ──────────────────────────────────────────────────────────────────────────────

class AdminMerchantProfileUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    location: Optional[str] = None

class MenuItemApproval(BaseModel):
    approval_status: Literal["approved", "rejected"]

class MerchantOrderUpdate(BaseModel):
    ordered_ids: List[UUID]

class EventUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    location: Optional[str] = None
    event_date: Optional[date] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    event_url: Optional[str] = None


@app.patch("/admin/merchants/{merchant_id}")
async def admin_update_merchant(
    merchant_id: UUID,
    payload: AdminMerchantProfileUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin privileges required.")
    merchant = await db.get(Merchant, merchant_id)
    if not merchant:
        raise HTTPException(status_code=404, detail="Merchant not found.")
    if payload.name is not None:
        merchant.name = payload.name.strip()
    if payload.description is not None:
        merchant.description = payload.description
    if payload.location is not None:
        merchant.location = payload.location
    try:
        await db.commit()
        await db.refresh(merchant)
        return {"message": "Merchant profile updated.", "id": str(merchant.id), "name": merchant.name, "location": merchant.location, "description": merchant.description}
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@app.patch("/admin/merchants/{merchant_id}/toggle-active")
async def admin_toggle_merchant_active(
    merchant_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin privileges required.")
    merchant = await db.get(Merchant, merchant_id)
    if not merchant:
        raise HTTPException(status_code=404, detail="Merchant not found.")
    merchant.is_active = not merchant.is_active
    await db.commit()
    await db.refresh(merchant)
    return {"message": f"Merchant {'activated' if merchant.is_active else 'deactivated'}.", "is_active": merchant.is_active}


@app.delete("/admin/merchants/{merchant_id}")
async def admin_delete_merchant(
    merchant_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin privileges required.")
    merchant = await db.get(Merchant, merchant_id)
    if not merchant:
        raise HTTPException(status_code=404, detail="Merchant not found.")
    has_orders = (await db.execute(select(func.count(Order.id)).where(Order.merchant_id == merchant_id))).scalar_one()
    if has_orders:
        # Orders point at this stall; keep it for sales history but take it off the marketplace.
        merchant.is_active = False
        await db.execute(update(MenuItem).where(MenuItem.merchant_id == merchant_id).values(is_available=False))
        await db.execute(EventMerchant.__table__.delete().where(EventMerchant.merchant_id == merchant_id))
        await db.commit()
        return {"message": "This stall has past orders, so it was deactivated and hidden instead of deleted."}
    try:
        await db.execute(EventMerchant.__table__.delete().where(EventMerchant.merchant_id == merchant_id))
        await db.execute(MenuItem.__table__.delete().where(MenuItem.merchant_id == merchant_id))
        await db.execute(PickupSlot.__table__.delete().where(PickupSlot.merchant_id == merchant_id))
        await db.delete(merchant)
        await db.commit()
        return {"message": "Merchant deleted successfully."}
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@app.patch("/admin/menu-items/{item_id}/approval")
async def admin_approve_menu_item(
    item_id: UUID,
    payload: MenuItemApproval,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin privileges required.")
    item = await db.get(MenuItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Menu item not found.")
    item.approval_status = payload.approval_status
    item.is_available = payload.approval_status == "approved"
    try:
        await db.commit()
        await db.refresh(item)
        return {"message": f"Menu item {payload.approval_status}.", "id": str(item.id), "approval_status": payload.approval_status}
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@app.delete("/admin/menu-items/{item_id}")
async def admin_delete_menu_item(
    item_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin privileges required.")
    item = await db.get(MenuItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Menu item not found.")
    used = (await db.execute(select(func.count(OrderItem.id)).where(OrderItem.menu_item_id == item.id))).scalar_one()
    if used:
        item.is_available = False
        await db.commit()
        return {"message": "This item has past orders, so it was hidden instead of deleted.", "hidden": True}
    try:
        await db.delete(item)
        await db.commit()
        return {"message": "Menu item deleted."}
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@app.delete("/admin/pickup-slots/{slot_id}")
async def admin_delete_pickup_slot(
    slot_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin privileges required.")
    slot = await db.get(PickupSlot, slot_id)
    if not slot:
        raise HTTPException(status_code=404, detail="Pickup slot not found.")
    has_orders = (await db.execute(select(func.count(Order.id)).where(Order.pickup_slot_id == slot.id))).scalar_one()
    if has_orders:
        raise HTTPException(status_code=400, detail="This pickup slot already has orders, so it can't be deleted.")
    try:
        await db.delete(slot)
        await db.commit()
        return {"message": "Pickup slot deleted."}
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@app.put("/admin/merchants/reorder")
async def admin_reorder_merchants(
    payload: MerchantOrderUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin privileges required.")
    try:
        for index, merchant_id in enumerate(payload.ordered_ids):
            merchant = await db.get(Merchant, merchant_id)
            if merchant:
                setattr(merchant, "display_order", index)
        await db.commit()
        return {"message": "Merchant display order updated."}
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@app.patch("/admin/merchants/{merchant_id}/preview")
async def admin_toggle_preview(
    merchant_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Toggle the is_preview flag for a merchant (hides them from public marketplace)."""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin privileges required.")
    merchant = await db.get(Merchant, merchant_id)
    if not merchant:
        raise HTTPException(status_code=404, detail="Merchant not found.")
    current_val = getattr(merchant, "is_preview", False) or False
    setattr(merchant, "is_preview", not current_val)
    try:
        await db.commit()
        await db.refresh(merchant)
        return {"id": str(merchant.id), "is_preview": getattr(merchant, "is_preview", False)}
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/admin/merchants/ordered")
async def admin_list_merchants_ordered(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin privileges required.")
    from sqlalchemy import text as sql_text
    rows = (await db.execute(
        select(Merchant, User)
        .join(User, Merchant.user_id == User.id)
        .where(Merchant.name != "--")
        .where(Merchant.name != "")
        .order_by(sql_text("merchants.display_order ASC NULLS LAST"), Merchant.name)
    )).all()
    return [
        {
            "id": str(m.id),
            "name": m.name,
            "location": m.location,
            "description": m.description,
            "duitnow_qr_url": m.duitnow_qr_url,
            "is_active": m.is_active,
            "is_preview": getattr(m, "is_preview", False),
            "display_order": getattr(m, "display_order", 0),
            "owner_name": u.name,
            "email": u.email,
            "phone_number": u.phone_number,
        }
        for m, u in rows
    ]


@app.patch("/admin/events/{event_id}/banner")
async def admin_upload_event_banner(
    event_id: UUID,
    banner_file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin privileges required.")
    event = await db.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found.")
    public_url = await upload_to_supabase(banner_file)
    event.banner_image_url = public_url
    try:
        await db.commit()
        await db.refresh(event)
        return {"message": "Event banner uploaded.", "banner_image_url": event.banner_image_url}
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@app.patch("/admin/events/{event_id}")
async def admin_update_event(
    event_id: UUID,
    payload: EventUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin privileges required.")
    event = await db.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found.")
    if payload.name is not None:
        event.name = payload.name
    if payload.description is not None:
        event.description = payload.description
    if payload.location is not None:
        event.location = payload.location
    if payload.event_date is not None:
        event.event_date = payload.event_date
    if payload.start_time is not None:
        event.start_time = payload.start_time
    if payload.end_time is not None:
        event.end_time = payload.end_time
    if payload.event_url is not None:
        setattr(event, "event_url", payload.event_url)
    try:
        await db.commit()
        await db.refresh(event)
        return {
            "id": str(event.id),
            "name": event.name,
            "description": event.description,
            "location": event.location,
            "event_date": event.event_date,
            "start_time": event.start_time,
            "end_time": event.end_time,
            "banner_image_url": event.banner_image_url,
            "event_url": getattr(event, "event_url", None),
        }
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/admin/merchants/{merchant_id}/items")
async def admin_list_menu_items(
    merchant_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin privileges required.")
    result = await db.execute(select(MenuItem).where(MenuItem.merchant_id == merchant_id))
    items = result.scalars().all()
    return [
        {
            "id": str(i.id),
            "merchant_id": str(i.merchant_id),
            "name": i.name,
            "description": i.description,
            "price": float(i.price),
            "image_url": i.image_url,
            "is_available": i.is_available,
            "approval_status": getattr(i, "approval_status", "approved"),
            "created_at": i.created_at,
        }
        for i in items
    ]


@app.get("/admin/merchants/{merchant_id}/pickup-slots")
async def admin_list_pickup_slots(
    merchant_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin privileges required.")
    result = await db.execute(select(PickupSlot).where(PickupSlot.merchant_id == merchant_id))
    slots = result.scalars().all()
    return [
        {
            "id": str(s.id),
            "merchant_id": str(s.merchant_id),
            "time_slot": s.time_slot,
            "max_capacity": s.max_capacity,
            "current_bookings": s.current_bookings,
            "is_full": s.current_bookings >= s.max_capacity,
        }
        for s in slots
    ]
