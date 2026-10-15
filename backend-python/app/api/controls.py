"""Ministry field controls: marking, DF10 stamp, roadside, transformation."""

from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field

from app.core.deps import require_roles
from app.services import controls, pdf_report

router = APIRouter()


class ControlIn(BaseModel):
    control_type: Literal["marquage", "visa_df10", "route", "transformation"]
    result: Literal["conforme", "reserve", "non_conforme"]
    tree_code: str | None = None
    transport_document_id: int | None = None
    aac_id: int | None = None
    org_id: int | None = None
    findings: list[str] = Field(default_factory=list)
    notes: str | None = None
    pv_reference: str | None = None
    latitude: float | None = Field(None, ge=-90, le=90)
    longitude: float | None = Field(None, ge=-180, le=180)


class FollowupIn(BaseModel):
    action_type: Literal[
        "mise_en_demeure", "amende", "transaction", "saisie", "suspension", "poursuite"
    ]
    amount_fcfa: float | None = Field(None, ge=0)
    reference: str | None = None
    due_at: date | None = None
    notes: str | None = None


class FollowupStatus(BaseModel):
    status: Literal["execute", "annule", "notifie"]
    motif: str | None = None


class FollowupContest(BaseModel):
    reply: str = Field(..., min_length=1)


@router.get("/lookup")
async def lookup(
    code: str = Query(..., min_length=1), _admin: dict = Depends(require_roles("admin"))
):
    """Scanned QR / typed code → registry or slip facts with automatic checks."""
    return await controls.lookup(code)


@router.post("", status_code=201)
async def create_control(body: ControlIn, admin: dict = Depends(require_roles("admin"))):
    return await controls.record(body.model_dump(), admin)


@router.get("")
async def list_controls(
    kind: str | None = Query(None, alias="type"),
    result: str | None = Query(None),
    _admin: dict = Depends(require_roles("admin")),
):
    return await controls.list_controls(kind, result)


@router.get("/{control_id}/pdf")
async def control_pdf(control_id: int, user: dict = Depends(require_roles("admin", "company"))):
    """Procès-verbal of a control — the Ministry, or the organisation controlled."""
    control = await controls.get_control(control_id)
    if control is None:
        raise HTTPException(status_code=404, detail="Contrôle introuvable")
    if user["role"] != "admin" and control["org_id"] != user.get("organization_id"):
        raise HTTPException(status_code=403, detail="Contrôle d'une autre organisation")
    pdf = pdf_report.render_control_pdf(control)
    name = (control.get("pv_reference") or f"controle_{control_id}").replace("/", "-")
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="PV_{name}.pdf"'},
    )


@router.get("/followups")
async def list_open_followups(user: dict = Depends(require_roles("admin", "company"))):
    """Follow-ups still open: all of them for the Ministry, its own for an organisation."""
    if user["role"] == "admin":
        return await controls.open_followups()
    if user.get("organization_id") is None:
        return []
    return await controls.open_followups(user["organization_id"])


@router.post("/{control_id}/followups", status_code=201)
async def add_followup(
    control_id: int, body: FollowupIn, admin: dict = Depends(require_roles("admin"))
):
    """Follow-up of a non-compliant control (notice, fine, settlement, seizure…)."""
    return await controls.add_followup(control_id, body.model_dump(), admin)


@router.post("/followups/{followup_id}/status")
async def set_followup_status(
    followup_id: int, body: FollowupStatus, admin: dict = Depends(require_roles("admin"))
):
    """Executed, cancelled, or maintained after a contestation (motif required)."""
    return await controls.set_followup_status(followup_id, body.status, body.motif, admin)


@router.post("/followups/{followup_id}/contest")
async def contest_followup(
    followup_id: int, body: FollowupContest, user: dict = Depends(require_roles("company"))
):
    """Right of reply of the organisation controlled."""
    return await controls.contest_followup(followup_id, body.reply, user)
