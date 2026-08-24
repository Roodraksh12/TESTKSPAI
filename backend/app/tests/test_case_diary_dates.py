from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from app.routers.case_diary import _diary_date_for, _stored_utc_timestamp


def test_diary_date_uses_karnataka_calendar_not_utc_day() -> None:
    # 01:05 IST on 24 August is still 19:35 UTC on 23 August. The diary must
    # group it under the officer's local diary date, 24 August.
    stored_utc = datetime(2026, 8, 23, 19, 35, tzinfo=timezone.utc)
    assert _diary_date_for(stored_utc).isoformat() == "2026-08-24"


def test_client_local_timestamp_is_stored_as_utc_wall_clock() -> None:
    local_time = datetime(2026, 8, 24, 1, 5, tzinfo=ZoneInfo("Asia/Kolkata"))
    assert _stored_utc_timestamp(local_time) == datetime(2026, 8, 23, 19, 35)
