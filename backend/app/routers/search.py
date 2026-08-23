from fastapi import APIRouter, Depends, Query



from app.deps import get_current_user

from app.services.case_access import jurisdiction_filter_sql, person_in_scope_sql_for_officer

from app.services.db import fetch_all
from app.services import legal_sections

router = APIRouter(prefix="/api/search", tags=["search"])





@router.get("")

def search(

    q: str = Query(default=""),

    current_user: dict = Depends(get_current_user),

) -> dict:

    if not q.strip():
        return {"cases": [], "suspects": [], "bns_sections": []}



    words = [w for w in q.split() if w]

    if not words:
        return {"cases": [], "suspects": [], "bns_sections": []}



    officer = current_user["officer"]

    scope_sql, scope_params = jurisdiction_filter_sql(officer, alias="c")



    case_clauses = []

    case_params: dict = {**scope_params}

    for idx, word in enumerate(words):

        key = f"w{idx}"

        case_clauses.append(
            f'''(c."firNumber" ILIKE %({key})s 
                OR c.summary ILIKE %({key})s 
                OR c."crimeType" ILIKE %({key})s
                OR EXISTS (SELECT 1 FROM "CaseDiaryEntry" cde WHERE cde."caseId" = c.id AND cde.narrative ILIKE %({key})s)
                OR EXISTS (SELECT 1 FROM "Evidence" ev WHERE ev."caseId" = c.id AND ev.description ILIKE %({key})s)
                OR EXISTS (SELECT 1 FROM "Document" doc WHERE doc."caseId" = c.id AND doc.name ILIKE %({key})s)
            )'''
        )

        case_params[key] = f"%{word}%"

    case_where = " OR ".join(case_clauses)



    cases = fetch_all(

        f'''

        SELECT

            c.id, c."firNumber", c."stationId", c."crimeType", c.status,

            c."reportedDate", c.summary,

            ps.name AS "stationName"

        FROM "Case" c

        LEFT JOIN "PoliceStation" ps ON c."stationId" = ps.id

        WHERE ({case_where}){scope_sql}

        ORDER BY c."reportedDate" DESC

        LIMIT 8

        ''',

        case_params,

    )

    for case in cases:

        case["station"] = {"name": case.pop("stationName", None) or "Station"}

    scope_sql, scope_params = jurisdiction_filter_sql(officer, alias="c")

    suspect_clauses = []

    suspect_params: dict = {**scope_params}

    for idx, word in enumerate(words):

        key = f"s{idx}"

        suspect_clauses.append(f'(p.name ILIKE %({key})s OR p.phone ILIKE %({key})s)')

        suspect_params[key] = f"%{word}%"

    suspect_where = " OR ".join(suspect_clauses)

    suspects = fetch_all(
        f'''
        SELECT DISTINCT ON (p.id) p.*, cp."caseId"
        FROM "Person" p
        JOIN "CasePerson" cp ON p.id = cp."personId"
        JOIN "Case" c ON cp."caseId" = c.id
        WHERE ({suspect_where}){scope_sql}
        LIMIT 8
        ''',
        suspect_params,
    )

    # Search BNS Sections
    bns_sections = []
    lower_q = q.lower()
    for sec in legal_sections.SECTIONS:
        if (
            lower_q in sec.bns.lower()
            or lower_q in sec.title.lower()
            or any(lower_q in kw.lower() for kw in sec.keywords)
        ):
            bns_sections.append({
                "bns": sec.bns,
                "title": sec.title,
                "punishment": sec.punishment
            })
            if len(bns_sections) >= 5:
                break

    return {"cases": cases, "suspects": suspects, "bns_sections": bns_sections}

