"""Ministry field controls: marking, DF10 stamp, roadside, transformation."""

from typing import Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from app.core.deps import require_roles
from app.services import controls

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
