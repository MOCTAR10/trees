import math

import pytest

from app.core.chapman_richards import (
    age_from_dbh,
    d_at_age,
    damp_rate_for_canopy,
    estimate_age_for_species,
)
from app.core.growth_models import (
    estimate_age_by_integration,
    increment_cm_per_year,
    potential_increment_cm_per_year,
)


def test_chapman_roundtrip():
    a, k, p = 80.0, 0.035, 1.2
    for t in [5.0, 20.0, 50.0, 75.0]:
        d = d_at_age(t, a, k, p)
        assert math.isclose(age_from_dbh(d, a, k, p), t, rel_tol=1e-9)


def test_okoume_reference_points():
    # ~63.7 cm at 50 y and ~73 cm at 75 y with fitted constants
    d50 = d_at_age(50, 80.0, 0.035, 1.2)
    d75 = d_at_age(75, 80.0, 0.035, 1.2)
    assert 60 < d50 < 68
    assert 70 < d75 < 78


def test_asymptote_guard():
    with pytest.raises(ValueError):
        age_from_dbh(85.0, 80.0, 0.035, 1.2)
    with pytest.raises(ValueError):
        age_from_dbh(80.0, 80.0, 0.035, 1.2)


def test_canopy_damping_increases_age():
    dbh = 45.0
    age_open, _ = estimate_age_for_species(dbh, "Aucoumea klaineana", canopy_density_fcd=0.1)
    age_dense, _ = estimate_age_for_species(dbh, "Aucoumea klaineana", canopy_density_fcd=0.9)
    assert age_dense > age_open


def test_engone_peak_increment():
    # Published: potential growth culminates at 2.26 cm/yr at D = 21 cm
    assert math.isclose(potential_increment_cm_per_year(21.0), 2.26, rel_tol=1e-9)
    peak = potential_increment_cm_per_year(21.0)
    assert peak > potential_increment_cm_per_year(5.0)
    assert peak > potential_increment_cm_per_year(60.0)


def test_engone_competition_reduces_growth():
    open_plot = increment_cm_per_year(30.0, basal_area_m2_ha=5.0, density_stems_ha=100.0)
    dense_plot = increment_cm_per_year(30.0, basal_area_m2_ha=40.0, density_stems_ha=800.0)
    assert open_plot > dense_plot


def test_engone_age_integration_okoume():
    age = estimate_age_by_integration(40.0, "Aucoumea klaineana")
    assert age is not None
    assert 30 < age < 200  # 40 cm okoume under average-stand competition


def test_engone_rejects_other_species():
    assert estimate_age_by_integration(40.0, "Lophira alata") is None


def test_damping_bounds():
    k = 0.03
    assert math.isclose(damp_rate_for_canopy(k, None), k)
    assert math.isclose(damp_rate_for_canopy(k, 1.0), k * 0.60)
    assert math.isclose(damp_rate_for_canopy(k, 0.0), k)
