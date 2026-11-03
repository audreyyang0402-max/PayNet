"""Offline regression tests for deleting pickup slots after orders finish."""
import os
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

os.environ["DATABASE_URL"] = "postgresql+asyncpg://test:test@127.0.0.1/test"
os.environ["SECRET_KEY"] = "test-only-secret-never-use-in-production-0123456789"
os.environ["SUPABASE_URL"] = ""
os.environ["SUPABASE_SERVICE_ROLE_KEY"] = ""

from fastapi import HTTPException
import main


def count_result(value: int):
    result = MagicMock()
    result.scalar_one.return_value = value
    return result


def orders_result(orders):
    result = MagicMock()
    result.scalars.return_value.all.return_value = orders
    return result


class PickupSlotDeletionTests(unittest.IsolatedAsyncioTestCase):
    def make_db(self, slot, merchant, execute_results):
        db = MagicMock()
        db.get = AsyncMock(side_effect=[slot, merchant])
        db.execute = AsyncMock(side_effect=execute_results)
        db.flush = AsyncMock()
        db.delete = AsyncMock()
        db.commit = AsyncMock()
        db.rollback = AsyncMock()
        return db

    async def test_completed_orders_are_detached_and_slot_is_deleted(self):
        user = SimpleNamespace(id=uuid4(), role="merchant")
        slot = SimpleNamespace(id=uuid4(), merchant_id=uuid4())
        merchant = SimpleNamespace(user_id=user.id)
        completed_order = SimpleNamespace(pickup_slot_id=slot.id, status="completed")
        db = self.make_db(slot, merchant, [count_result(0), orders_result([completed_order])])

        with patch.object(main, "expire_stale_drafts", new_callable=AsyncMock) as expire:
            response = await main.delete_pickup_slot(slot.id, db, user)

        expire.assert_awaited_once_with(db)
        self.assertIsNone(completed_order.pickup_slot_id)
        db.flush.assert_awaited_once()
        db.delete.assert_awaited_once_with(slot)
        db.commit.assert_awaited_once()
        self.assertIn("history was preserved", response["message"])

    async def test_active_orders_still_block_slot_deletion(self):
        user = SimpleNamespace(id=uuid4(), role="merchant")
        slot = SimpleNamespace(id=uuid4(), merchant_id=uuid4())
        merchant = SimpleNamespace(user_id=user.id)
        db = self.make_db(slot, merchant, [count_result(1)])

        with patch.object(main, "expire_stale_drafts", new_callable=AsyncMock):
            with self.assertRaises(HTTPException) as raised:
                await main.delete_pickup_slot(slot.id, db, user)

        self.assertEqual(raised.exception.status_code, 400)
        self.assertIn("active orders", raised.exception.detail)
        db.delete.assert_not_awaited()
        db.commit.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()
