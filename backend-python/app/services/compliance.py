"""Compliance gate: two-tier conformance (Loi 016/01 + RDUE).

Hard blockers make submission impossible (no authorization to exploit the AAC
— art. 14 —, duplicate code, missing measurement, tree below DME, tree outside
the AAC, reserved species). Warnings let the file through; the Ministry decides
at instruction time (missing documents, unpaid taxes, CITES without permit).
"""

import json
from datetime import date

from app.services import db

HARD_LINE_VIOLATIONS = frozenset(
    {"duplicate_code", "no_measurement", "below_dme", "outside_aac", "reserved_species"}
)
#: ``in_protected_area`` / ``outside_concession`` come from the GFW layers
#: imported for Gabon (parks, logging concessions): warnings — the Ministry
#: decides (frozen decision 6); whether felling inside a park must become a
#: hard block is an open point for the métier.
WARNING_LINE_VIOLATIONS = frozenset({"cites_listed", "in_protected_area", "outside_concession"})

_AAC_OPEN_STATUSES = ("autorise", "ouvert")

#: Declaration-level hard blockers (art. 14: no felling before an authorization
#: is delivered for the AAC and the start of operations notified).
AUTHORIZATION_BLOCKERS = frozenset(
    {"no_aac", "aac_not_held", "no_authorization", "authorization_pending", "startup_not_notified"}
)


async def authorization_gate(aac_id: int | None, org_id: int | None) -> str | None:
    """Art. 14 blocker code for a felling declaration, or None when allowed."""
    if aac_id is None:
        return "no_aac"
    if org_id is not None:
        holder = await db.fetch_one(
            """
            SELECT t.holder_org_id
            FROM annual_cut_blocks b
            JOIN management_units u ON u.id = b.ufa_id
            JOIN forest_titles t ON t.id = u.title_id
            WHERE b.id = $1
            """,
            aac_id,
        )
        if holder is None or holder["holder_org_id"] != org_id:
            return "aac_not_held"
    rows = await db.fetch_all(
        "SELECT status, valid_to, startup_notified_at FROM aac_authorizations WHERE aac_id = $1",
        aac_id,
    )
    today = date.today()
    delivered = [
        r
        for r in rows
        if r["status"] == "delivre" and (r["valid_to"] is None or r["valid_to"] >= today)
    ]
    if not delivered:
        return (
            "authorization_pending"
            if any(r["status"] == "soumis" for r in rows)
            else "no_authorization"
        )
    if not any(r["startup_notified_at"] for r in delivered):
        return "startup_not_notified"
    return None


def line_impact(violations: list[str] | str | None) -> tuple[list[str], list[str]]:
    """Split one stem's violations into (hard blockers, warnings)."""
    raw = violations
    if isinstance(raw, str):
        raw = json.loads(raw)
    raw = raw or []
    hard = [v for v in raw if v in HARD_LINE_VIOLATIONS]
    warned = [v for v in raw if v in WARNING_LINE_VIOLATIONS]
    return hard, warned


async def assess_org_warnings(org_id: int | None) -> list[dict]:
    """Documents demanded by the org preset + open tax receipts."""
    if org_id is None:
        return []
    profile = await db.fetch_one(
        """
        SELECT p.code, p.doc_required
        FROM organizations o
        JOIN org_profiles p ON p.code = o.profile_code
        WHERE o.id = $1
        """,
        org_id,
    )
    warnings: list[dict] = []
    required = profile["doc_required"] if profile is not None and profile["doc_required"] else []
    if required:
        held = {
            row["doc_type"]: row["status"]
            for row in await db.fetch_all(
                "SELECT doc_type, status FROM legal_documents"
                " WHERE scope_type = 'company' AND scope_id = $1",
                org_id,
            )
        }
        for code in required:
            if held.get(code) != "valide":
                warnings.append(
                    {"kind": "document", "doc_type": code, "status": held.get(code, "manquant")}
                )
    overdue = await db.fetch_all(
        "SELECT tax_type, period_year FROM tax_receipts"
        " WHERE org_id = $1 AND status IN ('du', 'en_retard')",
        org_id,
    )
    warnings.extend(
        {"kind": "tax", "tax_type": r["tax_type"], "period_year": r["period_year"]} for r in overdue
    )
    overdue_dues = await db.fetch_all(
        "SELECT id, tax_type, period_year, due_at, amount_fcfa FROM tax_dues"
        " WHERE org_id = $1 AND receipt_id IS NULL"
        " AND due_at IS NOT NULL AND due_at < CURRENT_DATE",
        org_id,
    )
    warnings.extend(
        {
            "kind": "tax",
            "tax_type": r["tax_type"],
            "period_year": r["period_year"],
            "status": "en_retard",
            "due_id": r["id"],
            "due_at": r["due_at"].isoformat() if r.get("due_at") else None,
            "amount_fcfa": r["amount_fcfa"],
        }
        for r in overdue_dues
    )
    return warnings


async def assess_allocation_warnings(title_id: int | None, aac_id: int | None) -> list[dict]:
    warnings: list[dict] = []
    if title_id is not None:
        title = await db.fetch_one("SELECT status FROM forest_titles WHERE id = $1", title_id)
        if title is None or title["status"] != "actif":
            warnings.append(
                {
                    "kind": "title",
                    "id": title_id,
                    "status": None if title is None else title["status"],
                }
            )
    if aac_id is not None:
        aac = await db.fetch_one("SELECT status FROM annual_cut_blocks WHERE id = $1", aac_id)
        if aac is None or aac["status"] not in _AAC_OPEN_STATUSES:
            warnings.append(
                {"kind": "aac", "id": aac_id, "status": None if aac is None else aac["status"]}
            )
    return warnings


async def lines_outside_aac(aac_id: int | None, points: list[tuple[str, float, float]]) -> set[str]:
    """Tree codes whose (lon, lat) fall outside the declared AAC polygon.

    ``points`` are ``(tree_code, longitude, latitude)`` triplets. Returns an
    empty set when the AAC id is absent, no point has coordinates, the AAC is
    unknown, or it carries no geometry — a missing boundary must never be
    mistaken for a violation.
    """
    if aac_id is None or not points:
        return set()
    codes = [p[0] for p in points]
    lons = [p[1] for p in points]
    lats = [p[2] for p in points]
    rows = await db.fetch_all(
        """
        SELECT pts.tree_code
        FROM annual_cut_blocks a,
             unnest($2::text[], $3::float8[], $4::float8[])
                 AS pts(tree_code, lon, lat)
        WHERE a.id = $1
          AND a.geom IS NOT NULL
          AND NOT ST_Covers(a.geom, ST_SetSRID(ST_MakePoint(pts.lon, pts.lat), 4326))
        """,
        aac_id,
        codes,
        lons,
        lats,
    )
    return {r["tree_code"] for r in rows}


async def lines_spatial_context(points: list[tuple[str, float, float]]) -> dict[str, dict]:
    """Protected-area / concession context of each declared stem.

    ``points`` are ``(tree_code, longitude, latitude)``. A stem is
    ``outside_concession`` only when concession layers are loaded and the point
    lies in no logging concession, no forest title and no annual cut block —
    a missing layer is never mistaken for a violation.
    """
    if not points:
        return {}
    loaded = await db.fetch_one(
        "SELECT count(*) AS n FROM gfw_features WHERE layer = 'logging_concessions'"
    )
    concessions_loaded = bool(loaded and loaded["n"])
    rows = await db.fetch_all(
        """
        SELECT pts.tree_code,
               (SELECT g.name FROM gfw_features g
                 WHERE g.layer = 'protected_areas' AND ST_Covers(g.geom, pt.p)
                 ORDER BY ST_Area(g.geom) LIMIT 1) AS protected_area,
               EXISTS (SELECT 1 FROM gfw_features g
                 WHERE g.layer = 'logging_concessions' AND ST_Covers(g.geom, pt.p)) AS in_concession,
               EXISTS (SELECT 1 FROM forest_titles ft
                 WHERE ft.geom IS NOT NULL AND ST_Covers(ft.geom, pt.p)) AS in_title,
               EXISTS (SELECT 1 FROM annual_cut_blocks a
                 WHERE a.geom IS NOT NULL AND ST_Covers(a.geom, pt.p)) AS in_aac
        FROM unnest($1::text[], $2::float8[], $3::float8[]) AS pts(tree_code, lon, lat),
             LATERAL (SELECT ST_SetSRID(ST_MakePoint(pts.lon, pts.lat), 4326) AS p) AS pt
        """,
        [p[0] for p in points],
        [p[1] for p in points],
        [p[2] for p in points],
    )
    out: dict[str, dict] = {}
    for r in rows:
        allocated = r["in_concession"] or r["in_title"] or r["in_aac"]
        out[r["tree_code"]] = {
            "protected_area": r["protected_area"],
            "outside_concession": concessions_loaded and not allocated,
        }
    return out


async def assess_traceability_warnings(
    org_id: int | None, aac_id: int | None, lines: list
) -> list[dict]:
    """CITES stems without a valid export permit; felled stems missing from the DF10."""
    warnings: list[dict] = []
    cites = [ln["tree_code"] for ln in lines if "cites_listed" in (_violations(ln["violations"]))]
    if cites and org_id is not None:
        permit = await db.fetch_one(
            "SELECT id FROM legal_documents WHERE scope_id = $1 AND doc_type = 'permis_cites_export'"
            " AND status = 'valide' AND (expires_at IS NULL OR expires_at >= CURRENT_DATE)",
            org_id,
        )
        if permit is None:
            warnings.extend({"kind": "cites_without_permit", "tree_code": code} for code in cites)
    if aac_id is not None:
        missing = await db.fetch_one(
            "SELECT count(*) AS n FROM tree_registry WHERE aac_id = $1"
            " AND status IN ('abattu', 'transporte', 'receptionne', 'transforme')"
            " AND (df10_entry_no IS NULL OR df10_entry_no = '')",
            aac_id,
        )
        if missing and missing.get("n"):
            warnings.append(
                {"kind": "logbook_not_kept", "status": f"{missing['n']} tige(s) hors DF10"}
            )
    return warnings


def _violations(raw) -> list[str]:
    if isinstance(raw, str):
        raw = json.loads(raw)
    return list(raw or [])


async def evaluate(declaration_id: int) -> dict | None:
    """Full two-tier assessment of a felling declaration. None when missing."""
    decl = await db.fetch_one("SELECT * FROM felling_declarations WHERE id = $1", declaration_id)
    if decl is None:
        return None
    org_row = await db.fetch_one(
        "SELECT organization_id FROM users WHERE id = $1", decl["company_id"]
    )
    org_id = org_row["organization_id"] if org_row is not None else None

    lines = await db.fetch_all(
        "SELECT tree_code, violations FROM declaration_lines WHERE declaration_id = $1",
        declaration_id,
    )
    blockers: list[dict] = []
    warnings: list[dict] = []
    for line in lines:
        hard, warned = line_impact(line["violations"])
        blockers.extend({"tree_code": line["tree_code"], "code": code} for code in hard)
        warnings.extend({"tree_code": line["tree_code"], "code": code} for code in warned)
    warnings.extend(await assess_org_warnings(org_id))
    warnings.extend(await assess_allocation_warnings(decl.get("title_id"), decl.get("aac_id")))
    warnings.extend(await assess_traceability_warnings(org_id, decl.get("aac_id"), lines))
    return {
        "declaration_id": declaration_id,
        "blockers": blockers,
        "warnings": warnings,
        "compliant": not blockers,
    }
