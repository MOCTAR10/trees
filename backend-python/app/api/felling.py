"""Abattage lifecycle: smart declarations, authorization, custody ledger.

Company declares inventoried stems (QR / paint number / GPS+photo) against a
permit + AAC; admin authorizes; operators record felling with proof; every
handoff appends to the custody ledger. Auto-checks cite Loi 016/01 (Art. 14
prior authorization, Art. 124 DME floor) with provisional DME defaults until
the official arrêté arrives.
"""

import json
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field

from app.config import get_settings
from app.core.deps import require_roles
from app.core.dme import dme_for
from app.core.reserved_species import reserved_species_for
from app.core.species_data import resolve_species
from app.services import compliance, custody, db, dme, plate_print

router = APIRouter()

MarkingType = Literal["qr", "peinture", "gps_photo"]
PermitType = Literal["CFAD", "PFA", "PGG", "ASC", "ACBSL", "foret_communautaire"]
CustodyEvent = Literal["abattu", "transporte", "receptionne", "transforme"]


class DeclarationLineIn(BaseModel):
    tree_code: str = Field(..., min_length=1, examples=["GA-2026-000123"])
    marking_type: MarkingType = "gps_photo"
    species_scientific_name: str | None = None
    measured_dbh_cm: float | None = Field(None, gt=0, le=400)
    latitude: float | None = Field(None, ge=-90, le=90)
    longitude: float | None = Field(None, ge=-180, le=180)


class DeclarationIn(BaseModel):
    permit_type: PermitType
    permit_number: str = Field(..., min_length=1)
    ufa_label: str | None = None
    aac_label: str | None = None
    campaign_year: int | None = Field(None, ge=2000, le=2100)
    title_id: int | None = None
    aac_id: int | None = None
    lines: list[DeclarationLineIn] = Field(..., min_length=1, max_length=2000)


class DecisionIn(BaseModel):
    decision: Literal["autorisee", "rejetee"]
    motif: str | None = None


class CustodyIn(BaseModel):
    tree_code: str = Field(..., min_length=1)
    event: CustodyEvent
    latitude: float | None = Field(None, ge=-90, le=90)
    longitude: float | None = Field(None, ge=-180, le=180)
    photo_url: str | None = None
    note: str | None = None


def _company_id(user: dict) -> int | None:
    company_id = user.get("company_id")
    if company_id is None and user["role"] == "company":
        company_id = user["id"]
    return company_id


async def _check_line(
    line: DeclarationLineIn,
    *,
    outside_aac: bool = False,
    ufa_dme: dict[str, dict] | None = None,
    spatial: dict | None = None,
    company_id: int | None = None,
) -> tuple[float | None, str | None, list[str]]:
    """Auto-compliance checks for one declared stem (Loi 016/01 Art. 124).

    The DME floor is resolved against the declaration's UFA when one is known
    (``ufa_dme`` maps scientific names to ``{dme_cm, source}``); otherwise the
    provisional default applies. ``outside_aac`` is resolved by the caller
    against the declaration's AAC geometry (spatial check batched per request).
    """
    violations: list[str] = []
    dme_cm, source = dme_for(line.species_scientific_name)
    profile = resolve_species(line.species_scientific_name)
    if ufa_dme is not None and profile is not None:
        override = ufa_dme.get(profile.scientific_name)
        if override is not None:
            dme_cm = float(override["dme_cm"])
            source = override.get("source") or source
    if line.species_scientific_name and line.measured_dbh_cm is None:
        violations.append("no_measurement")
    if dme_cm is not None and line.measured_dbh_cm is not None and line.measured_dbh_cm < dme_cm:
        violations.append("below_dme")
    if reserved_species_for(line.species_scientific_name) is not None:
        violations.append("reserved_species")
    if outside_aac:
        violations.append("outside_aac")
    if profile is not None and profile.cites_appendix:
        violations.append("cites_listed")
    if spatial and spatial.get("protected_area"):
        violations.append("in_protected_area")
    if spatial and spatial.get("outside_concession"):
        violations.append("outside_concession")
    existing = await db.fetch_one(
        "SELECT tree_code, status, company_id FROM tree_registry WHERE tree_code=$1",
        line.tree_code,
    )
    own_inventory = (
        existing is not None
        and existing.get("status") == "inventorie"
        and company_id is not None
        and existing.get("company_id") == company_id
    )
    if existing is not None and not own_inventory:
        violations.append("duplicate_code")
    return dme_cm, source, violations


@router.get("/aac-options")
async def aac_options(user: dict = Depends(require_roles("company"))):
    """AACs of the company's titles, with whether felling is allowed now (art. 14)."""
    org_id = user.get("organization_id")
    if org_id is None:
        return []
    rows = await db.fetch_all(
        """
        SELECT b.id, b.label, b.status, b.campaign_year, u.label AS ufa_label,
               t.id AS title_id, t.title_type, t.reference AS title_reference
        FROM annual_cut_blocks b
        JOIN management_units u ON u.id = b.ufa_id
        JOIN forest_titles t ON t.id = u.title_id
        WHERE t.holder_org_id = $1
        ORDER BY b.campaign_year DESC NULLS LAST, b.label
        """,
        org_id,
    )
    out = []
    for r in rows:
        item = dict(r)
        item["blocker"] = await compliance.authorization_gate(item["id"], org_id)
        out.append(item)
    return out


@router.post("/declarations")
async def declare(
    body: DeclarationIn,
    user: dict = Depends(require_roles("company")),
):
    company_id = _company_id(user)
    gate = await compliance.authorization_gate(body.aac_id, user.get("organization_id"))
    if gate is not None:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "Soumission bloquée — pas d'exploitation sans autorisation (art. 14)",
                "blockers": [{"tree_code": None, "code": gate}],
            },
        )
    points = [
        (line.tree_code.strip(), line.longitude, line.latitude)
        for line in body.lines
        if line.longitude is not None and line.latitude is not None
    ]
    outside_codes = await compliance.lines_outside_aac(body.aac_id, points)
    spatial = await compliance.lines_spatial_context(points)
    ufa_dme = await dme.map_for_ufa(await dme.ufa_of_aac(body.aac_id))
    checked: list[dict] = []
    blockers: list[dict] = []
    for line in body.lines:
        dme_cm, dme_source, violations = await _check_line(
            line,
            outside_aac=line.tree_code.strip() in outside_codes,
            ufa_dme=ufa_dme,
            spatial=spatial.get(line.tree_code.strip()),
            company_id=company_id,
        )
        checked.append(
            {
                "tree_code": line.tree_code.strip(),
                "dme_cm": dme_cm,
                "dme_source": dme_source,
                "violations": violations,
            }
        )
        hard = [v for v in violations if v in compliance.HARD_LINE_VIOLATIONS]
        blockers.extend({"tree_code": line.tree_code.strip(), "code": code} for code in hard)
    if blockers:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "Soumission bloquée — non-conformité dure (Loi 016/01)",
                "blockers": blockers,
            },
        )

    row = await db.fetch_one(
        """
        INSERT INTO felling_declarations
            (company_id, permit_type, permit_number, ufa_label, aac_label, campaign_year,
             title_id, aac_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, status
        """,
        company_id,
        body.permit_type,
        body.permit_number.strip(),
        body.ufa_label,
        body.aac_label,
        body.campaign_year,
        body.title_id,
        body.aac_id,
    )
    for line, item in zip(body.lines, checked, strict=False):
        await db.execute(
            """
            INSERT INTO declaration_lines
                (declaration_id, tree_code, marking_type, species_scientific_name,
                 measured_dbh_cm, latitude, longitude, dme_cm, violations, dme_source)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
            """,
            row["id"],
            line.tree_code.strip(),
            line.marking_type,
            line.species_scientific_name,
            line.measured_dbh_cm,
            line.latitude,
            line.longitude,
            item["dme_cm"],
            json.dumps(item["violations"]),
            item["dme_source"],
        )
        await db.execute(
            """
            INSERT INTO tree_registry
                (tree_code, marking_type, geom, species_scientific_name,
                 measured_dbh_cm, company_id, status, permit_number, aac_label,
                 aac_id, title_id, custodian_org_id)
            VALUES ($1, $2, CASE WHEN $3::float8 IS NULL OR $4::float8 IS NULL THEN NULL
                                ELSE ST_SetSRID(ST_MakePoint($3::float8, $4::float8), 4326) END,
                    $5, $6, $7, 'declare', $8, $9, $10, $11, $12)
            ON CONFLICT (tree_code) DO UPDATE SET
                status = CASE WHEN tree_registry.status = 'inventorie' THEN 'declare'
                              ELSE tree_registry.status END,
                aac_id = COALESCE(tree_registry.aac_id, EXCLUDED.aac_id),
                title_id = COALESCE(tree_registry.title_id, EXCLUDED.title_id),
                custodian_org_id = COALESCE(tree_registry.custodian_org_id,
                                            EXCLUDED.custodian_org_id),
                updated_at = now()
            """,
            line.tree_code.strip(),
            line.marking_type,
            line.longitude,
            line.latitude,
            line.species_scientific_name,
            line.measured_dbh_cm,
            company_id,
            body.permit_number.strip(),
            body.aac_label,
            body.aac_id,
            body.title_id,
            user.get("organization_id"),
        )
    result = await compliance.evaluate(row["id"])
    await db.execute(
        "UPDATE felling_declarations SET compliance = $1::jsonb WHERE id = $2",
        json.dumps(result),
        row["id"],
    )
    return {
        "id": row["id"],
        "status": row["status"],
        "lines_checked": checked,
        "compliance": result,
    }


@router.get("/declarations")
async def list_declarations(
    status: str | None = Query(None),
    user: dict = Depends(require_roles("company", "admin")),
):
    if user["role"] == "admin":
        rows = await db.fetch_all(
            "SELECT d.*, (SELECT count(*) FROM declaration_lines l WHERE l.declaration_id = d.id) AS line_count"
            " FROM felling_declarations d"
            + (" WHERE d.status = $1" if status else "")
            + " ORDER BY d.created_at DESC LIMIT 200",
            *([status] if status else []),
        )
    else:
        rows = await db.fetch_all(
            "SELECT d.*, (SELECT count(*) FROM declaration_lines l WHERE l.declaration_id = d.id) AS line_count"
            " FROM felling_declarations d WHERE d.company_id = $1"
            + (" AND d.status = $2" if status else "")
            + " ORDER BY d.created_at DESC LIMIT 200",
            *([_company_id(user)] if status is None else [_company_id(user), status]),
        )
    return [dict(r) for r in rows]


@router.get("/declarations/{declaration_id}")
async def get_declaration(
    declaration_id: int,
    user: dict = Depends(require_roles("company", "admin")),
):
    header = await db.fetch_one("SELECT * FROM felling_declarations WHERE id=$1", declaration_id)
    if header is None:
        raise HTTPException(status_code=404, detail="Déclaration introuvable")
    if user["role"] == "company" and header["company_id"] != _company_id(user):
        raise HTTPException(status_code=403, detail="Déclaration d'une autre entreprise")
    lines = await db.fetch_all(
        "SELECT * FROM declaration_lines WHERE declaration_id=$1 ORDER BY id", declaration_id
    )
    return {"declaration": dict(header), "lines": [dict(r) for r in lines]}


@router.get("/declarations/{declaration_id}/plates.pdf")
async def declaration_plates(
    declaration_id: int,
    user: dict = Depends(require_roles("company", "admin")),
):
    """QR plates of a declaration's stems, ready to print or engrave in-house."""
    header = await db.fetch_one("SELECT * FROM felling_declarations WHERE id=$1", declaration_id)
    if header is None:
        raise HTTPException(status_code=404, detail="Déclaration introuvable")
    if user["role"] == "company" and header["company_id"] != _company_id(user):
        raise HTTPException(status_code=403, detail="Déclaration d'une autre entreprise")
    rows = await db.fetch_all(
        "SELECT tree_code FROM declaration_lines WHERE declaration_id=$1 ORDER BY id",
        declaration_id,
    )
    codes = [r["tree_code"] for r in rows]
    if not codes:
        raise HTTPException(status_code=404, detail="Aucun arbre dans cette déclaration")
    pdf = plate_print.plates_pdf_bytes(codes, get_settings().qr_tag_size_cm)
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="plaques_declaration_{declaration_id}.pdf"'
        },
    )


@router.patch("/declarations/{declaration_id}")
async def decide(
    declaration_id: int,
    body: DecisionIn,
    user: dict = Depends(require_roles("admin")),
):
    header = await db.fetch_one("SELECT * FROM felling_declarations WHERE id=$1", declaration_id)
    if header is None:
        raise HTTPException(status_code=404, detail="Déclaration introuvable")
    if header["status"] != "soumise":
        raise HTTPException(status_code=409, detail="Déclaration déjà tranchée")
    updated = await db.fetch_one(
        "UPDATE felling_declarations SET status=$1, decision_motif=$2,"
        " decided_by=$3, decided_at=now() WHERE id=$4"
        " RETURNING id, status",
        body.decision,
        body.motif,
        user["id"],
        declaration_id,
    )
    if body.decision == "autorisee":
        await db.execute(
            "UPDATE tree_registry SET status='autorise', updated_at=now()"
            " WHERE tree_code IN (SELECT tree_code FROM declaration_lines"
            " WHERE declaration_id=$1) AND status='declare'",
            declaration_id,
        )
    return dict(updated)


@router.post("/events")
async def record_event(
    body: CustodyIn,
    user: dict = Depends(require_roles("operator", "company")),
):
    tree = await db.fetch_one(
        "SELECT * FROM tree_registry WHERE tree_code=$1", body.tree_code.strip()
    )
    if tree is None:
        raise HTTPException(status_code=404, detail="Arbre inconnu au registre")
    if not custody.holds(await custody.acting_user(user), dict(tree)):
        raise HTTPException(status_code=403, detail="Grume détenue par une autre organisation")
    reason = custody.refusal(body.event, tree["status"])
    if reason is not None:
        raise HTTPException(status_code=409, detail=reason)
    event = await db.fetch_one(
        """
        INSERT INTO custody_events (tree_code, event, actor_id, geom, photo_url, note)
        VALUES ($1, $2, $3, CASE WHEN $4::float8 IS NULL OR $5::float8 IS NULL THEN NULL
                                ELSE ST_SetSRID(ST_MakePoint($4::float8, $5::float8), 4326) END, $6, $7)
        RETURNING id, tree_code, event, created_at
        """,
        body.tree_code.strip(),
        body.event,
        user["id"],
        body.longitude,
        body.latitude,
        body.photo_url,
        body.note,
    )
    await db.execute(
        "UPDATE tree_registry SET status=$1, updated_at=now() WHERE tree_code=$2",
        body.event,
        body.tree_code.strip(),
    )
    if body.event == "abattu":
        # DF10 / carnet de chantier: stamp the felling date, stump location and
        # a stable register number the first time the stem is cut (art. 130-133).
        await db.execute(
            "UPDATE tree_registry SET felled_at = COALESCE(felled_at, now()),"
            " stump_geom = COALESCE(stump_geom, CASE WHEN $2::float8 IS NULL OR $3::float8 IS NULL"
            "   THEN NULL ELSE ST_SetSRID(ST_MakePoint($2::float8, $3::float8), 4326) END),"
            " df10_entry_no = COALESCE(df10_entry_no,"
            "   'DF10-' || to_char(now(), 'YYYY') || '-' || lpad(id::text, 6, '0'))"
            " WHERE tree_code = $1",
            body.tree_code.strip(),
            body.longitude,
            body.latitude,
        )
    return dict(event)


@router.get("/trees")
async def list_trees(
    status: str | None = Query(None),
    user: dict = Depends(require_roles("company", "admin", "operator")),
):
    company_id = _company_id(user)
    if user["role"] == "admin":
        rows = await db.fetch_all(
            "SELECT id, tree_code, marking_type, species_scientific_name, measured_dbh_cm,"
            " status, permit_number, aac_label, aac_id, ST_Y(geom) AS latitude,"
            " ST_X(geom) AS longitude, created_at FROM tree_registry"
            + (" WHERE status = $1" if status else "")
            + " ORDER BY created_at DESC LIMIT 500",
            *([status] if status else []),
        )
    else:
        rows = await db.fetch_all(
            "SELECT id, tree_code, marking_type, species_scientific_name, measured_dbh_cm,"
            " status, permit_number, aac_label, aac_id, ST_Y(geom) AS latitude,"
            " ST_X(geom) AS longitude, created_at FROM tree_registry"
            " WHERE (custodian_org_id = $2 OR (custodian_org_id IS NULL AND company_id = $1))"
            + (" AND status = $3" if status else "")
            + " ORDER BY created_at DESC LIMIT 500",
            company_id,
            user.get("organization_id"),
            *([status] if status else []),
        )
    return [dict(r) for r in rows]


@router.get("/trees/{tree_code}")
async def get_tree(
    tree_code: str,
    user: dict = Depends(require_roles("company", "admin", "operator", "cooperative")),
):
    """One log: holder, status, custody history, open transport and next action."""
    out = await custody.lookup(tree_code.strip(), user)
    if out is None:
        raise HTTPException(status_code=404, detail="Arbre inconnu au registre")
    if user["role"] != "admin" and not out["is_holder"] and not out["can_receive"]:
        raise HTTPException(status_code=403, detail="Grume détenue par une autre organisation")
    return out


@router.get("/anomalies")
async def list_anomalies(_user: dict = Depends(require_roles("admin"))):
    below_dme = await db.fetch_all(
        "SELECT l.tree_code, l.species_scientific_name, l.measured_dbh_cm, l.dme_cm,"
        " d.permit_number, d.company_id FROM declaration_lines l"
        " JOIN felling_declarations d ON d.id = l.declaration_id"
        " WHERE d.status = 'autorisee' AND l.violations @> '[\"below_dme\"]'::jsonb"
        " ORDER BY l.id LIMIT 200"
    )
    unauth_felled = await db.fetch_all(
        "SELECT c.tree_code, c.created_at, c.actor_id FROM custody_events c"
        " WHERE c.event = 'abattu' AND NOT EXISTS (SELECT 1 FROM declaration_lines l"
        " JOIN felling_declarations d ON d.id = l.declaration_id"
        " WHERE l.tree_code = c.tree_code AND d.status = 'autorisee')"
        " ORDER BY c.created_at DESC LIMIT 200"
    )
    return {
        "below_dme_authorized": [dict(r) for r in below_dme],
        "felled_without_authorization": [dict(r) for r in unauth_felled],
    }
