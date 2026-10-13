"""Ministry anomaly register (Loi 016/01): unified sweep + review decisions.

``GET /api/anomalies`` runs every detector (illegal felling + compliance
warnings) and merges the persisted review decision; the Ministry acknowledges
(``traitee``) or dismisses (``ecartee``, motif mandatory) each anomaly via
``POST /api/anomalies/review``. A branded register can be exported as PDF.
"""

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel

from app.core.deps import require_roles
from app.services import anomalies, pdf_report

router = APIRouter()

Severity = Literal["hard", "warning"]
ReviewFilter = Literal["ouverte", "traitee", "ecartee", "all"]
ReviewStatus = Literal["ouverte", "traitee", "ecartee"]


class ReviewRequest(BaseModel):
    anomaly_type: str
    subject_key: str
    status: ReviewStatus
    decision_motif: str | None = None
    title_id: int | None = None
    aac_id: int | None = None
    org_id: int | None = None


async def _collect(
    anomaly_type: str | None,
    severity: Severity | None,
    review: ReviewFilter | None = None,
) -> list[dict]:
    return await anomalies.collect(anomaly_type=anomaly_type, severity=severity, review=review)


@router.get("")
async def list_anomalies(
    anomaly_type: str | None = Query(None, alias="type"),
    severity: Severity | None = Query(None),
    review: ReviewFilter | None = Query(None),
    admin: dict = Depends(require_roles("admin")),
):
    return await _collect(anomaly_type, severity, review)


@router.get("/summary")
async def summary(
    anomaly_type: str | None = Query(None, alias="type"),
    severity: Severity | None = Query(None),
    admin: dict = Depends(require_roles("admin")),
):
    items = await _collect(anomaly_type, severity)
    return anomalies.summarise(items)


@router.post("/review", status_code=201)
async def review(
    body: ReviewRequest,
    admin: dict = Depends(require_roles("admin")),
):
    if body.anomaly_type not in anomalies.TYPES:
        raise HTTPException(status_code=400, detail=f"Type d'anomalie inconnu: {body.anomaly_type}")
    if body.status == "ecartee" and not (body.decision_motif or "").strip():
        raise HTTPException(status_code=400, detail="Motif requis pour écarter une anomalie")
    return await anomalies.record_review(
        body.anomaly_type,
        body.subject_key,
        body.status,
        (body.decision_motif or "").strip() or None,
        admin["id"],
        title_id=body.title_id,
        aac_id=body.aac_id,
        org_id=body.org_id,
    )


@router.get("/pdf")
async def anomalies_pdf(
    anomaly_type: str | None = Query(None, alias="type"),
    severity: Severity | None = Query(None),
    admin: dict = Depends(require_roles("admin")),
):
    items = await _collect(anomaly_type, severity)
    pdf = pdf_report.render_anomalies_pdf(items, anomalies.summarise(items))
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={
            "Content-Disposition": 'attachment; filename="registre_anomalies.pdf"',
        },
    )
