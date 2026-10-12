"""EUDR due diligence at the parcel of origin (RDUE / EUDR art. 9–11).

Gabon is a low-risk country under the EU Deforestation Regulation, but a valid
title is not sufficient: the operator must geolocate the plot(s) of land where
the wood was produced and keep evidence of stakeholder consultation. This module
records a diligence statement (parcel polygon + consultation proof) and the
geolocation coverage of the felled stems (already captured per stem in
``tree_registry.geom``).
"""

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field

from app.api.organizations import require_org
from app.core.deps import require_roles
from app.services import db, pdf_report

router = APIRouter()

_FELLED = "('abattu','transporte','receptionne','transforme')"

_DILIGENCE_SELECT = (
    "SELECT d.id, d.org_id, d.title_id, d.parcel_label, d.consultation_document_id,"
    " d.geolocated_stem_count, d.felled_stem_count, d.declared_volume_m3, d.notes,"
    " d.status, d.submitted_by, d.decided_by, d.decided_at, d.decision_motif, d.created_at,"
    " ST_AsText(d.parcel_geom) AS parcel_wkt,"
    " t.reference AS title_ref, o.name AS org_name"
    " FROM eudr_diligence d"
    " LEFT JOIN forest_titles t ON t.id = d.title_id"
    " LEFT JOIN organizations o ON o.id = d.org_id"
)


class DiligenceIn(BaseModel):
    title_id: int | None = None
    parcel_label: str = Field(..., min_length=1)
    parcel_wkt: str | None = None
    consultation_document_id: int | None = None
    declared_volume_m3: float | None = Field(None, gt=0)
    notes: str | None = None


class DiligenceDecisionIn(BaseModel):
    status: Literal["valide", "rejete"]
    motif: str | None = None


def _company_id(user: dict) -> int | None:
    company_id = user.get("company_id")
    if company_id is None and user["role"] == "company":
        company_id = user["id"]
    return company_id


@router.post("/diligence", status_code=201)
async def create_diligence(body: DiligenceIn, user: dict = Depends(require_roles("company"))):
    org_id = require_org(user)
    if body.title_id is not None:
        title = await db.fetch_one(
            "SELECT holder_org_id FROM forest_titles WHERE id = $1", body.title_id
        )
        if title is None:
            raise HTTPException(status_code=404, detail="Titre introuvable")
        if title["holder_org_id"] != org_id:
            raise HTTPException(status_code=403, detail="Titre d'une autre organisation")

    counts = await db.fetch_one(
        "SELECT COUNT(*) AS felled, COUNT(geom) AS geolocated FROM tree_registry"
        f" WHERE company_id = $1 AND status IN {_FELLED}",
        _company_id(user),
    )
    felled = int(counts["felled"]) if counts else 0
    geolocated = int(counts["geolocated"]) if counts else 0

    row = await db.fetch_one(
        """
        INSERT INTO eudr_diligence
            (org_id, title_id, parcel_label, parcel_geom, consultation_document_id,
             geolocated_stem_count, felled_stem_count, declared_volume_m3, notes,
             status, submitted_by)
        VALUES ($1, $2, $3,
                CASE WHEN $4::text IS NULL THEN NULL ELSE ST_GeomFromText($4::text, 4326) END,
                $5, $6, $7, $8, $9, 'soumis', $10)
        RETURNING id, org_id, title_id, parcel_label, consultation_document_id,
                  geolocated_stem_count, felled_stem_count, declared_volume_m3,
                  notes, status, submitted_by, decided_by, decided_at, decision_motif,
                  created_at
        """,
        org_id,
        body.title_id,
        body.parcel_label,
        body.parcel_wkt,
        body.consultation_document_id,
        geolocated,
        felled,
        body.declared_volume_m3,
        body.notes,
        user["id"],
    )
    return dict(row)


@router.get("/diligence")
async def list_diligence(
    status: Literal["soumis", "valide", "rejete"] | None = None,
    user: dict = Depends(require_roles("company", "admin")),
):
    where: list[str] = []
    args: list = []
    if user["role"] != "admin":
        args.append(require_org(user))
        where.append(f"d.org_id = ${len(args)}")
    if status is not None:
        args.append(status)
        where.append(f"d.status = ${len(args)}")
    clause = (" WHERE " + " AND ".join(where)) if where else ""
    rows = await db.fetch_all(
        f"{_DILIGENCE_SELECT}{clause} ORDER BY d.created_at DESC LIMIT 500", *args
    )
    return [dict(r) for r in rows]


@router.get("/diligence/{diligence_id}")
async def get_diligence(
    diligence_id: int,
    user: dict = Depends(require_roles("company", "admin")),
):
    row = await db.fetch_one(f"{_DILIGENCE_SELECT} WHERE d.id = $1", diligence_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Déclaration de diligence introuvable")
    if user["role"] == "company" and row["org_id"] != require_org(user):
        raise HTTPException(status_code=403, detail="Déclaration d'une autre organisation")
    return dict(row)


@router.patch("/diligence/{diligence_id}")
async def decide_diligence(
    diligence_id: int,
    body: DiligenceDecisionIn,
    admin: dict = Depends(require_roles("admin")),
):
    if body.status == "rejete" and not body.motif:
        raise HTTPException(status_code=400, detail="Motif de rejet requis")
    row = await db.fetch_one(
        "UPDATE eudr_diligence SET status = $1, decision_motif = $2,"
        " decided_by = $3, decided_at = now()"
        " WHERE id = $4 RETURNING id, org_id, status, decision_motif, decided_at",
        body.status,
        body.motif,
        admin["id"],
        diligence_id,
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Déclaration de diligence introuvable")
    return dict(row)


@router.get("/diligence/{diligence_id}/pdf")
async def diligence_pdf(
    diligence_id: int,
    user: dict = Depends(require_roles("company", "admin")),
):
    row = await db.fetch_one(f"{_DILIGENCE_SELECT} WHERE d.id = $1", diligence_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Déclaration de diligence introuvable")
    if user["role"] == "company" and row["org_id"] != require_org(user):
        raise HTTPException(status_code=403, detail="Déclaration d'une autre organisation")
    data = dict(row)
    pdf = pdf_report.render_diligence_pdf(data, data.get("org_name"))
    return Response(content=pdf, media_type="application/pdf")
