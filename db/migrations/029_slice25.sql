-- =====================================================================
-- Slice 25 — Coopérative : lien organisation ↔ coopérative communautaire
-- Un compte « coopérative » créé depuis la fiche d'une organisation est relié
-- à la coopérative communautaire (résidus, collecte) de cette organisation.
-- Idempotent : peut être rejoué sur une base existante.
-- =====================================================================

ALTER TABLE community_cooperatives
    ADD COLUMN IF NOT EXISTS organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_community_cooperatives_org
    ON community_cooperatives (organization_id) WHERE organization_id IS NOT NULL;

-- Agents créés depuis la fiche d'une organisation : rattachement au compte
-- entreprise de l'organisation (lien historique users.company_id utilisé par
-- l'accueil, le groupe, le carnet DF10 et le scanner).
UPDATE users op
   SET company_id = (
       SELECT min(c.id) FROM users c
        WHERE c.organization_id = op.organization_id AND c.role = 'company' AND c.is_active)
 WHERE op.role = 'operator'
   AND op.company_id IS NULL
   AND op.organization_id IS NOT NULL
   AND EXISTS (SELECT 1 FROM users c WHERE c.organization_id = op.organization_id
                AND c.role = 'company' AND c.is_active);
