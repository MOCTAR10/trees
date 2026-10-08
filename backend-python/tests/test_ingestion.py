"""Corpus + ingestion tests (no DB / no embedding model)."""

from ingestion.ingest import KNOWLEDGE_DIR, SUBDIR_MAP, _upsert_sql, load_corpus


def test_load_corpus_parses_all_subdirs():
    rows = load_corpus()
    assert len(rows) >= 20
    ids = [r["id"] for r in rows]
    assert len(ids) == len(set(ids)), "duplicate document ids"
    tables = {r["table"] for r in rows}
    assert tables == {"rag_documents", "circular_economy_knowledge"}


def test_rag_documents_have_doc_type_and_species():
    rows = load_corpus()
    for r in rows:
        if r["table"] == "rag_documents":
            assert r["doc_type"] in ("species", "equation")
            if r["doc_type"] == "species":
                assert r["species"], f"{r['id']} missing species metadata"
                assert r["language"] == "en"


def test_circular_economy_rows_have_metadata():
    rows = load_corpus()
    for r in rows:
        if r["table"] == "circular_economy_knowledge":
            assert r["residue_type"] in (
                "branches",
                "bark",
                "roots",
                "foliage",
                "stumps",
                "sawdust",
                "mixed",
            ), f"{r['id']}: {r['residue_type']}"
            # protocols need a technology, legal docs need a framework reference
            if r["id"].startswith("proto_"):
                assert r["transformation_technology"], r["id"]
            if r["id"].startswith("legal_"):
                assert r["legal_framework_reference"], r["id"]


def test_species_metadata_names_gabonese_species():
    rows = {r["id"]: r for r in load_corpus()}
    okoume = rows["species_aucoumea_klaineana"]
    assert okoume["metadata"]["common_name_fr"] == "Okoumé"
    assert "0.44" in okoume["content"]  # wood density carried in text


def test_upsert_sql_per_table():
    assert "rag_documents" in _upsert_sql("rag_documents")
    assert "ON CONFLICT (id)" in _upsert_sql("rag_documents")
    assert "circular_economy_knowledge" in _upsert_sql("circular_economy_knowledge")


def test_knowledge_dirs_exist():
    for subdir in SUBDIR_MAP:
        assert (KNOWLEDGE_DIR / subdir).is_dir()
