"""Weekly pickup rules and the times they make available."""

from datetime import date, datetime, time, timedelta, timezone

from pydantic import BaseModel, Field, model_validator


MYT = timezone(timedelta(hours=8))
SLOT_INTERVALS = (10, 15, 20, 30, 60)


class PickupHours(BaseModel):
    weekday: int = Field(ge=0, le=6)  # Monday is 0.
    opens: time
    closes: time

    @model_validator(mode="after")
    def validate_hours(self):
        if self.opens >= self.closes:
            raise ValueError("Closing time must be after opening time on the same day.")
        if self.opens.second or self.closes.second or self.opens.microsecond or self.closes.microsecond:
            raise ValueError("Use whole-minute opening and closing times.")
        duration = datetime.combine(date.min, self.closes) - datetime.combine(date.min, self.opens)
        if duration > timedelta(hours=12):
            raise ValueError("A pickup day cannot be longer than 12 hours.")
        return self


class PickupSchedule(BaseModel):
    enabled: bool = False
    paused: bool = False
    interval_minutes: int = 15
    max_capacity: int = Field(default=5, ge=1, le=100)
    lead_minutes: int = Field(default=20, ge=0, le=180)
    days: list[PickupHours] = Field(default_factory=list, max_length=7)
    closed_dates: list[date] = Field(default_factory=list, max_length=60)

    @model_validator(mode="after")
    def validate_schedule(self):
        if self.interval_minutes not in SLOT_INTERVALS:
            raise ValueError("Choose a pickup interval of 10, 15, 20, 30, or 60 minutes.")
        weekdays = [day.weekday for day in self.days]
        if len(weekdays) != len(set(weekdays)):
            raise ValueError("Set opening hours only once for each weekday.")
        if len(self.closed_dates) != len(set(self.closed_dates)):
            raise ValueError("A closed date can only be listed once.")
        if self.enabled and not self.days:
            raise ValueError("Choose at least one open day before turning on automatic pickup times.")
        return self


def default_schedule() -> dict:
    return PickupSchedule().model_dump(mode="json")


def is_closed(schedule: PickupSchedule, pickup_time: datetime) -> bool:
    return schedule.paused or pickup_time.astimezone(MYT).date() in schedule.closed_dates


def candidate_times(schedule: PickupSchedule, now: datetime, horizon_days: int = 7) -> list[datetime]:
    """Return future pickup instants in UTC, starting from today's Malaysia date."""
    if not schedule.enabled or schedule.paused:
        return []
    local_now = now.astimezone(MYT)
    earliest = local_now + timedelta(minutes=schedule.lead_minutes)
    by_weekday = {day.weekday: day for day in schedule.days}
    closed = set(schedule.closed_dates)
    candidates: list[datetime] = []
    for offset in range(horizon_days):
        day = local_now.date() + timedelta(days=offset)
        hours = by_weekday.get(day.weekday())
        if not hours or day in closed:
            continue
        pickup = datetime.combine(day, hours.opens, MYT)
        closing = datetime.combine(day, hours.closes, MYT)
        while pickup < closing:
            if pickup >= earliest:
                candidates.append(pickup.astimezone(timezone.utc))
            pickup += timedelta(minutes=schedule.interval_minutes)
    return candidates
