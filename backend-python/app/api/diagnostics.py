"""Scan diagnostics: health/anomaly summary over tree scans."""

from fastapi import APIRouter, Depends

from app.core.deps import get_current_user
from app.services import db

router = APIRouter()

LOW_CONFIDENCE = 0.5
_ANOMALY_STATES = {"anomalie_sombre_possible", "surface_lisse_a_verifier"}
_FLAGGED_LIMIT = 50


def _reasons(row: dict) -> list[str]:
    reasons: list[str] = []
    if row.get("health_status") in _ANOMALY_STATES:
        reasons.append("health")
    if row.get("species_scientific_name") is None:
        reasons.append("unidentified")
    confidence = row.get("species_confidence")
    if confidence is None or confidence < LOW_CONFIDENCE:
        reasons.append("low_confidence")
    if row.get("measured_dbh_cm") is None:
        reasons.append("missing_dbh")
    return reasons


@router.get("")
async def diagnostics(user: dict = Depends(get_current_user)):
    """Aggregate anomaly signals; admins see every scan, others only their own."""
    scope_id = None if user["role"] == "admin" else user["id"]
    rows = await db.fetch_all(
        """
        SELECT id, species_scientific_name, species_confidence, measured_dbh_cm,
               health_status, created_at
        FROM tree_scans
        WHERE ($1::int IS NULL OR user_id = $1)
        ORDER BY created_at DESC
        LIMIT 1000
        """,
        scope_id,
    )

    by_health: dict[str, int] = {}
    counters = {"anomalies": 0, "unidentified": 0, "low_confidence": 0, "missing_dbh": 0}
    flagged: list[dict] = []

    for row in rows:
        record = dict(row)
        state = record.get("health_status") or "inconnu"
        by_health[state] = by_health.get(state, 0) + 1
        reasons = _reasons(record)
        for reason in reasons:
            counters[reason if reason != "health" else "anomalies"] += 1
        if reasons and len(flagged) < _FLAGGED_LIMIT:
            flagged.append({**record, "reasons": reasons})

    return {
        "scope": "all" if scope_id is None else "own",
        "total": len(rows),
        "by_health": by_health,
        "anomalies": counters["anomalies"],
        "unidentified": counters["unidentified"],
        "low_confidence": counters["low_confidence"],
        "missing_dbh": counters["missing_dbh"],
        "flagged": flagged,
    }
