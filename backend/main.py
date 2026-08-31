from fastapi_offline import FastAPIOffline
from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from pydantic import BaseModel, EmailStr
from typing import List, Optional
from uuid import UUID

from database import engine, get_db
from models import Base, User, Merchant

from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPIOffline):
    # Tables are already securely generated in Supabase.
    # Leaving this clear blocks pooler timeouts during fast reloads.
    yield

app = FastAPIOffline(lifespan=lifespan)

# Pydantic Schemas for validation
class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password_hash: str
    role: str = "customer"

class MerchantCreate(BaseModel):
    user_id: UUID
    name: str
    description: Optional[str] = None
    location: Optional[str] = None


# --- ROUTES ---

@app.get("/")
def read_root():
    return {"message": "Click & Collect API is running"}


# 1. Route to create a user first (Merchants need a user_id)
@app.post("/users", response_model=dict)
async def create_user(user_data: UserCreate, db: AsyncSession = Depends(get_db)):
    new_user = User(
        name=user_data.name,
        email=user_data.email,
        password_hash=user_data.password_hash,  # Note: Add hashing service layer in a later phase
        role=user_data.role
    )
    db.add(new_user)
    try:
        await db.commit()
        await db.refresh(new_user)
        return {"id": str(new_user.id), "name": new_user.name, "role": new_user.role}
    except Exception as e:
        await db.rollback()
        # MODIFIED: Prints the real hidden database exception straight to your uvicorn console logs
        print("\n=== REAL DATABASE ERROR IS ===")
        print(str(e))
        print("==============================\n")
        raise HTTPException(status_code=400, detail=f"Database error details: {str(e)}")


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


