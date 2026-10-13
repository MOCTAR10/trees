"""Contract tests for the demo seed (no database required).

Guards the invariants the Ministère walkthrough relies on: the dataset must
exercise **every** anomaly family and stay within the schema's constraints.
"""

from app.core.dme import dme_for
from app.core.log_volume import merchantable_volume_m3
from app.core.reserved_species import is_reserved_species
from app.services import anomalies
from tools import seed_demo

# tree_registry.status CHECK (db/migrations/008_abattage.sql).
TREE_STATUSES = {
    "inventorie",
    "declare",
    "autorise",
    "abattu",
    "transporte",
    "transforme",
}

_BY_SUFFIX = {suffix: (species, dbh, status) for suffix, species, dbh, status in seed_demo.STEMS}


def test_seed_covers_every_anomaly_family():
    assert set(anomalies.TYPES) == set(seed_demo.SEEDED_ANOMALY_TYPES)


def test_tree_codes_are_unique_and_namespaced():
    codes = [seed_demo._code(suffix) for suffix, *_ in seed_demo.STEMS]
    assert len(codes) == len(set(codes))
    assert all(code.startswith(seed_demo.TREE_PREFIX) for code in codes)


def test_stem_statuses_satisfy_registry_constraint():
    for _, _, _, status in seed_demo.STEMS:
        assert status in TREE_STATUSES


def test_below_dme_stem_is_genuinely_below_its_dme():
    species, dbh, _ = _BY_SUFFIX["001"]
    dme = dme_for(species)[0]
    assert dme is not None
    assert dbh < dme


def test_reserved_stem_is_a_reserved_species():
    species, _, _ = _BY_SUFFIX["002"]
    assert is_reserved_species(species)


def test_every_stem_yields_a_positive_volume():
    for _, species, dbh, _ in seed_demo.STEMS:
        assert merchantable_volume_m3(dbh, species) > 0
