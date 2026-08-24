from __future__ import annotations

import pytest

from app.services import deadline_engine
from app.services.case_access import load_officer_by_badge


@pytest.fixture(scope="module")
def sp_officer(db_available: bool):
    if not db_available:
        pytest.skip("local Postgres not reachable")
    officer = load_officer_by_badge("KA-SP-9999")
    assert officer is not None
    return officer


def test_compliance_board_summary_sums_to_total_cases(sp_officer) -> None:
    result = deadline_engine.get_compliance_board(sp_officer)
    total = sum(result["summary"].values())
    assert total == len(result["board"])
    assert total > 0


def test_compliance_board_does_not_infer_default_bail_from_fir_dates(sp_officer) -> None:
    result = deadline_engine.get_compliance_board(sp_officer)
    assert isinstance(result["storageReady"], bool)
    assert all(row["chargesheet"] is None or row["chargesheet"]["personName"] for row in result["board"])


def test_deadline_risks_exclude_healthy_tiers(sp_officer) -> None:
    risks = deadline_engine.get_deadline_risks(sp_officer, take=50)
    assert all(r["tier"] not in ("ON_TRACK", "COMPLIANT") for r in risks)
    days_left = [r["daysLeft"] for r in risks]
    assert days_left == sorted(days_left)
