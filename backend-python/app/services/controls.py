"""Ministry field controls (guide, board 2): marking (art. 130–133), DF10
logbook stamp (art. 49), roadside check (art. 135), transformation check.

``lookup`` turns a scanned QR / typed code into the facts an agent needs on
the spot, with automatic checks (ok / ko / warn); ``record`` stores the
control and its result. A non-compliant control becomes an anomaly.
"""

import json

from fastapi import HTTPException

from app.services import authorities, compliance, db

CONTROL_AUTHORITY: dict[str, str] = {
    "marquage": "Direction Provinciale",
    "visa_df10": "Direction Provinciale",
    "route": "DGF",
    "transformation": "DGICBVPF",
}

CONTROL_TYPES = ("marquage", "visa_df10", "route", "transformation")
RESULTS = ("conforme", "reserve", "non_conforme")
_FELLED = ("abattu", "transporte", "receptionne", "transforme")
GATE_LABELS = {
    "no_aac": "Arbre sans AAC enregistrée",
    "aac_not_held": "AAC d'une autre organisation",
    "no_authorization": "Aucune autorisation délivrée (art. 14)",
    "authorization_pending": "Autorisation en attente",
    "startup_not_notified": "Démarrage non notifié (art. 14)",
}


def _check(level: str, label: str) -> dict:
    return {"level": level, "label": label}


async def _tree(code: str) -> dict | None:
    row = await db.fetch_one(
        """
        SELECT r.tree_code, r.status, r.species_scientific_name, r.measured_dbh_cm, r.marking_type,
               r.hammer_mark, r.df10_entry_no, r.aac_id, b.label AS aac_label, b.status AS aac_status,
               t.holder_org_id AS org_id, o.name AS org_name
        FROM tree_registry r
        LEFT JOIN annual_cut_blocks b ON b.id = r.aac_id
        LEFT JOIN management_units u ON u.id = b.ufa_id
        LEFT JOIN forest_titles t ON t.id = u.title_id
        LEFT JOIN organizations o ON o.id = t.holder_org_id
        WHERE r.tree_code = $1
        """,
        code,
    )
    return dict(row) if row else None


async def _transport_for_tree(code: str) -> dict | None:
    row = await db.fetch_one(
        """
        SELECT id, doc_type, status, reference, issued_at, to_label
        FROM transport_documents
        WHERE tree_codes @> to_jsonb(ARRAY[$1::text]) AND status IN ('emis', 'receptionne')
        ORDER BY issued_at DESC NULLS LAST LIMIT 1
        """,
        code,
    )
    return dict(row) if row else None


async def lookup(code: str) -> dict:
    """Facts and automatic checks for a scanned tree / log code or slip reference."""
    code = (code or "").strip()
    if not code:
        raise HTTPException(status_code=422, detail="Code requis")
    tree = await _tree(code)
    if tree is not None:
        checks = [_check("ok", "Arbre inscrit au registre")]
        gate = (
            await compliance.authorization_gate(tree["aac_id"], tree["org_id"])
            if tree["aac_id"]
            else "no_aac"
        )
        checks.append(
            _check("ok", "AAC autorisée (art. 14)")
            if gate is None
            else _check("ko", GATE_LABELS.get(gate, gate))
        )
        checks.append(
            _check("ok", f"Marteau {tree['hammer_mark']}")
            if tree.get("hammer_mark")
            else _check("warn", "Empreinte du marteau non saisie")
        )
        if tree["status"] in _FELLED:
            checks.append(
                _check("ok", f"Inscrit au DF10 ({tree['df10_entry_no']})")
                if tree.get("df10_entry_no")
                else _check("ko", "Abattu sans inscription au carnet DF10")
            )
        transport = (
            await _transport_for_tree(code)
            if tree["status"] in ("transporte", "receptionne")
            else None
        )
        if tree["status"] == "transporte":
            checks.append(
                _check("ok", f"Couvert par le bordereau {transport['reference']}")
                if transport
                else _check("ko", "En transport sans bordereau / feuille de route")
            )
        return {
            "kind": "tree",
            "code": code,
            "tree": tree,
            "transport": transport,
            "checks": checks,
        }

    slip = await db.fetch_one(
        "SELECT id, doc_type, status, reference, tree_codes, issued_at, org_id, aac_id, from_label, to_label,"
        " volume_m3 FROM transport_documents WHERE reference = $1 OR qr_payload = $1",
        code,
    )
    if slip is not None:
        slip = dict(slip)
        codes = slip.get("tree_codes") or []
        if isinstance(codes, str):
            codes = json.loads(codes)
        slip["tree_codes"] = codes
        checks = [
            _check("ok", f"Bordereau {slip['status']}")
            if slip["status"] in ("emis", "receptionne")
            else _check("ko", f"Bordereau {slip['status']}"),
            _check("ok", f"{len(codes)} grume(s) listée(s)")
            if codes
            else _check("warn", "Aucune grume listée"),
        ]
        return {"kind": "transport", "code": code, "transport": slip, "checks": checks}
    return {
        "kind": "unknown",
        "code": code,
        "checks": [_check("ko", "Code inconnu du registre et des bordereaux")],
    }


async def record(body: dict, admin: dict) -> dict:
    kind = body["control_type"]
    result = body["result"]
    if kind not in CONTROL_TYPES or result not in RESULTS:
        raise HTTPException(status_code=422, detail="Type ou résultat de contrôle invalide")
    notes = (body.get("notes") or "").strip() or None
    if result != "conforme" and not notes:
        raise HTTPException(
            status_code=400, detail="Constat obligatoire si le contrôle n'est pas conforme"
        )
    tree_code = (body.get("tree_code") or "").strip() or None
    aac_id = body.get("aac_id")
    org_id = body.get("org_id")
    transport_id = body.get("transport_document_id")
    if kind == "marquage" and not tree_code:
        raise HTTPException(
            status_code=422, detail="Code de l'arbre requis pour un contrôle du marquage"
        )
    if kind == "visa_df10" and not aac_id:
        raise HTTPException(status_code=422, detail="AAC requise pour viser le carnet DF10")
    if kind == "route" and not (tree_code or transport_id):
        raise HTTPException(
            status_code=422, detail="Grume ou bordereau requis pour un contrôle en route"
        )
    if kind == "transformation" and not org_id:
        raise HTTPException(
            status_code=422, detail="Organisation requise pour un contrôle de transformation"
        )
    findings = body.get("findings") or []
    if tree_code:
        tree = await _tree(tree_code)
        if tree is None:
            raise HTTPException(status_code=404, detail="Arbre inconnu du registre")
        aac_id = aac_id or tree["aac_id"]
        org_id = org_id or tree["org_id"]
        if not findings:
            findings = (await lookup(tree_code))["checks"]
    if aac_id and not org_id:
        holder = await db.fetch_one(
            "SELECT t.holder_org_id FROM annual_cut_blocks b JOIN management_units u ON u.id = b.ufa_id"
            " JOIN forest_titles t ON t.id = u.title_id WHERE b.id = $1",
            aac_id,
        )
        org_id = holder["holder_org_id"] if holder else None
    lat, lon = body.get("latitude"), body.get("longitude")
    row = await db.fetch_one(
        """
        INSERT INTO field_controls
            (control_type, result, tree_code, transport_document_id, aac_id, org_id, findings, notes,
             pv_reference, geom, controlled_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9,
                CASE WHEN $10::float8 IS NULL OR $11::float8 IS NULL THEN NULL
                     ELSE ST_SetSRID(ST_MakePoint($11, $10), 4326) END,
                $12)
        RETURNING id, control_type, result, tree_code, aac_id, org_id, controlled_at
        """,
        kind,
        result,
        tree_code,
        transport_id,
        aac_id,
        org_id,
        json.dumps(findings),
        notes,
        (body.get("pv_reference") or "").strip() or None,
        lat,
        lon,
        admin["id"],
    )
    return dict(row)


async def list_controls(
    kind: str | None = None, result: str | None = None, org_id: int | None = None
) -> list[dict]:
    rows = await db.fetch_all(
        """
        SELECT c.id, c.control_type, c.result, c.tree_code, c.transport_document_id, c.aac_id,
               b.label AS aac_label, c.org_id, o.name AS org_name, c.notes, c.pv_reference,
               c.findings, c.controlled_at, u.display_name AS controlled_by_name,
               ST_Y(c.geom) AS latitude, ST_X(c.geom) AS longitude
        FROM field_controls c
        LEFT JOIN annual_cut_blocks b ON b.id = c.aac_id
        LEFT JOIN organizations o ON o.id = c.org_id
        LEFT JOIN users u ON u.id = c.controlled_by
        WHERE ($1::text IS NULL OR c.control_type = $1) AND ($2::text IS NULL OR c.result = $2)
          AND ($3::int IS NULL OR c.org_id = $3)
        ORDER BY c.controlled_at DESC
        LIMIT 300
        """,
        kind,
        result,
        org_id,
    )
    out = []
    for r in rows:
        item = dict(r)
        item.update(authorities.competence(CONTROL_AUTHORITY.get(item["control_type"])))
        out.append(item)
    return out


async def get_control(control_id: int) -> dict | None:
    """One control with the names a PV needs (operator, AAC, slip, agent)."""
    row = await db.fetch_one(
        """
        SELECT c.*, b.label AS aac_label, o.name AS org_name, d.reference AS transport_reference,
               COALESCE(NULLIF(trim(concat_ws(' ', u.first_name, u.last_name)), ''),
                        u.display_name, u.email) AS controlled_by_name,
               u.matricule AS controlled_by_matricule,
               ST_Y(c.geom) AS latitude, ST_X(c.geom) AS longitude
        FROM field_controls c
        LEFT JOIN annual_cut_blocks b ON b.id = c.aac_id
        LEFT JOIN organizations o ON o.id = c.org_id
        LEFT JOIN transport_documents d ON d.id = c.transport_document_id
        LEFT JOIN users u ON u.id = c.controlled_by
        WHERE c.id = $1
        """,
        control_id,
    )
    if row is None:
        return None
    item = dict(row)
    findings = item.get("findings")
    item["findings"] = json.loads(findings) if isinstance(findings, str) else (findings or [])
    item.update(authorities.competence(CONTROL_AUTHORITY.get(item["control_type"])))
    return item
