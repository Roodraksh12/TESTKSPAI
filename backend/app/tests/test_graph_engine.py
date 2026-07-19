from app.services.graph_engine import (
    build_adjacency,
    compute_brokers,
    compute_key_players,
    find_rings,
    neighborhood,
    shortest_path,
)


def _node(node_id: str, kind: str, label: str | None = None) -> dict:
    return {"id": node_id, "kind": kind, "label": label or node_id}


def _edge(a: str, b: str, label: str = "link") -> dict:
    return {"from": a, "to": b, "label": label}


def _bridged_clusters_graph() -> tuple[list[dict], list[dict]]:
    # Two 2-case clusters, each with its own hub person, joined only through
    # a single low-degree bridge person. case:1/case:2 and case:3/case:4 are
    # also directly linked to each other (e.g. an MO match) so the hubs have
    # an alternate route within their own cluster and don't inflate their own
    # betweenness — isolating the bridge's cross-cluster role cleanly.
    nodes = [
        _node("case:1", "Case"),
        _node("case:2", "Case"),
        _node("person:hub1", "Person", "Hub One"),
        _node("person:bridge", "Person", "Bridge Person"),
        _node("person:hub2", "Person", "Hub Two"),
        _node("case:3", "Case"),
        _node("case:4", "Case"),
    ]
    edges = [
        _edge("case:1", "case:2"),
        _edge("case:1", "person:hub1"),
        _edge("case:2", "person:hub1"),
        _edge("person:hub1", "person:bridge"),
        _edge("person:bridge", "person:hub2"),
        _edge("person:hub2", "case:3"),
        _edge("person:hub2", "case:4"),
        _edge("case:3", "case:4"),
    ]
    return nodes, edges


def test_build_adjacency_is_undirected() -> None:
    edges = [_edge("A", "B"), _edge("B", "C")]
    adjacency = build_adjacency(edges)
    assert adjacency["A"] == {"B"}
    assert adjacency["B"] == {"A", "C"}
    assert adjacency["C"] == {"B"}


def test_neighborhood_bfs_respects_hop_limit() -> None:
    edges = [
        _edge("center", "leaf1"),
        _edge("center", "leaf2"),
        _edge("center", "leaf3"),
        _edge("leaf1", "leaf1b"),
    ]
    assert neighborhood(edges, "center", 1) == {"center", "leaf1", "leaf2", "leaf3"}
    assert neighborhood(edges, "center", 2) == {"center", "leaf1", "leaf2", "leaf3", "leaf1b"}
    assert neighborhood(edges, "center", 0) == {"center"}


def test_shortest_path_returns_correct_hop_count() -> None:
    edges = [_edge("A", "B"), _edge("B", "C"), _edge("C", "D")]
    path = shortest_path(edges, "A", "D")
    assert path == ["A", "B", "C", "D"]
    assert len(path) - 1 == 3


def test_shortest_path_same_node_is_trivial() -> None:
    edges = [_edge("A", "B")]
    assert shortest_path(edges, "A", "A") == ["A"]


def test_shortest_path_unreachable_returns_none() -> None:
    edges = [_edge("A", "B"), _edge("C", "D")]
    assert shortest_path(edges, "A", "D") is None


def test_key_players_skip_location_and_rank_by_degree() -> None:
    nodes = [
        _node("case:1", "Case"),
        _node("case:2", "Case"),
        _node("case:3", "Case"),
        _node("person:p1", "Person", "P1"),
        _node("loc:s1", "Location", "Station"),
    ]
    edges = [
        _edge("person:p1", "case:1"),
        _edge("person:p1", "case:2"),
        _edge("person:p1", "case:3"),
        _edge("loc:s1", "case:1"),
        _edge("loc:s1", "case:2"),
        _edge("loc:s1", "case:3"),
    ]
    hubs = compute_key_players(nodes, edges, limit=5)
    hub_ids = [h["id"] for h in hubs]
    assert "loc:s1" not in hub_ids
    assert hubs[0]["id"] == "person:p1"
    assert hubs[0]["degree"] == 3
    assert hubs[0]["breakdown"] == "3 cases"


def test_find_rings_two_clusters_bridged_by_one_person() -> None:
    nodes, edges = _bridged_clusters_graph()
    rings = find_rings(nodes, edges)
    assert len(rings) == 1
    assert rings[0]["caseCount"] == 4
    assert set(rings[0]["nodeIds"]) == {
        "case:1", "case:2", "case:3", "case:4",
        "person:hub1", "person:bridge", "person:hub2",
    }


def test_find_rings_isolated_single_case_is_not_a_ring() -> None:
    nodes = [_node("case:solo", "Case"), _node("person:x", "Person")]
    edges = [_edge("case:solo", "person:x")]
    assert find_rings(nodes, edges) == []


def test_find_rings_shared_location_alone_does_not_merge_cases() -> None:
    # Both cases only touch each other through a shared station — Location
    # nodes must be excluded before computing components, or every case in a
    # jurisdiction collapses into one meaningless "ring".
    nodes = [
        _node("case:a", "Case"),
        _node("case:b", "Case"),
        _node("loc:station1", "Location", "Station One"),
    ]
    edges = [
        _edge("case:a", "loc:station1"),
        _edge("case:b", "loc:station1"),
    ]
    assert find_rings(nodes, edges) == []


def test_compute_brokers_exact_values_on_simple_path() -> None:
    # Textbook path graph A-B-C-D-E: betweenness(i) = (i-1)*(n-i) for a tree.
    nodes = [_node(n, "Person") for n in ["A", "B", "C", "D", "E"]]
    edges = [_edge("A", "B"), _edge("B", "C"), _edge("C", "D"), _edge("D", "E")]
    brokers = compute_brokers(nodes, edges, limit=5)
    scores = {b["id"]: b["betweenness"] for b in brokers}
    assert scores["B"] == 3
    assert scores["C"] == 4
    assert scores["D"] == 3
    # The two endpoints sit on no shortest path, so they are not brokers at all
    # and must be omitted rather than padding the ranking with zero scores.
    assert "A" not in scores
    assert "E" not in scores


def test_compute_brokers_carry_display_fields() -> None:
    nodes = [_node(n, "Person") for n in ["A", "B", "C"]]
    edges = [_edge("A", "B"), _edge("B", "C")]
    brokers = compute_brokers(nodes, edges, limit=5)
    assert len(brokers) == 1
    top = brokers[0]
    assert top["id"] == "B"
    assert top["degree"] == 1.0
    assert top["breakdown"] == "bridges 1 shortest path"


def test_compute_key_players_skips_single_link_entities() -> None:
    # "leaf" hangs off one case only, so it is a participant, not a hub.
    nodes = [
        _node("case:a", "Case"),
        _node("case:b", "Case"),
        _node("person:hub", "Person"),
        _node("person:leaf", "Person"),
    ]
    edges = [
        _edge("person:hub", "case:a"),
        _edge("person:hub", "case:b"),
        _edge("person:leaf", "case:a"),
    ]
    ids = {p["id"] for p in compute_key_players(nodes, edges, limit=8)}
    assert "person:hub" in ids
    assert "person:leaf" not in ids


def test_compute_brokers_bridge_outranks_higher_degree_hubs() -> None:
    nodes, edges = _bridged_clusters_graph()
    adjacency = build_adjacency(edges)

    # The bridge has fewer direct links than either hub...
    assert len(adjacency["person:bridge"]) < len(adjacency["person:hub1"])
    assert len(adjacency["person:bridge"]) < len(adjacency["person:hub2"])

    # ...yet it ranks #1 broker, because every shortest path between the two
    # clusters must pass through it.
    brokers = compute_brokers(nodes, edges, limit=5)
    assert brokers[0]["id"] == "person:bridge"
