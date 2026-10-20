"""Cooperative interface: member organisations, aggregated volumes, residues."""

from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.api.organizations import _labelled_warnings, _org_detail
from app.core import profiles
from app.core.deps import require_roles
from app.services import cooperative as coop_service
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


@router.get("/profile")
async def my_cooperative(user: dict = Depends(require_roles("cooperative"))):
    """Cooperative backing the header (role badge + cooperative name)."""
    cooperative_id = user.get("cooperative_id")
    if cooperative_id is None:
        raise HTTPException(
            status_code=400,
            detail="Ce compte coopérative n'est associé à aucune coopérative",
        )
    row = await db.fetch_one(
        "SELECT id, cooperative_name, profile_type, is_certified "
        "FROM community_cooperatives WHERE id=$1",
        cooperative_id,
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Coopérative introuvable")
    return {
        "organization": row["cooperative_name"],
        "organization_type": "cooperative",
        "profile_type": row["profile_type"],
    }


class MemberIn(BaseModel):
    member_org_id: int
    joined_on: date | None = None
    notes: str | None = Field(None, max_length=500)


class MemberPatch(BaseModel):
    status: Literal["active", "suspendue", "sortie"]
    reason: str | None = Field(None, max_length=500)
    left_on: date | None = None


@router.get("/space")
async def cooperative_space(user: dict = Depends(require_roles("cooperative"))):
    """The cooperative's own profile and checklist, its members and their aggregated volumes."""
    org = await coop_service.cooperative_org(user.get("organization_id"))
    detail = await _org_detail(org["id"], user)
    return {
        "organization": org,
        "checklist": detail["checklist"],
        "profile_note": coop_service.PROFILE_NOTE,
        "warnings": await _labelled_warnings(org["id"]),
        **await coop_service.members_with_aggregates(org["id"]),
    }


@router.get("/members")
async def cooperative_members(
    include_former: bool = Query(True),
    user: dict = Depends(require_roles("cooperative")),
):
    org = await coop_service.cooperative_org(user.get("organization_id"))
    return await coop_service.list_members(org["id"], include_former)


@router.get("/members/candidates")
async def member_candidates(
    q: str | None = Query(None, max_length=100),
    user: dict = Depends(require_roles("cooperative")),
):
    """Organisations that may join (name, type, provinces only)."""
    org = await coop_service.cooperative_org(user.get("organization_id"))
    return await coop_service.candidates(org["id"], q)


@router.post("/members", status_code=201)
async def add_cooperative_member(
    body: MemberIn, user: dict = Depends(require_roles("cooperative"))
):
    org = await coop_service.cooperative_org(user.get("organization_id"))
    return await coop_service.add_member(
        org["id"], body.member_org_id, user["id"], "cooperative", body.joined_on, body.notes
    )


@router.patch("/members/{membership_id}")
async def update_cooperative_member(
    membership_id: int, body: MemberPatch, user: dict = Depends(require_roles("cooperative"))
):
    """Suspend, reactivate or record the leaving of a member (reason required)."""
    org = await coop_service.cooperative_org(user.get("organization_id"))
    return await coop_service.update_member(
        org["id"], membership_id, body.status, body.reason, body.left_on
    )


@router.get("/members/{membership_id}")
async def cooperative_member(
    membership_id: int, user: dict = Depends(require_roles("cooperative"))
):
    """Read-only view of a member: titles, AAC, volumes, logs, documents and taxes."""
    org = await coop_service.cooperative_org(user.get("organization_id"))
    return await coop_service.member_detail(org["id"], membership_id)


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
