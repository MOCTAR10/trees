"""Compliance gate read API: two-tier assessment of a felling declaration."""

from fastapi import APIRouter, Depends, HTTPException

from app.core.deps import require_roles
from app.services import compliance, db

router = APIRouter()


@router.get("/felling/{declaration_id}")
async def assess_felling_declaration(
    declaration_id: int,
    user: dict = Depends(require_roles("company", "admin")),
):
    decl = await db.fetch_one("SELECT * FROM felling_declarations WHERE id = $1", declaration_id)
    if decl is None:
        raise HTTPException(status_code=404, detail="Déclaration introuvable")
    if user["role"] == "company":
        company_id = user.get("company_id") or user["id"]
        if decl["company_id"] != company_id:
            raise HTTPException(status_code=403, detail="Déclaration d'une autre entreprise")
    result = await compliance.evaluate(declaration_id)
    return dict(result if result is not None else {})
