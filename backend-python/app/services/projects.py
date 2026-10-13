"""Project rules shared by the projects API, the home summary and the scan.

A project is either a *chantier* — the field work of an annual cut block
(AAC): its zone is the AAC polygon and its scope the registry trees of that
AAC — or a *participatif* campaign (open citizen science, optional circle). Participation is ``open`` (anyone joins) or
``invitation`` (the creator invites, the person accepts). A scan made "for a
project" is attached only if the person is an active participant, the project
is open, and the tree lies inside the project zone when one is set.
"""

import math

from app.services import db

KINDS = {"chantier", "participatif"}
PARTICIPATIONS = {"open", "invitation"}


def distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    rad = math.pi / 180
    d_lat = (lat2 - lat1) * rad
    d_lon = (lon2 - lon1) * rad
    h = (
        math.sin(d_lat / 2) ** 2
        + math.cos(lat1 * rad) * math.cos(lat2 * rad) * math.sin(d_lon / 2) ** 2
    )
    return 2 * 6371.0 * math.asin(math.sqrt(h))


def in_zone(project: dict, latitude: float, longitude: float) -> bool:
    """True when the project has no zone, or the point lies inside its circle."""
    lat, lon, radius = project.get("latitude"), project.get("longitude"), project.get("radius_km")
    if lat is None or lon is None or not radius:
        return True
    return distance_km(lat, lon, latitude, longitude) <= radius


async def in_project_zone(project: dict, latitude: float, longitude: float) -> bool:
    """AAC polygon for a chantier, else the optional circle."""
    if project.get("aac_id"):
        row = await db.fetch_one(
            "SELECT geom IS NOT NULL AS has_geom, "
            "ST_Covers(geom, ST_SetSRID(ST_MakePoint($2, $1), 4326)) AS inside "
            "FROM annual_cut_blocks WHERE id=$3",
            latitude,
            longitude,
            project["aac_id"],
        )
        if row is None or not row["has_geom"]:
            return True
        return bool(row["inside"])
    return in_zone(project, latitude, longitude)


async def aac_for_chantier(aac_id: int) -> dict | None:
    """The AAC and the organisation holding its title (who may run the chantier)."""
    row = await db.fetch_one(
        """
        SELECT b.id, b.label, t.holder_org_id
        FROM annual_cut_blocks b
        JOIN management_units u ON u.id = b.ufa_id
        JOIN forest_titles t ON t.id = u.title_id
        WHERE b.id = $1
        """,
        aac_id,
    )
    return dict(row) if row else None


async def participant_status(project_id: int, user_id: int) -> str | None:
    row = await db.fetch_one(
        "SELECT status FROM project_participants WHERE project_id=$1 AND user_id=$2",
        project_id,
        user_id,
    )
    return row["status"] if row else None


async def resolve_scan_project(
    project_id: int | None, user: dict | None, latitude: float, longitude: float
) -> tuple[int | None, str | None, str | None]:
    """(project id to store, project title, note) for a scan made for a project."""
    if project_id is None:
        return None, None, None
    if user is None:
        return None, None, "project_login_required"
    project = await db.fetch_one(
        "SELECT id, title, status, latitude, longitude, radius_km, aac_id FROM projects WHERE id=$1",
        project_id,
    )
    if project is None:
        return None, None, "project_unknown"
    project = dict(project)
    if project["status"] != "open":
        return None, project["title"], "project_closed"
    if await participant_status(project_id, user["id"]) != "active":
        return None, project["title"], "project_not_member"
    if not await in_project_zone(project, latitude, longitude):
        return None, project["title"], "project_out_of_zone"
    return project_id, project["title"], None
