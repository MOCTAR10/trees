"""Law-corpus builder tests (pure parsing helpers, no PDF dependency)."""

from tools.ingest_law import build_entries, clean_text, split_articles

SAMPLE = """
LOI N°016/01 PORTANT CODE FORESTIER

Article 14.- Nul ne peut exploiter sans autorisation préalable.

Article 15.- Courte.

Article 124.- L'abattage des arbres dont le diamètre est supérieur
ou égal au DME est autorisé.
"""


def test_split_articles_finds_boundaries_in_order():
    chunks = split_articles(SAMPLE)
    numbers = [n for n, _ in chunks]
    assert numbers == [14, 124]
    assert "autorisation préalable" in chunks[0][1]


def test_split_articles_skips_stub_articles():
    assert all(len(body) >= 40 for _, body in split_articles(SAMPLE))


def test_clean_text_collapses_whitespace_and_page_numbers():
    assert clean_text("  abattage\n   des   arbres  \n 12 \n") == "abattage des arbres"


def test_build_entries_shape_matches_legal_corpus():
    entries = build_entries([(14, "Nul ne peut exploiter.")])
    assert entries[0]["id"] == "loi016_art_014"
    assert "Article 14" in entries[0]["content"]
    assert entries[0]["metadata"] == {
        "legal_framework_reference": "loi_016_01",
        "residue_type": "mixed",
        "language": "fr",
        "source": "docs/LOI N°016_01 code forestier.pdf",
        "article": 14,
    }
