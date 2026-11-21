import os
os.environ['DATABASE_URL'] = 'postgresql+asyncpg://test:test@127.0.0.1/test'
os.environ['SECRET_KEY'] = 'test-only-secret-never-use-in-production-0123456789'
os.environ['SUPABASE_URL'] = ''
os.environ['SUPABASE_SERVICE_ROLE_KEY'] = ''
import hashlib
import json
import unittest
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi import HTTPException
from main import create_order, OrderCreate, shop_is_public, require_shop_access, reserved_offer_orders, surplus_offer_payloads


class CheckoutTests(unittest.IsolatedAsyncioTestCase):
    async def test_deal_is_hidden_when_order_limit_is_reached(self):
        now = datetime.now(timezone.utc)
        offer_id, merchant_id, item_id, slot_id = uuid4(), uuid4(), uuid4(), uuid4()
        offer = SimpleNamespace(id=offer_id, merchant_id=merchant_id, menu_item_id=item_id,
                                total_portions=20, max_orders=1, is_active=True,
                                expires_at=now + timedelta(minutes=40), sale_price=Decimal("3.00"),
                                service_date=now.date())
        item = SimpleNamespace(id=item_id, name="Deal item", description="", price=Decimal("5.00"),
                               is_available=True, approval_status="approved")
        slot = SimpleNamespace(id=slot_id, time_slot=now + timedelta(hours=1),
                               is_bookable=True, is_automatic=False, current_bookings=0, max_capacity=10)
        merchant = SimpleNamespace(id=merchant_id, name="Test stall", location="Campus",
                                   pickup_schedule=None, is_active=True, is_preview=False, is_deleted=False)
        no_stock = MagicMock()
        no_stock.scalars.return_value.first.return_value = None
        db = MagicMock(execute=AsyncMock(side_effect=[[], [(offer_id, 1)], no_stock]))
        with patch('main.public_menu_item', return_value={"image_url": None}):
            [payload] = await surplus_offer_payloads(db, [(offer, item, slot, merchant)], now)
        self.assertEqual(payload["remaining_portions"], 20)
        self.assertEqual(payload["remaining_orders"], 0)
        self.assertFalse(payload["available"])

    async def test_deal_order_limit_counts_orders_not_item_quantity(self):
        offer_id = uuid4()
        db = MagicMock(execute=AsyncMock(return_value=[(offer_id, 2)]))
        self.assertEqual(await reserved_offer_orders(db, [offer_id]), {offer_id: 2})
        query = str(db.execute.await_args.args[0])
        self.assertIn("count(distinct(orders.id))", query)

    async def test_deal_stops_at_order_limit_even_with_portions_left(self):
        merchant_id, slot_id, item_id, offer_id = uuid4(), uuid4(), uuid4(), uuid4()
        request = OrderCreate(merchant_id=merchant_id, pickup_slot_id=slot_id,
                              items=[{'menu_item_id': item_id, 'surplus_offer_id': offer_id, 'quantity': 1}])
        merchant = SimpleNamespace(id=merchant_id, is_active=True, is_preview=False, is_deleted=False)
        slot = SimpleNamespace(id=slot_id, merchant_id=merchant_id,
                               time_slot=datetime.now(timezone.utc) + timedelta(hours=2),
                               current_bookings=0, max_capacity=10)
        item = SimpleNamespace(id=item_id, merchant_id=merchant_id, name="Deal item",
                               is_available=True, approval_status="approved", price=Decimal("5.00"))
        offer = SimpleNamespace(id=offer_id, merchant_id=merchant_id, menu_item_id=item_id,
                                pickup_slot_id=slot_id, is_active=True, total_portions=100,
                                max_orders=1, sale_price=Decimal("3.00"),
                                confirmed_safe_at=datetime.now(timezone.utc),
                                expires_at=datetime.now(timezone.utc) + timedelta(hours=1))
        def result(first=None, all_rows=None):
            value = MagicMock()
            value.scalars.return_value.first.return_value = first
            value.scalars.return_value.all.return_value = all_rows or []
            return value
        db = MagicMock(execute=AsyncMock(side_effect=[result(first=merchant), result(first=slot),
                                                 result(all_rows=[offer]), [], [(offer_id, 1)]]),
                       get=AsyncMock(return_value=item))
        with patch('main.expire_stale_drafts', AsyncMock()):
            with self.assertRaises(HTTPException) as error:
                await create_order(request, db, SimpleNamespace(id=uuid4()))
        self.assertEqual(error.exception.status_code, 409)
        self.assertIn("order limit", error.exception.detail)
        db.add.assert_not_called()

    async def test_closed_pickup_date_blocks_checkout(self):
        merchant_id, slot_id = uuid4(), uuid4()
        when = datetime.now(timezone.utc) + timedelta(days=2)
        merchant = SimpleNamespace(id=merchant_id, is_active=True, is_preview=False, is_deleted=False,
                                   pickup_schedule={"enabled": False, "closed_dates": [(when + timedelta(hours=8)).date().isoformat()]})
        slot = SimpleNamespace(id=slot_id, merchant_id=merchant_id, time_slot=when,
                               current_bookings=0, max_capacity=10, is_bookable=True)
        def result(value):
            row = MagicMock()
            row.scalars.return_value.first.return_value = value
            return row
        db = MagicMock(execute=AsyncMock(side_effect=[result(merchant), result(slot)]))
        request = OrderCreate(merchant_id=merchant_id, pickup_slot_id=slot_id,
                              items=[{"menu_item_id": uuid4(), "quantity": 1}])
        with patch('main.expire_stale_drafts', AsyncMock()):
            with self.assertRaises(HTTPException) as error:
                await create_order(request, db, SimpleNamespace(id=uuid4()))
        self.assertEqual(error.exception.status_code, 400)
        self.assertIn("no longer available", error.exception.detail)
        db.add.assert_not_called()

    async def test_surplus_offer_cannot_sell_more_than_remaining_portions(self):
        merchant_id, slot_id, item_id, offer_id = uuid4(), uuid4(), uuid4(), uuid4()
        request = OrderCreate(merchant_id=merchant_id, pickup_slot_id=slot_id,
                              items=[{'menu_item_id': item_id, 'surplus_offer_id': offer_id, 'quantity': 1},
                                     {'menu_item_id': item_id, 'surplus_offer_id': offer_id, 'quantity': 1}])
        merchant = SimpleNamespace(id=merchant_id, is_active=True, is_preview=False, is_deleted=False)
        slot = SimpleNamespace(id=slot_id, merchant_id=merchant_id,
                               time_slot=datetime.now(timezone.utc) + timedelta(hours=2),
                               current_bookings=0, max_capacity=10)
        item = SimpleNamespace(id=item_id, merchant_id=merchant_id, name="Satay",
                               is_available=True, approval_status="approved", price=Decimal("5.00"))
        offer = SimpleNamespace(id=offer_id, merchant_id=merchant_id, menu_item_id=item_id,
                                pickup_slot_id=slot_id, is_active=True, total_portions=1,
                                sale_price=Decimal("3.00"), confirmed_safe_at=datetime.now(timezone.utc),
                                expires_at=datetime.now(timezone.utc) + timedelta(hours=1))
        def result(first=None, all_rows=None):
            value = MagicMock()
            value.scalars.return_value.first.return_value = first
            value.scalars.return_value.all.return_value = all_rows or []
            return value
        db = MagicMock()
        db.execute = AsyncMock(side_effect=[result(first=merchant), result(first=slot),
                                            result(all_rows=[offer]), []])
        db.get = AsyncMock(return_value=item)
        with patch('main.expire_stale_drafts', AsyncMock()):
            with self.assertRaises(HTTPException) as error:
                await create_order(request, db, SimpleNamespace(id=uuid4()))
        self.assertEqual(error.exception.status_code, 409)
        self.assertIn("Only 1 surplus portion", error.exception.detail)
        db.add.assert_not_called()

    async def test_surplus_offer_must_match_pickup_slot(self):
        merchant_id, slot_id, item_id, offer_id = uuid4(), uuid4(), uuid4(), uuid4()
        request = OrderCreate(merchant_id=merchant_id, pickup_slot_id=slot_id,
                              items=[{'menu_item_id': item_id, 'surplus_offer_id': offer_id, 'quantity': 1}])
        merchant = SimpleNamespace(id=merchant_id, is_active=True, is_preview=False, is_deleted=False)
        slot = SimpleNamespace(id=slot_id, merchant_id=merchant_id,
                               time_slot=datetime.now(timezone.utc) + timedelta(hours=2),
                               current_bookings=0, max_capacity=10)
        item = SimpleNamespace(id=item_id, merchant_id=merchant_id, name="Satay",
                               is_available=True, approval_status="approved", price=Decimal("5.00"))
        offer = SimpleNamespace(id=offer_id, merchant_id=merchant_id, menu_item_id=item_id,
                                pickup_slot_id=uuid4(), is_active=True, total_portions=1,
                                sale_price=Decimal("3.00"), confirmed_safe_at=datetime.now(timezone.utc),
                                expires_at=datetime.now(timezone.utc) + timedelta(hours=1))
        def result(first=None, all_rows=None):
            value = MagicMock()
            value.scalars.return_value.first.return_value = first
            value.scalars.return_value.all.return_value = all_rows or []
            return value
        db = MagicMock()
        db.execute = AsyncMock(side_effect=[result(first=merchant), result(first=slot),
                                            result(all_rows=[offer])])
        db.get = AsyncMock(return_value=item)
        with patch('main.expire_stale_drafts', AsyncMock()):
            with self.assertRaises(HTTPException) as error:
                await create_order(request, db, SimpleNamespace(id=uuid4()))
        self.assertEqual(error.exception.status_code, 409)
        db.add.assert_not_called()

    async def test_checkout_uses_server_surplus_price(self):
        merchant_id, slot_id, item_id, offer_id = uuid4(), uuid4(), uuid4(), uuid4()
        request = OrderCreate(merchant_id=merchant_id, pickup_slot_id=slot_id,
                              items=[{'menu_item_id': item_id, 'surplus_offer_id': offer_id, 'quantity': 2}])
        merchant = SimpleNamespace(id=merchant_id, is_active=True, is_preview=False, is_deleted=False)
        slot = SimpleNamespace(id=slot_id, merchant_id=merchant_id,
                               time_slot=datetime.now(timezone.utc) + timedelta(hours=2),
                               current_bookings=0, max_capacity=10)
        item = SimpleNamespace(id=item_id, merchant_id=merchant_id, name="Satay",
                               is_available=True, approval_status="approved", price=Decimal("5.00"))
        offer = SimpleNamespace(id=offer_id, merchant_id=merchant_id, menu_item_id=item_id,
                                pickup_slot_id=slot_id, is_active=True, total_portions=3,
                                sale_price=Decimal("3.00"), confirmed_safe_at=datetime.now(timezone.utc),
                                expires_at=datetime.now(timezone.utc) + timedelta(hours=1))
        def result(first=None, all_rows=None):
            value = MagicMock()
            value.first.return_value = first
            value.scalars.return_value.first.return_value = first
            value.scalars.return_value.all.return_value = all_rows or []
            return value
        db = MagicMock()
        db.execute = AsyncMock(side_effect=[result(first=merchant), result(first=slot),
                                            result(all_rows=[offer]), [], result(all_rows=[]), result(first=None)])
        db.get = AsyncMock(return_value=item)
        db.flush = AsyncMock()
        db.commit = AsyncMock()
        db.refresh = AsyncMock()
        with patch('main.expire_stale_drafts', AsyncMock()):
            order = await create_order(request, db, SimpleNamespace(id=uuid4()))
        self.assertEqual(order.total_price, Decimal("6.00"))
        line = db.add.call_args_list[1].args[0]
        self.assertEqual(line.price_at_order, Decimal("3.00"))
        self.assertEqual(line.surplus_offer_id, offer_id)

    async def test_daily_limit_counts_duplicate_cart_lines_before_payment(self):
        merchant_id, slot_id, item_id = uuid4(), uuid4(), uuid4()
        request = OrderCreate(merchant_id=merchant_id, pickup_slot_id=slot_id,
                              items=[{'menu_item_id': item_id, 'quantity': 1},
                                     {'menu_item_id': item_id, 'quantity': 1}])
        merchant = SimpleNamespace(id=merchant_id, is_active=True, is_preview=False, is_deleted=False)
        slot = SimpleNamespace(id=slot_id, merchant_id=merchant_id,
                               time_slot=datetime.now(timezone.utc) + timedelta(hours=2),
                               current_bookings=0, max_capacity=10)
        item = SimpleNamespace(id=item_id, merchant_id=merchant_id, name="Satay",
                               is_available=True, approval_status="approved", price=Decimal("5.00"))
        stock = SimpleNamespace(menu_item_id=item_id, total_portions=1)
        def result(first=None, all_rows=None):
            value = MagicMock()
            value.scalars.return_value.first.return_value = first
            value.scalars.return_value.all.return_value = all_rows or []
            return value
        db = MagicMock()
        db.execute = AsyncMock(side_effect=[result(first=merchant), result(first=slot),
                                            result(all_rows=[stock]), []])
        db.get = AsyncMock(return_value=item)
        with patch('main.expire_stale_drafts', AsyncMock()):
            with self.assertRaises(HTTPException) as error:
                await create_order(request, db, SimpleNamespace(id=uuid4()))
        self.assertEqual(error.exception.status_code, 409)
        self.assertIn("Only 1 portion", error.exception.detail)
        db.add.assert_not_called()

    async def test_retry_returns_existing_order_without_reserving_slot(self):
        request = OrderCreate(checkout_key=uuid4(), merchant_id=uuid4(), pickup_slot_id=uuid4(), items=[{'menu_item_id': uuid4(), 'quantity': 1}])
        fingerprint = hashlib.sha256(json.dumps(request.model_dump(mode='json', exclude={'checkout_key'}), sort_keys=True).encode()).hexdigest()
        existing = SimpleNamespace(checkout_fingerprint=fingerprint)
        result = MagicMock()
        result.scalars.return_value.first.return_value = existing
        db = MagicMock(execute=AsyncMock(return_value=result), get=AsyncMock())
        with patch('main.expire_stale_drafts', AsyncMock()):
            self.assertIs(await create_order(request, db, SimpleNamespace(id=uuid4())), existing)
            db.get.assert_not_awaited()
            existing.checkout_fingerprint = 'different-cart'
            with self.assertRaises(HTTPException) as error:
                await create_order(request, db, SimpleNamespace(id=uuid4()))
            self.assertEqual(error.exception.status_code, 409)

    async def test_hidden_shop_denied_to_public_but_owner_can_manage(self):
        owner = uuid4()
        merchant = SimpleNamespace(is_active=True, is_preview=True, is_deleted=False, user_id=owner)
        db = MagicMock(get=AsyncMock(return_value=merchant))
        self.assertFalse(shop_is_public(merchant))
        with self.assertRaises(HTTPException):
            await require_shop_access(db, uuid4())
        with patch('main.get_current_user', AsyncMock(return_value=SimpleNamespace(id=owner, role='merchant'))):
            self.assertIs(await require_shop_access(db, uuid4(), 'Bearer test'), merchant)
