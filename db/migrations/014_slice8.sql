-- =====================================================================
-- Phase 4 (Slice 8) — Anomalies étendues & tableau de bord Ministère
-- anomaly_reviews (acknowledgement register) + support indexes.
-- Additive, idempotent: safe to re-run against a live volume.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Anomaly register — the review of a detected anomaly.
--    Detection itself is derived at read time from existing tables
--    (declarations, registry, documents, taxes, transport); this table
--    only persists what the Ministry decided about it:
--      ouverte → not reviewed yet (also the implicit state, no row)
--      traitee → reviewed, corrective action recorded
--      ecartee → dismissed, a justification (motif) is mandatory
--    The (anomaly_type, subject_key) pair is the derived anomaly's stable
--    identity, so a review survives re-scans.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS anomaly_reviews (
    id             SERIAL PRIMARY KEY,
    anomaly_type   TEXT NOT NULL,
    subject_key    TEXT NOT NULL,
    title_id       INTEGER REFERENCES forest_titles(id) ON DELETE SET NULL,
    aac_id         INTEGER REFERENCES annual_cut_blocks(id) ON DELETE SET NULL,
    org_id         INTEGER REFERENCES organizations(id) ON DELETE SET NULL,
    status         TEXT NOT NULL DEFAULT 'ouverte'
                   CHECK (status IN ('ouverte','traitee','ecartee')),
    decision_motif TEXT,
    reviewed_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at    TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (anomaly_type, subject_key)
);

CREATE INDEX IF NOT EXISTS idx_anomaly_reviews_status ON anomaly_reviews (status);
CREATE INDEX IF NOT EXISTS idx_anomaly_reviews_type ON anomaly_reviews (anomaly_type);

-- ---------------------------------------------------------------------
-- 2. Indexes supporting the extended anomaly sweep and the dashboard
--    aggregations (documents expiring, taxes overdue, status rollups).
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_docs_expires ON legal_documents (expires_at);
CREATE INDEX IF NOT EXISTS idx_registry_status ON tree_registry (status);
CREATE INDEX IF NOT EXISTS idx_transport_status ON transport_documents (status);
CREATE INDEX IF NOT EXISTS idx_ccc_status ON community_agreements (status);
