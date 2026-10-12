"""Estimated merchantable log volume from DBH.

Provisional geometric estimate used by the regulatory statements (états) until
per-species taper/volume tables are ingested: a cylinder over the merchantable
bole height (``height_diameter.bole_height_m``) with a form factor of 0.5
(a conservative tropical-bole value). Clearly reported as an estimate — it is
*not* the legal cubage of a specification.
"""

import math

from app.core.height_diameter import bole_height_m

# Provisional form factor (stem volume / enclosing cylinder) for Central African
# boles; swap for a species taper table when available.
FORM_FACTOR = 0.5


def merchantable_volume_m3(
    dbh_cm: float | None,
    species: str | None = None,
    form_factor: float = FORM_FACTOR,
) -> float:
    """Estimated stem volume (m³) for a stem of ``dbh_cm``."""
    if dbh_cm is None or dbh_cm <= 0:
        return 0.0
    radius_m = (dbh_cm / 100.0) / 2.0
    height_m = bole_height_m(dbh_cm, species)
    return round(math.pi * radius_m**2 * height_m * form_factor, 4)
