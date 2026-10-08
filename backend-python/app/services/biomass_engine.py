"""Biophysical allometric engine & residue breakdown (Phase 2, Step 2.2).

Breaks a tree's total biomass into circular-economy residue streams using
professional tropical forestry equations:

- Above-ground biomass: Chave et al. strategies (see ``chave_allometry``)
- Height: hyperbolic H-D curves (see ``height_diameter``)
- Branch allocation: 25% of AGB, split fine (<10 cm) / thick (>15 cm)
- Below-ground biomass: tropical root:shoot ratio R in [0.15, 0.22]
  (Phase 2 spec; IPCC 2006/2019 Table 4.4 tropical moist R ~ 0.24 upper)
- Stump: isolated from BGB for artisan/burl use; remaining = fine roots
- Bark: 10-14% of commercial trunk volume (mass via wood density)
- Foliage: <= 5% of AGB (Chave 2014: leaf biomass < 5% of AGB)
- Sawdust: 5 mm chainsaw kerf during field slabbing
"""

from dataclasses import asdict, dataclass

from app.core.chave_allometry import AllometryStrategy, estimate_agb
from app.core.height_diameter import bole_height_m, estimate_height_m
from app.core.species_data import resolve_species, wood_density_for

# Allocation constants (Phase 2 specification ranges -> deterministic defaults)
BRANCH_AGB_FRACTION = 0.25
FINE_BRANCH_FRACTION = 0.60  # of branch mass; <10 cm diameter
ROOT_SHOOT_MIN, ROOT_SHOOT_MAX, ROOT_SHOOT_DEFAULT = 0.15, 0.22, 0.18
STUMP_BGB_FRACTION = 0.35  # of below-ground biomass, isolated as stump volume
BARK_VOLUME_MIN, BARK_VOLUME_MAX, BARK_VOLUME_DEFAULT = 0.10, 0.14, 0.12
FOLIAR_AGB_FRACTION = 0.04
FORM_FACTOR = 0.45  # tropical bole form factor
CHAINSAW_KERF_MM = 5.0
SLAB_THICKNESS_MM = 30.0


@dataclass
class ResidueBreakdown:
    species: str
    dbh_cm: float
    height_m: float
    wood_density_g_cm3: float
    allometry_strategy: str

    total_agb_kg: float
    total_bgb_kg: float
    total_biomass_kg: float

    volume_trunk_m3: float
    volume_branches_m3: float
    weight_branches_total_kg: float
    weight_branches_fine_kg: float  # <10 cm : biochar / briquettes
    weight_branches_thick_kg: float  # >15 cm : mobile sawing
    weight_bark_kg: float
    weight_foliar_kg: float
    volume_stump_m3: float
    weight_stump_kg: float
    weight_roots_kg: float
    volume_sawdust_m3: float
    weight_sawdust_kg: float

    total_waste_biomass_kg: float

    def to_dict(self) -> dict:
        return asdict(self)


def compute_residues(
    dbh_cm: float,
    species: str | None = None,
    height_m: float | None = None,
    e_index: float | None = None,
    strategy: AllometryStrategy = AllometryStrategy.CHAVE_2014_H,
    root_shoot_ratio: float = ROOT_SHOOT_DEFAULT,
    bark_volume_fraction: float = BARK_VOLUME_DEFAULT,
) -> ResidueBreakdown:
    """Full residue quantification from a single DBH measurement."""
    if dbh_cm <= 0:
        raise ValueError("dbh_cm must be positive")
    if not (ROOT_SHOOT_MIN <= root_shoot_ratio <= ROOT_SHOOT_MAX):
        raise ValueError(f"root_shoot_ratio must be in [{ROOT_SHOOT_MIN}, {ROOT_SHOOT_MAX}]")
    if not (BARK_VOLUME_MIN <= bark_volume_fraction <= BARK_VOLUME_MAX):
        raise ValueError(f"bark_volume_fraction must be in [{BARK_VOLUME_MIN}, {BARK_VOLUME_MAX}]")

    rho = wood_density_for(species)
    h = height_m or estimate_height_m(dbh_cm, species)

    agb_kwargs = {}
    if e_index is not None:
        agb_kwargs["e_index"] = e_index
    agb = estimate_agb(dbh_cm, rho, height_m=h, strategy=strategy, **agb_kwargs)

    # --- Commercial trunk volume (bole) ---
    bole_h = bole_height_m(dbh_cm, species)
    trunk_volume = FORM_FACTOR * 3.141592653589793 * (dbh_cm / 200.0) ** 2 * bole_h

    # --- Branches: 25% AGB, fine/thick split ---
    branch_total = agb * BRANCH_AGB_FRACTION
    branch_fine = branch_total * FINE_BRANCH_FRACTION
    branch_thick = branch_total - branch_fine
    branch_volume = branch_total / (rho * 1000.0)  # m3 (rho g/cm3 = t/m3)

    # --- Below-ground ---
    bgb = agb * root_shoot_ratio
    stump_kg = bgb * STUMP_BGB_FRACTION
    roots_kg = bgb - stump_kg
    stump_volume = stump_kg / (rho * 1000.0)

    # --- Bark: fraction of commercial trunk volume ---
    bark_volume = trunk_volume * bark_volume_fraction
    bark_kg = bark_volume * rho * 1000.0

    # --- Foliage ---
    foliar_kg = agb * FOLIAR_AGB_FRACTION

    # --- Sawdust from 5 mm kerf field slabbing ---
    sawdust_volume = trunk_volume * CHAINSAW_KERF_MM / (CHAINSAW_KERF_MM + SLAB_THICKNESS_MM)
    sawdust_kg = sawdust_volume * rho * 1000.0

    # Waste = everything except the commercial trunk itself
    waste = branch_total + bark_kg + foliar_kg + bgb + sawdust_kg

    profile = resolve_species(species)
    return ResidueBreakdown(
        species=profile.scientific_name if profile else (species or "unknown"),
        dbh_cm=dbh_cm,
        height_m=h,
        wood_density_g_cm3=rho,
        allometry_strategy=strategy.value,
        total_agb_kg=agb,
        total_bgb_kg=bgb,
        total_biomass_kg=agb + bgb,
        volume_trunk_m3=trunk_volume,
        volume_branches_m3=branch_volume,
        weight_branches_total_kg=branch_total,
        weight_branches_fine_kg=branch_fine,
        weight_branches_thick_kg=branch_thick,
        weight_bark_kg=bark_kg,
        weight_foliar_kg=foliar_kg,
        volume_stump_m3=stump_volume,
        weight_stump_kg=stump_kg,
        weight_roots_kg=roots_kg,
        volume_sawdust_m3=sawdust_volume,
        weight_sawdust_kg=sawdust_kg,
        total_waste_biomass_kg=waste,
    )
