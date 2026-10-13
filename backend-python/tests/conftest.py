"""Shared test configuration.

get_settings() is lru_cached process-wide, so a value read in one test would
leak into the next and defeat monkeypatch.setenv. Reset it around every test.
"""

import pytest

from app.config import get_settings
from app.services import gee, soilgrids


@pytest.fixture(autouse=True)
def _reset_settings_cache(monkeypatch):
    # A developer .env may enable the scanner AI; tests never load real models.
    monkeypatch.setenv("AI_MODELS_ENABLED", "false")
    monkeypatch.setenv("SCAN_MEDIA_DIR", "")
    get_settings.cache_clear()
    soilgrids.clear_cache()
    gee.clear_cache()
    yield
    get_settings.cache_clear()
