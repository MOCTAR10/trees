"""Map 2.0: layers, GFW tiles, point checks and the national Gabon context."""

from __future__ import annotations

import json
import time
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

#: Feature cap per layer and request.
MAX_FEATURES = 400

#: GeoJSON coordinate precision (5 decimals ≈ 1 m).
PRECISION = 5

#: Simplification tolerance (degrees) per zoom band: a country view needs
#: ~2 km detail, a parcel view ~20 m. Keeps payloads at a few hundred KB.
TOLERANCES = ((6, 0.02), (8, 0.008), (10, 0.002), (12, 0.0007), (99, 0.0002))

#: Short label shown under a feature's name, per layer.
SUBTITLE_SQL = {
    "protected_areas": "coalesce(attrs->>'desig', '')",
    "logging_concessions": "coalesce(attrs->>'company', '')",
    "mining_concessions": "coalesce(attrs->>'company', attrs->>'mineral', '')",
}

_cache: dict[tuple, tuple[float, dict]] = {}
CACHE_TTL_S = 600
CACHE_MAX = 128


def tolerance_for(zoom: float) -> float:
    for max_zoom, tol in TOLERANCES:
        if zoom <= max_zoom:
            return tol
    return TOLERANCES[-1][1]


def parse_bbox(raw: str | None) -> tuple[float, float, float, float] | None:
    """``west,south,east,north`` in degrees, or ``None``."""
    if not raw:
        return None
    try:
        w, s_, e, n = (float(v) for v in raw.split(","))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="bbox attendu : ouest,sud,est,nord") from exc
    if not (-180 <= w < e <= 180 and -90 <= s_ < n <= 90):
        raise HTTPException(status_code=422, detail="bbox hors limites")
    return w, s_, e, n


def _feature(row: dict, layer: str) -> dict:
    props = {k: v for k, v in row.items() if k != "geojson"}
    props["layer"] = layer
    return {"type": "Feature", "geometry": json.loads(row["geojson"]), "properties": props}


def _envelope_sql(bbox, first_param: int, column: str = "geom") -> tuple[str, list]:
    if bbox is None:
        return "", []
    p = first_param
    return (
        f" AND {column} && ST_MakeEnvelope(${p}, ${p + 1}, ${p + 2}, ${p + 3}, 4326)",
        list(bbox),
    )


async def _aac_features(bbox, tol: float) -> list[dict]:
    where, params = _envelope_sql(bbox, 1, "a.geom")
    rows = await db.fetch_all(
        f"""
        SELECT a.id, a.label AS name, a.status AS subtitle, ft.reference AS title_ref,
               o.name AS holder,
               ST_AsGeoJSON(ST_SimplifyPreserveTopology(a.geom, {tol}), {PRECISION}) AS geojson
        FROM annual_cut_blocks a
        JOIN management_units mu ON mu.id = a.ufa_id
        JOIN forest_titles ft ON ft.id = mu.title_id
        LEFT JOIN organizations o ON o.id = ft.holder_org_id
        WHERE a.geom IS NOT NULL{where}
        LIMIT {MAX_FEATURES}
        """,
        *params,
    )
    return [_feature(dict(r), "aac") for r in rows]


async def _gfw_features(layer: str, bbox, tol: float) -> list[dict]:
    where, params = _envelope_sql(bbox, 2)
    rows = await db.fetch_all(
        f"""
        SELECT id, name, {SUBTITLE_SQL.get(layer, "''")} AS subtitle,
               ST_AsGeoJSON(ST_SimplifyPreserveTopology(geom, {tol}), {PRECISION}) AS geojson
        FROM gfw_features
        WHERE layer = $1{where}
        ORDER BY ST_Area(geom) DESC
        LIMIT {MAX_FEATURES}
        """,
        layer,
        *params,
    )
    return [_feature(dict(r), layer) for r in rows if r["geojson"]]


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


@router.get("/layers")
async def map_layers(
    zoom: float = Query(6, ge=0, le=22),
    bbox: str | None = Query(None, description="ouest,sud,est,nord"),
    layers: str | None = Query(None, description="couches demandées (virgules)"),
    user: dict = Depends(get_current_user),
):
    """Vector layers for the visible map area, simplified for the zoom level."""
    box = parse_bbox(bbox)
    tol = tolerance_for(zoom)
    wanted = [k for k in (layers.split(",") if layers else ["aac", *VECTOR_LAYERS]) if k]
    key = (tuple(wanted), tol, tuple(round(v, 2) for v in box) if box else None)
    hit = _cache.get(key)
    if hit is not None and hit[0] > time.monotonic():
        return hit[1]
    out: dict[str, list[dict]] = {}
    for layer in wanted:
        if layer == "aac":
            out[layer] = await _aac_features(box, tol)
        elif layer in VECTOR_LAYERS:
            out[layer] = await _gfw_features(layer, box, tol)
    counts = {
        r["layer"]: r["n"]
        for r in await db.fetch_all("SELECT layer, count(*) AS n FROM gfw_features GROUP BY layer")
    }
    body = {
        "labels": {"aac": "Assiettes annuelles de coupe (AAC)", **VECTOR_LAYERS},
        "counts": counts,
        "tolerance": tol,
        "layers": {k: {"type": "FeatureCollection", "features": v} for k, v in out.items()},
    }
    if len(_cache) >= CACHE_MAX:
        _cache.clear()
    _cache[key] = (time.monotonic() + CACHE_TTL_S, body)
    return body


@router.get("/feature/{layer}/{feature_id}")
async def feature_detail(layer: str, feature_id: int, user: dict = Depends(get_current_user)):
    """Full attributes of one map feature (loaded on tap)."""
    if layer == "aac":
        row = await db.fetch_one(
            """
            SELECT a.id, a.label AS name, a.status, a.campaign_year, a.surface_ha,
                   a.possibility_m3, ft.reference AS title_ref, ft.title_type,
                   o.name AS holder, ST_Area(a.geom::geography) / 10000 AS area_ha,
                   ST_Y(ST_Centroid(a.geom)) AS lat, ST_X(ST_Centroid(a.geom)) AS lon
            FROM annual_cut_blocks a
            JOIN management_units mu ON mu.id = a.ufa_id
            JOIN forest_titles ft ON ft.id = mu.title_id
            LEFT JOIN organizations o ON o.id = ft.holder_org_id
            WHERE a.id = $1
            """,
            feature_id,
        )
    elif layer in VECTOR_LAYERS:
        row = await db.fetch_one(
            """
            SELECT id, layer, name, attrs, ST_Area(geom::geography) / 10000 AS area_ha,
                   ST_Y(ST_PointOnSurface(geom)) AS lat, ST_X(ST_PointOnSurface(geom)) AS lon
            FROM gfw_features WHERE id = $1 AND layer = $2
            """,
            feature_id,
            layer,
        )
    else:
        raise HTTPException(status_code=404, detail="Couche inconnue")
    if row is None:
        raise HTTPException(status_code=404, detail="Entité introuvable")
    out = dict(row)
    if isinstance(out.get("attrs"), str):
        out["attrs"] = json.loads(out["attrs"] or "{}")
    out["layer"] = layer
    if out.get("area_ha") is not None:
        out["area_ha"] = round(float(out["area_ha"]), 1)
    return out


@router.get("/search")
async def search(
    q: str = Query(..., min_length=2, max_length=80),
    user: dict = Depends(get_current_user),
):
    """Find parks, concessions, AAC, titles and registry trees by name/code."""
    like = f"%{q.strip()}%"
    rows = await db.fetch_all(
        """
        (SELECT 'gfw' AS kind, layer, id, name, coalesce(attrs->>'company', attrs->>'desig') AS subtitle,
                ST_Y(ST_PointOnSurface(geom)) AS lat, ST_X(ST_PointOnSurface(geom)) AS lon,
                ST_XMin(geom) AS west, ST_YMin(geom) AS south, ST_XMax(geom) AS east, ST_YMax(geom) AS north
         FROM gfw_features
         WHERE name ILIKE $1 OR attrs->>'company' ILIKE $1
         LIMIT 8)
        UNION ALL
        (SELECT 'aac', 'aac', a.id, a.label, ft.reference,
                ST_Y(ST_Centroid(a.geom)), ST_X(ST_Centroid(a.geom)),
                ST_XMin(a.geom), ST_YMin(a.geom), ST_XMax(a.geom), ST_YMax(a.geom)
         FROM annual_cut_blocks a
         JOIN management_units mu ON mu.id = a.ufa_id
         JOIN forest_titles ft ON ft.id = mu.title_id
         WHERE a.geom IS NOT NULL AND (a.label ILIKE $1 OR ft.reference ILIKE $1)
         LIMIT 5)
        UNION ALL
        (SELECT 'tree', 'tree', NULL, tr.tree_code, tr.species_scientific_name,
                ST_Y(coalesce(tr.stump_geom, tr.geom)), ST_X(coalesce(tr.stump_geom, tr.geom)),
                NULL, NULL, NULL, NULL
         FROM tree_registry tr
         WHERE tr.tree_code ILIKE $1 AND coalesce(tr.stump_geom, tr.geom) IS NOT NULL
         LIMIT 5)
        """,
        like,
    )
    return [dict(r) for r in rows]


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
