"""Forest titles, UFA, AAC and harvest authorizations (Loi 016/01).

Title lifecycle (Ministry-driven): demande → exploration (autorisation
d'exploration) → provisoire (CPAET) → actif (convention définitive + PA).
Annual operations (company-driven on its own title): prepare → soumettre PAO
(soumis) → autoriser (permis annuel d'opérations) → ouvrir → fermer.
"""

from datetime import date, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field

from app.api.organizations import require_org
from app.core.deps import require_roles
from app.services import db, dme, pdf_report

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


class AuthorizationIn(BaseModel):
    authorization_type: Literal[
        "certificat_assiette", "permis_annuel_operations", "certificat_vente_coupe", "cae"
    ] = "permis_annuel_operations"
    reference: str | None = None
    valid_from: date | None = None
    valid_to: date | None = None
    plan_document_id: int | None = None


class AuthorizationDecisionIn(BaseModel):
    decision: Literal["delivre", "rejete"]
    motif: str | None = None


class DmeEntryIn(BaseModel):
    species_scientific_name: str = Field(..., min_length=1)
    dme_cm: float = Field(..., gt=0, le=400)
    source: str | None = None


class UfaDmeIn(BaseModel):
    entries: list[DmeEntryIn] = Field(..., min_length=1, max_length=500)


class ConventionIn(BaseModel):
    convention_type: Literal["provisoire", "definitive"]
    reference: str = Field(..., min_length=1)
    signed_at: date | None = None
    start_date: date | None = None
    end_date: date | None = None
    surface_ha: float | None = Field(None, gt=0)
    motif: str | None = None


class ConventionDecisionIn(BaseModel):
    status: Literal["active", "expiree", "resiliee"]
    motif: str | None = None


class AttestationIn(BaseModel):
    reference: str = Field(..., min_length=1)
    issued_at: date | None = None


#: Rank of each title status, used to *promote* a title when a convention is
#: signed without ever resurrecting a retired/expired/rejected one.
_TITLE_RANK = {
    "demande": 0,
    "exploration": 1,
    "provisoire": 2,
    "actif": 3,
    "expire": 3,
    "retire": 3,
    "rejete": 3,
}
_CONVENTION_TARGET = {"provisoire": "provisoire", "definitive": "actif"}

_CONVENTION_SELECT = (
    "SELECT c.id, c.title_id, c.convention_type, c.reference, c.signed_at, c.start_date,"
    " c.end_date, c.surface_ha, c.status, c.attestation_ref, c.attestation_issued_at,"
    " c.attestation_issued_by, c.decision_motif, c.decided_by, c.decided_at, c.created_at,"
    " t.title_type, t.reference AS title_ref, t.holder_org_id, o.name AS org_name"
    " FROM title_conventions c"
    " JOIN forest_titles t ON t.id = c.title_id"
    " LEFT JOIN organizations o ON o.id = t.holder_org_id"
)

_AUTH_SELECT = (
    "SELECT aa.id, aa.aac_id, aa.authorization_type, aa.reference, aa.issued_by,"
    " aa.issued_at, aa.valid_from, aa.valid_to, aa.startup_notified_at,"
    " aa.startup_notified_by, aa.plan_document_id, aa.status, aa.decision_motif,"
    " aa.created_at, a.label AS aac_label, t.id AS title_id, t.reference AS title_ref,"
    " t.holder_org_id, o.name AS org_name"
    " FROM aac_authorizations aa"
    " JOIN annual_cut_blocks a ON a.id = aa.aac_id"
    " JOIN management_units u ON u.id = a.ufa_id"
    " JOIN forest_titles t ON t.id = u.title_id"
    " LEFT JOIN organizations o ON o.id = t.holder_org_id"
)


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


async def _owner_of_ufa(ufa_id: int) -> tuple[int, dict] | None:
    row = await db.fetch_one(
        "SELECT u.id, u.title_id, u.label, u.surface_ha, t.holder_org_id"
        " FROM management_units u"
        " JOIN forest_titles t ON t.id = u.title_id"
        " WHERE u.id = $1",
        ufa_id,
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


def _dme_payload(ufa: dict, entries: list[dict]) -> dict:
    return {
        "ufa_id": ufa["id"],
        "title_id": ufa["title_id"],
        "label": ufa["label"],
        "entries": entries,
    }


@router.get("/units/{ufa_id}/dme")
async def list_ufa_dme(
    ufa_id: int,
    user: dict = Depends(require_roles("company", "admin")),
):
    """Effective DME matrix for a UFA: official entries + provisional defaults."""
    owner = await _owner_of_ufa(ufa_id)
    if owner is None:
        raise HTTPException(status_code=404, detail="UFA introuvable")
    if user["role"] == "company" and owner[0] != require_org(user):
        raise HTTPException(status_code=403, detail="UFA d'une autre organisation")
    return _dme_payload(owner[1], await dme.effective_for_ufa(ufa_id))


@router.put("/units/{ufa_id}/dme")
async def set_ufa_dme(
    ufa_id: int,
    body: UfaDmeIn,
    admin: dict = Depends(require_roles("admin")),
):
    """Fix the official DME for one or several species of a UFA (art. 124)."""
    owner = await _owner_of_ufa(ufa_id)
    if owner is None:
        raise HTTPException(status_code=404, detail="UFA introuvable")
    await dme.upsert(ufa_id, [entry.model_dump() for entry in body.entries], admin["id"])
    return _dme_payload(owner[1], await dme.effective_for_ufa(ufa_id))


@router.delete("/units/{ufa_id}/dme/{species}")
async def clear_ufa_dme(
    ufa_id: int,
    species: str,
    admin: dict = Depends(require_roles("admin")),
):
    """Drop a UFA-specific DME so the provisional default applies again."""
    owner = await _owner_of_ufa(ufa_id)
    if owner is None:
        raise HTTPException(status_code=404, detail="UFA introuvable")
    await dme.remove_override(ufa_id, species)
    return _dme_payload(owner[1], await dme.effective_for_ufa(ufa_id))


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


# ───────────────────────── Autorisation d'exploiter ─────────────────────────
# The four TTP authorizations (certificat d'assiette, PAO, certificat de vente
# de coupe, CAE) that let a company legally start harvesting an AAC (art. 14).
# The company requests one (soumis); the Ministry delivers or rejects it; the
# company then notifies the start of activities.


async def _owner_of_authorization(auth_id: int) -> tuple[int, dict] | None:
    row = await db.fetch_one(f"{_AUTH_SELECT} WHERE aa.id = $1", auth_id)
    if row is None:
        return None
    return row["holder_org_id"], dict(row)


@router.get("/aacs/{aac_id}/authorizations")
async def list_authorizations(
    aac_id: int,
    user: dict = Depends(require_roles("company", "admin")),
):
    owned = await _owner_of_aac(aac_id)
    if owned is None:
        raise HTTPException(status_code=404, detail="AAC introuvable")
    owner_org_id, _ = owned
    if user["role"] == "company" and owner_org_id != require_org(user):
        raise HTTPException(status_code=403, detail="AAC d'une autre organisation")
    rows = await db.fetch_all(
        f"{_AUTH_SELECT} WHERE aa.aac_id = $1 ORDER BY aa.created_at DESC",
        aac_id,
    )
    return [dict(r) for r in rows]


@router.post("/aacs/{aac_id}/authorizations", status_code=201)
async def request_authorization(
    aac_id: int,
    body: AuthorizationIn,
    user: dict = Depends(require_roles("company")),
):
    org_id = require_org(user)
    owned = await _owner_of_aac(aac_id)
    if owned is None:
        raise HTTPException(status_code=404, detail="AAC introuvable")
    if owned[0] != org_id:
        raise HTTPException(status_code=403, detail="AAC d'une autre organisation")
    row = await db.fetch_one(
        """
        INSERT INTO aac_authorizations
            (aac_id, authorization_type, reference, valid_from, valid_to,
             plan_document_id, status)
        VALUES ($1, $2, $3, $4, $5, $6, 'soumis')
        RETURNING id, aac_id, authorization_type, reference, valid_from, valid_to,
                  plan_document_id, status, decision_motif, startup_notified_at, created_at
        """,
        aac_id,
        body.authorization_type,
        body.reference,
        body.valid_from,
        body.valid_to,
        body.plan_document_id,
    )
    return dict(row)


@router.patch("/authorizations/{auth_id}")
async def decide_authorization(
    auth_id: int,
    body: AuthorizationDecisionIn,
    admin: dict = Depends(require_roles("admin")),
):
    if body.decision == "rejete" and not body.motif:
        raise HTTPException(status_code=400, detail="Motif de rejet requis")
    current = await db.fetch_one(f"{_AUTH_SELECT} WHERE aa.id = $1", auth_id)
    if current is None:
        raise HTTPException(status_code=404, detail="Autorisation introuvable")
    issued_by = admin["id"] if body.decision == "delivre" else current["issued_by"]
    issued_at = date.today() if body.decision == "delivre" else current["issued_at"]
    row = await db.fetch_one(
        "UPDATE aac_authorizations SET status = $1, decision_motif = $2,"
        " issued_by = $3, issued_at = $4"
        " WHERE id = $5 RETURNING id, aac_id, status, decision_motif, issued_at",
        body.decision,
        body.motif,
        issued_by,
        issued_at,
        auth_id,
    )
    return dict(row)


@router.post("/authorizations/{auth_id}/notify-startup")
async def notify_startup(
    auth_id: int,
    user: dict = Depends(require_roles("company")),
):
    org_id = require_org(user)
    current = await _owner_of_authorization(auth_id)
    if current is None:
        raise HTTPException(status_code=404, detail="Autorisation introuvable")
    if current[0] != org_id:
        raise HTTPException(status_code=403, detail="Autorisation d'une autre organisation")
    auth = current[1]
    if auth["status"] != "delivre":
        raise HTTPException(
            status_code=409,
            detail="L'autorisation doit être délivrée avant de notifier le démarrage",
        )
    if auth["startup_notified_at"] is not None:
        raise HTTPException(status_code=409, detail="Démarrage des activités déjà notifié")
    row = await db.fetch_one(
        "UPDATE aac_authorizations SET startup_notified_at = now(), startup_notified_by = $1"
        " WHERE id = $2 RETURNING id, aac_id, status, startup_notified_at",
        user["id"],
        auth_id,
    )
    return dict(row)


@router.get("/authorizations/{auth_id}/pdf")
async def authorization_pdf(
    auth_id: int,
    user: dict = Depends(require_roles("company", "admin")),
):
    current = await _owner_of_authorization(auth_id)
    if current is None:
        raise HTTPException(status_code=404, detail="Autorisation introuvable")
    if user["role"] == "company" and current[0] != require_org(user):
        raise HTTPException(status_code=403, detail="Autorisation d'une autre organisation")
    data = current[1]
    pdf = pdf_report.render_authorization_pdf(data, data.get("org_name"))
    return Response(content=pdf, media_type="application/pdf")


# ───────────────── Conventions & attestation de conformité ─────────────────
# The legal instruments that confer the right to harvest (Loi 016/01): the
# convention provisoire signed after the CPAET and the convention définitive
# (~15 ans) that turns a title 'actif'. The Ministry also issues the
# attestation de conformité on satisfactory completion. Shared by the company
# (read + PDF) and the Ministry (record / close / attest).


async def _owner_of_convention(title_id: int, convention_id: int) -> dict | None:
    row = await db.fetch_one(
        f"{_CONVENTION_SELECT} WHERE c.id = $1 AND c.title_id = $2",
        convention_id,
        title_id,
    )
    return dict(row) if row else None


@router.get("/{title_id}/conventions")
async def list_conventions(
    title_id: int,
    user: dict = Depends(require_roles("company", "admin")),
):
    title = await db.fetch_one(
        "SELECT id, holder_org_id FROM forest_titles WHERE id = $1", title_id
    )
    if title is None:
        raise HTTPException(status_code=404, detail="Titre introuvable")
    if user["role"] == "company" and title["holder_org_id"] != require_org(user):
        raise HTTPException(status_code=403, detail="Titre d'une autre organisation")
    rows = await db.fetch_all(
        f"{_CONVENTION_SELECT} WHERE c.title_id = $1 ORDER BY c.created_at DESC",
        title_id,
    )
    return [dict(r) for r in rows]


@router.post("/{title_id}/conventions", status_code=201)
async def record_convention(
    title_id: int,
    body: ConventionIn,
    admin: dict = Depends(require_roles("admin")),
):
    title = await db.fetch_one("SELECT id, status FROM forest_titles WHERE id = $1", title_id)
    if title is None:
        raise HTTPException(status_code=404, detail="Titre introuvable")
    if body.convention_type == "definitive":
        provisoire = await db.fetch_one(
            "SELECT id FROM title_conventions WHERE title_id = $1"
            " AND convention_type = 'provisoire' AND status = 'active' LIMIT 1",
            title_id,
        )
        if provisoire is None:
            raise HTTPException(
                status_code=409,
                detail="La convention définitive exige une convention provisoire en vigueur",
            )
        existing = await db.fetch_one(
            "SELECT id FROM title_conventions WHERE title_id = $1"
            " AND convention_type = 'definitive' AND status = 'active' LIMIT 1",
            title_id,
        )
        if existing is not None:
            raise HTTPException(
                status_code=409, detail="Une convention définitive est déjà en vigueur"
            )

    row = await db.fetch_one(
        """
        INSERT INTO title_conventions
            (title_id, convention_type, reference, signed_at, start_date, end_date,
             surface_ha, status, decision_motif, decided_by, decided_at, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8, $9, now(), $9)
        RETURNING id, title_id, convention_type, reference, signed_at, start_date,
                  end_date, surface_ha, status, attestation_ref, decision_motif, created_at
        """,
        title_id,
        body.convention_type,
        body.reference,
        body.signed_at,
        body.start_date,
        body.end_date,
        body.surface_ha,
        body.motif,
        admin["id"],
    )

    # The instrument promotes the title (provisoire → actif), never regresses.
    target = _CONVENTION_TARGET[body.convention_type]
    title_status = title["status"]
    if _TITLE_RANK.get(title_status, 0) < _TITLE_RANK[target]:
        title_status = target
        await db.execute(
            "UPDATE forest_titles SET status = $1, decided_by = $2, decided_at = now(),"
            " decision_motif = $3 WHERE id = $4",
            title_status,
            admin["id"],
            body.motif,
            title_id,
        )
    result = dict(row)
    result["title_status"] = title_status
    return result


@router.patch("/{title_id}/conventions/{convention_id}")
async def decide_convention(
    title_id: int,
    convention_id: int,
    body: ConventionDecisionIn,
    admin: dict = Depends(require_roles("admin")),
):
    if body.status in ("expiree", "resiliee") and not body.motif:
        raise HTTPException(status_code=400, detail="Motif requis pour clore une convention")
    current = await _owner_of_convention(title_id, convention_id)
    if current is None:
        raise HTTPException(status_code=404, detail="Convention introuvable")
    row = await db.fetch_one(
        "UPDATE title_conventions SET status = $1, decision_motif = $2, decided_by = $3,"
        " decided_at = now() WHERE id = $4"
        " RETURNING id, title_id, convention_type, status, decision_motif",
        body.status,
        body.motif,
        admin["id"],
        convention_id,
    )
    result = dict(row)
    # A convention définitive that stops being in force drops the title back
    # to provisoire; the provisoire convention governs again.
    if current["convention_type"] == "definitive" and body.status != "active":
        title = await db.fetch_one("SELECT status FROM forest_titles WHERE id = $1", title_id)
        if title is not None and title["status"] == "actif":
            await db.execute(
                "UPDATE forest_titles SET status = 'provisoire' WHERE id = $1", title_id
            )
            result["title_status"] = "provisoire"
    return result


@router.post("/{title_id}/conventions/{convention_id}/attestation")
async def issue_attestation(
    title_id: int,
    convention_id: int,
    body: AttestationIn,
    admin: dict = Depends(require_roles("admin")),
):
    current = await _owner_of_convention(title_id, convention_id)
    if current is None:
        raise HTTPException(status_code=404, detail="Convention introuvable")
    if current["status"] != "active":
        raise HTTPException(
            status_code=409,
            detail="La convention doit être en vigueur pour délivrer l'attestation",
        )
    if current["attestation_ref"]:
        raise HTTPException(status_code=409, detail="Attestation de conformité déjà délivrée")
    row = await db.fetch_one(
        "UPDATE title_conventions SET attestation_ref = $1, attestation_issued_at = $2,"
        " attestation_issued_by = $3 WHERE id = $4"
        " RETURNING id, title_id, attestation_ref, attestation_issued_at",
        body.reference,
        body.issued_at or date.today(),
        admin["id"],
        convention_id,
    )
    return dict(row)


@router.get("/{title_id}/conventions/{convention_id}/pdf")
async def convention_pdf(
    title_id: int,
    convention_id: int,
    user: dict = Depends(require_roles("company", "admin")),
):
    current = await _owner_of_convention(title_id, convention_id)
    if current is None:
        raise HTTPException(status_code=404, detail="Convention introuvable")
    if user["role"] == "company" and current["holder_org_id"] != require_org(user):
        raise HTTPException(status_code=403, detail="Convention d'une autre organisation")
    pdf = pdf_report.render_convention_pdf(current, current.get("org_name"))
    return Response(content=pdf, media_type="application/pdf")
