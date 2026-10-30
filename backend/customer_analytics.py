"""Customer-only spending summaries, grouped by Malaysian calendar day."""
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from sqlalchemy import select, func
from models import Order, OrderItem, MenuItem

MYT = timezone(timedelta(hours=8))
PAID = {"preparing", "ready", "completed"}
PENDING = {"pending", "pending_verification"}

def summarize(orders, days, now=None):
    now = (now or datetime.now(timezone.utc)).astimezone(MYT)
    today = now.date()
    start = today - timedelta(days=days-1)
    daily = {start + timedelta(days=i): {"spent": Decimal(0), "orders": 0} for i in range(days)}
    spent = pending = completed_spent = Decimal(0)
    completed = placed = active = 0
    paid_dates = set()
    for order in orders:
        timestamp = order.created_at
        if timestamp.tzinfo is None:
            timestamp = timestamp.replace(tzinfo=timezone.utc)
        day = timestamp.astimezone(MYT).date()
        if timestamp > now:
            continue
        amount = Decimal(str(order.total_price))
        if order.status in PAID:
            paid_dates.add(day)
        if order.status in PAID - {"completed"} or order.status in PENDING:
            active += 1
        if day not in daily:
            continue
        placed += 1
        daily[day]["orders"] += 1
        if order.status in PAID:
            spent += amount
            daily[day]["spent"] += amount
        if order.status in PENDING:
            pending += amount
        if order.status == "completed":
            completed += 1
            completed_spent += amount
    cursor = today if today in paid_dates else today - timedelta(days=1)
    streak = 0
    while cursor in paid_dates:
        streak += 1
        cursor -= timedelta(days=1)
    return {
        "period_days": days, "timezone": "Asia/Kuala_Lumpur", "updated_at": now.isoformat(),
        "summary": {"total_spent": float(spent), "pending_amount": float(pending),
                    "today_spent": float(daily[today]["spent"]), "total_orders": placed,
                    "active_orders": active, "completed_orders": completed,
                    "average_completed_order": float(round(completed_spent / completed, 2)) if completed else 0,
                    "daily_average": float(round(spent / days, 2)), "ordering_streak": streak},
        "daily": [{"date": day.isoformat(), "spent": float(values["spent"]), "orders": values["orders"]} for day, values in daily.items()]
    }

async def build_customer_analytics(db, customer_id, days):
    now = datetime.now(timezone.utc)
    # Only this authenticated customer's lightweight order fields; no order-detail N+1 calls.
    rows = (await db.execute(select(Order.created_at, Order.status, Order.total_price).where(Order.customer_id == customer_id))).all()
    result = summarize(rows, days, now)
    start = (now.astimezone(MYT) - timedelta(days=days-1)).replace(hour=0, minute=0, second=0, microsecond=0)
    items = await db.execute(select(MenuItem.id, MenuItem.name,
        func.sum(OrderItem.quantity).label("quantity"),
        func.sum(OrderItem.quantity * OrderItem.price_at_order).label("spent"))
        .join(OrderItem, OrderItem.menu_item_id == MenuItem.id).join(Order, Order.id == OrderItem.order_id)
        .where(Order.customer_id == customer_id, Order.status.in_(PAID), Order.created_at >= start, Order.created_at <= now)
        .group_by(MenuItem.id, MenuItem.name).order_by(func.sum(OrderItem.quantity).desc(), MenuItem.name).limit(5))
    result["top_items"] = [{"id": str(r.id), "name": r.name, "quantity": int(r.quantity), "spent": float(r.spent)} for r in items]
    return result
