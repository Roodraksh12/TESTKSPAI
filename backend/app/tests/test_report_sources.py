from __future__ import annotations

import pytest

from app.services import final_reports, report_sources
from app.services.case_access import load_officer_by_badge
from app.services.db import fetch_one


def test_source_validation_detects_chronology_and_required_reasons() -> None:
    payload = {
        "parties": [
            {
                "casePersonId": "accused-1",
                "isComplainant": False,
                "identityStatus": "VERIFIED",
                "identityReference": "",
                "verificationNotes": "",
                "disposition": "NOT_CHARGE_SHEETED",
                "dispositionReason": "",
            }
        ],
        "events": [
            {
                "id": "court-1",
                "casePersonId": "accused-1",
                "eventType": "FORWARDED_TO_COURT",
                "occurredAt": "2026-08-24T10:00:00Z",
            }
        ],
        "legalSections": [
            {
                "id": "section-1",
                "actCode": "BNS",
                "sectionNumber": "303(2)",
                "finalDecision": "DROPPED",
                "decisionReason": "",
            }
        ],
        "propertyItems": [],
        "expertResults": [{"id": "expert-1", "status": "RECEIVED", "summary": ""}],
        "evidenceAssessments": [{"evidenceId": "evidence-1", "resultStatus": "RECEIVED", "resultSummary": ""}],
    }

    validation = report_sources.validate_sources(payload)
    codes = {issue["code"] for issue in validation["issues"]}

    assert validation["ready"] is False
    assert {
        "COMPLAINANT_NOT_RECORDED",
        "DISPOSITION_REASON_REQUIRED",
        "IDENTITY_VERIFICATION_REFERENCE_MISSING",
        "SECTION_DECISION_REASON_REQUIRED",
        "ARREST_EVENT_MISSING",
        "EXPERT_SUMMARY_REQUIRED",
        "EVIDENCE_RESULT_SUMMARY_REQUIRED",
    } <= codes


def test_source_validation_detects_remand_before_arrest() -> None:
    validation = report_sources.validate_sources(
        {
            "parties": [{"casePersonId": "accused-1", "isComplainant": True}],
            "events": [
                {
                    "id": "arrest-1",
                    "casePersonId": "accused-1",
                    "eventType": "ARRESTED",
                    "occurredAt": "2026-08-24T12:00:00Z",
                }
            ],
        },
        custody_clocks=[{"casePersonId": "accused-1", "firstRemandAt": "2026-08-24T10:00:00Z"}],
    )

    assert "REMAND_BEFORE_ARREST" in {issue["code"] for issue in validation["issues"]}


def test_report_source_refresh_preserves_officer_text_and_adds_missing_values() -> None:
    payload = {
        "schemaVersion": 2,
        "complainant": {"name": "Officer-entered informant", "sourceCasePersonId": None},
        "victims": [],
        "accused": [
            {
                "key": "accused-1",
                "sourceCasePersonId": "accused-1",
                "selected": True,
                "name": "Accused",
                "alias": "Officer alias",
                "identityStatus": "NOT_RECORDED",
                "arrestAt": "",
                "disposition": "CHARGE_SHEETED",
            }
        ],
        "witnesses": [],
        "offences": [],
        "evidence": [],
        "propertyItems": [],
        "expertResults": [],
    }
    sources = {
        "revision": 4,
        "parties": [
            {
                "casePersonId": "accused-1",
                "isComplainant": False,
                "alias": "Source alias",
                "identityStatus": "VERIFIED",
            },
            {
                "casePersonId": "victim-1",
                "personId": "person-victim",
                "isComplainant": True,
                "name": "Source informant",
            },
        ],
        "events": [
            {
                "casePersonId": "accused-1",
                "eventType": "ARRESTED",
                "occurredAt": "2026-08-24T10:00:00Z",
            }
        ],
        "legalSections": [],
        "evidenceAssessments": [],
        "propertyItems": [],
        "expertResults": [],
    }

    merged = final_reports.merge_case_sources(payload, sources)

    assert merged["sourceRevision"] == 4
    assert merged["complainant"]["name"] == "Officer-entered informant"
    assert merged["accused"][0]["alias"] == "Officer alias"
    assert merged["accused"][0]["identityStatus"] == "VERIFIED"
    assert merged["accused"][0]["arrestAt"] == "2026-08-24T10:00:00Z"


def test_unsaved_source_defaults_do_not_change_report_initialization() -> None:
    payload = {"schemaVersion": 2, "accused": [{"disposition": "CHARGE_SHEETED", "selected": True}]}

    merged = final_reports.merge_case_sources(
        payload,
        {"revision": 0, "parties": [{"casePersonId": "accused-1", "disposition": "NOT_RECORDED"}]},
        overwrite_defaults=True,
    )

    assert merged == payload


def test_report_source_tables_load_from_isolated_database(db_available: bool) -> None:
    if not db_available:
        pytest.skip("test Postgres is not reachable")
    officer = load_officer_by_badge("KA-SP-9999")
    if not officer:
        pytest.skip("seeded SP account is unavailable")
    case = fetch_one(
        '''SELECT c.id FROM "Case" c
           JOIN "PoliceStation" ps ON c."stationId" = ps.id
           WHERE ps."districtId" = %(districtId)s ORDER BY c."reportedDate" DESC LIMIT 1''',
        {"districtId": officer["districtId"]},
    )
    assert case is not None

    result = report_sources.load_report_sources(case["id"], officer)

    assert result["storageReady"] is True
    assert result["revision"] >= 0
    assert set(result["sources"]) >= {
        "parties",
        "events",
        "legalSections",
        "propertyItems",
        "expertResults",
        "evidenceAssessments",
    }
