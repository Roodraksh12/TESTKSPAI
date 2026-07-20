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
    graph = network_builder.build_crime_network(True, sp_officer["stationId"])
    assert len(graph["nodes"]) > 0
    assert len(graph["rings"]) >= 1
    assert graph["meta"]["caseCount"] > 0


def test_network_brokers_rank_differently_from_hubs(sp_officer) -> None:
    graph = network_builder.build_crime_network(True, sp_officer["stationId"])
    hub_ids = [h["id"] for h in graph["hubs"]]
    broker_ids = [b["id"] for b in graph["brokers"]]
    assert hub_ids != broker_ids


def test_rejected_match_is_excluded_from_edges(sp_officer) -> None:
    graph = network_builder.build_crime_network(True, sp_officer["stationId"])
    edge_labels = {e["label"] for e in graph["edges"]}
    # The seeded REJECTED match (EXTRA-108 vs EXTRA-109) must never surface as an edge.
    assert not any(label.startswith("MO match") and "42" in label for label in edge_labels)


def test_network_respects_case_cap(sp_officer) -> None:
    graph = network_builder.build_crime_network(True, sp_officer["stationId"])
    assert graph["meta"]["caseCount"] <= network_builder.GRAPH_CASE_CAP
