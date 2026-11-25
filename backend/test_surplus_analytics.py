import unittest
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

from surplus_analytics import summarize_surplus


class SurplusAnalyticsTests(unittest.TestCase):
    def test_order_outcomes_do_not_claim_waste_saved(self):
        today = date(2026, 11, 20)
        item_id, offer_id = uuid4(), uuid4()
        offer = SimpleNamespace(id=offer_id, menu_item_id=item_id,
                                service_date=today - timedelta(days=1), total_portions=5)
        log = SimpleNamespace(menu_item_id=item_id, service_date=offer.service_date,
                              discarded_portions=2)
        result = summarize_surplus(
            [offer], [(offer_id, "completed", 2, Decimal("6.00")),
                      (offer_id, "rejected", 1, Decimal("3.00")),
                      (offer_id, "draft", 1, Decimal("3.00"))],
            [log], datetime(2026, 11, 20, tzinfo=timezone(timedelta(hours=8))))
        self.assertEqual(result["confirmed_portions"], 2)
        self.assertEqual(result["completed_portions"], 2)
        self.assertEqual(result["rejected_portions"], 1)
        self.assertEqual(result["pending_portions"], 1)
        self.assertEqual(result["discarded_portions_on_logged_offer_days"], 2)
        self.assertNotIn("waste_saved", result)

    def test_relisted_dish_day_counts_log_once(self):
        today = date(2026, 11, 20)
        item_id = uuid4()
        day = today - timedelta(days=1)
        offers = [SimpleNamespace(id=uuid4(), menu_item_id=item_id,
                                  service_date=day, total_portions=3) for _ in range(2)]
        log = SimpleNamespace(menu_item_id=item_id, service_date=day, discarded_portions=1)
        result = summarize_surplus(offers, [], [log],
                                   datetime(2026, 11, 20, tzinfo=timezone(timedelta(hours=8))))
        self.assertEqual(result["listed_portions"], 6)
        self.assertEqual(result["logged_offer_dish_days"], 1)
        self.assertEqual(result["discarded_portions_on_logged_offer_days"], 1)
