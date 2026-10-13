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


def test_seeded_ufa_dme_is_stricter_than_provisional_and_bites():
    species, override, source = seed_demo.SEEDED_UFA_DME[0]
    provisional = dme_for(species)[0]
    assert provisional is not None
    # The demo shows an official floor stricter than the interim default...
    assert override > provisional
    # ...and the below-DME stem is below the *official* value it is judged by.
    below_species, dbh, _ = _BY_SUFFIX["001"]
    assert below_species == species
    assert dbh < override
    assert seed_demo.TREE_PREFIX and source  # non-empty provenance


def test_seeded_conventions_form_a_provisoire_then_definitive_chain():
    types = [c["convention_type"] for c in seed_demo.SEEDED_CONVENTIONS]
    assert types == ["provisoire", "definitive"]
    provisoire, definitive = seed_demo.SEEDED_CONVENTIONS
    # The provisoire precedes the definitive (definitive starts when provisoire ends).
    assert provisoire["end_date"] == definitive["start_date"]
    # Only the definitive carries the attestation de conformité; it is valid.
    assert provisoire["attestation_ref"] is None
    assert definitive["attestation_ref"]
    assert definitive["end_date"] > definitive["start_date"]


def test_seeded_studies_cover_ppf_and_eie():
    types = [s["study_type"] for s in seed_demo.SEEDED_STUDIES]
    assert types == ["ppf", "eie"]
    ppf, eie = seed_demo.SEEDED_STUDIES
    # The PPF is validated and carries its certificat de conformité.
    assert ppf["status"] == "valide"
    assert ppf["certificate_ref"]
    assert ppf["valid_to"] > ppf["valid_from"]
    # The EIE is still before the Ministry (no certificate yet).
    assert eie["status"] == "soumis"
    assert eie["certificate_ref"] is None


def test_reserved_stem_is_a_reserved_species():
    species, _, _ = _BY_SUFFIX["002"]
    assert is_reserved_species(species)


def test_every_stem_yields_a_positive_volume():
    for _, species, dbh, _ in seed_demo.STEMS:
        assert merchantable_volume_m3(dbh, species) > 0
