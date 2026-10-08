import math

import pytest

from app.core.chave_allometry import (
    CONGO_BASIN_DEFAULT_E,
    AllometryStrategy,
    estimate_agb,
)


def test_chave_2014_h_known_value():
    # rho=0.6, D=30, H=25 -> (0.6*25*900)=13500; 0.0673*13500^0.976
    agb = estimate_agb(30, 0.6, height_m=25, strategy=AllometryStrategy.CHAVE_2014_H)
    expected = 0.0673 * (0.6 * 25 * 30**2) ** 0.976
    assert math.isclose(agb, expected, rel_tol=1e-9)
    assert 200 < agb < 800  # sanity: ~450 kg for a 30 cm tree


def test_agb_monotonic_in_dbh():
    prev = 0
    for d in [10, 20, 40, 60, 80]:
        agb = estimate_agb(d, 0.6, height_m=25, strategy=AllometryStrategy.CHAVE_2014_H)
        assert agb > prev
        prev = agb


def test_agb_monotonic_in_density():
    light = estimate_agb(50, 0.44, height_m=30, strategy=AllometryStrategy.CHAVE_2014_H)
    heavy = estimate_agb(50, 1.06, height_m=30, strategy=AllometryStrategy.CHAVE_2014_H)
    assert heavy > light * 2  # azobe stores far more than okoume


def test_height_required_strategies():
    for s in (
        AllometryStrategy.CHAVE_2005_MOIST,
        AllometryStrategy.CHAVE_2014_H,
        AllometryStrategy.PHASE2_GENERIC,
    ):
        with pytest.raises(ValueError):
            estimate_agb(30, 0.6, height_m=None, strategy=s)


def test_e_strategy_needs_no_height():
    agb = estimate_agb(
        30,
        0.6,
        height_m=None,
        e_index=CONGO_BASIN_DEFAULT_E,
        strategy=AllometryStrategy.CHAVE_2014_E,
    )
    assert agb > 0


def test_invalid_inputs():
    with pytest.raises(ValueError):
        estimate_agb(0, 0.6, height_m=20)
    with pytest.raises(ValueError):
        estimate_agb(30, 0, height_m=20)
