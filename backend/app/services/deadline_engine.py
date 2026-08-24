from __future__ import annotations

from datetime import datetime, time, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

from app.services.case_access import jurisdiction_filter_sql
from app.services.custody_clocks import clocks_by_case
from app.services.db import fetch_all

# BNSS 187(3) is a custody/remand clock, not an FIR-registration clock. The
# deadline is tracked separately for every accused because a single FIR can
# have arrests and first remands on different dates. The jurisdiction's court
# calendar is represented in India Standard Time for this Karnataka product.

INDIA_TIME_ZONE = ZoneInfo("Asia/Kolkata")
STANDARD_WINDOW_DAYS = 60
GRAVE_WINDOW_DAYS = 90
VICTIM_UPDATE_WINDOW_DAYS = 90

URGENT_THRESHOLD_DAYS = 15
WATCH_THRESHOLD_DAYS = 30

CHARGESHEET_STATUTE = "BNSS 187(3)"
CHARGESHEET_CONSEQUENCE = "Default-bail entitlement may accrue if the accused is prepared to furnish bail"
VICTIM_UPDATE_STATUTE = "BNSS 193(3)(ii)"
VICTIM_UPDATE_CONSEQUENCE = "Statutory duty to inform victim/informant"

TIER_ORDER = {
    "NOT_STARTED": 0,
    "COMPLIANT": 1,
    "ON_TRACK": 2,
    "WATCH": 3,
    "URGENT": 4,
    "OVERDUE": 5,
}
STOPPED_STATUSES = {"CHARGESHEETED", "CLOSED"}


def is_grave_offence(crime_type: str | None, summary: str | None = None) -> bool:
    """Legacy UI helper only; it must not choose a statutory 60/90-day window."""
    grave_keywords = [
        "murder", "homicide", "rape", "pocso", "dacoity", "robbery", "kidnap",
        "abduct", "acid", "trafficking", "terror", "waging war", "counterfeit",
        "organised crime", "organized crime",
    ]
    haystack = f"{crime_type or ''} {summary or ''}".lower()
    return any(keyword in haystack for keyword in grave_keywords)


def _parse_datetime(value: Any) -> datetime:
    parsed = value if isinstance(value, datetime) else datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    # Existing timestamp-without-time-zone columns are stored as UTC wall time.
    return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed.astimezone(timezone.utc)


def _tier_for_active_clock(days_left: int, expired: bool) -> str:
    if expired:
        return "OVERDUE"
    if days_left <= URGENT_THRESHOLD_DAYS:
        return "URGENT"
    if days_left <= WATCH_THRESHOLD_DAYS:
        return "WATCH"
    return "ON_TRACK"


def _compute_fir_follow_up_clock(reported_date: datetime, now: datetime, stopped: bool) -> dict[str, Any]:
    due_date = reported_date + timedelta(days=VICTIM_UPDATE_WINDOW_DAYS)
    days_left = max(0, (due_date.astimezone(INDIA_TIME_ZONE).date() - now.astimezone(INDIA_TIME_ZONE).date()).days)
    return {
        "windowDays": VICTIM_UPDATE_WINDOW_DAYS,
        "dueDate": due_date.isoformat(),
        "daysLeft": days_left,
        "elapsedDays": max(0, (now - reported_date).days),
        "tier": "COMPLIANT" if stopped else _tier_for_active_clock(days_left, due_date <= now),
        "statute": VICTIM_UPDATE_STATUTE,
        "consequence": VICTIM_UPDATE_CONSEQUENCE,
    }


def compute_custody_clock(clock: dict[str, Any], now: datetime) -> dict[str, Any]:
    """Compute one per-accused clock using inclusive court-calendar day counts.

    If the first remand is day 1, the 60th day is remand-date + 59 calendar
    days. The risk date is the next calendar day (the 61st), matching the
    Supreme Court's inclusive-first-remand calculation.
    """
    remand_at = _parse_datetime(clock["firstRemandAt"])
    local_remand_date = remand_at.astimezone(INDIA_TIME_ZONE).date()
    completion_date = local_remand_date + timedelta(days=int(clock["windowDays"]) - 1)
    risk_at = datetime.combine(completion_date + timedelta(days=1), time.min, tzinfo=INDIA_TIME_ZONE)
    now_local = now.astimezone(INDIA_TIME_ZONE)
    days_left = (risk_at.date() - now_local.date()).days

    report_filed_at = clock.get("reportFiledAt")
    filed_at = _parse_datetime(report_filed_at) if report_filed_at else None
    filed_in_time = bool(filed_at and filed_at.astimezone(INDIA_TIME_ZONE) < risk_at)
    expired = now_local >= risk_at
    if filed_at:
        tier = "COMPLIANT" if filed_in_time else "OVERDUE"
    else:
        tier = _tier_for_active_clock(days_left, expired)

    return {
        "id": clock.get("id"),
        "casePersonId": clock.get("casePersonId"),
        "personId": clock.get("personId"),
        "personName": clock.get("personName"),
        "firstRemandAt": remand_at.isoformat(),
        "windowDays": int(clock["windowDays"]),
        "thresholdBasis": clock.get("thresholdBasis"),
        "legalSectionDetails": clock.get("legalSectionDetails"),
        "remandOrderReference": clock.get("remandOrderReference"),
        "notes": clock.get("notes"),
        "completionDate": completion_date.isoformat(),
        "defaultBailRiskAt": risk_at.astimezone(timezone.utc).isoformat(),
        "dueDate": risk_at.astimezone(timezone.utc).isoformat(),
        "daysLeft": days_left,
        "elapsedDays": max(1, (now_local.date() - local_remand_date).days + 1),
        "tier": tier,
        "statute": CHARGESHEET_STATUTE,
        "consequence": (
            "Final report/charge sheet is recorded after the statutory period; obtain legal review."
            if filed_at and not filed_in_time
            else CHARGESHEET_CONSEQUENCE
        ),
        "reportFiledAt": filed_at.isoformat() if filed_at else None,
        "reportReference": clock.get("reportReference"),
        "filingStatus": "FILED_IN_TIME" if filed_in_time else "FILED_AFTER_WINDOW" if filed_at else "NOT_FILED",
    }


def compute_case_clocks(
    case: dict[str, Any],
    now: datetime,
    custody_clocks: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Compute accurate charge-sheet exposure and the independent FIR follow-up duty."""
    reported_date = _parse_datetime(case["reportedDate"])
    stopped = case.get("status") in STOPPED_STATUSES
    computed_custody = [compute_custody_clock(clock, now) for clock in (custody_clocks or [])]

    if computed_custody:
        chargesheet = max(computed_custody, key=lambda item: TIER_ORDER[item["tier"]])
        tier = chargesheet["tier"]
        chargesheet_status = "ACTIVE" if chargesheet["filingStatus"] == "NOT_FILED" else chargesheet["filingStatus"]
    elif stopped:
        # Preserves historical case status without pretending a remand date is
        # known. A newly recorded filing should use the custody-clock endpoint.
        chargesheet = None
        tier = "COMPLIANT"
        chargesheet_status = "LEGACY_CASE_COMPLETED"
    else:
        chargesheet = None
        tier = "NOT_STARTED"
        chargesheet_status = "NO_REMAND_RECORDED"

    return {
        "grave": any(clock["windowDays"] == GRAVE_WINDOW_DAYS for clock in computed_custody),
        "chargesheet": chargesheet,
        "chargesheetStatus": chargesheet_status,
        "custodyClocks": computed_custody,
        "victim": _compute_fir_follow_up_clock(reported_date, now, stopped),
        "tier": tier,
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

    case_clock_rows, storage_ready = clocks_by_case([case["id"] for case in cases])
    now = datetime.now(timezone.utc)
    summary = {tier: 0 for tier in TIER_ORDER}
    board: list[dict[str, Any]] = []
    for case in cases:
        clocks = compute_case_clocks(case, now, case_clock_rows.get(case["id"], []))
        summary[clocks["tier"]] += 1
        board.append(
            {
                "caseId": case["id"],
                "firNumber": case["firNumber"],
                "crimeType": case["crimeType"],
                "status": case["status"],
                "grave": clocks["grave"],
                "tier": clocks["tier"],
                "chargesheetStatus": clocks["chargesheetStatus"],
                "chargesheet": clocks["chargesheet"],
                "custodyClocks": clocks["custodyClocks"],
                "victim": clocks["victim"],
            }
        )

    board.sort(
        key=lambda row: (
            -TIER_ORDER[row["tier"]],
            (row["chargesheet"] or {}).get("daysLeft", 10_000),
            row["firNumber"],
        )
    )
    return {"board": board, "summary": summary, "storageReady": storage_ready}


def get_deadline_risks(officer: dict[str, Any], take: int = 10) -> list[dict[str, Any]]:
    board = get_compliance_board(officer)["board"]
    risks: list[dict[str, Any]] = []
    for row in board:
        clock = row["chargesheet"]
        if not clock or row["tier"] not in {"OVERDUE", "URGENT", "WATCH"}:
            continue
        risks.append(
            {
                "firNumber": row["firNumber"],
                "crimeType": row["crimeType"],
                "personName": clock.get("personName"),
                "tier": row["tier"],
                "daysLeft": clock["daysLeft"],
                "grave": clock["windowDays"] == GRAVE_WINDOW_DAYS,
                "statute": clock["statute"],
                "consequence": clock["consequence"],
            }
        )

    risks.sort(key=lambda risk: risk["daysLeft"])
    return risks[:take]
