"""Ingest the curated knowledge/ corpus into pgvector tables.

Usage:
    python -m ingestion.ingest            # embed + upsert everything
    python -m ingestion.ingest --dry-run  # parse only, no DB / no model

Mapping:
    knowledge/species/*   -> rag_documents        (doc_type='species')
    knowledge/equations/* -> rag_documents        (doc_type='equation')
    knowledge/protocols/* -> circular_economy_knowledge
    knowledge/legal/*     -> circular_economy_knowledge
"""

import argparse
import asyncio
import json
import sys
from pathlib import Path

KNOWLEDGE_DIR = Path(__file__).resolve().parent.parent / "knowledge"

# subdir -> (target_table, doc_type for rag_documents)
SUBDIR_MAP = {
    "species": ("rag_documents", "species"),
    "equations": ("rag_documents", "equation"),
    "protocols": ("circular_economy_knowledge", None),
    "legal": ("circular_economy_knowledge", None),
}


def load_corpus(root: Path = KNOWLEDGE_DIR) -> list[dict]:
    """Parse knowledge JSON files into normalized rows."""
    rows: list[dict] = []
    for subdir, (table, doc_type) in SUBDIR_MAP.items():
        dir_path = root / subdir
        if not dir_path.exists():
            continue
        for path in sorted(dir_path.glob("*.json")):
            entries = json.loads(path.read_text(encoding="utf-8"))
            for entry in entries:
                meta = entry.get("metadata", {})
                row = {
                    "table": table,
                    "id": entry["id"],
                    "content": entry["content"],
                    "source": meta.get("source", f"knowledge/{subdir}/{path.name}"),
                    "metadata": meta,
                }
                if table == "rag_documents":
                    row["doc_type"] = doc_type
                    row["species"] = meta.get("species")
                    row["residue_type"] = meta.get("residue_type")
                    row["language"] = meta.get("language", "en")
                else:
                    row["residue_type"] = meta.get("residue_type", "mixed")
                    row["species_target"] = meta.get("species")
                    row["transformation_technology"] = meta.get("transformation_technology")
                    row["legal_framework_reference"] = meta.get("legal_framework_reference")
                    row["language"] = meta.get("language", "en")
                rows.append(row)
    return rows


def _upsert_sql(table: str) -> str:
    if table == "rag_documents":
        return """
            INSERT INTO rag_documents (id, content, embedding, doc_type, species,
                                       residue_type, language, source, metadata)
            VALUES ($1, $2, $3::vector, $4, $5, $6, $7, $8, $9::jsonb)
            ON CONFLICT (id) DO UPDATE SET
                content = EXCLUDED.content, embedding = EXCLUDED.embedding,
                doc_type = EXCLUDED.doc_type, species = EXCLUDED.species,
                residue_type = EXCLUDED.residue_type, language = EXCLUDED.language,
                source = EXCLUDED.source, metadata = EXCLUDED.metadata
        """
    return """
        INSERT INTO circular_economy_knowledge (id, content, embedding, residue_type,
                                                species_target, transformation_technology,
                                                legal_framework_reference, language,
                                                source, metadata)
        VALUES ($1, $2, $3::vector, $4, $5, $6, $7, $8, $9, $10::jsonb)
        ON CONFLICT (id) DO UPDATE SET
            content = EXCLUDED.content, embedding = EXCLUDED.embedding,
            residue_type = EXCLUDED.residue_type, species_target = EXCLUDED.species_target,
            transformation_technology = EXCLUDED.transformation_technology,
            legal_framework_reference = EXCLUDED.legal_framework_reference,
            language = EXCLUDED.language, source = EXCLUDED.source,
            metadata = EXCLUDED.metadata
    """


async def ingest(dry_run: bool = False) -> int:
    rows = load_corpus()
    print(f"corpus: {len(rows)} documents from {KNOWLEDGE_DIR}")
    if dry_run:
        for r in rows:
            print(f"  [{r['table']}] {r['id']} ({len(r['content'])} chars)")
        return len(rows)

    from app.services import db
    from app.services.rag import embed_texts

    contents = [r["content"] for r in rows]
    print("embedding ...")
    embeddings = embed_texts(contents)

    for row, emb in zip(rows, embeddings, strict=True):
        sql = _upsert_sql(row["table"])
        if row["table"] == "rag_documents":
            args = (
                row["id"],
                row["content"],
                str(emb),
                row["doc_type"],
                row["species"],
                row["residue_type"],
                row["language"],
                row["source"],
                json.dumps(row["metadata"]),
            )
        else:
            args = (
                row["id"],
                row["content"],
                str(emb),
                row["residue_type"],
                row["species_target"],
                row["transformation_technology"],
                row["legal_framework_reference"],
                row["language"],
                row["source"],
                json.dumps(row["metadata"]),
            )
        await db.execute(sql, *args)

    await db.close_pool()
    print(f"ingested {len(rows)} documents")
    return len(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="parse corpus without DB/embeddings")
    args = parser.parse_args()
    count = asyncio.run(ingest(dry_run=args.dry_run))
    sys.exit(0 if count > 0 else 1)


if __name__ == "__main__":
    main()
