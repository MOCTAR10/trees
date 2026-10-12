-- =====================================================================
-- Phase 3 (slice 4) — Traçabilité: carnet de chantier (DF10) + transport
-- Additive and idempotent: safe to re-run against a live volume.
--   * tree_registry: conventional abandonment code + DF10 notes
--   * transport_documents: scope (title/AAC) + carrier/vehicle fields
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. DF10 (carnet de chantier) fields on the stem registry.
--    A marked stem that is not felled carries a conventional abandonment
--    code (Loi 016/01 art. 130-133). ``felled_at`` / ``df10_entry_no`` /
--    ``stump_geom`` already exist (migration 009) and are populated when
--    the ``abattu`` custody event fires.
-- ---------------------------------------------------------------------
ALTER TABLE tree_registry
    ADD COLUMN IF NOT EXISTS abandon_code TEXT,
    ADD COLUMN IF NOT EXISTS df10_notes TEXT;

CREATE INDEX IF NOT EXISTS idx_registry_company ON tree_registry (company_id);
CREATE INDEX IF NOT EXISTS idx_registry_title ON tree_registry (title_id);
CREATE INDEX IF NOT EXISTS idx_registry_felled_at ON tree_registry (felled_at);
CREATE INDEX IF NOT EXISTS idx_registry_df10_no ON tree_registry (df10_entry_no);

-- ---------------------------------------------------------------------
-- 2. Scope + carrier metadata for transport documents.
-- ---------------------------------------------------------------------
ALTER TABLE transport_documents
    ADD COLUMN IF NOT EXISTS title_id INTEGER REFERENCES forest_titles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS aac_id INTEGER REFERENCES annual_cut_blocks(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS transporter TEXT,
    ADD COLUMN IF NOT EXISTS vehicle_ref TEXT;

CREATE INDEX IF NOT EXISTS idx_transport_title ON transport_documents (title_id);
