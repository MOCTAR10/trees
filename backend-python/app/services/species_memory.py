"""Local memory of species: GBIF answers cached by area, identifications remembered.

Each identification and each GBIF occurrence check is kept in PostgreSQL, so the
platform leans less on external services over time and the local species base grows
with use. Everything here is best-effort: a database problem never breaks a scan.
"""

from __future__ import annotations

import logging

from app.services import db

logger = logging.getLogger(__name__)

CELL_DEGREES = 0.5
CACHE_DAYS = 120
LEARN_MIN_SCORE = 0.3


def cell(latitude: float, longitude: float) -> tuple[float, float]:
    """Centre of the 0.5° grid cell holding the point."""
    return (
        round((latitude // CELL_DEGREES) * CELL_DEGREES + CELL_DEGREES / 2, 3),
        round((longitude // CELL_DEGREES) * CELL_DEGREES + CELL_DEGREES / 2, 3),
    )


async def cached_occurrences(name: str, latitude: float, longitude: float) -> int | None:
    lat, lon = cell(latitude, longitude)
    try:
        row = await db.fetch_one(
            "SELECT occurrences FROM species_occurrence_cache"
            " WHERE scientific_name = $1 AND cell_lat = $2 AND cell_lon = $3"
            " AND checked_at > now() - make_interval(days => $4)",
            name,
            lat,
            lon,
            CACHE_DAYS,
        )
    except Exception as exc:
        logger.warning("occurrence cache read skipped: %s", exc)
        return None
    return int(row["occurrences"]) if row else None


async def store_occurrences(name: str, latitude: float, longitude: float, count: int) -> None:
    lat, lon = cell(latitude, longitude)
    try:
        await db.execute(
            "INSERT INTO species_occurrence_cache (scientific_name, cell_lat, cell_lon, occurrences)"
            " VALUES ($1, $2, $3, $4)"
            " ON CONFLICT (scientific_name, cell_lat, cell_lon)"
            " DO UPDATE SET occurrences = EXCLUDED.occurrences, checked_at = now()",
            name,
            lat,
            lon,
            int(count),
        )
    except Exception as exc:
        logger.warning("occurrence cache write skipped: %s", exc)


async def learn(
    name: str | None,
    score: float | None,
    latitude: float | None,
    longitude: float | None,
    family: str | None = None,
    common_names: list[str] | None = None,
) -> None:
    """Remember an identified species (confident results only)."""
    if not name or score is None or score < LEARN_MIN_SCORE:
        return
    try:
        await db.execute(
            "INSERT INTO species_learned"
            " (scientific_name, family, common_names, seen_count, best_score, last_latitude, last_longitude)"
            " VALUES ($1, $2, $3::text[], 1, $4, $5, $6)"
            " ON CONFLICT (scientific_name) DO UPDATE SET"
            " seen_count = species_learned.seen_count + 1,"
            " last_seen = now(),"
            " family = COALESCE(species_learned.family, EXCLUDED.family),"
            " common_names = (SELECT COALESCE(array_agg(DISTINCT n), '{}')"
            "   FROM unnest(species_learned.common_names || EXCLUDED.common_names) AS n),"
            " best_score = GREATEST(species_learned.best_score, EXCLUDED.best_score),"
            " last_latitude = COALESCE(EXCLUDED.last_latitude, species_learned.last_latitude),"
            " last_longitude = COALESCE(EXCLUDED.last_longitude, species_learned.last_longitude)",
            name,
            family,
            list(common_names or [])[:8],
            float(score),
            latitude,
            longitude,
        )
    except Exception as exc:
        logger.warning("species memory write skipped: %s", exc)


async def learned(limit: int = 100) -> list[dict]:
    rows = await db.fetch_all(
        "SELECT scientific_name, family, common_names, seen_count, best_score, first_seen, last_seen"
        " FROM species_learned ORDER BY seen_count DESC, last_seen DESC LIMIT $1",
        limit,
    )
    return [dict(r) for r in rows]
