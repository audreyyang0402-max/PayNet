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
from main import create_order, OrderCreate, shop_is_public, require_shop_access


class CheckoutTests(unittest.IsolatedAsyncioTestCase):
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
