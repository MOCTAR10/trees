"""Compliance gate: two-tier conformance (Loi 016/01 + RDUE).

Hard blockers make submission impossible (duplicate code, missing measurement,
tree below DME, tree outside the AAC, reserved species). Warnings let the file
through; the Ministry decides at instruction time (missing documents, unpaid
taxes, pending authorizations, CITES without permit).
"""

import json

from app.services import db

HARD_LINE_VIOLATIONS = frozenset(
    {"duplicate_code", "no_measurement", "below_dme", "outside_aac", "reserved_species"}
)
WARNING_LINE_VIOLATIONS = frozenset({"cites_listed"})

_AAC_OPEN_STATUSES = ("autorise", "ouvert")


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
    return {
        "declaration_id": declaration_id,
        "blockers": blockers,
        "warnings": warnings,
        "compliant": not blockers,
    }
