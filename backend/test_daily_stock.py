import os
os.environ["DATABASE_URL"] = "postgresql+asyncpg://test:test@127.0.0.1/test"
os.environ["SECRET_KEY"] = "test-only-secret-never-use-in-production-0123456789"
os.environ["SUPABASE_URL"] = ""
os.environ["SUPABASE_SERVICE_ROLE_KEY"] = ""

import unittest
from datetime import datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from fastapi import HTTPException
from customer_analytics import MYT
from main import DailyStockInput, set_daily_stock, stock_day_bounds, STOCK_RESERVATION_STATUSES


class DailyStockTests(unittest.IsolatedAsyncioTestCase):
    async def test_limit_cannot_drop_below_existing_reservations(self):
        merchant_id, item_id = uuid4(), uuid4()
        merchant = SimpleNamespace(id=merchant_id)
        db = MagicMock()
        db.execute = AsyncMock(side_effect=[MagicMock(), MagicMock()])
        db.get = AsyncMock(return_value=SimpleNamespace(id=item_id, merchant_id=merchant_id))
        db.commit = AsyncMock()
        payload = DailyStockInput(service_date=datetime.now(MYT).date(), total_portions=2)
        with patch("main.expire_stale_drafts", AsyncMock()), \
             patch("main.require_own_merchant", AsyncMock(return_value=merchant)), \
             patch("main.reserved_item_quantities", AsyncMock(return_value={item_id: 3})):
            with self.assertRaises(HTTPException) as error:
                await set_daily_stock(item_id, payload, db, SimpleNamespace(role="merchant"))
        self.assertEqual(error.exception.status_code, 409)
        db.commit.assert_not_awaited()

    async def test_cannot_set_other_stalls_stock(self):
        item_id = uuid4()
        db = MagicMock()
        db.execute = AsyncMock()
        db.get = AsyncMock(return_value=SimpleNamespace(id=item_id, merchant_id=uuid4()))
        payload = DailyStockInput(service_date=datetime.now(MYT).date(), total_portions=4)
        with patch("main.expire_stale_drafts", AsyncMock()), \
             patch("main.require_own_merchant", AsyncMock(return_value=SimpleNamespace(id=uuid4()))):
            with self.assertRaises(HTTPException) as error:
                await set_daily_stock(item_id, payload, db, SimpleNamespace(role="merchant"))
        self.assertEqual(error.exception.status_code, 404)

    def test_local_day_bounds_and_released_statuses(self):
        today = datetime.now(MYT).date()
        start, end = stock_day_bounds(today)
        self.assertEqual(end - start, timedelta(days=1))
        self.assertNotIn("rejected", STOCK_RESERVATION_STATUSES)
        self.assertNotIn("cancelled", STOCK_RESERVATION_STATUSES)
        self.assertIn("completed", STOCK_RESERVATION_STATUSES)
