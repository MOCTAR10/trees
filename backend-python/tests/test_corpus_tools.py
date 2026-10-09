"""Unit tests for the pure helpers in tools.expand_corpus."""

from tools.expand_corpus import _native_to_africa, _vernacular_aliases


def test_native_to_africa_ignores_introduced_marker():
    entry = {
        "native_range": [
            "Caribbean",
            "Gambia [I]; Benin [I]; Central African Republic [I] (Ubangi-Shari [I])",
        ]
    }
    assert _native_to_africa(entry) is False


def test_native_to_africa_true_for_region_or_native_country():
    assert _native_to_africa({"native_range": ["Africa"]}) is True
    assert _native_to_africa({"native_range": ["Nigeria; Cameroon; Gabon"]}) is True
    assert _native_to_africa({"native_range": ["Congo [Brazzaville]"]}) is True


def test_native_to_africa_none_without_data():
    assert _native_to_africa({}) is None
    assert _native_to_africa({"native_range": []}) is None


def test_vernacular_aliases_filters_scientific_and_short():
    # "oak" is too short, the scientific name is dropped, common names kept.
    out = _vernacular_aliases("Khaya ivorensis", ["Acajou"], ["oak", "Khaya ivorensis"])
    assert out == ["acajou"]


def test_vernacular_aliases_dedupes_and_caps():
    fr = ["Acajou", "acajou"]
    en = [f"name{i}" for i in range(20)]
    out = _vernacular_aliases("Khaya ivorensis", fr, en)
    assert out[0] == "acajou"
    assert len(out) <= 8
    assert len(set(out)) == len(out)
