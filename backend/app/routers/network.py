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

    return network_cache.get_or_compute(

        ("network", officer["id"], officer.get("role"), seedId, hops),

        lambda: network_builder.build_crime_network(officer, seed_id=seedId, hops=hops),

    )

