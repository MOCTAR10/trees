"""Provisional minimum exploitable diameters (DME, cm) per species.

Loi 016/01 Art. 124 only allows felling stems at or above the DME fixed per
species (DME/UFA). The official arrêté values are pending, so this module
carries conservative literature-based defaults clearly marked provisional:
``dme_for`` always reports its source, and unknown species return None (check
skipped) rather than blocking on an invented number. Swap the matrix when the
arrêté arrives — no calling code changes.
"""

from app.core.species_data import resolve_species

DME_SOURCE_PROVISIONAL = "provisional default — pending arrêté fixant les DME/DME-UFA"

# Indicative Gabon-practice diameters (cm) for the curated timber cohort.
PROVISIONAL_DME_CM: dict[str, float] = {
    "Aucoumea klaineana": 70.0,
    "Lophira alata": 80.0,
    "Pterocarpus soyauxii": 60.0,
    "Dacryodes glaucescens": 70.0,
    "Baillonella toxisperma": 100.0,
    "Entandrophragma cylindricum": 80.0,
    "Entandrophragma utile": 80.0,
    "Milicia excelsa": 80.0,
    "Terminalia superba": 70.0,
    "Cylicodiscus gabunensis": 80.0,
}


def dme_for(name: str | None) -> tuple[float | None, str | None]:
    """Return (dme_cm, source) for a species, or (None, None) when unknown."""
    profile = resolve_species(name)
    if profile is None:
        return None, None
    dme = PROVISIONAL_DME_CM.get(profile.scientific_name)
    if dme is None:
        return None, None
    return dme, DME_SOURCE_PROVISIONAL
