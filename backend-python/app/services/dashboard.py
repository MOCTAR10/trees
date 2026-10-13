"""Ministry dashboard aggregations (workflow analysis §7.2 pt 7).

Read-only rollups over the operational tables: harvest volumes by species,
transformation rate, fiscal dues, community development (CCC/FDL), transport,
certifications — plus the registry of titles, UFA and AAC. Volumes reuse the
provisional DBH-based estimator of the regulatory statements.
"""

from __future__ import annotations

from datetime import UTC, datetime

from app.core.log_volume import merchantable_volume_m3
from app.services import db

FELLED_STATUSES = ("abattu", "transporte", "receptionne", "transforme")


def _rows(result) -> list[dict]:
    return [dict(r) for r in (result or [])]


def _as_float(value) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _by_status(rows: list[dict], *extra: str) -> dict:
    """Group ``{status: count}`` plus optional numeric sums."""
    out: dict[str, dict] = {}
    for r in rows:
        status = r.get("status") or "inconnu"
        entry = out.setdefault(status, {"status": status, "count": 0})
        entry["count"] += int(r.get("count") or 0)
        for key in extra:
            entry[key] = round(entry.get(key, 0.0) + _as_float(r.get(key)), 3)
    return out


async def _harvest() -> dict:
    rows = _rows(
        await db.fetch_all(
            "SELECT species_scientific_name, measured_dbh_cm, status FROM tree_registry LIMIT 5000"
        )
    )
    felled = [r for r in rows if r.get("status") in FELLED_STATUSES]
    by_species: dict[str, dict] = {}
    volume_total = 0.0
    for r in felled:
        species = r.get("species_scientific_name") or "Inconnue"
        volume = merchantable_volume_m3(r.get("measured_dbh_cm"), r.get("species_scientific_name"))
        volume_total += volume
        entry = by_species.setdefault(species, {"species": species, "stems": 0, "volume_m3": 0.0})
        entry["stems"] += 1
        entry["volume_m3"] = round(entry["volume_m3"] + volume, 3)

    by_status = dict.fromkeys(FELLED_STATUSES, 0)
    for r in rows:
        status = r.get("status")
        if status in by_status:
            by_status[status] += 1
    transformed = by_status.get("transforme", 0)
    return {
        "registry_stems": len(rows),
        "stems_felled": len(felled),
        "estimated_volume_m3": round(volume_total, 3),
        "by_species": sorted(by_species.values(), key=lambda e: e["volume_m3"], reverse=True),
        "by_status": by_status,
        "transformation_rate": round(transformed / len(felled), 4) if felled else 0.0,
    }


async def overview() -> dict:
    """Full dashboard payload (single read, admin scope)."""
    harvest = await _harvest()

    titles = _by_status(
        _rows(
            await db.fetch_all(
                "SELECT status, count(*) AS count, coalesce(sum(surface_ha), 0) AS surface_ha"
                " FROM forest_titles GROUP BY status"
            )
        ),
        "surface_ha",
    )
    aacs = _by_status(
        _rows(
            await db.fetch_all(
                "SELECT status, count(*) AS count,"
                " coalesce(sum(possibility_m3), 0) AS possibility_m3"
                " FROM annual_cut_blocks GROUP BY status"
            )
        ),
        "possibility_m3",
    )
    documents = _by_status(
        _rows(
            await db.fetch_all(
                "SELECT status, count(*) AS count FROM legal_documents GROUP BY status"
            )
        )
    )
    expiring = await db.fetch_one(
        "SELECT"
        " count(*) FILTER (WHERE status = 'valide' AND expires_at < CURRENT_DATE) AS expired,"
        " count(*) FILTER (WHERE status = 'valide' AND expires_at >= CURRENT_DATE"
        "   AND expires_at < CURRENT_DATE + INTERVAL '90 days') AS expiring_soon"
        " FROM legal_documents"
    )
    taxes = await db.fetch_one(
        "SELECT count(*) AS dues_total,"
        " count(*) FILTER (WHERE receipt_id IS NULL AND due_at < CURRENT_DATE) AS overdue,"
        " count(*) FILTER (WHERE receipt_id IS NOT NULL) AS settled,"
        " coalesce(sum(amount_fcfa) FILTER (WHERE receipt_id IS NULL AND due_at < CURRENT_DATE), 0)"
        "   AS overdue_amount_fcfa"
        " FROM tax_dues"
    )
    receipts = await db.fetch_one(
        "SELECT count(*) AS receipts, coalesce(sum(amount_fcfa), 0) AS amount_fcfa"
        " FROM tax_receipts WHERE status = 'paye'"
    )
    community = await db.fetch_one(
        "SELECT count(*) AS agreements,"
        " count(*) FILTER (WHERE status = 'actif') AS active,"
        " coalesce(sum(contribution_fcfa), 0) AS contribution_fcfa,"
        " coalesce(sum(annual_volume_m3), 0) AS annual_volume_m3,"
        " coalesce(avg(fdl_rate_fcfa_m3), 0) AS avg_fdl_rate"
        " FROM community_agreements"
    )
    transport = await db.fetch_one(
        "SELECT count(*) AS documents, coalesce(sum(volume_m3), 0) AS volume_m3"
        " FROM transport_documents"
    )
    certs = _by_status(
        _rows(
            await db.fetch_all(
                "SELECT status, count(*) AS count, coalesce(sum(surface_ha), 0) AS surface_ha"
                " FROM certifications GROUP BY status"
            )
        ),
        "surface_ha",
    )
    cert_schemes = _rows(
        await db.fetch_all(
            "SELECT scheme, count(*) AS count, coalesce(sum(surface_ha), 0) AS surface_ha"
            " FROM certifications GROUP BY scheme"
        )
    )

    return {
        "generated_at": datetime.now(UTC).isoformat(),
        "harvest": harvest,
        "titles": {
            "total": sum(e["count"] for e in titles.values()),
            "by_status": titles,
            "surface_ha": round(sum(e.get("surface_ha", 0) for e in titles.values()), 3),
        },
        "aac": {
            "total": sum(e["count"] for e in aacs.values()),
            "by_status": aacs,
            "possibility_m3": round(sum(e.get("possibility_m3", 0) for e in aacs.values()), 3),
        },
        "documents": {
            "total": sum(e["count"] for e in documents.values()),
            "by_status": documents,
            "expired": int((expiring or {}).get("expired") or 0),
            "expiring_soon": int((expiring or {}).get("expiring_soon") or 0),
        },
        "taxes": {
            "dues_total": int((taxes or {}).get("dues_total") or 0),
            "overdue": int((taxes or {}).get("overdue") or 0),
            "settled": int((taxes or {}).get("settled") or 0),
            "overdue_amount_fcfa": _as_float((taxes or {}).get("overdue_amount_fcfa")),
            "receipts": int((receipts or {}).get("receipts") or 0),
            "receipts_amount_fcfa": _as_float((receipts or {}).get("amount_fcfa")),
        },
        "community": {
            "agreements": int((community or {}).get("agreements") or 0),
            "active": int((community or {}).get("active") or 0),
            "contribution_fcfa": _as_float((community or {}).get("contribution_fcfa")),
            "annual_volume_m3": _as_float((community or {}).get("annual_volume_m3")),
            "avg_fdl_rate": _as_float((community or {}).get("avg_fdl_rate")),
        },
        "transport": {
            "documents": int((transport or {}).get("documents") or 0),
            "volume_m3": _as_float((transport or {}).get("volume_m3")),
        },
        "certifications": {
            "total": sum(e["count"] for e in certs.values()),
            "by_status": certs,
            "by_scheme": [
                {
                    "scheme": r.get("scheme"),
                    "count": int(r.get("count") or 0),
                    "surface_ha": _as_float(r.get("surface_ha")),
                }
                for r in sorted(cert_schemes, key=lambda r: r.get("scheme") or "")
            ],
        },
    }
