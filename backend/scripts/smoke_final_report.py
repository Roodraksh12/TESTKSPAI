"""End-to-end smoke check for the isolated structured final-report flow.

The script refuses to run unless the backend's active connection exactly
matches ``.env.test`` and differs from ``.env``. It initializes (idempotently)
one jurisdiction-visible report through the authenticated API, lists versions,
and writes the returned PDF to ``output/pdf`` for visual QA.
"""

from __future__ import annotations

from pathlib import Path

from dotenv import dotenv_values
from fastapi.testclient import TestClient

from app.config import get_settings
from app.deps import create_access_token
from app.main import app
from app.services.case_access import jurisdiction_filter_sql, load_officer_by_badge
from app.services.db import fetch_one

ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / "backend"
OUTPUT = ROOT / "output" / "pdf" / "Phase2_Final_Report_Sample.pdf"


def _assert_test_database() -> None:
    source = dotenv_values(BACKEND / ".env").get("DATABASE_URL")
    test = dotenv_values(BACKEND / ".env.test").get("DATABASE_URL")
    active = get_settings().database_url
    if not source or not test or active != test or source == test:
        raise RuntimeError("Refusing smoke test: the active database is not the isolated .env.test target")


def main() -> None:
    _assert_test_database()
    officer = load_officer_by_badge("KA-SP-9999")
    if not officer:
        raise RuntimeError("KA-SP-9999 is not present in the isolated test database")

    scope_sql, scope_params = jurisdiction_filter_sql(officer, alias="c")
    case = fetch_one(
        f'''
        SELECT c.id, c."firNumber"
        FROM "Case" c
        WHERE 1 = 1{scope_sql}
        ORDER BY c."reportedDate" DESC, c.id
        LIMIT 1
        ''',
        scope_params,
    )
    if not case:
        raise RuntimeError("No jurisdiction-visible case is available for the smoke test")

    token = create_access_token(officer, get_settings())
    headers = {"Authorization": f"Bearer {token}"}
    client = TestClient(app)
    current = client.get(f'/api/cases/{case["id"]}/final-report', headers=headers)
    current.raise_for_status()
    if not current.json().get("report"):
        initialized = client.post(f'/api/cases/{case["id"]}/final-report/initialize', headers=headers)
        initialized.raise_for_status()
        report = initialized.json()["report"]
    else:
        report = current.json()["report"]

    if report.get("upgradePending"):
        saved = client.put(
            f'/api/cases/{case["id"]}/final-report',
            headers=headers,
            json={"expectedRevision": report["revision"], "payload": report["payload"]},
        )
        saved.raise_for_status()
        report = saved.json()["report"]

    history = client.get(f'/api/cases/{case["id"]}/final-report/versions', headers=headers)
    history.raise_for_status()
    pdf = client.get(f'/api/cases/{case["id"]}/final-report/pdf', headers=headers)
    pdf.raise_for_status()
    if not pdf.content.startswith(b"%PDF"):
        raise RuntimeError("PDF endpoint did not return a PDF document")

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_bytes(pdf.content)
    print(
        {
            "case": case["firNumber"],
            "status": report["status"],
            "version": report["versionNumber"],
            "historyEntries": len(history.json().get("versions") or []),
            "pdfBytes": len(pdf.content),
            "output": str(OUTPUT),
        }
    )


if __name__ == "__main__":
    main()
