-- =====================================================================
-- Phase 4 (Slice 7) — Certifications tierces (FSC / PAFC / PEFC / OLB /
-- LS / TLV). The `certifications` table was seeded in 009_gouvernance.sql
-- but never driven by any workflow. This slice turns it into a full
-- declaration → verification cycle: a company declares a certificate
-- (soumis), the Ministry verifies (actif) or rejects it (rejete), and an
-- active certificate expires when valid_to has passed (derived at read,
-- like tax_dues). Additive, idempotent.
-- =====================================================================

-- 1. Allow the workflow states 'soumis' and 'rejete' in addition to the
--    lifecycle states actif|suspendu|expire.
ALTER TABLE certifications DROP CONSTRAINT IF EXISTS certifications_status_check;
ALTER TABLE certifications
    ADD CONSTRAINT certifications_status_check
    CHECK (status IN ('soumis', 'actif', 'suspendu', 'expire', 'rejete'));

-- 2. Audit trail of the declaration / verification.
ALTER TABLE certifications
    ADD COLUMN IF NOT EXISTS declared_by INTEGER
        REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE certifications
    ADD COLUMN IF NOT EXISTS verified_by INTEGER
        REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE certifications
    ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
ALTER TABLE certifications
    ADD COLUMN IF NOT EXISTS decision_motif TEXT;

CREATE INDEX IF NOT EXISTS idx_cert_status ON certifications (status);
CREATE INDEX IF NOT EXISTS idx_cert_scheme ON certifications (scheme);
