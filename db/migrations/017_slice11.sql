-- =====================================================================
-- Phase 4 (Slice 11) — Études environnementales (PPF / EIE) & certificat
-- de conformité (Loi 016/01 ; Loi 007/2014)
--
-- An environmental assessment is a precondition to producing a forest
-- concession. Two legal instruments were missing from the domain:
--   * PPF  — Plan de Protection de la Faune (DGFAP), an annex to the plan
--            de gestion, revised every 5 years; and
--   * EIE  — Étude d'Impact Environnemental (DGE), annual validity.
-- The operator deposits the study, the administration approves it (or
-- rejects it, motivated) and issues a certificat de conformité. One row per
-- study keeps a full, auditable history per title.
--
-- Additive, idempotent: safe to re-run against a live volume.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Environmental studies of a title — study_type ppf|eie, the deposit
--    and validity dates, and the certificat de conformité stamped on the
--    study it certifies (ref + date + author). submitted_by/decided_by are
--    the operator/administration audit trail.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS environmental_studies (
    id                    SERIAL PRIMARY KEY,
    title_id              INTEGER NOT NULL REFERENCES forest_titles(id) ON DELETE CASCADE,
    study_type            TEXT NOT NULL
                          CHECK (study_type IN ('ppf','eie')),
    reference             TEXT NOT NULL,
    authority             TEXT,
    conducted_at          DATE,
    valid_from            DATE,
    valid_to              DATE,
    status                TEXT NOT NULL DEFAULT 'soumis'
                          CHECK (status IN ('soumis','valide','rejete')),
    certificate_ref       TEXT,
    certificate_issued_at DATE,
    certificate_issued_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    decision_motif        TEXT,
    submitted_by          INTEGER REFERENCES users(id) ON DELETE SET NULL,
    decided_by            INTEGER REFERENCES users(id) ON DELETE SET NULL,
    decided_at            TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (title_id, study_type, reference)
);

CREATE INDEX IF NOT EXISTS idx_studies_title ON environmental_studies (title_id);
CREATE INDEX IF NOT EXISTS idx_studies_status ON environmental_studies (status);
CREATE INDEX IF NOT EXISTS idx_studies_type ON environmental_studies (study_type);
