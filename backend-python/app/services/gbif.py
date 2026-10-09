"""GBIF open APIs — species validation & geographic ecosystem cross-check.

No API key required (registered account only needed for bulk downloads).
"""

import math

from app.services import http

GBIF_API = "https://api.gbif.org/v1"

# Great-circle degree length used to turn a km radius into a lat/lon box.
_KM_PER_DEGREE = 111.32


async def match_species(scientific_name: str) -> dict | None:
    """Resolve a scientific name to a GBIF taxon key."""
    resp = await http.request(
        "GET",
        f"{GBIF_API}/species/match",
        params={"name": scientific_name, "strict": False},
        timeout=15.0,
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
    d_lat = radius_km / _KM_PER_DEGREE
    cos_lat = max(math.cos(math.radians(latitude)), 0.01)
    d_lon = radius_km / (_KM_PER_DEGREE * cos_lat)
    params = {
        "taxonKey": taxon_key,
        "decimalLatitude": f"{latitude - d_lat},{latitude + d_lat}",
        "decimalLongitude": f"{longitude - d_lon},{longitude + d_lon}",
        "limit": limit,
        "hasCoordinate": "true",
    }
    resp = await http.request("GET", f"{GBIF_API}/occurrence/search", params=params, timeout=20.0)
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
