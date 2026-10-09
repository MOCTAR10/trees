"""Cooperative interface: nearby residues + collect confirmation."""

from fastapi import APIRouter, Depends, HTTPException

from app.core import profiles
from app.core.deps import require_roles
from app.services import db

router = APIRouter()

DEFAULT_RADIUS_KM = 15.0


async def _profile_type(cooperative: dict) -> str | None:
    cooperative_id = cooperative.get("cooperative_id")
    if cooperative_id is None:
        return None
    row = await db.fetch_one(
        "SELECT profile_type FROM community_cooperatives WHERE id=$1", cooperative_id
    )
    return row["profile_type"] if row else None


@router.get("/residues")
async def nearby_residues(
    latitude: float,
    longitude: float,
    radius_km: float = DEFAULT_RADIUS_KM,
    only_matching: bool = False,
    cooperative: dict = Depends(require_roles("cooperative")),
):
    profile_type = await _profile_type(cooperative)
    rows = await db.fetch_all(
        """
        SELECT r.id, r.species_scientific_name, r.measured_dbh_cm, r.estimated_height_m,
               r.weight_branches_fine_kg, r.weight_branches_thick_kg, r.weight_foliar_kg,
               r.weight_bark_kg, r.weight_roots_kg, r.volume_stump_m3,
               r.status, r.assigned_community_cooperative_id,
               (r.assigned_community_cooperative_id = $4) AS assigned_to_me,
               ST_Y(r.geom) AS latitude, ST_X(r.geom) AS longitude,
               ST_Distance(
                   r.geom::geography,
                   ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography
               ) / 1000.0 AS distance_km
        FROM tree_scans_and_residues r
        WHERE r.status IN ('available', 'allocated')
          AND ST_DWithin(
                  r.geom::geography,
                  ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
                  $3 * 1000.0
              )
        ORDER BY distance_km ASC LIMIT 100
        """,
        latitude,
        longitude,
        radius_km,
        cooperative.get("cooperative_id"),
    )

    enriched = []
    for row in rows:
        item = dict(row)
        item["residue_biomass_kg"] = profiles.total_residue_mass(row)
        item["relevant_mass_kg"] = profiles.profile_relevant_mass(row, profile_type)
        item["match_score"] = profiles.match_score(row, profile_type)
        if only_matching and item["relevant_mass_kg"] <= 0:
            continue
        enriched.append(item)

    enriched.sort(key=lambda r: (-r["match_score"], r["distance_km"]))
    return {"profile_type": profile_type, "count": len(rows), "residues": enriched}


@router.post("/residues/{residue_id}/collect")
async def collect(
    residue_id: int,
    cooperative: dict = Depends(require_roles("cooperative")),
):
    cooperative_id = cooperative.get("cooperative_id")
    if cooperative_id is None:
        raise HTTPException(
            status_code=400,
            detail="Ce compte coopérative n'est associé à aucune coopérative",
        )

    updated = await db.fetch_one(
        """
        UPDATE tree_scans_and_residues
        SET status='collected'
        WHERE id=$1 AND assigned_community_cooperative_id=$2 AND status='allocated'
        RETURNING id, status
        """,
        residue_id,
        cooperative["cooperative_id"],
    )
    if updated is None:
        raise HTTPException(
            status_code=409,
            detail="Résidu non alloué à votre coopérative ou déjà collecté",
        )
    return dict(updated)
