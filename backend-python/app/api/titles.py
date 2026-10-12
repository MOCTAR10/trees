"""Forest titles, UFA, AAC and harvest authorizations (Loi 016/01).

Title lifecycle (Ministry-driven): demande → exploration (autorisation
d'exploration) → provisoire (CPAET) → actif (convention définitive + PA).
Annual operations (company-driven on its own title): prepare → soumettre PAO
(soumis) → autoriser (permis annuel d'opérations) → ouvrir → fermer.
"""

from datetime import date, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.api.organizations import require_org
from app.core.deps import require_roles
from app.services import db

router = APIRouter()

_TITLE_TRANSITIONS: dict[str, set[str]] = {
    "demande": {"exploration", "rejete"},
    "exploration": {"provisoire", "rejete", "retire"},
    "provisoire": {"actif", "rejete", "retire"},
    "actif": {"retire"},
    "rejete": set(),
    "retire": set(),
}

_AAC_STATUSES = ("prepare", "soumis", "autorise", "ouvert", "ferme")


class TitleIn(BaseModel):
    title_type: Literal["CFAD", "PFA", "PGG", "FC"]
    reference: str | None = None
    zone: Literal["permanent", "rural"] = "permanent"
    surface_ha: float | None = Field(None, gt=0)


class TitleDecisionIn(BaseModel):
    decision: Literal["exploration", "provisoire", "actif", "rejete", "retire"]
    motif: str | None = None


class UnitIn(BaseModel):
    label: str = Field(..., min_length=1)
    surface_ha: float | None = Field(None, gt=0)
    plan_amenagement_ref: str | None = None


class AacIn(BaseModel):
    label: str = Field(..., min_length=1)
    campaign_year: int | None = Field(None, ge=2000, le=2100)
    surface_ha: float | None = Field(None, gt=0)
    possibility_m3: float | None = Field(None, gt=0)
    origin: Literal["plan_amenagement", "cpaet_provisoire"] = "plan_amenagement"


class AacActionIn(BaseModel):
    action: Literal["soumettre_pao", "autoriser", "ouvrir", "fermer", "rejeter"]
    pao_reference: str | None = None
    reference: str | None = None
    valid_to: date | None = None
    motif: str | None = None


async def _owner_of_aac(aac_id: int) -> tuple[int, dict] | None:
    row = await db.fetch_one(
        "SELECT a.id, a.status, a.pao_reference, a.ufa_id, t.holder_org_id"
        " FROM annual_cut_blocks a"
        " JOIN management_units u ON u.id = a.ufa_id"
        " JOIN forest_titles t ON t.id = u.title_id"
        " WHERE a.id = $1",
        aac_id,
    )
    if row is None:
        return None
    return row["holder_org_id"], dict(row)


@router.post("", status_code=201)
async def request_title(body: TitleIn, user: dict = Depends(require_roles("company"))):
    org_id = require_org(user)
    row = await db.fetch_one(
        """
        INSERT INTO forest_titles (title_type, reference, holder_org_id, zone, surface_ha,
                                   status, created_by)
        VALUES ($1, $2, $3, $4, $5, 'demande', $6)
        RETURNING id, title_type, reference, status, created_at
        """,
        body.title_type,
        body.reference,
        org_id,
        body.zone,
        body.surface_ha,
        user["id"],
    )
    return dict(row)


@router.get("")
async def list_titles(user: dict = Depends(require_roles("company", "admin"))):
    if user["role"] == "admin":
        org_id_filter = ""
        org_id = None
    else:
        org_id_filter = " WHERE holder_org_id = $1"
        org_id = require_org(user)
    rows = await db.fetch_all(
        "SELECT id, title_type, reference, holder_org_id, zone, surface_ha, status,"
        " exploration_start, exploration_end, cpaet_start, cpaet_end,"
        " pa_approved_at, grant_ref, grant_date, created_at"
        f" FROM forest_titles{org_id_filter} ORDER BY created_at DESC",
        *([org_id] if org_id is not None else []),
    )
    return [dict(r) for r in rows]


@router.get("/{title_id}")
async def get_title(title_id: int, user: dict = Depends(require_roles("company", "admin"))):
    row = await db.fetch_one("SELECT * FROM forest_titles WHERE id = $1", title_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Titre introuvable")
    if user["role"] == "company" and row["holder_org_id"] != require_org(user):
        raise HTTPException(status_code=403, detail="Titre d'une autre organisation")
    return dict(row)


@router.get("/{title_id}/units")
async def list_units(
    title_id: int,
    user: dict = Depends(require_roles("company", "admin")),
):
    title = await db.fetch_one("SELECT holder_org_id FROM forest_titles WHERE id = $1", title_id)
    if title is None:
        raise HTTPException(status_code=404, detail="Titre introuvable")
    if user["role"] == "company" and title["holder_org_id"] != require_org(user):
        raise HTTPException(status_code=403, detail="Titre d'une autre organisation")
    rows = await db.fetch_all(
        "SELECT id, title_id, label, surface_ha, plan_amenagement_ref,"
        " pa_approved_at, pa_expiry, plan_gestion_ref, rotation_years, created_at"
        " FROM management_units WHERE title_id = $1 ORDER BY label",
        title_id,
    )
    return [dict(r) for r in rows]


@router.patch("/{title_id}")
async def decide_title(
    title_id: int,
    body: TitleDecisionIn,
    admin: dict = Depends(require_roles("admin")),
):
    current = await db.fetch_one("SELECT * FROM forest_titles WHERE id = $1", title_id)
    if current is None:
        raise HTTPException(status_code=404, detail="Titre introuvable")
    allowed = _TITLE_TRANSITIONS.get(current["status"], set())
    if body.decision not in allowed:
        raise HTTPException(
            status_code=409,
            detail=f"Transition {current['status']} → {body.decision} impossible",
        )

    today = date.today()
    sets = ["status = $1", "decided_by = $2", "decided_at = now()", "decision_motif = $3"]
    values: list = [body.decision, admin["id"], body.motif]
    if body.decision == "exploration":
        sets.extend(["exploration_start = $4", "exploration_end = $5"])
        values.extend([today, today + timedelta(days=365)])
    elif body.decision == "provisoire":
        sets.extend(["cpaet_start = $4", "cpaet_end = $5"])
        values.extend([today, today + timedelta(days=1080)])
    elif body.decision == "actif":
        sets.append("pa_approved_at = $4")
        values.append(today)
    values.append(title_id)
    row = await db.fetch_one(
        f"UPDATE forest_titles SET {', '.join(sets)} WHERE id = ${len(values)}"
        " RETURNING id, title_type, reference, status",
        *values,
    )
    return dict(row)


@router.post("/{title_id}/units", status_code=201)
async def create_unit(
    title_id: int,
    body: UnitIn,
    admin: dict = Depends(require_roles("admin")),
):
    title = await db.fetch_one("SELECT id FROM forest_titles WHERE id = $1", title_id)
    if title is None:
        raise HTTPException(status_code=404, detail="Titre introuvable")
    row = await db.fetch_one(
        """
        INSERT INTO management_units (title_id, label, surface_ha, plan_amenagement_ref)
        VALUES ($1, $2, $3, $4)
        RETURNING id, title_id, label
        """,
        title_id,
        body.label,
        body.surface_ha,
        body.plan_amenagement_ref,
    )
    return dict(row)


@router.post("/units/{ufa_id}/aacs", status_code=201)
async def create_aac(
    ufa_id: int,
    body: AacIn,
    admin: dict = Depends(require_roles("admin")),
):
    ufa = await db.fetch_one("SELECT id FROM management_units WHERE id = $1", ufa_id)
    if ufa is None:
        raise HTTPException(status_code=404, detail="UFA introuvable")
    row = await db.fetch_one(
        """
        INSERT INTO annual_cut_blocks
            (ufa_id, label, campaign_year, surface_ha, possibility_m3, origin, status)
        VALUES ($1, $2, $3, $4, $5, $6, 'prepare')
        RETURNING id, ufa_id, label, status
        """,
        ufa_id,
        body.label,
        body.campaign_year,
        body.surface_ha,
        body.possibility_m3,
        body.origin,
    )
    return dict(row)


@router.get("/units/{ufa_id}/aacs")
async def list_aacs(
    ufa_id: int,
    user: dict = Depends(require_roles("company", "admin")),
):
    rows = await db.fetch_all(
        "SELECT id, ufa_id, label, campaign_year, surface_ha, possibility_m3, origin, status,"
        " pao_reference, pao_submitted_at FROM annual_cut_blocks WHERE ufa_id = $1"
        " ORDER BY campaign_year NULLS LAST, label",
        ufa_id,
    )
    out = [dict(r) for r in rows]
    if user["role"] == "company":
        org_id = require_org(user)
        owned = await db.fetch_one(
            "SELECT t.holder_org_id FROM management_units u JOIN forest_titles t ON t.id = u.title_id"
            " WHERE u.id = $1",
            ufa_id,
        )
        if owned is None or owned["holder_org_id"] != org_id:
            raise HTTPException(status_code=403, detail="UFA d'une autre organisation")
    return out


@router.patch("/aacs/{aac_id}")
async def act_on_aac(
    aac_id: int,
    body: AacActionIn,
    user: dict = Depends(require_roles("company", "admin")),
):
    owned = await _owner_of_aac(aac_id)
    if owned is None:
        raise HTTPException(status_code=404, detail="AAC introuvable")
    owner_org_id, aac = owned
    if user["role"] == "admin":
        can = {
            "autoriser": aac["status"] == "soumis",
            "ouvrir": aac["status"] == "autorise",
            "fermer": aac["status"] == "ouvert",
            "rejeter": aac["status"] == "soumis",
        }
        if body.action not in can or not can[body.action]:
            raise HTTPException(
                status_code=409,
                detail=f"Action '{body.action}' impossible sur l'AAC {aac['status']}",
            )
    else:
        org_id = require_org(user)
        if owner_org_id != org_id:
            raise HTTPException(status_code=403, detail="AAC d'une autre organisation")
        if body.action != "soumettre_pao" or aac["status"] != "prepare":
            raise HTTPException(
                status_code=409,
                detail="Une entreprise ne peut que soumettre un PAO sur une AAC 'prepare'",
            )
        if not body.pao_reference:
            raise HTTPException(status_code=400, detail="pao_reference requis")

    if body.action == "soumettre_pao":
        row = await db.fetch_one(
            "UPDATE annual_cut_blocks SET status = 'soumis', pao_reference = $1, pao_submitted_at = now()"
            " WHERE id = $2 RETURNING id, status, pao_reference",
            body.pao_reference,
            aac_id,
        )
    elif body.action == "autoriser":
        reference = body.reference or f"PAO-{aac_id}"
        valid_to = body.valid_to or (date.today() + timedelta(days=365))
        row = await db.fetch_one(
            "UPDATE annual_cut_blocks SET status = 'autorise' WHERE id = $1 RETURNING id, status",
            aac_id,
        )
        await db.execute(
            """
            INSERT INTO aac_authorizations
                (aac_id, authorization_type, reference, issued_by, issued_at, valid_from, valid_to, status)
            VALUES ($1, 'permis_annuel_operations', $2, $3, now(), now(), $4, 'delivre')
            """,
            aac_id,
            reference,
            user["id"],
            valid_to,
        )
        return {"id": row["id"], "status": row["status"], "authorization": reference}
    elif body.action == "rejeter":
        row = await db.fetch_one(
            "UPDATE annual_cut_blocks SET status = 'prepare', pao_reference = NULL"
            " WHERE id = $1 RETURNING id, status",
            aac_id,
        )
    else:
        new_status = {"ouvrir": "ouvert", "fermer": "ferme"}[body.action]
        row = await db.fetch_one(
            f"UPDATE annual_cut_blocks SET status = '{new_status}' WHERE id = $1"
            " RETURNING id, status",
            aac_id,
        )
    return dict(row)
