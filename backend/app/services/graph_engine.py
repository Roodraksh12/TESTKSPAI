from __future__ import annotations

from collections import deque
from typing import Any

# Pure criminal-network graph math. No DB/framework imports — directly portable
# and unit-testable. Nodes/edges are plain dicts:
#   Node = {id, label, kind ("Case"|"Person"|"Vehicle"|"Location"), sub?, detail?, date?}
#   Edge = {from, to, label}


def build_adjacency(edges: list[dict[str, Any]]) -> dict[str, set[str]]:
    adjacency: dict[str, set[str]] = {}
    for edge in edges:
        a, b = edge["from"], edge["to"]
        adjacency.setdefault(a, set()).add(b)
        adjacency.setdefault(b, set()).add(a)
    return adjacency


def neighborhood(edges: list[dict[str, Any]], seed_id: str, hops: int) -> set[str]:
    adjacency = build_adjacency(edges)
    visited = {seed_id}
    frontier = {seed_id}
    for _ in range(hops):
        next_frontier: set[str] = set()
        for node_id in frontier:
            for neighbour in adjacency.get(node_id, set()):
                if neighbour not in visited:
                    visited.add(neighbour)
                    next_frontier.add(neighbour)
        if not next_frontier:
            break
        frontier = next_frontier
    return visited


def shortest_path(edges: list[dict[str, Any]], frm: str, to: str) -> list[str] | None:
    if frm == to:
        return [frm]
    adjacency = build_adjacency(edges)
    if frm not in adjacency or to not in adjacency:
        return None

    queue: deque[str] = deque([frm])
    came_from: dict[str, str] = {}
    visited = {frm}
    while queue:
        current = queue.popleft()
        for neighbour in adjacency.get(current, set()):
            if neighbour in visited:
                continue
            visited.add(neighbour)
            came_from[neighbour] = current
            if neighbour == to:
                path = [to]
                node = to
                while node != frm:
                    node = came_from[node]
                    path.append(node)
                path.reverse()
                return path
            queue.append(neighbour)
    return None


def _kind_breakdown(neighbour_ids: set[str], node_by_id: dict[str, dict[str, Any]]) -> str:
    counts = {"Case": 0, "Person": 0, "Vehicle": 0}
    for nid in neighbour_ids:
        kind = node_by_id.get(nid, {}).get("kind")
        if kind in counts:
            counts[kind] += 1
    parts = []
    if counts["Case"]:
        parts.append(f'{counts["Case"]} case{"s" if counts["Case"] != 1 else ""}')
    if counts["Person"]:
        parts.append(f'{counts["Person"]} {"people" if counts["Person"] != 1 else "person"}')
    if counts["Vehicle"]:
        parts.append(f'{counts["Vehicle"]} vehicle{"s" if counts["Vehicle"] != 1 else ""}')
    return " · ".join(parts) if parts else "No connections"


def _case_link_count(neighbour_ids: set[str], node_by_id: dict[str, dict[str, Any]]) -> int:
    """Count the cases an entity actually connects, excluding ambient context."""
    return sum(1 for nid in neighbour_ids if node_by_id.get(nid, {}).get("kind") == "Case")


def compute_key_players(
    nodes: list[dict[str, Any]], edges: list[dict[str, Any]], limit: int = 5
) -> list[dict[str, Any]]:
    adjacency = build_adjacency(edges)
    node_by_id = {n["id"]: n for n in nodes}
    # A case is expected to connect to its people, station and documents. It is
    # not a "key player". Surface only entities that can genuinely recur across
    # case files, so the ranking answers "who/what links these cases?".
    candidates = [n for n in nodes if n.get("kind") in {"Person", "Vehicle"}]
    ranked = sorted(candidates, key=lambda n: len(adjacency.get(n["id"], set())), reverse=True)

    results = []
    for node in ranked[:limit]:
        neighbour_ids = adjacency.get(node["id"], set())
        # Only multi-link entities are "key" — a node with a single link is just
        # a participant in one case, not a hub worth surfacing.
        if len(neighbour_ids) < 2:
            continue
        case_count = _case_link_count(neighbour_ids, node_by_id)
        if case_count < 2:
            continue
        results.append(
            {
                "id": node["id"],
                "label": node.get("label"),
                "kind": node.get("kind"),
                "degree": len(neighbour_ids),
                "caseCount": case_count,
                "breakdown": _kind_breakdown(neighbour_ids, node_by_id),
            }
        )
    return results


def find_rings(nodes: list[dict[str, Any]], edges: list[dict[str, Any]]) -> list[dict[str, Any]]:
    node_by_id = {n["id"]: n for n in nodes}
    non_location_ids = sorted(n["id"] for n in nodes if n.get("kind") != "Location")
    non_location_set = set(non_location_ids)
    filtered_edges = [
        e for e in edges if e["from"] in non_location_set and e["to"] in non_location_set
    ]
    adjacency = build_adjacency(filtered_edges)

    visited: set[str] = set()
    rings: list[dict[str, Any]] = []
    for node_id in non_location_ids:
        if node_id in visited:
            continue
        component: set[str] = set()
        queue: deque[str] = deque([node_id])
        visited.add(node_id)
        while queue:
            current = queue.popleft()
            component.add(current)
            for neighbour in adjacency.get(current, set()):
                if neighbour not in visited:
                    visited.add(neighbour)
                    queue.append(neighbour)

        case_ids = [nid for nid in component if node_by_id.get(nid, {}).get("kind") == "Case"]
        if len(case_ids) < 2:
            continue

        person_ids = [nid for nid in component if node_by_id.get(nid, {}).get("kind") == "Person"]
        vehicle_ids = [nid for nid in component if node_by_id.get(nid, {}).get("kind") == "Vehicle"]

        if person_ids:
            top_person_id = max(person_ids, key=lambda nid: len(adjacency.get(nid, set())))
            label = f'Around {node_by_id[top_person_id].get("label", "Unknown")}'
        else:
            label = f"{len(case_ids)}-case cluster"

        rings.append(
            {
                "id": f"ring:{len(rings)}",
                "label": label,
                "nodeIds": sorted(component),
                "caseCount": len(case_ids),
                "personCount": len(person_ids),
                "vehicleCount": len(vehicle_ids),
            }
        )

    return rings


def compute_brokers(
    nodes: list[dict[str, Any]], edges: list[dict[str, Any]], limit: int = 5
) -> list[dict[str, Any]]:
    node_by_id = {n["id"]: n for n in nodes}
    non_location_ids = [n["id"] for n in nodes if n.get("kind") != "Location"]
    non_location_set = set(non_location_ids)
    filtered_edges = [
        e for e in edges if e["from"] in non_location_set and e["to"] in non_location_set
    ]
    adjacency = build_adjacency(filtered_edges)

    betweenness = {nid: 0.0 for nid in non_location_ids}

    # Brandes' algorithm, unweighted undirected graph.
    for s in non_location_ids:
        stack: list[str] = []
        predecessors: dict[str, list[str]] = {nid: [] for nid in non_location_ids}
        sigma = {nid: 0.0 for nid in non_location_ids}
        sigma[s] = 1.0
        dist = {nid: -1 for nid in non_location_ids}
        dist[s] = 0
        queue: deque[str] = deque([s])

        while queue:
            v = queue.popleft()
            stack.append(v)
            for w in adjacency.get(v, set()):
                if w not in dist:
                    continue
                if dist[w] < 0:
                    dist[w] = dist[v] + 1
                    queue.append(w)
                if dist[w] == dist[v] + 1:
                    sigma[w] += sigma[v]
                    predecessors[w].append(v)

        delta = {nid: 0.0 for nid in non_location_ids}
        while stack:
            w = stack.pop()
            for v in predecessors[w]:
                delta[v] += (sigma[v] / sigma[w]) * (1 + delta[w])
            if w != s:
                betweenness[w] += delta[w]

    for nid in betweenness:
        betweenness[nid] /= 2.0  # undirected graphs count each pair twice

    ranked = sorted(non_location_ids, key=lambda nid: betweenness[nid], reverse=True)
    results = []
    for nid in ranked[:limit]:
        score = betweenness[nid]
        # A node that sits on no shortest path isn't a broker at all — listing it
        # would pad the ranking with meaningless zero-score entries.
        if score <= 0:
            continue
        node = node_by_id.get(nid, {})
        bridged = round(score)
        results.append(
            {
                "id": nid,
                "label": node.get("label"),
                "kind": node.get("kind"),
                "betweenness": round(score, 4),
                "degree": round(score * 10) / 10,
                "breakdown": f'bridges {bridged} shortest path{"" if bridged == 1 else "s"}',
            }
        )
    return results
