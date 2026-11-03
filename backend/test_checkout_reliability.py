import os
os.environ['DATABASE_URL'] = 'postgresql+asyncpg://test:test@127.0.0.1/test'
os.environ['SECRET_KEY'] = 'test-only-secret-never-use-in-production-0123456789'
os.environ['SUPABASE_URL'] = ''
os.environ['SUPABASE_SERVICE_ROLE_KEY'] = ''
import hashlib
import json
import unittest
from types import SimpleNamespace
from uuid import uuid4
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi import HTTPException
from main import create_order, OrderCreate, shop_is_public, require_shop_access


class CheckoutTests(unittest.IsolatedAsyncioTestCase):
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
