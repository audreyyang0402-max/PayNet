"""Scheduled, non-stacking item discounts and historical campaign comparisons."""
from datetime import datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
from math import ceil
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import select, text, or_
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from database import get_db
from models import Merchant, MenuItem, Promotion, Order, OrderItem, RefundRequest, User

MIGRATIONS = [
    """CREATE TABLE IF NOT EXISTS promotions (
        id UUID PRIMARY KEY, merchant_id UUID NOT NULL REFERENCES merchants(id),
        menu_item_id UUID NOT NULL REFERENCES menu_items(id), name VARCHAR(100) NOT NULL,
        discount_type VARCHAR NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
        discount_value NUMERIC(10,2) NOT NULL CHECK (discount_value > 0),
        starts_at TIMESTAMPTZ NOT NULL, ends_at TIMESTAMPTZ NOT NULL,
        stopped_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CHECK (ends_at > starts_at))""",
    "CREATE INDEX IF NOT EXISTS promotions_merchant_idx ON promotions(merchant_id)",
    "CREATE INDEX IF NOT EXISTS promotions_item_idx ON promotions(menu_item_id, starts_at, ends_at)",
    "ALTER TABLE order_items ADD COLUMN IF NOT EXISTS original_price_at_order NUMERIC(10,2)",
    "ALTER TABLE order_items ADD COLUMN IF NOT EXISTS discount_at_order NUMERIC(10,2) NOT NULL DEFAULT 0",
    "ALTER TABLE order_items ADD COLUMN IF NOT EXISTS promotion_id UUID REFERENCES promotions(id)",
]


def money(value):
    return Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def discounted_price(price, promotion):
    original = money(price)
    discount = (original * promotion.discount_value / 100 if promotion.discount_type == "percentage"
                else promotion.discount_value)
    # Never create a free or negative item, including after a subsequent base-price change.
    return max(Decimal("0.01"), money(original - discount))


async def active_promotions(db, merchant_id, now=None):
    now = now or datetime.now(timezone.utc)
    rows = await db.execute(select(Promotion).where(
        Promotion.merchant_id == merchant_id, Promotion.starts_at <= now,
        Promotion.ends_at > now, Promotion.stopped_at.is_(None)))
    return {p.menu_item_id: p for p in rows.scalars().all()}


def public_offer(p, base_price):
    return {"id": str(p.id), "name": p.name, "starts_at": p.starts_at,
            "ends_at": p.ends_at, "sale_price": float(discounted_price(base_price, p))}


class PromotionCreate(BaseModel):
    menu_item_id: UUID
    name: str = Field(min_length=1, max_length=100)
    discount_type: str
    discount_value: Decimal = Field(gt=0, max_digits=10, decimal_places=2)
    starts_at: datetime
    ends_at: datetime

    @model_validator(mode="after")
    def valid_offer(self):
        self.name = self.name.strip()
        if not self.name or self.discount_type not in {"percentage", "fixed"}:
            raise ValueError("Enter a name and a percentage or fixed discount.")
        if self.starts_at.tzinfo is None or self.ends_at.tzinfo is None:
            raise ValueError("Promotion dates must include a timezone.")
        if self.ends_at <= self.starts_at or self.ends_at - self.starts_at > timedelta(days=90):
            raise ValueError("Choose an end after the start, within 90 days.")
        if self.discount_type == "percentage" and self.discount_value >= 100:
            raise ValueError("Percentage discounts must be below 100%.")
        return self


router = APIRouter(prefix="/merchants/me/promotions", tags=["promotions"])


async def owner(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    if user.role != "merchant":
        raise HTTPException(403, "Merchant access required.")
    merchant = (await db.execute(select(Merchant).where(Merchant.user_id == user.id))).scalars().first()
    if not merchant:
        raise HTTPException(404, "Merchant not found.")
    return merchant


@router.post("")
async def create_promotion(payload: PromotionCreate, db: AsyncSession = Depends(get_db), merchant=Depends(owner)):
    await db.execute(text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"),
                     {"key": f"promotion:{merchant.id}"})
    item = await db.get(MenuItem, payload.menu_item_id)
    if not item or item.merchant_id != merchant.id:
        raise HTTPException(404, "Choose a dish from your own menu.")
    if payload.ends_at <= datetime.now(timezone.utc):
        raise HTTPException(400, "The promotion must end in the future.")
    if payload.discount_type == "fixed" and payload.discount_value >= item.price:
        raise HTTPException(400, "The RM discount must be less than the normal price.")
    overlap = (await db.execute(select(Promotion.id).where(
        Promotion.menu_item_id == item.id, Promotion.stopped_at.is_(None),
        Promotion.starts_at < payload.ends_at, Promotion.ends_at > payload.starts_at))).first()
    if overlap:
        raise HTTPException(409, "This dish already has a promotion during those dates.")
    data = payload.model_dump()
    # Offers begin no earlier than creation; never report unobserved discounted days.
    data["starts_at"] = max(payload.starts_at, datetime.now(timezone.utc))
    if data["starts_at"] >= payload.ends_at:
        raise HTTPException(400, "Choose a later promotion end.")
    promotion = Promotion(merchant_id=merchant.id, **data)
    db.add(promotion)
    await db.commit()
    return {"id": str(promotion.id)}


@router.post("/{promotion_id}/stop")
async def stop_promotion(promotion_id: UUID, db: AsyncSession = Depends(get_db), merchant=Depends(owner)):
    p = await db.get(Promotion, promotion_id)
    if not p or p.merchant_id != merchant.id:
        raise HTTPException(404, "Promotion not found.")
    if p.stopped_at is None:
        p.stopped_at = datetime.now(timezone.utc)
        await db.commit()
    return {"stopped": True}


def comparison_window(p, now):
    end = max(p.starts_at, min(p.ends_at, p.stopped_at or p.ends_at, now))
    duration = max(timedelta(0), end - p.starts_at)
    # Whole-week offset preserves weekday/time, and keeps comparison windows disjoint.
    offset = timedelta(weeks=max(1, ceil(duration.total_seconds() / (7 * 86400))))
    return end, p.starts_at - offset, end - offset, duration.total_seconds() / 86400


def change(current, baseline):
    return round((current / baseline - 1) * 100, 1) if baseline else None


@router.get("")
async def list_promotions(db: AsyncSession = Depends(get_db), merchant=Depends(owner)):
    now = datetime.now(timezone.utc)
    campaigns = (await db.execute(select(Promotion, MenuItem.name).join(MenuItem, MenuItem.id == Promotion.menu_item_id)
                                 .where(Promotion.merchant_id == merchant.id).order_by(Promotion.created_at.desc()))).all()
    result = []
    # Read all relevant order lines once; historical unit prices are never inferred from today's menu.
    lines = []
    if campaigns:
        earliest = min(comparison_window(p, now)[1] for p, _ in campaigns)
        lines = (await db.execute(select(OrderItem, Order.created_at, RefundRequest.status.label("refund_status"))
            .join(Order, Order.id == OrderItem.order_id)
            .outerjoin(RefundRequest, RefundRequest.order_id == Order.id)
            .where(Order.merchant_id == merchant.id, Order.created_at >= earliest,
                   Order.created_at <= now,
                   or_(Order.status.in_(["preparing", "ready", "completed"]), RefundRequest.id.isnot(None))))).all()
    for p, item_name in campaigns:
        end, baseline_start, baseline_end, days = comparison_window(p, now)
        promoted = {"units": 0, "revenue": Decimal(0), "discount": Decimal(0), "orders": set()}
        normal = {"units": 0, "revenue": Decimal(0), "orders": set()}
        excluded = Decimal(0)
        for line, created, refund_status in lines:
            if line.menu_item_id != p.menu_item_id:
                continue
            in_promotion = line.promotion_id == p.id and p.starts_at <= created < end
            in_baseline = line.promotion_id is None and baseline_start <= created < baseline_end
            if not (in_promotion or in_baseline):
                continue
            if refund_status is not None:
                if in_promotion:
                    excluded += line.price_at_order * line.quantity
                continue
            target = promoted if in_promotion else normal
            target["units"] += line.quantity
            target["revenue"] += line.price_at_order * line.quantity
            target["orders"].add(line.order_id)
            if in_promotion:
                target["discount"] += line.discount_at_order * line.quantity
        for group in (promoted, normal):
            group["orders"] = len(group["orders"])
            group["revenue"] = float(money(group["revenue"]))
            group["units_per_day"] = round(group["units"] / days, 2) if days else None
            group["revenue_per_day"] = round(group["revenue"] / days, 2) if days else None
        promoted["discount"] = float(money(promoted["discount"]))
        result.append({"id": str(p.id), "name": p.name, "item_name": item_name,
            "discount_type": p.discount_type, "discount_value": float(p.discount_value),
            "starts_at": p.starts_at, "ends_at": p.ends_at, "observed_until": end,
            "status": "stopped" if p.stopped_at else "scheduled" if now < p.starts_at else "ended" if now >= p.ends_at else "active",
            "baseline_start": baseline_start, "baseline_end": baseline_end,
            "observed_days": days, "promotion": promoted, "normal": normal,
            "excluded_refund_case_value": float(money(excluded)),
            "units_change_pct": change(promoted["units"], normal["units"]) if days else None,
            "revenue_change_pct": change(promoted["revenue"], normal["revenue"]) if days else None})
    return result
