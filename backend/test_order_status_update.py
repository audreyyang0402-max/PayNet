"""Regression tests for merchant order rejection and database pool limits."""
import os
import unittest

os.environ["DATABASE_URL"] = "postgresql+asyncpg://test:test@127.0.0.1/test"
os.environ["SECRET_KEY"] = "test-only-secret-never-use-in-production-0123456789"
os.environ["SUPABASE_URL"] = ""
os.environ["SUPABASE_SERVICE_ROLE_KEY"] = ""
os.environ.pop("DB_POOL_SIZE", None)
os.environ.pop("DB_MAX_OVERFLOW", None)

import database
import main


class OrderStatusUpdateTests(unittest.TestCase):
    def test_pending_orders_allow_rejection(self):
        self.assertIn("rejected", main.ORDER_TRANSITIONS["pending_verification"])
        self.assertIn("rejected", main.ORDER_TRANSITIONS["pending"])

    def test_database_constraint_allows_every_runtime_order_status(self):
        required_statuses = {
            "draft", "pending_verification", "pending", "preparing", "ready",
            "completed", "rejected", "cancelled", "cancelled_timeout",
        }
        self.assertEqual(set(main.ORDER_STATUS_VALUES), required_statuses)
        for order_status in required_statuses:
            self.assertIn(f"'{order_status}'", main.ORDER_STATUS_CONSTRAINT_MIGRATION)

    def test_status_constraint_migration_is_atomic_and_idempotent(self):
        migration = main.ORDER_STATUS_CONSTRAINT_MIGRATION
        self.assertIn("DO $$", migration)
        self.assertIn("END;", migration)
        self.assertIn("DROP CONSTRAINT IF EXISTS orders_status_check", migration)
        self.assertIn("ADD CONSTRAINT orders_status_check", migration)


class DatabasePoolTests(unittest.TestCase):
    def test_default_pool_stays_below_supabase_session_limit(self):
        self.assertEqual(database.DB_POOL_SIZE, 3)
        self.assertEqual(database.DB_MAX_OVERFLOW, 2)
        self.assertLess(database.DB_POOL_SIZE + database.DB_MAX_OVERFLOW, 15)


if __name__ == "__main__":
    unittest.main()
