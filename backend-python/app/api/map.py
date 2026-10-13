"""Map 2.0: layers, GFW tiles, point checks and the national Gabon context."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.deps import get_current_user
from app.services import db, forest_watch

router = APIRouter()

CONTEXT_FILE = Path(__file__).resolve().parents[2] / "data" / "gabon_context.json"

#: Public GFW raster tile layers (no key) usable as map overlays.
GFW_TILES = [
    {
        "key": "tree_cover_loss",
        "label": "Perte de couvert arboré (2001-…)",
        "url": "https://tiles.globalforestwatch.org/umd_tree_cover_loss/latest/tcd_30/{z}/{x}/{y}.png",
        "source": "UMD / Hansen — Global Forest Watch",
    },
    {
        "key": "radd_alerts",
        "label": "Alertes de déforestation RADD (radar)",
        "url": "https://tiles.globalforestwatch.org/wur_radd_alerts/latest/default/{z}/{x}/{y}.png",
        "source": "Wageningen University — Global Forest Watch",
    },
]

#: Imported GFW vector layers shown on the map (see tools.import_gfw_layers).
VECTOR_LAYERS = {
    "protected_areas": "Aires protégées (WDPA)",
    "logging_concessions": "Concessions forestières",
    "mining_concessions": "Concessions minières",
}

#: Feature cap per layer (simplified geometries keep the payload light).
MAX_FEATURES = 500
SIMPLIFY_DEG = 0.002


@lru_cache
def _context() -> dict:
    return json.loads(CONTEXT_FILE.read_text(encoding="utf-8"))


@router.get("/context")
async def national_context(user: dict = Depends(get_current_user)):
    """Key national figures for Gabon (GFW country statistics)."""
    try:
        return _context()
    except (OSError, ValueError) as exc:
        raise HTTPException(status_code=503, detail="Contexte national indisponible") from exc


@router.get("/tiles")
async def tile_layers(user: dict = Depends(get_current_user)):
    return GFW_TILES


def _feature(row: dict, layer: str) -> dict:
    props = {k: v for k, v in row.items() if k != "geojson"}
    props["layer"] = layer
    return {"type": "Feature", "geometry": json.loads(row["geojson"]), "properties": props}


@router.get("/layers")
async def map_layers(user: dict = Depends(get_current_user)):
    """Annual cut blocks (with title/holder) and imported GFW vector layers."""
    aacs = await db.fetch_all(
        f"""
        SELECT a.id, a.label, a.status, a.campaign_year, ft.reference AS title_ref,
               o.name AS holder,
               ST_AsGeoJSON(ST_SimplifyPreserveTopology(a.geom, {SIMPLIFY_DEG})) AS geojson
        FROM annual_cut_blocks a
        JOIN management_units mu ON mu.id = a.ufa_id
        JOIN forest_titles ft ON ft.id = mu.title_id
        LEFT JOIN organizations o ON o.id = ft.holder_org_id
        WHERE a.geom IS NOT NULL
        LIMIT {MAX_FEATURES}
        """
    )
    layers = {"aac": [_feature(dict(r), "aac") for r in aacs]}
    rows = await db.fetch_all(
        f"""
        SELECT layer, name, attrs,
               ST_AsGeoJSON(ST_SimplifyPreserveTopology(geom, {SIMPLIFY_DEG})) AS geojson
        FROM gfw_features
        ORDER BY layer, id
        LIMIT {MAX_FEATURES * len(VECTOR_LAYERS)}
        """
    )
    for row in rows:
        r = dict(row)
        r["attrs"] = r["attrs"] if isinstance(r["attrs"], dict) else json.loads(r["attrs"] or "{}")
        layers.setdefault(r["layer"], []).append(_feature(r, r["layer"]))
    return {
        "labels": {"aac": "Assiettes annuelles de coupe (AAC)", **VECTOR_LAYERS},
        "layers": {k: {"type": "FeatureCollection", "features": v} for k, v in layers.items()},
    }


@router.get("/point-check")
async def point_check(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    user: dict = Depends(get_current_user),
):
    """GFW forest checks at any map point (long-press on the map)."""
    checks = await forest_watch.check_point(lat, lon)
    if checks is None:
        raise HTTPException(
            status_code=503, detail="Global Forest Watch non configuré (GFW_API_KEY)"
        )
    local = await db.fetch_all(
        "SELECT layer, name FROM gfw_features"
        " WHERE ST_Covers(geom, ST_SetSRID(ST_MakePoint($1, $2), 4326)) LIMIT 10",
        lon,
        lat,
    )
    return {**checks, "local_layers": [dict(r) for r in local]}
