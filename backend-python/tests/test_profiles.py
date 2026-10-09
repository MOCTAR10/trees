"""Unit tests for residue ↔ cooperative profile affinity."""

from app.core import profiles

ROW = {
    "weight_branches_fine_kg": 10.0,
    "weight_branches_thick_kg": 5.0,
    "weight_foliar_kg": 2.0,
    "weight_bark_kg": 7.0,
    "weight_roots_kg": 3.0,
    "volume_stump_m3": 0.1,
}


def test_channel_masses():
    masses = profiles.residue_channel_masses(ROW)
    assert masses["canopy_and_branches"] == 17.0
    assert masses["bark_and_organic_liquids"] == 7.0
    assert masses["stump_and_roots"] == 3.0 + 0.1 * profiles.STUMP_DENSITY_KG_M3


def test_total_residue_mass():
    assert profiles.total_residue_mass(ROW) == round(17.0 + 7.0 + 73.0, 1)


def test_profile_relevant_mass():
    assert profiles.profile_relevant_mass(ROW, "energy_briquettes") == 17.0
    assert profiles.profile_relevant_mass(ROW, "agricultural_biochar") == 17.0
    assert profiles.profile_relevant_mass(ROW, "bio_chemical_extraction") == 80.0
    assert profiles.profile_relevant_mass(ROW, "artisan_furniture") == 90.0
    assert profiles.profile_relevant_mass(ROW, "unknown_profile") == 0.0
    assert profiles.profile_relevant_mass(ROW, None) == 0.0


def test_match_score():
    assert profiles.match_score(ROW, "energy_briquettes") == 0.175
    assert profiles.match_score(ROW, "artisan_furniture") == round(90.0 / 97.0, 3)


def test_match_score_handles_empty_and_missing():
    assert profiles.match_score({}, "energy_briquettes") == 0.0
    assert profiles.total_residue_mass({"weight_bark_kg": "oops"}) == 0.0
