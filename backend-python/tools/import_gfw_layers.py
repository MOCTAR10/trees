"""Importe les couches vectorielles Global Forest Watch du Gabon dans PostGIS.

Aires protégées (WDPA — parcs nationaux ANPN…), concessions forestières et
concessions minières, téléchargées par l'API GFW (clé ``GFW_API_KEY``) pour
l'emprise du Gabon, puis enregistrées dans ``gfw_features`` (idempotent :
``ON CONFLICT (layer, source_id)``). La carte les affiche et les contrôles
spatiaux peuvent s'en servir hors-ligne.

Usage (depuis le conteneur API) ::

    python -m tools.import_gfw_layers
"""

from __future__ import annotations

import argparse
import asyncio
import json

from app.config import get_settings
from app.services import db, http

API = "https://data-api.globalforestwatch.org"

#: Gabon bounding box (lon/lat) used as the query geometry.
GABON_BBOX = (8.5, -4.2, 14.6, 2.4)

#: layer -> (dataset, SQL). GFW vector tables expose ``gfw_fid`` and the
#: geometry as GeoJSON text in ``gfw_geojson``.
LAYERS: dict[str, tuple[str, str]] = {
    "protected_areas": (
        "wdpa_protected_areas",
        "SELECT gfw_fid, name, desig, iucn_cat, status, gfw_geojson FROM data WHERE iso3 = 'GAB'",
    ),
    "logging_concessions": ("gfw_logging", "SELECT * FROM data WHERE country = 'GAB'"),
    "mining_concessions": (
        "gfw_mining_concessions",
        "SELECT * FROM data WHERE iso3 = 'GAB'",
    ),
}

NAME_FIELDS = ("name", "company", "concession", "nom", "holder", "titulaire")


def _bbox_polygon() -> dict:
    x0, y0, x1, y1 = GABON_BBOX
    return {
        "type": "Polygon",
        "coordinates": [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]],
    }


def to_rows(layer: str, records: list[dict]) -> list[tuple[str, str, str | None, str, str]]:
    """(layer, source_id, name, attrs json, geojson) for records with a geometry."""
    rows = []
    for rec in records:
        geometry = rec.get("gfw_geojson")
        if not geometry:
            continue
        if isinstance(geometry, dict):
            geometry = json.dumps(geometry)
        source_id = str(rec.get("gfw_fid") or rec.get("id") or len(rows))
        name = next((str(rec[f]) for f in NAME_FIELDS if rec.get(f)), None)
        attrs = {
            k: v
            for k, v in rec.items()
            if k not in ("gfw_geojson", "gfw_geostore_id", "gfw_bbox")
            and isinstance(v, (str, int, float, bool))
        }
        rows.append((layer, source_id, name, json.dumps(attrs, ensure_ascii=False), geometry))
    return rows


async def _fetch(dataset: str, sql: str) -> list[dict]:
    resp = await http.request(
        "POST",
        f"{API}/dataset/{dataset}/latest/query/json",
        json={"sql": sql, "geometry": _bbox_polygon()},
        headers={"x-api-key": get_settings().gfw_api_key},
        timeout=120.0,
        retries=1,
        follow_redirects=True,
    )
    if resp.is_error:
        raise RuntimeError(f"{dataset}: HTTP {resp.status_code} {resp.text[:200]}")
    return resp.json().get("data") or []


async def run(only: list[str] | None) -> None:
    if not get_settings().gfw_api_key:
        raise SystemExit("GFW_API_KEY absent : lancez d'abord python -m tools.gfw_api_key")
    try:
        for layer, (dataset, sql) in LAYERS.items():
            if only and layer not in only:
                continue
            try:
                records = await _fetch(dataset, sql)
            except Exception as exc:
                print(f"  {layer:22s} ÉCHEC : {exc}")
                continue
            rows = to_rows(layer, records)
            for row in rows:
                await db.execute(
                    "INSERT INTO gfw_features (layer, source_id, name, attrs, geom)"
                    " VALUES ($1, $2, $3, $4::jsonb,"
                    "  ST_MakeValid(ST_Force2D(ST_SetSRID(ST_GeomFromGeoJSON($5), 4326))))"
                    " ON CONFLICT (layer, source_id) DO UPDATE SET"
                    "  name = EXCLUDED.name, attrs = EXCLUDED.attrs, geom = EXCLUDED.geom,"
                    "  imported_at = now()",
                    *row,
                )
            print(f"  {layer:22s} {len(rows)} entités ({len(records)} reçues)")
    finally:
        await db.close_pool()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--layer", action="append", choices=sorted(LAYERS), help="couche à importer"
    )
    args = parser.parse_args()
    asyncio.run(run(args.layer))


if __name__ == "__main__":
    main()
