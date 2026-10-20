"""Cooperative space: member organisations and read-time aggregates (planche 9).

A cooperative groups member organisations (small operators, communities).
Members keep their own titles and obligations: everything here is read-only
and computed at read time from the members' own records.
"""

from datetime import date

from fastapi import HTTPException

from app.core.log_volume import merchantable_volume_m3
from app.services import db
from app.services.compliance import DOC_STATUS_SQL

MEMBER_ORG_TYPES = ("entreprise", "communaute")
LOG_STATUSES = (
    "inventorie",
    "declare",
    "autorise",
    "abattu",
    "transporte",
    "receptionne",
    "transforme",
)
FELLED_STATUSES = frozenset({"abattu", "transporte", "receptionne", "transforme"})
DOC_STATUSES = ("valide", "soumis", "manquant", "expire", "rejete")
TAX_STATUSES = ("du", "en_retard", "paye")

MEMBERS_NOTE = (
    "Chaque membre conserve ses propres titres, autorisations et obligations ;"
    " la coopérative ne les remplace pas."
)
PROFILE_NOTE = "Liste des pièces de la coopérative à valider par le métier."

_MEMBERSHIP_COLS = (
    "m.id, m.cooperative_org_id, m.member_org_id, m.status, m.joined_on, m.left_on,"
    " m.status_reason, m.notes, m.added_via, m.created_at, m.updated_at,"
    " o.name AS member_name, o.org_type AS member_org_type, o.profile_code AS member_profile_code,"
    " p.label AS member_profile_label,"
    " (SELECT array_agg(DISTINCT a.name ORDER BY a.name) FROM forest_titles t"
    "   JOIN v_title_province v ON v.title_id = t.id"
    "   JOIN admin_areas a ON a.code = v.province_code"
    "  WHERE t.holder_org_id = o.id) AS member_provinces"
)

_TITLE_OF_AAC = (
    "(SELECT u.title_id FROM annual_cut_blocks b JOIN management_units u ON u.id = b.ufa_id"
    " WHERE b.id = {aac})"
)


def _empty_aggregate() -> dict:
    return {
        "titles": {"total": 0, "by_type": {}, "by_status": {}},
        "aac": {"total": 0, "by_status": {}},
        "volumes": {
            "declared_m3": 0.0,
            "authorized_m3": 0.0,
            "felled_m3": 0.0,
            "declared_stems": 0,
            "felled_stems": 0,
        },
        "logs": {"total": 0, "by_status": dict.fromkeys(LOG_STATUSES, 0)},
        "documents": {"total": 0, "by_status": dict.fromkeys(DOC_STATUSES, 0)},
        "taxes": {
            "by_status": dict.fromkeys(TAX_STATUSES, 0),
            "amount_fcfa": dict.fromkeys(TAX_STATUSES, 0.0),
        },
    }


def _bump(bucket: dict, key: str, by: int = 1) -> None:
    bucket[key] = bucket.get(key, 0) + by


def build_aggregates(
    org_ids: list[int],
    titles: list[dict],
    aacs: list[dict],
    lines: list[dict],
    logs: list[dict],
    docs: list[dict],
    taxes: list[dict],
) -> dict[int, dict]:
    """Per-organisation aggregate from the raw rows (pure: easy to test)."""
    out = {oid: _empty_aggregate() for oid in org_ids}
    for r in titles:
        agg = out.get(r["org_id"])
        if agg is None:
            continue
        n = int(r["n"])
        agg["titles"]["total"] += n
        _bump(agg["titles"]["by_type"], r["title_type"], n)
        _bump(agg["titles"]["by_status"], r["status"], n)
    for r in aacs:
        agg = out.get(r["org_id"])
        if agg is None:
            continue
        n = int(r["n"])
        agg["aac"]["total"] += n
        _bump(agg["aac"]["by_status"], r["status"], n)
    for r in lines:
        agg = out.get(r["org_id"])
        if agg is None:
            continue
        volume = merchantable_volume_m3(r.get("measured_dbh_cm"), r.get("species_scientific_name"))
        agg["volumes"]["declared_m3"] += volume
        agg["volumes"]["declared_stems"] += 1
        if r["status"] == "autorisee":
            agg["volumes"]["authorized_m3"] += volume
    for r in logs:
        agg = out.get(r["org_id"])
        if agg is None:
            continue
        agg["logs"]["total"] += 1
        _bump(agg["logs"]["by_status"], r["status"])
        if r["status"] in FELLED_STATUSES:
            agg["volumes"]["felled_m3"] += merchantable_volume_m3(
                r.get("measured_dbh_cm"), r.get("species_scientific_name")
            )
            agg["volumes"]["felled_stems"] += 1
    for r in docs:
        agg = out.get(r["org_id"])
        if agg is None:
            continue
        n = int(r["n"])
        agg["documents"]["total"] += n
        _bump(agg["documents"]["by_status"], r["status"], n)
    for r in taxes:
        agg = out.get(r["org_id"])
        if agg is None:
            continue
        _bump(agg["taxes"]["by_status"], r["status"], int(r["n"]))
        agg["taxes"]["amount_fcfa"][r["status"]] = agg["taxes"]["amount_fcfa"].get(
            r["status"], 0.0
        ) + float(r["amount_fcfa"] or 0)
    for agg in out.values():
        for key in ("declared_m3", "authorized_m3", "felled_m3"):
            agg["volumes"][key] = round(agg["volumes"][key], 3)
    return out


def sum_aggregates(aggregates: list[dict]) -> dict:
    """Total of several member aggregates (same shape)."""
    total = _empty_aggregate()

    def add(dst: dict, src: dict) -> None:
        for key, value in src.items():
            if isinstance(value, dict):
                add(dst.setdefault(key, {}), value)
            else:
                dst[key] = dst.get(key, 0) + value

    for agg in aggregates:
        add(total, agg)
    for key in ("declared_m3", "authorized_m3", "felled_m3"):
        total["volumes"][key] = round(total["volumes"][key], 3)
    return total


async def _fetch_rows(org_ids: list[int]) -> tuple[list, ...]:
    titles = await db.fetch_all(
        "SELECT holder_org_id AS org_id, title_type, status, count(*) AS n"
        " FROM forest_titles WHERE holder_org_id = ANY($1::int[]) GROUP BY 1, 2, 3",
        org_ids,
    )
    aacs = await db.fetch_all(
        "SELECT t.holder_org_id AS org_id, b.status, count(*) AS n"
        " FROM annual_cut_blocks b"
        " JOIN management_units u ON u.id = b.ufa_id"
        " JOIN forest_titles t ON t.id = u.title_id"
        " WHERE t.holder_org_id = ANY($1::int[]) GROUP BY 1, 2",
        org_ids,
    )
    lines = await db.fetch_all(
        "SELECT t.holder_org_id AS org_id, d.status, l.species_scientific_name, l.measured_dbh_cm"
        " FROM declaration_lines l"
        " JOIN felling_declarations d ON d.id = l.declaration_id"
        f" JOIN forest_titles t ON t.id = COALESCE(d.title_id, {_TITLE_OF_AAC.format(aac='d.aac_id')})"
        " WHERE t.holder_org_id = ANY($1::int[]) AND d.status <> 'rejetee'",
        org_ids,
    )
    logs = await db.fetch_all(
        "SELECT t.holder_org_id AS org_id, r.status, r.species_scientific_name, r.measured_dbh_cm"
        " FROM tree_registry r"
        f" JOIN forest_titles t ON t.id = COALESCE(r.title_id, {_TITLE_OF_AAC.format(aac='r.aac_id')})"
        " WHERE t.holder_org_id = ANY($1::int[])",
        org_ids,
    )
    docs = await db.fetch_all(
        f"SELECT scope_id AS org_id, {DOC_STATUS_SQL} AS status, count(*) AS n"
        " FROM legal_documents WHERE scope_type = 'company' AND scope_id = ANY($1::int[])"
        " GROUP BY 1, 2",
        org_ids,
    )
    taxes = await db.fetch_all(
        "SELECT org_id, CASE WHEN receipt_id IS NOT NULL THEN 'paye'"
        " WHEN due_at IS NOT NULL AND due_at < CURRENT_DATE THEN 'en_retard' ELSE 'du' END AS status,"
        " count(*) AS n, coalesce(sum(amount_fcfa), 0) AS amount_fcfa"
        " FROM tax_dues WHERE org_id = ANY($1::int[]) GROUP BY 1, 2",
        org_ids,
    )
    return titles, aacs, lines, logs, docs, taxes


async def aggregates_for(org_ids: list[int]) -> dict[int, dict]:
    if not org_ids:
        return {}
    rows = await _fetch_rows(org_ids)
    return build_aggregates(org_ids, *[[dict(r) for r in part] for part in rows])


async def cooperative_org(org_id: int | None) -> dict:
    """The cooperative organisation behind an id (404 / 409 otherwise)."""
    if org_id is None:
        raise HTTPException(
            status_code=409,
            detail="Ce compte coopérative n'est rattaché à aucune organisation",
        )
    org = await db.fetch_one(
        "SELECT o.id, o.name, o.org_type, o.profile_code, o.is_active, p.label AS profile_label,"
        " p.description AS profile_description"
        " FROM organizations o LEFT JOIN org_profiles p ON p.code = o.profile_code"
        " WHERE o.id = $1",
        org_id,
    )
    if org is None:
        raise HTTPException(status_code=404, detail="Organisation introuvable")
    if org["org_type"] != "cooperative":
        raise HTTPException(status_code=409, detail="Cette organisation n'est pas une coopérative")
    return dict(org)


async def list_members(coop_id: int, include_former: bool = True) -> list[dict]:
    rows = await db.fetch_all(
        f"SELECT {_MEMBERSHIP_COLS} FROM cooperative_memberships m"
        " JOIN organizations o ON o.id = m.member_org_id"
        " LEFT JOIN org_profiles p ON p.code = o.profile_code"
        " WHERE m.cooperative_org_id = $1 AND ($2 OR m.status <> 'sortie')"
        " ORDER BY (m.status = 'sortie'), (m.status = 'suspendue'), o.name, m.joined_on DESC",
        coop_id,
        include_former,
    )
    return [dict(r) for r in rows]


async def members_with_aggregates(coop_id: int) -> dict:
    """Members (current and former) plus the aggregate of each active member and the total."""
    members = await list_members(coop_id, include_former=True)
    active_ids = sorted({m["member_org_id"] for m in members if m["status"] == "active"})
    aggregates = await aggregates_for(active_ids)
    for m in members:
        m["aggregate"] = aggregates.get(m["member_org_id"]) if m["status"] == "active" else None
    counts = {
        s: sum(1 for m in members if m["status"] == s) for s in ("active", "suspendue", "sortie")
    }
    return {
        "members": members,
        "counts": counts,
        "totals": sum_aggregates([aggregates[i] for i in active_ids]),
        "members_note": MEMBERS_NOTE,
    }


async def candidates(coop_id: int, q: str | None = None) -> list[dict]:
    """Organisations that may join: name, type and provinces only."""
    pattern = f"%{(q or '').strip()}%"
    rows = await db.fetch_all(
        "SELECT o.id, o.name, o.org_type,"
        " (SELECT array_agg(DISTINCT a.name ORDER BY a.name) FROM forest_titles t"
        "   JOIN v_title_province v ON v.title_id = t.id"
        "   JOIN admin_areas a ON a.code = v.province_code"
        "  WHERE t.holder_org_id = o.id) AS provinces"
        " FROM organizations o"
        " WHERE o.is_active AND o.org_type = ANY($2::text[]) AND o.id <> $1"
        "   AND (o.name ILIKE $3 OR coalesce(o.registration_no, '') ILIKE $3)"
        "   AND NOT EXISTS (SELECT 1 FROM cooperative_memberships m WHERE m.cooperative_org_id = $1"
        "                   AND m.member_org_id = o.id AND m.status <> 'sortie')"
        " ORDER BY o.name LIMIT 25",
        coop_id,
        list(MEMBER_ORG_TYPES),
        pattern,
    )
    return [dict(r) for r in rows]


async def _membership(coop_id: int, membership_id: int) -> dict:
    row = await db.fetch_one(
        f"SELECT {_MEMBERSHIP_COLS} FROM cooperative_memberships m"
        " JOIN organizations o ON o.id = m.member_org_id"
        " LEFT JOIN org_profiles p ON p.code = o.profile_code"
        " WHERE m.id = $1 AND m.cooperative_org_id = $2",
        membership_id,
        coop_id,
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Membre introuvable dans cette coopérative")
    return dict(row)


async def add_member(
    coop_id: int,
    member_org_id: int,
    user_id: int,
    via: str,
    joined_on: date | None = None,
    notes: str | None = None,
) -> dict:
    await cooperative_org(coop_id)
    if member_org_id == coop_id:
        raise HTTPException(
            status_code=409, detail="Une coopérative ne peut pas être son propre membre"
        )
    member = await db.fetch_one(
        "SELECT id, org_type, is_active FROM organizations WHERE id = $1", member_org_id
    )
    if member is None:
        raise HTTPException(status_code=404, detail="Organisation membre introuvable")
    if member["org_type"] not in MEMBER_ORG_TYPES:
        raise HTTPException(
            status_code=409,
            detail="Seules une entreprise ou une communauté peuvent être membres d'une coopérative",
        )
    if not member["is_active"]:
        raise HTTPException(status_code=409, detail="Organisation inactive")
    joined = joined_on or date.today()
    if joined > date.today():
        raise HTTPException(status_code=422, detail="La date d'adhésion ne peut pas être future")
    if await db.fetch_one(
        "SELECT id FROM cooperative_memberships WHERE cooperative_org_id = $1"
        " AND member_org_id = $2 AND status <> 'sortie'",
        coop_id,
        member_org_id,
    ):
        raise HTTPException(
            status_code=409, detail="Cette organisation est déjà membre de la coopérative"
        )
    row = await db.fetch_one(
        "INSERT INTO cooperative_memberships"
        " (cooperative_org_id, member_org_id, joined_on, notes, added_by, added_via)"
        " VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
        coop_id,
        member_org_id,
        joined,
        (notes or "").strip() or None,
        user_id,
        via,
    )
    return await _membership(coop_id, row["id"])


async def update_member(
    coop_id: int,
    membership_id: int,
    status: str,
    reason: str | None = None,
    left_on: date | None = None,
) -> dict:
    current = await _membership(coop_id, membership_id)
    if current["status"] == "sortie":
        raise HTTPException(
            status_code=409,
            detail="Ce membre a quitté la coopérative : la fiche est conservée, ajoutez-le à nouveau",
        )
    reason = (reason or "").strip() or None
    if status in ("suspendue", "sortie") and reason is None:
        raise HTTPException(status_code=422, detail="Motif obligatoire")
    if status == current["status"]:
        raise HTTPException(status_code=409, detail="Le membre a déjà ce statut")
    left = None
    if status == "sortie":
        left = left_on or date.today()
        joined = current["joined_on"]
        if isinstance(joined, str):
            joined = date.fromisoformat(joined[:10])
        if left < joined or left > date.today():
            raise HTTPException(
                status_code=422,
                detail="La date de sortie doit suivre l'adhésion et ne pas être future",
            )
    await db.execute(
        "UPDATE cooperative_memberships SET status = $1, left_on = $2, status_reason = $3,"
        " updated_at = now() WHERE id = $4",
        status,
        left,
        reason,
        membership_id,
    )
    return await _membership(coop_id, membership_id)


async def member_detail(coop_id: int, membership_id: int) -> dict:
    """Read-only view of one member for the cooperative (its records stay its own)."""
    membership = await _membership(coop_id, membership_id)
    org_id = membership["member_org_id"]
    titles = await db.fetch_all(
        "SELECT t.id, t.title_type, t.reference, t.status, t.surface_ha, a.name AS province_name"
        " FROM forest_titles t"
        " LEFT JOIN v_title_province v ON v.title_id = t.id"
        " LEFT JOIN admin_areas a ON a.code = v.province_code"
        " WHERE t.holder_org_id = $1 ORDER BY t.reference",
        org_id,
    )
    aacs = await db.fetch_all(
        "SELECT b.id, b.label, b.status, b.campaign_year, t.reference AS title_ref"
        " FROM annual_cut_blocks b JOIN management_units u ON u.id = b.ufa_id"
        " JOIN forest_titles t ON t.id = u.title_id"
        " WHERE t.holder_org_id = $1 ORDER BY b.label",
        org_id,
    )
    species_rows = await db.fetch_all(
        "SELECT r.status, r.species_scientific_name, r.measured_dbh_cm FROM tree_registry r"
        f" JOIN forest_titles t ON t.id = COALESCE(r.title_id, {_TITLE_OF_AAC.format(aac='r.aac_id')})"
        " WHERE t.holder_org_id = $1",
        org_id,
    )
    by_species: dict[str, dict] = {}
    for r in species_rows:
        if r["status"] not in FELLED_STATUSES:
            continue
        name = r["species_scientific_name"] or "Essence non renseignée"
        entry = by_species.setdefault(name, {"species": name, "stems": 0, "volume_m3": 0.0})
        entry["stems"] += 1
        entry["volume_m3"] = round(
            entry["volume_m3"]
            + merchantable_volume_m3(r["measured_dbh_cm"], r["species_scientific_name"]),
            3,
        )
    aggregate = (await aggregates_for([org_id]))[org_id]
    return {
        "membership": membership,
        "aggregate": aggregate,
        "titles": [dict(t) for t in titles],
        "aacs": [dict(a) for a in aacs],
        "felled_by_species": sorted(by_species.values(), key=lambda e: -e["volume_m3"]),
        "members_note": MEMBERS_NOTE,
    }


async def memberships_of(member_org_id: int) -> list[dict]:
    """Cooperatives an organisation belongs to (or belonged to)."""
    rows = await db.fetch_all(
        "SELECT m.id, m.cooperative_org_id, o.name AS cooperative_name, m.status, m.joined_on,"
        " m.left_on FROM cooperative_memberships m JOIN organizations o ON o.id = m.cooperative_org_id"
        " WHERE m.member_org_id = $1 ORDER BY (m.status = 'sortie'), m.joined_on DESC",
        member_org_id,
    )
    return [dict(r) for r in rows]
