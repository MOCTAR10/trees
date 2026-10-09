"""Residue-channel ↔ cooperative-profile affinity for the circular economy.

Maps a cooperative's ``profile_type`` to the residue channels it can actually
transform, and scores a scan's residue against it. Pure functions — unit-tested
offline.
"""

# Nominal air-dry wood density used to turn a stump volume (m3) into a mass.
STUMP_DENSITY_KG_M3 = 700.0

# Which channels each cooperative profile can valorize.
PROFILE_CHANNELS = {
    "agricultural_biochar": ("canopy_and_branches",),
    "energy_briquettes": ("canopy_and_branches",),
    "bio_chemical_extraction": ("bark_and_organic_liquids", "stump_and_roots"),
    "artisan_furniture": ("stump_and_roots", "canopy_and_branches"),
}


def _mass(row, key) -> float:
    try:
        return float(row.get(key) or 0.0)
    except (TypeError, ValueError):
        return 0.0


def residue_channel_masses(row) -> dict[str, float]:
    """Kilograms of residue per valorization channel."""
    return {
        "canopy_and_branches": _mass(row, "weight_branches_fine_kg")
        + _mass(row, "weight_branches_thick_kg")
        + _mass(row, "weight_foliar_kg"),
        "bark_and_organic_liquids": _mass(row, "weight_bark_kg"),
        "stump_and_roots": _mass(row, "weight_roots_kg")
        + _mass(row, "volume_stump_m3") * STUMP_DENSITY_KG_M3,
    }


def total_residue_mass(row) -> float:
    return round(sum(residue_channel_masses(row).values()), 1)


def profile_relevant_mass(row, profile_type: str | None) -> float:
    """Kilograms of a scan's residue usable by the given cooperative profile."""
    channels = PROFILE_CHANNELS.get(profile_type or "", ())
    masses = residue_channel_masses(row)
    return round(sum(masses.get(channel, 0.0) for channel in channels), 1)


def match_score(row, profile_type: str | None) -> float:
    """Relevant fraction (0..1) of the residue for the given profile."""
    total = total_residue_mass(row)
    if total <= 0:
        return 0.0
    return round(profile_relevant_mass(row, profile_type) / total, 3)
