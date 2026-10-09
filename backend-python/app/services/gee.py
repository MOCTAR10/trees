"""Google Earth Engine client — Forest Canopy Density (FCD) context.

Runs live only when GEE_ENABLED=true and a service-account key is available
(GEE_SERVICE_ACCOUNT_FILE path or GEE_SERVICE_ACCOUNT_JSON inline). Otherwise
returns a deterministic mock so the pipeline stays testable offline.

Live calls need the registered project id (GEE_PROJECT, falling back to the
key's own project_id) and a service account holding
`roles/earthengine.viewer` + `roles/serviceusage.serviceUsageConsumer`.
"""

import asyncio
import hashlib
import json
import logging
from pathlib import Path

from app.config import get_settings

log = logging.getLogger(__name__)

_initialized = False


def _mock_fcd(latitude: float, longitude: float) -> float:
    """Deterministic pseudo-FCD in [0.25, 0.95] from coordinates."""
    digest = hashlib.md5(f"{latitude:.4f},{longitude:.4f}".encode()).hexdigest()
    frac = int(digest[:8], 16) / 0xFFFFFFFF
    return round(0.25 + frac * 0.70, 3)


def _load_key() -> dict | None:
    """Load the service-account key from file (preferred) or the JSON env var."""
    settings = get_settings()
    if settings.gee_service_account_json:
        return json.loads(settings.gee_service_account_json)
    if not settings.gee_service_account_file:
        return None

    path = Path(settings.gee_service_account_file)
    if not path.is_absolute():
        # Resolve relative to backend-python/ regardless of the cwd (/app in Docker).
        base = Path(__file__).resolve().parents[2]
        path = next((p for p in (Path.cwd() / path, base / path) if p.exists()), path)
    return json.loads(path.read_text(encoding="utf-8"))


def _gee_fcd(key: dict, project: str, latitude: float, longitude: float) -> float | None:
    """Blocking Earth Engine query (runs in a worker thread)."""
    global _initialized
    import ee

    if not _initialized:
        creds = ee.ServiceAccountCredentials(key["client_email"], key_data=json.dumps(key))
        ee.Initialize(creds, project=project)
        _initialized = True

    # Hansen global forest cover as FCD proxy: canopy cover % / 100
    hansen = ee.Image("UMD/hansen/global_forest_change_2025_v1_13")
    canopy = hansen.select("treecover2000")
    region = ee.Geometry.Point([longitude, latitude]).buffer(500).bounds()
    stats = canopy.reduceRegion(reducer=ee.Reducer.mean(), geometry=region, scale=30, maxPixels=1e9)
    value = stats.get("treecover2000").getInfo()
    return round(float(value) / 100.0, 3) if value is not None else None


async def canopy_density(latitude: float, longitude: float) -> dict:
    """Estimate Forest Canopy Density near the coordinates."""
    settings = get_settings()
    if not settings.gee_enabled:
        return {"fcd": _mock_fcd(latitude, longitude), "source": "mock", "competition_level": None}

    try:
        key = _load_key()
        if key is None:
            raise RuntimeError("no GEE service-account key configured")
        project = settings.gee_project or key.get("project_id")
        fcd = await asyncio.to_thread(_gee_fcd, key, project, latitude, longitude)
    except Exception as exc:
        log.warning("GEE canopy lookup failed, using mock FCD: %s", exc)
        return {
            "fcd": _mock_fcd(latitude, longitude),
            "source": "mock_fallback",
            "competition_level": None,
        }

    if fcd is None:
        return {
            "fcd": _mock_fcd(latitude, longitude),
            "source": "mock_no_coverage",
            "competition_level": None,
        }
    return {"fcd": fcd, "source": "gee_hansen_treecover2000", "competition_level": None}


def competition_level(fcd: float | None) -> str:
    """Qualitative competition label used in the age-estimation damping."""
    if fcd is None:
        return "unknown"
    if fcd >= 0.7:
        return "dense_forest_high_competition"
    if fcd >= 0.4:
        return "moderate_canopy"
    return "open_sun_low_competition"
