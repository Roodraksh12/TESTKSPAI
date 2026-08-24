from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.services.db import close_pool, get_pool
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
    case_diary,
    evidence,
    final_reports,
    report_sources,
)
from app.routers import settings as settings_router


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Fail closed before serving requests if auth was not configured.
    _jwt_secret = get_settings().jwt_secret
    get_pool()
    try:
        yield
    finally:
        close_pool()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="KSP Portal API", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

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
    app.include_router(case_diary.router)
    app.include_router(evidence.router)
    app.include_router(final_reports.router)
    app.include_router(report_sources.router)

    return app


app = create_app()
