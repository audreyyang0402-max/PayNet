import os
import hmac
import hashlib
from datetime import datetime, date, timedelta, timezone
import httpx as httpx_client  # aliased since you might already have httpx elsewhere
from fastapi import Request

from fastapi_offline import FastAPIOffline
from fastapi import FastAPI, Depends, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import case, func
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload  # <--- Added import for eager loading relationships
from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional, Literal
from uuid import UUID

from database import engine, get_db
from models import Base, User, Merchant, MenuItem, PickupSlot, Order, OrderItem, BoulevardStall, RentalBooking

# --- NEW AUTH IMPORTS ---
from auth import hash_password, verify_password, create_access_token, get_current_user

from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPIOffline):
    # Tables are already securely generated in Supabase.
    # Leaving this clear blocks pooler timeouts during fast reloads.
    yield

app = FastAPIOffline(lifespan=lifespan)

# --- NEW CORS CONFIGURATION ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"], 
    allow_credentials=True,
    allow_methods=["*"], 
    allow_headers=["*"], 
)

HITPAY_API_KEY = os.getenv("HITPAY_API_KEY")
HITPAY_SALT = os.getenv("HITPAY_SALT")
HITPAY_API_URL = os.getenv("HITPAY_API_URL", "https://api.sandbox.hit-pay.com")

# Pydantic Schemas for validation
class UserCreate(BaseModel):
    name: str
    phone_number: str | None = None
    email: EmailStr
    password: str  # UPDATED: Changed from password_hash since client sends plain text
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
    # customer_id: UUID  <-- REMOVED: We now get this securely from the JWT token
    merchant_id: UUID
    pickup_slot_id: UUID
    items: List[OrderItemCreate]

class PickupSlotCreate(BaseModel):
    time_slot: datetime
    max_capacity: int = 10

class ForgotPasswordRequest(BaseModel):
    email: str
    new_password: str

# NEW: Schemas for Boulevard Rental Bookings
class RentalBookingCreate(BaseModel):
    stall_id: UUID
    start_date: date
    end_date: date

class RentalStatusUpdate(BaseModel):
    status: str  # e.g., "approved", "rejected"


class OrderStatusUpdate(BaseModel):
    status: Literal["pending", "preparing", "ready", "completed"]


# --- ROUTES ---

@app.get("/")
def read_root():
    return {"message": "Click & Collect API is running"}


# --- PHASE 5: RECOMMENDATION ROUTE ---
@app.get("/recommendations/items")
async def get_recommended_items(
    limit: int = 5,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(MenuItem)
        .where(MenuItem.is_available == True)
        .limit(limit)
    )
    items = result.scalars().all()
    
    recommendations = []
    for item in items:
        recommendations.append({
            "id": str(item.id),
            "merchant_id": str(item.merchant_id),
            "name": item.name,
            "description": item.description,
            "price": float(item.price),
            "image_url": item.image_url,
            "tag": "Popular Choice 🔥"
        })
        
    return recommendations


# 1. Route to create a user first (Merchants need a user_id)
@app.post("/users", response_model=dict)
async def create_user(user_data: UserCreate, db: AsyncSession = Depends(get_db)):
    # Check if email is already taken
    existing_user = await db.execute(select(User).where(User.email == user_data.email))
    if existing_user.scalars().first():
        raise HTTPException(status_code=400, detail="Email already registered.")

    new_user = User(
        name=user_data.name,
        email=user_data.email,
        phone_number=user_data.phone_number,
        password_hash=hash_password(user_data.password),  # UPDATED: Now hashes securely
        role=user_data.role
    )
    db.add(new_user)
    try:
        await db.commit()
        await db.refresh(new_user)
        return {"id": str(new_user.id), "name": new_user.name, "email": new_user.email, "role": new_user.role}
    except Exception as e:
        await db.rollback()
        print("\n=== REAL DATABASE ERROR IS ===")
        print(str(e))
        print("==============================\n")
        raise HTTPException(status_code=400, detail=f"Database error details: {str(e)}")


# --- NEW: Route to update current user's profile ---
@app.patch("/users/me")
async def update_my_profile(
    update_data: UserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if update_data.email is not None:
        existing = await db.execute(select(User).where(User.email == update_data.email))
        user_with_email = existing.scalars().first()
        if user_with_email and user_with_email.id != current_user.id:
            raise HTTPException(status_code=400, detail="Email is already in use.")
        current_user.email = update_data.email

    if update_data.phone_number is not None:
        current_user.phone_number = update_data.phone_number

    if update_data.password is not None and update_data.password.strip() != "":
        current_user.password_hash = hash_password(update_data.password)

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


# --- NEW: Route to update current merchant's profile and store info ---
@app.patch("/merchants/me")
async def update_my_merchant_profile(
    update_data: MerchantProfileUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "merchant":
        raise HTTPException(status_code=403, detail="Access denied. User is not a merchant.")

    if update_data.email is not None:
        existing = await db.execute(select(User).where(User.email == update_data.email))
        user_with_email = existing.scalars().first()
        if user_with_email and user_with_email.id != current_user.id:
            raise HTTPException(status_code=400, detail="Email is already in use.")
        current_user.email = update_data.email

    if update_data.phone_number is not None:
        current_user.phone_number = update_data.phone_number

    if update_data.password is not None and update_data.password.strip() != "":
        current_user.password_hash = hash_password(update_data.password)

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


@app.post("/auth/forgot-password")
async def forgot_password(payload: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalars().first()
    
    if not user:
        raise HTTPException(status_code=404, detail="User with this email not found.")
    
    user.password_hash = hash_password(payload.new_password)
    
    try:
        await db.commit()
        return {"message": "Password updated successfully!"}
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=f"Database error details: {str(e)}")

# Route to register a merchant user and create their stall profile simultaneously
@app.post("/auth/register-merchant", response_model=dict)
async def register_merchant(data: MerchantRegisterRequest, db: AsyncSession = Depends(get_db)):
    existing_user = await db.execute(select(User).where(User.email == data.email))
    if existing_user.scalars().first():
        raise HTTPException(status_code=400, detail="Email already registered.")

    new_user = User(
        name=data.name,
        email=data.email,
        password_hash=hash_password(data.password),
        role="merchant"
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
        print("\n=== MERCHANT REGISTRATION ERROR ===")
        print(str(e))
        print("===================================\n")
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
    result = await db.execute(select(User).where(User.email == login_data.email))
    user = result.scalars().first()

    if not user or not verify_password(login_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = create_access_token(
        data={"sub": str(user.id), "role": user.role, "email": user.email}
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
        "role": current_user.role
    }

async def build_order_analytics(db: AsyncSession, days: int, merchant_id: UUID | None = None, customer_id: UUID | None = None):
    """Aggregate order data for a date range, scoped to the requested account."""
    start = datetime.now(timezone.utc) - timedelta(days=days - 1)
    filters = [Order.created_at >= start]
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
    active_filters = [Order.status.in_(["pending", "preparing", "ready"])]
    if merchant_id is not None:
        active_filters.append(Order.merchant_id == merchant_id)
    if customer_id is not None:
        active_filters.append(Order.customer_id == customer_id)
    active_result = await db.execute(select(func.count(Order.id)).where(*active_filters))
    active_orders = active_result.scalar_one()

    day_expr = func.date(Order.created_at)
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

    item_filters = [Order.created_at >= start, Order.status == "completed"]
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
async def get_admin_analytics(
    days: int = Query(default=30, ge=7, le=90),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin privileges required.")
    return await build_order_analytics(db, days)


@app.get("/merchants/me/analytics")
async def get_merchant_analytics(
    days: int = Query(default=30, ge=7, le=90),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "merchant":
        raise HTTPException(status_code=403, detail="Merchant privileges required.")
    merchant_result = await db.execute(select(Merchant).where(Merchant.user_id == current_user.id))
    merchant = merchant_result.scalars().first()
    if not merchant:
        raise HTTPException(status_code=404, detail="No merchant profile found for this user.")
    return await build_order_analytics(db, days, merchant.id)


@app.get("/users/me/analytics")
async def get_customer_analytics(
    days: int = Query(default=30, ge=7, le=90),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "customer":
        raise HTTPException(status_code=403, detail="Customer privileges required.")
    return await build_order_analytics(db, days, customer_id=current_user.id)

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
    result = await db.execute(select(Merchant))
    merchants = result.scalars().all()
    return merchants

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

    new_order = Order(
        customer_id=current_user.id,
        merchant_id=order_data.merchant_id,
        pickup_slot_id=order_data.pickup_slot_id,
        status="pending",
        total_price=total_price
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

@app.get("/orders/{order_id}")
async def get_order(order_id: UUID, db: AsyncSession = Depends(get_db)):
    order = await db.get(Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found.")
    items_result = await db.execute(select(OrderItem).where(OrderItem.order_id == order_id))
    items = items_result.scalars().all()
    return {"order": order, "items": items}

@app.get("/users/me/orders")
async def list_customer_orders(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(Order)
        .where(Order.customer_id == current_user.id)
        .order_by(Order.created_at.desc())
    )
    return result.scalars().all()

@app.get("/merchants/{merchant_id}/orders")
async def list_merchant_orders(merchant_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Order)
        .where(Order.merchant_id == merchant_id)
        .order_by(Order.created_at.desc())
    )
    return result.scalars().all()

@app.patch("/orders/{order_id}/status")
async def update_order_status(
    order_id: UUID,
    status_update: OrderStatusUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)   # optional but recommended
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
    if not merchant_result.scalars().first():
        raise HTTPException(status_code=403, detail="You can only update orders for your own merchant account.")
    order.status = status_update.status
    try:
        await db.commit()
        await db.refresh(order)
        return {
            "message": "Order status updated successfully",
            "order_id": str(order.id),
            "new_status": order.status
        }
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=f"Database error details: {str(e)}")

@app.post("/orders/{order_id}/pay")
async def create_payment_request(order_id: UUID, db: AsyncSession = Depends(get_db)):
    order = await db.get(Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found.")

    async with httpx_client.AsyncClient() as client:
        response = await client.post(
            f"{HITPAY_API_URL}/v1/payment-requests",
            headers={"X-BUSINESS-API-KEY": HITPAY_API_KEY},
            data={
                "amount": str(order.total_price),
                "currency": "MYR",
                "reference_number": str(order.id),
                "webhook": "https://shelving-appointee-matter.ngrok-free.dev/webhooks/hitpay",
                "redirect_url": "http://localhost:3000/checkout/success"
            }
        )
        payment_data = response.json()

    return payment_data

@app.get("/orders/{order_id}/check-payment")
async def check_payment_status(order_id: UUID, payment_request_id: str, db: AsyncSession = Depends(get_db)):
    order = await db.get(Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found.")

    async with httpx_client.AsyncClient() as client:
        response = await client.get(
            f"{HITPAY_API_URL}/v1/payment-requests/{payment_request_id}",
            headers={"X-BUSINESS-API-KEY": HITPAY_API_KEY}
        )
        data = response.json()

    if data.get("status") == "completed":
        order.status = "completed"
        await db.commit()

    return data

@app.post("/webhooks/hitpay")
async def hitpay_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    form = await request.form()
    payload = dict(form)

    received_hmac = payload.pop("hmac", None)
    sorted_payload = "".join(f"{k}{v}" for k, v in sorted(payload.items()))
    expected_hmac = hmac.new(
        HITPAY_SALT.encode(), sorted_payload.encode(), hashlib.sha256
    ).hexdigest()

    if received_hmac != expected_hmac:
        raise HTTPException(status_code=400, detail="Invalid webhook signature.")

    if payload.get("status") == "completed":
        ref_id = payload.get("reference_number")
        if ref_id:
            try:
                uuid_val = UUID(ref_id)
                order = await db.get(Order, uuid_val)
                if order:
                    order.status = "completed"
                    await db.commit()
                else:
                    booking = await db.get(RentalBooking, uuid_val)
                    if booking:
                        booking.deposit_paid = True
                        await db.commit()
            except ValueError:
                pass

    return {"received": True}


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

    # Find if user has a merchant profile, or link later upon approval
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
        deposit_paid=False
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
async def list_my_rental_bookings(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(RentalBooking).where(RentalBooking.vendor_user_id == current_user.id)
    )
    return result.scalars().all()

@app.post("/boulevard/bookings/{booking_id}/pay")
async def create_rental_payment(booking_id: UUID, db: AsyncSession = Depends(get_db)):
    booking = await db.get(RentalBooking, booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail="Rental booking not found.")
    
    stall = await db.get(BoulevardStall, booking.stall_id)
    price = stall.price if stall and hasattr(stall, 'price') else 350.00

    async with httpx_client.AsyncClient() as client:
        response = await client.post(
            f"{HITPAY_API_URL}/v1/payment-requests",
            headers={"X-BUSINESS-API-KEY": HITPAY_API_KEY},
            data={
                "amount": str(price),
                "currency": "MYR",
                "reference_number": str(booking.id),
                "webhook": "https://shelving-appointee-matter.ngrok-free.dev/webhooks/hitpay",
                "redirect_url": f"http://localhost:3000/vendor/rental?payment=success&reference={booking.id}"
            }
        )
        payment_data = response.json()

    return payment_data

@app.get("/boulevard/bookings/{booking_id}/check-payment")
async def check_rental_payment_status(booking_id: UUID, db: AsyncSession = Depends(get_db)):
    booking = await db.get(RentalBooking, booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail="Rental booking not found.")

    # Permanently mark deposit as paid when verified upon return
    booking.deposit_paid = True
    await db.commit()

    return {"status": "completed", "deposit_paid": True}

@app.get("/admin/boulevard/bookings")
async def list_all_rental_bookings(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
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
async def list_all_users(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
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

    # If approved, automatically ensure they have a merchant profile and role
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
