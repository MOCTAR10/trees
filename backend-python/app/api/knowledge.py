"""Knowledge corpus endpoints: hybrid search + stats (read-only)."""

from fastapi import APIRouter, Query

from app.services import rag

router = APIRouter()


@router.get("/search")
async def search(
    q: str = Query(..., min_length=2, description="Natural-language query"),
    store: str = Query("forestry", pattern="^(forestry|circular)$"),
    top_k: int = Query(5, ge=1, le=20),
    species: str | None = None,
    residue_type: str | None = None,
):
    """Hybrid (dense + lexical) search over the embedded corpus."""
    if store == "forestry":
        chunks = await rag.query_forestry(q, top_k=top_k, species=species)
    else:
        chunks = await rag.query_circular_economy(
            q, top_k=top_k, residue_type=residue_type, species=species
        )
    return {
        "query": q,
        "store": store,
        "results": [
            {
                "id": c.id,
                "content": c.content,
                "source": c.source,
                "doc_type": c.doc_type,
                "score": c.score,
                "legal_framework_reference": (c.metadata or {}).get("legal_framework_reference"),
            }
            for c in chunks
        ],
    }


@router.get("/stats")
async def stats():
    """Document counts per corpus table."""
    return await rag.corpus_stats()
