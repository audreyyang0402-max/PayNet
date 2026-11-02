import unittest
from analytics_statistics import daily_statistics


class DailyStatisticsTests(unittest.TestCase):
    def test_partial_today_excluded_and_zero_days_included(self):
        stats = daily_statistics([
            {'orders': 0, 'revenue': 0},
            {'orders': 4, 'revenue': 40},
            {'orders': 100, 'revenue': 1000},
        ], 'revenue')
        self.assertEqual(stats['orders_per_day'], 2)
        self.assertEqual(stats['daily_order_stddev'], 2)
        self.assertEqual(stats['average_daily_amount'], 20)
        self.assertEqual(stats['days_with_orders'], 1)

    def test_empty(self):
        self.assertEqual(daily_statistics([], 'spent')['orders_per_day'], 0)
