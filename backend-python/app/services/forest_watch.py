"""Global Forest Watch checks at a scan point (EUDR & legality context).

For a ~1 ha square around the tree, the GFW Data API answers:

- **Tree-cover loss** by year (Hansen/UMD, canopy ≥ 30 %): loss after the
  EUDR cut-off (31/12/2020) is a deforestation signal;
- **RADD alerts** (Sentinel-1 radar, Wageningen) since the cut-off;
- **Natural forest 2020** (SBTN map), the EUDR baseline;
- **Protected area** (WDPA, e.g. ANPN national parks) and **logging
  concession** overlapping the point;
- **Mapped above-ground biomass** (WHRC 2000), to cross-check measured carbon.

Every check is independent and best effort: a failure reads "unavailable",
never blocks a scan, and the verdict only *warns* — the Ministry decides
(frozen decision 6). Results are cached per ~110 m cell.
"""

from __future__ import annotations

import asyncio
import logging
import time

from app.config import get_settings
from app.services import http

logger = logging.getLogger(__name__)

API = "https://data-api.globalforestwatch.org"
EUDR_CUTOFF_YEAR = 2020
EUDR_CUTOFF_DATE = "2021-01-01"

#: Half side (degrees) of the square queried around the tree (~55 m).
HALF_SIDE_DEG = 0.0005
CELL_DEG = 0.001
TTL_S = 6 * 3600
TIMEOUT_S = 15.0

#: dataset -> SQL. Raster datasets aggregate over the queried square.
CHECKS: dict[str, tuple[str, str]] = {
    "tree_cover_loss": (
        "umd_tree_cover_loss",
        "SELECT umd_tree_cover_loss__year, SUM(area__ha) FROM data"
        " WHERE umd_tree_cover_density_2000__threshold >= 30"
        " GROUP BY umd_tree_cover_loss__year",
    ),
    "radd_alerts": (
        "wur_radd_alerts",
        "SELECT wur_radd_alerts__date, wur_radd_alerts__confidence FROM data"
        f" WHERE wur_radd_alerts__date >= '{EUDR_CUTOFF_DATE}'",
    ),
    "natural_forest": (
        "sbtn_natural_forests_map",
        "SELECT sbtn_natural_forests_map__class, SUM(area__ha) FROM data"
        " GROUP BY sbtn_natural_forests_map__class",
    ),
    "biomass": (
        "whrc_aboveground_biomass_stock_2000",
        'SELECT AVG("whrc_aboveground_biomass_stock_2000__Mg_ha-1") FROM data',
    ),
    "protected_area": ("wdpa_protected_areas", "SELECT name, desig, iucn_cat FROM data"),
    "logging_concession": ("gfw_logging", "SELECT * FROM data LIMIT 3"),
}

_cache: dict[tuple[int, int], tuple[float, dict]] = {}


def clear_cache() -> None:
    _cache.clear()


def enabled() -> bool:
    return bool(get_settings().gfw_api_key)


def _square(latitude: float, longitude: float) -> dict:
    d = HALF_SIDE_DEG
    ring = [
        [longitude - d, latitude - d],
        [longitude + d, latitude - d],
        [longitude + d, latitude + d],
        [longitude - d, latitude + d],
        [longitude - d, latitude - d],
    ]
    return {"type": "Polygon", "coordinates": [ring]}


async def _query(dataset: str, sql: str, geometry: dict) -> list[dict]:
    resp = await http.request(
        "POST",
        f"{API}/dataset/{dataset}/latest/query/json",
        json={"sql": sql, "geometry": geometry},
        headers={"x-api-key": get_settings().gfw_api_key},
        timeout=TIMEOUT_S,
        retries=1,
        follow_redirects=True,  # ``latest`` redirects to the current version
    )
    if resp.is_error:
        raise RuntimeError(f"GFW {dataset} HTTP {resp.status_code}")
    return resp.json().get("data") or []


def _first(row: dict, *suffixes: str):
    """Value of the first column whose name contains one of ``suffixes``."""
    for key, value in row.items():
        if any(s in key.lower() for s in suffixes):
            return value
    return None


def summarize(raw: dict[str, list[dict] | None]) -> dict:
    """Turn raw per-dataset rows into the scan's forest checks + verdict."""
    out: dict = {"source": "Global Forest Watch", "unavailable": []}

    loss = raw.get("tree_cover_loss")
    if loss is None:
        out["unavailable"].append("tree_cover_loss")
        out["loss_years"] = None
    else:
        years = sorted(
            {int(y) for r in loss if (y := _first(r, "loss__year")) not in (None, 0, "0")}
        )
        out["loss_years"] = years
    radd = raw.get("radd_alerts")
    if radd is None:
        out["unavailable"].append("radd_alerts")
        out["radd_alerts"] = None
    else:
        dates = sorted(str(d) for r in radd if (d := _first(r, "__date")))
        out["radd_alerts"] = len(dates)
        out["radd_latest"] = dates[-1] if dates else None

    natural = raw.get("natural_forest")
    if natural is None:
        out["unavailable"].append("natural_forest")
        out["natural_forest_2020"] = None
    else:
        classes = [str(_first(r, "class") or "").lower() for r in natural]
        out["natural_forest_2020"] = any("natural" in c and "non" not in c for c in classes)

    biomass = raw.get("biomass")
    if biomass is None:
        out["unavailable"].append("biomass")
        out["mapped_agb_mg_ha"] = None
    else:
        value = _first(biomass[0], "biomass", "avg") if biomass else None
        out["mapped_agb_mg_ha"] = round(float(value), 1) if value is not None else None

    for key, field in (("protected_area", "name"), ("logging_concession", "company")):
        rows = raw.get(key)
        if rows is None:
            out["unavailable"].append(key)
            out[key] = None
        elif rows:
            row = rows[0]
            out[key] = str(_first(row, field, "name", "nom") or "oui")
        else:
            out[key] = None

    flags: list[str] = []
    if out.get("loss_years") and max(out["loss_years"]) > EUDR_CUTOFF_YEAR:
        flags.append("perte_couvert_apres_2020")
    if out.get("radd_alerts"):
        flags.append("alerte_radd_apres_2020")
    if out.get("protected_area"):
        flags.append("aire_protegee")
    out["flags"] = flags
    if not flags and len(out["unavailable"]) == len(CHECKS):
        out["verdict"] = "indisponible"
    elif {"perte_couvert_apres_2020", "alerte_radd_apres_2020"} & set(flags):
        out["verdict"] = "risque_deforestation"
    elif flags:
        out["verdict"] = "a_verifier"
    else:
        out["verdict"] = "conforme"
    return out


async def check_point(latitude: float, longitude: float) -> dict | None:
    """Forest checks around a point, or ``None`` when GFW is not configured."""
    if not enabled():
        return None
    cell = (round(latitude / CELL_DEG), round(longitude / CELL_DEG))
    hit = _cache.get(cell)
    if hit is not None and hit[0] > time.monotonic():
        return hit[1]
    geometry = _square(latitude, longitude)

    async def run(name: str, dataset: str, sql: str):
        try:
            return name, await _query(dataset, sql, geometry)
        except Exception as exc:
            logger.warning("GFW check %s unavailable: %s", name, exc)
            return name, None

    results = await asyncio.gather(*(run(n, ds, sql) for n, (ds, sql) in CHECKS.items()))
    summary = summarize(dict(results))
    _cache[cell] = (time.monotonic() + TTL_S, summary)
    return summary
