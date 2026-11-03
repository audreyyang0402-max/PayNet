"""Descriptive statistics; today's partial day is excluded from planning rates."""
from statistics import mean, median, pstdev


def daily_statistics(daily, amount_key):
    complete = daily[:-1]
    counts = [row['orders'] for row in complete]
    amounts = [row[amount_key] for row in complete]
    return {
        'sample_days': len(complete),
        'orders_per_day': round(mean(counts), 2) if counts else 0,
        'median_daily_orders': median(counts) if counts else 0,
        'daily_order_stddev': round(pstdev(counts), 2) if counts else 0,
        'average_daily_amount': round(mean(amounts), 2) if amounts else 0,
        'days_with_orders': sum(n > 0 for n in counts),
    }
