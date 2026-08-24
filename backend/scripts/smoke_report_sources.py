"""Reversible Phase-3 smoke test for the isolated cloned database only."""

from __future__ import annotations

from urllib.parse import urlparse

from app.config import get_settings
from app.services import final_reports, report_sources
from app.services.case_access import load_officer_by_badge
from app.services.db import fetch_one, get_conn


TEST_PROJECT_REF = "njpodfktpkuwzjclwrwo"


def _assert_test_database() -> None:
    username = urlparse(get_settings().database_url).username or ""
    project_ref = username.split(".", 1)[1] if "." in username else ""
    if project_ref != TEST_PROJECT_REF:
        raise RuntimeError("Refusing to run: DATABASE_URL is not the isolated test project")


def _cleanup(case_id: str) -> None:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute('DELETE FROM "FinalReport" WHERE "caseId" = %(caseId)s', {"caseId": case_id})
            for table in (
                "CasePartyEvent",
                "CaseLegalSection",
                "CasePropertyItem",
                "CaseExpertResult",
                "EvidenceAssessment",
                "CasePartyProfile",
                "CaseReportSourceState",
            ):
                cur.execute(f'DELETE FROM "{table}" WHERE "caseId" = %(caseId)s', {"caseId": case_id})
        conn.commit()


def main() -> None:
    _assert_test_database()
    officer = load_officer_by_badge("KA-SP-9999")
    if not officer:
        raise RuntimeError("Seeded KA-SP-9999 officer was not found")
    candidate = fetch_one(
        '''
        SELECT c.id FROM "Case" c
        JOIN "PoliceStation" ps ON c."stationId" = ps.id
        WHERE ps."districtId" = %(districtId)s
          AND EXISTS (SELECT 1 FROM "CasePerson" cp WHERE cp."caseId" = c.id)
          AND NOT EXISTS (SELECT 1 FROM "FinalReport" fr WHERE fr."caseId" = c.id)
          AND NOT EXISTS (SELECT 1 FROM "CaseReportSourceState" rs WHERE rs."caseId" = c.id)
        ORDER BY c."reportedDate" DESC LIMIT 1
        ''',
        {"districtId": officer["districtId"]},
    )
    if not candidate:
        raise RuntimeError("No untouched scoped case is available for a reversible smoke test")
    case_id = candidate["id"]
    try:
        initial = report_sources.load_report_sources(case_id, officer)
        sources = initial["sources"]
        if not sources or not sources["parties"]:
            raise RuntimeError("Candidate case has no report-source parties")
        sources["parties"][0]["isComplainant"] = True
        sources["parties"][0]["verificationNotes"] = "Reversible Phase-3 smoke-test record"

        initialized = final_reports.initialize_report(case_id, officer)
        assert initialized["report"]["revision"] == 1
        saved = report_sources.save_report_sources(
            case_id,
            officer,
            expected_revision=0,
            payload=sources,
        )
        assert saved["revision"] == 1
        refreshed = final_reports.refresh_report_sources(
            case_id,
            officer,
            expected_revision=initialized["report"]["revision"],
        )
        assert refreshed["report"]["payload"]["sourceRevision"] == 1
        assert refreshed["report"]["versionNumber"] == 2
        print("Phase-3 source save and report refresh passed; temporary records will be removed")
    finally:
        _cleanup(case_id)


if __name__ == "__main__":
    main()
