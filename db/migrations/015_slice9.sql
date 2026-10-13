-- =====================================================================
-- Phase 4 (Slice 9) — DME/UFA (Loi 016/01, art. 124)
-- Official minimum exploitable diameters fixed per species _per UFA_ by
-- arrêté. Until an entry exists the app falls back to the provisional
-- literature defaults of app/core/dme.py (origin reported explicitly).
-- Additive, idempotent: safe to re-run against a live volume.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Per-UFA DME matrix — one row per (UFA, species).
--    source keeps the legal provenance (arrêté n°, plan d'aménagement…);
--    decided_by/decided_at are the Ministry audit trail.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ufa_dme (
    id                      SERIAL PRIMARY KEY,
    ufa_id                  INTEGER NOT NULL REFERENCES management_units(id) ON DELETE CASCADE,
    species_scientific_name TEXT NOT NULL,
    dme_cm                  DOUBLE PRECISION NOT NULL CHECK (dme_cm > 0),
    source                  TEXT,
    decided_by              INTEGER REFERENCES users(id) ON DELETE SET NULL,
    decided_at              TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (ufa_id, species_scientific_name)
);

CREATE INDEX IF NOT EXISTS idx_ufa_dme_ufa ON ufa_dme (ufa_id);

-- ---------------------------------------------------------------------
-- 2. Declaration lines remember which DME applied (and its origin), so
--    a below-DME control can be explained after the arrêté changes.
-- ---------------------------------------------------------------------
ALTER TABLE declaration_lines
    ADD COLUMN IF NOT EXISTS dme_source TEXT;
