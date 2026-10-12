"""Third-party certifications (FSC / PAFC / PEFC / OLB / LS / TLV).

A company declares a certificate it holds — *gestion durable* or *légalité
plus* — on its own organisation (optionally attached to a title). The Ministry
verifies it (actif) or rejects it (rejeté); an active certificate becomes
*expiré* once ``valid_to`` has passed (derived at read, like tax dues). This
closes the Timber Trade Portal "certification tierce partie" leg.
"""

from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field

from app.api.organizations import require_org
from app.core.deps import require_roles
from app.services import db, pdf_report

router = APIRouter()

_SCHEMES = ("FSC", "PAFC", "PEFC", "OLB", "LS", "TLV")
_CERT_TYPES = ("gestion_durable", "legalite_plus")

# An active certificate whose validity has lapsed is shown as expired without
# mutating the stored row.
_STATUS_EXPR = (
    "CASE WHEN c.status = 'actif' AND c.valid_to IS NOT NULL"
    " AND c.valid_to < CURRENT_DATE THEN 'expire' ELSE c.status END"
)

_CERT_SELECT = (
    "SELECT c.id, c.org_id, c.title_id, c.scheme, c.cert_type, c.certificate_ref,"
    " c.surface_ha, c.valid_from, c.valid_to, c.declared_by, c.verified_by,"
    " c.verified_at, c.decision_motif, c.created_at,"
    f" {_STATUS_EXPR} AS status,"
    " o.name AS org_name, t.reference AS title_ref"
    " FROM certifications c"
    " LEFT JOIN organizations o ON o.id = c.org_id"
    " LEFT JOIN forest_titles t ON t.id = c.title_id"
)


class CertificationIn(BaseModel):
    scheme: Literal["FSC", "PAFC", "PEFC", "OLB", "LS", "TLV"]
    cert_type: Literal["gestion_durable", "legalite_plus"]
    certificate_ref: str | None = None
    title_id: int | None = None
    surface_ha: float | None = Field(None, ge=0)
    valid_from: date | None = None
    valid_to: date | None = None


class CertificationDecisionIn(BaseModel):
    decision: Literal["actif", "rejete", "suspendu"]
    decision_motif: str | None = None


async def _owner_of_certification(cert_id: int) -> dict | None:
    return await db.fetch_one(f"{_CERT_SELECT} WHERE c.id = $1", cert_id)


@router.get("")
async def list_certifications(
    scheme: str | None = None,
    status: str | None = None,
    title_id: int | None = None,
    user: dict = Depends(require_roles("company", "admin")),
):
    where: list[str] = []
    args: list = []
    if user["role"] == "company":
        args.append(require_org(user))
        where.append(f"c.org_id = ${len(args)}")
    if scheme is not None:
        args.append(scheme)
        where.append(f"c.scheme = ${len(args)}")
    if title_id is not None:
        args.append(title_id)
        where.append(f"c.title_id = ${len(args)}")
    clause = f" WHERE {' AND '.join(where)}" if where else ""
    rows = await db.fetch_all(f"{_CERT_SELECT}{clause} ORDER BY c.created_at DESC LIMIT 500", *args)
    items = [dict(r) for r in rows]
    if status is not None:
        items = [i for i in items if i["status"] == status]
    return items


@router.post("", status_code=201)
async def declare_certification(
    body: CertificationIn,
    user: dict = Depends(require_roles("company")),
):
    org_id = require_org(user)
    if body.title_id is not None:
        title = await db.fetch_one(
            "SELECT holder_org_id FROM forest_titles WHERE id = $1", body.title_id
        )
        if title is None:
            raise HTTPException(status_code=404, detail="Titre introuvable")
        if title["holder_org_id"] != org_id:
            raise HTTPException(status_code=403, detail="Titre d'une autre organisation")
    row = await db.fetch_one(
        """
        INSERT INTO certifications
            (org_id, title_id, scheme, cert_type, certificate_ref, surface_ha,
             valid_from, valid_to, status, declared_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'soumis', $9)
        RETURNING id, org_id, title_id, scheme, cert_type, certificate_ref,
                  surface_ha, valid_from, valid_to, declared_by, verified_by,
                  verified_at, decision_motif, created_at, status
        """,
        org_id,
        body.title_id,
        body.scheme,
        body.cert_type,
        body.certificate_ref,
        body.surface_ha,
        body.valid_from,
        body.valid_to,
        user["id"],
    )
    return dict(row)


@router.get("/summary")
async def certifications_summary(_admin: dict = Depends(require_roles("admin"))):
    by_status_rows = await db.fetch_all(
        "SELECT CASE WHEN status = 'actif' AND valid_to IS NOT NULL"
        " AND valid_to < CURRENT_DATE THEN 'expire' ELSE status END AS status,"
        " COUNT(*) AS count, COALESCE(SUM(surface_ha), 0) AS surface_ha"
        " FROM certifications GROUP BY 1 ORDER BY 1"
    )
    by_scheme_rows = await db.fetch_all(
        "SELECT scheme, COUNT(*) AS count FROM certifications GROUP BY scheme ORDER BY scheme"
    )
    by_status = [
        {
            "status": r["status"],
            "count": int(r["count"]),
            "surface_ha": float(r["surface_ha"] or 0),
        }
        for r in by_status_rows
    ]
    by_scheme = [{"scheme": r["scheme"], "count": int(r["count"])} for r in by_scheme_rows]
    return {
        "by_status": by_status,
        "by_scheme": by_scheme,
        "total_count": sum(b["count"] for b in by_status),
    }


@router.patch("/{cert_id}")
async def decide_certification(
    cert_id: int,
    body: CertificationDecisionIn,
    admin: dict = Depends(require_roles("admin")),
):
    if body.decision in ("rejete", "suspendu") and not body.decision_motif:
        raise HTTPException(
            status_code=400,
            detail="Motif requis pour un rejet ou une suspension",
        )
    current = await _owner_of_certification(cert_id)
    if current is None:
        raise HTTPException(status_code=404, detail="Certification introuvable")
    row = await db.fetch_one(
        "UPDATE certifications SET status = $1, decision_motif = $2,"
        " verified_by = $3, verified_at = now()"
        " WHERE id = $4"
        " RETURNING id, org_id, title_id, scheme, cert_type, certificate_ref,"
        " surface_ha, valid_from, valid_to, declared_by, verified_by, verified_at,"
        " decision_motif, created_at, status",
        body.decision,
        body.decision_motif,
        admin["id"],
        cert_id,
    )
    return dict(row)


@router.get("/{cert_id}/pdf")
async def certification_pdf(
    cert_id: int,
    user: dict = Depends(require_roles("company", "admin")),
):
    current = await _owner_of_certification(cert_id)
    if current is None:
        raise HTTPException(status_code=404, detail="Certification introuvable")
    if user["role"] == "company" and current["org_id"] != require_org(user):
        raise HTTPException(status_code=403, detail="Certification d'une autre organisation")
    pdf = pdf_report.render_certification_pdf(current, current.get("org_name"))
    return Response(content=pdf, media_type="application/pdf")
