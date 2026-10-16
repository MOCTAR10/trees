"""Projects: official work sites (chantiers) and open participative campaigns."""

import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.deps import get_current_user
from app.services import db
from app.services.projects import KINDS, PARTICIPATIONS, aac_for_chantier, participant_status

router = APIRouter()

_TARGET_TYPES = {"species", "family", "genus", "all"}
_OBJECTIVES = {"cartographie", "inventaire", "sante", "restauration", "autre"}
_STATUSES = {"draft", "open", "closed"}

_PROJECT_COLUMNS = """
    p.id, p.title, p.description, p.target_type, p.target_value, p.objective,
    p.latitude, p.longitude, p.radius_km, p.status, p.created_by, p.created_at,
    p.kind, p.participation, p.aac_id,
    (SELECT b.label FROM annual_cut_blocks b WHERE b.id = p.aac_id) AS aac_label,
    (SELECT ST_Y(ST_Centroid(b.geom)) FROM annual_cut_blocks b WHERE b.id = p.aac_id) AS aac_lat,
    (SELECT ST_X(ST_Centroid(b.geom)) FROM annual_cut_blocks b WHERE b.id = p.aac_id) AS aac_lon,
    (SELECT COUNT(*) FROM tree_registry r WHERE r.aac_id = p.aac_id) AS registry_trees,
    (SELECT COUNT(DISTINCT ts.tree_code) FROM tree_scans ts
       JOIN tree_registry r ON r.tree_code = ts.tree_code
      WHERE ts.project_id = p.id AND r.aac_id = p.aac_id) AS registry_scanned,
    (SELECT COUNT(*) FROM project_participants pp
      WHERE pp.project_id = p.id AND pp.status = 'active') AS participant_count,
    (SELECT COUNT(*) FROM tree_scans ts WHERE ts.project_id = p.id) AS scan_count
"""


class ProjectCreate(BaseModel):
    title: str = Field(..., min_length=1)
    description: str = ""
    target_type: str = "all"
    target_value: str = ""
    objective: str = "cartographie"
    latitude: float | None = None
    longitude: float | None = None
    radius_km: float | None = Field(None, gt=0)
    kind: str = "participatif"
    participation: str | None = None
    aac_id: int | None = None


class ProjectStatus(BaseModel):
    status: str


class AttributeRequest(BaseModel):
    scan_id: int


class InviteRequest(BaseModel):
    user_ids: list[int] = Field(default_factory=list)
    emails: list[str] = Field(default_factory=list)


def _validate(payload: ProjectCreate) -> None:
    if payload.target_type not in _TARGET_TYPES:
        raise HTTPException(status_code=422, detail="type de cible invalide")
    if payload.objective not in _OBJECTIVES:
        raise HTTPException(status_code=422, detail="objectif invalide")
    if payload.kind not in KINDS:
        raise HTTPException(status_code=422, detail="type de projet invalide")
    if payload.participation is not None and payload.participation not in PARTICIPATIONS:
        raise HTTPException(status_code=422, detail="mode de participation invalide")


async def _project_or_404(project_id: int) -> dict:
    row = await db.fetch_one(
        "SELECT id, title, status, participation, created_by FROM projects WHERE id=$1",
        project_id,
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Projet introuvable")
    return dict(row)


def _can_manage(project: dict, user: dict) -> bool:
    return user["role"] == "admin" or project["created_by"] == user["id"]


@router.get("")
async def list_projects(user: dict = Depends(get_current_user)):
    """Every project the caller can see, with their own participation status.

    Invitation-only projects are listed only to their creator, admins and the
    people invited to them.
    """
    rows = await db.fetch_all(
        f"""
        SELECT {_PROJECT_COLUMNS},
               (SELECT pp.status FROM project_participants pp
                 WHERE pp.project_id = p.id AND pp.user_id = $1) AS my_status
        FROM projects p
        WHERE p.participation = 'open'
           OR p.created_by = $1
           OR $2 = 'admin'
           OR EXISTS (SELECT 1 FROM project_participants pp
                       WHERE pp.project_id = p.id AND pp.user_id = $1)
        ORDER BY p.created_at DESC
        """,
        user["id"],
        user["role"],
    )
    return [dict(r) for r in rows]


@router.post("")
async def create_project(payload: ProjectCreate, user: dict = Depends(get_current_user)):
    if user["role"] not in ("admin", "company"):
        raise HTTPException(status_code=403, detail="Réservé au ministère / entreprises")
    _validate(payload)
    aac_id = None
    if payload.kind == "chantier":
        if payload.aac_id is None:
            raise HTTPException(status_code=422, detail="Un chantier se rattache à une AAC")
        aac = await aac_for_chantier(payload.aac_id)
        if aac is None:
            raise HTTPException(status_code=404, detail="AAC introuvable")
        if user["role"] != "admin" and aac["holder_org_id"] != user.get("organization_id"):
            raise HTTPException(
                status_code=403, detail="Cette AAC n'appartient pas à votre entreprise"
            )
        aac_id = aac["id"]
    participation = payload.participation or (
        "invitation" if payload.kind == "chantier" else "open"
    )
    row = await db.fetch_one(
        """
        INSERT INTO projects
            (title, description, target_type, target_value, objective,
             latitude, longitude, radius_km, status, created_by, kind, participation, aac_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open', $9, $10, $11, $12)
        RETURNING id, title, description, target_type, target_value, objective,
                  latitude, longitude, radius_km, status, created_by, created_at,
                  kind, participation, aac_id
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
        payload.kind,
        participation,
        aac_id,
    )
    return dict(row)


@router.get("/aac-options")
async def aac_options(user: dict = Depends(get_current_user)):
    """AACs a chantier can be opened on: all for the Ministry, the company's own otherwise."""
    if user["role"] not in ("admin", "company"):
        return []
    rows = await db.fetch_all(
        """
        SELECT b.id, b.label, b.status, b.campaign_year, u.label AS ufa_label,
               t.reference AS title_reference,
               (SELECT COUNT(*) FROM tree_registry r WHERE r.aac_id = b.id) AS registry_trees
        FROM annual_cut_blocks b
        JOIN management_units u ON u.id = b.ufa_id
        JOIN forest_titles t ON t.id = u.title_id
        WHERE $1 = 'admin' OR t.holder_org_id = $2
        ORDER BY b.campaign_year DESC NULLS LAST, b.label
        """,
        user["role"],
        user.get("organization_id"),
    )
    return [dict(r) for r in rows]


@router.get("/{project_id}")
async def project_detail(project_id: int, user: dict = Depends(get_current_user)):
    row = await db.fetch_one(
        f"""
        SELECT {_PROJECT_COLUMNS},
               (SELECT COUNT(DISTINCT ts.species_scientific_name) FROM tree_scans ts
                WHERE ts.project_id = p.id AND ts.species_scientific_name IS NOT NULL) AS species_count,
               (SELECT COUNT(DISTINCT ts.user_id) FROM tree_scans ts
                WHERE ts.project_id = p.id) AS contributor_count,
               (SELECT pp.status FROM project_participants pp
                 WHERE pp.project_id = p.id AND pp.user_id = $2) AS my_status,
               (SELECT COUNT(*) FROM tree_scans ts
                 WHERE ts.project_id = p.id AND ts.user_id = $2) AS my_scan_count
        FROM projects p
        WHERE p.id = $1
        """,
        project_id,
        user["id"],
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Projet introuvable")
    result = dict(row)
    if (
        result["participation"] == "invitation"
        and result["my_status"] is None
        and not _can_manage(result, user)
    ):
        raise HTTPException(status_code=404, detail="Projet introuvable")
    result["is_participant"] = result["my_status"] == "active"

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
    result["contributions"] = [dict(c) for c in contributions]
    if _can_manage(result, user):
        people = await db.fetch_all(
            """
            SELECT pp.user_id, pp.status, pp.joined_at, pp.responded_at,
                   u.display_name, u.first_name, u.last_name, u.matricule
            FROM project_participants pp
            JOIN users u ON u.id = pp.user_id
            WHERE pp.project_id = $1
            ORDER BY pp.status, u.display_name
            """,
            project_id,
        )
        result["participants"] = [dict(p) for p in people]
    return result


@router.get("/{project_id}/chantier")
async def chantier_view(project_id: int, user: dict = Depends(get_current_user)):
    """Everything an agent needs on a chantier: AAC outline, registry trees
    (measured or still to measure), the team and their own recent scans.

    Visible to the people invited to it or taking part, its creator and the Ministry.
    """
    project = await db.fetch_one(
        """
        SELECT p.id, p.title, p.description, p.status, p.kind, p.participation, p.aac_id,
               p.created_by, p.created_at, u.display_name AS created_by_name
        FROM projects p LEFT JOIN users u ON u.id = p.created_by
        WHERE p.id = $1
        """,
        project_id,
    )
    if project is None or project["kind"] != "chantier":
        raise HTTPException(status_code=404, detail="Chantier introuvable")
    project = dict(project)
    my_status = await participant_status(project_id, user["id"])
    if my_status is None and not _can_manage(project, user):
        raise HTTPException(status_code=404, detail="Chantier introuvable")

    aac = None
    if project["aac_id"]:
        row = await db.fetch_one(
            """
            SELECT b.id, b.label, b.status, b.campaign_year, b.surface_ha,
                   u.label AS ufa_label, t.reference AS title_reference,
                   ST_AsGeoJSON(b.geom)::json AS geometry
            FROM annual_cut_blocks b
            JOIN management_units u ON u.id = b.ufa_id
            JOIN forest_titles t ON t.id = u.title_id
            WHERE b.id = $1
            """,
            project["aac_id"],
        )
        aac = dict(row) if row else None
        if aac and isinstance(aac.get("geometry"), str):
            aac["geometry"] = json.loads(aac["geometry"])

    trees = await db.fetch_all(
        """
        SELECT r.id, r.tree_code, r.species_scientific_name, r.status, r.measured_dbh_cm,
               ST_Y(COALESCE(r.stump_geom, r.geom)) AS latitude,
               ST_X(COALESCE(r.stump_geom, r.geom)) AS longitude,
               EXISTS (SELECT 1 FROM tree_scans ts
                        WHERE ts.project_id = $2 AND ts.tree_code = r.tree_code) AS measured,
               EXISTS (SELECT 1 FROM tree_scans ts
                        WHERE ts.project_id = $2 AND ts.tree_code = r.tree_code
                          AND ts.user_id = $3) AS measured_by_me
        FROM tree_registry r
        WHERE r.aac_id = $1
        ORDER BY measured, r.tree_code
        """,
        project["aac_id"],
        project_id,
        user["id"],
    )
    team = await db.fetch_all(
        """
        SELECT pp.user_id, pp.status, u.display_name, u.first_name, u.last_name,
               (SELECT COUNT(*) FROM tree_scans ts
                 WHERE ts.project_id = pp.project_id AND ts.user_id = pp.user_id) AS scans
        FROM project_participants pp
        JOIN users u ON u.id = pp.user_id
        WHERE pp.project_id = $1 AND pp.status IN ('active', 'invited')
        ORDER BY pp.status, scans DESC, u.display_name
        """,
        project_id,
    )
    mine = await db.fetch_all(
        """
        SELECT ts.id, ts.species_scientific_name, ts.measured_dbh_cm, ts.tree_code, ts.created_at
        FROM tree_scans ts
        WHERE ts.project_id = $1 AND ts.user_id = $2
        ORDER BY ts.created_at DESC
        LIMIT 10
        """,
        project_id,
        user["id"],
    )
    tree_rows = [dict(t) for t in trees]
    measured = sum(1 for t in tree_rows if t["measured"])
    return {
        **project,
        "my_status": my_status,
        "aac": aac,
        "trees": tree_rows,
        "progress": {"measured": measured, "total": len(tree_rows)},
        "team": [dict(m) for m in team],
        "my_scans": [dict(m) for m in mine],
    }


@router.post("/{project_id}/join")
async def join_project(project_id: int, user: dict = Depends(get_current_user)):
    """Join an open project in one tap (any role)."""
    project = await _project_or_404(project_id)
    if project["status"] != "open":
        raise HTTPException(status_code=400, detail="Projet clôturé")
    current = await participant_status(project_id, user["id"])
    if project["participation"] == "invitation" and current is None:
        raise HTTPException(status_code=403, detail="Projet sur invitation")
    await db.execute(
        """
        INSERT INTO project_participants (project_id, user_id, status, responded_at)
        VALUES ($1, $2, 'active', now())
        ON CONFLICT (project_id, user_id)
        DO UPDATE SET status = 'active', responded_at = now()
        """,
        project_id,
        user["id"],
    )
    return {"id": project_id, "joined": True, "status": "active"}


@router.post("/{project_id}/accept")
async def accept_invitation(project_id: int, user: dict = Depends(get_current_user)):
    await _project_or_404(project_id)
    if await participant_status(project_id, user["id"]) is None:
        raise HTTPException(status_code=404, detail="Aucune invitation")
    await db.execute(
        "UPDATE project_participants SET status='active', responded_at=now() "
        "WHERE project_id=$1 AND user_id=$2",
        project_id,
        user["id"],
    )
    return {"id": project_id, "joined": True, "status": "active"}


@router.post("/{project_id}/decline")
async def decline_invitation(project_id: int, user: dict = Depends(get_current_user)):
    await _project_or_404(project_id)
    if await participant_status(project_id, user["id"]) is None:
        raise HTTPException(status_code=404, detail="Aucune invitation")
    await db.execute(
        "UPDATE project_participants SET status='declined', responded_at=now() "
        "WHERE project_id=$1 AND user_id=$2",
        project_id,
        user["id"],
    )
    return {"id": project_id, "joined": False, "status": "declined"}


@router.post("/{project_id}/leave")
async def leave_project(project_id: int, user: dict = Depends(get_current_user)):
    await db.execute(
        "DELETE FROM project_participants WHERE project_id=$1 AND user_id=$2",
        project_id,
        user["id"],
    )
    return {"id": project_id, "joined": False, "status": None}


@router.post("/{project_id}/invite")
async def invite(project_id: int, payload: InviteRequest, user: dict = Depends(get_current_user)):
    """Creator / Ministry invites people (by account id or e-mail)."""
    project = await _project_or_404(project_id)
    if not _can_manage(project, user):
        raise HTTPException(status_code=403, detail="Réservé au créateur / ministère")
    ids = set(payload.user_ids)
    for email in payload.emails:
        found = await db.fetch_one(
            "SELECT id FROM users WHERE lower(email)=lower($1)", email.strip()
        )
        if found is None:
            raise HTTPException(status_code=404, detail=f"Compte introuvable : {email}")
        ids.add(found["id"])
    invited = []
    for uid in sorted(ids):
        exists = await db.fetch_one("SELECT id FROM users WHERE id=$1 AND is_active", uid)
        if exists is None:
            raise HTTPException(status_code=404, detail=f"Compte introuvable : {uid}")
        await db.execute(
            """
            INSERT INTO project_participants (project_id, user_id, status, invited_by)
            VALUES ($1, $2, 'invited', $3)
            ON CONFLICT (project_id, user_id)
            DO UPDATE SET status = CASE WHEN project_participants.status = 'active'
                                        THEN 'active' ELSE 'invited' END,
                          invited_by = EXCLUDED.invited_by
            """,
            project_id,
            uid,
            user["id"],
        )
        invited.append(uid)
    return {"id": project_id, "invited": invited}


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
    await db.execute("UPDATE tree_scans SET project_id=$2 WHERE id=$1", payload.scan_id, project_id)
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
