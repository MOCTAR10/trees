-- =====================================================================
-- Slice 13 — Entité légale : rattachement des comptes legacy
--             aux organisations (backfill ``organizations``).
--
-- Avant l'existence du registre ``organizations``, un compte ``company`` /
-- ``cooperative`` *était* l'entité légale : ``users.company_id`` s'auto-référence
-- vers ``users.id`` et aucun ``organization_id`` n'est porté. Ce slice introduit
-- la trace d'origine ``organizations.legacy_user_id``, qui rend le backfill
-- **idempotent** et **auditable** : chaque compte legacy non rattaché donne lieu
-- à une organisation marquée par son compte d'origine.
--
-- La migration n'ajoute que le socle ; le backfill lui-même est porté par
-- ``app/services/org_backfill.py`` (endpoint ``POST /api/organizations/backfill``
-- + CLI ``python -m tools.backfill_organizations``) afin de rester rejouable sur
-- un volume live. Additif et sûr.
-- =====================================================================

-- Compte d'origine d'une organisation issue d'un backfill (traçabilité).
ALTER TABLE organizations
    ADD COLUMN IF NOT EXISTS legacy_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- Une seule organisation par compte d'origine. ``NULL`` (organisations créées
-- normalement) échappe à l'index : PostgreSQL autorise plusieurs NULL dans un
-- index UNIQUE.
CREATE UNIQUE INDEX IF NOT EXISTS uq_organizations_legacy_user
    ON organizations (legacy_user_id);
