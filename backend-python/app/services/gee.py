"""Google Earth Engine client — Forest Canopy Density (FCD) context.

Runs live only when GEE_ENABLED=true and a service-account JSON is
configured. Otherwise returns a deterministic mock so the pipeline stays
testable offline.
"""

import hashlib
import logging

from app.config import get_settings

log = logging.getLogger(__name__)


def _mock_fcd(latitude: float, longitude: float) -> float:
    """Deterministic pseudo-FCD in [0.25, 0.95] from coordinates."""
    digest = hashlib.md5(f"{latitude:.4f},{longitude:.4f}".encode()).hexdigest()
    frac = int(digest[:8], 16) / 0xFFFFFFFF
    return round(0.25 + frac * 0.70, 3)


async def canopy_density(latitude: float, longitude: float) -> dict:
    """Estimate Forest Canopy Density near the coordinates."""
    settings = get_settings()
    if not settings.gee_enabled or not settings.gee_service_account_json:
        return {
            "fcd": _mock_fcd(latitude, longitude),
            "source": "mock",
            "competition_level": None,
        }

    try:
        import ee

        credentials = ee.ServiceAccountCredentials(
            email=None, key_data=settings.gee_service_account_json
        )
        ee.Initialize(credentials)

        # Hansen global forest cover as FCD proxy: canopy cover % / 100
        hansen = ee.Image("UMD/hansen/global_forest_change_2023_v1_11")
        canopy = hansen.select("treecover2000")
        region = ee.Geometry.Point([longitude, latitude]).buffer(500).bounds()
        stats = canopy.reduceRegion(
            reducer=ee.Reducer.mean(), geometry=region, scale=30, maxPixels=1e9
        )
        value = stats.get("treecover2000").getInfo()
        fcd = (
            round(float(value) / 100.0, 3) if value is not None else _mock_fcd(latitude, longitude)
        )
        return {"fcd": fcd, "source": "gee_hansen_treecover2000", "competition_level": None}
    except Exception as exc:
        log.warning("GEE canopy lookup failed, using mock FCD: %s", exc)
        return {
            "fcd": _mock_fcd(latitude, longitude),
            "source": "mock_fallback",
            "competition_level": None,
        }


def competition_level(fcd: float | None) -> str:
    """Qualitative competition label used in the age-estimation damping."""
    if fcd is None:
        return "unknown"
    if fcd >= 0.7:
        return "dense_forest_high_competition"
    if fcd >= 0.4:
        return "moderate_canopy"
    return "open_sun_low_competition"
