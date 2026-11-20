"""Reject unauthorized or inconsistent food records before touching the database."""
import os
os.environ["DATABASE_URL"] = "postgresql+asyncpg://test:test@127.0.0.1/test"
os.environ["SECRET_KEY"] = "test-only-secret-never-use-in-production-0123456789"
os.environ["SUPABASE_URL"] = ""
os.environ["SUPABASE_SERVICE_ROLE_KEY"] = ""

import unittest
import csv
import io
from datetime import datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

from fastapi import HTTPException
from customer_analytics import MYT
from main import DailyFoodLogInput, export_food_planning_dataset, get_food_planning, save_daily_food_log


class FoodPlanningAccessTests(unittest.IsolatedAsyncioTestCase):
    async def test_dataset_does_not_turn_unknown_availability_into_zero_demand(self):
        merchant_id, item_id = uuid4(), uuid4()
        today = datetime.now(MYT).date()
        db = MagicMock()
        no_logs = MagicMock()
        no_logs.scalars.return_value.all.return_value = []
        db.execute = AsyncMock(side_effect=[
            [(merchant_id, today, 1, 10)],
            [(item_id, merchant_id, datetime.now(MYT))],
            [], no_logs, no_logs,
        ])
        response = await export_food_planning_dataset(90, db, SimpleNamespace(role="admin"))
        rows = list(csv.DictReader(io.StringIO(response.body.decode())))
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["availability_evidence"], "unknown")
        self.assertEqual(rows[0]["confirmed_portions"], "")
        self.assertEqual(rows[0]["prepared_portions"], "")
        self.assertNotEqual(rows[0]["merchant_code"], str(merchant_id))

    async def test_only_admin_can_export_dataset(self):
        db = MagicMock()
        db.execute = AsyncMock()
        with self.assertRaises(HTTPException) as error:
            await export_food_planning_dataset(90, db, SimpleNamespace(id=uuid4(), role="merchant"))
        self.assertEqual(error.exception.status_code, 403)
        db.execute.assert_not_awaited()

    async def test_customer_cannot_read_merchant_planning(self):
        db = MagicMock()
        db.execute = AsyncMock()
        with self.assertRaises(HTTPException) as error:
            await get_food_planning(db, SimpleNamespace(id=uuid4(), role="customer"))
        self.assertEqual(error.exception.status_code, 403)
        db.execute.assert_not_awaited()

    async def test_invalid_portion_totals_rejected_before_item_lookup(self):
        merchant_id = uuid4()
        user = SimpleNamespace(id=uuid4(), role="merchant")
        db = MagicMock()
        result = MagicMock()
        result.scalars.return_value.first.return_value = SimpleNamespace(id=merchant_id)
        db.execute = AsyncMock(return_value=result)
        db.get = AsyncMock()
        payload = DailyFoodLogInput(service_date=datetime.now(MYT).date(),
                                    prepared_portions=3, unsold_portions=2,
                                    discarded_portions=2)
        with self.assertRaises(HTTPException) as error:
            await save_daily_food_log(uuid4(), payload, db, user)
        self.assertEqual(error.exception.status_code, 422)
        db.get.assert_not_awaited()

    async def test_old_record_rejected(self):
        user = SimpleNamespace(id=uuid4(), role="merchant")
        db = MagicMock()
        result = MagicMock()
        result.scalars.return_value.first.return_value = SimpleNamespace(id=uuid4())
        db.execute = AsyncMock(return_value=result)
        db.get = AsyncMock()
        payload = DailyFoodLogInput(service_date=datetime.now(MYT).date() - timedelta(days=91),
                                    prepared_portions=1, unsold_portions=0,
                                    discarded_portions=0)
        with self.assertRaises(HTTPException) as error:
            await save_daily_food_log(uuid4(), payload, db, user)
        self.assertEqual(error.exception.status_code, 422)
        db.get.assert_not_awaited()
