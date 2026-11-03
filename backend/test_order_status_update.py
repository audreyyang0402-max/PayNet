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


class DatabasePoolTests(unittest.TestCase):
    def test_default_pool_stays_below_supabase_session_limit(self):
        self.assertEqual(database.DB_POOL_SIZE, 3)
        self.assertEqual(database.DB_MAX_OVERFLOW, 2)
        self.assertLess(database.DB_POOL_SIZE + database.DB_MAX_OVERFLOW, 15)


if __name__ == "__main__":
    unittest.main()
