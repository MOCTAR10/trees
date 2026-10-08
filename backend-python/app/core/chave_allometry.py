"""Above-ground biomass allometric models (Chave et al.).

Three published strategies (selectable):

1. ``chave_2005_moist``  — Chave et al. 2005, moist tropical forests:
       AGB = exp(-1.349 + 1.980 * ln(rho * D^2 * H))
2. ``chave_2014_h``      — Chave et al. 2014, Eq. 4 (requires height):
       AGB = 0.0673 * (rho * D^2 * H) ** 0.976
3. ``chave_2014_e``      — Chave et al. 2014, Eq. 7 (no height; needs the
       bioclimatic stress index E and coordinates-independent covariate):
       AGB = exp(-2.023977 - 0.89563505*E + 0.92023559*ln(rho)
                 + 2.79495823*ln(D) - 0.04606298*(ln(D)^2))

4. ``phase2_generic``    — generic pantropical form quoted in the project
       specification (Phase 2):
       AGB = exp(-1.803 + 0.944 * ln(rho * D^2 * H))

Units: D in cm, H in m, rho in g/cm3, AGB returned in kg (dry).
Default E for the Congo Basin equatorial climate (Chave 2014 raster
median for Gabon): 0.10.
"""

from enum import StrEnum

import numpy as np

CONGO_BASIN_DEFAULT_E = 0.10


class AllometryStrategy(StrEnum):
    CHAVE_2005_MOIST = "chave_2005_moist"
    CHAVE_2014_H = "chave_2014_h"
    CHAVE_2014_E = "chave_2014_e"
    PHASE2_GENERIC = "phase2_generic"


def estimate_agb(
    dbh_cm: float,
    wood_density: float,
    height_m: float | None = None,
    e_index: float = CONGO_BASIN_DEFAULT_E,
    strategy: AllometryStrategy = AllometryStrategy.CHAVE_2014_H,
) -> float:
    """Estimate oven-dry above-ground biomass in kg."""
    if dbh_cm <= 0:
        raise ValueError("dbh_cm must be positive")
    if wood_density <= 0:
        raise ValueError("wood_density must be positive")

    if strategy == AllometryStrategy.CHAVE_2005_MOIST:
        _require_height(height_m, strategy)
        return float(np.exp(-1.349 + 1.980 * np.log(wood_density * dbh_cm**2 * height_m)))

    if strategy == AllometryStrategy.CHAVE_2014_H:
        _require_height(height_m, strategy)
        return float(0.0673 * (wood_density * height_m * dbh_cm**2) ** 0.976)

    if strategy == AllometryStrategy.CHAVE_2014_E:
        ln_d = np.log(dbh_cm)
        return float(
            np.exp(
                -2.023977
                - 0.89563505 * e_index
                + 0.92023559 * np.log(wood_density)
                + 2.79495823 * ln_d
                - 0.04606298 * ln_d**2
            )
        )

    if strategy == AllometryStrategy.PHASE2_GENERIC:
        _require_height(height_m, strategy)
        return float(np.exp(-1.803 + 0.944 * np.log(wood_density * dbh_cm**2 * height_m)))

    raise ValueError(f"Unknown strategy: {strategy}")


def _require_height(height_m: float | None, strategy: AllometryStrategy) -> None:
    if height_m is None or height_m <= 0:
        raise ValueError(f"Strategy {strategy.value} requires a positive height_m")
