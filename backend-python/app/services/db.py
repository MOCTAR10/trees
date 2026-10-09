"""Async PostgreSQL access (asyncpg) with PostGIS helpers."""

import asyncpg

from app.config import get_settings

_pool: asyncpg.Pool | None = None


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        url = get_settings().database_url.replace("postgresql+asyncpg://", "postgresql://")
        _pool = await asyncpg.create_pool(url, min_size=1, max_size=5)
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


async def fetch_one(sql: str, *args) -> asyncpg.Record | None:
    pool = await get_pool()
    return await pool.fetchrow(sql, *args)


async def fetch_all(sql: str, *args) -> list[asyncpg.Record]:
    pool = await get_pool()
    return await pool.fetch(sql, *args)


async def execute(sql: str, *args) -> str:
    pool = await get_pool()
    return await pool.execute(sql, *args)


async def find_cooperatives_near(
    latitude: float,
    longitude: float,
    radius_km: float = 15.0,
    certified_only: bool = False,
) -> list[asyncpg.Record]:
    """Certified cooperatives within radius via PostGIS ST_DWithin (meters)."""
    certified_clause = "AND is_certified = TRUE" if certified_only else ""
    sql = f"""
        SELECT id, cooperative_name, profile_type, capacity_kg_per_day, is_certified,
               ST_Y(geom) AS latitude, ST_X(geom) AS longitude,
               ST_Distance(
                   geom::geography,
                   ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography
               ) / 1000.0 AS distance_km
        FROM community_cooperatives
        WHERE ST_DWithin(
                  geom::geography,
                  ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
                  $3 * 1000.0
              )
              {certified_clause}
        ORDER BY distance_km ASC
    """
    return await fetch_all(sql, latitude, longitude, radius_km)
