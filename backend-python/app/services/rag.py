"""LlamaIndex + pgvector retrieval layer.

Embeddings: intfloat/multilingual-e5-small (384-dim, FR+EN) run locally
via sentence-transformers; generation delegated to Groq.
Two stores: rag_documents (Phase 1 forestry) and
circular_economy_knowledge (Phase 2 residue valorization).

Retrieval is hybrid: dense (pgvector cosine) and lexical (PostgreSQL
full-text, ``content_tsv``) candidate lists are fused with Reciprocal Rank
Fusion (RRF). This recovers exact-term matches (species names, legal codes
such as ``loi_016_01`` or ``CITES``) that pure embeddings can miss. If the
``content_tsv`` column is absent (pre-migration database), lexical search is
skipped and the layer degrades gracefully to dense-only.
"""

from dataclasses import dataclass

from app.config import get_settings
from app.services import db

# RRF constant (Cormack et al. 2009); larger k flattens the rank weighting.
RRF_K = 60
# How many candidates each retriever contributes before fusion.
CANDIDATE_MULTIPLIER = 4


@dataclass
class RetrievedChunk:
    id: str
    content: str
    source: str
    doc_type: str
    score: float | None = None
    metadata: dict | None = None


_embedder = None


def _get_embedder():
    global _embedder
    if _embedder is None:
        from sentence_transformers import SentenceTransformer

        _embedder = SentenceTransformer(get_settings().embedding_model)
    return _embedder


def embed_texts(texts: list[str]) -> list[list[float]]:
    model = _get_embedder()
    # e5 models expect a task prefix for retrieval vs documents
    prefixed = [f"passage: {t}" for t in texts]
    embeddings = model.encode(prefixed, normalize_embeddings=True)
    return embeddings.tolist()


def embed_query(text: str) -> list[float]:
    model = _get_embedder()
    vector = model.encode(f"query: {text}", normalize_embeddings=True)
    return vector.tolist()


def _build_where(filters: list[tuple[str, object]], start: int) -> tuple[str, list]:
    """Assemble an AND-joined predicate (no WHERE keyword) starting at $start."""
    if not filters:
        return "", []
    args: list = []
    fragments: list[str] = []
    idx = start
    for template, value in filters:
        fragments.append(template.format(i=idx))
        args.append(value)
        idx += 1
    return " AND ".join(fragments), args


def rrf_fuse(*ranked_id_lists: list[str], k: int = RRF_K) -> list[str]:
    """Reciprocal Rank Fusion of several ranked id lists -> fused ranking."""
    scores: dict[str, float] = {}
    for ids in ranked_id_lists:
        for rank, doc_id in enumerate(ids, start=1):
            scores[doc_id] = scores.get(doc_id, 0.0) + 1.0 / (k + rank)
    return sorted(scores, key=lambda doc_id: scores[doc_id], reverse=True)


async def _lexical_ids(
    table: str, cond: str, filter_args: list, query: str, limit: int
) -> list[str]:
    """Full-text candidate ids; empty list if content_tsv is unavailable."""
    if not query.strip():
        return []
    predicate = "content_tsv @@ plainto_tsquery('simple', $1)"
    clause = f"WHERE ({cond}) AND {predicate}" if cond else f"WHERE {predicate}"
    sql = f"""
        SELECT id, ts_rank(content_tsv, plainto_tsquery('simple', $1)) AS rank
        FROM {table}
        {clause}
        ORDER BY rank DESC
        LIMIT ${len(filter_args) + 2}
    """
    try:
        rows = await db.fetch_all(sql, query, *filter_args, limit)
    except Exception:
        return []
    return [r["id"] for r in rows]


async def _hybrid_rows(
    table: str,
    select_cols: str,
    filters: list[tuple[str, object]],
    query: str,
    embedding: list[float],
    top_k: int,
):
    """Return full rows ordered by RRF over dense + lexical candidates."""
    candidates = max(top_k * CANDIDATE_MULTIPLIER, top_k)
    cond, filter_args = _build_where(filters, start=2)
    where = f"WHERE {cond}" if cond else ""

    vec_sql = f"""
        SELECT {select_cols}, 1 - (embedding <=> $1::vector) AS score
        FROM {table}
        {where}
        ORDER BY embedding <=> $1::vector
        LIMIT ${len(filter_args) + 2}
    """
    vec_rows = await db.fetch_all(vec_sql, str(embedding), *filter_args, candidates)
    vec_ids = [r["id"] for r in vec_rows]

    lex_ids = await _lexical_ids(table, cond, filter_args, query, candidates)
    fused = rrf_fuse(vec_ids, lex_ids)[:top_k]
    if not fused:
        return []

    fetch_sql = f"""
        SELECT {select_cols}, 1 - (embedding <=> $1::vector) AS score
        FROM {table}
        WHERE id = ANY($2::text[])
    """
    rows = await db.fetch_all(fetch_sql, str(embedding), fused)
    by_id = {r["id"]: r for r in rows}
    return [by_id[doc_id] for doc_id in fused if doc_id in by_id]


def _chunks_forestry(rows) -> list[RetrievedChunk]:
    return [
        RetrievedChunk(
            id=r["id"],
            content=r["content"],
            source=r["source"],
            doc_type=r["doc_type"],
            score=float(r["score"]),
            metadata=_parse_jsonb(r["metadata"]),
        )
        for r in rows
    ]


def _chunks_circular(rows) -> list[RetrievedChunk]:
    return [
        RetrievedChunk(
            id=r["id"],
            content=r["content"],
            source=r["source"],
            doc_type=r["doc_type"] or "protocol",
            score=float(r["score"]),
            metadata={
                **(_parse_jsonb(r["metadata"])),
                "legal_framework_reference": r["legal_framework_reference"],
            },
        )
        for r in rows
    ]


async def query_forestry(
    query: str,
    top_k: int = 5,
    species: str | None = None,
    soil_type: str | None = None,
) -> list[RetrievedChunk]:
    """Phase 1 RAG: growth models, species profiles, equations."""
    embedding = embed_query(query)
    filters: list[tuple[str, object]] = []
    if species:
        filters.append(("(species = ${i} OR species = '*')", species))
    if soil_type:
        filters.append(("(soil_type = ${i} OR soil_type IS NULL)", soil_type))
    rows = await _hybrid_rows(
        "rag_documents",
        "id, content, source, doc_type, metadata",
        filters,
        query,
        embedding,
        top_k,
    )
    return _chunks_forestry(rows)


async def query_circular_economy(
    query: str,
    top_k: int = 5,
    residue_type: str | None = None,
    species: str | None = None,
) -> list[RetrievedChunk]:
    """Phase 2 RAG: transformation protocols + legal frameworks."""
    embedding = embed_query(query)
    filters: list[tuple[str, object]] = []
    if residue_type:
        filters.append(("(residue_type = ${i} OR residue_type = 'mixed')", residue_type))
    if species:
        filters.append(
            ("(species_target = ${i} OR species_target = '*' OR species_target IS NULL)", species)
        )
    rows = await _hybrid_rows(
        "circular_economy_knowledge",
        "id, content, source, transformation_technology AS doc_type, "
        "legal_framework_reference, metadata",
        filters,
        query,
        embedding,
        top_k,
    )
    return _chunks_circular(rows)


async def corpus_stats() -> dict:
    """Document counts per store (used by the knowledge endpoint / ops)."""
    row = await db.fetch_one(
        """
        SELECT
          (SELECT count(*) FROM rag_documents) AS forestry,
          (SELECT count(*) FROM circular_economy_knowledge) AS circular
        """
    )
    return {"forestry": row["forestry"], "circular": row["circular"]}


def _parse_jsonb(value) -> dict:
    """asyncpg returns json/jsonb columns as text unless a codec is set."""
    import json

    if isinstance(value, dict):
        return value
    if not value:
        return {}
    try:
        return json.loads(value)
    except (TypeError, ValueError):
        return {}
