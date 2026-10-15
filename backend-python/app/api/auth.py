"""Authentication endpoints: login and current-user introspection."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.config import get_settings
from app.core import security
from app.core.deps import get_current_user
from app.services import db

router = APIRouter()


class LoginRequest(BaseModel):
    email: str
    password: str


class CheckEmailRequest(BaseModel):
    email: str


@router.post("/check-email")
async def check_email(body: CheckEmailRequest):
    row = await db.fetch_one(
        "SELECT id, role, display_name, cooperative_id, company_id, organization_id "
        "FROM users WHERE email=$1 AND is_active",
        body.email,
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Aucun compte associé à cette adresse")

    organization, organization_type = await _resolve_organization(row)
    return {
        "role": row["role"],
        "display_name": row["display_name"],
        "organization": organization,
        "organization_type": organization_type,
    }


async def _resolve_organization(row: dict) -> tuple[str | None, str | None]:
    """Resolve the company/cooperative a user is attached to.

    The organisation (the account's own, or the employer's for a field agent) wins over
    the legacy links, which name the manager's account rather than the company.
    """
    company_id = row.get("company_id")
    org_id = row.get("organization_id")
    if org_id is None and company_id:
        employer = await db.fetch_one("SELECT organization_id FROM users WHERE id=$1", company_id)
        org_id = (employer or {}).get("organization_id")
    if org_id is not None:
        org = await db.fetch_one("SELECT name, org_type FROM organizations WHERE id=$1", org_id)
        if org is not None:
            return org["name"], ("cooperative" if org["org_type"] == "cooperative" else "company")

    if company_id:
        company = await db.fetch_one("SELECT display_name FROM users WHERE id=$1", company_id)
        return (company or {}).get("display_name"), "company"

    cooperative_id = row.get("cooperative_id")
    if cooperative_id:
        cooperative = await db.fetch_one(
            "SELECT cooperative_name FROM community_cooperatives WHERE id=$1",
            cooperative_id,
        )
        return (cooperative or {}).get("cooperative_name"), "cooperative"

    if row["role"] == "company":
        return row["display_name"], "company"

    return None, None


@router.post("/login")
async def login(body: LoginRequest):
    row = await db.fetch_one(
        "SELECT id, email, display_name, role, password_hash, is_active FROM users WHERE email=$1",
        body.email,
    )
    if (
        row is None
        or not row["is_active"]
        or not security.verify_password(body.password, row["password_hash"] or "")
    ):
        raise HTTPException(status_code=401, detail="Identifiants invalides")

    settings = get_settings()
    token = security.create_access_token(
        subject=row["email"],
        role=row["role"],
        user_id=row["id"],
        secret=settings.jwt_secret,
        expires_in=settings.jwt_expire_minutes * 60,
    )
    return {
        "access_token": token,
        "token_type": "bearer",
        "expires_in": settings.jwt_expire_minutes * 60,
        "role": row["role"],
        "display_name": row["display_name"],
    }


@router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    return user
