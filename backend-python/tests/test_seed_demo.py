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


def test_seeded_eudr_geolocation_and_diligence_are_consistent():
    suffixes = {suffix for suffix, *_ in seed_demo.STEMS}
    geo = seed_demo.SEEDED_GEOLOCATION
    # Every geolocated point refers to a seeded stem, with plausible WGS84 coords.
    assert {suffix for suffix, _, _ in geo} <= suffixes
    for _, lon, lat in geo:
        assert -180.0 <= lon <= 180.0
        assert -90.0 <= lat <= 90.0
    # The demo geolocates several stems (inside) and keeps at least one outside.
    assert len(geo) >= 2
    d = seed_demo.SEEDED_DILIGENCE
    assert d["parcel_label"]
    assert d["parcel_wkt"].startswith("POLYGON((")
    assert d["declared_volume_m3"] > 0


def _rect_bounds(wkt: str) -> tuple[float, float, float, float]:
    coords = wkt.removeprefix("POLYGON((").removesuffix("))").split(",")
    pts = [tuple(map(float, c.split())) for c in coords]
    lons, lats = [p[0] for p in pts], [p[1] for p in pts]
    return min(lons), min(lats), max(lons), max(lats)


def _inside(wkt: str, lon: float, lat: float) -> bool:
    x0, y0, x1, y1 = _rect_bounds(wkt)
    return x0 <= lon <= x1 and y0 <= lat <= y1


def test_aac_polygons_make_exactly_one_stem_fall_outside():
    geo = {suffix: (lon, lat) for suffix, lon, lat in seed_demo.SEEDED_GEOLOCATION}
    open_stems = ["001", "002", "003", "004", "005"]
    outside = [s for s in open_stems if not _inside(seed_demo.AAC_OPEN_WKT, *geo[s])]
    assert outside == [seed_demo.OUTSIDE_AAC_STEM]
    # The closed-AAC stem lies inside its own block (its anomaly is the closure).
    assert _inside(seed_demo.AAC_CLOSED_WKT, *geo["006"])


def test_seeded_scans_all_fall_in_the_open_aac():
    # Linked scans point at seeded stems; every scan lies inside the open AAC
    # polygon, so the carbon rollup attributes all of them to it.
    suffixes = {suffix for suffix, *_ in seed_demo.STEMS}
    for suffix, lon, lat, _species, dbh, height in seed_demo.SEEDED_SCANS:
        assert suffix is None or suffix in suffixes
        assert _inside(seed_demo.AAC_OPEN_WKT, lon, lat)
        assert dbh > 0 and height > 1.3
    assert any(s[0] is None for s in seed_demo.SEEDED_SCANS)  # GPS-only attribution


def test_reserved_stem_is_a_reserved_species():
    species, _, _ = _BY_SUFFIX["002"]
    assert is_reserved_species(species)


def test_every_stem_yields_a_positive_volume():
    for _, species, dbh, _ in seed_demo.STEMS:
        assert merchantable_volume_m3(dbh, species) > 0
