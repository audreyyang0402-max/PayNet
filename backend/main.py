import os
import hmac
import hashlib
from datetime import datetime
import httpx as httpx_client  # aliased since you might already have httpx elsewhere
from fastapi import Request

from fastapi_offline import FastAPIOffline
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware # <-- NEW IMPORT
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from pydantic import BaseModel, EmailStr
from typing import List, Optional
from uuid import UUID

from database import engine, get_db
from models import Base, User, Merchant, MenuItem, PickupSlot, Order, OrderItem

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
    email: EmailStr
    password: str  # UPDATED: Changed from password_hash since client sends plain text
    role: str = "customer"

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
    quantity: int = 1

class OrderCreate(BaseModel):
    # customer_id: UUID  <-- REMOVED: We now get this securely from the JWT token
    merchant_id: UUID
    pickup_slot_id: UUID
    items: List[OrderItemCreate]

class PickupSlotCreate(BaseModel):
    time_slot: datetime
    max_capacity: int = 10


# --- ROUTES ---

@app.get("/")
def read_root():
    return {"message": "Click & Collect API is running"}


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
        # MODIFIED: Prints the real hidden database exception straight to your uvicorn console logs
        print("\n=== REAL DATABASE ERROR IS ===")
        print(str(e))
        print("==============================\n")
        raise HTTPException(status_code=400, detail=f"Database error details: {str(e)}")

# Route to register a merchant user and create their stall profile simultaneously
@app.post("/auth/register-merchant", response_model=dict)
async def register_merchant(data: MerchantRegisterRequest, db: AsyncSession = Depends(get_db)):
    # Check if email is already taken
    existing_user = await db.execute(select(User).where(User.email == data.email))
    if existing_user.scalars().first():
        raise HTTPException(status_code=400, detail="Email already registered.")

    # 1. Create the user account with role="merchant"
    new_user = User(
        name=data.name,
        email=data.email,
        password_hash=hash_password(data.password),
        role="merchant"
    )
    db.add(new_user)
    await db.flush()  # Flushes to generate new_user.id without full commit yet

    # 2. Create the linked merchant store profile
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

# Route to get the merchant profile of the currently logged-in user
@app.get("/merchants/me/profile")
async def get_my_merchant_profile(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Ensure only merchants can access this
    if current_user.role != "merchant":
        raise HTTPException(status_code=403, detail="Access denied. User is not a merchant.")
    
    # Find the merchant profile linked to this user's ID
    result = await db.execute(select(Merchant).where(Merchant.user_id == current_user.id))
    merchant = result.scalars().first()
    
    if not merchant:
        raise HTTPException(status_code=404, detail="No merchant profile found for this user.")
        
    return merchant


# 1b. Route to login and receive a JWT Token (NEW)
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

    # Issue JWT Token
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


# 1c. Route to Verify Current User Token (Useful for Next.js app startup) (NEW)
@app.get("/auth/me")
async def get_me(current_user: User = Depends(get_current_user)):
    return {
        "id": str(current_user.id),
        "name": current_user.name,
        "email": current_user.email,
        "role": current_user.role
    }


# 2. Route to create a merchant
@app.post("/merchants")
async def create_merchant(merchant_data: MerchantCreate, db: AsyncSession = Depends(get_db)):
    # Verify the user exists before binding them as a merchant owner
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


# 3. Route to list all active merchants
@app.get("/merchants")
async def list_merchants(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Merchant))
    merchants = result.scalars().all()
    return merchants


# 4. Route to create a menu item under a specific merchant
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


# --- NEW: Routes to Update and Delete Menu Items ---

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


# Route to create a pickup slot under a specific merchant
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


# 5. Route to list pickup slots for a merchant
@app.get("/merchants/{merchant_id}/pickup-slots")
async def list_pickup_slots(merchant_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(PickupSlot).where(PickupSlot.merchant_id == merchant_id))
    return result.scalars().all()

# Route to delete a pickup slot
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


# 6. Route to list all menu items for a specific merchant
@app.get("/merchants/{merchant_id}/items")
async def list_menu_items(merchant_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(MenuItem).where(MenuItem.merchant_id == merchant_id))
    return result.scalars().all()


# 7. Route to place an order (checkout)
@app.post("/orders")
async def create_order(
    order_data: OrderCreate, 
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)  # UPDATED: Secured with JWT
):
    # Validate the pickup slot exists and has room
    slot = await db.get(PickupSlot, order_data.pickup_slot_id)
    if not slot:
        raise HTTPException(status_code=404, detail="Pickup slot not found.")
    if slot.current_bookings >= slot.max_capacity:
        raise HTTPException(status_code=400, detail="This pickup slot is fully booked.")

    # Validate items and calculate total price server-side (never trust client prices)
    total_price = 0
    line_items = []
    for line in order_data.items:
        item = await db.get(MenuItem, line.menu_item_id)
        if not item:
            raise HTTPException(status_code=404, detail=f"Menu item {line.menu_item_id} not found.")
        if not item.is_available:
            raise HTTPException(status_code=400, detail=f"'{item.name}' is currently unavailable.")
        line_total = float(item.price) * line.quantity
        total_price += line_total
        line_items.append((item, line.quantity))

    # Create the order
    new_order = Order(
        customer_id=current_user.id,  # UPDATED: Derived securely from JWT token
        merchant_id=order_data.merchant_id,
        pickup_slot_id=order_data.pickup_slot_id,
        status="pending",
        total_price=total_price
    )
    db.add(new_order)

    try:
        await db.flush()  # gets new_order.id without fully committing yet

        # Create order line items
        for item, quantity in line_items:
            db.add(OrderItem(
                order_id=new_order.id,
                menu_item_id=item.id,
                quantity=quantity,
                price_at_order=item.price
            ))

        # Lock in the pickup slot
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


# Route to list all orders for a specific customer
@app.get("/users/me/orders")  # UPDATED: Endpoint changed to /users/me/orders
async def list_customer_orders(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)  # UPDATED: Secured with JWT
):
    result = await db.execute(
        select(Order)
        .where(Order.customer_id == current_user.id)
        .order_by(Order.created_at.desc())
    )
    return result.scalars().all()


# --- Routes for Merchant Order Management ---

# Route to list all incoming orders for a specific merchant
@app.get("/merchants/{merchant_id}/orders")
async def list_merchant_orders(merchant_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Order)
        .where(Order.merchant_id == merchant_id)
        .order_by(Order.created_at.desc())
    )
    return result.scalars().all()


# Route to update order status (e.g., pending -> preparing -> ready)
@app.patch("/orders/{order_id}/status")
async def update_order_status(order_id: UUID, status: str, db: AsyncSession = Depends(get_db)):
    order = await db.get(Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found.")
    
    order.status = status
    try:
        await db.commit()
        await db.refresh(order)
        return {"message": "Order status updated successfully", "status": order.status}
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=f"Database error details: {str(e)}")


# Route to create a HitPay payment request for an order
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


# Route to receive HitPay's payment confirmation webhook
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
        order_id = payload.get("reference_number")
        order = await db.get(Order, UUID(order_id))
        if order:
            order.status = "completed"
            await db.commit()

    return {"received": True}