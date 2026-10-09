"""Company interface: own residues + allocation to community cooperatives."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.deps import require_roles
from app.services import db

router = APIRouter()


@router.get("/residues")
async def my_residues(company: dict = Depends(require_roles("company"))):
    rows = await db.fetch_all(
        """
        SELECT id, species_scientific_name, measured_dbh_cm, estimated_height_m,
               (coalesce(weight_branches_fine_kg, 0) + coalesce(weight_branches_thick_kg, 0)
                + coalesce(weight_bark_kg, 0) + coalesce(weight_foliar_kg, 0)
                + coalesce(weight_roots_kg, 0)) AS residue_biomass_kg,
               status, assigned_community_cooperative_id,
               ST_Y(geom) AS latitude, ST_X(geom) AS longitude, created_at
        FROM tree_scans_and_residues
        WHERE logging_company_id = $1
        ORDER BY created_at DESC
        LIMIT 200
        """,
        company["id"],
    )
    return [dict(r) for r in rows]


@router.get("/cooperatives")
async def list_cooperatives(company: dict = Depends(require_roles("company"))):
    rows = await db.fetch_all(
        """
        SELECT id, cooperative_name, profile_type, capacity_kg_per_day, is_certified,
               ST_Y(geom) AS latitude, ST_X(geom) AS longitude
        FROM community_cooperatives
        ORDER BY cooperative_name
        """
    )
    return [dict(r) for r in rows]


class AllocateRequest(BaseModel):
    cooperative_id: int


@router.post("/residues/{residue_id}/allocate")
async def allocate(
    residue_id: int,
    body: AllocateRequest,
    company: dict = Depends(require_roles("company")),
):
    cooperative = await db.fetch_one(
        "SELECT id, cooperative_name, profile_type, is_certified "
        "FROM community_cooperatives WHERE id=$1",
        body.cooperative_id,
    )
    if cooperative is None:
        raise HTTPException(status_code=404, detail="Coopérative introuvable")

    updated = await db.fetch_one(
        """
        UPDATE tree_scans_and_residues
        SET status='allocated', assigned_community_cooperative_id=$1
        WHERE id=$2 AND logging_company_id=$3 AND status='available'
        RETURNING id, status, assigned_community_cooperative_id
        """,
        body.cooperative_id,
        residue_id,
        company["id"],
    )
    if updated is None:
        raise HTTPException(
            status_code=409,
            detail="Résidu introuvable, déjà traité, ou non détenu par votre compte",
        )
    return {
        "id": updated["id"],
        "status": updated["status"],
        "assigned_community_cooperative_id": updated["assigned_community_cooperative_id"],
        "cooperative": dict(cooperative),
    }
