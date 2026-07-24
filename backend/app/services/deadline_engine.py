from __future__ import annotations

from datetime import datetime, timedelta, timezone
from math import ceil
from typing import Any

from app.services.case_access import jurisdiction_filter_sql
from app.services.db import fetch_all

# Statutory deadline engine. BNSS 187(3) (successor to CrPC 167(2)): if the
# charge sheet isn't filed within 60 days (90 days for grave offences), the
# accused becomes entitled to default bail. Clocks anchor to the FIR reported
# date because arrest/remand dates aren't in the schema — the legally exact
# clock runs from first remand; tier thresholds (15/30 days) are configurable
# operational policy, not law.

GRAVE_KEYWORDS = [
    "murder", "homicide", "rape", "pocso", "dacoity", "robbery", "kidnap",
    "abduct", "acid", "trafficking", "terror", "waging war", "counterfeit",
    "organised crime", "organized crime",
]

STANDARD_WINDOW_DAYS = 60
GRAVE_WINDOW_DAYS = 90
VICTIM_UPDATE_WINDOW_DAYS = 90

URGENT_THRESHOLD_DAYS = 15
WATCH_THRESHOLD_DAYS = 30

CHARGESHEET_STATUTE = "BNSS 187(3)"
CHARGESHEET_CONSEQUENCE = "Accused becomes entitled to DEFAULT BAIL"
VICTIM_UPDATE_STATUTE = "BNSS 193(3)(ii)"
VICTIM_UPDATE_CONSEQUENCE = "Statutory duty to inform victim/informant"

TIER_ORDER = {"COMPLIANT": 0, "ON_TRACK": 1, "WATCH": 2, "URGENT": 3, "OVERDUE": 4}
STOPPED_STATUSES = {"CHARGESHEETED", "CLOSED"}


def is_grave_offence(crime_type: str | None, summary: str | None = None) -> bool:
    haystack = f"{crime_type or ''} {summary or ''}".lower()
    return any(keyword in haystack for keyword in GRAVE_KEYWORDS)


def _tier_for_days_left(days_left: int) -> str:
    if days_left < 0:
        return "OVERDUE"
    if days_left <= URGENT_THRESHOLD_DAYS:
        return "URGENT"
    if days_left <= WATCH_THRESHOLD_DAYS:
        return "WATCH"
    return "ON_TRACK"


def _compute_clock(
    reported_date: datetime,
    now: datetime,
    window_days: int,
    statute: str,
    consequence: str,
    stopped: bool,
) -> dict[str, Any]:
    due_date = reported_date + timedelta(days=window_days)
    days_left = ceil((due_date - now).total_seconds() / 86400)
    return {
        "windowDays": window_days,
        "dueDate": due_date.isoformat(),
        "daysLeft": days_left,
        "elapsedDays": (now - reported_date).days,
        "tier": "COMPLIANT" if stopped else _tier_for_days_left(days_left),
        "statute": statute,
        "consequence": consequence,
    }


def _parse_reported_date(value: Any) -> datetime:
    parsed = value if isinstance(value, datetime) else datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    # DB rows round-trip as naive ISO strings (no offset) even though the
    # column is timestamptz — the underlying instant is UTC, so assume that
    # rather than let naive/aware arithmetic blow up against a real `now`.
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def compute_case_clocks(case: dict[str, Any], now: datetime) -> dict[str, Any]:
    reported_date = _parse_reported_date(case["reportedDate"])
    grave = is_grave_offence(case.get("crimeType"), case.get("summary"))
    stopped = case.get("status") in STOPPED_STATUSES
    window_days = GRAVE_WINDOW_DAYS if grave else STANDARD_WINDOW_DAYS

    chargesheet = _compute_clock(
        reported_date, now, window_days, CHARGESHEET_STATUTE, CHARGESHEET_CONSEQUENCE, stopped
    )
    victim = _compute_clock(
        reported_date, now, VICTIM_UPDATE_WINDOW_DAYS, VICTIM_UPDATE_STATUTE, VICTIM_UPDATE_CONSEQUENCE, stopped
    )
    worst_tier = max((chargesheet["tier"], victim["tier"]), key=lambda t: TIER_ORDER[t])

    return {
        "grave": grave,
        "chargesheet": chargesheet,
        "victim": victim,
        "tier": worst_tier,
    }


def get_compliance_board(officer: dict[str, Any]) -> dict[str, Any]:
    scope_sql, scope_params = jurisdiction_filter_sql(officer, alias="c")
    cases = fetch_all(
        f'''
        SELECT c.id, c."firNumber", c."crimeType", c.status, c."reportedDate", c.summary
        FROM "Case" c
        WHERE 1=1{scope_sql}
        ''',
        scope_params,
    )

    now = datetime.now(timezone.utc)
    summary = {"OVERDUE": 0, "URGENT": 0, "WATCH": 0, "ON_TRACK": 0, "COMPLIANT": 0}
    board: list[dict[str, Any]] = []
    for case in cases:
        clocks = compute_case_clocks(case, now)
        summary[clocks["tier"]] += 1
        board.append(
            {
                "caseId": case["id"],
                "firNumber": case["firNumber"],
                "crimeType": case["crimeType"],
                "status": case["status"],
                "grave": clocks["grave"],
                "tier": clocks["tier"],
                "chargesheet": clocks["chargesheet"],
                "victim": clocks["victim"],
            }
        )

    board.sort(key=lambda row: (-TIER_ORDER[row["tier"]], row["chargesheet"]["daysLeft"]))
    return {"board": board, "summary": summary}


def get_deadline_risks(officer: dict[str, Any], take: int = 10) -> list[dict[str, Any]]:
    scope_sql, scope_params = jurisdiction_filter_sql(officer, alias="c")
    cases = fetch_all(
        f'''
        SELECT c.id, c."firNumber", c."crimeType", c.status, c."reportedDate", c.summary
        FROM "Case" c
        WHERE c.status IN ('OPEN', 'UNDER_INVESTIGATION'){scope_sql}
        ''',
        scope_params,
    )

    now = datetime.now(timezone.utc)
    healthy = {"ON_TRACK", "COMPLIANT"}
    risks: list[dict[str, Any]] = []
    for case in cases:
        clocks = compute_case_clocks(case, now)
        if clocks["tier"] in healthy:
            continue
        risks.append(
            {
                "firNumber": case["firNumber"],
                "crimeType": case["crimeType"],
                "tier": clocks["tier"],
                "daysLeft": clocks["chargesheet"]["daysLeft"],
                "grave": clocks["grave"],
                "statute": clocks["chargesheet"]["statute"],
                "consequence": clocks["chargesheet"]["consequence"],
            }
        )

    risks.sort(key=lambda r: r["daysLeft"])
    return risks[:take]
