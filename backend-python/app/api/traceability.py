"""Traceability: carnet de chantier (DF10) register + regulatory statements.

Loi 016/01 art. 130-133 (carnet de chantier) and the periodic états required by
the administration. The DF10 register is the digital logbook of every marked
stem; the statements aggregate felled volumes (estimated) by species and period.
"""

from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field

from app.core import df10
from app.core.deps import require_roles
from app.core.log_volume import merchantable_volume_m3
from app.services import db, deadlines, pdf_report

router = APIRouter()

_FELLED_STATUSES = ("abattu", "transporte", "receptionne", "transforme")


class Df10EntryIn(BaseModel):
    abandon_code: str | None = None
    notes: str | None = None


def _company_id(user: dict) -> int | None:
    company_id = user.get("company_id")
    if company_id is None and user["role"] == "company":
        company_id = user["id"]
    return company_id


def _scope(user: dict) -> tuple[str, list]:
    """Return (sql fragment, params) scoping rows to the caller."""
    if user["role"] == "admin":
        return "", []
    return " AND company_id = $1", [_company_id(user)]


async def _df10_rows(
    user: dict,
    title_id: int | None = None,
    aac_id: int | None = None,
    status: str | None = None,
) -> list[dict]:
    conditions: list[str] = []
    values: list = []
    if user["role"] != "admin":
        values.append(_company_id(user))
        conditions.append(f"company_id = ${len(values)}")
    if title_id is not None:
        values.append(title_id)
        conditions.append(f"title_id = ${len(values)}")
    if aac_id is not None:
        values.append(aac_id)
        conditions.append(f"aac_id = ${len(values)}")
    if status is not None:
        values.append(status)
        conditions.append(f"status = ${len(values)}")
    where = f" WHERE {' AND '.join(conditions)}" if conditions else ""
    rows = await db.fetch_all(
        "SELECT tree_code, species_scientific_name, measured_dbh_cm, marking_type, status,"
        " hammer_mark, felled_at, df10_entry_no, abandon_code, df10_notes, permit_number,"
        " COALESCE(aac_label, (SELECT b.label FROM annual_cut_blocks b WHERE b.id = tree_registry.aac_id))"
        " AS aac_label, title_id, aac_id"
        f" FROM tree_registry{where}"
        " ORDER BY df10_entry_no NULLS LAST, felled_at NULLS LAST, tree_code LIMIT 2000",
        *values,
    )
    return [dict(r) for r in rows]


@router.get("/df10")
async def list_df10(
    title_id: int | None = Query(None),
    aac_id: int | None = Query(None),
    status: str | None = Query(None),
    user: dict = Depends(require_roles("company", "operator", "admin")),
):
    rows = await _df10_rows(user, title_id, aac_id, status)
    for row in rows:
        row["abandon_label"] = df10.abandon_code_label(row.get("abandon_code"))
    return rows


@router.patch("/df10/{tree_code}")
async def set_df10_abandonance(
    tree_code: str,
    body: Df10EntryIn,
    user: dict = Depends(require_roles("company", "operator")),
):
    tree = await db.fetch_one(
        "SELECT tree_code, company_id, status FROM tree_registry WHERE tree_code = $1", tree_code
    )
    if tree is None:
        raise HTTPException(status_code=404, detail="Arbre inconnu au registre")
    if user["role"] != "admin" and tree["company_id"] != _company_id(user):
        raise HTTPException(status_code=403, detail="Arbre d'une autre entreprise")
    if body.abandon_code is not None and not df10.is_valid_abandon_code(body.abandon_code):
        raise HTTPException(status_code=400, detail=f"Code d'abandon inconnu: {body.abandon_code}")
    if tree["status"] in _FELLED_STATUSES:
        raise HTTPException(
            status_code=409,
            detail="Arbre déjà abattu: le carnet de chantier ne peut plus l'abandonner",
        )
    row = await db.fetch_one(
        "UPDATE tree_registry SET abandon_code = $1, df10_notes = $2, updated_at = now()"
        " WHERE tree_code = $3"
        " RETURNING tree_code, abandon_code, df10_notes, status",
        body.abandon_code,
        body.notes,
        tree_code,
    )
    out = dict(row)
    out["abandon_label"] = df10.abandon_code_label(out.get("abandon_code"))
    return out


@router.get("/df10/pdf")
async def df10_pdf(
    title_id: int | None = Query(None),
    aac_id: int | None = Query(None),
    status: str | None = Query(None),
    user: dict = Depends(require_roles("company", "operator", "admin")),
):
    rows = await _df10_rows(user, title_id, aac_id, status)
    org_name = await _org_name(user)
    pdf = pdf_report.render_df10_pdf(rows, org_name=org_name, title_id=title_id, aac_id=aac_id)
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="carnet_chantier_df10.pdf"'},
    )


def _period_match(when: Any, year: int, quarter: int | None) -> bool:
    if when is None:
        return False
    if hasattr(when, "year"):
        y, m = when.year, when.month
    else:
        text = str(when)
        try:
            y, m = int(text[0:4]), int(text[5:7])
        except (ValueError, IndexError):
            return False
    if y != year:
        return False
    return quarter is None or (m - 1) // 3 + 1 == quarter


@router.get("/statements")
async def statements(
    year: int = Query(..., ge=2000, le=2100),
    quarter: int | None = Query(None, ge=1, le=4),
    user: dict = Depends(require_roles("company", "operator", "admin")),
):
    fragment, params = _scope(user)
    rows = [
        dict(r)
        for r in await db.fetch_all(
            "SELECT species_scientific_name, measured_dbh_cm, status, abandon_code, felled_at"
            f" FROM tree_registry WHERE 1 = 1{fragment} LIMIT 5000",
            *params,
        )
    ]

    felled = [
        r
        for r in rows
        if r["status"] in _FELLED_STATUSES and _period_match(r["felled_at"], year, quarter)
    ]
    by_species: dict[str, dict] = {}
    volume_total = 0.0
    for r in felled:
        species = r["species_scientific_name"] or "Inconnue"
        volume = merchantable_volume_m3(r["measured_dbh_cm"], r["species_scientific_name"])
        volume_total += volume
        entry = by_species.setdefault(species, {"species": species, "stems": 0, "volume_m3": 0.0})
        entry["stems"] += 1
        entry["volume_m3"] = round(entry["volume_m3"] + volume, 3)

    status_counts = {
        status: sum(1 for r in rows if r["status"] == status) for status in _FELLED_STATUSES
    }
    transformed = sum(1 for r in felled if r["status"] == "transforme")

    abandoned: dict[str, int] = {}
    for r in rows:
        if r["status"] not in _FELLED_STATUSES and r.get("abandon_code"):
            abandoned[r["abandon_code"]] = abandoned.get(r["abandon_code"], 0) + 1

    transport = await _transport_summary(user, year, quarter)

    return {
        "period": {"year": year, "quarter": quarter},
        "totals": {
            "stems_felled": len(felled),
            "estimated_volume_m3": round(volume_total, 3),
            "by_status": status_counts,
        },
        "by_species": sorted(by_species.values(), key=lambda e: e["volume_m3"], reverse=True),
        "transformation_rate": round(transformed / len(felled), 4) if felled else 0.0,
        "abandoned": [
            {"code": code, "label": df10.abandon_code_label(code), "count": count}
            for code, count in sorted(abandoned.items())
        ],
        "transport": {
            "documents": transport["documents"],
            "volume_m3": transport["volume_m3"],
        },
    }


async def _transport_summary(user: dict, year: int, quarter: int | None) -> dict:
    """Transport documents issued in the period, scoped to the caller's org."""
    fragment, params = "", []
    if user["role"] != "admin":
        org_id = user.get("organization_id")
        if org_id is None:
            return {"documents": 0, "volume_m3": 0.0}
        fragment, params = " AND org_id = $1", [org_id]
    docs = await db.fetch_all(
        "SELECT volume_m3, created_at FROM transport_documents WHERE 1 = 1" + fragment, *params
    )
    in_period = [d for d in docs if _period_match(d.get("created_at"), year, quarter)]
    return {
        "documents": len(in_period),
        "volume_m3": round(sum(float(d.get("volume_m3") or 0) for d in in_period), 3),
    }


@router.get("/statements/pdf")
async def statements_pdf(
    year: int = Query(..., ge=2000, le=2100),
    quarter: int | None = Query(None, ge=1, le=4),
    user: dict = Depends(require_roles("company", "admin")),
):
    data = await statements(year=year, quarter=quarter, user=user)
    org_name = await _org_name(user)
    pdf = pdf_report.render_statement_pdf(data, org_name=org_name)
    label = f"etat_{year}" + (f"_T{quarter}" if quarter else "")
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{label}.pdf"'},
    )


async def _org_name(user: dict) -> str | None:
    org_id = user.get("organization_id")
    if org_id is None:
        return None
    row = await db.fetch_one("SELECT name FROM organizations WHERE id = $1", org_id)
    return row["name"] if row is not None else None


class FilingIn(BaseModel):
    year: int = Field(..., ge=2000, le=2100)


@router.post("/statements/file", status_code=201)
async def file_statement(body: FilingIn, user: dict = Depends(require_roles("company"))):
    """Transmit the annual statement of a closed year (due 31 March, art. 244)."""
    org_id = user.get("organization_id")
    if org_id is None:
        raise HTTPException(status_code=409, detail="Compte non rattaché à une organisation")
    if body.year >= date.today().year:
        raise HTTPException(
            status_code=400, detail="L'état annuel se transmet après la fin de l'année"
        )
    existing = await db.fetch_one(
        "SELECT filed_at FROM statement_filings"
        " WHERE org_id = $1 AND period_year = $2 AND period_kind = 'annuel'",
        org_id,
        body.year,
    )
    if existing is not None:
        raise HTTPException(
            status_code=409,
            detail=f"État annuel {body.year} déjà transmis le {existing['filed_at'].date().isoformat()}",
        )
    data = await statements(year=body.year, quarter=None, user=user)
    due = deadlines.statement_due(body.year)
    row = await db.fetch_one(
        """
        INSERT INTO statement_filings
            (org_id, period_year, period_kind, stems_felled, volume_m3, reference, filed_by)
        VALUES ($1, $2, 'annuel', $3, $4, $5, $6)
        RETURNING id, period_year, stems_felled, volume_m3, reference, filed_at
        """,
        org_id,
        body.year,
        data["totals"]["stems_felled"],
        data["totals"]["estimated_volume_m3"],
        f"EA-{body.year}-{org_id:04d}",
        user["id"],
    )
    out = dict(row)
    out["due"] = due.isoformat()
    out["late"] = out["filed_at"].date() > due
    return out


@router.get("/filings")
async def list_filings(
    year: int | None = Query(None, ge=2000, le=2100),
    user: dict = Depends(require_roles("company", "admin")),
):
    """Annual statements transmitted (own organisation, or all for the Ministry)."""
    org_id = None if user["role"] == "admin" else user.get("organization_id")
    rows = await db.fetch_all(
        """
        SELECT f.id, f.org_id, o.name AS org_name, f.period_year, f.period_kind, f.stems_felled,
               f.volume_m3, f.reference, f.filed_at
        FROM statement_filings f
        JOIN organizations o ON o.id = f.org_id
        WHERE ($1::int IS NULL OR f.org_id = $1) AND ($2::int IS NULL OR f.period_year = $2)
        ORDER BY f.filed_at DESC
        LIMIT 500
        """,
        org_id,
        year,
    )
    out = []
    for r in rows:
        item = dict(r)
        item["due"] = deadlines.statement_due(item["period_year"]).isoformat()
        item["late"] = item["filed_at"].date() > deadlines.statement_due(item["period_year"])
        out.append(item)
    return out
