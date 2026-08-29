from __future__ import annotations

import math
import re
from typing import Any

from app.services import graph_engine
from app.services.case_access import jurisdiction_filter_sql
from app.services.db import fetch_all

GRAPH_CASE_CAP = 60
KA_PLATE_RE = re.compile(r"\bKA[-\s]?\d{2}[-\s]?[A-Z]{1,2}[-\s]?\d{1,4}\b", re.IGNORECASE)

ROLE_LABEL = {"ACCUSED": "Accused", "VICTIM": "Victim", "WITNESS": "Witness"}

EMPTY_GRAPH: dict[str, Any] = {
    "nodes": [],
    "edges": [],
    "leads": [],
    "rings": [],
    "hubs": [],
    "brokers": [],
    "meta": {
        "caseCount": 0,
        "capped": False,
        "sharedEntityCount": 0,
        "verifiedLinkCount": 0,
        "pendingLeadCount": 0,
        "focused": False,
        "seedFound": None,
        "seedId": None,
    },
}

CASE_SELECT = '''
    SELECT c.id, c."firNumber", c."crimeType", c."incidentDate", c.summary,
           c."rawExtractedText", c."stationId", c."reportedDate",
           ps.name AS "stationName"
    FROM "Case" c
    LEFT JOIN "PoliceStation" ps ON c."stationId" = ps.id
'''


def _extract_plates(text: str) -> set[str]:
    if not text:
        return set()
    return {re.sub(r"[\s-]+", "-", m.upper()) for m in KA_PLATE_RE.findall(text)}


def _case_seed_id(seed_id: str | None) -> str | None:
    """Return a database case ID when the requested graph seed is a case."""
    if not seed_id:
        return None
    if ":" not in seed_id:
        return seed_id
    kind, value = seed_id.split(":", 1)
    return value if kind == "case" and value else None


def _load_recent_cases(
    scope_sql: str,
    scope_params: dict[str, Any],
) -> tuple[list[dict[str, Any]], bool]:
    fetched = fetch_all(
        f'''
        {CASE_SELECT}
        WHERE 1=1{scope_sql}
        ORDER BY c."reportedDate" DESC, c.id DESC
        LIMIT %(graphLimit)s
        ''',
        {**scope_params, "graphLimit": GRAPH_CASE_CAP + 1},
    )
    return fetched[:GRAPH_CASE_CAP], len(fetched) > GRAPH_CASE_CAP


def _load_seeded_cases(
    scope_sql: str,
    scope_params: dict[str, Any],
    seed_case_id: str,
    hops: int,
) -> tuple[list[dict[str, Any]], bool, bool]:
    """Load an accessible case first, then a bounded evidence-linked neighbourhood.

    A focused dossier request must never depend on the case being among the most
    recently reported records. Case expansion uses stored people, case-match
    records and explicit person-to-person connections; station context is added
    only after the relevant cases have been selected.
    """
    seed_rows = fetch_all(
        f'''
        {CASE_SELECT}
        WHERE c.id = %(seedCaseId)s{scope_sql}
        LIMIT 1
        ''',
        {"seedCaseId": seed_case_id, **scope_params},
    )
    if not seed_rows:
        return [], False, False

    cases = list(seed_rows)
    selected_ids = {seed_case_id}
    frontier_ids = [seed_case_id]
    capped = False

    # One case-expansion round corresponds to roughly two visual graph hops
    # (case -> shared entity -> case). Keep the work bounded for URL input.
    expansion_rounds = max(1, min(2, (max(hops, 1) + 1) // 2))
    for _ in range(expansion_rounds):
        remaining = GRAPH_CASE_CAP - len(cases)
        if remaining <= 0 or not frontier_ids:
            capped = True
            break

        neighbours = fetch_all(
            f'''
            {CASE_SELECT}
            WHERE 1=1{scope_sql}
              AND NOT (c.id = ANY(%(selectedCaseIds)s))
              AND (
                EXISTS (
                  SELECT 1
                  FROM "CasePerson" source_cp
                  JOIN "CasePerson" target_cp
                    ON target_cp."personId" = source_cp."personId"
                  WHERE source_cp."caseId" = ANY(%(frontierCaseIds)s)
                    AND target_cp."caseId" = c.id
                )
                OR EXISTS (
                  SELECT 1
                  FROM "CaseMatch" cm
                  WHERE cm.status != 'REJECTED'
                    AND (
                      (cm."caseId" = ANY(%(frontierCaseIds)s) AND cm."matchedCaseId" = c.id)
                      OR
                      (cm."matchedCaseId" = ANY(%(frontierCaseIds)s) AND cm."caseId" = c.id)
                    )
                )
                OR EXISTS (
                  SELECT 1
                  FROM "CaseMatch" cm
                  JOIN "CasePerson" target_cp
                    ON target_cp."personId" = cm."matchedPersonId"
                  WHERE cm.status != 'REJECTED'
                    AND cm."caseId" = ANY(%(frontierCaseIds)s)
                    AND target_cp."caseId" = c.id
                )
                OR EXISTS (
                  SELECT 1
                  FROM "CaseMatch" cm
                  JOIN "CasePerson" source_cp
                    ON source_cp."personId" = cm."matchedPersonId"
                  WHERE cm.status != 'REJECTED'
                    AND cm."caseId" = c.id
                    AND source_cp."caseId" = ANY(%(frontierCaseIds)s)
                )
                OR EXISTS (
                  SELECT 1
                  FROM "CasePerson" source_cp
                  JOIN "Connection" con
                    ON con."personAId" = source_cp."personId"
                    OR con."personBId" = source_cp."personId"
                  JOIN "CasePerson" target_cp
                    ON target_cp."personId" = CASE
                      WHEN con."personAId" = source_cp."personId" THEN con."personBId"
                      ELSE con."personAId"
                    END
                  WHERE source_cp."caseId" = ANY(%(frontierCaseIds)s)
                    AND target_cp."caseId" = c.id
                )
              )
            ORDER BY c."reportedDate" DESC, c.id DESC
            LIMIT %(neighbourLimit)s
            ''',
            {
                **scope_params,
                "frontierCaseIds": frontier_ids,
                "selectedCaseIds": list(selected_ids),
                "neighbourLimit": remaining + 1,
            },
        )
        if len(neighbours) > remaining:
            capped = True
            neighbours = neighbours[:remaining]
        if not neighbours:
            break

        frontier_ids = [row["id"] for row in neighbours]
        selected_ids.update(frontier_ids)
        cases.extend(neighbours)

    return cases, capped, True


def build_crime_network(
    officer: dict[str, Any], seed_id: str | None = None, hops: int = 2
) -> dict[str, Any]:
    scope_sql, scope_params = jurisdiction_filter_sql(officer, alias="c")
    seed_case_id = _case_seed_id(seed_id)
    seed_found: bool | None = None
    if seed_case_id:
        cases, capped, seed_found = _load_seeded_cases(
            scope_sql,
            scope_params,
            seed_case_id,
            hops,
        )
    else:
        cases, capped = _load_recent_cases(scope_sql, scope_params)

    if not cases:
        empty = {**EMPTY_GRAPH, "meta": dict(EMPTY_GRAPH["meta"])}
        empty["meta"].update(
            {
                "focused": bool(seed_case_id),
                "seedFound": seed_found,
                "seedId": seed_id,
            }
        )
        return empty

    case_ids = [c["id"] for c in cases]

    case_persons = fetch_all(
        '''
        SELECT cp."caseId", cp."personId", cp.role, p.name, p.phone, p.address
        FROM "CasePerson" cp
        JOIN "Person" p ON cp."personId" = p.id
        WHERE cp."caseId" = ANY(%(caseIds)s)
        ''',
        {"caseIds": case_ids},
    )
    person_ids = sorted({cp["personId"] for cp in case_persons})

    matches = fetch_all(
        '''
        SELECT "caseId", "matchedCaseId", "matchedPersonId", "confidenceScore", status
        FROM "CaseMatch"
        WHERE "caseId" = ANY(%(caseIds)s) AND status != 'REJECTED'
        ''',
        {"caseIds": case_ids},
    )

    connections = (
        fetch_all(
            '''
            SELECT "personAId", "personBId", "relationType"
            FROM "Connection"
            WHERE "personAId" = ANY(%(personIds)s) OR "personBId" = ANY(%(personIds)s)
            ''',
            {"personIds": person_ids},
        )
        if person_ids
        else []
    )

    nodes: dict[str, dict[str, Any]] = {}
    edges: list[dict[str, Any]] = []
    leads: list[dict[str, Any]] = []
    edge_keys: set[tuple[str, str, str]] = set()

    def add_edge(
        a: str,
        b: str,
        label: str,
        category: str = "record",
        confidence: int | None = None,
    ) -> None:
        key = (*sorted((a, b)), label)
        if key in edge_keys:
            return
        edge_keys.add(key)
        edge: dict[str, Any] = {"from": a, "to": b, "label": label, "category": category}
        if confidence is not None:
            edge["confidence"] = confidence
        edges.append(edge)

    def add_lead(a: str, b: str, label: str, confidence: int) -> None:
        """Keep machine-generated suggestions visible but out of operational clusters.

        A pending similarity score is a lead for an officer to review, not a
        relationship established in the case record. Treating it as an edge
        made one noisy batch of suggestions merge most cases into one ring.
        """
        if a not in nodes or b not in nodes:
            return
        leads.append(
            {
                "from": a,
                "to": b,
                "label": label,
                "category": "lead",
                "confidence": confidence,
            }
        )

    for case in cases:
        case_node_id = f'case:{case["id"]}'
        nodes[case_node_id] = {
            "id": case_node_id,
            "label": case["firNumber"],
            "kind": "Case",
            "sub": case["crimeType"],
            "date": case["incidentDate"],
        }

        loc_node_id = f'loc:{case["stationId"]}'
        if loc_node_id not in nodes:
            nodes[loc_node_id] = {
                "id": loc_node_id,
                "label": case.get("stationName") or "Station",
                "kind": "Location",
            }
        # Station links provide useful orientation in a focused view, but do
        # not establish a relationship between two cases.
        add_edge(case_node_id, loc_node_id, "Reported at", category="context")

        haystack = f'{case.get("summary") or ""} {case.get("rawExtractedText") or ""}'
        for plate in _extract_plates(haystack):
            vehicle_node_id = f"vehicle:{plate}"
            if vehicle_node_id not in nodes:
                nodes[vehicle_node_id] = {"id": vehicle_node_id, "label": plate, "kind": "Vehicle"}
            # Plates extracted from FIR/OCR text are a reviewable mention until
            # an officer corroborates them, not a confirmed cross-case link.
            add_edge(case_node_id, vehicle_node_id, "Vehicle mentioned", category="lead")

    for cp in case_persons:
        person_node_id = f'person:{cp["personId"]}'
        if person_node_id not in nodes:
            detail_parts = [p for p in (cp.get("phone"), cp.get("address")) if p]
            nodes[person_node_id] = {
                "id": person_node_id,
                "label": cp["name"],
                "kind": "Person",
                "sub": cp["role"],
                "detail": " · ".join(detail_parts) if detail_parts else None,
            }
        add_edge(f'case:{cp["caseId"]}', person_node_id, ROLE_LABEL.get(cp["role"], cp["role"]))

    for m in matches:
        case_node_id = f'case:{m["caseId"]}'
        score = round(m["confidenceScore"])
        if m.get("matchedCaseId"):
            other = f'case:{m["matchedCaseId"]}'
            if other in nodes:
                if m.get("status") == "CONFIRMED":
                    add_edge(case_node_id, other, f"Confirmed MO match {score}%", category="confirmed", confidence=score)
                else:
                    add_lead(case_node_id, other, f"Possible MO similarity {score}%", score)
        elif m.get("matchedPersonId"):
            other = f'person:{m["matchedPersonId"]}'
            if other in nodes:
                if m.get("status") == "CONFIRMED":
                    add_edge(case_node_id, other, f"Confirmed identity match {score}%", category="confirmed", confidence=score)
                else:
                    add_lead(case_node_id, other, f"Possible identity similarity {score}%", score)

    for conn in connections:
        a, b = f'person:{conn["personAId"]}', f'person:{conn["personBId"]}'
        if a in nodes and b in nodes:
            add_edge(a, b, conn["relationType"])

    node_list = list(nodes.values())

    # Analytical results only use relationships supported by a case record or
    # explicitly confirmed by an officer. Context and unverified leads remain
    # available for review but cannot manufacture a hub or merge a case ring.
    analytical_edges = [
        edge for edge in edges if edge["category"] in {"record", "confirmed"}
    ]
    # When a dossier supplies a case seed these panels describe that bounded,
    # evidence-linked neighbourhood. Without a seed they describe the bounded
    # recent jurisdiction view.
    rings = graph_engine.find_rings(node_list, analytical_edges)
    hubs = graph_engine.compute_key_players(node_list, analytical_edges, limit=8)
    brokers = graph_engine.compute_brokers(node_list, analytical_edges, limit=8)

    # Dossier links historically sent a raw database case ID, while graph
    # nodes use `case:<id>`. Accept both forms so old links focus the requested
    # case instead of silently falling back to the default hub.
    resolved_seed_id = seed_id
    if seed_id and seed_id not in nodes and f"case:{seed_id}" in nodes:
        resolved_seed_id = f"case:{seed_id}"

    visible_nodes, visible_edges = node_list, edges
    if resolved_seed_id and resolved_seed_id in nodes:
        visible_ids = graph_engine.neighborhood(edges, resolved_seed_id, hops)
        visible_nodes = [n for n in node_list if n["id"] in visible_ids]
        visible_edges = [e for e in edges if e["from"] in visible_ids and e["to"] in visible_ids]

    _assign_layout(visible_nodes, visible_edges)

    return {
        "nodes": visible_nodes,
        "edges": visible_edges,
        "leads": leads,
        "rings": rings,
        "hubs": hubs,
        "brokers": brokers,
        "meta": {
            "caseCount": len(cases),
            "capped": capped,
            "layout": "server",
            "sharedEntityCount": len(hubs),
            "verifiedLinkCount": len(analytical_edges),
            "pendingLeadCount": len(leads),
            "focused": bool(seed_case_id and seed_found),
            "seedFound": resolved_seed_id in nodes if seed_id else None,
            "seedId": resolved_seed_id if seed_id else None,
        },
    }


def _assign_layout(nodes: list[dict[str, Any]], edges: list[dict[str, Any]]) -> None:
    """Precompute x/y so the frontend only paints — no heavy client layout."""
    if not nodes:
        return
    kind_rings = {"Case": 0.35, "Person": 0.55, "Location": 0.75, "Vehicle": 0.9}
    by_kind: dict[str, list[dict[str, Any]]] = {}
    for n in nodes:
        by_kind.setdefault(n.get("kind") or "Other", []).append(n)

    # Degree for slight radius jitter toward hubs
    degree: dict[str, int] = {n["id"]: 0 for n in nodes}
    for e in edges:
        if e["from"] in degree:
            degree[e["from"]] += 1
        if e["to"] in degree:
            degree[e["to"]] += 1

    cx, cy = 50.0, 50.0
    for kind, group in by_kind.items():
        base_r = kind_rings.get(kind, 0.65) * 42  # percent of view box
        n = len(group)
        for i, node in enumerate(group):
            angle = (2 * math.pi * i / max(n, 1)) - math.pi / 2
            hub_boost = min(degree.get(node["id"], 0), 8) * 0.8
            r = max(8.0, base_r - hub_boost)
            node["x"] = round(cx + r * math.cos(angle), 2)
            node["y"] = round(cy + r * math.sin(angle), 2)
