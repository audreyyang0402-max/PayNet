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
