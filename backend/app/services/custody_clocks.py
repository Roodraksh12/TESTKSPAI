"""Storage helpers for per-accused BNSS section 187(3) remand clocks.

This module deliberately keeps the new table off the general case read path.
That means an environment that has not yet applied migration 0009 continues to
serve every existing case feature, while the custody-clock UI can give a clear
setup message instead of turning a case dossier into a 500 response.
"""

from __future__ import annotations

from collections import defaultdict
from typing import Any

from psycopg.errors import UndefinedTable

from app.services.db import fetch_all


def _select_clocks(where_sql: str, params: dict[str, Any]) -> list[dict[str, Any]]:
    return fetch_all(
        f'''
        SELECT
            cc.id,
            cc."caseId",
            cc."casePersonId",
            cc."firstRemandAt",
            cc."windowDays",
            cc."thresholdBasis",
            cc."legalSectionDetails",
            cc."remandOrderReference",
            cc.notes,
            cc."reportFiledAt",
            cc."reportReference",
            cc."createdAt",
            cc."updatedAt",
            cp."personId",
            p.name AS "personName"
        FROM "CaseCustodyClock" cc
        JOIN "CasePerson" cp ON cp.id = cc."casePersonId"
        JOIN "Person" p ON p.id = cp."personId"
        WHERE {where_sql}
        ORDER BY cc."firstRemandAt" ASC, cc.id ASC
        ''',
        params,
    )


def list_case_clocks(case_id: str) -> tuple[list[dict[str, Any]], bool]:
    """Return clocks and whether migration 0009 is available."""
    try:
        return _select_clocks('cc."caseId" = %(caseId)s', {"caseId": case_id}), True
    except UndefinedTable:
        return [], False


def clocks_by_case(case_ids: list[str]) -> tuple[dict[str, list[dict[str, Any]]], bool]:
    """Load clocks in one query for the deadline board without breaking old DBs."""
    if not case_ids:
        return {}, True
    try:
        rows = _select_clocks('cc."caseId" = ANY(%(caseIds)s)', {"caseIds": case_ids})
    except UndefinedTable:
        return {}, False

    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        grouped[row["caseId"]].append(row)
    return dict(grouped), True
