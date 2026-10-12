"""Transport documents: bordereau de roulage / feuille de route / spécification.

Loi 016/01 art. 135 (bordereau de roulage) and art. 138-140 (spécification).
A document groups a set of felled stems owned by the caller's company, carries
an origin/destination and (optionally) a carrier, and transitions
``brouillon → emis → receptionne``. It is the movement leg of the chain of
custody; custody events in ``felling`` may reference it.

Scoping: the document belongs to the caller's *organization*
(``transport_documents.org_id`` → ``organizations``), while the stems it carries
are checked against the legacy per-account ``tree_registry.company_id``.
"""

import json
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field

from app.api.organizations import require_org
from app.core.deps import require_roles
from app.core.log_volume import merchantable_volume_m3
from app.services import db, pdf_report

router = APIRouter()

DocType = Literal["bordereau_roulage", "feuille_route", "specification"]

_PREFIX: dict[str, str] = {
    "bordereau_roulage": "BDR",
    "feuille_route": "FDR",
    "specification": "SPC",
}
# A bordereau moves logs that have already been felled.
_TRANSPORTABLE = ("abattu", "transporte", "receptionne", "transforme")


class TransportDocIn(BaseModel):
    doc_type: DocType
    tree_codes: list[str] = Field(..., min_length=1, max_length=500)
    from_label: str | None = None
    to_label: str | None = None
    transporter: str | None = None
    vehicle_ref: str | None = None
    title_id: int | None = None
    aac_id: int | None = None
    reference: str | None = None


class TransportActionIn(BaseModel):
    status: Literal["emis", "receptionne"]


def _company_id(user: dict) -> int | None:
    company_id = user.get("company_id")
    if company_id is None and user["role"] == "company":
        company_id = user["id"]
    return company_id


def _tree_codes(row: dict) -> list[str]:
    """Normalise a ``tree_codes`` jsonb column (asyncpg decodes jsonb to str)."""
    codes = row.get("tree_codes")
    if codes is None:
        return []
    if isinstance(codes, str):
        try:
            codes = json.loads(codes)
        except json.JSONDecodeError:
            return []
    return [str(c) for c in codes] if isinstance(codes, (list, tuple)) else []


async def _load_doc(doc_id: int) -> dict:
    doc = await db.fetch_one("SELECT * FROM transport_documents WHERE id = $1", doc_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Document de transport introuvable")
    out = dict(doc)
    out["tree_codes"] = _tree_codes(out)
    return out


async def _guard_doc(user: dict, doc: dict) -> None:
    if user["role"] != "admin" and doc["org_id"] != user.get("organization_id"):
        raise HTTPException(status_code=403, detail="Document d'une autre organisation")


@router.post("/documents", status_code=201)
async def create_transport_document(
    body: TransportDocIn, user: dict = Depends(require_roles("company"))
):
    org_id = require_org(user)
    company_id = _company_id(user)
    codes = list(dict.fromkeys(c.strip() for c in body.tree_codes if c.strip()))
    if not codes:
        raise HTTPException(status_code=400, detail="Aucun code arbre fourni")

    rows = await db.fetch_all(
        "SELECT tree_code, company_id, status, species_scientific_name, measured_dbh_cm"
        " FROM tree_registry WHERE tree_code = ANY($1::text[])",
        codes,
    )
    found = {r["tree_code"]: dict(r) for r in rows}
    missing = [c for c in codes if c not in found]
    if missing:
        raise HTTPException(
            status_code=404,
            detail={"message": "Arbres inconnus au registre", "tree_codes": missing},
        )
    foreign = [c for c in codes if found[c]["company_id"] != company_id]
    if foreign:
        raise HTTPException(
            status_code=403,
            detail={"message": "Arbres d'une autre entreprise", "tree_codes": foreign},
        )
    not_felled = [c for c in codes if found[c]["status"] not in _TRANSPORTABLE]
    if not_felled:
        raise HTTPException(
            status_code=409,
            detail={
                "message": "Bordereau impossible: arbres non abattus (Loi 016/01 art. 135)",
                "tree_codes": not_felled,
            },
        )

    # A stem must not ride on two open documents at once.
    open_docs = await db.fetch_all(
        "SELECT id, tree_codes FROM transport_documents"
        " WHERE org_id = $1 AND status IN ('brouillon','emis')",
        org_id,
    )
    used: set[str] = set()
    for doc in open_docs:
        used.update(_tree_codes(doc))
    conflict = [c for c in codes if c in used]
    if conflict:
        raise HTTPException(
            status_code=409,
            detail={
                "message": "Arbres déjà rattachés à un transport en cours",
                "tree_codes": conflict,
            },
        )

    volume = round(
        sum(
            merchantable_volume_m3(found[c]["measured_dbh_cm"], found[c]["species_scientific_name"])
            for c in codes
        ),
        3,
    )
    reference = body.reference or f"{_PREFIX[body.doc_type]}-{uuid4().hex[:6].upper()}"
    qr_payload = f"{body.doc_type}|{reference}|{len(codes)}|{volume}"

    row = await db.fetch_one(
        """
        INSERT INTO transport_documents
            (org_id, doc_type, reference, from_label, to_label, tree_codes, volume_m3,
             issued_by, status, qr_payload, title_id, aac_id, transporter, vehicle_ref)
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, 'brouillon', $9, $10, $11, $12, $13)
        RETURNING id, doc_type, reference, status, volume_m3, tree_codes
        """,
        org_id,
        body.doc_type,
        reference,
        body.from_label,
        body.to_label,
        json.dumps(codes),
        volume,
        user["id"],
        qr_payload,
        body.title_id,
        body.aac_id,
        body.transporter,
        body.vehicle_ref,
    )
    out = dict(row)
    out["tree_codes"] = _tree_codes(row)
    return out


@router.get("/documents")
async def list_transport_documents(
    status: str | None = Query(None),
    user: dict = Depends(require_roles("company", "admin")),
):
    conditions: list[str] = []
    values: list = []
    if user["role"] != "admin":
        conditions.append("org_id = $1")
        values.append(user.get("organization_id"))
    if status is not None:
        conditions.append(f"status = ${len(values) + 1}")
        values.append(status)
    where = f" WHERE {' AND '.join(conditions)}" if conditions else ""
    rows = await db.fetch_all(
        "SELECT id, org_id, doc_type, reference, from_label, to_label, tree_codes,"
        " volume_m3, issued_by, issued_at, status, qr_payload, title_id, aac_id,"
        " transporter, vehicle_ref, created_at"
        f" FROM transport_documents{where} ORDER BY created_at DESC LIMIT 500",
        *values,
    )
    return [dict(r, tree_codes=_tree_codes(r)) for r in rows]


@router.get("/documents/{doc_id}")
async def get_transport_document(
    doc_id: int, user: dict = Depends(require_roles("company", "admin"))
):
    doc = await _load_doc(doc_id)
    await _guard_doc(user, doc)
    codes = doc["tree_codes"]
    trees = await db.fetch_all(
        "SELECT tree_code, species_scientific_name, measured_dbh_cm, status, hammer_mark,"
        " ST_Y(geom) AS latitude, ST_X(geom) AS longitude"
        " FROM tree_registry WHERE tree_code = ANY($1::text[]) ORDER BY tree_code",
        codes,
    )
    return {"document": doc, "trees": [dict(r) for r in trees]}


@router.patch("/documents/{doc_id}")
async def act_on_transport_document(
    doc_id: int,
    body: TransportActionIn,
    user: dict = Depends(require_roles("company", "admin")),
):
    doc = await _load_doc(doc_id)
    await _guard_doc(user, doc)
    allowed = {"brouillon": {"emis"}, "emis": {"receptionne"}}
    if body.status not in allowed.get(doc["status"], set()):
        raise HTTPException(
            status_code=409, detail=f"Transition {doc['status']} → {body.status} impossible"
        )
    row = await db.fetch_one(
        "UPDATE transport_documents SET status = $1,"
        " issued_at = COALESCE(issued_at, CASE WHEN $1 = 'emis' THEN now() END)"
        " WHERE id = $2 RETURNING id, doc_type, reference, status, volume_m3",
        body.status,
        doc_id,
    )
    return dict(row)


@router.get("/documents/{doc_id}/pdf")
async def transport_document_pdf(
    doc_id: int, user: dict = Depends(require_roles("company", "admin"))
):
    doc = await _load_doc(doc_id)
    await _guard_doc(user, doc)
    codes = doc["tree_codes"]
    trees = await db.fetch_all(
        "SELECT tree_code, species_scientific_name, measured_dbh_cm, status"
        " FROM tree_registry WHERE tree_code = ANY($1::text[]) ORDER BY tree_code",
        codes,
    )
    pdf = pdf_report.render_transport_pdf(doc, [dict(t) for t in trees])
    filename = f"{doc['doc_type']}_{doc_id}.pdf"
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
