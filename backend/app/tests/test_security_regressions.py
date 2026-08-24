from __future__ import annotations

import asyncio

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.main import app
from app.routers import cases


def test_police_it_cannot_save_chargesheet() -> None:
    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            cases.update_chargesheet(
                "case-1",
                cases.ChargesheetUpdateRequest(chargesheetDraft="draft"),
                {"officer": {"role": "POLICE_IT"}},
            )
        )
    assert exc.value.status_code == 403


def test_police_it_cannot_generate_chargesheet() -> None:
    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            cases._generate_chargesheet_markdown(
                "case-1",
                {"role": "POLICE_IT"},
            )
        )
    assert exc.value.status_code == 403


def test_police_it_cannot_record_a_custody_clock() -> None:
    with pytest.raises(HTTPException) as exc:
        cases.record_custody_clock(
            "case-1",
            cases.CustodyClockRequest(
                casePersonId="case-person-1",
                firstRemandAt="2026-08-24T10:00:00Z",
                windowDays=60,
                thresholdBasis="OTHER_OFFENCE",
                legalSectionDetails="BNS section checked",
                remandOrderReference="RM-1",
                acknowledgeFirstRemand=True,
            ),
            {"officer": {"role": "POLICE_IT"}},
        )
    assert exc.value.status_code == 403


def test_match_update_is_bound_to_route_case(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict = {}

    def fake_update(match_id, status, officer, *, case_id=None):
        captured.update(
            match_id=match_id,
            status=status,
            officer=officer,
            case_id=case_id,
        )
        return {"match": {"id": match_id, "caseId": case_id}}

    monkeypatch.setattr(cases.intake_intel, "update_match_status", fake_update)
    response = cases.update_match(
        "case-expected",
        cases.MatchUpdateRequest(matchId="match-1", status="CONFIRMED"),
        {"officer": {"id": "officer-1", "role": "INSPECTOR"}},
    )

    assert response["success"] is True
    assert captured["case_id"] == "case-expected"


def test_tts_requires_authentication() -> None:
    response = TestClient(app).get("/api/tts", params={"text": "hello"})
    assert response.status_code in (401, 403)


def test_serialized_diary_dates_are_supported() -> None:
    assert cases._display_date("2026-08-24T09:30:00+00:00") == "2026-08-24"
