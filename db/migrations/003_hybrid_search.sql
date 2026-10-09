-- =====================================================================
-- Phase 3 — Hybrid retrieval support
-- Generated tsvector columns + GIN indexes enable lexical (full-text)
-- search fused with pgvector dense search via Reciprocal Rank Fusion.
-- 'simple' configuration is used deliberately: the corpus mixes French
-- and English, so language-specific stemming would be inconsistent.
-- =====================================================================

ALTER TABLE rag_documents
    ADD COLUMN IF NOT EXISTS content_tsv tsvector
    GENERATED ALWAYS AS (to_tsvector('simple', coalesce(content, ''))) STORED;

CREATE INDEX IF NOT EXISTS idx_rag_content_tsv ON rag_documents USING GIN (content_tsv);

ALTER TABLE circular_economy_knowledge
    ADD COLUMN IF NOT EXISTS content_tsv tsvector
    GENERATED ALWAYS AS (to_tsvector('simple', coalesce(content, ''))) STORED;

CREATE INDEX IF NOT EXISTS idx_cek_content_tsv
    ON circular_economy_knowledge USING GIN (content_tsv);
