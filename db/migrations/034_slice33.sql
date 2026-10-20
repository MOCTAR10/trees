-- =====================================================================
-- Slice 33 — Espace coopérative : membres, profil réglementaire.
-- A cooperative groups member organisations (small operators, communities)
-- that keep their own titles and obligations. Additive and idempotent.
-- =====================================================================

CREATE TABLE IF NOT EXISTS cooperative_memberships (
    id                  SERIAL PRIMARY KEY,
    cooperative_org_id  INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    member_org_id       INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    status              TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'suspendue', 'sortie')),
    joined_on           DATE NOT NULL DEFAULT CURRENT_DATE,
    left_on             DATE,
    status_reason       TEXT,
    notes               TEXT,
    added_by            INTEGER REFERENCES users(id) ON DELETE SET NULL,
    added_via           TEXT NOT NULL DEFAULT 'cooperative'
                        CHECK (added_via IN ('cooperative', 'ministere')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT coop_membership_not_self CHECK (cooperative_org_id <> member_org_id),
    CONSTRAINT coop_membership_left CHECK ((status = 'sortie') = (left_on IS NOT NULL)),
    CONSTRAINT coop_membership_dates CHECK (left_on IS NULL OR left_on >= joined_on)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_coop_membership_open
    ON cooperative_memberships (cooperative_org_id, member_org_id)
    WHERE status <> 'sortie';
CREATE INDEX IF NOT EXISTS idx_coop_membership_coop ON cooperative_memberships (cooperative_org_id);
CREATE INDEX IF NOT EXISTS idx_coop_membership_member ON cooperative_memberships (member_org_id);

-- Documents of a cooperative: legal list « à valider par le métier » (never blocking).
INSERT INTO document_types (code, label, scope_type, authority, validity_months, default_blocking, legal_ref) VALUES
    ('statuts_cooperative', 'Statuts de la société coopérative', 'company', 'Assemblée générale constitutive', NULL, FALSE, 'Acte uniforme OHADA (sociétés coopératives) — à valider par le métier'),
    ('immatriculation_rscoop', 'Immatriculation au Registre des sociétés coopératives', 'company', 'Greffe / registre des sociétés coopératives', NULL, FALSE, 'Acte uniforme OHADA (sociétés coopératives) — à valider par le métier'),
    ('registre_membres_cooperative', 'Registre des membres de la coopérative', 'company', 'Coopérative', NULL, FALSE, 'Acte uniforme OHADA (sociétés coopératives) — à valider par le métier'),
    ('pv_ag_constitutive', 'PV de l''assemblée générale constitutive', 'company', 'Coopérative', NULL, FALSE, 'Acte uniforme OHADA (sociétés coopératives) — à valider par le métier')
ON CONFLICT (code) DO UPDATE SET
    label = EXCLUDED.label,
    scope_type = EXCLUDED.scope_type,
    authority = EXCLUDED.authority,
    validity_months = EXCLUDED.validity_months,
    default_blocking = EXCLUDED.default_blocking,
    legal_ref = EXCLUDED.legal_ref;

INSERT INTO org_profiles (code, label, org_type, activities, allowed_title_types, doc_required, enabled_modules, obligations, description) VALUES
    ('cooperative_forestiere', 'Coopérative forestière', 'cooperative',
     ARRAY['regroupement','valorisation_residus'], ARRAY[]::TEXT[],
     ARRAY['statuts_cooperative','immatriculation_rscoop','registre_membres_cooperative','pv_ag_constitutive'],
     ARRAY['members','aggregation','residues','documents'],
     '{"ccc": false, "fdl": false, "ppf": false, "eie": false, "pi_pdi": false, "a_valider_par_le_metier": true}'::jsonb,
     'Regroupe des organisations membres (petits exploitants, communautés) qui gardent leurs titres et leurs obligations ; liste de pièces à valider par le métier.')
ON CONFLICT (code) DO UPDATE SET
    label = EXCLUDED.label,
    org_type = EXCLUDED.org_type,
    activities = EXCLUDED.activities,
    allowed_title_types = EXCLUDED.allowed_title_types,
    doc_required = EXCLUDED.doc_required,
    enabled_modules = EXCLUDED.enabled_modules,
    obligations = EXCLUDED.obligations,
    description = EXCLUDED.description;

UPDATE organizations SET profile_code = 'cooperative_forestiere'
WHERE org_type = 'cooperative' AND profile_code IS NULL;

INSERT INTO legal_documents (scope_type, scope_id, doc_type, status)
SELECT 'company', o.id, d.code, 'manquant'
FROM organizations o
CROSS JOIN unnest(ARRAY['statuts_cooperative','immatriculation_rscoop',
                        'registre_membres_cooperative','pv_ag_constitutive']) AS d(code)
WHERE o.profile_code = 'cooperative_forestiere'
  AND NOT EXISTS (
      SELECT 1 FROM legal_documents l
      WHERE l.scope_type = 'company' AND l.scope_id = o.id AND l.doc_type = d.code
  );
