import unittest
from datetime import date, timedelta

from demand_planning import forecast_portions, trained_forecast, walk_forward_validation


class ForecastPortionsTests(unittest.TestCase):
    def test_trained_model_waits_for_verified_history(self):
        start = date(2026, 1, 1)
        rows = [(start + timedelta(days=index), 3) for index in range(20)]
        result = trained_forecast(rows, start + timedelta(days=20))
        self.assertFalse(result["selected"])
        self.assertIsNone(result["expected"])

    def test_trend_model_is_selected_only_after_chronological_validation(self):
        start = date(2026, 1, 1)
        rows = [(start + timedelta(days=index), 4 + index // 5 + (3 if index % 7 == 0 else 0))
                for index in range(70)]
        result = trained_forecast(rows, start + timedelta(days=70), already_booked=5)
        self.assertTrue(result["selected"])
        self.assertLess(result["validation_model_mae"], result["validation_baseline_mae"])
        self.assertEqual(result["holdout_days"], 10)
        self.assertGreaterEqual(result["low"], 5)

    def test_flat_history_keeps_simpler_baseline(self):
        start = date(2026, 1, 1)
        rows = [(start + timedelta(days=index), 3) for index in range(60)]
        result = trained_forecast(rows, start + timedelta(days=60))
        self.assertFalse(result["selected"])
        self.assertEqual(result["reason"], "baseline_performed_as_well_or_better")

    def test_future_observations_cannot_train_past_prediction(self):
        start = date(2026, 1, 1)
        rows = [(start + timedelta(days=index), 3 + index // 8) for index in range(60)]
        target = start + timedelta(days=50)
        baseline = trained_forecast(rows, target)
        poisoned = trained_forecast(rows + [(target + timedelta(days=1), 10000)], target)
        self.assertEqual(baseline, poisoned)

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
