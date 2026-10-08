"""Species reference data: wood density, growth constants, commercial names.

Wood densities (rho, g/cm3) — Central African timber species.
Growth constants for Chapman-Richards D(t) = A * (1 - e^(-k t))^p fitted
from published increment data (FORAFRI/Engone Obiang for Okoume; literature
ranges for the other species — refined via RAG ingestion pipeline).
"""

from dataclasses import dataclass, field


@dataclass(frozen=True)
class SpeciesProfile:
    scientific_name: str
    common_name_fr: str
    wood_density_g_cm3: float
    # Chapman-Richards asymptotic DBH (cm), rate, shape
    cr_asymptote_a_cm: float
    cr_rate_k: float
    cr_shape_p: float
    # Height-diameter hyperbolic parameters: H = 1.3 + a * D / (b + D)
    hd_a: float = 40.0
    hd_b: float = 25.0
    iucn_status: str = "LC"
    max_height_m: float = 40.0
    aliases: tuple = field(default_factory=tuple)


SPECIES_DB: dict[str, SpeciesProfile] = {
    "Aucoumea klaineana": SpeciesProfile(
        scientific_name="Aucoumea klaineana",
        common_name_fr="Okoumé",
        wood_density_g_cm3=0.44,
        cr_asymptote_a_cm=80.0,
        cr_rate_k=0.035,
        cr_shape_p=1.20,
        hd_a=40.0,
        hd_b=25.0,
        iucn_status="VU",
        max_height_m=40.0,
        aliases=("okoume", "okoumé", "gaboon mahogany"),
    ),
    "Lophira alata": SpeciesProfile(
        scientific_name="Lophira alata",
        common_name_fr="Azobé",
        wood_density_g_cm3=1.06,
        cr_asymptote_a_cm=140.0,
        cr_rate_k=0.012,
        cr_shape_p=1.50,
        iucn_status="VU",
        max_height_m=50.0,
        aliases=("azobe", "azobé", "belli"),
    ),
    "Pterocarpus soyauxii": SpeciesProfile(
        scientific_name="Pterocarpus soyauxii",
        common_name_fr="Padouk",
        wood_density_g_cm3=0.75,
        cr_asymptote_a_cm=100.0,
        cr_rate_k=0.020,
        cr_shape_p=1.30,
        iucn_status="LC",
        max_height_m=40.0,
        aliases=("padouk", "padauk", "african padauk"),
    ),
    "Dacryodes glaucescens": SpeciesProfile(
        scientific_name="Dacryodes glaucescens",
        common_name_fr="Ozigo",
        wood_density_g_cm3=0.47,
        cr_asymptote_a_cm=90.0,
        cr_rate_k=0.025,
        cr_shape_p=1.25,
        iucn_status="LC",
        max_height_m=35.0,
        aliases=("ozigo", "cinnamomum glaucescens"),
    ),
    "Baillonella toxisperma": SpeciesProfile(
        scientific_name="Baillonella toxisperma",
        common_name_fr="Moabi",
        wood_density_g_cm3=0.83,
        cr_asymptote_a_cm=120.0,
        cr_rate_k=0.015,
        cr_shape_p=1.40,
        iucn_status="EN",
        max_height_m=45.0,
        aliases=("moabi", "djita", "sipo"),
    ),
}

DEFAULT_SPECIES = SPECIES_DB["Aucoumea klaineana"]
DEFAULT_WOOD_DENSITY = 0.62  # mean Central African moist forest


def resolve_species(name: str | None) -> SpeciesProfile | None:
    if not name:
        return None
    key = name.strip().lower()
    for profile in SPECIES_DB.values():
        if key == profile.scientific_name.lower():
            return profile
        if any(key in alias or alias in key for alias in profile.aliases):
            return profile
    return None


def wood_density_for(name: str | None) -> float:
    profile = resolve_species(name)
    return profile.wood_density_g_cm3 if profile else DEFAULT_WOOD_DENSITY
