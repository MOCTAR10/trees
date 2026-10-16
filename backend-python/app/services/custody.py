"""Chain of custody of a log: who holds it, what may happen next, its history.

Status chain (Loi 016/01): ``declare → autorise`` by the Ministry decision,
``abattu`` recorded at the stump (art. 14 authorization required), ``transporte``
and ``receptionne`` only through an issued transport document (art. 135), then
``transforme`` by the organization that received it.
"""

from app.services import db

CHAIN = ("inventorie", "declare", "autorise", "abattu", "transporte", "receptionne", "transforme")

EVENT_REQUIRES: dict[str, str] = {
    "abattu": "autorise",
    "transforme": "receptionne",
}

STATUS_LABELS: dict[str, str] = {
    "inventorie": "Inventorié",
    "declare": "Déclaré",
    "autorise": "Autorisé",
    "abattu": "Abattu",
    "transporte": "En transport",
    "receptionne": "Réceptionné",
    "transforme": "Transformé",
}

_REFUSALS: dict[str, str] = {
    "abattu": "Abattage refusé : l'arbre doit figurer dans une déclaration approuvée"
    " par le Ministère (art. 14).",
    "transforme": "Transformation refusée : la grume doit d'abord être réceptionnée"
    " à l'usine avec son bordereau.",
}

_ROUTED = {
    "transporte": "Le transport s'enregistre en émettant un bordereau de roulage"
    " (art. 135), pas grume par grume.",
    "receptionne": "La réception s'enregistre sur le bordereau, par l'organisation destinataire.",
}


def refusal(event: str, status: str) -> str | None:
    """French reason why ``event`` cannot apply to a log at ``status``, or None."""
    if event in _ROUTED:
        return _ROUTED[event]
    required = EVENT_REQUIRES.get(event)
    if required is None or status == required:
        return None
    return f"{_REFUSALS[event]} Statut actuel : {STATUS_LABELS.get(status, status)}."


def holds(user: dict, tree: dict) -> bool:
    """The caller's organization currently holds the log (legacy owner as fallback)."""
    org_id = user.get("organization_id")
    if tree.get("custodian_org_id") is not None:
        return org_id is not None and tree["custodian_org_id"] == org_id
    owner = user.get("company_id")
    if owner is None and user.get("role") == "company":
        owner = user["id"]
    return owner is not None and tree.get("company_id") == owner


def next_event(tree: dict) -> str | None:
    status = tree.get("status")
    return next((e for e, req in EVENT_REQUIRES.items() if req == status), None)


async def acting_user(user: dict) -> dict:
    """The caller with its organization, resolved through the employer for field agents."""
    if user.get("organization_id") is not None or user.get("company_id") is None:
        return user
    row = await db.fetch_one("SELECT organization_id FROM users WHERE id = $1", user["company_id"])
    org_id = row["organization_id"] if row is not None else None
    return {**user, "organization_id": org_id}


async def lookup(code: str, user: dict) -> dict | None:
    """A log with its holder, history, open transport document and next action."""
    user = await acting_user(user)
    tree = await db.fetch_one(
        """
        SELECT r.tree_code, r.status, r.species_scientific_name, r.measured_dbh_cm,
               r.marking_type, r.hammer_mark, r.df10_entry_no, r.felled_at,
               r.company_id, r.custodian_org_id, r.aac_id,
               COALESCE(r.aac_label, (SELECT b.label FROM annual_cut_blocks b WHERE b.id = r.aac_id)) AS aac_label,
               ST_Y(r.geom) AS latitude, ST_X(r.geom) AS longitude,
               o.name AS custodian_name
        FROM tree_registry r
        LEFT JOIN organizations o ON o.id = r.custodian_org_id
        WHERE r.tree_code = $1
        """,
        code,
    )
    if tree is None:
        return None
    out = dict(tree)
    events = await db.fetch_all(
        """
        SELECT e.event, e.created_at, e.note, e.transport_document_id,
               COALESCE(NULLIF(trim(concat_ws(' ', u.first_name, u.last_name)), ''),
                        u.display_name, u.email) AS actor,
               ST_Y(e.geom) AS latitude, ST_X(e.geom) AS longitude
        FROM custody_events e
        LEFT JOIN users u ON u.id = e.actor_id
        WHERE e.tree_code = $1
        ORDER BY e.created_at, e.id
        """,
        code,
    )
    doc = await db.fetch_one(
        """
        SELECT d.id, d.reference, d.doc_type, d.status, d.org_id, d.destination_org_id,
               dst.name AS destination_name, d.to_label
        FROM transport_documents d
        LEFT JOIN organizations dst ON dst.id = d.destination_org_id
        WHERE d.tree_codes ? $1 AND d.status IN ('brouillon', 'emis')
        ORDER BY d.id DESC LIMIT 1
        """,
        code,
    )
    is_holder = user.get("role") != "admin" and holds(user, out)
    nxt = next_event(out) if is_holder else None
    out["status_label"] = STATUS_LABELS.get(out["status"], out["status"])
    out["history"] = [dict(e) for e in events]
    out["transport"] = dict(doc) if doc is not None else None
    out["is_holder"] = is_holder
    out["next_event"] = nxt
    can_receive = (
        doc is not None
        and doc["status"] == "emis"
        and user.get("organization_id") is not None
        and user.get("organization_id") == (doc["destination_org_id"] or doc["org_id"])
    )
    out["can_receive"] = bool(can_receive)
    return out
