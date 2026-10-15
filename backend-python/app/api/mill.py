"""Transformation register of a mill (entries received, output lots, yield)."""

from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field

from app.api.organizations import require_org
from app.core.deps import require_roles
from app.services import db, mill, pdf_report

router = APIRouter()


class OutputIn(BaseModel):
    product_type: Literal["sciage", "placage", "contreplaque", "bois_profile", "autre"]
    volume_m3: float = Field(..., gt=0, le=10000)
    tree_codes: list[str] = Field(..., min_length=1, max_length=500)
    produced_on: date | None = None
    species_scientific_name: str | None = None
    lot_reference: str | None = None
    destination: Literal["local", "export"] | None = None
    notes: str | None = None


@router.get("/register")
async def register(
    year: int | None = Query(None, ge=2000, le=2100),
    org_id: int | None = Query(None),
    user: dict = Depends(require_roles("company", "admin")),
):
    """The register of the caller's mill, or of any organisation for the Ministry."""
    if user["role"] == "admin":
        if org_id is None:
            raise HTTPException(status_code=422, detail="Organisation requise")
        return await mill.register(org_id, year)
    return await mill.register(require_org(user), year)


@router.get("/register/pdf")
async def register_pdf(
    year: int | None = Query(None, ge=2000, le=2100),
    org_id: int | None = Query(None),
    user: dict = Depends(require_roles("company", "admin")),
):
    """The register as a PDF (presented at a transformation control)."""
    if user["role"] == "admin":
        if org_id is None:
            raise HTTPException(status_code=422, detail="Organisation requise")
    else:
        org_id = require_org(user)
    data = await mill.register(org_id, year)
    org = await db.fetch_one("SELECT name FROM organizations WHERE id = $1", org_id)
    pdf = pdf_report.render_mill_register_pdf(data, org["name"] if org else None)
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="registre_transformation_{data["year"]}.pdf"'
        },
    )


@router.post("/outputs", status_code=201)
async def record_output(body: OutputIn, user: dict = Depends(require_roles("company"))):
    """A lot produced from received logs (they become « transformé »)."""
    return await mill.record_output(body.model_dump(), user, require_org(user))


@router.get("/alerts")
async def alerts(
    year: int | None = Query(None, ge=2000, le=2100),
    _admin: dict = Depends(require_roles("admin")),
):
    """Mills whose output volume exceeds what they received (wood of unknown origin?)."""
    return await mill.yield_alerts(year)
