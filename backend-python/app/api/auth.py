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
