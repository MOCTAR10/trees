"""Accueil: what the signed-in person needs at a glance."""

import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.deps import get_current_user
from app.services import db

router = APIRouter()


#: Accueil filter periods: key -> SQL condition on a ``created_at`` column.
_LOCAL_DAY = "({col} AT TIME ZONE 'Africa/Libreville')::date = (now() AT TIME ZONE 'Africa/Libreville')::date"
PERIODS = {
    "today": _LOCAL_DAY,
    "week": "{col} >= now() - interval '7 days'",
    "month": "{col} >= now() - interval '30 days'",
    "all": "TRUE",
}


def full_name(user: dict) -> str | None:
    parts = [p.strip() for p in (user.get("first_name"), user.get("last_name")) if p and p.strip()]
    return " ".join(parts) or None


async def _group(user: dict) -> dict | None:
    """The person's company or cooperative, its team size and this week's scans."""
    if user.get("cooperative_id"):
        name_row = await db.fetch_one(
            "SELECT cooperative_name AS name FROM community_cooperatives WHERE id=$1",
            user["cooperative_id"],
        )
        member_filter, key = "u.cooperative_id = $1", user["cooperative_id"]
        kind = "cooperative"
    elif user.get("company_id"):
        name_row = await db.fetch_one(
            "SELECT COALESCE(o.name, u.display_name) AS name FROM users u"
            " LEFT JOIN organizations o ON o.id = u.organization_id WHERE u.id=$1",
            user["company_id"],
        )
        member_filter, key = "u.company_id = $1", user["company_id"]
        kind = "company"
    else:
        return None
    counts = ",\n".join(
        f"COUNT(*) FILTER (WHERE {cond.format(col='ts.created_at')}) AS trees_{name}"
        for name, cond in PERIODS.items()
    )
    stats = await db.fetch_one(
        f"""
        SELECT
          (SELECT COUNT(*) FROM users u WHERE {member_filter} AND u.is_active) AS members,
          (SELECT row_to_json(x) FROM (
             SELECT {counts}
             FROM tree_scans ts JOIN users u ON u.id = ts.user_id
             WHERE {member_filter}
          ) x) AS trees_by_period
        """,
        key,
    )
    stats = dict(stats or {})
    by_period = _json(stats.get("trees_by_period"))
    trees = {name: int(by_period.get(f"trees_{name}") or 0) for name in PERIODS}
    return {
        "type": kind,
        "name": (name_row or {}).get("name"),
        "members": stats.get("members") or 0,
        "trees": trees["all"],
        "trees_week": trees["week"],
        "trees_by_period": trees,
    }


def _json(value) -> dict:
    if isinstance(value, dict):
        return value
    if isinstance(value, str) and value:
        return json.loads(value)
    return {}


async def _projects(user: dict) -> dict:
    mine = await db.fetch_all(
        """
        SELECT p.id, p.title, p.kind, p.participation, p.objective, p.status,
               p.target_type, p.target_value, pp.status AS my_status, p.aac_id,
               (SELECT b.label FROM annual_cut_blocks b WHERE b.id = p.aac_id) AS aac_label,
               (SELECT COUNT(*) FROM tree_registry r WHERE r.aac_id = p.aac_id) AS registry_trees,
               (SELECT COUNT(DISTINCT ts.tree_code) FROM tree_scans ts
                  JOIN tree_registry r ON r.tree_code = ts.tree_code
                 WHERE ts.project_id = p.id AND r.aac_id = p.aac_id) AS registry_scanned,
               (SELECT COUNT(*) FROM tree_scans ts
                 WHERE ts.project_id = p.id AND ts.user_id = $1) AS my_scans,
               (SELECT COUNT(*) FROM tree_scans ts WHERE ts.project_id = p.id) AS scans,
               (SELECT COUNT(*) FROM project_participants x
                 WHERE x.project_id = p.id AND x.status = 'active') AS participants
        FROM project_participants pp
        JOIN projects p ON p.id = pp.project_id
        WHERE pp.user_id = $1 AND pp.status IN ('active', 'invited') AND p.status = 'open'
        ORDER BY pp.status = 'invited' DESC, p.created_at DESC
        """,
        user["id"],
    )
    available = await db.fetch_all(
        """
        SELECT p.id, p.title, p.kind, p.participation, p.objective, p.status,
               p.target_type, p.target_value,
               (SELECT COUNT(*) FROM tree_scans ts WHERE ts.project_id = p.id) AS scans,
               (SELECT COUNT(*) FROM project_participants x
                 WHERE x.project_id = p.id AND x.status = 'active') AS participants
        FROM projects p
        WHERE p.status = 'open' AND p.participation = 'open'
          AND NOT EXISTS (SELECT 1 FROM project_participants pp
                           WHERE pp.project_id = p.id AND pp.user_id = $1)
        ORDER BY p.created_at DESC
        LIMIT 5
        """,
        user["id"],
    )
    available_count = await db.fetch_one(
        """
        SELECT COUNT(*) AS n FROM projects p
        WHERE p.status = 'open' AND p.participation = 'open'
          AND NOT EXISTS (SELECT 1 FROM project_participants pp
                           WHERE pp.project_id = p.id AND pp.user_id = $1)
        """,
        user["id"],
    )
    rows = [dict(r) for r in mine]
    return {
        "available_count": (available_count or {}).get("n") or 0,
        "invitations": [r for r in rows if r["my_status"] == "invited"],
        "joined": [r for r in rows if r["my_status"] == "active"],
        "available": [dict(r) for r in available],
    }


@router.get("/summary")
async def summary(user: dict = Depends(get_current_user)):
    columns = []
    for name, cond in PERIODS.items():
        where = cond.format(col="created_at")
        columns += [
            f"COUNT(*) FILTER (WHERE {where}) AS {name}_count",
            f"COUNT(DISTINCT species_scientific_name) FILTER (WHERE {where}) AS {name}_species",
            f"COALESCE(SUM(co2e_kg) FILTER (WHERE {where}), 0) AS {name}_co2e_kg",
            f"COUNT(project_id) FILTER (WHERE {where}) AS {name}_for_projects",
        ]
    row = await db.fetch_one(
        f"SELECT {', '.join(columns)}, MAX(created_at) AS last_at FROM tree_scans WHERE user_id = $1",
        user["id"],
    )
    row = dict(row or {})
    periods = {
        name: {
            "count": row.get(f"{name}_count") or 0,
            "species": row.get(f"{name}_species") or 0,
            "co2e_kg": float(row.get(f"{name}_co2e_kg") or 0),
            "for_projects": row.get(f"{name}_for_projects") or 0,
        }
        for name in PERIODS
    }
    return {
        "person": {
            "first_name": user.get("first_name"),
            "last_name": user.get("last_name"),
            "full_name": full_name(user),
            "matricule": user.get("matricule"),
            "display_name": user.get("display_name"),
            "role": user.get("role"),
        },
        "scans": {
            "total": periods["all"]["count"],
            "today": periods["today"]["count"],
            "week": periods["week"]["count"],
            "species": periods["all"]["species"],
            "co2e_kg": periods["all"]["co2e_kg"],
            "for_projects": periods["all"]["for_projects"],
            "last_at": row.get("last_at"),
            "periods": periods,
        },
        "group": await _group(user),
        "projects": await _projects(user),
    }


class NamesUpdate(BaseModel):
    first_name: str = Field(..., min_length=1, max_length=80)
    last_name: str = Field(..., min_length=1, max_length=80)


@router.patch("/me")
async def update_my_names(body: NamesUpdate, user: dict = Depends(get_current_user)):
    """The person corrects their own first / last name (matricule stays with the admin).

    For an operator the display name follows the person's name; a company or
    cooperative account keeps its organisation display name.
    """
    first, last = body.first_name.strip(), body.last_name.strip()
    if not first or not last:
        raise HTTPException(status_code=422, detail="Prénom et nom requis")
    display = f"{first} {last}" if user["role"] == "operator" else user["display_name"]
    row = await db.fetch_one(
        "UPDATE users SET first_name=$2, last_name=$3, display_name=$4 WHERE id=$1 "
        "RETURNING id, first_name, last_name, matricule, display_name",
        user["id"],
        first,
        last,
        display,
    )
    return dict(row)
