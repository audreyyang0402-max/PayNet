import unittest

from demand_planning import forecast_portions, walk_forward_validation


class ForecastPortionsTests(unittest.TestCase):
    def test_missing_history_is_not_presented_as_prediction(self):
        estimate = forecast_portions([], already_booked=3)
        self.assertIsNone(estimate["expected"])
        self.assertEqual(estimate["already_booked"], 3)
        self.assertEqual(estimate["confidence"], "insufficient_data")

    def test_booked_orders_are_minimum_even_when_higher_than_average(self):
        estimate = forecast_portions([2, 4, 3, 3], already_booked=6)
        self.assertEqual(estimate["expected"], 6)
        self.assertEqual(estimate["low"], 6)
        self.assertGreaterEqual(estimate["high"], 6)

    def test_short_history_is_labelled_limited(self):
        self.assertEqual(forecast_portions([5, 6])["confidence"], "limited")

    def test_walk_forward_uses_only_earlier_days(self):
        result = walk_forward_validation([2, 2, 2, 8, 8])
        self.assertEqual(result["evaluated_days"], 2)
        self.assertEqual(result["mae"], 5.25)
        self.assertEqual(result["last_day_mae"], 3)

    def test_walk_forward_waits_for_enough_history(self):
        self.assertIsNone(walk_forward_validation([2, 3, 4, 5])["mae"])


if __name__ == "__main__":
    unittest.main()
