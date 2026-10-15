"""Organization registry: presets, Ministry creation wizard, self-service views."""

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.core import security
from app.core.deps import require_roles
from app.services import compliance, db, ministry, org_backfill

router = APIRouter()

_ORG_COLUMNS = (
    "o.id, o.org_type, o.name, o.legal_form, o.registration_no, o.tax_id, o.email, o.phone, "
    "o.address, o.profile_code, o.is_active, o.created_by, o.created_at"
)


class OrganizationIn(BaseModel):
    name: str = Field(..., min_length=1)
    profile_code: str | None = None
    org_type: Literal["entreprise", "communaute", "cooperative"] | None = None
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
    if body.profile_code:
        profile = await db.fetch_one(
            "SELECT * FROM org_profiles WHERE code = $1", body.profile_code
        )
        if profile is None:
            raise HTTPException(status_code=404, detail="Preset introuvable")
    elif body.org_type == "cooperative":
        profile = {"org_type": "cooperative", "doc_required": []}
    else:
        raise HTTPException(
            status_code=422, detail="Profil requis (sauf coopérative : type « cooperative »)"
        )

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


@router.get("/orphans")
async def orphan_accounts(_admin: dict = Depends(require_roles("admin"))):
    """Comptes ``company`` / ``cooperative`` actifs encore sans entité légale.

    Legs du temps où le compte *était* l'entité légale (``company_id``
    auto-référencé) : ils n'ont pas d'``organization_id``.
    """
    return await org_backfill.list_orphans()


@router.post("/backfill")
async def backfill_accounts(_admin: dict = Depends(require_roles("admin"))):
    """Crée une organisation par compte legacy non rattaché, puis le lie.

    Idempotent : rejouable, chaque organisation porte le compte d'origine
    (``legacy_user_id``). Renvoie les organisations créées et les comptes liés.
    """
    return await org_backfill.backfill()


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


CooperativeProfile = Literal[
    "agricultural_biochar", "energy_briquettes", "artisan_furniture", "bio_chemical_extraction"
]


class AccountIn(BaseModel):
    email: str = Field(..., min_length=3)
    password: str = Field(..., min_length=8)
    role: Literal["company", "operator", "cooperative"] = "operator"
    first_name: str | None = None
    last_name: str | None = None
    display_name: str | None = None
    matricule: str | None = None
    cooperative_profile: CooperativeProfile = "artisan_furniture"
    latitude: float | None = Field(None, ge=-90, le=90)
    longitude: float | None = Field(None, ge=-180, le=180)


#: Libreville — default location of a cooperative until its site is entered.
DEFAULT_COOPERATIVE_POINT = (9.4542, 0.3901)


async def _community_cooperative(org: dict, body: AccountIn) -> int:
    """The organisation's community cooperative (residues, collection), created once."""
    existing = await db.fetch_one(
        "SELECT id FROM community_cooperatives WHERE organization_id = $1", org["id"]
    )
    if existing is not None:
        return existing["id"]
    lon, lat = (
        (body.longitude, body.latitude)
        if body.longitude is not None and body.latitude is not None
        else DEFAULT_COOPERATIVE_POINT
    )
    row = await db.fetch_one(
        """
        INSERT INTO community_cooperatives (geom, cooperative_name, profile_type, organization_id)
        VALUES (ST_SetSRID(ST_MakePoint($1, $2), 4326), $3, $4, $5)
        RETURNING id
        """,
        lon,
        lat,
        org["name"],
        body.cooperative_profile,
        org["id"],
    )
    return row["id"]


@router.get("/directory")
async def directory(
    province: str | None = Query(None),
    org_type: str | None = Query(None, alias="type"),
    _admin: dict = Depends(require_roles("admin")),
):
    """Organisations with type, profile, provinces of their titles and health."""
    return await ministry.organisations(province, org_type)


@router.get("/{org_id}/sheet")
async def organisation_sheet(org_id: int, _admin: dict = Depends(require_roles("admin"))):
    """One place for the Ministry: titles (with province), compliance, accounts, certifications."""
    entries = [o for o in await ministry.organisations() if o["id"] == org_id]
    if not entries:
        raise HTTPException(status_code=404, detail="Organisation introuvable")
    titles = await db.fetch_all(
        """
        SELECT t.id, t.title_type, t.reference, t.status, t.zone, t.surface_ha,
               v.province_code, v.province_source, a.name AS province_name
        FROM forest_titles t
        LEFT JOIN v_title_province v ON v.title_id = t.id
        LEFT JOIN admin_areas a ON a.code = v.province_code
        WHERE t.holder_org_id = $1
        ORDER BY t.created_at DESC
        """,
        org_id,
    )
    accounts = await db.fetch_all(
        "SELECT id, email, display_name, first_name, last_name, matricule, role, is_active"
        " FROM users WHERE organization_id = $1 ORDER BY role, display_name",
        org_id,
    )
    certifications = await db.fetch_all(
        "SELECT id, scheme, cert_type, status, valid_to FROM certifications WHERE org_id = $1"
        " ORDER BY created_at DESC",
        org_id,
    )
    return {
        **entries[0],
        "titles": [dict(t) for t in titles],
        "accounts": [dict(a) for a in accounts],
        "certifications": [dict(c) for c in certifications],
        "warnings": await compliance.assess_org_warnings(org_id),
    }


@router.post("/{org_id}/accounts", status_code=201)
async def create_linked_account(
    org_id: int, body: AccountIn, _admin: dict = Depends(require_roles("admin"))
):
    """Create a login already attached to the organisation (agent or manager)."""
    org = await db.fetch_one("SELECT id, org_type, name FROM organizations WHERE id = $1", org_id)
    if org is None:
        raise HTTPException(status_code=404, detail="Organisation introuvable")
    if await db.fetch_one(
        "SELECT id FROM users WHERE lower(email) = lower($1)", body.email.strip()
    ):
        raise HTTPException(status_code=409, detail="Cet email est déjà utilisé")
    first = (body.first_name or "").strip() or None
    last = (body.last_name or "").strip() or None
    display = (body.display_name or "").strip() or " ".join(p for p in (first, last) if p)
    if body.role == "company" and not display:
        display = org["name"]
    if not display:
        raise HTTPException(status_code=422, detail="Prénom et nom requis")
    cooperative_id = (
        await _community_cooperative(dict(org), body) if body.role == "cooperative" else None
    )
    employer = None
    if body.role == "operator":
        manager = await db.fetch_one(
            "SELECT min(id) AS id FROM users"
            " WHERE organization_id = $1 AND role = 'company' AND is_active",
            org_id,
        )
        employer = manager["id"] if manager else None
    row = await db.fetch_one(
        """
        INSERT INTO users
            (email, display_name, role, password_hash, organization_id, first_name, last_name, matricule,
             cooperative_id, company_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id, email, display_name, role, organization_id, first_name, last_name, matricule,
                  cooperative_id, company_id
        """,
        body.email.strip(),
        display,
        body.role,
        security.hash_password(body.password),
        org_id,
        first,
        last,
        (body.matricule or "").strip() or None,
        cooperative_id,
        employer,
    )
    if body.role == "company":
        await db.execute(
            "UPDATE users SET company_id = $1 WHERE organization_id = $2 AND role = 'operator'"
            " AND company_id IS NULL",
            row["id"],
            org_id,
        )
    return dict(row)


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
