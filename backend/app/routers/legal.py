from __future__ import annotations



from fastapi import APIRouter, Depends, HTTPException, Query



from app.deps import get_current_user

from app.services import legal_sections

from app.services.case_access import jurisdiction_filter_sql

from app.services.db import fetch_one



router = APIRouter(prefix="/api/legal", tags=["legal"])





@router.get("/predict")

def predict(

    crimeType: str | None = Query(default=None),

    summary: str | None = Query(default=None),

    _current_user: dict = Depends(get_current_user),

) -> dict:

    """Section prediction for facts not yet saved as a case (live FIR intake)."""

    return legal_sections.predict_sections(crimeType, summary)





@router.get("/case/{case_id}")

def predict_for_case(case_id: str, current_user: dict = Depends(get_current_user)) -> dict:

    """Section prediction for a saved case, scoped to the officer's jurisdiction."""

    officer = current_user["officer"]

    scope_sql, scope_params = jurisdiction_filter_sql(officer, alias="c")



    case_row = fetch_one(

        f'''

        SELECT c.id, c."crimeType", c.summary

        FROM "Case" c

        WHERE c.id = %(caseId)s{scope_sql}

        ''',

        {"caseId": case_id, **scope_params},

    )

    if not case_row:

        raise HTTPException(status_code=404, detail="Case not found")



    return legal_sections.predict_sections(case_row["crimeType"], case_row.get("summary"))

