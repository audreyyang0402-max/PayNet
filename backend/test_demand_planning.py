import unittest

from demand_planning import forecast_portions


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


if __name__ == "__main__":
    unittest.main()
