import pytest

from app.core.chave_allometry import AllometryStrategy
from app.services.biomass_engine import (
    BRANCH_AGB_FRACTION,
    FOLIAR_AGB_FRACTION,
    compute_residues,
)


@pytest.fixture
def okoume_60():
    return compute_residues(60.0, species="Aucoumea klaineana")


def test_agb_magnitude(okoume_60):
    # Okoume D=60 H~28: AGB in the hundreds of kg, not grams or tonnes
    assert 500 < okoume_60.total_agb_kg < 3000


def test_azobe_much_heavier_than_okoume(okoume_60):
    azobe = compute_residues(60.0, species="Lophira alata")
    assert azobe.total_agb_kg > 2.0 * okoume_60.total_agb_kg


def test_branch_split_conservation(okoume_60):
    assert okoume_60.weight_branches_fine_kg + okoume_60.weight_branches_thick_kg == pytest.approx(
        okoume_60.weight_branches_total_kg
    )
    assert okoume_60.weight_branches_total_kg == pytest.approx(
        okoume_60.total_agb_kg * BRANCH_AGB_FRACTION
    )


def test_bgb_ratio_bounds():
    for r in (0.15, 0.18, 0.22):
        res = compute_residues(50.0, species="Pterocarpus soyauxii", root_shoot_ratio=r)
        assert res.total_bgb_kg == pytest.approx(res.total_agb_kg * r)
        assert res.weight_stump_kg + res.weight_roots_kg == pytest.approx(res.total_bgb_kg)


def test_foliar_fraction(okoume_60):
    assert okoume_60.weight_foliar_kg == pytest.approx(okoume_60.total_agb_kg * FOLIAR_AGB_FRACTION)


def test_bark_within_range():
    res = compute_residues(45.0, species="Baillonella toxisperma", bark_volume_fraction=0.12)
    expected = res.volume_trunk_m3 * 0.12 * res.wood_density_g_cm3 * 1000.0
    assert res.weight_bark_kg == pytest.approx(expected)


def test_sawdust_positive_and_small(okoume_60):
    assert okoume_60.volume_sawdust_m3 > 0
    assert okoume_60.volume_sawdust_m3 < okoume_60.volume_trunk_m3 * 0.2


def test_waste_excludes_trunk(okoume_60):
    # waste = branches + bark + foliage + bgb + sawdust (< AGB + BGB)
    assert okoume_60.total_waste_biomass_kg < okoume_60.total_biomass_kg


def test_strategy_selection():
    res = compute_residues(
        55.0, species="Dacryodes glaucescens", strategy=AllometryStrategy.CHAVE_2005_MOIST
    )
    assert res.allometry_strategy == "chave_2005_moist"


def test_invalid_inputs():
    with pytest.raises(ValueError):
        compute_residues(0.0)
    with pytest.raises(ValueError):
        compute_residues(40.0, root_shoot_ratio=0.5)
    with pytest.raises(ValueError):
        compute_residues(40.0, bark_volume_fraction=0.3)
