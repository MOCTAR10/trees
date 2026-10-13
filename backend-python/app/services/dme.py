"""Per-UFA minimum exploitable diameters (DME/UFA, Loi 016/01 art. 124).

The arrêté fixes a DME per species **per UFA**. Until such an entry exists for
a UFA the app falls back to the provisional literature defaults of
``app.core.dme`` — always reporting the origin so the audit trail is explicit:

* ``ufa``         — an official value entered for this UFA (``ufa_dme``)
* ``provisional`` — the interim default pending the arrêté
* ``unknown``     — the species is not in the cohort, the check is skipped
"""

from __future__ import annotations

from app.core.dme import DME_SOURCE_PROVISIONAL, PROVISIONAL_DME_CM
from app.core.species_data import resolve_species
from app.services import db

UFA = "ufa"
PROVISIONAL = "provisional"
UNKNOWN = "unknown"


def canonical(name: str | None) -> str | None:
    """Resolve a trade/common name to its scientific name, or None."""
    if not name:
        return None
    profile = resolve_species(name)
    return profile.scientific_name if profile is not None else None


async def ufa_of_aac(aac_id: int | None) -> int | None:
    """Owning UFA of an annual cut block, or None when unknown/absent."""
    if aac_id is None:
        return None
    row = await db.fetch_one(
        "SELECT ufa_id FROM annual_cut_blocks WHERE id = $1",
        aac_id,
    )
    return row["ufa_id"] if row is not None else None


async def overrides(ufa_id: int | None) -> dict[str, dict]:
    """Official entries registered for a UFA, keyed by scientific name."""
    if ufa_id is None:
        return {}
    rows = await db.fetch_all(
        "SELECT species_scientific_name, dme_cm, source FROM ufa_dme WHERE ufa_id = $1",
        ufa_id,
    )
    return {
        r["species_scientific_name"]: {"dme_cm": float(r["dme_cm"]), "source": r["source"]}
        for r in rows
    }


async def map_for_ufa(ufa_id: int | None) -> dict[str, dict]:
    """Overrides for the declaration gate: ``{scientific_name: {dme_cm, source}}``."""
    return await overrides(ufa_id)


async def effective_for_ufa(ufa_id: int) -> list[dict]:
    """Full matrix: UFA-specific values merged over the provisional defaults."""
    registered = await overrides(ufa_id)
    entries = [
        {
            "species_scientific_name": species,
            "dme_cm": value["dme_cm"],
            "source": value["source"],
            "origin": UFA,
        }
        for species, value in registered.items()
    ]
    for species, cm in PROVISIONAL_DME_CM.items():
        if species in registered:
            continue
        entries.append(
            {
                "species_scientific_name": species,
                "dme_cm": cm,
                "source": DME_SOURCE_PROVISIONAL,
                "origin": PROVISIONAL,
            }
        )
    entries.sort(key=lambda e: e["species_scientific_name"])
    return entries


async def dme_for_species(
    ufa_id: int | None, name: str | None
) -> tuple[float | None, str | None, str]:
    """(dme_cm, source, origin) for one species in a UFA context."""
    scientific = canonical(name)
    if scientific is None:
        return None, None, UNKNOWN
    if ufa_id is not None:
        row = await db.fetch_one(
            "SELECT dme_cm, source FROM ufa_dme WHERE ufa_id = $1 AND species_scientific_name = $2",
            ufa_id,
            scientific,
        )
        if row is not None:
            return float(row["dme_cm"]), row["source"], UFA
    cm = PROVISIONAL_DME_CM.get(scientific)
    if cm is None:
        return None, None, UNKNOWN
    return cm, DME_SOURCE_PROVISIONAL, PROVISIONAL


async def upsert(ufa_id: int, entries: list[dict], user_id: int | None) -> None:
    """Insert or update official DME entries for a UFA (Ministry only)."""
    for entry in entries:
        scientific = (
            canonical(entry.get("species_scientific_name"))
            or str(entry["species_scientific_name"]).strip()
        )
        await db.execute(
            "INSERT INTO ufa_dme"
            " (ufa_id, species_scientific_name, dme_cm, source, decided_by, decided_at)"
            " VALUES ($1, $2, $3, $4, $5, now())"
            " ON CONFLICT (ufa_id, species_scientific_name) DO UPDATE SET"
            "   dme_cm = EXCLUDED.dme_cm, source = EXCLUDED.source,"
            "   decided_by = EXCLUDED.decided_by, decided_at = now()",
            ufa_id,
            scientific,
            float(entry["dme_cm"]),
            entry.get("source"),
            user_id,
        )


async def remove_override(ufa_id: int, name: str) -> None:
    """Drop a UFA-specific entry so the provisional default applies again."""
    scientific = canonical(name) or name
    await db.execute(
        "DELETE FROM ufa_dme WHERE ufa_id = $1 AND species_scientific_name = $2",
        ufa_id,
        scientific,
    )
