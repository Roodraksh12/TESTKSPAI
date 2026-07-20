from __future__ import annotations

from fastapi import APIRouter, Depends

from app.deps import get_current_user
from app.services import network_builder
from app.services.parallel import network_cache

router = APIRouter(prefix="/api", tags=["network"])


@router.get("/network")
def network(
    seedId: str | None = None,
    hops: int = 2,
    current_user: dict = Depends(get_current_user),
) -> dict:
    officer = current_user["officer"]
    is_sp = officer.get("role") == "SP"
    # Building the graph is the costliest read in the app; officers revisit this
    # tab constantly while exploring, and the underlying links rarely change
    # within a session.
    return network_cache.get_or_compute(
        ("network", is_sp, officer["stationId"], seedId, hops),
        lambda: network_builder.build_crime_network(
            is_sp, officer["stationId"], seed_id=seedId, hops=hops
        ),
    )
