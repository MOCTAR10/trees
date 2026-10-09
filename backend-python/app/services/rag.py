"""LlamaIndex + pgvector retrieval layer.

Embeddings: intfloat/multilingual-e5-small (384-dim, FR+EN) run locally
via sentence-transformers; generation delegated to Groq.
Two stores: rag_documents (Phase 1 forestry) and
circular_economy_knowledge (Phase 2 residue valorization).
"""

from dataclasses import dataclass

from app.config import get_settings
from app.services import db


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


async def query_forestry(
    query: str,
    top_k: int = 5,
    species: str | None = None,
    soil_type: str | None = None,
) -> list[RetrievedChunk]:
    """Phase 1 RAG: growth models, species profiles, equations."""
    embedding = embed_query(query)
    filters, args = [], []
    if species:
        args.append(species)
        filters.append(f"(species = ${len(args) + 1} OR species = '*')")
    if soil_type:
        args.append(soil_type)
        filters.append(f"(soil_type = ${len(args) + 1} OR soil_type IS NULL)")
    where = ("WHERE " + " AND ".join(filters)) if filters else ""

    sql = f"""
        SELECT id, content, source, doc_type, metadata,
               1 - (embedding <=> $1::vector) AS score
        FROM rag_documents
        {where}
        ORDER BY embedding <=> $1::vector
        LIMIT ${len(args) + 2}
    """
    rows = await db.fetch_all(sql, str(embedding), *args, top_k)
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


async def query_circular_economy(
    query: str,
    top_k: int = 5,
    residue_type: str | None = None,
    species: str | None = None,
) -> list[RetrievedChunk]:
    """Phase 2 RAG: transformation protocols + legal frameworks."""
    embedding = embed_query(query)
    filters, args = [], []
    if residue_type:
        args.append(residue_type)
        filters.append(f"(residue_type = ${len(args) + 1} OR residue_type = 'mixed')")
    if species:
        args.append(species)
        filters.append(
            f"(species_target = ${len(args) + 1} OR species_target = '*' OR species_target IS NULL)"
        )
    where = ("WHERE " + " AND ".join(filters)) if filters else ""

    sql = f"""
        SELECT id, content, source, transformation_technology AS doc_type,
               legal_framework_reference, metadata,
               1 - (embedding <=> $1::vector) AS score
        FROM circular_economy_knowledge
        {where}
        ORDER BY embedding <=> $1::vector
        LIMIT ${len(args) + 2}
    """
    rows = await db.fetch_all(sql, str(embedding), *args, top_k)
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
