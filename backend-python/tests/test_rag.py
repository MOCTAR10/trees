"""RAG layer tests (no DB, no embedding model).

Covers corpus/registry consistency, RRF fusion, and the hybrid retrieval
SQL/metadata mapping with the embedder and the database connection stubbed.
"""

from fastapi.testclient import TestClient

from app.core.species_data import SPECIES_DB, resolve_species
from app.main import app
from app.services import rag
from ingestion.ingest import load_corpus


def _species_docs() -> dict[str, dict]:
    return {
        r["id"]: r
        for r in load_corpus()
        if r["table"] == "rag_documents" and r["doc_type"] == "species"
    }


def test_every_registry_species_has_a_corpus_doc():
    """Every engine species must have an embeddable corpus document."""
    docs = _species_docs()
    corpus_species = {d["species"] for d in docs.values()}
    registry = set(SPECIES_DB)
    missing = registry - corpus_species
    assert not missing, f"registry species without corpus doc: {sorted(missing)[:10]}"
    assert len(docs) >= 800, f"corpus expanded too little: {len(docs)} species docs"


def test_species_doc_density_matches_registry():
    """Density quoted in the corpus text must match the deterministic registry."""
    for doc in _species_docs().values():
        profile = SPECIES_DB.get(doc["species"])
        if profile is None:
            continue
        assert f"{profile.wood_density_g_cm3:.2f}" in doc["content"], (
            f"{doc['id']}: density {profile.wood_density_g_cm3} not found in content"
        )


def test_new_species_resolvable_and_aliases_fixed():
    assert resolve_species("Sapelli").scientific_name == "Entandrophragma cylindricum"
    assert resolve_species("Sipo").scientific_name == "Entandrophragma utile"
    assert resolve_species("Iroko").scientific_name == "Milicia excelsa"
    assert resolve_species("Fraké").scientific_name == "Terminalia superba"
    assert resolve_species("Okan").scientific_name == "Cylicodiscus gabunensis"
    # "sipo" must NOT resolve to Moabi any more (taxonomy bug fixed)
    assert resolve_species("Moabi").scientific_name == "Baillonella toxisperma"


def test_generated_cohort_is_loaded_into_registry():
    # A generated-only species (not in the curated cohort) must resolve exactly.
    profile = resolve_species("Triplochiton scleroxylon")
    assert profile is not None
    assert profile.scientific_name == "Triplochiton scleroxylon"
    assert profile.wood_density_g_cm3 > 0
    assert profile.cr_source == "density_heuristic"
    assert len(SPECIES_DB) >= 800


def test_generated_corpus_files_are_consistent():
    import json
    from pathlib import Path

    backend = Path(__file__).resolve().parents[1]
    docs = json.loads(
        (backend / "knowledge" / "species" / "africa_wood_density.json").read_text(encoding="utf-8")
    )
    ref = json.loads((backend / "data" / "species_reference.json").read_text(encoding="utf-8"))
    assert len(docs) == len(ref) >= 800
    ids = [d["id"] for d in docs]
    assert len(ids) == len(set(ids)), "duplicate document ids"
    assert {d["metadata"]["species"] for d in docs} == {r["scientific_name"] for r in ref}
    assert all(0.05 < r["wood_density_g_cm3"] < 1.6 for r in ref)


def test_rrf_fuse_ranks_consensus_first():
    # 'b' appears high in both lists -> should win over list-specific winners
    fused = rag.rrf_fuse(["a", "b", "c"], ["b", "c", "a"])
    assert fused[0] == "b"
    # a doc present in only one list still surfaces
    fused2 = rag.rrf_fuse(["x"], ["y", "z"])
    assert set(fused2) == {"x", "y", "z"}


def test_query_forestry_hybrid_filters_and_mapping(monkeypatch):
    calls: list[tuple[str, tuple]] = []

    def fake_embed_query(text):
        return [0.0] * 384

    row = {
        "id": "species_aucoumea_klaineana",
        "content": "Okoume profile",
        "source": "knowledge/species/congo_basin_species.json",
        "doc_type": "species",
        "metadata": '{"species": "Aucoumea klaineana"}',
        "score": 0.91,
    }

    async def fake_fetch_all(sql, *args):
        calls.append((sql, args))
        if "content_tsv" in sql:
            return []  # lexical retriever finds nothing
        return [row]

    monkeypatch.setattr(rag, "embed_query", fake_embed_query)
    monkeypatch.setattr(rag.db, "fetch_all", fake_fetch_all)

    import asyncio

    chunks = asyncio.run(
        rag.query_forestry(
            "croissance okoume", top_k=3, species="Aucoumea klaineana", soil_type="clay"
        )
    )

    vector_sql = [
        sql for sql, _ in calls if "FROM rag_documents" in sql and "content_tsv" not in sql
    ]
    assert any("species = $2 OR species = '*'" in sql for sql in vector_sql)
    assert any("soil_type = $3 OR soil_type IS NULL" in sql for sql in vector_sql)
    assert any("content_tsv @@ plainto_tsquery('simple', $1)" in sql for sql, _ in calls)
    # vector args: embedding, species, soil, candidates(3*4)
    vec_args = next(
        args for sql, args in calls if "FROM rag_documents" in sql and "content_tsv" not in sql
    )
    assert vec_args[1] == "Aucoumea klaineana"
    assert vec_args[3] == 3 * rag.CANDIDATE_MULTIPLIER
    assert chunks[0].id == "species_aucoumea_klaineana"
    assert chunks[0].metadata["species"] == "Aucoumea klaineana"
    assert chunks[0].score == 0.91


def test_query_circular_economy_hybrid_maps_legal_reference(monkeypatch):
    calls: list[tuple[str, tuple]] = []

    def fake_embed_query(text):
        return [0.0] * 384

    row = {
        "id": "legal_paris_article_6",
        "content": "Paris Art 6 avoided methane",
        "source": "UNFCCC Paris Agreement Art. 6",
        "doc_type": None,
        "legal_framework_reference": "paris_art6",
        "metadata": "{}",
        "score": 0.88,
    }

    async def fake_fetch_all(sql, *args):
        calls.append((sql, args))
        if "content_tsv" in sql:
            return [{"id": "legal_paris_article_6", "rank": 0.5}]
        return [row]

    monkeypatch.setattr(rag, "embed_query", fake_embed_query)
    monkeypatch.setattr(rag.db, "fetch_all", fake_fetch_all)

    import asyncio

    chunks = asyncio.run(
        rag.query_circular_economy(
            "branches biochar", top_k=3, residue_type="branches", species="Aucoumea klaineana"
        )
    )
    circular_sql = [sql for sql, _ in calls if "FROM circular_economy_knowledge" in sql]
    assert any("residue_type = $2 OR residue_type = 'mixed'" in sql for sql in circular_sql)
    assert any(
        "species_target = $3 OR species_target = '*' OR species_target IS NULL" in sql
        for sql in circular_sql
    )
    assert chunks[0].doc_type == "protocol"  # falls back when column is NULL
    assert chunks[0].metadata["legal_framework_reference"] == "paris_art6"
    assert isinstance(chunks[0].metadata, dict)


def test_retrieved_chunk_defaults():
    chunk = rag.RetrievedChunk(id="x", content="c", source="s", doc_type="species")
    assert chunk.score is None
    assert chunk.metadata is None


def test_knowledge_endpoints(monkeypatch):
    from app.api import knowledge

    async def fake_forestry(query, top_k=5, species=None, soil_type=None):
        return [
            rag.RetrievedChunk(
                id="species_aucoumea_klaineana",
                content="Okoume",
                source="congo.json",
                doc_type="species",
                score=0.9,
                metadata={"species": "Aucoumea klaineana"},
            )
        ]

    async def fake_stats():
        return {"forestry": 19, "circular": 15}

    monkeypatch.setattr(knowledge.rag, "query_forestry", fake_forestry)
    monkeypatch.setattr(knowledge.rag, "corpus_stats", fake_stats)

    client = TestClient(app)
    resp = client.get("/api/knowledge/search", params={"q": "okoume", "store": "forestry"})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["results"][0]["source"] == "congo.json"

    resp2 = client.get("/api/knowledge/stats")
    assert resp2.status_code == 200
    assert resp2.json() == {"forestry": 19, "circular": 15}
