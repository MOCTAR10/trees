"""Importe les 9 provinces du Gabon (ADM1) dans ``admin_areas``.

Source ouverte : geoBoundaries (gbOpen, licence CC BY-SA 3.0 pour le Gabon,
attribution « geoBoundaries »). La province d'un titre est ensuite déduite de
sa géométrie (plus grand recouvrement), sauf correction par le Ministère.
Idempotent (``ON CONFLICT (code)``).

Usage (depuis le conteneur API) ::

    python -m tools.import_provinces
    python -m tools.import_provinces --file provinces.geojson   # hors-ligne
"""

from __future__ import annotations

import argparse
import asyncio
import json

import httpx

from app.services import db

API = "https://www.geoboundaries.org/api/current/gbOpen/GAB/ADM1/"
SOURCE = "geoBoundaries gbOpen GAB ADM1"


async def _download() -> tuple[dict, str]:
    async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
        meta = (await client.get(API)).raise_for_status().json()
        url = meta.get("simplifiedGeometryGeoJSON") or meta["gjDownloadURL"]
        data = (await client.get(url)).raise_for_status().json()
        return data, meta.get("boundaryLicense") or "voir geoboundaries.org"


def provinces(collection: dict) -> list[dict]:
    """(code, name, geometry) of each ADM1 feature, names cleaned."""
    rows = []
    for feature in collection.get("features", []):
        props = feature.get("properties") or {}
        code = (props.get("shapeISO") or "").strip()
        name = (props.get("shapeName") or "").strip()
        if not code or not name or not feature.get("geometry"):
            continue
        rows.append({"code": code, "name": name, "geometry": feature["geometry"]})
    return rows


async def run(path: str | None) -> int:
    if path:
        with open(path, encoding="utf-8") as fh:
            collection, license_ = json.load(fh), "CC BY-SA 3.0 (geoBoundaries)"
    else:
        collection, license_ = await _download()
    rows = provinces(collection)
    try:
        for row in rows:
            await db.execute(
                """
                INSERT INTO admin_areas (level, code, name, geom, source, license)
                VALUES (1, $1, $2, ST_Multi(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($3), 4326))), $4, $5)
                ON CONFLICT (code) DO UPDATE
                   SET name = EXCLUDED.name, geom = EXCLUDED.geom, source = EXCLUDED.source,
                       license = EXCLUDED.license, imported_at = now()
                """,
                row["code"],
                row["name"],
                json.dumps(row["geometry"]),
                SOURCE,
                license_,
            )
    finally:
        await db.close_pool()
    print(f"{len(rows)} provinces importées ({license_}).")
    return len(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--file", help="GeoJSON ADM1 local (sinon téléchargement geoBoundaries)")
    args = parser.parse_args()
    asyncio.run(run(args.file))


if __name__ == "__main__":
    main()
