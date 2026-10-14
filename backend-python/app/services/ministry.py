"""Ministry cockpit: what waits for a decision, alerts, organisations by province.

Each queue lists the files in their "submitted" status, the authority that
decides them under Loi 016/01 (shown, not yet enforced — a single ``admin`` role
decides, frozen decision §10 pt 3) and the province of the title concerned.
"""

from app.services import anomalies, db

#: queue key -> (label, competent authority, SQL returning id, label, org,
#: created_at, title_id). Statuses are the real "submitted" ones of each table.
QUEUES: dict[str, dict] = {
    "declarations": {
        "label": "Déclarations d'abattage",
        "authority": "Direction Provinciale",
        "sql": """
            SELECT d.id, 'Déclaration n° ' || d.id || ' · ' || d.permit_type || ' ' || d.permit_number AS label,
                   o.name AS org_name, d.created_at, d.title_id
            FROM felling_declarations d
            LEFT JOIN users u ON u.id = d.company_id
            LEFT JOIN organizations o ON o.id = u.organization_id
            WHERE d.status = 'soumise'
        """,
    },
    "documents": {
        "label": "Pièces légales",
        "authority": "Selon la pièce",
        "sql": """
            SELECT ld.id, COALESCE(dt.label, ld.doc_type) AS label, o.name AS org_name,
                   ld.created_at, x.title_id, COALESCE(ld.authority, dt.authority) AS authority
            FROM legal_documents ld
            LEFT JOIN document_types dt ON dt.code = ld.doc_type
            LEFT JOIN forest_titles tt ON ld.scope_type = 'title' AND tt.id = ld.scope_id
            LEFT JOIN management_units uu ON ld.scope_type = 'ufa' AND uu.id = ld.scope_id
            LEFT JOIN annual_cut_blocks bb ON ld.scope_type = 'aac' AND bb.id = ld.scope_id
            LEFT JOIN management_units ub ON ub.id = bb.ufa_id
            CROSS JOIN LATERAL (SELECT COALESCE(tt.id, uu.title_id, ub.title_id) AS title_id) x
            LEFT JOIN organizations o ON o.id = COALESCE(
                CASE WHEN ld.scope_type = 'company' THEN ld.scope_id END,
                (SELECT ft.holder_org_id FROM forest_titles ft WHERE ft.id = x.title_id)
            )
            WHERE ld.status = 'soumis'
        """,
    },
    "authorizations": {
        "label": "Autorisations d'exploiter (art. 14)",
        "authority": "Direction Provinciale / DGF",
        "sql": """
            SELECT a.id, a.authorization_type || ' · ' || b.label AS label, o.name AS org_name,
                   a.created_at, u.title_id
            FROM aac_authorizations a
            JOIN annual_cut_blocks b ON b.id = a.aac_id
            JOIN management_units u ON u.id = b.ufa_id
            JOIN forest_titles t ON t.id = u.title_id
            LEFT JOIN organizations o ON o.id = t.holder_org_id
            WHERE a.status = 'soumis'
        """,
    },
    "pao": {
        "label": "PAO d'AAC",
        "authority": "Direction Provinciale",
        "sql": """
            SELECT b.id, 'PAO · ' || b.label AS label, o.name AS org_name,
                   COALESCE(b.pao_submitted_at, b.created_at) AS created_at, u.title_id
            FROM annual_cut_blocks b
            JOIN management_units u ON u.id = b.ufa_id
            JOIN forest_titles t ON t.id = u.title_id
            LEFT JOIN organizations o ON o.id = t.holder_org_id
            WHERE b.status = 'soumis'
        """,
    },
    "studies": {
        "label": "Études PPF / EIE",
        "authority": "DGFAP / DGE",
        "sql": """
            SELECT s.id, upper(s.study_type) || ' · ' || COALESCE(t.reference, 'titre ' || t.id) AS label,
                   o.name AS org_name, s.created_at, s.title_id
            FROM environmental_studies s
            JOIN forest_titles t ON t.id = s.title_id
            LEFT JOIN organizations o ON o.id = t.holder_org_id
            WHERE s.status = 'soumis'
        """,
    },
    "certifications": {
        "label": "Certifications tierces",
        "authority": "DGF",
        "sql": """
            SELECT c.id, c.scheme || ' · ' || COALESCE(c.certificate_ref, '') AS label,
                   o.name AS org_name, c.created_at, c.title_id
            FROM certifications c
            LEFT JOIN organizations o ON o.id = c.org_id
            WHERE c.status = 'soumis'
        """,
    },
    "eudr": {
        "label": "Diligences RDUE",
        "authority": "DGF",
        "sql": """
            SELECT e.id, 'Diligence RDUE n° ' || e.id AS label, o.name AS org_name, e.created_at,
                   e.title_id
            FROM eudr_diligence e
            LEFT JOIN organizations o ON o.id = e.org_id
            WHERE e.status = 'soumis'
        """,
    },
    "titles": {
        "label": "Demandes de titre",
        "authority": "DGF",
        "sql": """
            SELECT t.id, t.title_type || ' · ' || COALESCE(t.reference, 'sans référence') AS label,
                   o.name AS org_name, t.created_at, t.id AS title_id
            FROM forest_titles t
            LEFT JOIN organizations o ON o.id = t.holder_org_id
            WHERE t.status = 'demande'
        """,
    },
}


async def _queue_rows(key: str) -> list[dict]:
    q = QUEUES[key]
    rows = await db.fetch_all(
        f"""
        SELECT q.*, v.province_code, a.name AS province_name
        FROM ({q["sql"]}) q
        LEFT JOIN v_title_province v ON v.title_id = q.title_id
        LEFT JOIN admin_areas a ON a.code = v.province_code
        ORDER BY q.created_at NULLS LAST
        LIMIT 200
        """
    )
    out = []
    for r in rows:
        item = dict(r)
        item["type"] = key
        item["authority"] = item.get("authority") or q["authority"]
        out.append(item)
    return out


async def inbox() -> dict:
    """Counters per queue (oldest first), anomalies, accounts to link, alerts."""
    queues = []
    for key, q in QUEUES.items():
        rows = await _queue_rows(key)
        queues.append(
            {
                "key": key,
                "label": q["label"],
                "authority": q["authority"],
                "count": len(rows),
                "oldest_at": rows[0]["created_at"] if rows else None,
            }
        )
    summary = anomalies.summarise(await anomalies.collect())
    orphans = await db.fetch_one(
        "SELECT count(*) AS n FROM users WHERE role IN ('company', 'cooperative')"
        " AND organization_id IS NULL AND is_active"
    )
    open_anomalies = int(summary.get("ouvertes") or 0)
    queues.append(
        {
            "key": "anomalies",
            "label": "Anomalies ouvertes",
            "authority": "DGF / Direction Provinciale",
            "count": open_anomalies,
            "oldest_at": None,
        }
    )
    queues.append(
        {
            "key": "orphans",
            "label": "Comptes à rattacher",
            "authority": "DGF",
            "count": int((orphans or {}).get("n") or 0),
            "oldest_at": None,
        }
    )
    docs = await db.fetch_one(
        "SELECT count(*) FILTER (WHERE status = 'valide' AND expires_at < CURRENT_DATE) AS expired"
        " FROM legal_documents"
    )
    taxes = await db.fetch_one(
        "SELECT count(*) AS n, coalesce(sum(amount_fcfa), 0) AS amount FROM tax_dues"
        " WHERE receipt_id IS NULL AND due_at < CURRENT_DATE"
    )
    alerts = []
    hard = sum(
        int(t.get("ouvertes") or 0)
        for t in summary.get("by_type", [])
        if t.get("severity") == anomalies.HARD
    )
    if hard:
        alerts.append({"level": "risk", "kind": "anomalies_hard", "count": hard})
    if docs and docs.get("expired"):
        alerts.append({"level": "warn", "kind": "documents_expired", "count": int(docs["expired"])})
    if taxes and taxes.get("n"):
        alerts.append(
            {
                "level": "warn",
                "kind": "taxes_overdue",
                "count": int(taxes["n"]),
                "amount_fcfa": float(taxes.get("amount") or 0),
            }
        )
    return {
        "total": sum(q["count"] for q in queues),
        "queues": queues,
        "alerts": alerts,
    }


async def inbox_items(kind: str | None = None, province: str | None = None) -> list[dict]:
    """Every pending file, oldest first, optionally one type / one province."""
    keys = [kind] if kind in QUEUES else list(QUEUES)
    items: list[dict] = []
    for key in keys:
        items.extend(await _queue_rows(key))
    if province:
        items = [i for i in items if i.get("province_code") == province]
    items.sort(key=lambda i: (i.get("created_at") is None, str(i.get("created_at") or "")))
    return items


async def organisations(province: str | None = None, org_type: str | None = None) -> list[dict]:
    """Legal entities with type, profile, provinces of their titles and health."""
    rows = await db.fetch_all(
        """
        SELECT o.id, o.org_type, o.name, o.profile_code, p.label AS profile_label, o.is_active,
               o.tax_id, o.email, o.phone,
               (SELECT count(*) FROM forest_titles t WHERE t.holder_org_id = o.id) AS titles,
               (SELECT coalesce(sum(t.surface_ha), 0) FROM forest_titles t
                 WHERE t.holder_org_id = o.id) AS surface_ha,
               (SELECT array_remove(array_agg(DISTINCT v.province_code), NULL)
                  FROM forest_titles t JOIN v_title_province v ON v.title_id = t.id
                 WHERE t.holder_org_id = o.id) AS provinces,
               (SELECT count(*) FROM users u WHERE u.organization_id = o.id AND u.is_active) AS accounts,
               (SELECT count(*) FROM legal_documents ld
                 WHERE ld.scope_type = 'company' AND ld.scope_id = o.id
                   AND ld.status IN ('manquant', 'rejete', 'expire')) AS documents_missing,
               (SELECT count(*) FROM legal_documents ld
                 WHERE ld.scope_type = 'company' AND ld.scope_id = o.id
                   AND ld.status = 'soumis') AS documents_pending,
               (SELECT count(*) FROM tax_dues d
                 WHERE d.org_id = o.id AND d.receipt_id IS NULL AND d.due_at < CURRENT_DATE) AS taxes_overdue
        FROM organizations o
        LEFT JOIN org_profiles p ON p.code = o.profile_code
        ORDER BY o.name
        """
    )
    out = []
    for r in rows:
        item = dict(r)
        item["provinces"] = list(item.get("provinces") or [])
        item["surface_ha"] = float(item.get("surface_ha") or 0)
        if province and province not in item["provinces"]:
            continue
        if org_type and item["org_type"] != org_type:
            continue
        out.append(item)
    return out


async def provinces_summary() -> list[dict]:
    """The 9 provinces with the organisations holding titles there."""
    rows = await db.fetch_all(
        """
        SELECT a.code, a.name,
               count(DISTINCT t.holder_org_id) AS organisations,
               count(t.id) AS titles,
               coalesce(sum(t.surface_ha), 0) AS surface_ha
        FROM admin_areas a
        LEFT JOIN v_title_province v ON v.province_code = a.code
        LEFT JOIN forest_titles t ON t.id = v.title_id
        WHERE a.level = 1
        GROUP BY a.code, a.name
        ORDER BY organisations DESC, a.name
        """
    )
    return [dict(r, surface_ha=float(r["surface_ha"] or 0)) for r in rows]
