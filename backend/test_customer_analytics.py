import os
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@127.0.0.1/test")
import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from decimal import Decimal
from customer_analytics import summarize, MYT

def order(day, status="completed", amount="10.50"):
    return SimpleNamespace(created_at=day, status=status, total_price=Decimal(amount))

class CustomerSpendingTests(unittest.TestCase):
    def setUp(self): self.now=datetime(2026,10,31,12,tzinfo=MYT)
    def test_empty_fills_each_day(self):
        result=summarize([],7,self.now)
        self.assertEqual(len(result["daily"]),7)
        self.assertEqual(result["summary"]["total_spent"],0)
        self.assertEqual(result["summary"]["ordering_streak"],0)
        self.assertEqual(result["daily"][-1]["date"],"2026-10-31")
    def test_money_and_statuses(self):
        rows=[order(self.now,"preparing","10.10"),order(self.now,"ready","5.20"),order(self.now,"completed","20.30"),order(self.now,"pending_verification","8.50"),order(self.now,"cancelled","99.00")]
        summary=summarize(rows,7,self.now)["summary"]
        self.assertEqual(summary["total_spent"],35.60)
        self.assertEqual(summary["pending_amount"],8.50)
        self.assertEqual(summary["active_orders"],3)
        self.assertEqual(summary["total_orders"],5)
        self.assertEqual(summary["average_completed_order"],20.30)
    def test_malaysian_midnight_not_utc(self):
        rows=[order(datetime(2026,10,30,16,1,tzinfo=timezone.utc))]
        result=summarize(rows,7,self.now)
        self.assertEqual(result["summary"]["today_spent"],10.50)
        self.assertEqual(result["daily"][-1]["orders"],1)
    def test_first_day_includes_midnight(self):
        first=(self.now-timedelta(days=6)).replace(hour=0)
        result=summarize([order(first),order(first-timedelta(seconds=1))],7,self.now)
        self.assertEqual(result["summary"]["total_orders"],1)
    def test_streak_crosses_date_range(self):
        rows=[order(self.now-timedelta(days=i)) for i in range(12)]
        self.assertEqual(summarize(rows,7,self.now)["summary"]["ordering_streak"],12)
    def test_streak_can_end_yesterday_and_excludes_cancelled(self):
        rows=[order(self.now-timedelta(days=i)) for i in [1,2,3]]+[order(self.now,"cancelled")]
        self.assertEqual(summarize(rows,7,self.now)["summary"]["ordering_streak"],3)
        self.assertEqual(summarize([order(self.now-timedelta(days=2))],7,self.now)["summary"]["ordering_streak"],0)
    def test_duplicates_dont_inflate_streak(self):
        self.assertEqual(summarize([order(self.now),order(self.now)],7,self.now)["summary"]["ordering_streak"],1)
    def test_old_active_orders_count_but_not_spending(self):
        summary=summarize([order(self.now-timedelta(days=50),"ready")],7,self.now)["summary"]
        self.assertEqual(summary["active_orders"],1)
        self.assertEqual(summary["total_spent"],0)
    def test_future_orders_ignored(self):
        self.assertEqual(summarize([order(self.now+timedelta(hours=1))],7,self.now)["summary"]["total_orders"],0)

if __name__ == "__main__": unittest.main()
