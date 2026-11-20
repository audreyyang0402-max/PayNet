"""Transparent weekday baseline and cautious trained candidate for food planning.

The caller supplies offered, verified days; closed days are never zero-filled.
"""

from datetime import date
from math import ceil, cos, pi, sin, sqrt
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


def _features(day: date, origin: date) -> tuple[float, float, float, float]:
    angle = 2 * pi * day.weekday() / 7
    return (1.0, sin(angle), cos(angle), (day - origin).days / 30)


def _fit_ridge(rows: list[tuple[date, int]], origin: date) -> list[float]:
    """Fit a small, regularized weekday/trend regression without extra packages."""
    size = 4
    matrix = [[0.0] * (size + 1) for _ in range(size)]
    for day, count in rows:
        values = _features(day, origin)
        for i in range(size):
            matrix[i][-1] += values[i] * count
            for j in range(size):
                matrix[i][j] += values[i] * values[j]
    for i in range(1, size):
        matrix[i][i] += 2.0  # shrink seasonal/trend terms; leave intercept free
    for i in range(size):
        pivot = max(range(i, size), key=lambda row: abs(matrix[row][i]))
        matrix[i], matrix[pivot] = matrix[pivot], matrix[i]
        if abs(matrix[i][i]) < 1e-10:
            raise ValueError("Not enough independent training data")
        factor = matrix[i][i]
        matrix[i] = [value / factor for value in matrix[i]]
        for row in range(size):
            if row == i:
                continue
            factor = matrix[row][i]
            matrix[row] = [left - factor * right for left, right in zip(matrix[row], matrix[i])]
    return [matrix[i][-1] for i in range(size)]


def _predict(coefficients: list[float], day: date, origin: date) -> float:
    return max(0.0, sum(coefficient * value for coefficient, value in zip(coefficients, _features(day, origin))))


def _weekday_baseline(rows: list[tuple[date, int]], day: date) -> float:
    comparable = [count for past, count in rows if past.weekday() == day.weekday()]
    return mean(comparable if comparable else [count for _, count in rows])


def trained_forecast(observations: list[tuple[date, int]], target: date,
                     already_booked: int = 0) -> dict:
    """Train only on verified, uncensored days supplied by the caller.

    Chronological validation chooses between the model and a weekday mean;
    the later holdout is then scored once. The holdout is never used for model
    selection. Its MAE is descriptive, not a calibrated probability interval.
    """
    ordered = sorted((day, count) for day, count in observations if day < target and count >= 0)
    days = [day for day, _ in ordered]
    if len(days) != len(set(days)):
        raise ValueError("Training observations must have one row per date")
    result = {"selected": False, "sample_days": len(ordered), "expected": None,
              "low": None, "high": None, "reason": "insufficient_verified_history",
              "validation_days": 0, "holdout_days": 0,
              "validation_baseline_mae": None, "validation_model_mae": None,
              "holdout_baseline_mae": None, "holdout_model_mae": None}
    if len(ordered) < 42:
        return result
    holdout_size = max(6, len(ordered) // 7)
    validation_size = max(6, len(ordered) // 7)
    train = ordered[:-(validation_size + holdout_size)]
    validation = ordered[-(validation_size + holdout_size):-holdout_size]
    holdout = ordered[-holdout_size:]
    origin = train[0][0]
    coefficients = _fit_ridge(train, origin)
    baseline_error = mean(abs(_weekday_baseline(train, day) - actual) for day, actual in validation)
    model_error = mean(abs(_predict(coefficients, day, origin) - actual) for day, actual in validation)
    selected = model_error + 0.25 < baseline_error
    combined = train + validation
    coefficients = _fit_ridge(combined, origin)
    holdout_baseline = mean(abs(_weekday_baseline(combined, day) - actual) for day, actual in holdout)
    holdout_model = mean(abs(_predict(coefficients, day, origin) - actual) for day, actual in holdout)
    result.update({"selected": selected, "reason": "validated_improvement" if selected else "baseline_performed_as_well_or_better",
                   "validation_days": len(validation), "holdout_days": len(holdout),
                   "validation_baseline_mae": round(baseline_error, 2),
                   "validation_model_mae": round(model_error, 2),
                   "holdout_baseline_mae": round(holdout_baseline, 2),
                   "holdout_model_mae": round(holdout_model, 2)})
    if selected:
        predicted = _predict(_fit_ridge(ordered, origin), target, origin)
        # A practical planning band around the prediction, not a probability interval.
        spread = max(1.0, model_error)
        result.update({"expected": max(already_booked, round(predicted, 1)),
                       "low": max(already_booked, int(max(0.0, predicted - spread))),
                       "high": max(already_booked, ceil(predicted + spread))})
    return result
