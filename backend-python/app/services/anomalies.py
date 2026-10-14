"""Extended anomaly sweep for the Ministry (Loi 016/01, RDUE).

One detector per §7 of the workflow analysis: illegal felling
(``below_dme``, ``felled_without_authorization``, ``abattage_hors_aac``,
``espece_reservee``, ``aac_fermee``) and compliance warnings
(``documents_expires``, ``taxes_impayees``, ``cites_sans_permis``,
``transport_sans_bordereau``). Detection is derived at read time from the
existing operational tables; the review decision (acknowledge / dismiss) is
persisted in ``anomaly_reviews`` keyed by the ``(type, subject_key)`` pair.
"""

from __future__ import annotations

import json
from datetime import UTC, date, datetime

from app.services import db

HARD = "hard"
WARNING = "warning"

#: ``anomaly_type -> severity``. Hard = illegal (Loi 016/01); warning = a
#: compliance gap the Ministry weighs during instruction.
TYPES: dict[str, str] = {
    "below_dme": HARD,
    "felled_without_authorization": HARD,
    "abattage_hors_aac": HARD,
    "espece_reservee": HARD,
    "aac_fermee": HARD,
    "documents_expires": WARNING,
    "taxes_impayees": WARNING,
    "cites_sans_permis": WARNING,
    "transport_sans_bordereau": WARNING,
    "controle_non_conforme": HARD,
}

LABELS: dict[str, str] = {
    "below_dme": "Arbre abattu sous le diamètre minimum (DME)",
    "felled_without_authorization": "Abattage sans autorisation préalable",
    "abattage_hors_aac": "Abattage hors assiette annuelle (AAC)",
    "espece_reservee": "Essence protégée abattue",
    "aac_fermee": "Exploitation dans une AAC fermée / non ouverte",
    "documents_expires": "Document requis expiré",
    "taxes_impayees": "Échéance fiscale impayée",
    "cites_sans_permis": "Essence CITES sans permis d'exportation",
    "transport_sans_bordereau": "Transport sans bordereau / feuille de route",
    "controle_non_conforme": "Contrôle terrain non conforme",
}

REVIEW_STATUSES = ("ouverte", "traitee", "ecartee")

_LINES_WITH = """
SELECT l.tree_code, l.species_scientific_name, l.measured_dbh_cm, l.dme_cm,
       l.dme_source,
       d.id AS declaration_id, d.permit_number, d.title_id, d.aac_id,
       o.id AS org_id, o.name AS org_name, d.created_at,
       ft.reference AS title_ref, a.label AS aac_label
FROM declaration_lines l
JOIN felling_declarations d ON d.id = l.declaration_id
LEFT JOIN forest_titles ft ON ft.id = d.title_id
LEFT JOIN annual_cut_blocks a ON a.id = d.aac_id
LEFT JOIN users u ON u.id = d.company_id
LEFT JOIN organizations o ON o.id = COALESCE(u.organization_id, ft.holder_org_id)
WHERE d.status = 'autorisee' AND l.violations @> $1::jsonb
ORDER BY l.id LIMIT 200
"""


def _iso(value) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.astimezone(UTC).isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return str(value)


def _item(
    anomaly_type: str,
    subject_key: str,
    subject: str,
    detail: str,
    *,
    org_id: int | None = None,
    org_name: str | None = None,
    title_id: int | None = None,
    title_ref: str | None = None,
    aac_id: int | None = None,
    aac_label: str | None = None,
    detected_at=None,
) -> dict:
    return {
        "type": anomaly_type,
        "severity": HARD if anomaly_type in HARD_TYPES else WARNING,
        "label": LABELS.get(anomaly_type, anomaly_type),
        "subject_key": subject_key,
        "subject": subject,
        "detail": detail,
        "org_id": org_id,
        "org_name": org_name,
        "title_id": title_id,
        "title_ref": title_ref,
        "aac_id": aac_id,
        "aac_label": aac_label,
        "detected_at": _iso(detected_at),
    }


HARD_TYPES = frozenset(t for t, sev in TYPES.items() if sev == HARD)


async def _violation_lines(code: str, anomaly_type: str) -> list[dict]:
    rows = await db.fetch_all(_LINES_WITH, json.dumps([code]))
    items: list[dict] = []
    for r in rows:
        if anomaly_type == "below_dme":
            detail = f"DBH {r['measured_dbh_cm']} cm < DME {r['dme_cm']} cm"
            if r.get("dme_source"):
                detail += f" ({r['dme_source']})"
        else:
            detail = "Position déclarée hors de l'assiette de coupe"
        items.append(
            _item(
                anomaly_type,
                r["tree_code"],
                r["tree_code"],
                detail,
                org_id=r.get("org_id"),
                org_name=r.get("org_name"),
                title_id=r.get("title_id"),
                title_ref=r.get("title_ref"),
                aac_id=r.get("aac_id"),
                aac_label=r.get("aac_label"),
                detected_at=r.get("created_at"),
            )
        )
    return items


async def _below_dme() -> list[dict]:
    return await _violation_lines("below_dme", "below_dme")


async def _abattage_hors_aac() -> list[dict]:
    return await _violation_lines("outside_aac", "abattage_hors_aac")


async def _espece_reservee() -> list[dict]:
    return await _violation_lines("reserved_species", "espece_reservee")


async def _felled_without_authorization() -> list[dict]:
    rows = await db.fetch_all(
        """
        SELECT c.tree_code, c.created_at, c.actor_id,
               o.id AS org_id, o.name AS org_name
        FROM custody_events c
        LEFT JOIN tree_registry tr ON tr.tree_code = c.tree_code
        LEFT JOIN users u ON u.id = tr.company_id
        LEFT JOIN organizations o ON o.id = u.organization_id
        WHERE c.event = 'abattu'
          AND NOT EXISTS (
              SELECT 1 FROM declaration_lines l
              JOIN felling_declarations d ON d.id = l.declaration_id
              WHERE l.tree_code = c.tree_code AND d.status = 'autorisee'
          )
        ORDER BY c.created_at DESC LIMIT 200
        """
    )
    return [
        _item(
            "felled_without_authorization",
            r["tree_code"],
            r["tree_code"],
            "Abattage enregistré sans déclaration autorisée",
            org_id=r.get("org_id"),
            org_name=r.get("org_name"),
            detected_at=r.get("created_at"),
        )
        for r in rows
    ]


async def _aac_fermee() -> list[dict]:
    rows = await db.fetch_all(
        """
        SELECT d.id AS declaration_id, d.permit_number, d.title_id, d.aac_id,
               d.created_at, ft.reference AS title_ref, a.label AS aac_label,
               a.status AS aac_status, o.id AS org_id, o.name AS org_name
        FROM felling_declarations d
        JOIN annual_cut_blocks a ON a.id = d.aac_id
        LEFT JOIN forest_titles ft ON ft.id = d.title_id
        LEFT JOIN users u ON u.id = d.company_id
        LEFT JOIN organizations o ON o.id = COALESCE(u.organization_id, ft.holder_org_id)
        WHERE d.status = 'autorisee' AND a.status NOT IN ('autorise', 'ouvert')
        ORDER BY d.created_at DESC LIMIT 200
        """
    )
    return [
        _item(
            "aac_fermee",
            f"declaration:{r['declaration_id']}",
            r.get("aac_label") or f"AAC #{r.get('aac_id')}",
            f"Statut de l'AAC : {r.get('aac_status')}",
            org_id=r.get("org_id"),
            org_name=r.get("org_name"),
            title_id=r.get("title_id"),
            title_ref=r.get("title_ref"),
            aac_id=r.get("aac_id"),
            aac_label=r.get("aac_label"),
            detected_at=r.get("created_at"),
        )
        for r in rows
    ]


async def _documents_expires() -> list[dict]:
    rows = await db.fetch_all(
        """
        SELECT ld.id, ld.doc_type, ld.status, ld.expires_at, ld.scope_type,
               dt.label AS doc_label, dt.authority, o.id AS org_id, o.name AS org_name
        FROM legal_documents ld
        LEFT JOIN document_types dt ON dt.code = ld.doc_type
        LEFT JOIN annual_cut_blocks ac ON ld.scope_type = 'aac' AND ac.id = ld.scope_id
        LEFT JOIN management_units mu
            ON mu.id = CASE WHEN ld.scope_type = 'ufa' THEN ld.scope_id ELSE ac.ufa_id END
        LEFT JOIN forest_titles ft
            ON ft.id = CASE WHEN ld.scope_type = 'title' THEN ld.scope_id ELSE mu.title_id END
        LEFT JOIN organizations o
            ON o.id = CASE WHEN ld.scope_type = 'company' THEN ld.scope_id ELSE ft.holder_org_id END
        WHERE ld.status = 'expire'
           OR (ld.status <> 'rejete' AND ld.expires_at IS NOT NULL
               AND ld.expires_at < CURRENT_DATE)
        ORDER BY ld.expires_at NULLS LAST LIMIT 200
        """
    )
    items: list[dict] = []
    for r in rows:
        label = r.get("doc_label") or r.get("doc_type") or "Document"
        detail = f"{label} — échéance {_iso(r.get('expires_at')) or 'inconnue'}"
        if r.get("authority"):
            detail += f" (autorité : {r['authority']})"
        item = _item(
            "documents_expires",
            f"document:{r['id']}",
            label,
            detail,
            org_id=r.get("org_id"),
            org_name=r.get("org_name"),
            detected_at=r.get("expires_at"),
        )
        item["document"] = {
            "id": r.get("id"),
            "doc_type": r.get("doc_type"),
            "label": r.get("doc_label"),
            "status": r.get("status"),
            "expires_at": _iso(r.get("expires_at")),
        }
        items.append(item)
    return items


async def _taxes_impayees() -> list[dict]:
    rows = await db.fetch_all(
        """
        SELECT td.id, td.tax_type, td.period_year, td.due_at, td.amount_fcfa,
               td.org_id, o.name AS org_name
        FROM tax_dues td
        LEFT JOIN organizations o ON o.id = td.org_id
        WHERE td.receipt_id IS NULL
          AND td.due_at IS NOT NULL AND td.due_at < CURRENT_DATE
        ORDER BY td.due_at LIMIT 200
        """
    )
    return [
        _item(
            "taxes_impayees",
            f"due:{r['id']}",
            f"{r.get('tax_type')} {r.get('period_year') or ''}".strip(),
            f"Échéance {_iso(r.get('due_at'))} — "
            f"{r.get('amount_fcfa') or 0} FCFA non réglés (double droit, art. 283)",
            org_id=r.get("org_id"),
            org_name=r.get("org_name"),
            detected_at=r.get("due_at"),
        )
        for r in rows
    ]


async def _cites_sans_permis() -> list[dict]:
    rows = await db.fetch_all(
        """
        SELECT l.tree_code, l.species_scientific_name, d.id AS declaration_id,
               d.created_at, u.organization_id AS org_id, o.name AS org_name
        FROM declaration_lines l
        JOIN felling_declarations d ON d.id = l.declaration_id
        LEFT JOIN users u ON u.id = d.company_id
        LEFT JOIN organizations o ON o.id = u.organization_id
        WHERE d.status = 'autorisee' AND l.violations @> '["cites_listed"]'::jsonb
          AND NOT EXISTS (
              SELECT 1 FROM legal_documents ld
              WHERE ld.scope_id = u.organization_id
                AND ld.doc_type = 'permis_cites_export'
                AND ld.status = 'valide'
                AND (ld.expires_at IS NULL OR ld.expires_at >= CURRENT_DATE)
          )
        ORDER BY d.created_at DESC LIMIT 200
        """
    )
    return [
        _item(
            "cites_sans_permis",
            r["tree_code"],
            r["tree_code"],
            f"{r.get('species_scientific_name') or 'Essence'} CITES "
            "sans permis d'exportation valide",
            org_id=r.get("org_id"),
            org_name=r.get("org_name"),
            detected_at=r.get("created_at"),
        )
        for r in rows
    ]


async def _transport_sans_bordereau() -> list[dict]:
    rows = await db.fetch_all(
        """
        SELECT tr.tree_code, tr.status, tr.felled_at, o.id AS org_id, o.name AS org_name
        FROM tree_registry tr
        LEFT JOIN users u ON u.id = tr.company_id
        LEFT JOIN organizations o ON o.id = u.organization_id
        WHERE tr.status IN ('transporte', 'receptionne', 'transforme')
          AND NOT EXISTS (
              SELECT 1 FROM transport_documents t
              WHERE t.tree_codes @> to_jsonb(tr.tree_code)
          )
        ORDER BY tr.felled_at DESC NULLS LAST LIMIT 200
        """
    )
    return [
        _item(
            "transport_sans_bordereau",
            r["tree_code"],
            r["tree_code"],
            f"Statut « {r.get('status')} » sans document de transport associé",
            org_id=r.get("org_id"),
            org_name=r.get("org_name"),
            detected_at=r.get("felled_at"),
        )
        for r in rows
    ]


async def _controle_non_conforme() -> list[dict]:
    rows = await db.fetch_all(
        """
        SELECT c.id, c.control_type, c.tree_code, c.notes, c.controlled_at, c.org_id, o.name AS org_name,
               c.aac_id, b.label AS aac_label
        FROM field_controls c
        LEFT JOIN organizations o ON o.id = c.org_id
        LEFT JOIN annual_cut_blocks b ON b.id = c.aac_id
        WHERE c.result = 'non_conforme'
        ORDER BY c.controlled_at DESC LIMIT 200
        """
    )
    return [
        _item(
            "controle_non_conforme",
            f"control-{r['id']}",
            r.get("tree_code") or r.get("aac_label") or f"Contrôle {r['id']}",
            f"{r['control_type']} — {r.get('notes') or 'non conforme'}",
            org_id=r.get("org_id"),
            org_name=r.get("org_name"),
            aac_id=r.get("aac_id"),
            aac_label=r.get("aac_label"),
            detected_at=r.get("controlled_at"),
        )
        for r in rows
    ]


_DETECTORS = (
    _below_dme,
    _felled_without_authorization,
    _abattage_hors_aac,
    _espece_reservee,
    _aac_fermee,
    _documents_expires,
    _taxes_impayees,
    _cites_sans_permis,
    _transport_sans_bordereau,
    _controle_non_conforme,
)


async def reviews_map() -> dict[tuple[str, str], dict]:
    rows = await db.fetch_all(
        "SELECT anomaly_type, subject_key, status, decision_motif, reviewed_at FROM anomaly_reviews"
    )
    return {
        (r["anomaly_type"], r["subject_key"]): {
            "status": r["status"],
            "decision_motif": r.get("decision_motif"),
            "reviewed_at": _iso(r.get("reviewed_at")),
        }
        for r in rows
    }


async def collect(
    anomaly_type: str | None = None,
    severity: str | None = None,
    review: str | None = None,
) -> list[dict]:
    """Run every detector and merge the persisted review decisions."""
    items: list[dict] = []
    for detector in _DETECTORS:
        items.extend(await detector())

    reviews = await reviews_map()
    for item in items:
        rev = reviews.get((item["type"], item["subject_key"]))
        item["review_status"] = rev["status"] if rev else "ouverte"
        item["review_motif"] = rev["decision_motif"] if rev else None
        item["reviewed_at"] = rev["reviewed_at"] if rev else None

    if anomaly_type:
        items = [i for i in items if i["type"] == anomaly_type]
    if severity:
        items = [i for i in items if i["severity"] == severity]
    if review and review != "all":
        items = [i for i in items if i["review_status"] == review]
    return items


def _matches(value: str, expected: str | None) -> bool:
    return value == severity if (severity := None) else False


def summarise(items: list[dict]) -> dict:
    by_type: dict[str, dict] = {}
    for item in items:
        slot = by_type.setdefault(
            item["type"],
            {
                "type": item["type"],
                "label": item["label"],
                "severity": item["severity"],
                "count": 0,
                "ouvertes": 0,
            },
        )
        slot["count"] += 1
        if item["review_status"] == "ouverte":
            slot["ouvertes"] += 1
    ordered = sorted(by_type.values(), key=lambda e: (e["severity"] != HARD, -e["count"]))
    return {
        "total": len(items),
        "hard": sum(1 for i in items if i["severity"] == HARD),
        "warning": sum(1 for i in items if i["severity"] == WARNING),
        "ouvertes": sum(1 for i in items if i["review_status"] == "ouverte"),
        "by_type": ordered,
    }


async def record_review(
    anomaly_type: str,
    subject_key: str,
    status: str,
    motif: str | None,
    user_id: int | None,
    *,
    title_id: int | None = None,
    aac_id: int | None = None,
    org_id: int | None = None,
) -> dict:
    """Upsert the Ministry decision for one detected anomaly."""
    row = await db.fetch_one(
        """
        INSERT INTO anomaly_reviews
            (anomaly_type, subject_key, title_id, aac_id, org_id,
             status, decision_motif, reviewed_by, reviewed_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
        ON CONFLICT (anomaly_type, subject_key) DO UPDATE SET
            status = EXCLUDED.status,
            decision_motif = EXCLUDED.decision_motif,
            reviewed_by = EXCLUDED.reviewed_by,
            reviewed_at = now(),
            title_id = COALESCE(EXCLUDED.title_id, anomaly_reviews.title_id),
            aac_id = COALESCE(EXCLUDED.aac_id, anomaly_reviews.aac_id),
            org_id = COALESCE(EXCLUDED.org_id, anomaly_reviews.org_id)
        RETURNING anomaly_type, subject_key, status, decision_motif, reviewed_at
        """,
        anomaly_type,
        subject_key,
        title_id,
        aac_id,
        org_id,
        status,
        motif,
        user_id,
    )
    return dict(row)
