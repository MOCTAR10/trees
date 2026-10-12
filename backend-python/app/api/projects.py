"""Projects: field data-collection campaigns (Ministry / companies)."""

from fastapi import APIRouter, Depends, HTTPException

from pydantic import BaseModel, Field

from app.core.deps import get_current_user
from app.services import db

router = APIRouter()

_TARGET_TYPES = {"species", "family", "genus", "all"}
_OBJECTIVES = {"cartographie", "inventaire", "sante", "restauration", "autre"}
_STATUSES = {"draft", "open", "closed"}


class ProjectCreate(BaseModel):
    title: str = Field(..., min_length=1)
    description: str = ""
    target_type: str = "all"
    target_value: str = ""
    objective: str = "cartographie"
    latitude: float | None = None
    longitude: float | None = None
    radius_km: float | None = None


class ProjectStatus(BaseModel):
    status: str


class AttributeRequest(BaseModel):
    scan_id: int


def _validate(payload: ProjectCreate) -> None:
    if payload.target_type not in _TARGET_TYPES:
        raise HTTPException(status_code=422, detail="type de cible invalide")
    if payload.objective not in _OBJECTIVES:
        raise HTTPException(status_code=422, detail="objectif invalide")


@router.get("")
async def list_projects(user: dict = Depends(get_current_user)):
    rows = await db.fetch_all(
        """
        SELECT p.id, p.title, p.description, p.target_type, p.target_value, p.objective,
               p.latitude, p.longitude, p.radius_km, p.status, p.created_by, p.created_at,
               (SELECT COUNT(*) FROM project_participants pp WHERE pp.project_id = p.id) AS participant_count,
               (SELECT COUNT(*) FROM tree_scans ts WHERE ts.project_id = p.id) AS scan_count
        FROM projects p
        ORDER BY p.created_at DESC
        """
    )
    return [dict(r) for r in rows]


@router.post("")
async def create_project(payload: ProjectCreate, user: dict = Depends(get_current_user)):
    if user["role"] not in ("admin", "company"):
        raise HTTPException(status_code=403, detail="Réservé au ministère / entreprises")
    _validate(payload)
    row = await db.fetch_one(
        """
        INSERT INTO projects
            (title, description, target_type, target_value, objective,
             latitude, longitude, radius_km, status, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open', $9)
        RETURNING id, title, description, target_type, target_value, objective,
                  latitude, longitude, radius_km, status, created_by, created_at
        """,
        payload.title,
        payload.description,
        payload.target_type,
        payload.target_value,
        payload.objective,
        payload.latitude,
        payload.longitude,
        payload.radius_km,
        user["id"],
    )
    return dict(row)


@router.get("/{project_id}")
async def project_detail(project_id: int, user: dict = Depends(get_current_user)):
    row = await db.fetch_one(
        """
        SELECT p.id, p.title, p.description, p.target_type, p.target_value, p.objective,
               p.latitude, p.longitude, p.radius_km, p.status, p.created_by, p.created_at,
               (SELECT COUNT(*) FROM project_participants pp WHERE pp.project_id = p.id) AS participant_count,
               (SELECT COUNT(*) FROM tree_scans ts WHERE ts.project_id = p.id) AS scan_count,
               (SELECT COUNT(DISTINCT ts.species_scientific_name) FROM tree_scans ts
                WHERE ts.project_id = p.id AND ts.species_scientific_name IS NOT NULL) AS species_count,
               (SELECT COUNT(DISTINCT ts.user_id) FROM tree_scans ts
                WHERE ts.project_id = p.id) AS contributor_count,
               EXISTS(SELECT 1 FROM project_participants pp
                      WHERE pp.project_id = p.id AND pp.company_id = $2) AS is_participant
        FROM projects p
        WHERE p.id = $1
        """,
        project_id,
        user["id"],
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Projet introuvable")

    contributions = await db.fetch_all(
        """
        SELECT ts.id, ts.species_scientific_name, ts.measured_dbh_cm, ts.health_status,
               ST_Y(ts.geom) AS latitude, ST_X(ts.geom) AS longitude, ts.created_at,
               u.display_name AS owner_name
        FROM tree_scans ts
        JOIN users u ON u.id = ts.user_id
        WHERE ts.project_id = $1
        ORDER BY ts.created_at DESC
        """,
        project_id,
    )
    result = dict(row)
    result["contributions"] = [dict(c) for c in contributions]
    return result


@router.post("/{project_id}/join")
async def join_project(project_id: int, user: dict = Depends(get_current_user)):
    if user["role"] not in ("company", "admin"):
        raise HTTPException(status_code=403, detail="Réservé aux entreprises")
    exists = await db.fetch_one("SELECT id FROM projects WHERE id=$1", project_id)
    if exists is None:
        raise HTTPException(status_code=404, detail="Projet introuvable")
    await db.execute(
        "INSERT INTO project_participants (project_id, company_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        project_id,
        user["id"],
    )
    return {"id": project_id, "joined": True}


@router.post("/{project_id}/leave")
async def leave_project(project_id: int, user: dict = Depends(get_current_user)):
    await db.execute(
        "DELETE FROM project_participants WHERE project_id=$1 AND company_id=$2",
        project_id,
        user["id"],
    )
    return {"id": project_id, "joined": False}


@router.post("/{project_id}/attribute")
async def attribute_scan(
    project_id: int, payload: AttributeRequest, user: dict = Depends(get_current_user)
):
    project = await db.fetch_one("SELECT id, status FROM projects WHERE id=$1", project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Projet introuvable")
    if project["status"] == "closed":
        raise HTTPException(status_code=400, detail="Projet clôturé")
    scan = await db.fetch_one("SELECT id, user_id FROM tree_scans WHERE id=$1", payload.scan_id)
    if scan is None:
        raise HTTPException(status_code=404, detail="Scan introuvable")
    if scan["user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Ce scan ne vous appartient pas")
    await db.execute(
        "UPDATE tree_scans SET project_id=$2 WHERE id=$1", payload.scan_id, project_id
    )
    return {"scan_id": payload.scan_id, "project_id": project_id}


@router.post("/{project_id}/status")
async def set_project_status(
    project_id: int, payload: ProjectStatus, user: dict = Depends(get_current_user)
):
    if payload.status not in _STATUSES:
        raise HTTPException(status_code=422, detail="statut invalide")
    row = await db.fetch_one("SELECT created_by FROM projects WHERE id=$1", project_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Projet introuvable")
    if user["role"] != "admin" and row["created_by"] != user["id"]:
        raise HTTPException(status_code=403, detail="Réservé au créateur / ministère")
    await db.execute("UPDATE projects SET status=$2 WHERE id=$1", project_id, payload.status)
    return {"id": project_id, "status": payload.status}
