"""SoilGrids REST v2 (ISRIC) — soil properties at a GPS point.

Open API, no key. Each property is queried concurrently (a multi-property
request is slow enough to time out) and returns depths[].values.mean in
mapped units (g/kg for clay/sand, dg/kg for SOC) — converted to %.
"""

import asyncio
import time

from app.services import http

SOILGRIDS_URL = "https://rest.isric.org/soilgrids/v2.0/properties/query"

#: Soil does not change between scans: cache per ~500 m cell (SoilGrids is a
#: 250 m grid). Failures are cached briefly so a throttled upstream is not
#: hammered by every scan of a field campaign.
CELL_DEG = 0.005
TTL_OK_S = 7 * 24 * 3600
TTL_MISS_S = 10 * 60
REQUEST_TIMEOUT_S = 8.0

_cache: dict[tuple[int, int], tuple[float, dict | None]] = {}


def clear_cache() -> None:
    _cache.clear()


def _cell(latitude: float, longitude: float) -> tuple[int, int]:
    return round(latitude / CELL_DEG), round(longitude / CELL_DEG)


# property -> (mapped unit divisor to %)
PROPERTY_DIVISOR = {"clay": 10.0, "sand": 10.0, "soc": 100.0}


def classify_soil(clay_pct: float, sand_pct: float, soc_pct: float) -> str:
    """USDA-texture-like simplification for metadata tagging."""
    if clay_pct >= 40:
        base = "clay"
    elif sand_pct >= 50:
        base = "sandy"
    else:
        base = "loam"
    if soc_pct >= 2.0:
        return f"{base}_organic"
    if soc_pct < 0.6:
        return f"{base}_low_organic"
    return base


async def _fetch_property(name: str, lat: float, lon: float) -> float | None:
    """Fetch one property's 0-5cm mean; None when uncovered (offshore etc.)."""
    params = [("lat", lat), ("lon", lon), ("property", name), ("depth", "0-5cm")]
    resp = await http.request(
        "GET", SOILGRIDS_URL, params=params, timeout=REQUEST_TIMEOUT_S, retries=0
    )
    resp.raise_for_status()
    for layer in resp.json().get("properties", {}).get("layers", []):
        if layer.get("name") != name:
            continue
        for depth in layer.get("depths", []):
            mean = (depth.get("values") or {}).get("mean")
            if mean is not None:
                return float(mean) / PROPERTY_DIVISOR[name]
    return None


async def fetch_soil(latitude: float, longitude: float) -> dict | None:
    """Soil at a point, from the cell cache or SoilGrids (best effort)."""
    key = _cell(latitude, longitude)
    hit = _cache.get(key)
    now = time.monotonic()
    if hit is not None and hit[0] > now:
        return hit[1]
    soil = await _query_soil(latitude, longitude)
    _cache[key] = (now + (TTL_OK_S if soil else TTL_MISS_S), soil)
    return soil


async def _query_soil(latitude: float, longitude: float) -> dict | None:
    """Query SoilGrids for clay/sand/soil organic carbon at a point."""
    # ISRIC's public endpoint is heavily throttled — keep this a fast,
    # best-effort step (v1 treats a None soil as contextual-only).
    clay, sand, soc = await asyncio.gather(
        _fetch_property("clay", latitude, longitude),
        _fetch_property("sand", latitude, longitude),
        _fetch_property("soc", latitude, longitude),
        return_exceptions=True,
    )

    if not all(isinstance(v, (float, int)) for v in (clay, sand, soc)):
        return None  # no coverage or upstream errors at this point

    clay_f, sand_f, soc_f = float(clay), float(sand), float(soc)
    return {
        "clay_pct": round(clay_f, 1),
        "sand_pct": round(sand_f, 1),
        "soc_pct": round(soc_f, 2),
        "soil_class": classify_soil(clay_f, sand_f, soc_f),
    }
