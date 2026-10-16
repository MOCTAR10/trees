"""Group (affiliation) endpoint: the caller's company/cooperative and its members."""

from fastapi import APIRouter, Depends, Query

from app.core.deps import get_current_user
from app.services import db

router = APIRouter()

_MEMBER_COLS = "id, email, display_name, role, is_active"


def _company_key(user: dict) -> int | None:
    """Agents carry their manager's account in ``company_id``; the manager is the key itself."""
    return user.get("company_id") or (user["id"] if user.get("role") == "company" else None)


@router.get("")
async def my_group(user: dict = Depends(get_current_user)):
    """Resolve the caller's affiliation (company or cooperative) and members."""
    if user.get("cooperative_id"):
        detail = await db.fetch_one(
            "SELECT id, cooperative_name, profile_type, capacity_kg_per_day, is_certified, "
            "ST_Y(geom) AS latitude, ST_X(geom) AS longitude "
            "FROM community_cooperatives WHERE id=$1",
            user["cooperative_id"],
        )
        members = await db.fetch_all(
            f"SELECT {_MEMBER_COLS} FROM users WHERE cooperative_id=$1 ORDER BY display_name",
            user["cooperative_id"],
        )
        return {
            "type": "cooperative",
            "id": user["cooperative_id"],
            "name": (detail or {}).get("cooperative_name"),
            "detail": dict(detail) if detail else None,
            "members": [dict(m) for m in members],
        }

    company_key = _company_key(user)
    if company_key:
        detail = await db.fetch_one(
            "SELECT u.id, COALESCE(o.name, u.display_name) AS display_name FROM users u"
            " LEFT JOIN organizations o ON o.id = u.organization_id WHERE u.id=$1",
            company_key,
        )
        members = await db.fetch_all(
            f"SELECT {_MEMBER_COLS} FROM users WHERE company_id=$1 ORDER BY display_name",
            company_key,
        )
        return {
            "type": "company",
            "id": company_key,
            "name": (detail or {}).get("display_name"),
            "detail": dict(detail) if detail else None,
            "members": [dict(m) for m in members],
        }

    return {"type": None, "id": None, "name": None, "detail": None, "members": []}


@router.get("/trees")
async def group_trees(
    limit: int = Query(500, ge=1, le=2000),
    user: dict = Depends(get_current_user),
):
    """All tree scans from the caller's company/cooperative, with owner name."""
    rows = await db.fetch_all(
        """
        SELECT ts.id, ts.species_scientific_name, ts.species_confidence,
               ts.measured_dbh_cm, ts.estimated_height_m, ts.estimated_age_years,
               ts.health_status,
               ST_Y(ts.geom) AS latitude, ST_X(ts.geom) AS longitude,
               ts.created_at, u.display_name AS owner_name, u.id AS owner_id,
               ts.co2e_kg, ts.tree_code, ts.forest_checks->>'verdict' AS eudr_verdict
        FROM tree_scans ts
        JOIN users u ON u.id = ts.user_id
        WHERE u.cooperative_id = $1 OR u.company_id = $2 OR u.id = $2
           OR ($4::int IS NOT NULL AND u.organization_id = $4)
        ORDER BY ts.created_at DESC
        LIMIT $3
        """,
        user.get("cooperative_id"),
        _company_key(user),
        limit,
        user.get("organization_id") if user.get("role") != "admin" else None,
    )
    return [dict(r) for r in rows]
