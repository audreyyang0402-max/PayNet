"""Regression checks for weekly slot creation, authorization and retries."""
import os
os.environ["DATABASE_URL"] = "postgresql+asyncpg://test:test@127.0.0.1/test"
os.environ["SECRET_KEY"] = "test-only-secret-never-use-in-production-0123456789"
os.environ["SUPABASE_URL"] = ""
os.environ["SUPABASE_SERVICE_ROLE_KEY"] = ""

import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4
from fastapi import HTTPException
from main import PickupSlotBatchCreate, create_pickup_slots_batch


class BatchTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.owner = uuid4()
        self.user = SimpleNamespace(id=self.owner, role="merchant")
        self.when = datetime.now(timezone.utc) + timedelta(days=7)
        merchant = MagicMock()
        merchant.scalars.return_value.first.return_value = SimpleNamespace(user_id=self.owner)
        self.existing = MagicMock()
        self.existing.scalars.return_value.all.return_value = []
        self.db = MagicMock()
        self.db.execute = AsyncMock(side_effect=[merchant, self.existing])
        self.db.commit = AsyncMock()
        self.db.rollback = AsyncMock()

    def payload(self, *times):
        return PickupSlotBatchCreate(slots=[{"time_slot": t, "max_capacity": 12} for t in times])

    async def test_duplicates_skipped_and_bookings_start_at_zero(self):
        self.existing.scalars.return_value.all.return_value = [self.when]
        later = self.when + timedelta(hours=1)
        result = await create_pickup_slots_batch(uuid4(), self.payload(self.when, later, later), self.db, self.user)
        self.assertEqual(result, {"created": 1, "skipped": 2})
        slot = self.db.add.call_args.args[0]
        self.assertEqual((slot.current_bookings, slot.max_capacity), (0, 12))
        self.db.commit.assert_awaited_once()

    async def test_other_merchant_denied(self):
        with self.assertRaises(HTTPException) as error:
            await create_pickup_slots_batch(uuid4(), self.payload(self.when), self.db, SimpleNamespace(id=uuid4(), role="merchant"))
        self.assertEqual(error.exception.status_code, 403)
        self.db.add.assert_not_called()

    async def test_past_slot_rejects_entire_batch(self):
        with self.assertRaises(HTTPException):
            await create_pickup_slots_batch(uuid4(), self.payload(self.when, datetime.now(timezone.utc)-timedelta(days=1)), self.db, self.user)
        self.db.add.assert_not_called()
        self.db.commit.assert_not_awaited()

    async def test_failed_commit_rolls_back(self):
        self.db.commit.side_effect = RuntimeError("test failure")
        with self.assertRaises(HTTPException):
            await create_pickup_slots_batch(uuid4(), self.payload(self.when), self.db, self.user)
        self.db.rollback.assert_awaited_once()


if __name__ == "__main__":
    unittest.main()
