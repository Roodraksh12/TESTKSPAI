from __future__ import annotations

import pytest

from app.services import network_builder
from app.services.case_access import load_officer_by_badge


@pytest.fixture(scope="module")
def sp_officer(db_available: bool):
    if not db_available:
        pytest.skip("local Postgres not reachable")
    officer = load_officer_by_badge("KA-SP-9999")
    assert officer is not None
    return officer


def test_network_graph_has_rings_after_seed_backfill(sp_officer) -> None:
    graph = network_builder.build_crime_network(sp_officer)
    assert len(graph["nodes"]) > 0
    assert len(graph["rings"]) >= 1
    assert graph["meta"]["caseCount"] > 0


def test_network_brokers_rank_differently_from_hubs(sp_officer) -> None:
    graph = network_builder.build_crime_network(sp_officer)
    hub_ids = [h["id"] for h in graph["hubs"]]
    broker_ids = [b["id"] for b in graph["brokers"]]
    assert hub_ids != broker_ids


def test_rejected_match_is_excluded_from_edges(sp_officer) -> None:
    graph = network_builder.build_crime_network(sp_officer)
    edge_labels = {e["label"] for e in graph["edges"]}
    # The seeded REJECTED match (EXTRA-108 vs EXTRA-109) must never surface as an edge.
    assert not any(label.startswith("MO match") and "42" in label for label in edge_labels)


def test_network_respects_case_cap(sp_officer) -> None:
    graph = network_builder.build_crime_network(sp_officer)
    assert graph["meta"]["caseCount"] <= network_builder.GRAPH_CASE_CAP


def test_raw_case_id_focus_matches_typed_network_node(sp_officer) -> None:
    full_graph = network_builder.build_crime_network(sp_officer)
    case_node = next(node for node in full_graph["nodes"] if node["kind"] == "Case")
    raw_case_id = case_node["id"].removeprefix("case:")

    raw_focus = network_builder.build_crime_network(sp_officer, seed_id=raw_case_id)
    typed_focus = network_builder.build_crime_network(sp_officer, seed_id=case_node["id"])

    raw_ids = {node["id"] for node in raw_focus["nodes"]}
    typed_ids = {node["id"] for node in typed_focus["nodes"]}
    assert case_node["id"] in raw_ids
    assert raw_ids == typed_ids
