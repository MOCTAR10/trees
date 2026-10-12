"""Organization registry: presets, Ministry creation wizard, self-service views."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.deps import require_roles
from app.services import db

router = APIRouter()

_ORG_COLUMNS = (
    "o.id, o.org_type, o.name, o.legal_form, o.registration_no, o.tax_id, o.email, o.phone, "
    "o.address, o.profile_code, o.is_active, o.created_by, o.created_at"
)


class OrganizationIn(BaseModel):
    name: str = Field(..., min_length=1)
    profile_code: str = Field(..., min_length=1)
    legal_form: str | None = None
    registration_no: str | None = None
    tax_id: str | None = None
    email: str | None = None
    phone: str | None = None
    address: str | None = None
    user_id: int | None = None


def require_org(user: dict) -> int | None:
    org_id = user.get("organization_id")
    if org_id is None:
        raise HTTPException(
            status_code=409,
            detail="Aucune organisation liée à ce compte — le Ministère doit créer"
            " l'organisation puis la lier au compte avant toute opération",
        )
    return org_id


async def _resolve_doc_labels(codes: list[str]) -> dict[str, str]:
    if not codes:
        return {}
    rows = await db.fetch_all(
        "SELECT code, label FROM document_types WHERE code = ANY($1::text[])",
        codes,
    )
    return {r["code"]: r["label"] for r in rows}


async def _profile_payload(row: dict) -> dict:
    labels = await _resolve_doc_labels(row["doc_required"] or [])
    payload = dict(row)
    payload["doc_required"] = [
        {"code": c, "label": labels.get(c, c)} for c in (row["doc_required"] or [])
    ]
    return payload


@router.get("/profiles")
async def list_profiles(_user: dict = Depends(require_roles("company", "admin"))):
    rows = await db.fetch_all(
        "SELECT code, label, org_type, activities, allowed_title_types,"
        " doc_required, enabled_modules, obligations, description"
        " FROM org_profiles ORDER BY code"
    )
    return [await _profile_payload(row) for row in rows]


@router.post("", status_code=201)
async def create_organization(body: OrganizationIn, admin: dict = Depends(require_roles("admin"))):
    profile = await db.fetch_one("SELECT * FROM org_profiles WHERE code = $1", body.profile_code)
    if profile is None:
        raise HTTPException(status_code=404, detail="Preset introuvable")

    row = await db.fetch_one(
        """
        INSERT INTO organizations
            (org_type, name, legal_form, registration_no, tax_id, email, phone, address,
             profile_code, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id, org_type, profile_code
        """,
        profile["org_type"],
        body.name,
        body.legal_form,
        body.registration_no,
        body.tax_id,
        body.email,
        body.phone,
        body.address,
        body.profile_code,
        admin["id"],
    )

    checklist = await _insert_checklist(row["id"], profile["doc_required"] or [])

    linked = None
    if body.user_id is not None:
        linked = await db.fetch_one(
            "UPDATE users SET organization_id = $1 WHERE id = $2 AND role = 'company'"
            " RETURNING id, email, display_name",
            row["id"],
            body.user_id,
        )
        if linked is None:
            raise HTTPException(
                status_code=400, detail="user_id ne pointe pas vers un compte entreprise"
            )

    return {
        "organization": {
            "id": row["id"],
            "org_type": row["org_type"],
            "profile_code": row["profile_code"],
        },
        "checklist": checklist,
        "linked_user": dict(linked) if linked else None,
    }


async def _insert_checklist(org_id: int, doc_required: list[str]) -> list[dict]:
    checklist: list[dict] = []
    for code in doc_required:
        await db.execute(
            """
            INSERT INTO legal_documents
                (scope_type, scope_id, doc_type, status)
            VALUES ('company', $1, $2, 'manquant')
            """,
            org_id,
            code,
        )
        checklist.append({"doc_type": code, "status": "manquant"})
    return checklist


@router.get("")
async def list_organizations(_admin: dict = Depends(require_roles("admin"))):
    rows = await db.fetch_all(
        f"SELECT {_ORG_COLUMNS}, p.label AS profile_label"
        " FROM organizations o"
        " LEFT JOIN org_profiles p ON p.code = o.profile_code"
        " ORDER BY o.id"
    )
    return [dict(r) for r in rows]


@router.get("/me")
async def my_organization(user: dict = Depends(require_roles("company", "operator"))):
    org_id = require_org(user)
    return await _org_detail(org_id, user)


@router.get("/me/titles")
async def my_titles(user: dict = Depends(require_roles("company", "operator"))):
    org_id = require_org(user)
    rows = await db.fetch_all(
        "SELECT id, title_type, reference, zone, surface_ha, status,"
        " exploration_start, exploration_end, cpaet_start, cpaet_end,"
        " pa_approved_at, grant_ref, grant_date, created_at"
        " FROM forest_titles WHERE holder_org_id = $1 ORDER BY created_at DESC",
        org_id,
    )
    return [dict(r) for r in rows]


@router.get("/me/documents")
async def my_documents(user: dict = Depends(require_roles("company", "operator"))):
    org_id = require_org(user)
    rows = await db.fetch_all(
        "SELECT id, scope_type, scope_id, doc_type, authority, reference,"
        " issued_at, expires_at, status, created_at"
        " FROM legal_documents WHERE scope_type = 'company' AND scope_id = $1"
        " ORDER BY created_at DESC",
        org_id,
    )
    return [dict(r) for r in rows]


@router.get("/{org_id}")
async def get_organization(org_id: int, user: dict = Depends(require_roles("company", "admin"))):
    if user["role"] == "company" and user.get("organization_id") != org_id:
        raise HTTPException(status_code=403, detail="Organisation d'un autre compte")
    return await _org_detail(org_id, user)


async def _org_detail(org_id: int, _user: dict) -> dict:
    row = await db.fetch_one(
        f"SELECT {_ORG_COLUMNS}, p.label AS profile_label"
        " FROM organizations o"
        " LEFT JOIN org_profiles p ON p.code = o.profile_code"
        " WHERE o.id = $1",
        org_id,
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Organisation introuvable")
    docs = await db.fetch_all(
        "SELECT doc_type, status FROM legal_documents"
        " WHERE scope_type = 'company' AND scope_id = $1",
        org_id,
    )
    checklist = {r["doc_type"]: r["status"] for r in docs}
    required = []
    if row["profile_code"]:
        profile_row = await db.fetch_one(
            "SELECT doc_required FROM org_profiles WHERE code = $1", row["profile_code"]
        )
        codes = list(profile_row["doc_required"] or []) if profile_row is not None else []
        labels = await _resolve_doc_labels(codes)
        required = [
            {
                "doc_type": code,
                "label": labels.get(code, code),
                "status": checklist.get(code, "manquant"),
            }
            for code in codes
        ]
    return {"organization": dict(row), "checklist": required}
