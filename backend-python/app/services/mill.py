"""Transformation register of a mill: logs in, products out, material yield.

Entries are the transport documents the organisation received (derived at read
time); outputs are the lots the mill records, each citing the logs it consumed.
A lot moves its received logs to ``transforme``. A yearly output volume above
``MAX_YIELD`` of the volume received suggests wood of unknown origin — the
threshold is to be validated by the métier.
"""

import json
from datetime import date

from fastapi import HTTPException

from app.services import custody, db

PRODUCT_TYPES = ("sciage", "placage", "contreplaque", "bois_profile", "autre")
PRODUCT_LABELS = {
    "sciage": "Sciages",
    "placage": "Placages",
    "contreplaque": "Contreplaqués",
    "bois_profile": "Bois profilés",
    "autre": "Autre produit",
}
#: Output / input volume above which the register is flagged (à valider par le métier).
MAX_YIELD = 0.8
_USABLE = ("receptionne", "transforme")


def _codes(value) -> list[str]:
    if isinstance(value, str):
        value = json.loads(value)
    return list(value or [])


async def record_output(body: dict, user: dict, org_id: int) -> dict:
    codes = list(dict.fromkeys(c.strip() for c in body.get("tree_codes") or [] if c.strip()))
    if not codes:
        raise HTTPException(status_code=422, detail="Citez au moins une grume transformée")
    rows = await db.fetch_all(
        "SELECT tree_code, status, custodian_org_id, company_id FROM tree_registry"
        " WHERE tree_code = ANY($1::text[])",
        codes,
    )
    trees = {r["tree_code"]: dict(r) for r in rows}
    unknown = [c for c in codes if c not in trees]
    if unknown:
        raise HTTPException(
            status_code=404, detail=f"Grume inconnue au registre : {', '.join(unknown)}"
        )
    actor = await custody.acting_user(user)
    foreign = [c for c in codes if not custody.holds(actor, trees[c])]
    if foreign:
        raise HTTPException(
            status_code=403,
            detail=f"Grume détenue par une autre organisation : {', '.join(foreign)}",
        )
    for code in codes:
        if trees[code]["status"] not in _USABLE:
            reason = custody.refusal("transforme", trees[code]["status"])
            raise HTTPException(status_code=409, detail=f"{code} — {reason}")
    lot = (body.get("lot_reference") or "").strip() or None
    row = await db.fetch_one(
        """
        INSERT INTO mill_outputs
            (org_id, produced_on, product_type, species_scientific_name, volume_m3, tree_codes,
             lot_reference, destination, notes, recorded_by)
        VALUES ($1, COALESCE($2::date, CURRENT_DATE), $3, $4, $5, $6::text[], $7, $8, $9, $10)
        RETURNING id, org_id, produced_on, product_type, species_scientific_name, volume_m3,
                  tree_codes, lot_reference, destination, notes, created_at
        """,
        org_id,
        body.get("produced_on"),
        body["product_type"],
        (body.get("species_scientific_name") or "").strip() or None,
        body["volume_m3"],
        codes,
        lot,
        body.get("destination"),
        (body.get("notes") or "").strip() or None,
        user["id"],
    )
    transformed = [c for c in codes if trees[c]["status"] == "receptionne"]
    for code in transformed:
        await db.execute(
            "INSERT INTO custody_events (tree_code, event, actor_id, note)"
            " VALUES ($1, 'transforme', $2, $3)",
            code,
            user["id"],
            f"Lot {lot or row['id']} · {PRODUCT_LABELS[body['product_type']]}",
        )
        await db.execute(
            "UPDATE tree_registry SET status = 'transforme', updated_at = now() WHERE tree_code = $1",
            code,
        )
    return {**dict(row), "transformed": transformed}


def _yield(input_m3: float, output_m3: float) -> dict:
    ratio = output_m3 / input_m3 if input_m3 > 0 else None
    alert = output_m3 > 0 and (ratio is None or ratio > MAX_YIELD)
    return {
        "input_m3": round(input_m3, 2),
        "output_m3": round(output_m3, 2),
        "yield_pct": round(ratio * 100, 1) if ratio is not None else None,
        "max_yield_pct": round(MAX_YIELD * 100),
        "alert": alert,
    }


async def register(org_id: int, year: int | None = None) -> dict:
    year = year or date.today().year
    inputs = await db.fetch_all(
        """
        SELECT d.id, d.reference, d.received_at, d.volume_m3, d.tree_codes,
               o.name AS from_org
        FROM transport_documents d
        LEFT JOIN organizations o ON o.id = d.org_id
        WHERE d.destination_org_id = $1 AND d.received_at IS NOT NULL
          AND extract(year FROM d.received_at) = $2
        ORDER BY d.received_at DESC
        """,
        org_id,
        year,
    )
    outputs = await db.fetch_all(
        """
        SELECT id, produced_on, product_type, species_scientific_name, volume_m3, tree_codes,
               lot_reference, destination, notes, created_at
        FROM mill_outputs
        WHERE org_id = $1 AND extract(year FROM produced_on) = $2
        ORDER BY produced_on DESC, id DESC
        """,
        org_id,
        year,
    )
    stock = await db.fetch_all(
        "SELECT tree_code, species_scientific_name FROM tree_registry"
        " WHERE custodian_org_id = $1 AND status = 'receptionne' ORDER BY tree_code",
        org_id,
    )
    entries = []
    for r in inputs:
        item = dict(r)
        item["tree_codes"] = _codes(item.get("tree_codes"))
        item["logs"] = len(item["tree_codes"])
        entries.append(item)
    lots = []
    for r in outputs:
        item = dict(r)
        item["product_label"] = PRODUCT_LABELS.get(item["product_type"], item["product_type"])
        item["tree_codes"] = list(item.get("tree_codes") or [])
        lots.append(item)
    totals = _yield(
        sum(float(e.get("volume_m3") or 0) for e in entries),
        sum(float(lot.get("volume_m3") or 0) for lot in lots),
    )
    totals["logs_received"] = sum(e["logs"] for e in entries)
    totals["logs_in_stock"] = len(stock)
    return {
        "org_id": org_id,
        "year": year,
        "inputs": entries,
        "outputs": lots,
        "stock": [dict(s) for s in stock],
        "totals": totals,
    }


async def yield_alerts(year: int | None = None) -> list[dict]:
    """Organisations whose output volume of the year exceeds what they received."""
    year = year or date.today().year
    rows = await db.fetch_all(
        """
        SELECT o.id AS org_id, o.name AS org_name, out.output_m3,
               COALESCE(inp.input_m3, 0) AS input_m3, out.last_at
        FROM (SELECT org_id, sum(volume_m3) AS output_m3, max(produced_on) AS last_at
              FROM mill_outputs WHERE extract(year FROM produced_on) = $1 GROUP BY org_id) out
        JOIN organizations o ON o.id = out.org_id
        LEFT JOIN (SELECT destination_org_id, sum(volume_m3) AS input_m3 FROM transport_documents
                   WHERE received_at IS NOT NULL AND extract(year FROM received_at) = $1
                   GROUP BY destination_org_id) inp ON inp.destination_org_id = out.org_id
        """,
        year,
    )
    out = []
    for r in rows:
        totals = _yield(float(r["input_m3"] or 0), float(r["output_m3"] or 0))
        if totals["alert"]:
            out.append({**dict(r), **totals, "year": year})
    return out
