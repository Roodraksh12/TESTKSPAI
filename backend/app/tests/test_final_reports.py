from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.services import final_report_pdf, final_reports


def _ready_payload() -> dict:
    return {
        "schemaVersion": 1,
        "reportType": "CHARGE_SHEET",
        "caseDetails": {
            "caseId": "case-1",
            "firNumber": "FIR/2026/0001",
            "stationName": "Whitefield",
            "districtName": "Bengaluru",
            "crimeType": "Theft",
            "caseStatus": "UNDER_INVESTIGATION",
            "incidentDate": "2026-08-20",
            "reportedDate": "2026-08-20",
            "currentIoName": "Test IO",
            "currentIoBadgeId": "KA-IO-1",
        },
        "accused": [
            {
                "key": "accused-1",
                "selected": True,
                "name": "Accused One",
                "address": "Recorded address",
                "custodyStatus": "REMANDED",
                "firstRemandAt": "2026-08-21T10:00:00Z",
                "bailStatus": "NOT_RECORDED",
                "allegation": "Dishonestly removed the recorded property.",
                "isManual": False,
            }
        ],
        "offences": [
            {
                "key": "bns-303",
                "selected": True,
                "actCode": "BNS",
                "sectionNumber": "303(2)",
                "title": "Theft",
                "punishment": "As provided by law",
                "conditionNote": "",
                "isManual": False,
            }
        ],
        "witnesses": [
            {
                "key": "witness-1",
                "selected": True,
                "name": "Witness One",
                "statementSummary": "Identified the recovered property.",
                "isManual": False,
            }
        ],
        "evidence": [
            {
                "key": "evidence-1",
                "selected": True,
                "type": "PHYSICAL",
                "description": "Recovered property",
                "status": "COLLECTED",
                "timestamp": "2026-08-21T11:00:00Z",
            }
        ],
        "documents": [
            {
                "key": "document-1",
                "selected": True,
                "name": "Seizure mahazar",
                "category": "SEIZURE_RECORD",
                "createdAt": "2026-08-21T12:00:00Z",
            }
        ],
        "allegationMatrix": [
            {
                "key": "accused-1:bns-303",
                "accusedKey": "accused-1",
                "offenceKey": "bns-303",
                "facts": "The property was recovered pursuant to the recorded investigation.",
                "evidenceKeys": ["evidence-1"],
                "witnessKeys": ["witness-1"],
            }
        ],
        "narrative": {
            "caseBackground": "A theft was reported.",
            "informationReceived": "The information was registered as an FIR.",
            "investigationConducted": "The scene was visited and records were collected.",
            "evidenceSummary": "The selected evidence is indexed in Schedule B.",
            "conclusion": "The recorded material supports sending the accused for trial.",
            "prayer": "Submitted to the competent Court for consideration under BNSS section 193.",
        },
        "issueExplanations": {},
        "officerDeclaration": True,
        "preparedAt": "2026-08-24T00:00:00Z",
    }


def _phase2_payload() -> dict:
    payload = _ready_payload()
    payload.update(
        {
            "schemaVersion": 2,
            "reportMetadata": {
                "templateProfile": "RAJASTHAN_IIF_IV_REFERENCE_V1",
                "legalRegime": "BNS_BNSS_2023",
                "finalReportNumber": "FR-TEST-1",
                "finalReportDate": "2026-08-24",
                "reportCategory": "ORIGINAL",
                "courtName": "Test Court",
                "filingPlace": "Test District",
            },
            "complainant": {"name": "Recorded informant", "verificationStatus": "VERIFIED"},
            "victims": [{"key": "victim-1", "selected": True, "name": "Recorded victim"}],
            "propertyItems": [
                {
                    "key": "property-1",
                    "selected": True,
                    "description": "Recorded case property",
                    "recoveryStatus": "SEIZED",
                }
            ],
            "expertResults": [],
        }
    )
    payload["accused"][0].update({"identityStatus": "VERIFIED", "disposition": "CHARGE_SHEETED"})
    payload["offences"][0].update({"firStage": "ALLEGED", "finalDecision": "RETAINED"})
    payload["documents"][0].update({"sequenceNumber": 1, "annexureNumber": "1", "pageCount": 1})
    return payload


def test_complete_structured_report_is_ready() -> None:
    validation = final_reports.validate_payload(_ready_payload())

    assert validation["ready"] is True
    assert validation["counts"]["errors"] == 0
    assert validation["counts"]["unansweredExplanations"] == 0


def test_phase2_report_requires_filing_and_change_tracking_fields() -> None:
    payload = _phase2_payload()
    validation = final_reports.validate_payload(payload)

    assert validation["ready"] is True

    payload["reportMetadata"]["courtName"] = ""
    payload["offences"][0]["finalDecision"] = "NOT_RECORDED"
    invalid = final_reports.validate_payload(payload)
    codes = {issue["code"] for issue in invalid["issues"]}

    assert invalid["ready"] is False
    assert {"REPORT_METADATA_REQUIRED", "FINAL_SECTION_DECISION_REQUIRED"} <= codes


def test_phase1_payload_upgrades_without_losing_selected_records() -> None:
    payload = _ready_payload()
    context = {
        "victims": [
            {
                "casePersonId": "victim-1",
                "personId": "person-victim-1",
                "name": "Database Victim",
                "phone": None,
                "address": "Recorded address",
            }
        ]
    }

    upgraded = final_reports.upgrade_payload(payload, context)

    assert upgraded["schemaVersion"] == 2
    assert upgraded["accused"][0]["name"] == "Accused One"
    assert upgraded["reportMetadata"]["templateProfile"] == "RAJASTHAN_IIF_IV_REFERENCE_V1"
    assert upgraded["victims"][0]["name"] == "Database Victim"
    assert upgraded["documents"][0]["sequenceNumber"] == 1


def test_phase2_dropped_section_requires_reason_and_annexures_are_unique() -> None:
    payload = _phase2_payload()
    payload["offences"].append(
        {
            "key": "bns-dropped",
            "selected": False,
            "actCode": "BNS",
            "sectionNumber": "999",
            "title": "Test dropped provision",
            "firStage": "ALLEGED",
            "finalDecision": "DROPPED",
            "decisionReason": "",
        }
    )
    payload["documents"].append(
        {
            "key": "document-2",
            "selected": True,
            "name": "Second annexure",
            "sequenceNumber": 1,
            "annexureNumber": "1",
            "pageCount": 1,
        }
    )

    validation = final_reports.validate_payload(payload)
    codes = {issue["code"] for issue in validation["issues"]}

    assert "DROPPED_SECTION_REASON_REQUIRED" in codes
    assert "DUPLICATE_ANNEXURE_SEQUENCE" in codes
    assert "DUPLICATE_ANNEXURE_NUMBER" in codes


def test_missing_required_report_fields_are_blocking() -> None:
    payload = _ready_payload()
    payload["accused"][0]["selected"] = False
    payload["offences"][0]["selected"] = False
    payload["officerDeclaration"] = False

    validation = final_reports.validate_payload(payload)
    codes = {issue["code"] for issue in validation["issues"]}

    assert validation["ready"] is False
    assert {"ACCUSED_REQUIRED", "OFFENCE_REQUIRED", "OFFICER_DECLARATION_REQUIRED"} <= codes


def test_explanation_issue_blocks_until_officer_answers() -> None:
    payload = _ready_payload()
    payload["documents"][0]["selected"] = False
    first = final_reports.validate_payload(payload)
    issue = next(issue for issue in first["issues"] if issue["code"] == "NO_DOCUMENTS_SELECTED")

    assert first["ready"] is False
    payload["issueExplanations"][issue["key"]] = "No separate document is relied upon in this report."
    second = final_reports.validate_payload(payload)

    assert second["ready"] is True
    assert second["counts"]["unansweredExplanations"] == 0


def test_source_linked_person_name_is_resolved_from_case_context() -> None:
    payload = _ready_payload()
    payload["accused"][0].update(
        {
            "sourceCasePersonId": "case-person-1",
            "name": "Tampered client name",
        }
    )
    payload["evidence"][0]["sourceEvidenceId"] = "evidence-1"
    payload["documents"][0]["sourceDocumentId"] = "document-1"
    payload["offences"][0]["catalogId"] = "bns-303"
    context = {
        "case": {
            "id": "case-1",
            "firNumber": "FIR/2026/0001",
            "stationId": "station-1",
            "stationName": "Whitefield",
            "districtName": "Bengaluru",
            "crimeType": "Theft",
            "status": "UNDER_INVESTIGATION",
            "incidentDate": "2026-08-20",
            "reportedDate": "2026-08-20",
            "summary": "Summary",
            "currentIoId": "officer-1",
            "currentIoName": "Test IO",
            "currentIoBadgeId": "KA-IO-1",
        },
        "people": [
            {
                "casePersonId": "case-person-1",
                "personId": "person-1",
                "role": "ACCUSED",
                "name": "Database Name",
                "phone": None,
                "address": "Database address",
            }
        ],
        "evidence": [
            {
                "id": "evidence-1",
                "type": "PHYSICAL",
                "description": "Recovered property",
                "status": "COLLECTED",
                "timestamp": "2026-08-21T11:00:00Z",
            }
        ],
        "documents": [
            {
                "id": "document-1",
                "name": "Seizure mahazar",
                "metadata": {},
                "createdAt": "2026-08-21T12:00:00Z",
            }
        ],
        "legalCatalog": [
            {
                "id": "bns-303",
                "actCode": "BNS",
                "sectionNumber": "303(2)",
                "title": "Theft",
                "punishment": "As provided by law",
                "conditionNote": "",
            }
        ],
        "custodyClocks": [],
    }

    normalized = final_reports.normalize_payload(payload, context)

    assert normalized["accused"][0]["name"] == "Database Name"
    assert normalized["accused"][0]["address"] == "Database address"


def test_person_source_with_wrong_case_role_is_rejected() -> None:
    payload = _ready_payload()
    payload["accused"][0]["sourceCasePersonId"] = "victim-1"
    context = {
        "case": {
            "id": "case-1",
            "firNumber": "FIR/2026/0001",
            "stationId": "station-1",
            "stationName": "Whitefield",
            "districtName": "Bengaluru",
            "crimeType": "Theft",
            "status": "UNDER_INVESTIGATION",
            "incidentDate": "2026-08-20",
            "reportedDate": "2026-08-20",
            "summary": "Summary",
            "currentIoId": "officer-1",
            "currentIoName": "Test IO",
            "currentIoBadgeId": "KA-IO-1",
        },
        "people": [{"casePersonId": "victim-1", "personId": "person-1", "role": "VICTIM", "name": "Victim"}],
        "evidence": [],
        "documents": [],
        "legalCatalog": [],
        "custodyClocks": [],
    }

    with pytest.raises(HTTPException) as exc:
        final_reports.normalize_payload(payload, context)

    assert exc.value.status_code == 400


def test_pdf_is_built_from_saved_snapshot() -> None:
    payload = _ready_payload()
    report = {
        "id": "report-1",
        "status": "DRAFT",
        "formatVersion": "BNSS193-PROVISIONAL-V1",
        "versionNumber": 2,
        "payload": payload,
        "validation": final_reports.validate_payload(payload),
        "createdByName": "Test IO",
        "updatedByName": "Test IO",
        "updatedAt": "2026-08-24T00:00:00Z",
    }

    pdf = final_report_pdf.build_final_report_pdf(report)

    assert pdf.startswith(b"%PDF")
    assert len(pdf) > 5_000
