"""Community agreements (CCC / FDL) and CGSP proof — Loi 016/01 art. 251.

A *Cahier des Clauses Contractuelles* (CCC) binds an operating title to a host
community; the *Fonds de Développement Local* (FDL) contribution is a per-m³
levy (800 FCFA/m³ by default) on the annual harvested volume. The Comité de
Gestion et de Suivi des Projets (CGSP) minutes are attached as a legal document
(``pv_cgsp``). The company registers the agreement; the Ministry activates,
suspends or closes it.
"""

from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.api.organizations import require_org
from app.core.deps import require_roles
from app.services import db

router = APIRouter()

DEFAULT_FDL_RATE = 800.0


class AgreementIn(BaseModel):
    title_id: int
    community_org_id: int
    ccc_ref: str | None = None
    ccc_signed_at: date | None = None
    fdl_rate_fcfa_m3: float = Field(DEFAULT_FDL_RATE, gt=0)
    annual_volume_m3: float | None = Field(None, gt=0)


class AgreementDecisionIn(BaseModel):
    status: Literal["actif", "suspendu", "clos"]
    ccc_ref: str | None = None
    cgsp_minutes_document_id: int | None = None


_AGREEMENT_SELECT = (
    "SELECT a.id, a.title_id, a.community_org_id, a.ccc_ref, a.ccc_signed_at,"
    " a.fdl_rate_fcfa_m3, a.annual_volume_m3, a.contribution_fcfa,"
    " a.cgsp_minutes_document_id, a.status, a.created_at,"
    " t.reference AS title_ref, c.name AS community_name"
    " FROM community_agreements a"
    " LEFT JOIN forest_titles t ON t.id = a.title_id"
    " LEFT JOIN organizations c ON c.id = a.community_org_id"
)


def _contribution(rate: float | None, volume: float | None) -> float | None:
    if volume is None:
        return None
    return round((rate or 0) * volume)


@router.get("/communities")
async def list_communities(_user: dict = Depends(require_roles("company", "admin"))):
    rows = await db.fetch_all(
        "SELECT id, name, address FROM organizations WHERE org_type = 'communaute'"
        " AND is_active = TRUE ORDER BY name"
    )
    return [dict(r) for r in rows]


@router.post("/agreements", status_code=201)
async def create_agreement(body: AgreementIn, user: dict = Depends(require_roles("company"))):
    org_id = require_org(user)
    title = await db.fetch_one(
        "SELECT holder_org_id FROM forest_titles WHERE id = $1", body.title_id
    )
    if title is None:
        raise HTTPException(status_code=404, detail="Titre introuvable")
    if title["holder_org_id"] != org_id:
        raise HTTPException(status_code=403, detail="Titre d'une autre organisation")
    community = await db.fetch_one(
        "SELECT org_type FROM organizations WHERE id = $1", body.community_org_id
    )
    if community is None:
        raise HTTPException(status_code=404, detail="Communauté introuvable")
    if community["org_type"] != "communaute":
        raise HTTPException(status_code=400, detail="L'organisation cible n'est pas une communauté")
    row = await db.fetch_one(
        """
        INSERT INTO community_agreements
            (title_id, community_org_id, ccc_ref, ccc_signed_at, fdl_rate_fcfa_m3,
             annual_volume_m3, contribution_fcfa, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'actif')
        RETURNING id, title_id, community_org_id, ccc_ref, ccc_signed_at,
                  fdl_rate_fcfa_m3, annual_volume_m3, contribution_fcfa,
                  cgsp_minutes_document_id, status, created_at
        """,
        body.title_id,
        body.community_org_id,
        body.ccc_ref,
        body.ccc_signed_at,
        body.fdl_rate_fcfa_m3,
        body.annual_volume_m3,
        _contribution(body.fdl_rate_fcfa_m3, body.annual_volume_m3),
    )
    return dict(row)


@router.get("/agreements")
async def list_agreements(user: dict = Depends(require_roles("company", "admin"))):
    if user["role"] == "admin":
        rows = await db.fetch_all(f"{_AGREEMENT_SELECT} ORDER BY a.created_at DESC LIMIT 500")
    else:
        org_id = require_org(user)
        rows = await db.fetch_all(
            f"{_AGREEMENT_SELECT} WHERE t.holder_org_id = $1 ORDER BY a.created_at DESC LIMIT 500",
            org_id,
        )
    return [dict(r) for r in rows]


@router.get("/agreements/summary")
async def agreements_summary(_admin: dict = Depends(require_roles("admin"))):
    rows = await db.fetch_all(
        "SELECT status, COUNT(*) AS count, COALESCE(SUM(contribution_fcfa), 0) AS contribution_fcfa"
        " FROM community_agreements GROUP BY status ORDER BY status"
    )
    by_status = [
        {
            "status": r["status"],
            "count": int(r["count"]),
            "contribution_fcfa": float(r["contribution_fcfa"]),
        }
        for r in rows
    ]
    return {
        "by_status": by_status,
        "total_count": sum(b["count"] for b in by_status),
        "total_contribution_fcfa": sum(b["contribution_fcfa"] for b in by_status),
    }


@router.patch("/agreements/{agreement_id}")
async def decide_agreement(
    agreement_id: int,
    body: AgreementDecisionIn,
    _admin: dict = Depends(require_roles("admin")),
):
    sets = ["status = $1"]
    args: list = [body.status]
    if body.ccc_ref is not None:
        args.append(body.ccc_ref)
        sets.append(f"ccc_ref = ${len(args)}")
    if body.cgsp_minutes_document_id is not None:
        args.append(body.cgsp_minutes_document_id)
        sets.append(f"cgsp_minutes_document_id = ${len(args)}")
    args.append(agreement_id)
    row = await db.fetch_one(
        f"UPDATE community_agreements SET {', '.join(sets)} WHERE id = ${len(args)}"
        " RETURNING id, title_id, community_org_id, ccc_ref, ccc_signed_at,"
        " fdl_rate_fcfa_m3, annual_volume_m3, contribution_fcfa,"
        " cgsp_minutes_document_id, status, created_at",
        *args,
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Convention introuvable")
    return dict(row)
