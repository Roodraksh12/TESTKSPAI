from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.main import create_app


def _has_cors_middleware(app) -> bool:
    return any(middleware.cls is CORSMiddleware for middleware in app.user_middleware)


def test_local_runtime_enables_fastapi_cors(monkeypatch):
    monkeypatch.setenv("PLATFORM_MANAGED_CORS", "false")
    get_settings.cache_clear()
    try:
        assert _has_cors_middleware(create_app())
    finally:
        get_settings.cache_clear()


def test_platform_runtime_omits_duplicate_cors(monkeypatch):
    monkeypatch.setenv("PLATFORM_MANAGED_CORS", "true")
    get_settings.cache_clear()
    try:
        assert not _has_cors_middleware(create_app())
    finally:
        get_settings.cache_clear()
