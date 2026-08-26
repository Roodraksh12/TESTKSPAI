from __future__ import annotations



from fastapi import APIRouter, Depends, HTTPException, Query



from app.deps import get_current_user

from app.services import legal_sections

from app.services.db import fetch_one
from app.services.openrouter import chat_completion
from app.services.case_access import jurisdiction_filter_sql
from app.services.ai_privacy import PrivacyContext
import json



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

@router.get("/bns/{section}")
async def get_bns_details(
    section: str, 
    case_id: str | None = Query(default=None),
    current_user: dict = Depends(get_current_user)
) -> dict:
    """Fetch BNS section details and dynamic AI relevance if case_id is provided."""
    # Strip any "BNS " prefix
    section_num = section.replace("BNS", "").strip()
    
    # Find section in SECTIONS
    sec_data = None
    for s in legal_sections.SECTIONS:
        if s.bns == section_num:
            sec_data = s
            break
            
    if not sec_data:
        raise HTTPException(status_code=404, detail="BNS Section not found in legal definitions")

    result = {
        "section": f"BNS {sec_data.bns}",
        "title": sec_data.title,
        "punishment": sec_data.punishment,
        "cognizable": sec_data.cognizable,
        "bailable": sec_data.bailable,
        "relevance": None,
        "actionPlan": None
    }

    if case_id:
        officer = current_user["officer"]
        scope_sql, scope_params = jurisdiction_filter_sql(officer, alias="c")
        case_row = fetch_one(
            f'''
            SELECT c.id, c."firNumber", c."crimeType", c.summary
            FROM "Case" c
            WHERE c.id = %(caseId)s{scope_sql}
            ''',
            {"caseId": case_id, **scope_params},
        )
        if case_row:
            prompt = (
                f"You are an AI assistant for the Karnataka State Police. Analyze why BNS Section {sec_data.bns} ({sec_data.title}) "
                f"is relevant to the following case and provide a short investigation action plan.\n\n"
                f"Case FIR: {case_row['firNumber']}\nCrime Type: {case_row['crimeType']}\nSummary: {case_row.get('summary', 'No summary')}\n\n"
                f"Respond in JSON format with two keys: 'relevance' (a 2-3 sentence explanation) and 'actionPlan' (a short list of 3-4 bullet points)."
            )
            try:
                ai_response = await chat_completion(
                    [{"role": "user", "content": prompt}],
                    privacy_context=PrivacyContext(
                        purpose="LEGAL_RELEVANCE_EXPLANATION",
                        officer_id=officer["id"],
                        case_ids=(case_id,),
                        known_sensitive_values={
                            "CASE_REFERENCE": [case_row["id"], case_row["firNumber"]],
                        },
                    ),
                )
                
                # Try to parse JSON from ai_response
                import re
                json_match = re.search(r'\{.*\}', ai_response, re.DOTALL)
                if json_match:
                    ai_data = json.loads(json_match.group(0))
                    result["relevance"] = ai_data.get("relevance")
                    result["actionPlan"] = ai_data.get("actionPlan")
            except Exception as e:
                # Fallback if AI fails
                pass

    return result
