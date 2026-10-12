"""Forest tax / royalty receipts (taxe de superficie, redevance de surveillance…)."""

from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.api.organizations import require_org
from app.core.deps import require_roles
from app.services import db

router = APIRouter()

TaxType = Literal[
    "superficie",
    "abattage",
    "surveillance",
    "transformation",
    "renouvellement",
    "transfert",
    "fermage",
]


class TaxIn(BaseModel):
    tax_type: TaxType
    period_year: int = Field(..., ge=2000, le=2100)
    amount_fcfa: float = Field(..., gt=0)
    paid_at: date | None = None
    receipt_ref: str | None = None
    title_id: int | None = None
    document_id: int | None = None


class TaxStatusIn(BaseModel):
    status: Literal["du", "paye", "en_retard"]


@router.post("", status_code=201)
async def record_tax(body: TaxIn, user: dict = Depends(require_roles("company"))):
    org_id = require_org(user)
    row = await db.fetch_one(
        """
        INSERT INTO tax_receipts
            (org_id, title_id, tax_type, period_year, amount_fcfa, receipt_ref, paid_at,
             status, document_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id, org_id, tax_type, period_year, amount_fcfa, status
        """,
        org_id,
        body.title_id,
        body.tax_type,
        body.period_year,
        body.amount_fcfa,
        body.receipt_ref,
        body.paid_at,
        "paye" if body.paid_at is not None else "du",
        body.document_id,
    )
    return dict(row)


@router.get("")
async def list_taxes(user: dict = Depends(require_roles("company", "admin"))):
    if user["role"] == "admin":
        rows = await db.fetch_all(
            "SELECT id, org_id, title_id, tax_type, period_year, amount_fcfa,"
            " receipt_ref, paid_at, due_at, status, created_at"
            " FROM tax_receipts ORDER BY created_at DESC LIMIT 500"
        )
    else:
        org_id = require_org(user)
        rows = await db.fetch_all(
            "SELECT id, org_id, title_id, tax_type, period_year, amount_fcfa,"
            " receipt_ref, paid_at, due_at, status, created_at"
            " FROM tax_receipts WHERE org_id = $1 ORDER BY created_at DESC LIMIT 500",
            org_id,
        )
    return [dict(r) for r in rows]


@router.patch("/{tax_id}")
async def set_tax_status(
    tax_id: int,
    body: TaxStatusIn,
    admin: dict = Depends(require_roles("admin")),
):
    row = await db.fetch_one(
        "UPDATE tax_receipts SET status = $1 WHERE id = $2"
        " RETURNING id, org_id, tax_type, period_year, status",
        body.status,
        tax_id,
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Quittance introuvable")
    return dict(row)


# ---------------------------------------------------------------------------
# Échéances (tax dues): obligations declared by the Ministry, settled by a
# receipt. Status is derived — paye (receipt attached) / en_retard (due_at
# passed, art. 283 double droit) / du.
# ---------------------------------------------------------------------------

_DUE_SELECT = (
    "SELECT d.id, d.org_id, d.title_id, d.tax_type, d.period_year,"
    " d.amount_fcfa, d.due_at, d.notes, d.receipt_id, d.created_at,"
    " r.paid_at, r.receipt_ref, r.amount_fcfa AS receipt_amount_fcfa,"
    " t.reference AS title_ref, o.name AS org_name"
    " FROM tax_dues d"
    " LEFT JOIN tax_receipts r ON r.id = d.receipt_id"
    " LEFT JOIN forest_titles t ON t.id = d.title_id"
    " LEFT JOIN organizations o ON o.id = d.org_id"
)


class TaxDueIn(BaseModel):
    title_id: int
    tax_type: TaxType
    period_year: int = Field(..., ge=2000, le=2100)
    amount_fcfa: float = Field(..., gt=0)
    due_at: date | None = None
    notes: str | None = None


class SettlementIn(BaseModel):
    amount_fcfa: float = Field(..., gt=0)
    receipt_ref: str | None = None
    paid_at: date | None = None


def _as_date(value):
    if value is None or isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def _due_payload(row) -> dict:
    payload = dict(row)
    due = _as_date(payload.get("due_at"))
    if payload.get("receipt_id") is not None:
        status = "paye"
    elif due is not None and due < date.today():
        status = "en_retard"
    else:
        status = "du"
    payload["status"] = status
    payload["surcharge_fcfa"] = (payload.get("amount_fcfa") or 0) if status == "en_retard" else 0
    return payload


@router.post("/dues", status_code=201)
async def create_due(body: TaxDueIn, admin: dict = Depends(require_roles("admin"))):
    title = await db.fetch_one(
        "SELECT holder_org_id FROM forest_titles WHERE id = $1", body.title_id
    )
    if title is None:
        raise HTTPException(status_code=404, detail="Titre introuvable")
    row = await db.fetch_one(
        """
        INSERT INTO tax_dues
            (org_id, title_id, tax_type, period_year, amount_fcfa, due_at, notes, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, org_id, title_id, tax_type, period_year, amount_fcfa, due_at,
                  notes, receipt_id, created_at
        """,
        title["holder_org_id"],
        body.title_id,
        body.tax_type,
        body.period_year,
        body.amount_fcfa,
        body.due_at,
        body.notes,
        admin["id"],
    )
    return _due_payload(row)


@router.get("/dues")
async def list_dues(
    period_year: int | None = Query(None, ge=2000, le=2100),
    status: Literal["du", "en_retard", "paye"] | None = None,
    title_id: int | None = None,
    user: dict = Depends(require_roles("company", "admin")),
):
    where: list[str] = []
    args: list = []
    if user["role"] != "admin":
        args.append(require_org(user))
        where.append(f"d.org_id = ${len(args)}")
    if period_year is not None:
        args.append(period_year)
        where.append(f"d.period_year = ${len(args)}")
    if title_id is not None:
        args.append(title_id)
        where.append(f"d.title_id = ${len(args)}")
    clause = (" WHERE " + " AND ".join(where)) if where else ""
    rows = await db.fetch_all(
        f"{_DUE_SELECT}{clause} ORDER BY d.period_year DESC, d.created_at DESC LIMIT 500", *args
    )
    payloads = [_due_payload(r) for r in rows]
    if status is not None:
        payloads = [p for p in payloads if p["status"] == status]
    return payloads


@router.post("/dues/{due_id}/settle")
async def settle_due(
    due_id: int,
    body: SettlementIn,
    user: dict = Depends(require_roles("company")),
):
    org_id = require_org(user)
    due = await db.fetch_one("SELECT * FROM tax_dues WHERE id = $1", due_id)
    if due is None:
        raise HTTPException(status_code=404, detail="Échéance introuvable")
    if due["org_id"] != org_id:
        raise HTTPException(status_code=403, detail="Échéance d'une autre organisation")
    receipt = await db.fetch_one(
        """
        INSERT INTO tax_receipts
            (org_id, title_id, tax_type, period_year, amount_fcfa, receipt_ref, paid_at,
             due_at, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'paye')
        RETURNING id
        """,
        org_id,
        due["title_id"],
        due["tax_type"],
        due["period_year"],
        body.amount_fcfa,
        body.receipt_ref,
        body.paid_at or date.today(),
        due["due_at"],
    )
    await db.execute("UPDATE tax_dues SET receipt_id = $1 WHERE id = $2", receipt["id"], due_id)
    updated = await db.fetch_one(f"{_DUE_SELECT} WHERE d.id = $1", due_id)
    return _due_payload(updated)
