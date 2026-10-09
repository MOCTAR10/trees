"""Admin interface: user & cooperative management + platform stats."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core import security
from app.core.deps import require_roles
from app.services import db

router = APIRouter()

VALID_ROLES = {"operator", "cooperative", "company", "admin"}
_USER_COLUMNS = "id, email, display_name, role, is_active, cooperative_id, company_id, created_at"


class CreateUserRequest(BaseModel):
    email: str
    display_name: str
    password: str
    role: str
    cooperative_id: int | None = None
    company_id: int | None = None


@router.post("/users", status_code=201)
async def create_user(body: CreateUserRequest, _admin: dict = Depends(require_roles("admin"))):
    if body.role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail=f"Rôle invalide: {body.role}")
    if body.role == "cooperative" and body.cooperative_id is None:
        raise HTTPException(
            status_code=400, detail="Un utilisateur coopérative doit référencer une coopérative"
        )
    if body.cooperative_id is not None:
        coop = await db.fetch_one(
            "SELECT id FROM community_cooperatives WHERE id=$1", body.cooperative_id
        )
        if coop is None:
            raise HTTPException(status_code=404, detail="Coopérative introuvable")

    existing = await db.fetch_one("SELECT id FROM users WHERE email=$1", body.email)
    if existing is not None:
        raise HTTPException(status_code=409, detail="Cet email est déjà utilisé")

    row = await db.fetch_one(
        """
        INSERT INTO users (email, display_name, role, password_hash, cooperative_id, company_id)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, email, display_name, role, cooperative_id, company_id, created_at
        """,
        body.email,
        body.display_name,
        body.role,
        security.hash_password(body.password),
        body.cooperative_id,
        body.company_id,
    )
    return dict(row)


@router.get("/users")
async def list_users(admin: dict = Depends(require_roles("admin"))):
    rows = await db.fetch_all(f"SELECT {_USER_COLUMNS} FROM users ORDER BY id")
    return [dict(r) for r in rows]


@router.get("/cooperatives")
async def list_cooperatives(admin: dict = Depends(require_roles("admin"))):
    rows = await db.fetch_all(
        "SELECT id, cooperative_name, profile_type, capacity_kg_per_day, is_certified, "
        "ST_Y(geom) AS latitude, ST_X(geom) AS longitude "
        "FROM community_cooperatives ORDER BY cooperative_name"
    )
    return [dict(r) for r in rows]


@router.get("/stats")
async def stats(admin: dict = Depends(require_roles("admin"))):
    row = await db.fetch_one(
        """
        SELECT
            (SELECT count(*) FROM users) AS users,
            (SELECT count(*) FROM community_cooperatives) AS cooperatives,
            (SELECT count(*) FROM tree_scans) AS scans,
            (SELECT count(*) FROM tree_scans_and_residues) AS residues,
            (SELECT count(*) FROM tree_scans_and_residues
                WHERE status='available') AS residues_available,
            (SELECT count(*) FROM tree_scans_and_residues
                WHERE status='allocated') AS residues_allocated,
            (SELECT count(*) FROM tree_scans_and_residues
                WHERE status='collected') AS residues_collected,
        (SELECT coalesce(sum(
            coalesce(weight_branches_fine_kg, 0) + coalesce(weight_branches_thick_kg, 0)
            + coalesce(weight_bark_kg, 0) + coalesce(weight_foliar_kg, 0)
            + coalesce(weight_roots_kg, 0)), 0)
            FROM tree_scans_and_residues) AS waste_kg
        """
    )
    return dict(row)
