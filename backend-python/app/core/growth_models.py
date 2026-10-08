"""Alternative species-specific growth model: Engone Obiang et al. 2013.

Lognormal potential-growth x competition-reducer model for Okoume
(Aucoumea klaineana), fitted on seven Gabon/Congo permanent-plot sites
(Ann. For. Sci. 70(3): 241-249).

    A(D,N,B) = 2.26 * exp(-(1/1.61) * ln^2(21.0/D))
               * exp(-(0.121*B - 6.038e-4*N) * exp(-3.350e-2*D))

    A : potential diameter increment (cm/year)
    D : tree DBH (cm)
    N : stand density (stems/ha)
    B : stand basal area (m2/ha)

Published summary statistics used for validation:
    - peak potential increment 2.26 cm/yr at D = 21 cm (empty plot)
    - Gabon national inventory defaults: B = 25 m2/ha, N = 410 stems/ha
    - mean annual increment unlogged forest ~ 0.8 cm/yr (Picard & Gourlet-Fleury 2011)
"""

import math

from app.core.species_data import resolve_species

GABON_DEFAULT_BASAL_AREA = 25.0  # m2/ha (Poulsen et al. 2020 national inventory)
GABON_DEFAULT_DENSITY = 410.0  # stems/ha

_A = 2.26
_G = 1.61
_D_REF = 21.0
_ALPHA_BETA = 0.121
_ALPHA_N = 6.038e-4
_MU = 3.350e-2


def potential_increment_cm_per_year(dbh_cm: float) -> float:
    """Potential (unconstrained) annual diameter increment."""
    if dbh_cm <= 0:
        raise ValueError("dbh_cm must be positive")
    return _A * math.exp(-(1.0 / _G) * math.log(_D_REF / dbh_cm) ** 2)


def increment_cm_per_year(
    dbh_cm: float,
    basal_area_m2_ha: float = GABON_DEFAULT_BASAL_AREA,
    density_stems_ha: float = GABON_DEFAULT_DENSITY,
) -> float:
    """Diameter increment under competition (cm/year)."""
    pot = potential_increment_cm_per_year(dbh_cm)
    reducer = math.exp(
        -(_ALPHA_BETA * basal_area_m2_ha - _ALPHA_N * density_stems_ha) * math.exp(-_MU * dbh_cm)
    )
    return pot * reducer


def estimate_age_by_integration(
    dbh_cm: float,
    species: str | None,
    basal_area_m2_ha: float = GABON_DEFAULT_BASAL_AREA,
    density_stems_ha: float = GABON_DEFAULT_DENSITY,
    step_years: float = 0.5,
    max_age_years: float = 800.0,
) -> float | None:
    """Numerically integrate the Engone Obiang increment until DBH is reached.

    Integration starts at the recruit diameter (5 cm — lower bound of the
    model's fitted domain). Returns None when the species is not Okoume
    (model is species-specific) or when max_age is exceeded.
    """
    profile = resolve_species(species)
    if profile is None or "aucoumea" not in profile.scientific_name.lower():
        return None

    age = 0.0
    d = 5.0  # recruitment DBH: lower bound of the fitted model's domain
    while age < max_age_years:
        d += increment_cm_per_year(d, basal_area_m2_ha, density_stems_ha) * step_years
        age += step_years
        if d >= dbh_cm:
            return age
    return None
