import os
os.environ["DATABASE_URL"] = "postgresql+asyncpg://test:test@127.0.0.1/test"
os.environ["SECRET_KEY"] = "test-only-secret-never-use-in-production-0123456789"
os.environ["SUPABASE_URL"] = ""
os.environ["SUPABASE_SERVICE_ROLE_KEY"] = ""

import unittest
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace as NS
from uuid import uuid4
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi import HTTPException
from pydantic import ValidationError

from promotions import discounted_price, comparison_window, PromotionCreate, create_promotion, stop_promotion, list_promotions, owner
from main import create_order, OrderCreate
from models import OrderItem
from fastapi.testclient import TestClient
from database import get_db
import main


def rows(values):
    result = MagicMock()
    result.scalars.return_value.all.return_value = values
    result.scalars.return_value.first.return_value = values[0] if values else None
    result.all.return_value = values
    result.first.return_value = values[0] if values else None
    return result


class PricingTests(unittest.TestCase):
    def test_currency_rounding_and_minimum_price(self):
        p = NS(discount_type="percentage", discount_value=Decimal("12.5"))
        self.assertEqual(discounted_price(Decimal("9.99"), p), Decimal("8.74"))
        p.discount_type = "fixed"
        p.discount_value = Decimal("2")
        self.assertEqual(discounted_price(Decimal("10"), p), Decimal("8.00"))
        self.assertEqual(discounted_price(Decimal("1"), p), Decimal("0.01"))

    def test_invalid_offers_rejected(self):
        now = datetime.now(timezone.utc)
        data = dict(name="Lunch", menu_item_id=uuid4(), discount_type="percentage", discount_value=10,
                    starts_at=now, ends_at=now + timedelta(days=7))
        for extra in [dict(discount_value=100), dict(discount_value=-2), dict(discount_type="unknown"),
                      dict(ends_at=now), dict(starts_at=now.replace(tzinfo=None)), dict(name="   ")]:
            with self.subTest(extra=extra), self.assertRaises(ValidationError):
                PromotionCreate(**(data | extra))

    def test_baseline_matches_weekday_and_does_not_overlap(self):
        start = datetime(2026, 11, 1, tzinfo=timezone.utc)
        p = NS(starts_at=start, ends_at=start + timedelta(days=10), stopped_at=None)
        end, before, before_end, days = comparison_window(p, start + timedelta(days=9))
        self.assertEqual(days, 9)
        self.assertEqual(before.weekday(), start.weekday())
        self.assertLessEqual(before_end, start)
        self.assertEqual(end - start, before_end - before)
        p.stopped_at = start - timedelta(days=1)
        self.assertEqual(comparison_window(p, end)[3], 0)


class PromotionApiTests(unittest.IsolatedAsyncioTestCase):
    async def test_http_router_and_validation_without_starting_database(self):
        db = NS(execute=AsyncMock(return_value=rows([])))
        overrides = {get_db: lambda: db, owner: lambda: NS(id=uuid4())}
        # No lifespan context: the startup migration runner is never executed.
        with patch.dict(main.app.dependency_overrides, overrides):
            client = TestClient(main.app)
            self.assertEqual(client.get("/merchants/me/promotions").json(), [])
            response = client.post("/merchants/me/promotions", json={"name": "Invalid"})
            self.assertEqual(response.status_code, 422)

    async def test_ownership_and_overlap(self):
        now = datetime.now(timezone.utc)
        merchant = NS(id=uuid4())
        item = NS(id=uuid4(), merchant_id=uuid4(), price=Decimal(10))
        data = PromotionCreate(name="Lunch", menu_item_id=item.id, discount_type="fixed", discount_value=2,
                               starts_at=now, ends_at=now + timedelta(days=1))
        db = MagicMock(get=AsyncMock(return_value=item), execute=AsyncMock(side_effect=[rows([]), rows([uuid4()])]))
        with self.assertRaises(HTTPException) as error:
            await create_promotion(data, db, merchant)
        self.assertEqual(error.exception.status_code, 404)
        item.merchant_id = merchant.id
        db.execute = AsyncMock(side_effect=[rows([]), rows([uuid4()])])
        with self.assertRaises(HTTPException) as error:
            await create_promotion(data, db, merchant)
        self.assertEqual(error.exception.status_code, 409)
        db.get = AsyncMock(return_value=NS(merchant_id=uuid4()))
        with self.assertRaises(HTTPException) as error:
            await stop_promotion(uuid4(), db, merchant)
        self.assertEqual(error.exception.status_code, 404)
        with self.assertRaises(HTTPException) as error:
            await owner(db, NS(role="customer"))
        self.assertEqual(error.exception.status_code, 403)

    async def test_report_uses_snapshots_and_excludes_refund_cases(self):
        now = datetime.now(timezone.utc)
        start = now - timedelta(days=2)
        campaign = NS(id=uuid4(), menu_item_id=uuid4(), name="Lunch", starts_at=start,
                      ends_at=now + timedelta(days=2), stopped_at=None, discount_type="fixed", discount_value=Decimal(2))
        def line(promotion_id, quantity=1):
            return NS(menu_item_id=campaign.menu_item_id, promotion_id=promotion_id, price_at_order=Decimal(8 if promotion_id else 10),
                      quantity=quantity, order_id=uuid4(), discount_at_order=Decimal(2))
        records = [(line(None), start - timedelta(days=6), None),
                   (line(campaign.id, 3), start + timedelta(hours=1), None),
                   (line(campaign.id, 2), start + timedelta(hours=2), "verified")]
        db = NS(execute=AsyncMock(side_effect=[rows([(campaign, "Coffee")]), rows(records)]))
        result = (await list_promotions(db, NS(id=uuid4())))[0]
        self.assertEqual(result["promotion"]["revenue"], 24)
        self.assertEqual(result["promotion"]["discount"], 6)
        self.assertEqual(result["normal"]["revenue"], 10)
        self.assertEqual(result["excluded_refund_case_value"], 16)
        self.assertEqual(result["units_change_pct"], 200)

    async def test_checkout_calculates_discount_and_persists_prices(self):
        merchant_id, item_id, promotion_id, slot_id = [uuid4() for _ in range(4)]
        item = NS(id=item_id, merchant_id=merchant_id, price=Decimal("10"), name="Coffee", is_available=True, approval_status="approved")
        offer = NS(id=promotion_id, discount_type="percentage", discount_value=Decimal(20))
        slot = NS(merchant_id=merchant_id, time_slot=datetime.now(timezone.utc) + timedelta(days=1), current_bookings=0, max_capacity=10)
        db = MagicMock(get=AsyncMock(side_effect=[NS(is_active=True, is_preview=False, is_deleted=False), item]),
                       execute=AsyncMock(side_effect=[rows([slot]), rows([])]), flush=AsyncMock(), commit=AsyncMock(), refresh=AsyncMock(), rollback=AsyncMock())
        data = OrderCreate(merchant_id=merchant_id, pickup_slot_id=slot_id, items=[dict(menu_item_id=item_id, quantity=2, expected_price="8.00")])
        with patch("main.expire_stale_drafts", AsyncMock()), patch("main.active_promotions", AsyncMock(return_value={item_id: offer})):
            result = await create_order(data, db, NS(id=uuid4()))
        self.assertEqual(result.total_price, Decimal(16))
        snapshot = [call.args[0] for call in db.add.call_args_list if isinstance(call.args[0], OrderItem)][0]
        self.assertEqual(snapshot.price_at_order, Decimal(8))
        self.assertEqual(snapshot.original_price_at_order, Decimal(10))
        self.assertEqual(snapshot.discount_at_order, Decimal(2))
        self.assertEqual(snapshot.promotion_id, promotion_id)
        item.price = Decimal(25)
        self.assertEqual(snapshot.price_at_order, Decimal(8))

    async def test_expired_discount_price_is_rejected_before_reserving_slot(self):
        merchant_id, item_id = uuid4(), uuid4()
        slot = NS(merchant_id=merchant_id, time_slot=datetime.now(timezone.utc) + timedelta(days=1), current_bookings=0, max_capacity=10)
        item = NS(id=item_id, merchant_id=merchant_id, price=Decimal(10), name="Coffee", is_available=True, approval_status="approved")
        db = MagicMock(get=AsyncMock(side_effect=[NS(is_active=True, is_preview=False, is_deleted=False), item]), execute=AsyncMock(return_value=rows([slot])))
        data = OrderCreate(merchant_id=merchant_id, pickup_slot_id=uuid4(), items=[dict(menu_item_id=item_id, expected_price=8)])
        with patch("main.expire_stale_drafts", AsyncMock()), patch("main.active_promotions", AsyncMock(return_value={})):
            with self.assertRaises(HTTPException) as error:
                await create_order(data, db, NS(id=uuid4()))
        self.assertEqual(error.exception.status_code, 409)
        self.assertEqual(slot.current_bookings, 0)
        db.add.assert_not_called()


if __name__ == "__main__":
    unittest.main()
