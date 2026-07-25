from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import (
    ai,
    audit,
    auth,
    admin_officers,
    cases,
    chat_sessions,
    dashboard,
    deadlines,
    early_warnings,
    fir,
    health,
    hotspots,
    legal,
    network,
    search,
    tts,
)
from app.routers import settings as settings_router


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="KSP Portal API")

    # app.add_middleware(
    #     CORSMiddleware,
    #     allow_origins=settings.allowed_origin_list,
    #     allow_credentials=True,
    #     allow_methods=["*"],
    #     allow_headers=["*"],
    # )

    app.include_router(health.router)
    app.include_router(auth.router)
    app.include_router(admin_officers.router)
    app.include_router(cases.router)
    app.include_router(search.router)
    app.include_router(dashboard.router)
    app.include_router(hotspots.router)
    app.include_router(settings_router.router)
    app.include_router(ai.router)
    app.include_router(fir.router)
    app.include_router(deadlines.router)
    app.include_router(early_warnings.router)
    app.include_router(network.router)
    app.include_router(audit.router)
    app.include_router(legal.router)
    app.include_router(chat_sessions.router)
    app.include_router(tts.router)

    @app.on_event("startup")
    def startup_event():
        from app.services.db import get_pool
        get_pool()

    return app


app = create_app()
