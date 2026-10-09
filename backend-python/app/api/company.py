"""Company interface: own residues + allocation to community cooperatives."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core import profiles
from app.core.deps import require_roles
from app.services import db

router = APIRouter()

_RESIDUE_COLS = (
    "id, species_scientific_name, measured_dbh_cm, estimated_height_m, "
    "weight_branches_fine_kg, weight_branches_thick_kg, weight_bark_kg, "
    "weight_foliar_kg, weight_roots_kg, volume_stump_m3, "
    "status, assigned_community_cooperative_id, "
    "ST_Y(geom) AS latitude, ST_X(geom) AS longitude, created_at"
)


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
async def list_cooperatives(
    residue_id: int | None = None,
    company: dict = Depends(require_roles("company")),
):
    rows = await db.fetch_all(
        """
        SELECT id, cooperative_name, profile_type, capacity_kg_per_day, is_certified,
               ST_Y(geom) AS latitude, ST_X(geom) AS longitude
        FROM community_cooperatives
        ORDER BY cooperative_name
        """
    )
    cooperatives = [dict(r) for r in rows]

    if residue_id is not None:
        residue = await db.fetch_one(
            f"SELECT {_RESIDUE_COLS} FROM tree_scans_and_residues "
            "WHERE id=$1 AND logging_company_id=$2",
            residue_id,
            company["id"],
        )
        if residue is None:
            raise HTTPException(status_code=404, detail="Résidu introuvable")
        residue_row = dict(residue)
        for coop in cooperatives:
            coop["relevant_mass_kg"] = profiles.profile_relevant_mass(
                residue_row, coop["profile_type"]
            )
            coop["match_score"] = profiles.match_score(residue_row, coop["profile_type"])
        cooperatives.sort(key=lambda c: (-c["match_score"], c["cooperative_name"]))
    return cooperatives


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
        WHERE id=$2 AND logging_company_id=$3 AND status IN ('available', 'allocated')
        RETURNING id, status, assigned_community_cooperative_id
        """,
        body.cooperative_id,
        residue_id,
        company["id"],
    )
    if updated is None:
        raise HTTPException(
            status_code=409,
            detail="Résidu introuvable, déjà collecté, ou non détenu par votre compte",
        )
    return {
        "id": updated["id"],
        "status": updated["status"],
        "assigned_community_cooperative_id": updated["assigned_community_cooperative_id"],
        "cooperative": dict(cooperative),
    }


@router.post("/residues/{residue_id}/release")
async def release(
    residue_id: int,
    company: dict = Depends(require_roles("company")),
):
    updated = await db.fetch_one(
        """
        UPDATE tree_scans_and_residues
        SET status='available', assigned_community_cooperative_id=NULL
        WHERE id=$1 AND logging_company_id=$2 AND status='allocated'
        RETURNING id, status, assigned_community_cooperative_id
        """,
        residue_id,
        company["id"],
    )
    if updated is None:
        raise HTTPException(
            status_code=409,
            detail="Résidu introuvable, non alloué, ou non détenu par votre compte",
        )
    return dict(updated)
