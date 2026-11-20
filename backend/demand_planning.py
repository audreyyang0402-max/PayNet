"""Transparent weekday baseline for the first demand-planning pilot.

The model uses only days when the merchant offered pickup slots. Closed days
are not treated as zero demand. It is a baseline, not a trained AI model.
"""

from math import ceil, sqrt
from statistics import mean, stdev


def forecast_portions(observed: list[int], already_booked: int = 0) -> dict:
    if not observed:
        return {
            "sample_days": 0, "expected": None, "low": None, "high": None,
            "already_booked": already_booked, "confidence": "insufficient_data",
        }
    average = mean(observed)
    spread = stdev(observed) if len(observed) > 1 else sqrt(average)
    # A planning range, not a calibrated probability interval.
    low = max(already_booked, max(0, int(average - spread)))
    high = max(already_booked, ceil(average + spread))
    return {
        "sample_days": len(observed), "expected": max(already_booked, round(average, 1)),
        "low": low, "high": high, "already_booked": already_booked,
        "confidence": "limited" if len(observed) < 3 else "baseline",
    }


def walk_forward_validation(observed: list[int]) -> dict:
    """Score each later day using only earlier comparable days, never future sales."""
    if len(observed) < 5:
        return {"evaluated_days": 0, "mae": None, "last_day_mae": None}
    errors = []
    last_day_errors = []
    # Reserve up to the last four comparable days for retrospective testing.
    for index in range(max(3, len(observed) - 4), len(observed)):
        actual = observed[index]
        errors.append(abs(mean(observed[:index]) - actual))
        last_day_errors.append(abs(observed[index - 1] - actual))
    return {"evaluated_days": len(errors), "mae": round(mean(errors), 2),
            "last_day_mae": round(mean(last_day_errors), 2)}
