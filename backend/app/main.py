from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import ai, auth, cases, dashboard, fir, health, hotspots, search
from app.routers import settings as settings_router


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="KSP Portal API")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health.router)
    app.include_router(auth.router)
    app.include_router(cases.router)
    app.include_router(search.router)
    app.include_router(dashboard.router)
    app.include_router(hotspots.router)
    app.include_router(settings_router.router)
    app.include_router(ai.router)
    app.include_router(fir.router)
    return app


app = create_app()
