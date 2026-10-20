"""Company space: what the operator must do, what the Ministry decided, what it found.

Everything is derived at read time from the domain tables (no inbox table):
actions due (documents, taxes, art. 14 start-up notice, logs to fell / ship /
receive, expiring certifications), the Ministry's recent decisions on the
organization's files with their reasons, its anomalies and the field controls
that concern it (right of reply).
"""

from datetime import UTC, date, datetime, timedelta

from app.core import fr_format
from app.services import (
    anomalies,
    authorities,
    compliance,
    controls,
    cooperative,
    db,
    deadlines,
    mill,
)

DECISION_WINDOW_DAYS = 120
CERT_NOTICE_DAYS = 60

_TAX_LABELS = {
    "superficie": "Taxe de superficie",
    "abattage": "Taxe d'abattage",
    "surveillance": "Redevance de surveillance",
}


def _iso(value) -> str | None:
    if value is None:
        return None
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return str(value)


def _todo(kind: str, level: str, label: str, target: str, **extra) -> dict:
    return {"kind": kind, "level": level, "label": label, "target": target, **extra}


async def _doc_labels() -> dict[str, str]:
    rows = await db.fetch_all("SELECT code, label FROM document_types")
    return {r["code"]: r["label"] for r in rows}


async def todo(org_id: int, company_user_id: int | None) -> list[dict]:
    items: list[dict] = []
    labels = await _doc_labels()
    for w in await compliance.assess_org_warnings(org_id):
        if w["kind"] == "document":
            status = w.get("status") or "manquant"
            items.append(
                _todo(
                    "document",
                    "risk" if status in ("manquant", "expire", "rejete") else "warn",
                    f"{labels.get(w['doc_type'], w['doc_type'])} : {status}",
                    "documents",
                    doc_type=w["doc_type"],
                    status=status,
                )
            )
        elif w["kind"] == "tax":
            items.append(
                _todo(
                    "tax",
                    "risk",
                    f"{_TAX_LABELS.get(w['tax_type'], w['tax_type'])} {w.get('period_year') or ''}"
                    " : échéance en retard (art. 283)".replace("  ", " "),
                    "taxes",
                    amount_fcfa=w.get("amount_fcfa"),
                )
            )

    startup = await db.fetch_all(
        """
        SELECT a.id, a.authorization_type, b.label AS aac_label
        FROM aac_authorizations a
        JOIN annual_cut_blocks b ON b.id = a.aac_id
        JOIN management_units u ON u.id = b.ufa_id
        JOIN forest_titles t ON t.id = u.title_id
        WHERE t.holder_org_id = $1 AND a.status = 'delivre' AND a.startup_notified_at IS NULL
        """,
        org_id,
    )
    for r in startup:
        items.append(
            _todo(
                "startup",
                "warn",
                f"Notifier le démarrage des activités · {r['aac_label']} (art. 14)",
                "titres",
                authorization_id=r["id"],
            )
        )

    logs = await db.fetch_one(
        """
        SELECT count(*) FILTER (WHERE r.status = 'autorise') AS to_fell,
               count(*) FILTER (WHERE r.status = 'abattu' AND NOT EXISTS (
                   SELECT 1 FROM transport_documents d
                   WHERE d.tree_codes ? r.tree_code AND d.status IN ('brouillon', 'emis'))
               ) AS to_ship,
               count(*) FILTER (WHERE r.status = 'receptionne') AS to_process
        FROM tree_registry r
        WHERE r.custodian_org_id = $1
           OR (r.custodian_org_id IS NULL AND r.company_id = $2)
        """,
        org_id,
        company_user_id,
    )
    if logs and logs["to_fell"]:
        items.append(
            _todo(
                "to_fell",
                "info",
                f"{logs['to_fell']} arbre(s) autorisé(s) à abattre",
                "grumes",
                count=logs["to_fell"],
            )
        )
    if logs and logs["to_ship"]:
        items.append(
            _todo(
                "to_ship",
                "info",
                f"{logs['to_ship']} grume(s) abattue(s) sans bordereau",
                "tracabilite",
                count=logs["to_ship"],
            )
        )
    if logs and logs["to_process"]:
        items.append(
            _todo(
                "to_process",
                "info",
                f"{logs['to_process']} grume(s) réceptionnée(s) à transformer",
                "grumes",
                count=logs["to_process"],
            )
        )

    slips = await db.fetch_one(
        """
        SELECT count(*) FILTER (WHERE org_id = $1 AND status = 'brouillon') AS drafts,
               count(*) FILTER (WHERE destination_org_id = $1 AND status = 'emis') AS incoming
        FROM transport_documents
        """,
        org_id,
    )
    if slips and slips["drafts"]:
        items.append(
            _todo(
                "slip_draft",
                "warn",
                f"{slips['drafts']} bordereau(x) en brouillon à émettre",
                "tracabilite",
                count=slips["drafts"],
            )
        )
    if slips and slips["incoming"]:
        items.append(
            _todo(
                "slip_incoming",
                "warn",
                f"{slips['incoming']} bordereau(x) entrant(s) à réceptionner",
                "tracabilite",
                count=slips["incoming"],
            )
        )

    certs = await db.fetch_all(
        "SELECT id, scheme, valid_to FROM certifications"
        " WHERE org_id = $1 AND status = 'actif' AND valid_to IS NOT NULL"
        " AND valid_to <= CURRENT_DATE + $2::int",
        org_id,
        CERT_NOTICE_DAYS,
    )
    for c in certs:
        items.append(
            _todo(
                "certification",
                "warn",
                f"Certification {c['scheme']} : échéance le {fr_format.fr_date(c['valid_to'])}",
                "cert",
                certification_id=c["id"],
            )
        )
    for s in await deadlines.statements_missing(org_id):
        items.append(
            _todo(
                "statement",
                "risk" if s["overdue"] else "warn",
                f"État annuel {s['year']} à transmettre"
                + (
                    f" : en retard depuis le {fr_format.fr_date(s['due'])}"
                    if s["overdue"]
                    else f" avant le {fr_format.fr_date(s['due'])}"
                )
                + " (art. 244)",
                "tracabilite",
                year=s["year"],
            )
        )
    for a in await deadlines.aac_open_too_long(org_id):
        items.append(
            _todo(
                "aac_deadline",
                "risk" if a["overdue"] else "warn",
                f"{a['label']} : ouverture limitée à 3 ans, échéance le {fr_format.fr_date(a['deadline'])} (art. 121)",
                "titres",
                aac_id=a["id"],
            )
        )
    for a in await deadlines.authorizations_expiring(org_id):
        items.append(
            _todo(
                "authorization_expiring",
                "warn",
                f"Autorisation {a['aac_label']} : fin de validité le {fr_format.fr_date(a['valid_to'])}",
                "titres",
                authorization_id=a["id"],
            )
        )
    for d in await deadlines.documents_expiring(org_id):
        items.append(
            _todo(
                "document_expiring",
                "warn",
                f"{d['label']} : expire le {fr_format.fr_date(d['expires_at'])}",
                "documents",
                document_id=d["id"],
            )
        )
    for f in await controls.open_followups(org_id):
        amount = f" de {fr_format.fr_num(f['amount_fcfa'])} FCFA" if f.get("amount_fcfa") else ""
        due = f" avant le {fr_format.fr_date(f['due_at'])}" if f.get("due_at") else ""
        state = {"en_retard": " — en retard", "conteste": " — contestée, en attente du Ministère"}
        items.append(
            _todo(
                "control_followup",
                "risk" if f["display_status"] in ("en_retard", "notifie") else "warn",
                f"{f['label']}{amount}{due}{state.get(f['display_status'], '')}",
                "accueil",
                followup_id=f["id"],
                can_contest=f["status"] == "notifie" and not f.get("reply"),
            )
        )
    for alert in await mill.yield_alerts():
        if alert["org_id"] == org_id:
            items.append(
                _todo(
                    "mill_yield",
                    "warn",
                    f"Registre de transformation : {fr_format.fr_num(alert['output_m3'], 1)} m³"
                    f" produits pour {fr_format.fr_num(alert['input_m3'], 1)} m³ reçus"
                    " — vérifiez vos entrées",
                    "usine",
                )
            )
    order = {"risk": 0, "warn": 1, "info": 2}
    items.sort(key=lambda i: order.get(i["level"], 3))
    return items


_DECISIONS_SQL = """
SELECT * FROM (
    SELECT 'declarations' AS kind, d.id, 'Déclaration n° ' || d.id || ' · ' || d.permit_number AS label,
           d.status, d.decision_motif AS motif, d.decided_at
    FROM felling_declarations d
    LEFT JOIN users u ON u.id = d.company_id
    WHERE u.organization_id = $1 AND d.status IN ('autorisee', 'rejetee')
  UNION ALL
    SELECT 'documents', ld.id, COALESCE(dt.label, ld.doc_type), ld.status, ld.notes, ld.verified_at
    FROM legal_documents ld
    LEFT JOIN document_types dt ON dt.code = ld.doc_type
    WHERE ld.status IN ('valide', 'rejete') AND ld.verified_at IS NOT NULL
      AND ((ld.scope_type = 'company' AND ld.scope_id = $1)
        OR (ld.scope_type = 'title' AND ld.scope_id IN
            (SELECT id FROM forest_titles WHERE holder_org_id = $1)))
  UNION ALL
    SELECT 'authorizations', a.id, a.authorization_type || ' · ' || b.label, a.status,
           a.decision_motif, a.issued_at
    FROM aac_authorizations a
    JOIN annual_cut_blocks b ON b.id = a.aac_id
    JOIN management_units mu ON mu.id = b.ufa_id
    JOIN forest_titles t ON t.id = mu.title_id
    WHERE t.holder_org_id = $1 AND a.status IN ('delivre', 'rejete')
  UNION ALL
    SELECT 'studies', s.id, upper(s.study_type) || ' · ' || COALESCE(t.reference, ''), s.status,
           s.decision_motif, s.decided_at
    FROM environmental_studies s JOIN forest_titles t ON t.id = s.title_id
    WHERE t.holder_org_id = $1 AND s.status IN ('valide', 'rejete')
  UNION ALL
    SELECT 'certifications', c.id, c.scheme || ' · ' || COALESCE(c.certificate_ref, ''), c.status,
           c.decision_motif, c.verified_at
    FROM certifications c
    WHERE c.org_id = $1 AND c.status IN ('actif', 'suspendu', 'rejete') AND c.verified_at IS NOT NULL
  UNION ALL
    SELECT 'eudr', e.id, 'Diligence RDUE · ' || COALESCE(e.parcel_label, ''), e.status,
           e.decision_motif, e.decided_at
    FROM eudr_diligence e
    WHERE e.org_id = $1 AND e.status IN ('valide', 'rejete')
  UNION ALL
    SELECT 'titles', t.id, t.title_type || ' · ' || COALESCE(t.reference, 'titre ' || t.id), t.status,
           t.decision_motif, t.decided_at
    FROM forest_titles t
    WHERE t.holder_org_id = $1 AND t.decided_at IS NOT NULL
) x
WHERE x.decided_at IS NULL OR x.decided_at >= $2
ORDER BY x.decided_at DESC NULLS LAST
LIMIT 60
"""

_REJECTED = {"rejetee", "rejete", "suspendu", "retire"}
_QUEUE_AUTHORITY = {
    "declarations": "Direction Provinciale",
    "documents": None,
    "authorizations": "Direction Provinciale / DGF",
    "studies": "DGFAP / DGE",
    "certifications": "DGF",
    "eudr": "DGF",
    "titles": "DGF",
}


async def decisions(org_id: int) -> list[dict]:
    since = datetime.now(UTC) - timedelta(days=DECISION_WINDOW_DAYS)
    rows = await db.fetch_all(_DECISIONS_SQL, org_id, since)
    out = []
    for r in rows:
        item = dict(r)
        item["decided_at"] = _iso(item.get("decided_at"))
        item["outcome"] = "rejet" if item["status"] in _REJECTED else "accord"
        if item["kind"] == "authorizations":
            item["label"] = fr_format.with_authorization_label(item["label"])
        item.update(authorities.competence(_QUEUE_AUTHORITY.get(item["kind"])))
        out.append(item)
    return out


async def org_anomalies(org_id: int) -> list[dict]:
    items = await anomalies.collect()
    return [i for i in items if i.get("org_id") == org_id and i["review_status"] == "ouverte"]


async def space(user: dict) -> dict:
    org_id = user.get("organization_id")
    if org_id is None:
        return {
            "organization": None,
            "todo": [],
            "decisions": [],
            "anomalies": [],
            "controls": [],
            "cooperatives": [],
        }
    org = await db.fetch_one(
        "SELECT id, name, org_type, profile_code FROM organizations WHERE id = $1", org_id
    )
    company_user = user["id"] if user.get("role") == "company" else user.get("company_id")
    return {
        "organization": dict(org) if org is not None else None,
        "todo": await todo(org_id, company_user),
        "decisions": await decisions(org_id),
        "anomalies": await org_anomalies(org_id),
        "controls": await controls.list_controls(org_id=org_id),
        "cooperatives": await cooperative.memberships_of(org_id),
        "acting_authority": authorities.ACTING,
    }
