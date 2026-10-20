"""Document vault: company submission, checklist, Ministry verification."""

from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.api.organizations import require_org
from app.core.deps import require_roles
from app.services import db
from app.services.compliance import DOC_STATUS_SQL

router = APIRouter()

ScopeType = Literal["company", "title", "ufa", "aac", "product", "social"]


class DocumentIn(BaseModel):
    scope_type: ScopeType
    scope_id: int
    doc_type: str
    reference: str | None = None
    authority: str | None = None
    issued_at: date | None = None
    expires_at: date | None = None
    file_url: str | None = None


class VerificationIn(BaseModel):
    status: Literal["valide", "rejete"]
    notes: str | None = None


async def _owns_scope(user: dict, scope_type: str, scope_id: int) -> None:
    org_id = require_org(user)
    if scope_type == "company":
        if scope_id != org_id:
            raise HTTPException(status_code=403, detail="Document d'une autre organisation")
        return
    if scope_type in ("title",):
        owner = await db.fetch_one(
            "SELECT holder_org_id FROM forest_titles WHERE id = $1", scope_id
        )
        if owner is None:
            raise HTTPException(status_code=404, detail="Titre introuvable")
        if owner["holder_org_id"] != org_id:
            raise HTTPException(status_code=403, detail="Titre d'une autre organisation")
        return
    if scope_type in ("ufa", "aac"):
        sql = (
            "SELECT t.holder_org_id FROM management_units u"
            " JOIN forest_titles t ON t.id = u.title_id"
            " WHERE u.id = $1"
            if scope_type == "ufa"
            else "SELECT t.holder_org_id FROM annual_cut_blocks a"
            " JOIN management_units u ON u.id = a.ufa_id"
            " JOIN forest_titles t ON t.id = u.title_id"
            " WHERE a.id = $1"
        )
        owner = await db.fetch_one(sql, scope_id)
        if owner is None:
            raise HTTPException(status_code=404, detail="Unité/AAC introuvable")
        if owner["holder_org_id"] != org_id:
            raise HTTPException(status_code=403, detail="Unité/AAC d'une autre organisation")
        return


@router.post("/upload")
async def upload(body: DocumentIn, user: dict = Depends(require_roles("company", "cooperative"))):
    if user["role"] == "cooperative" and body.scope_type != "company":
        raise HTTPException(
            status_code=403, detail="Une coopérative ne dépose que les pièces de son organisation"
        )
    doc_type = await db.fetch_one("SELECT code FROM document_types WHERE code = $1", body.doc_type)
    if doc_type is None:
        raise HTTPException(status_code=400, detail=f"Type de document inconnu: {body.doc_type}")
    await _owns_scope(user, body.scope_type, body.scope_id)

    existing = await db.fetch_one(
        "SELECT id FROM legal_documents WHERE scope_type = $1 AND scope_id = $2 AND doc_type = $3",
        body.scope_type,
        body.scope_id,
        body.doc_type,
    )
    if existing is None:
        row = await db.fetch_one(
            """
            INSERT INTO legal_documents
                (scope_type, scope_id, doc_type, reference, authority,
                 issued_at, expires_at, file_url, status, submitted_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'soumis', $9)
            RETURNING id, scope_type, scope_id, doc_type, status
            """,
            body.scope_type,
            body.scope_id,
            body.doc_type,
            body.reference,
            body.authority,
            body.issued_at,
            body.expires_at,
            body.file_url,
            user["id"],
        )
    else:
        row = await db.fetch_one(
            """
            UPDATE legal_documents
            SET reference = $1, authority = $2, issued_at = $3, expires_at = $4,
                file_url = $5, status = 'soumis', submitted_by = $6, notes = NULL
            WHERE id = $7
            RETURNING id, scope_type, scope_id, doc_type, status
            """,
            body.reference,
            body.authority,
            body.issued_at,
            body.expires_at,
            body.file_url,
            user["id"],
            existing["id"],
        )
    return dict(row)


@router.get("/checklist")
async def company_checklist(
    scope_type: ScopeType = "company",
    scope_id: int | None = Query(None),
    user: dict = Depends(require_roles("company")),
):
    org_id = require_org(user)
    if scope_type in ("company", "product", "social"):
        rows = await db.fetch_all(
            "SELECT id, scope_type, scope_id, doc_type, authority, reference,"
            f" issued_at, expires_at, {DOC_STATUS_SQL} AS status, created_at"
            " FROM legal_documents WHERE scope_type = $1 AND scope_id = $2"
            " ORDER BY created_at DESC",
            scope_type,
            org_id,
        )
        return [dict(r) for r in rows]
    if scope_id is None:
        raise HTTPException(status_code=400, detail="scope_id requis pour ce portée")
    await _owns_scope(user, scope_type, scope_id)
    rows = await db.fetch_all(
        "SELECT id, scope_type, scope_id, doc_type, authority, reference,"
        f" issued_at, expires_at, {DOC_STATUS_SQL} AS status, created_at"
        " FROM legal_documents WHERE scope_type = $1 AND scope_id = $2"
        " ORDER BY created_at DESC",
        scope_type,
        scope_id,
    )
    return [dict(r) for r in rows]


@router.get("/types")
async def list_document_types(_user: dict = Depends(require_roles("company", "admin"))):
    rows = await db.fetch_all(
        "SELECT code, label, scope_type, authority, validity_months, default_blocking, legal_ref"
        " FROM document_types ORDER BY scope_type, label",
    )
    return [dict(r) for r in rows]


@router.get("")
async def list_documents(
    scope_type: str | None = Query(None),
    status: str | None = Query(None),
    org_id: int | None = Query(None),
    _admin: dict = Depends(require_roles("admin")),
):
    conditions: list[str] = []
    values: list = []
    if scope_type is not None:
        conditions.append(f"scope_type = ${len(values) + 1}")
        values.append(scope_type)
    if status is not None:
        conditions.append(f"({DOC_STATUS_SQL}) = ${len(values) + 1}")
        values.append(status)
    if org_id is not None:
        conditions.append(f"scope_id = ${len(values) + 1}")
        values.append(org_id)
    where = f" WHERE {' AND '.join(conditions)}" if conditions else ""
    rows = await db.fetch_all(
        "SELECT id, scope_type, scope_id, doc_type, authority, reference,"
        f" issued_at, expires_at, {DOC_STATUS_SQL} AS status, submitted_by, verified_by,"
        " verified_at, notes, created_at"
        f" FROM legal_documents{where} ORDER BY created_at DESC LIMIT 500",
        *values,
    )
    return [dict(r) for r in rows]


@router.patch("/{doc_id}")
async def verify(
    doc_id: int,
    body: VerificationIn,
    admin: dict = Depends(require_roles("admin")),
):
    if body.status == "rejete" and not (body.notes or "").strip():
        raise HTTPException(status_code=400, detail="Motif obligatoire pour rejeter une pièce")
    row = await db.fetch_one(
        "UPDATE legal_documents SET status = $1, notes = $2, verified_by = $3, verified_at = now()"
        " WHERE id = $4 RETURNING id, scope_type, scope_id, doc_type, status, verified_by",
        body.status,
        body.notes,
        admin["id"],
        doc_id,
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Document introuvable")
    return dict(row)
