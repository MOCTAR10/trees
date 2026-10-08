"""Diameter-height allometry for Central African moist forests.

Hyperbolic model (FAO/Congo Basin inventory practice):
    H(D) = 1.3 + a * D / (b + D)

Species-specific parameters come from ``species_data.SpeciesProfile``
(literature defaults, refined through the RAG corpus).
"""

from app.core.species_data import DEFAULT_SPECIES, resolve_species


def estimate_height_m(dbh_cm: float, species: str | None = None) -> float:
    """Estimate total tree height (m) from DBH (cm)."""
    if dbh_cm <= 0:
        raise ValueError("dbh_cm must be positive")

    profile = resolve_species(species) or DEFAULT_SPECIES
    a, b = profile.hd_a, profile.hd_b
    height = 1.3 + a * dbh_cm / (b + dbh_cm)
    return float(min(height, profile.max_height_m))


def bole_height_m(dbh_cm: float, species: str | None = None) -> float:
    """Merchantable bole height (ground to first significant branching).

    Standard tropical approximation: 65% of total height, floored at 5 m.
    """
    total = estimate_height_m(dbh_cm, species)
    return float(max(5.0, 0.65 * total))
