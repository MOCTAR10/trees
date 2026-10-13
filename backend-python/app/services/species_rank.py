"""Gabon-aware re-ranking of Pl@ntNet candidates.

Pl@ntNet scores what the photos look like; it does not know where the tree
stands. Two local priors correct that:

- **Species base** — curated Congo Basin timber species, then species whose
  GBIF distribution includes Gabon, then its neighbours (``core.species_data``).
- **GBIF occurrences** near the scan point (live, top candidates only).

``combined = score × (0.5 + 0.5 × prior) × occurrence factor``: a photo match
is never invented, only re-weighted, and an exotic look-alike with no Central
African record falls behind a plausible Gabonese species.
"""

from __future__ import annotations

import asyncio
import logging

from app.core.species_data import _CURATED_SPECIES, resolve_species
from app.services import gbif

logger = logging.getLogger(__name__)

#: Countries sharing Gabon's forest flora (Guineo-Congolian block).
CENTRAL_AFRICA = frozenset({"CM", "CG", "GQ", "CF", "CD", "ST", "AO"})

PRIOR_CURATED = 1.0
PRIOR_GABON = 0.8
PRIOR_REGION = 0.6
PRIOR_KNOWN_ELSEWHERE = 0.2
PRIOR_UNKNOWN = 0.4

OCCURRENCE_BOOST = 1.2
NO_OCCURRENCE_PENALTY = 0.7

#: Candidates checked against GBIF (each is one live request).
GBIF_CHECKS = 3


def prior(name: str | None) -> tuple[float, str]:
    """Local plausibility of a species name, with the reason."""
    profile = resolve_species(name)
    if profile is None:
        return PRIOR_UNKNOWN, "inconnue_base"
    if profile.scientific_name in _CURATED_SPECIES:
        return PRIOR_CURATED, "essence_gabon"
    countries = set(profile.countries or ())
    if "GA" in countries:
        return PRIOR_GABON, "presente_gabon"
    if countries & CENTRAL_AFRICA:
        return PRIOR_REGION, "afrique_centrale"
    if countries:
        return PRIOR_KNOWN_ELSEWHERE, "hors_region"
    return PRIOR_UNKNOWN, "distribution_inconnue"


async def _local_occurrences(name: str, latitude: float, longitude: float) -> int | None:
    try:
        check = await gbif.validate_species_for_location(name, latitude, longitude)
    except Exception as exc:  # GBIF down: no evidence either way
        logger.warning("GBIF occurrence check skipped for %s: %s", name, exc)
        return None
    return check.get("occurrences")


async def rerank(candidates: list[dict], latitude: float, longitude: float) -> list[dict]:
    """Candidates sorted by combined score, each annotated with its evidence."""
    pool = [c for c in candidates if c.get("scientific_name") and c.get("score") is not None]
    pool.sort(key=lambda c: c["score"], reverse=True)
    checked = pool[:GBIF_CHECKS]
    occurrences = await asyncio.gather(
        *(_local_occurrences(c["scientific_name"], latitude, longitude) for c in checked)
    )
    ranked: list[dict] = []
    for i, cand in enumerate(pool):
        p, reason = prior(cand["scientific_name"])
        occ = occurrences[i] if i < len(occurrences) else None
        factor = 1.0 if occ is None else (OCCURRENCE_BOOST if occ > 0 else NO_OCCURRENCE_PENALTY)
        profile = resolve_species(cand["scientific_name"])
        ranked.append(
            {
                "scientific_name": profile.scientific_name if profile else cand["scientific_name"],
                "common_name_fr": (profile.common_name_fr or None) if profile else None,
                "score": round(float(cand["score"]), 4),
                "combined": round(min(1.0, float(cand["score"]) * (0.5 + 0.5 * p) * factor), 4),
                "prior": reason,
                "local_occurrences": occ,
            }
        )
    ranked.sort(key=lambda c: c["combined"], reverse=True)
    return ranked
