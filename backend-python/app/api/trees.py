"""My-trees endpoint: the caller's own Phase-1 tree scans."""

from fastapi import APIRouter, Depends, Query

from app.core.deps import get_current_user
from app.services import db

router = APIRouter()


@router.get("/my-trees")
async def my_trees(
    limit: int = Query(200, ge=1, le=1000),
    user: dict = Depends(get_current_user),
):
    rows = await db.fetch_all(
        """
        SELECT id, species_scientific_name, species_confidence, measured_dbh_cm,
               estimated_height_m, estimated_age_years, health_status,
               ST_Y(geom) AS latitude, ST_X(geom) AS longitude, created_at
        FROM tree_scans
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT $2
        """,
        user["id"],
        limit,
    )
    return [dict(r) for r in rows]
