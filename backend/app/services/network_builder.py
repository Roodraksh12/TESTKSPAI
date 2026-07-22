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
    "rings": [],
    "hubs": [],
    "brokers": [],
    "meta": {"caseCount": 0, "capped": False},
}


def _extract_plates(text: str) -> set[str]:
    if not text:
        return set()
    return {re.sub(r"[\s-]+", "-", m.upper()) for m in KA_PLATE_RE.findall(text)}


def build_crime_network(
    officer: dict[str, Any], seed_id: str | None = None, hops: int = 2
) -> dict[str, Any]:
    scope_sql, scope_params = jurisdiction_filter_sql(officer, alias="c")
    fetched = fetch_all(
        f'''
        SELECT c.id, c."firNumber", c."crimeType", c."incidentDate", c.summary,
               c."rawExtractedText", c."stationId", ps.name AS "stationName"
        FROM "Case" c
        LEFT JOIN "PoliceStation" ps ON c."stationId" = ps.id
        WHERE 1=1{scope_sql}
        ORDER BY c."reportedDate" DESC
        LIMIT {GRAPH_CASE_CAP + 1}
        ''',
        scope_params,
    )
    if not fetched:
        return {**EMPTY_GRAPH, "meta": dict(EMPTY_GRAPH["meta"])}

    capped = len(fetched) > GRAPH_CASE_CAP
    cases = fetched[:GRAPH_CASE_CAP]
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
    edge_keys: set[tuple[str, str, str]] = set()

    def add_edge(a: str, b: str, label: str) -> None:
        key = (*sorted((a, b)), label)
        if key in edge_keys:
            return
        edge_keys.add(key)
        edges.append({"from": a, "to": b, "label": label})

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
        add_edge(case_node_id, loc_node_id, "Reported at")

        haystack = f'{case.get("summary") or ""} {case.get("rawExtractedText") or ""}'
        for plate in _extract_plates(haystack):
            vehicle_node_id = f"vehicle:{plate}"
            if vehicle_node_id not in nodes:
                nodes[vehicle_node_id] = {"id": vehicle_node_id, "label": plate, "kind": "Vehicle"}
            add_edge(case_node_id, vehicle_node_id, "Vehicle used")

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
                add_edge(case_node_id, other, f"MO match {score}%")
        elif m.get("matchedPersonId"):
            other = f'person:{m["matchedPersonId"]}'
            if other in nodes:
                add_edge(case_node_id, other, f"Identity lead {score}%")

    for conn in connections:
        a, b = f'person:{conn["personAId"]}', f'person:{conn["personBId"]}'
        if a in nodes and b in nodes:
            add_edge(a, b, conn["relationType"])

    node_list = list(nodes.values())

    # Rings/hubs/brokers are always computed over the full scoped graph, not
    # whatever subset is currently in view, so the panels stay jurisdiction-complete.
    rings = graph_engine.find_rings(node_list, edges)
    hubs = graph_engine.compute_key_players(node_list, edges, limit=8)
    brokers = graph_engine.compute_brokers(node_list, edges, limit=8)

    visible_nodes, visible_edges = node_list, edges
    if seed_id and seed_id in nodes:
        visible_ids = graph_engine.neighborhood(edges, seed_id, hops)
        visible_nodes = [n for n in node_list if n["id"] in visible_ids]
        visible_edges = [e for e in edges if e["from"] in visible_ids and e["to"] in visible_ids]

    _assign_layout(visible_nodes, visible_edges)

    return {
        "nodes": visible_nodes,
        "edges": visible_edges,
        "rings": rings,
        "hubs": hubs,
        "brokers": brokers,
        "meta": {"caseCount": len(cases), "capped": capped, "layout": "server"},
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
