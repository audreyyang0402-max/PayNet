"""Merchant-only surplus listing outcomes, without inferred waste savings."""

from datetime import datetime
from decimal import Decimal

PAID_STATUSES = {"preparing", "ready", "completed"}
PENDING_STATUSES = {"draft", "pending", "pending_verification"}


def summarize_surplus(offers, order_rows, food_logs, now: datetime) -> dict:
    """Order rows are (offer ID, order status, portions, line value)."""
    offer_list = list(offers)
    paid = pending = completed = rejected = 0
    paid_revenue = Decimal("0.00")
    per_offer = {offer.id: {"confirmed_portions": 0, "completed_portions": 0,
                            "pending_portions": 0, "rejected_portions": 0} for offer in offer_list}
    for offer_id, status, quantity, value in order_rows:
        metrics = per_offer.get(offer_id)
        if metrics is None:
            continue
        quantity = int(quantity)
        if status in PAID_STATUSES:
            paid += quantity
            paid_revenue += Decimal(str(value))
            metrics["confirmed_portions"] += quantity
        if status == "completed":
            completed += quantity
            metrics["completed_portions"] += quantity
        elif status in PENDING_STATUSES:
            pending += quantity
            metrics["pending_portions"] += quantity
        elif status == "rejected":
            rejected += quantity
            metrics["rejected_portions"] += quantity
    past_keys = {(offer.menu_item_id, offer.service_date) for offer in offer_list
                 if offer.service_date < now.date()}
    logged = {(log.menu_item_id, log.service_date): log for log in food_logs
              if (log.menu_item_id, log.service_date) in past_keys}
    return {
        "offers_created": len(offer_list),
        "listed_portions": sum(offer.total_portions for offer in offer_list),
        "confirmed_portions": paid,
        "completed_portions": completed,
        "pending_portions": pending,
        "rejected_portions": rejected,
        "confirmed_order_value": float(paid_revenue),
        "past_offer_dish_days": len(past_keys),
        "logged_offer_dish_days": len(logged),
        "discarded_portions_on_logged_offer_days": sum(log.discarded_portions for log in logged.values()),
        "by_offer": {str(offer_id): values for offer_id, values in per_offer.items()},
    }
