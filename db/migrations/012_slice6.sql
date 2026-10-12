-- =====================================================================
-- Phase 4 (Slice 6) — Autorisation d'exploiter (Loi 016/01, art. 14)
-- Completes aac_authorizations: the four TTP authorizations
-- (certificat annuel d'assiette de coupe, permis annuel d'opérations,
-- certificat de vente de coupe, CAE) are now listable and decidable, and
-- the mandatory pre-start notification ("notification de démarrage des
-- activités") is recorded. Additive, idempotent.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Decision + start-notification audit trail on the existing table.
--    status already supports soumis|delivre|rejete; we add the rejection
--    justification and who notified the start of activities.
-- ---------------------------------------------------------------------
ALTER TABLE aac_authorizations
    ADD COLUMN IF NOT EXISTS decision_motif      TEXT;
ALTER TABLE aac_authorizations
    ADD COLUMN IF NOT EXISTS startup_notified_by INTEGER
        REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_aacauth_status ON aac_authorizations (status);
