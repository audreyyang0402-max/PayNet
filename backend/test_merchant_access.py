"""Offline authorization and event validation regression checks."""
import os
os.environ["DATABASE_URL"] = "postgresql+asyncpg://test:test@127.0.0.1/test"
os.environ["SECRET_KEY"] = "test-only-secret-never-use-in-production-0123456789"
os.environ["SUPABASE_URL"] = ""
os.environ["SUPABASE_SERVICE_ROLE_KEY"] = ""
import unittest
from unittest.mock import AsyncMock, MagicMock
from types import SimpleNamespace
from uuid import uuid4
from datetime import datetime, timezone, timedelta
from fastapi import HTTPException
from main import list_merchant_orders, admin_merchants, create_event, EventCreate

class MerchantAccessTests(unittest.IsolatedAsyncioTestCase):
    async def test_other_merchant_and_customer_cannot_read_orders(self):
        owner = uuid4()
        for role in ("merchant", "customer"):
            db = MagicMock()
            db.get = AsyncMock(return_value=SimpleNamespace(user_id=owner))
            db.execute = AsyncMock()
            with self.assertRaises(HTTPException) as error:
                await list_merchant_orders(uuid4(), db, SimpleNamespace(id=uuid4(), role=role))
            self.assertEqual(error.exception.status_code, 403)
            db.execute.assert_not_awaited()

    async def test_owner_and_admin_can_read_orders(self):
        owner = uuid4()
        for user in (SimpleNamespace(id=owner, role="merchant"), SimpleNamespace(id=uuid4(), role="admin")):
            db = MagicMock()
            db.get = AsyncMock(return_value=SimpleNamespace(user_id=owner))
            result = MagicMock()
            result.scalars.return_value.all.return_value = []
            db.execute = AsyncMock(return_value=result)
            self.assertEqual(await list_merchant_orders(uuid4(), db, user), [])
            db.execute.assert_awaited_once()

    async def test_directory_is_admin_only(self):
        db = MagicMock(); db.execute = AsyncMock()
        with self.assertRaises(HTTPException):
            await admin_merchants(db, SimpleNamespace(role="merchant"))
        db.execute.assert_not_awaited()

    async def test_invalid_event_range_rejected_before_write(self):
        now = datetime.now(timezone.utc)
        event = EventCreate(name="Test", location="Campus", event_date=now.date(), start_time=now, end_time=now-timedelta(days=1))
        db = MagicMock()
        with self.assertRaises(HTTPException) as error:
            await create_event(event, db, SimpleNamespace(role="admin"))
        self.assertEqual(error.exception.status_code, 422)
        db.add.assert_not_called()
