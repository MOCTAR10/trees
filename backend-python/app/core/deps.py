"""FastAPI auth dependencies: current-user resolution and role guards."""

from fastapi import Depends, Header, HTTPException

from app.config import get_settings
from app.core import security
from app.services import db

_USER_COLUMNS = "id, email, display_name, role, is_active, cooperative_id, company_id"


async def get_current_user(authorization: str | None = Header(None)) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Authentification requise")
    token = authorization.split(" ", 1)[1].strip()
    try:
        payload = security.decode_access_token(token, get_settings().jwt_secret)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=f"Jeton invalide: {exc}") from exc

    row = await db.fetch_one(f"SELECT {_USER_COLUMNS} FROM users WHERE id=$1", payload.get("uid"))
    if row is None or not row["is_active"]:
        raise HTTPException(status_code=401, detail="Utilisateur introuvable ou inactif")
    return dict(row)


async def get_optional_user(authorization: str | None = Header(None)) -> dict | None:
    """Resolve the caller if a valid bearer token is present, else None.

    Used by public scan endpoints so anonymous field captures keep working.
    """
    if not authorization:
        return None
    try:
        return await get_current_user(authorization)
    except HTTPException:
        return None


def require_roles(*roles: str):
    async def _guard(user: dict = Depends(get_current_user)) -> dict:
        if user["role"] not in roles:
            raise HTTPException(
                status_code=403,
                detail=f"Accès refusé: rôle requis parmi {', '.join(roles)}",
            )
        return user

    return _guard
