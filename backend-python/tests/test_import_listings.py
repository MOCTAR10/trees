"""Offline tests for CITES/EU/CMS listing import parsers."""

from tools.import_listings import build_legal_doc, load_cites, load_cms, load_eu


def _write(tmp_path, name, text):
    p = tmp_path / name
    p.write_text(text, encoding="utf-8")
    return p


CITES = (
    "Scientific Name,Listing,Listed under,Full note\n"
    "Pericopsis elata,II,Pericopsis elata,Quota applies\n"
    "Guibourtia tessmannii,II,Guibourtia spp.,\n"
    ",III,Bad row,\n"
)

EU = "Scientific Name,Listing,Full note\nPericopsis elata,B,Annex B\nGuibourtia tessmannii,B,\n"

CMS = "Scientific Name,Listing\nTadarida brasiliensis,I\n"


def test_load_cites_skips_blank_names(tmp_path):
    out = load_cites(_write(tmp_path, "c.csv", CITES))
    assert set(out) == {"Pericopsis elata", "Guibourtia tessmannii"}
    assert out["Pericopsis elata"]["appendix"] == "II"
    assert out["Guibourtia tessmannii"]["listed_under"] == "Guibourtia spp."


def test_load_eu_and_cms(tmp_path):
    assert load_eu(_write(tmp_path, "e.csv", EU))["Pericopsis elata"]["listing"] == "B"
    assert load_cms(_write(tmp_path, "m.csv", CMS))["Tadarida brasiliensis"]["listing"] == "I"


def test_build_legal_doc_orders_by_appendix():
    cache = {
        "Guibourtia tessmannii": {"cites_appendix": "II", "eu_listing": "B"},
        "Pericopsis elata": {"cites_appendix": "I"},
        "Unlisted spp": {},
    }
    docs = build_legal_doc(cache, dry_run=True)
    assert len(docs) == 1
    content = docs[0]["content"]
    assert content.index("Pericopsis elata") < content.index("Guibourtia tessmannii")
    assert "Unlisted spp" not in content
    assert docs[0]["metadata"]["legal_framework_reference"] == "cites_appendix"


def test_build_legal_doc_empty_when_nothing_listed():
    assert build_legal_doc({"X spp": {"eu_listing": "B"}}, dry_run=True) == []
