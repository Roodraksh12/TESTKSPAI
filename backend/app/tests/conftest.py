from __future__ import annotations

import psycopg
import pytest

from app.config import get_settings


@pytest.fixture(scope="session")
def db_available() -> bool:
    try:
        settings = get_settings()
        with psycopg.connect(settings.database_url, connect_timeout=2):
            return True
    except Exception:
        return False
