from pathlib import Path

import pytest
from fastapi import HTTPException

from app.routers.investigation_plans import (
    DocumentUpdateRequest,
    TaskUpdateRequest,
    _require_plan_write,
    _validate_document_inputs,
    get_investigation_plan,
)
from app.services import investigation_playbooks
from app.services.case_access import load_officer_by_badge
from app.services.db import fetch_one


def test_provisional_registry_is_explicit_and_versioned() -> None:
    registry = investigation_playbooks.load_registry()

    assert registry["sourceStatus"] == "PROVISIONAL_DEMO"
    assert registry["version"] >= 1
    assert "not an official" in registry["disclaimer"].lower()


def test_crime_profile_adds_relevant_steps_without_mutating_general_plan() -> None:
    burglary = investigation_playbooks.select_playbook("Burglary")
    general = investigation_playbooks.select_playbook("Unknown case type")

    assert burglary["matchedCrimeProfile"] == "BURGLARY"
    assert {step["key"] for step in burglary["steps"]} >= {
        "VERIFY_CASE_RECORD",
        "BURGLARY_ENTRY_DOCUMENTATION",
        "BURGLARY_PROPERTY_RECONCILIATION",
    }
    assert "BURGLARY_ENTRY_DOCUMENTATION" not in {
        step["key"] for step in general["steps"]
    }
    assert [step["sortOrder"] for step in burglary["steps"]] == list(
        range(len(burglary["steps"]))
    )


def test_document_render_requires_officer_decisions_and_keeps_demo_banner() -> None:
    case_context = {
        "firNumber": "FIR/2026/TEST-1",
        "crimeType": "Burglary",
        "incidentDate": "2026-08-24",
        "caseSummary": "Verified summary",
        "stationName": "Test Police Station",
        "officerName": "Test IO",
        "officerBadgeId": "KA-IO-TEST",
    }

    with pytest.raises(investigation_playbooks.DocumentInputError):
        investigation_playbooks.render_document(
            "RECORD_PRESERVATION_REQUEST",
            case_context=case_context,
            officer_inputs={"recipient": "Records officer"},
        )

    rendered = investigation_playbooks.render_document(
        "RECORD_PRESERVATION_REQUEST",
        case_context=case_context,
        officer_inputs={
            "recipient": "Records officer",
            "recordsRequested": "The officer-selected records",
            "reason": "The officer-recorded reason",
        },
    )

    assert rendered["sourceStatus"] == "PROVISIONAL_DEMO"
    assert rendered["content"].startswith(
        "DEMO DRAFT — NOT AN OFFICIAL DEPARTMENTAL FORMAT"
    )
    assert "FIR/2026/TEST-1" in rendered["content"]
    assert "The officer-selected records" in rendered["content"]

    with pytest.raises(investigation_playbooks.DocumentInputError):
        investigation_playbooks.render_document(
            "RECORD_PRESERVATION_REQUEST",
            case_context=case_context,
            officer_inputs={
                "recipient": "Records officer",
                "recordsRequested": "Records",
                "reason": "Reason",
                "firNumber": "FIR/SPOOFED",
            },
        )


def test_document_templates_are_metadata_only_until_officer_supplies_fields() -> None:
    templates = investigation_playbooks.list_document_templates()

    assert templates
    assert all(template["sourceStatus"] == "PROVISIONAL_DEMO" for template in templates)
    assert all(template["requiredFields"] for template in templates)


def test_task_and_document_payload_guards() -> None:
    assert TaskUpdateRequest(status="COMPLETED").status == "COMPLETED"
    assert DocumentUpdateRequest(
        content="DEMO DRAFT — NOT AN OFFICIAL DEPARTMENTAL FORMAT\nBody"
    ).content
    assert _validate_document_inputs({" recipient ": " office "}) == {
        "recipient": "office"
    }

    with pytest.raises(HTTPException) as caught:
        _validate_document_inputs({f"field-{index}": "value" for index in range(13)})
    assert caught.value.status_code == 422


def test_only_case_writers_and_assigned_io_can_modify_plan() -> None:
    case = {"currentIoId": "io-1"}

    with pytest.raises(HTTPException) as read_only:
        _require_plan_write(case, {"id": "it-1", "role": "POLICE_IT"})
    assert read_only.value.status_code == 403

    with pytest.raises(HTTPException) as not_assigned:
        _require_plan_write(case, {"id": "io-2", "role": "INSPECTOR"})
    assert not_assigned.value.status_code == 403

    _require_plan_write(case, {"id": "io-1", "role": "INSPECTOR"})


def test_migration_preserves_provisional_status_and_draft_only_constraints() -> None:
    migration = (
        Path(__file__).resolve().parents[3]
        / "database"
        / "migrations"
        / "0013_investigation_playbooks.sql"
    ).read_text(encoding="utf-8")

    assert "CaseInvestigationPlan" in migration
    assert "CaseInvestigationTask" in migration
    assert "RoutineDocumentDraft" in migration
    assert "PROVISIONAL_DEMO" in migration
    assert "status IN ('DRAFT', 'ARCHIVED')" in migration
    assert "RoutineDocumentDraft_task_case_fkey" in migration


def test_plan_endpoint_reads_from_isolated_database(db_available: bool) -> None:
    if not db_available:
        pytest.skip("test Postgres is not reachable")
    officer = load_officer_by_badge("KA-SP-9999")
    if not officer:
        pytest.skip("seeded SP account is unavailable")
    case = fetch_one(
        '''SELECT c.id FROM "Case" c
           JOIN "PoliceStation" ps ON c."stationId" = ps.id
           WHERE ps."districtId" = %(districtId)s
           ORDER BY c."reportedDate" DESC LIMIT 1''',
        {"districtId": officer["districtId"]},
    )
    assert case is not None

    result = get_investigation_plan(
        case["id"],
        current_user={"officer": officer},
    )

    assert result["availableProfile"]["sourceStatus"] == "PROVISIONAL_DEMO"
    assert isinstance(result["documentTemplates"], list)
    assert isinstance(result["documents"], list)
