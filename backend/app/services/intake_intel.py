from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from typing import Any

from app.services.db import execute, execute_returning, fetch_all, fetch_one, fetch_scalar, new_id

STOPWORDS = {
    "the", "and", "for", "with", "from", "that", "this", "were", "was", "are",
    "been", "have", "has", "had", "not", "but", "they", "them", "their", "into",
    "near", "after", "before", "about", "over", "under", "while", "when", "who",
    "whom", "which", "said", "also", "than", "then", "onto", "upon", "case",
    "accused", "victim", "police", "station", "report", "fir",
}

LEGAL_BY_CRIME: dict[str, dict[str, Any]] = {
    "theft": {
        "sections": [
            "IPC 379 / BNS 303 (Theft)",
            "IPC 411 / BNS 317 (Dishonestly receiving stolen property — if recovery)",
        ],
        "evidenceNeeded": [
            "Ownership proof of property",
            "Scene mahazar / seizure memo if recovered",
            "CCTV or eyewitness 161 statement",
        ],
        "notes": "If force or fear was used, reclassify toward robbery.",
    },
    "vehicle theft": {
        "sections": ["IPC 379 / BNS 303 (Theft)", "IPC 411 (if vehicle recovered from third party)"],
        "evidenceNeeded": [
            "RC book / ownership docs",
            "Parking entry logs",
            "CCTV of exit path",
            "Lookout circular if interstate",
        ],
        "notes": "Check RTO stolen vehicle module and nearby scrap yards.",
    },
    "chain snatching": {
        "sections": [
            "IPC 392 / BNS 309 (Robbery — if force/snatch with fear)",
            "IPC 379 / BNS 303 (if pure theft without force)",
        ],
        "evidenceNeeded": [
            "Victim 161 statement",
            "Injury note if any",
            "CCTV corridor",
            "Description of two-wheeler / plate",
        ],
        "notes": "Most snatchings on bike are framed as robbery when force/sudden snatch is clear.",
    },
    "robbery": {
        "sections": ["IPC 392 / BNS 309 (Robbery)", "IPC 397 if deadly weapon"],
        "evidenceNeeded": [
            "Weapon description",
            "Medical if injury",
            "Scene sketch",
            "CDR of accused if known",
        ],
        "notes": "Document use of force carefully for section selection.",
    },
    "burglary": {
        "sections": ["IPC 454 / 380 house-breaking / theft in dwelling", "BNS equivalents for house-breaking"],
        "evidenceNeeded": [
            "Point of entry photos",
            "Tool marks",
            "Inventory of missing items",
            "Neighbour canvass",
        ],
        "notes": "Link to prior grill-cut / balcony MO clusters if present.",
    },
    "assault": {
        "sections": [
            "IPC 323 / 324 / 325 depending on injury",
            "IPC 506 if criminal intimidation",
        ],
        "evidenceNeeded": ["Medical certificate", "Weapon if any", "Independent witnesses"],
        "notes": "Injury gravity drives the section — attach ML certificate early.",
    },
    "fraud": {
        "sections": ["IPC 420 / BNS 318 (Cheating)", "IT Act sections if cyber element"],
        "evidenceNeeded": [
            "Bank statements",
            "Account KYC trail",
            "Screenshots / emails",
            "CDR if phone fraud",
        ],
        "notes": "Freeze beneficiary accounts via bank liaison ASAP.",
    },
    "economic offence": {
        "sections": [
            "IPC 420 / 406 / 409 as applicable",
            "Prevention of Corruption Act if public servant",
        ],
        "evidenceNeeded": ["Documentary chain", "Forensic audit trail", "Beneficiary mapping"],
        "notes": "Preserve original instruments; avoid overwriting digital evidence.",
    },
    "missing": {
        "sections": [
            "Missing person procedure (not always IPC initially)",
            "IPC 363 if kidnapping suspected",
        ],
        "evidenceNeeded": [
            "Last-seen statement",
            "Phone tower / CDR",
            "CCTV at exit points",
            "Photograph circulation",
        ],
        "notes": "Golden hour: towers, buses, hospitals, shelter homes.",
    },
}

CHECKLIST_BY_CRIME: dict[str, list[dict[str, Any]]] = {
    "theft": [
        {"id": "TH01", "priority": 1, "window": "0-6h", "action": "Secure and export nearby CCTV (incident ±2h)", "rationale": "Footage often overwrites within 24–72h."},
        {"id": "TH02", "priority": 2, "window": "0-6h", "action": "Record victim/complainant 161 with property identifiers", "rationale": "Serial numbers / unique marks enable recovery matching."},
        {"id": "TH03", "priority": 3, "window": "6-24h", "action": "Canvass beat informants and known receivers of stolen goods", "rationale": "Quick recovery windows close fast for portable property."},
        {"id": "TH04", "priority": 4, "window": "24-72h", "action": "Check prior thefts with same MO in station + neighbouring PS", "rationale": "Serial offenders reuse method and routes."},
    ],
    "vehicle theft": [
        {"id": "VT01", "priority": 1, "window": "0-6h", "action": "Pull parking / gate logs and exit CCTV", "rationale": "Exit path is highest-yield evidence for vehicle theft."},
        {"id": "VT02", "priority": 2, "window": "0-6h", "action": "Issue lookout with vehicle make, colour, plate (full/partial)", "rationale": "Inter-jurisdiction recovery depends on early circulation."},
        {"id": "VT03", "priority": 3, "window": "6-24h", "action": "Check scrap yards / known chop-shop locations in zone", "rationale": "Vehicles are often stripped within 48h."},
        {"id": "VT04", "priority": 4, "window": "24-72h", "action": "RTO stolen vehicle flag + insurance intimation trail", "rationale": "Creates official paper trail and recovery network."},
    ],
    "chain snatching": [
        {"id": "CS01", "priority": 1, "window": "0-6h", "action": "Map approach/escape roads and pull corridor CCTV", "rationale": "Two-wheeler snatch uses fixed escape arterials."},
        {"id": "CS02", "priority": 2, "window": "0-6h", "action": "Record detailed suspect + vehicle descriptors from victim", "rationale": "Partial plate + bike colour drives MO cluster match."},
        {"id": "CS03", "priority": 3, "window": "6-24h", "action": "Cross-check recent snatchings within 5 km / 30 days", "rationale": "Often same pair of riders, different victims."},
        {"id": "CS04", "priority": 4, "window": "24-72h", "action": "Night patrol briefing on identified corridor", "rationale": "Deterrence + chance interception while pattern is hot."},
    ],
    "burglary": [
        {"id": "BG01", "priority": 1, "window": "0-6h", "action": "Photograph point of entry and tool marks before cleanup", "rationale": "MO signature lives in entry method."},
        {"id": "BG02", "priority": 2, "window": "0-6h", "action": "Neighbour canvass for unusual visitors / vehicles", "rationale": "Pre-surveillance often noted by neighbours."},
        {"id": "BG03", "priority": 3, "window": "6-24h", "action": "Fingerprint / forensic if viable surfaces", "rationale": "Indoor scenes can still yield lifts."},
        {"id": "BG04", "priority": 4, "window": "24-72h", "action": "Match inventory to pawn / second-hand markets", "rationale": "Jewellery and electronics surface locally."},
    ],
    "default": [
        {"id": "GN01", "priority": 1, "window": "0-6h", "action": "Preserve perishable evidence (CCTV, CDR window, injuries)", "rationale": "Time-sensitive sources expire first."},
        {"id": "GN02", "priority": 2, "window": "0-6h", "action": "Complete 161 of primary witnesses while memory is fresh", "rationale": "Early statements reduce contamination."},
        {"id": "GN03", "priority": 3, "window": "6-24h", "action": "Verify identity matches and prior cases suggested by system", "rationale": "Human confirmation required before treating as linked."},
        {"id": "GN04", "priority": 4, "window": "24-72h", "action": "Draft progress note for SHO with open tasks", "rationale": "Keeps supervision and handover clean."},
    ],
}


def tokenize(text: str) -> set[str]:
    cleaned = re.sub(r"[^a-z0-9\s]", " ", (text or "").lower())
    return {t for t in cleaned.split() if len(t) > 2 and t not in STOPWORDS}


def jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    inter = len(a & b)
    union = len(a | b)
    return inter / union if union else 0.0


def name_similarity(a: str, b: str) -> float:
    na = a.strip().lower()
    nb = b.strip().lower()
    if not na or not nb:
        return 0.0
    if na == nb:
        return 1.0
    if na in nb or nb in na:
        return 0.85
    return jaccard(set(na.split()), set(nb.split()))


def suggest_legal_sections(crime_type: str, summary: str | None = None) -> dict[str, Any]:
    key = (crime_type or "").lower()
    for k, value in LEGAL_BY_CRIME.items():
        if k in key or key in k:
            return value
    blob = f"{crime_type} {summary or ''}".lower()
    if "snatch" in blob or "chain" in blob:
        return LEGAL_BY_CRIME["chain snatching"]
    if any(w in blob for w in ("vehicle", "bike", "activa", "car")):
        return LEGAL_BY_CRIME["vehicle theft"]
    if any(w in blob for w in ("house", "burgl", "break")):
        return LEGAL_BY_CRIME["burglary"]
    if "rob" in blob:
        return LEGAL_BY_CRIME["robbery"]
    if any(w in blob for w in ("cheat", "fraud", "cheque")):
        return LEGAL_BY_CRIME["fraud"]
    return {
        "sections": ["Review facts with court section clerk — generic IPC not auto-assigned"],
        "evidenceNeeded": [
            "Secure scene",
            "Record 161 statements",
            "Preserve CCTV within retention window",
        ],
        "notes": "Crime type did not match a known template; officer must select sections.",
    }


def get_investigation_checklist(crime_type: str, location_hint: str | None = None) -> list[dict[str, Any]]:
    key = (crime_type or "").lower()
    items: list[dict[str, Any]] | None = None
    for k, value in CHECKLIST_BY_CRIME.items():
        if k == "default":
            continue
        if k in key or key in k:
            items = [dict(x) for x in value]
            break
    if items is None:
        if "snatch" in key or "chain" in key:
            items = [dict(x) for x in CHECKLIST_BY_CRIME["chain snatching"]]
        elif any(w in key for w in ("vehicle", "bike", "car")):
            items = [dict(x) for x in CHECKLIST_BY_CRIME["vehicle theft"]]
        elif "burgl" in key or "house" in key:
            items = [dict(x) for x in CHECKLIST_BY_CRIME["burglary"]]
        elif "theft" in key:
            items = [dict(x) for x in CHECKLIST_BY_CRIME["theft"]]
        else:
            items = [dict(x) for x in CHECKLIST_BY_CRIME["default"]]

    if location_hint and location_hint.strip():
        return [
            {
                "id": "LOC1",
                "priority": 0,
                "window": "0-6h",
                "action": f"Lock scene geometry around: {location_hint.strip()}",
                "rationale": "Location from FIR drives CCTV and beat tasking.",
            },
            *[{**item, "priority": item["priority"] + 1} for item in items],
        ]
    return items


def extract_mo_from_text(text: str | None) -> str | None:
    if not text:
        return None
    for pattern in (r"\[MO\]\s*([^\n]+)", r"\[MODUS OPERANDI\]\s*([^\n]+)"):
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(1).strip()
    return None


def pack_summary_with_mo(narrative: str, mo: str | None = None) -> str:
    base = (narrative or "").strip()
    if not mo or not mo.strip():
        return base
    if "[MO]" in base:
        return base
    return f"{base}\n\n[MO] {mo.strip()}"


def _load_persons_with_cases() -> list[dict[str, Any]]:
    persons = fetch_all('SELECT * FROM "Person"')
    case_persons = fetch_all(
        '''
        SELECT cp.*, c.id AS "caseIdRef", c."firNumber", c."stationId", c.status AS "caseStatus"
        FROM "CasePerson" cp
        JOIN "Case" c ON cp."caseId" = c.id
        '''
    )
    by_person: dict[str, list[dict[str, Any]]] = {}
    for cp in case_persons:
        by_person.setdefault(cp["personId"], []).append(cp)
    for person in persons:
        person["casePersons"] = by_person.get(person["id"], [])
    return persons


def find_identity_matches(
    *,
    names: list[str],
    phones: list[str] | None = None,
    addresses: list[str] | None = None,
    exclude_case_id: str | None = None,
    station_id: str | None = None,
) -> list[dict[str, Any]]:
    persons = _load_persons_with_cases()
    results: list[dict[str, Any]] = []
    phone_digits = [re.sub(r"\D", "", p) for p in (phones or []) if p]
    address_list = [a.lower().strip() for a in (addresses or []) if a]

    for person in persons:
        best_score = 0
        reasons: list[str] = []

        for name in names:
            sim = name_similarity(name, person["name"])
            if sim >= 0.55:
                best_score = max(best_score, round(sim * 100))
                reasons.append(
                    f'Name similarity {round(sim * 100)}% ("{name}" ↔ "{person["name"]}")'
                )

        person_phone = person.get("phone")
        if person_phone:
            p_digits = re.sub(r"\D", "", person_phone)
            for ph in phone_digits:
                if ph and p_digits and (
                    ph == p_digits
                    or ph.endswith(p_digits[-8:])
                    or p_digits.endswith(ph[-8:])
                ):
                    best_score = max(best_score, 95)
                    reasons.append(f"Same phone pattern: {person_phone}")

        person_address = person.get("address")
        if person_address:
            pa = person_address.lower()
            for addr in address_list:
                sim = jaccard(tokenize(addr), tokenize(pa))
                if sim >= 0.4:
                    best_score = max(best_score, round(70 + sim * 25))
                    reasons.append(f'Address overlap with "{person_address}"')

        if best_score < 55 or not reasons:
            continue

        prior_cases = [
            {
                "id": cp["caseIdRef"],
                "firNumber": cp["firNumber"],
                "stationId": cp["stationId"],
                "status": cp["caseStatus"],
            }
            for cp in person.get("casePersons", [])
            if cp["caseIdRef"] != exclude_case_id
        ]
        if station_id:
            prior_cases.sort(key=lambda c: 0 if c["stationId"] == station_id else 1)

        results.append(
            {
                "personId": person["id"],
                "name": person["name"],
                "role": person["role"],
                "phone": person.get("phone"),
                "address": person.get("address"),
                "confidenceScore": min(99, best_score),
                "reason": "; ".join(reasons),
                "priorCaseIds": [c["id"] for c in prior_cases],
                "priorFirNumbers": [c["firNumber"] for c in prior_cases],
            }
        )

    results.sort(key=lambda x: x["confidenceScore"], reverse=True)
    return results[:8]


def find_mo_similar_cases(
    *,
    case_id: str | None = None,
    station_id: str,
    crime_type: str | None = None,
    summary: str | None = None,
    modus_operandi: str | None = None,
    take: int = 5,
) -> list[dict[str, Any]]:
    exclude_id = case_id
    if case_id:
        full = fetch_one('SELECT * FROM "Case" WHERE id = %(id)s', {"id": case_id})
        if not full:
            return []
        crime_type = crime_type or full["crimeType"]
        summary = summary or full.get("summary")
        modus_operandi = modus_operandi or extract_mo_from_text(full.get("summary")) or extract_mo_from_text(
            full.get("rawExtractedText")
        )
        exclude_id = full["id"]

    probe_text = " ".join(x for x in [modus_operandi, summary, crime_type] if x)
    probe_tokens = tokenize(probe_text)

    candidates = fetch_all(
        '''
        SELECT id, "firNumber", "crimeType", status, summary, "rawExtractedText", "incidentDate"
        FROM "Case"
        WHERE "stationId" = %(stationId)s
          AND (%(excludeId)s::text IS NULL OR id <> %(excludeId)s)
        ORDER BY "reportedDate" DESC
        LIMIT 50
        ''',
        {"stationId": station_id, "excludeId": exclude_id},
    )

    scored: list[dict[str, Any]] = []
    for candidate in candidates:
        cand_mo = extract_mo_from_text(candidate.get("summary")) or extract_mo_from_text(
            candidate.get("rawExtractedText")
        ) or ""
        cand_text = " ".join(x for x in [cand_mo, candidate.get("summary"), candidate["crimeType"]] if x)
        sim = jaccard(probe_tokens, tokenize(cand_text))
        same_crime = (
            0.15
            if crime_type and candidate["crimeType"].lower() == crime_type.lower()
            else 0.0
        )
        score = min(0.99, sim + same_crime)
        if score < 0.18 and not same_crime:
            continue
        if score < 0.12:
            continue

        reasons: list[str] = []
        if same_crime:
            reasons.append(f"Same crime type: {candidate['crimeType']}")
        if sim >= 0.18:
            reasons.append(f"Narrative/MO token overlap {round(sim * 100)}%")
        if cand_mo:
            reasons.append("Prior case has MO signature in record")

        scored.append(
            {
                "caseId": candidate["id"],
                "firNumber": candidate["firNumber"],
                "crimeType": candidate["crimeType"],
                "status": candidate["status"],
                "summary": candidate.get("summary"),
                "incidentDate": candidate["incidentDate"],
                "similarityScore": round(score * 100),
                "reason": "; ".join(reasons) or "Partial similarity",
            }
        )

    scored.sort(key=lambda x: x["similarityScore"], reverse=True)
    return scored[:take]


def persist_intake_matches(
    *,
    case_id: str,
    station_id: str,
    accused_names: list[str],
    victim_name: str | None = None,
    phones: list[str] | None = None,
    addresses: list[str] | None = None,
    crime_type: str,
    summary: str | None = None,
    modus_operandi: str | None = None,
) -> dict[str, Any]:
    names = [
        *accused_names,
        *( [victim_name] if victim_name and victim_name != "null" else [] ),
    ]
    names = [n for n in names if n]

    identity = find_identity_matches(
        names=names,
        phones=phones,
        addresses=addresses,
        exclude_case_id=case_id,
        station_id=station_id,
    )
    mo_similar = find_mo_similar_cases(
        case_id=case_id,
        station_id=station_id,
        crime_type=crime_type,
        summary=summary,
        modus_operandi=modus_operandi,
        take=5,
    )

    for match in identity:
        exists = fetch_one(
            '''
            SELECT id FROM "CaseMatch"
            WHERE "caseId" = %(caseId)s
              AND "matchedPersonId" = %(personId)s
              AND status IN ('PENDING', 'CONFIRMED')
            LIMIT 1
            ''',
            {"caseId": case_id, "personId": match["personId"]},
        )
        if exists:
            continue
        prior_firs = ", ".join(match["priorFirNumbers"][:3])
        reason = f'IDENTITY: {match["reason"]}'
        if prior_firs:
            reason += f" | Prior FIR: {prior_firs}"
        execute(
            '''
            INSERT INTO "CaseMatch" (id, "caseId", "matchedPersonId", "matchedCaseId", "confidenceScore", status, reason)
            VALUES (%(id)s, %(caseId)s, %(personId)s, %(matchedCaseId)s, %(score)s, 'PENDING', %(reason)s)
            ''',
            {
                "id": new_id(),
                "caseId": case_id,
                "personId": match["personId"],
                "matchedCaseId": match["priorCaseIds"][0] if match["priorCaseIds"] else None,
                "score": match["confidenceScore"],
                "reason": reason,
            },
        )

    for match in mo_similar:
        exists = fetch_one(
            '''
            SELECT id FROM "CaseMatch"
            WHERE "caseId" = %(caseId)s
              AND "matchedCaseId" = %(matchedCaseId)s
              AND status IN ('PENDING', 'CONFIRMED')
            LIMIT 1
            ''',
            {"caseId": case_id, "matchedCaseId": match["caseId"]},
        )
        if exists:
            continue
        execute(
            '''
            INSERT INTO "CaseMatch" (id, "caseId", "matchedCaseId", "confidenceScore", status, reason)
            VALUES (%(id)s, %(caseId)s, %(matchedCaseId)s, %(score)s, 'PENDING', %(reason)s)
            ''',
            {
                "id": new_id(),
                "caseId": case_id,
                "matchedCaseId": match["caseId"],
                "score": match["similarityScore"],
                "reason": f'MO_SIMILAR: {match["reason"]}',
            },
        )

    return {"identity": identity, "moSimilar": mo_similar}


def _format_intake_markdown(payload: dict[str, Any]) -> str:
    persons = payload["persons"]
    person_lines = (
        "\n".join(f'- **{x["role"]}:** {x["name"]}' for x in persons)
        if persons
        else "- No persons linked yet"
    )

    identity = payload["identity"]
    id_lines = (
        "\n".join(
            f'- **{m["name"]}** ({m["confidenceScore"]}% — lead, needs officer confirm)\n'
            f'  - {m["reason"]}\n'
            f'  - Prior FIR: {", ".join(m["priorFirNumbers"][:3]) or "none on file"}'
            for m in identity[:5]
        )
        if identity
        else "- No strong identity matches in database"
    )

    mo_similar = payload["moSimilar"]
    mo_lines = (
        "\n".join(
            f'- **{m["firNumber"]}** ({m["similarityScore"]}%) — {m["crimeType"]}, {m["status"]}\n'
            f'  - {m["reason"]}\n'
            f'  - {(m.get("summary") or "")[:120]}'
            for m in mo_similar[:5]
        )
        if mo_similar
        else "- No strong MO-similar cases at this station"
    )

    legal = payload["legal"]
    legal_lines = "\n".join(f"- {s}" for s in legal["sections"])
    evidence_lines = "\n".join(f"- {e}" for e in legal["evidenceNeeded"])

    checklist = payload["checklist"]
    next_24 = "\n".join(
        f'{i + 1}. **[{c["window"]}]** {c["action"]} — _{c["rationale"]}_'
        for i, c in enumerate([x for x in checklist if x["window"] in ("0-6h", "6-24h")][:5])
    )

    related_alerts = payload["relatedAlerts"]
    if payload["elevated"]:
        risk_line = (
            f'**Elevated.** {payload["sameCrimeRecentCount"]} other **{payload["crimeType"]}** case(s) in last 14 days at station.'
        )
        if related_alerts:
            risk_line += f' Related alert: {related_alerts[0]["zoneLabel"]} (risk {related_alerts[0]["riskScore"]}).'
    else:
        risk_line = (
            f'No elevated hotspot signal for this crime type in the last 14 days ({payload["sameCrimeRecentCount"]} peers).'
        )

    return f"""## Intake complete — {payload["firNumber"]}

**Station:** {payload["stationName"]} · **Type:** {payload["crimeType"]} · **Status:** {payload["status"]}

### Extracted facts
{payload.get("summary") or "_No summary_"}

**Persons**
{person_lines}

### Identity / prior-record leads
_All matches are leads only — confirm or reject before treating as linked._
{id_lines}

### MO-similar cases (this station)
{mo_lines}

### Suggested legal framing
{legal_lines}

**Evidence still needed**
{evidence_lines}

_{legal["notes"]}_

### Next 24h actions
{next_24}

### Risk / hotspot context
{risk_line}

---
I can: review matches · open similar cases · full 72h checklist · draft SP note · explain legal sections.  
**Nothing is filed until you confirm.**"""


def build_case_intake_brief(
    case_id: str,
    station_id: str,
    *,
    is_sp: bool = False,
) -> dict[str, Any]:
    case_data = fetch_one(
        '''
        SELECT c.*, ps.name AS "stationName"
        FROM "Case" c
        LEFT JOIN "PoliceStation" ps ON c."stationId" = ps.id
        WHERE c.id = %(id)s
        ''',
        {"id": case_id},
    )
    if not case_data:
        return {"error": "Case not found"}
    if not is_sp and case_data["stationId"] != station_id:
        return {"error": "Case not found or access denied"}

    case_persons = fetch_all(
        '''
        SELECT cp.*, p.id AS "personIdRef", p.name, p.role AS "personRole", p.phone, p.address
        FROM "CasePerson" cp
        JOIN "Person" p ON cp."personId" = p.id
        WHERE cp."caseId" = %(caseId)s
        ''',
        {"caseId": case_id},
    )

    effective_station = case_data["stationId"]
    accused_names = [cp["name"] for cp in case_persons if cp["role"] == "ACCUSED"]
    victim = next((cp for cp in case_persons if cp["role"] == "VICTIM"), None)
    mo = extract_mo_from_text(case_data.get("summary")) or extract_mo_from_text(
        case_data.get("rawExtractedText")
    )

    match_result = persist_intake_matches(
        case_id=case_data["id"],
        station_id=effective_station,
        accused_names=accused_names,
        victim_name=victim["name"] if victim else None,
        phones=[cp["phone"] for cp in case_persons if cp.get("phone")],
        addresses=[cp["address"] for cp in case_persons if cp.get("address")],
        crime_type=case_data["crimeType"],
        summary=case_data.get("summary"),
        modus_operandi=mo,
    )
    identity = match_result["identity"]
    mo_similar = match_result["moSimilar"]

    legal = suggest_legal_sections(case_data["crimeType"], case_data.get("summary"))
    checklist = get_investigation_checklist(case_data["crimeType"], case_data.get("stationName"))

    since = datetime.now(timezone.utc) - timedelta(days=14)
    same_crime_recent_count = fetch_scalar(
        '''
        SELECT COUNT(*) FROM "Case"
        WHERE "stationId" = %(stationId)s
          AND LOWER("crimeType") = LOWER(%(crimeType)s)
          AND "reportedDate" >= %(since)s
          AND id <> %(caseId)s
        ''',
        {
            "stationId": effective_station,
            "crimeType": case_data["crimeType"],
            "since": since,
            "caseId": case_data["id"],
        },
    ) or 0

    alerts = fetch_all(
        '''
        SELECT * FROM "Alert"
        WHERE "stationId" = %(stationId)s
        ORDER BY "riskScore" DESC
        LIMIT 5
        ''',
        {"stationId": effective_station},
    )

    crime_token = case_data["crimeType"].lower().split(" ")[0]
    related_alerts = [
        a
        for a in alerts
        if crime_token in f'{a["zoneLabel"]} {a["reason"]}'.lower() or a["riskScore"] >= 70
    ]
    elevated = same_crime_recent_count >= 2 or any(a["riskScore"] >= 70 for a in related_alerts)

    persons = [
        {"name": cp["name"], "role": cp["role"], "phone": cp.get("phone")}
        for cp in case_persons
    ]
    action_prompts = [
        "Review identity matches and tell me which to confirm",
        "Show MO-similar cases for this FIR",
        "Give me the 24–72h investigation checklist",
        "Draft a short SP/SHO progress note for this case",
        "Which legal sections fit these facts?",
    ]

    markdown = _format_intake_markdown(
        {
            "firNumber": case_data["firNumber"],
            "crimeType": case_data["crimeType"],
            "status": case_data["status"],
            "stationName": case_data.get("stationName") or "Station",
            "summary": case_data.get("summary"),
            "persons": persons,
            "identity": identity,
            "moSimilar": mo_similar,
            "legal": legal,
            "checklist": checklist,
            "elevated": elevated,
            "sameCrimeRecentCount": same_crime_recent_count,
            "relatedAlerts": related_alerts,
            "crimeType": case_data["crimeType"],
        }
    )

    return {
        "caseId": case_data["id"],
        "firNumber": case_data["firNumber"],
        "crimeType": case_data["crimeType"],
        "status": case_data["status"],
        "summary": case_data.get("summary"),
        "persons": persons,
        "identityMatches": identity,
        "moSimilar": mo_similar,
        "legal": legal,
        "checklist": checklist,
        "hotspotContext": {
            "elevated": elevated,
            "relatedAlerts": [
                {
                    "zoneLabel": a["zoneLabel"],
                    "riskScore": a["riskScore"],
                    "reason": a["reason"],
                    "type": a["type"],
                }
                for a in related_alerts
            ],
            "sameCrimeRecentCount": same_crime_recent_count,
        },
        "markdown": markdown,
        "actionPrompts": action_prompts,
    }


def draft_case_summary(
    case_id: str,
    station_id: str,
    *,
    is_sp: bool = False,
    audience: str = "SP",
) -> dict[str, Any]:
    case_data = fetch_one(
        '''
        SELECT c.*, ps.name AS "stationName"
        FROM "Case" c
        LEFT JOIN "PoliceStation" ps ON c."stationId" = ps.id
        WHERE c.id = %(id)s
        ''',
        {"id": case_id},
    )
    if not case_data:
        return {"error": "Case not found"}
    if not is_sp and case_data["stationId"] != station_id:
        return {"error": "Access denied"}

    case_persons = fetch_all(
        '''
        SELECT cp.*, p.name
        FROM "CasePerson" cp
        JOIN "Person" p ON cp."personId" = p.id
        WHERE cp."caseId" = %(caseId)s
        ''',
        {"caseId": case_id},
    )
    matches = fetch_all(
        '''
        SELECT cm.*, p.name AS "matchedPersonName", mc."firNumber" AS "matchedFirNumber"
        FROM "CaseMatch" cm
        LEFT JOIN "Person" p ON cm."matchedPersonId" = p.id
        LEFT JOIN "Case" mc ON cm."matchedCaseId" = mc.id
        WHERE cm."caseId" = %(caseId)s AND cm.status IN ('PENDING', 'CONFIRMED')
        ''',
        {"caseId": case_id},
    )

    people = "; ".join(f'{cp["name"]} ({cp["role"]})' for cp in case_persons)
    pending_matches = [m for m in matches if m["status"] == "PENDING"]
    confirmed_matches = [m for m in matches if m["status"] == "CONFIRMED"]
    checklist = get_investigation_checklist(case_data["crimeType"], case_data.get("stationName"))
    top_steps = [c["action"] for c in checklist[:3]]

    confirmed_line = (
        "Confirmed links: "
        + "; ".join(
            m.get("matchedPersonName") or m.get("matchedFirNumber") or m.get("reason", "")
            for m in confirmed_matches
        )
        if confirmed_matches
        else "No confirmed cross-case links yet."
    )
    pending_line = (
        f"Pending system leads ({len(pending_matches)}): officer verification required — not asserted as fact."
        if pending_matches
        else "No pending system leads."
    )

    draft = "\n".join(
        [
            f"PROGRESS NOTE — for {audience}",
            f"FIR: {case_data['firNumber']}",
            f"PS: {case_data.get('stationName') or '—'}",
            f"Crime: {case_data['crimeType']} | Status: {case_data['status']}",
            f"Incident date: {case_data['incidentDate']}",
            "",
            "1. Facts (from case record only)",
            case_data.get("summary") or "No summary on record.",
            "",
            "2. Persons on record",
            people or "None linked.",
            "",
            "3. Linkage status",
            confirmed_line,
            pending_line,
            "",
            "4. Proposed next actions",
            *[f"   {i + 1}. {step}" for i, step in enumerate(top_steps)],
            "",
            "5. Request / remarks",
            (
                "Submitted for information / guidance. No arrest recommendation from system."
                if audience == "SP"
                else "For investigation diary. System outputs are assists only."
            ),
            "",
            "— Draft generated by SCRB Sahayak (officer must edit before filing) —",
        ]
    )
    return {"draft": draft}


def update_match_status(
    match_id: str,
    status: str,
    officer_id: str,
    station_id: str,
    is_sp: bool = False,
) -> dict[str, Any]:
    match = fetch_one(
        '''
        SELECT cm.*, c."stationId" AS "caseStationId"
        FROM "CaseMatch" cm
        JOIN "Case" c ON cm."caseId" = c.id
        WHERE cm.id = %(id)s
        ''',
        {"id": match_id},
    )
    if not match:
        return {"error": "Match not found"}
    if not is_sp and match["caseStationId"] != station_id:
        return {"error": "Access denied"}

    updated = execute_returning(
        '''
        UPDATE "CaseMatch"
        SET status = %(status)s
        WHERE id = %(id)s
        RETURNING *
        ''',
        {"id": match_id, "status": status},
    )
    execute(
        '''
        INSERT INTO "AuditLog" (id, "officerId", action, "targetType", "targetId", details, "createdAt")
        VALUES (%(id)s, %(officerId)s, %(action)s, 'CASE_MATCH', %(targetId)s, %(details)s, NOW())
        ''',
        {
            "id": new_id(),
            "officerId": officer_id,
            "action": "CONFIRM_MATCH" if status == "CONFIRMED" else "REJECT_MATCH",
            "targetId": match_id,
            "details": f'Case {match["caseId"]} match set to {status}',
        },
    )
    return {"success": True, "match": updated}
