-- =====================================================================
-- Phase 4 (Slice 10) — Conventions (provisoire / définitive) &
-- attestation de conformité (Loi 016/01)
--
-- The title lifecycle reaches 'provisoire' through the CPAET and 'actif'
-- only once the convention définitive is signed. The legal instruments
-- themselves (convention provisoire ≈ 3 ans, convention définitive ≈ 15 ans
-- renouvelable) and the attestation de conformité issued by the Ministry on
-- satisfactory completion were not represented. One row per convention keeps
-- a full, auditable history per title.
--
-- Additive, idempotent: safe to re-run against a live volume.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Conventions of a title — convention_type provisoire|definitive,
--    dates, surface and the legal reference. The attestation de conformité
--    is stamped on the convention it certifies (ref + date + author);
--    decided_by/decided_at are the Ministry audit trail.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS title_conventions (
    id                    SERIAL PRIMARY KEY,
    title_id              INTEGER NOT NULL REFERENCES forest_titles(id) ON DELETE CASCADE,
    convention_type       TEXT NOT NULL
                          CHECK (convention_type IN ('provisoire','definitive')),
    reference             TEXT NOT NULL,
    signed_at             DATE,
    start_date            DATE,
    end_date              DATE,
    surface_ha            DOUBLE PRECISION,
    status                TEXT NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active','expiree','resiliee')),
    attestation_ref       TEXT,
    attestation_issued_at DATE,
    attestation_issued_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    decision_motif        TEXT,
    decided_by            INTEGER REFERENCES users(id) ON DELETE SET NULL,
    decided_at            TIMESTAMPTZ,
    created_by            INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (title_id, reference)
);

CREATE INDEX IF NOT EXISTS idx_conventions_title ON title_conventions (title_id);
CREATE INDEX IF NOT EXISTS idx_conventions_status ON title_conventions (status);
