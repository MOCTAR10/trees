"""GBIF open APIs — species validation & geographic ecosystem cross-check.

No API key required (registered account only needed for bulk downloads).
"""

import httpx

GBIF_API = "https://api.gbif.org/v1"


async def match_species(scientific_name: str) -> dict | None:
    """Resolve a scientific name to a GBIF taxon key."""
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(
            f"{GBIF_API}/species/match",
            params={"name": scientific_name, "strict": False},
        )
        resp.raise_for_status()
    data = resp.json()
    if data.get("matchType") == "NONE" or data.get("usageKey") is None:
        return None
    return {
        "usage_key": data.get("usageKey"),
        "scientific_name": data.get("scientificName"),
        "confidence": data.get("confidence"),
        "status": data.get("status"),
        "rank": data.get("rank"),
        "family": data.get("family"),
        "genus": data.get("genus"),
    }


async def occurrences_near(
    taxon_key: int,
    latitude: float,
    longitude: float,
    radius_km: float = 50.0,
    limit: int = 20,
) -> dict:
    """Count/inspect occurrence records near a coordinate (ecosystem check)."""
    params = {
        "taxonKey": taxon_key,
        "decimalLatitude": f"{latitude - 0.5},{latitude + 0.5}",
        "decimalLongitude": f"{longitude - 0.5},{longitude + 0.5}",
        "limit": limit,
        "hasCoordinate": "true",
    }
    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.get(f"{GBIF_API}/occurrence/search", params=params)
        resp.raise_for_status()
    data = resp.json()
    return {
        "total": data.get("count", 0),
        "records": [
            {
                "country": r.get("country"),
                "locality": r.get("locality"),
                "year": r.get("year"),
                "basis_of_record": r.get("basisOfRecord"),
            }
            for r in data.get("results", [])
        ],
    }


async def validate_species_for_location(
    scientific_name: str,
    latitude: float,
    longitude: float,
    min_occurrences: int = 1,
) -> dict:
    """Cross-reference species identity against the local geographic ecosystem."""
    taxon = await match_species(scientific_name)
    if taxon is None:
        return {"valid": False, "reason": "no_gbif_match", "taxon": None, "occurrences": None}

    occ = await occurrences_near(taxon["usage_key"], latitude, longitude)
    plausible = occ["total"] >= min_occurrences
    return {
        "valid": plausible,
        "reason": "ok" if plausible else "no_local_occurrences",
        "taxon": taxon,
        "occurrences": occ["total"],
    }
