"""One decision page for every Ministry queue: facts, automatic checks, items,
then approve / reject (reason required) dispatched to the domain's own rules.

Checks use three levels, as on the Ministry guide: ``ok`` (✓), ``ko`` (✗,
illicit or blocking) and ``warn`` (!, the authority decides).
"""

from datetime import date

from fastapi import HTTPException

from app.services import compliance, db, ministry

#: Readable labels for compliance codes (Loi 016/01 · RDUE).
CODE_LABELS = {
    "below_dme": "Sous le DME (art. 124)",
    "reserved_species": "Essence mise en réserve",
    "duplicate_code": "Code arbre en doublon",
    "outside_aac": "Arbre hors de l'AAC",
    "no_measurement": "Diamètre non mesuré",
    "cites_listed": "Espèce CITES",
    "cites_without_permit": "Espèce CITES sans permis d'exportation",
    "in_protected_area": "Dans une aire protégée",
    "outside_concession": "Hors concession forestière",
    "logbook_not_kept": "Carnet de chantier (DF10) non tenu",
    "document": "Pièce non valide",
    "tax": "Taxe impayée (art. 283)",
    "title": "Titre non actif",
    "aac": "AAC non ouverte",
}


def _label(code: str | None) -> str:
    return CODE_LABELS.get(code or "", code or "")


def _check(level: str, label: str) -> dict:
    return {"level": level, "label": label}


def _fact(label: str, value) -> dict | None:
    if value is None or value == "":
        return None
    return {"label": label, "value": str(value)}


def _facts(*pairs) -> list[dict]:
    return [f for f in (_fact(label, value) for label, value in pairs) if f]


def _expired(value) -> bool:
    return isinstance(value, date) and value < date.today()


async def _base(kind: str, item_id: int) -> dict:
    rows = await ministry.inbox_items(kind)
    for row in rows:
        if row["id"] == item_id:
            return row
    raise HTTPException(status_code=404, detail="Dossier introuvable ou déjà traité")


async def _declaration(item_id: int) -> tuple[list, list, list]:
    head = await db.fetch_one("SELECT * FROM felling_declarations WHERE id = $1", item_id)
    lines = await db.fetch_all(
        "SELECT tree_code, species_scientific_name, measured_dbh_cm, dme_cm, violations"
        " FROM declaration_lines WHERE declaration_id = $1 ORDER BY id",
        item_id,
    )
    assessment = await compliance.evaluate(item_id) or {"blockers": [], "warnings": []}
    facts = _facts(
        ("Permis", f"{head['permit_type']} {head['permit_number']}"),
        ("AAC", head.get("aac_label")),
        ("Campagne", head.get("campaign_year")),
        ("Pieds déclarés", len(lines)),
    )
    checks = [
        _check(
            "ko",
            f"{_label(b['code'])} · {b['tree_code']}" if b.get("tree_code") else _label(b["code"]),
        )
        for b in assessment["blockers"]
    ]
    for w in assessment["warnings"]:
        label = _label(w.get("code") or w.get("kind"))
        detail = (
            w.get("doc_type") or w.get("tax_type") or w.get("tree_code") or w.get("status") or ""
        )
        checks.append(_check("warn", f"{label} · {detail}" if detail else label))
    if not checks:
        checks.append(_check("ok", "Aucune non-conformité détectée"))
    items = [
        {
            "label": ln["tree_code"],
            "detail": " · ".join(
                p
                for p in (
                    ln["species_scientific_name"],
                    f"{ln['measured_dbh_cm']} cm" if ln["measured_dbh_cm"] is not None else None,
                    f"DME {ln['dme_cm']}" if ln["dme_cm"] is not None else None,
                )
                if p
            ),
            "flags": list(ln["violations"] or []) if not isinstance(ln["violations"], str) else [],
        }
        for ln in lines
    ]
    return facts, checks, items


async def _document(item_id: int) -> tuple[list, list, list]:
    d = await db.fetch_one(
        "SELECT ld.*, dt.label AS type_label, dt.legal_ref FROM legal_documents ld"
        " LEFT JOIN document_types dt ON dt.code = ld.doc_type WHERE ld.id = $1",
        item_id,
    )
    facts = _facts(
        ("Pièce", d.get("type_label") or d["doc_type"]),
        ("Référence", d.get("reference")),
        ("Portée", d["scope_type"]),
        ("Délivrée le", d.get("issued_at")),
        ("Expire le", d.get("expires_at")),
        ("Base légale", d.get("legal_ref")),
    )
    checks = [
        _check("ok", "Fichier joint")
        if d.get("file_url")
        else _check("warn", "Aucun fichier joint"),
        _check("ko", "Pièce déjà expirée")
        if _expired(d.get("expires_at"))
        else _check("ok", "Validité en cours"),
    ]
    return facts, checks, []


async def _authorization(item_id: int) -> tuple[list, list, list]:
    a = await db.fetch_one(
        "SELECT a.*, b.label AS aac_label, b.status AS aac_status, t.status AS title_status,"
        " t.reference AS title_reference FROM aac_authorizations a"
        " JOIN annual_cut_blocks b ON b.id = a.aac_id"
        " JOIN management_units u ON u.id = b.ufa_id JOIN forest_titles t ON t.id = u.title_id"
        " WHERE a.id = $1",
        item_id,
    )
    facts = _facts(
        ("Autorisation", a["authorization_type"]),
        ("AAC", f"{a['aac_label']} ({a['aac_status']})"),
        ("Titre", a.get("title_reference")),
        ("Référence", a.get("reference")),
    )
    checks = [
        _check("ok", "Titre actif")
        if a["title_status"] == "actif"
        else _check("warn", f"Titre {a['title_status']}"),
        _check("ok", "Plan déposé")
        if a.get("plan_document_id")
        else _check("warn", "Plan non joint"),
    ]
    return facts, checks, []


async def _pao(item_id: int) -> tuple[list, list, list]:
    b = await db.fetch_one(
        "SELECT b.*, u.label AS ufa_label, t.status AS title_status, t.reference AS title_reference,"
        " (SELECT count(*) FROM ufa_dme d WHERE d.ufa_id = b.ufa_id) AS dme_rows,"
        " (SELECT count(*) FROM tree_registry r WHERE r.aac_id = b.id) AS stems"
        " FROM annual_cut_blocks b JOIN management_units u ON u.id = b.ufa_id"
        " JOIN forest_titles t ON t.id = u.title_id WHERE b.id = $1",
        item_id,
    )
    facts = _facts(
        ("AAC", b["label"]),
        ("UFA", b["ufa_label"]),
        ("Titre", b.get("title_reference")),
        ("Référence PAO", b.get("pao_reference")),
        ("Campagne", b.get("campaign_year")),
        ("Possibilité (m³)", b.get("possibility_m3")),
        ("Tiges inventoriées", b.get("stems")),
    )
    checks = [
        _check("ok", "Titre actif")
        if b["title_status"] == "actif"
        else _check("warn", f"Titre {b['title_status']}"),
        _check("ok", "Limites cartographiées")
        if b.get("geom") is not None
        else _check("ko", "AAC sans polygone"),
        _check("ok", "DME fixés pour l'UFA")
        if b.get("dme_rows")
        else _check("warn", "DME provisoires (UFA sans arrêté)"),
    ]
    return facts, checks, []


async def _study(item_id: int) -> tuple[list, list, list]:
    s = await db.fetch_one(
        "SELECT s.*, t.reference AS title_reference, t.status AS title_status FROM environmental_studies s"
        " JOIN forest_titles t ON t.id = s.title_id WHERE s.id = $1",
        item_id,
    )
    facts = _facts(
        ("Étude", (s["study_type"] or "").upper()),
        ("Titre", s.get("title_reference")),
        ("Référence", s.get("reference")),
        ("Réalisée le", s.get("conducted_at")),
        ("Valide jusqu'au", s.get("valid_to")),
    )
    checks = [
        _check("ko", "Validité déjà dépassée")
        if _expired(s.get("valid_to"))
        else _check("ok", "Validité en cours")
    ]
    return facts, checks, []


async def _certification(item_id: int) -> tuple[list, list, list]:
    c = await db.fetch_one("SELECT * FROM certifications WHERE id = $1", item_id)
    facts = _facts(
        ("Référentiel", c["scheme"]),
        ("Type", c["cert_type"]),
        ("Certificat", c.get("certificate_ref")),
        ("Surface (ha)", c.get("surface_ha")),
        ("Valide jusqu'au", c.get("valid_to")),
    )
    checks = [
        _check("ko", "Certificat expiré")
        if _expired(c.get("valid_to"))
        else _check("ok", "Validité en cours")
    ]
    return facts, checks, []


async def _eudr(item_id: int) -> tuple[list, list, list]:
    e = await db.fetch_one("SELECT * FROM eudr_diligence WHERE id = $1", item_id)
    felled = e.get("felled_stem_count") or 0
    located = e.get("geolocated_stem_count") or 0
    outside = e.get("outside_parcel_stem_count") or 0
    facts = _facts(
        ("Parcelle", e.get("parcel_label")),
        ("Grumes abattues", felled),
        ("Grumes géolocalisées", located),
        ("Hors parcelle", outside),
        ("Volume déclaré (m³)", e.get("declared_volume_m3")),
    )
    checks = [
        _check("ok", "Parcelle cartographiée")
        if e.get("parcel_geom") is not None
        else _check("warn", "Parcelle sans polygone"),
        _check("ok", "Toutes les grumes géolocalisées")
        if felled and located >= felled
        else _check("warn", f"{located}/{felled} grumes géolocalisées"),
        _check("ok", "Aucune grume hors parcelle")
        if outside == 0
        else _check("warn", f"{outside} grume(s) hors parcelle"),
    ]
    return facts, checks, []


async def _title(item_id: int) -> tuple[list, list, list]:
    t = await db.fetch_one("SELECT * FROM forest_titles WHERE id = $1", item_id)
    facts = _facts(
        ("Titre", t["title_type"]),
        ("Référence", t.get("reference")),
        ("Surface (ha)", t.get("surface_ha")),
        ("Domaine", t.get("zone")),
    )
    warnings = await compliance.assess_org_warnings(t.get("holder_org_id"))
    checks = [
        _check(
            "warn",
            f"{_label(w['kind'])} · {w.get('doc_type') or w.get('tax_type') or ''}".rstrip(" ·"),
        )
        for w in warnings
    ]
    if not checks:
        checks.append(_check("ok", "Pièces et taxes de l'organisation à jour"))
    return facts, checks, []


_DETAIL = {
    "declarations": _declaration,
    "documents": _document,
    "authorizations": _authorization,
    "pao": _pao,
    "studies": _study,
    "certifications": _certification,
    "eudr": _eudr,
    "titles": _title,
}

#: What "approve" means for each queue (verb shown on the button).
APPROVE_LABEL = {
    "declarations": "Autoriser",
    "documents": "Valider",
    "authorizations": "Délivrer",
    "pao": "Autoriser le PAO",
    "studies": "Valider",
    "certifications": "Activer",
    "eudr": "Valider",
    "titles": "Autoriser l'exploration",
}


async def detail(kind: str, item_id: int) -> dict:
    if kind not in _DETAIL:
        raise HTTPException(status_code=404, detail="Type de dossier inconnu")
    base = await _base(kind, item_id)
    facts, checks, items = await _DETAIL[kind](item_id)
    return {
        **base,
        "facts": facts,
        "checks": checks,
        "items": items,
        "approve_label": APPROVE_LABEL[kind],
        "blocking": any(c["level"] == "ko" for c in checks),
    }


async def decide(kind: str, item_id: int, approve: bool, motif: str | None, admin: dict) -> dict:
    """Apply the decision through the domain endpoint (its rules, its checks)."""
    from app.api import certifications, documents, eudr, felling, titles

    motif = (motif or "").strip() or None
    if not approve and not motif:
        raise HTTPException(status_code=400, detail="Motif obligatoire pour rejeter")
    await _base(kind, item_id)
    if kind == "declarations":
        body = felling.DecisionIn(decision="autorisee" if approve else "rejetee", motif=motif)
        return await felling.decide(item_id, body, user=admin)
    if kind == "documents":
        body = documents.VerificationIn(status="valide" if approve else "rejete", notes=motif)
        return await documents.verify(item_id, body, admin=admin)
    if kind == "authorizations":
        body = titles.AuthorizationDecisionIn(
            decision="delivre" if approve else "rejete", motif=motif
        )
        return await titles.decide_authorization(item_id, body, admin=admin)
    if kind == "pao":
        body = titles.AacActionIn(action="autoriser" if approve else "rejeter", motif=motif)
        return await titles.act_on_aac(item_id, body, user=admin)
    if kind == "studies":
        row = await db.fetch_one(
            "SELECT title_id FROM environmental_studies WHERE id = $1", item_id
        )
        body = titles.StudyDecisionIn(decision="valide" if approve else "rejete", motif=motif)
        return await titles.decide_study(row["title_id"], item_id, body, admin=admin)
    if kind == "certifications":
        body = certifications.CertificationDecisionIn(
            decision="actif" if approve else "rejete", decision_motif=motif
        )
        return await certifications.decide_certification(item_id, body, admin=admin)
    if kind == "eudr":
        body = eudr.DiligenceDecisionIn(status="valide" if approve else "rejete", motif=motif)
        return await eudr.decide_diligence(item_id, body, admin=admin)
    if kind == "titles":
        body = titles.TitleDecisionIn(decision="exploration" if approve else "rejete", motif=motif)
        return await titles.decide_title(item_id, body, admin=admin)
    raise HTTPException(status_code=404, detail="Type de dossier inconnu")
