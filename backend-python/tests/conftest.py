"""Shared test configuration.

get_settings() is lru_cached process-wide, so a value read in one test would
leak into the next and defeat monkeypatch.setenv. Reset it around every test.
"""

import pytest

from app.config import get_settings


@pytest.fixture(autouse=True)
def _reset_settings_cache():
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()
