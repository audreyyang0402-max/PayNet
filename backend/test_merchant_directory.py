"""Offline regression checks for the public merchant directory."""
import os
import unittest

os.environ["DATABASE_URL"] = "postgresql+asyncpg://test:test@127.0.0.1/test"
os.environ["SECRET_KEY"] = "test-only-secret-never-use-in-production-0123456789"
os.environ["SUPABASE_URL"] = ""
os.environ["SUPABASE_SERVICE_ROLE_KEY"] = ""

import main
from models import Merchant


class MerchantDirectoryTests(unittest.TestCase):
    def test_preview_and_display_order_are_mapped_columns(self):
        self.assertIn("is_preview", Merchant.__table__.columns)
        self.assertIn("display_order", Merchant.__table__.columns)

    def test_sorted_route_precedes_dynamic_merchant_route(self):
        paths = [route.path for route in main.app.routes if hasattr(route, "path")]
        self.assertEqual(paths.count("/merchants/sorted"), 1)
        self.assertLess(paths.index("/merchants/sorted"), paths.index("/merchants/{merchant_id}"))


if __name__ == "__main__":
    unittest.main()
