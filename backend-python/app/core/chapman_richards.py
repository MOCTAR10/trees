"""Chapman-Richards growth model and its analytic inverse.

Forward model (Phase 1 specification):
    D(t) = A * (1 - exp(-k * t)) ** p

    A : asymptotic DBH (cm)
    k : growth rate constant (1/yr)
    p : shape parameter

Inverse (age estimation from measured DBH):
    t(D) = -ln(1 - (D/A)^(1/p)) / k      for 0 < D < A

Guards: D >= A raises (tree at/over asymptote => age undefined);
D <= 0 raises. Environmental damping of k is applied by the caller
(e.g. high canopy competition from GEE FCD reduces k).
"""

import math

from app.core.species_data import DEFAULT_SPECIES, resolve_species

# Canopy-competition damping bounds (Phase 1, Step 5):
# dense forest (FCD -> 1.0) damps k down to 60% of the open-grown value.
K_DAMPING_MIN = 0.60


def d_at_age(t_years: float, a: float, k: float, p: float) -> float:
    if t_years < 0:
        raise ValueError("t_years must be non-negative")
    if a <= 0 or k <= 0 or p <= 0:
        raise ValueError("a, k, p must be positive")
    return a * (1.0 - math.exp(-k * t_years)) ** p


def age_from_dbh(
    dbh_cm: float,
    a: float,
    k: float,
    p: float,
) -> float:
    """Invert Chapman-Richards: estimated age (years) for a measured DBH."""
    if dbh_cm <= 0:
        raise ValueError("dbh_cm must be positive")
    if a <= 0 or k <= 0 or p <= 0:
        raise ValueError("a, k, p must be positive")
    if dbh_cm >= a:
        raise ValueError(f"Measured DBH {dbh_cm:.1f} cm >= asymptote A={a:.1f} cm; age undefined")
    ratio = (dbh_cm / a) ** (1.0 / p)
    if ratio >= 1.0:
        raise ValueError("Invalid state: (D/A)^(1/p) >= 1")
    return -math.log(1.0 - ratio) / k


def damp_rate_for_canopy(k: float, canopy_density_fcd: float | None) -> float:
    """Reduce k under dense-canopy competition.

    FCD in [0, 1]: 0 = open sun, 1 = closed canopy.
    k_eff = k * (1 - (1 - K_DAMPING_MIN) * FCD)
    """
    if canopy_density_fcd is None:
        return k
    fcd = min(max(canopy_density_fcd, 0.0), 1.0)
    return k * (1.0 - (1.0 - K_DAMPING_MIN) * fcd)


def estimate_age_for_species(
    dbh_cm: float,
    species: str | None,
    canopy_density_fcd: float | None = None,
) -> tuple[float, str]:
    """Return (age_years, model_label) using the species CR constants."""
    profile = resolve_species(species) or DEFAULT_SPECIES
    k_eff = damp_rate_for_canopy(profile.cr_rate_k, canopy_density_fcd)
    age = age_from_dbh(dbh_cm, profile.cr_asymptote_a_cm, k_eff, profile.cr_shape_p)
    label = (
        f"chapman_richards[{profile.scientific_name}: "
        f"A={profile.cr_asymptote_a_cm}, k={k_eff:.4f}, p={profile.cr_shape_p}]"
    )
    return age, label
