"""Pickup schedules must respect local days, lead time, and closures."""

import os
import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4
from unittest.mock import AsyncMock, MagicMock

os.environ["DATABASE_URL"] = "postgresql+asyncpg://test:test@127.0.0.1/test"
os.environ["SECRET_KEY"] = "test-only-secret-never-use-in-production-0123456789"
os.environ["SUPABASE_URL"] = ""
os.environ["SUPABASE_SERVICE_ROLE_KEY"] = ""

import pytest
from pydantic import ValidationError

from pickup_schedule import PickupSchedule, candidate_times
from main import sync_automatic_pickup_slots


def schedule(**changes):
    values = {
        "enabled": True,
        "interval_minutes": 30,
        "max_capacity": 4,
        "lead_minutes": 20,
        "days": [{"weekday": 0, "opens": "11:00", "closes": "12:00"}],
    }
    values.update(changes)
    return PickupSchedule.model_validate(values)


def test_malaysia_weekday_and_utc_conversion():
    # Sunday 17:00 UTC is Monday 01:00 in Malaysia.
    times = candidate_times(schedule(), datetime(2026, 11, 22, 17, tzinfo=timezone.utc))
    assert [time.isoformat() for time in times[:2]] == [
        "2026-11-23T03:00:00+00:00", "2026-11-23T03:30:00+00:00",
    ]


def test_lead_time_and_closed_date():
    now = datetime(2026, 11, 23, 2, 50, tzinfo=timezone.utc)  # 10:50 Malaysia time.
    assert [time.hour for time in candidate_times(schedule(), now)] == [3]
    assert candidate_times(schedule(closed_dates=["2026-11-23"]), now) == []
    assert candidate_times(schedule(paused=True), now) == []


def test_schedule_validation_limits_excessive_generation():
    with pytest.raises(ValidationError):
        schedule(days=[{"weekday": 0, "opens": "00:00", "closes": "23:00"}])
    with pytest.raises(ValidationError):
        schedule(days=[])
    with pytest.raises(ValidationError):
        schedule(days=[{"weekday": 0, "opens": "11:00", "closes": "12:00"}] * 2)


class MaterializationTests(unittest.IsolatedAsyncioTestCase):
    async def test_existing_bookings_survive_capacity_change_and_missing_rows_are_added(self):
        now = datetime(2026, 11, 22, 17, tzinfo=timezone.utc)
        expected = candidate_times(schedule(), now)
        merchant = SimpleNamespace(id=uuid4(), pickup_schedule=schedule().model_dump(mode="json"),
                                   pickup_schedule_synced_on=None)
        first = SimpleNamespace(time_slot=expected[0], is_automatic=True, is_bookable=False,
                                current_bookings=6, max_capacity=6)
        result = MagicMock()
        result.scalars.return_value.all.return_value = [first]
        db = MagicMock(execute=AsyncMock(return_value=result))

        await sync_automatic_pickup_slots(db, merchant, now)

        self.assertTrue(first.is_bookable)
        self.assertEqual(first.max_capacity, 6)
        added = db.add.call_args.args[0]
        self.assertEqual(added.time_slot, expected[1])
        self.assertTrue(added.is_automatic)
        self.assertEqual(merchant.pickup_schedule_synced_on.isoformat(), "2026-11-23")

    async def test_pausing_disables_existing_automatic_rows(self):
        now = datetime(2026, 11, 22, 17, tzinfo=timezone.utc)
        first = SimpleNamespace(time_slot=candidate_times(schedule(), now)[0], is_automatic=True,
                                is_bookable=True, current_bookings=0, max_capacity=4)
        merchant = SimpleNamespace(id=uuid4(), pickup_schedule=schedule(paused=True).model_dump(mode="json"),
                                   pickup_schedule_synced_on=None)
        result = MagicMock()
        result.scalars.return_value.all.return_value = [first]
        db = MagicMock(execute=AsyncMock(return_value=result))

        await sync_automatic_pickup_slots(db, merchant, now)

        self.assertFalse(first.is_bookable)
        db.add.assert_not_called()
