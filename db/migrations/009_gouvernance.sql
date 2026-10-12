-- =====================================================================
-- Phase 3 (slice 1) — Gouvernance forestière: organisations, titres, documents
-- organizations / org_profiles / document_types / legal_documents
-- forest_titles / management_units / annual_cut_blocks / aac_authorizations
-- tax_receipts / community_agreements / transport_documents / certifications
-- Idempotent: safe to re-run against a live volume.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Organizations: legal holder behind an account.
--    Unifies economic operators and forest communities (Loi 016/01 art. 156).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organizations (
    id              SERIAL PRIMARY KEY,
    org_type        TEXT NOT NULL
                    CHECK (org_type IN ('entreprise', 'communaute', 'cooperative')),
    name            TEXT NOT NULL,
    legal_form      TEXT,
    registration_no TEXT,
    tax_id          TEXT,
    email           TEXT,
    phone           TEXT,
    address         TEXT,
    geom            GEOMETRY(Point, 4326),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_org_type ON organizations (org_type);
CREATE INDEX IF NOT EXISTS idx_org_active ON organizations (is_active);

-- Bridge for existing accounts (kept alongside legacy users.company_id).
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS organization_id INTEGER
    REFERENCES organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_org ON users (organization_id);

-- ---------------------------------------------------------------------
-- 2. Presets: an org profile = capabilities + required documents + modules.
--    The Ministry picks a type at creation => zero manual configuration.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS org_profiles (
    code                TEXT PRIMARY KEY,
    label               TEXT NOT NULL,
    org_type            TEXT NOT NULL
                        CHECK (org_type IN ('entreprise', 'communaute', 'cooperative')),
    activities          TEXT[] NOT NULL DEFAULT '{}',
    allowed_title_types TEXT[] NOT NULL DEFAULT '{}',
    doc_required        TEXT[] NOT NULL DEFAULT '{}',
    enabled_modules     TEXT[] NOT NULL DEFAULT '{}',
    obligations         JSONB NOT NULL DEFAULT '{}'::jsonb,
    description         TEXT NOT NULL DEFAULT ''
);

-- An organization keeps the preset that generated its document checklist.
ALTER TABLE organizations
    ADD COLUMN IF NOT EXISTS profile_code TEXT
    REFERENCES org_profiles(code) ON DELETE SET NULL;

-- ---------------------------------------------------------------------
-- 3. Document dictionary (Timber Trade Portal "documents clés")
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS document_types (
    code             TEXT PRIMARY KEY,
    label            TEXT NOT NULL,
    scope_type       TEXT NOT NULL
                     CHECK (scope_type IN ('company','title','ufa','aac','product','social')),
    authority        TEXT,
    validity_months  INTEGER,
    default_blocking BOOLEAN NOT NULL DEFAULT FALSE,
    legal_ref        TEXT
);

-- ---------------------------------------------------------------------
-- 4. Document vault: uploaded files + verification status
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS legal_documents (
    id           SERIAL PRIMARY KEY,
    scope_type   TEXT NOT NULL
                 CHECK (scope_type IN ('company','title','ufa','aac','product','social')),
    scope_id     INTEGER,
    doc_type     TEXT REFERENCES document_types(code) ON DELETE SET NULL,
    authority    TEXT,
    reference    TEXT,
    issued_at    DATE,
    expires_at   DATE,
    file_url     TEXT,
    status       TEXT NOT NULL DEFAULT 'soumis'
                 CHECK (status IN ('manquant','soumis','valide','rejete','expire')),
    submitted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    verified_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    verified_at  TIMESTAMPTZ,
    notes        TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_docs_scope ON legal_documents (scope_type, scope_id);
CREATE INDEX IF NOT EXISTS idx_docs_status ON legal_documents (status);
CREATE INDEX IF NOT EXISTS idx_docs_type ON legal_documents (doc_type);

-- ---------------------------------------------------------------------
-- 5. Forest titles (CFAD / PFA / PGG / forêt communautaire)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS forest_titles (
    id                SERIAL PRIMARY KEY,
    title_type        TEXT NOT NULL
                      CHECK (title_type IN ('CFAD', 'PFA', 'PGG', 'FC')),
    reference         TEXT,
    holder_org_id     INTEGER REFERENCES organizations(id) ON DELETE SET NULL,
    zone              TEXT NOT NULL DEFAULT 'permanent'
                      CHECK (zone IN ('permanent', 'rural')),
    surface_ha        DOUBLE PRECISION,
    geom              GEOMETRY(Polygon, 4326),
    status            TEXT NOT NULL DEFAULT 'demande'
                      CHECK (status IN ('demande','exploration','provisoire',
                                        'actif','expire','retire','rejete')),
    exploration_start DATE,
    exploration_end   DATE,
    cpaet_start       DATE,
    cpaet_end         DATE,
    pa_approved_at    DATE,
    grant_ref         TEXT,
    grant_date        DATE,
    created_by        INTEGER REFERENCES users(id) ON DELETE SET NULL,
    decided_by        INTEGER REFERENCES users(id) ON DELETE SET NULL,
    decided_at        TIMESTAMPTZ,
    decision_motif    TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_titles_holder ON forest_titles (holder_org_id);
CREATE INDEX IF NOT EXISTS idx_titles_status ON forest_titles (status);
CREATE INDEX IF NOT EXISTS idx_titles_geom ON forest_titles USING GIST (geom);

-- ---------------------------------------------------------------------
-- 6. Management units (UFA) under a title
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS management_units (
    id                   SERIAL PRIMARY KEY,
    title_id             INTEGER NOT NULL REFERENCES forest_titles(id) ON DELETE CASCADE,
    label                TEXT NOT NULL,
    surface_ha           DOUBLE PRECISION,
    geom                 GEOMETRY(Polygon, 4326),
    plan_amenagement_ref TEXT,
    pa_approved_at       DATE,
    pa_expiry            DATE,
    plan_gestion_ref     TEXT,
    rotation_years       INTEGER,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ufa_title ON management_units (title_id);

-- ---------------------------------------------------------------------
-- 7. Annual cut blocks (AAC / AACp)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS annual_cut_blocks (
    id               SERIAL PRIMARY KEY,
    ufa_id           INTEGER NOT NULL REFERENCES management_units(id) ON DELETE CASCADE,
    label            TEXT NOT NULL,
    campaign_year    INTEGER,
    surface_ha       DOUBLE PRECISION,
    possibility_m3   DOUBLE PRECISION,
    geom             GEOMETRY(Polygon, 4326),
    origin           TEXT NOT NULL DEFAULT 'plan_amenagement'
                     CHECK (origin IN ('plan_amenagement', 'cpaet_provisoire')),
    status           TEXT NOT NULL DEFAULT 'prepare'
                     CHECK (status IN ('prepare','soumis','autorise','ouvert','ferme')),
    pao_reference    TEXT,
    pao_submitted_at TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_aac_ufa ON annual_cut_blocks (ufa_id);
CREATE INDEX IF NOT EXISTS idx_aac_status ON annual_cut_blocks (status);

-- ---------------------------------------------------------------------
-- 8. Harvest authorizations (certificat d'assiette / permis / vente / CAE)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS aac_authorizations (
    id                  SERIAL PRIMARY KEY,
    aac_id              INTEGER NOT NULL REFERENCES annual_cut_blocks(id) ON DELETE CASCADE,
    authorization_type  TEXT NOT NULL
                        CHECK (authorization_type IN
                          ('certificat_assiette','permis_annuel_operations',
                           'certificat_vente_coupe','cae')),
    reference           TEXT,
    issued_by           INTEGER REFERENCES users(id) ON DELETE SET NULL,
    issued_at           DATE,
    valid_from          DATE,
    valid_to            DATE,
    startup_notified_at TIMESTAMPTZ,
    plan_document_id    INTEGER REFERENCES legal_documents(id) ON DELETE SET NULL,
    status              TEXT NOT NULL DEFAULT 'soumis'
                        CHECK (status IN ('soumis','delivre','rejete')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_aacauth_aac ON aac_authorizations (aac_id);

-- ---------------------------------------------------------------------
-- 9. Tax / royalty receipts
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tax_receipts (
    id          SERIAL PRIMARY KEY,
    org_id      INTEGER REFERENCES organizations(id) ON DELETE SET NULL,
    title_id    INTEGER REFERENCES forest_titles(id) ON DELETE SET NULL,
    tax_type    TEXT NOT NULL
                CHECK (tax_type IN ('superficie','abattage','surveillance',
                                    'transformation','renouvellement','transfert','fermage')),
    period_year INTEGER,
    amount_fcfa DOUBLE PRECISION,
    receipt_ref TEXT,
    paid_at     DATE,
    due_at      DATE,
    status      TEXT NOT NULL DEFAULT 'du'
                CHECK (status IN ('du','paye','en_retard')),
    document_id INTEGER REFERENCES legal_documents(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tax_org ON tax_receipts (org_id);
CREATE INDEX IF NOT EXISTS idx_tax_status ON tax_receipts (status);

-- ---------------------------------------------------------------------
-- 10. Community agreements (CCC / FDL, Loi 016/01 art. 251)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS community_agreements (
    id                       SERIAL PRIMARY KEY,
    title_id                 INTEGER REFERENCES forest_titles(id) ON DELETE CASCADE,
    community_org_id         INTEGER REFERENCES organizations(id) ON DELETE SET NULL,
    ccc_ref                  TEXT,
    ccc_signed_at            DATE,
    fdl_rate_fcfa_m3         DOUBLE PRECISION NOT NULL DEFAULT 800,
    annual_volume_m3         DOUBLE PRECISION,
    contribution_fcfa        DOUBLE PRECISION,
    cgsp_minutes_document_id INTEGER REFERENCES legal_documents(id) ON DELETE SET NULL,
    status                   TEXT NOT NULL DEFAULT 'actif'
                             CHECK (status IN ('actif','suspendu','clos')),
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ccc_title ON community_agreements (title_id);

-- ---------------------------------------------------------------------
-- 11. Transport documents (bordereau de roulage / feuille de route / spécification)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transport_documents (
    id         SERIAL PRIMARY KEY,
    org_id     INTEGER REFERENCES organizations(id) ON DELETE SET NULL,
    doc_type   TEXT NOT NULL
               CHECK (doc_type IN ('bordereau_roulage','feuille_route','specification')),
    reference  TEXT,
    from_label TEXT,
    to_label   TEXT,
    tree_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
    volume_m3  DOUBLE PRECISION,
    issued_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    issued_at  TIMESTAMPTZ,
    status     TEXT NOT NULL DEFAULT 'brouillon'
               CHECK (status IN ('brouillon','emis','receptionne')),
    qr_payload TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transport_org ON transport_documents (org_id);
CREATE INDEX IF NOT EXISTS idx_transport_type ON transport_documents (doc_type);

-- ---------------------------------------------------------------------
-- 12. Third-party certification (FSC / PAFC / légalité+)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS certifications (
    id              SERIAL PRIMARY KEY,
    org_id          INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
    title_id        INTEGER REFERENCES forest_titles(id) ON DELETE SET NULL,
    scheme          TEXT NOT NULL
                    CHECK (scheme IN ('FSC','PAFC','PEFC','OLB','LS','TLV')),
    cert_type       TEXT NOT NULL
                    CHECK (cert_type IN ('gestion_durable','legalite_plus')),
    certificate_ref TEXT,
    surface_ha      DOUBLE PRECISION,
    valid_from      DATE,
    valid_to        DATE,
    status          TEXT NOT NULL DEFAULT 'actif'
                    CHECK (status IN ('actif','suspendu','expire')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cert_org ON certifications (org_id);

-- ---------------------------------------------------------------------
-- 13. Extend existing abattage tables (additive, nullable)
-- ---------------------------------------------------------------------
ALTER TABLE felling_declarations
    ADD COLUMN IF NOT EXISTS title_id INTEGER REFERENCES forest_titles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS aac_id INTEGER REFERENCES annual_cut_blocks(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS compliance JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE tree_registry
    ADD COLUMN IF NOT EXISTS title_id INTEGER REFERENCES forest_titles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS aac_id INTEGER REFERENCES annual_cut_blocks(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS hammer_mark TEXT,
    ADD COLUMN IF NOT EXISTS felled_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS stump_geom GEOMETRY(Point, 4326),
    ADD COLUMN IF NOT EXISTS df10_entry_no TEXT;

CREATE INDEX IF NOT EXISTS idx_registry_aac ON tree_registry (aac_id);

ALTER TABLE custody_events
    ADD COLUMN IF NOT EXISTS transport_document_id INTEGER
        REFERENCES transport_documents(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS destination TEXT;

-- ---------------------------------------------------------------------
-- 14. Seed: document dictionary (Timber Trade Portal — documents clés)
-- ---------------------------------------------------------------------
INSERT INTO document_types (code, label, scope_type, authority, validity_months, default_blocking, legal_ref) VALUES
    -- Entreprise
    ('agrement_exploitation', 'Agrément professionnel — exploitation / vente de grumes', 'company', 'DGF', NULL, TRUE, 'Loi 016/01 art. 102'),
    ('agrement_transformation', 'Agrément professionnel — transformation', 'company', 'DGICBVPF', NULL, TRUE, 'Loi 016/01 art. 102'),
    ('agrement_vente', 'Agrément professionnel — vente de produits transformés', 'company', 'DGICBVPF', NULL, FALSE, 'Loi 016/01 art. 102'),
    ('quittance_taxe_superficie', 'Quittance de la taxe de superficie', 'company', 'DGI', 12, TRUE, 'Loi 016/01 art. 244'),
    ('certificat_conformite_pi', 'Certificat de conformité du Plan d''Industrialisation', 'company', 'DGICBVPF', NULL, FALSE, 'Loi 016/01 art. 226'),
    ('certificat_conformite_pdi', 'Certificat de conformité du Plan de Développement Industriel', 'company', 'DGICBVPF', NULL, FALSE, 'Loi 016/01 art. 226'),
    -- Titre
    ('autorisation_exploration', 'Autorisation d''exploration', 'title', 'MEFME / DGF', 12, FALSE, 'Loi 016/01 art. 106'),
    ('cpaet', 'Convention Provisoire d''Aménagement - Exploitation - Transformation', 'title', 'MEFME / DGF', 36, FALSE, 'Loi 016/01 art. 109'),
    ('convention_provisoire', 'Convention provisoire d''exploitation', 'title', 'MEFME / DGF', 36, FALSE, 'Loi 016/01 art. 108'),
    ('convention_definitive', 'Convention définitive d''exploitation', 'title', 'Ministère (décret PM)', 180, FALSE, 'Loi 016/01 art. 110'),
    ('attestation_conformite', 'Attestation de conformité aux clauses de la convention', 'title', 'MEFME', NULL, FALSE, 'Loi 016/01 art. 108'),
    ('plan_amenagement', 'Plan d''Aménagement', 'title', 'Ministre / DGF', 360, FALSE, 'Loi 016/01 art. 20'),
    ('plan_simple_gestion', 'Plan Simple de Gestion (forêt communautaire)', 'title', 'MEFME / communauté', NULL, FALSE, 'Loi 016/01 art. 158'),
    ('convention_gestion_fc', 'Convention de gestion de la forêt communautaire', 'title', 'Administration forestière / communauté', 300, FALSE, 'Loi 016/01 art. 160'),
    ('cahier_charges_contractuelles_ccc', 'Cahier des Charges Contractuelles (CCC)', 'title', 'Concessionnaire / communautés', NULL, FALSE, 'Loi 016/01 art. 251'),
    -- UFA
    ('plan_gestion', 'Plan de Gestion', 'ufa', 'DGF', NULL, FALSE, 'Loi 016/01 art. 28'),
    ('plan_protection_faune', 'Plan de Protection de la Faune (PPF)', 'ufa', 'DGFAP', NULL, FALSE, 'Loi 016/01'),
    ('etude_impact_environnemental', 'Étude d''Impact Environnemental (EIE)', 'ufa', 'DGE', 12, FALSE, 'Loi 007/2014'),
    ('quittance_redevance_surveillance', 'Quittance de la redevance de surveillance', 'ufa', 'AGEOS / Trésor', 12, TRUE, 'Loi de finances 2018'),
    -- AAC / FC exploitation
    ('plan_annuel_operation', 'Plan Annuel d''Opération (PAO)', 'aac', 'Direction Provinciale', 12, FALSE, 'Loi 016/01 art. 45'),
    ('certificat_annuel_assiette_coupe', 'Certificat annuel d''assiette de coupe', 'aac', 'Direction des Forêts', 12, FALSE, 'Loi 016/01 art. 121'),
    ('permis_annuel_operations', 'Permis Annuel d''Opérations', 'aac', 'Direction des Forêts', 12, FALSE, 'Loi 016/01 art. 121'),
    ('certificat_vente_coupe', 'Certificat de vente de coupe', 'aac', 'Direction des Forêts', 12, FALSE, 'Loi 016/01 art. 121'),
    ('certificat_annuel_exploitation_cae', 'Certificat Annuel d''Exploitation (CAE)', 'aac', 'Direction des Forêts', 12, FALSE, 'Loi 016/01 art. 160'),
    ('pv_materialisation_limites', 'PV de vérification de la matérialisation des limites', 'aac', 'Inspection Provinciale', NULL, FALSE, 'Décret FC 2004/2013'),
    ('attestation_materialisation_limites', 'Attestation de vérification de la matérialisation des limites', 'aac', 'Inspection Provinciale', NULL, FALSE, 'Décret FC 2004/2013'),
    ('certificat_materialisation_limites', 'Certificat de matérialisation des limites', 'aac', 'Inspection Provinciale', NULL, FALSE, 'Décret FC 2004/2013'),
    ('attestation_expertise_inventaire', 'Attestation d''expertise du rapport d''inventaire d''exploitation', 'aac', 'Inspection Provinciale', NULL, FALSE, 'Décret FC 2004/2013'),
    ('certificat_conformite_inventaire', 'Certificat de conformité du rapport d''inventaire d''exploitation', 'aac', 'Inspection Provinciale', NULL, FALSE, 'Décret FC 2004/2013'),
    -- Produit / transport
    ('carnet_chantier_df10', 'Carnet de chantier (DF10)', 'product', 'Direction Provinciale / Cantonnement', NULL, TRUE, 'Loi 016/01 art. 130'),
    ('quittance_taxe_abattage_export', 'Quittance de la taxe d''abattage à l''exportation', 'product', 'Douanes', NULL, FALSE, 'Loi 016/01 art. 244'),
    ('bordereau_roulage', 'Bordereau de roulage / transport', 'product', 'Autorité forestière provinciale', NULL, TRUE, 'Loi 016/01 art. 135'),
    ('specification', 'Spécification (feuille de spécification)', 'product', 'Autorités forestières ports / provinciales', NULL, FALSE, 'Loi 016/01 art. 138'),
    ('permis_cites_export', 'Permis d''exportation CITES', 'product', 'ANPN / DGICBVPF', NULL, FALSE, 'CITES annexe II'),
    -- Social / EUDR
    ('pv_consultation_parties_prenantes', 'PV de consultation des parties prenantes', 'social', NULL, NULL, FALSE, 'Loi 016/01 art. 252-261'),
    ('suivi_griefs', 'Suivi des griefs', 'social', NULL, NULL, FALSE, 'RDUE (EUDR)'),
    ('copie_plan_amenagement_psg', 'Copie du plan d''aménagement / PSG', 'social', NULL, NULL, FALSE, 'RDUE (EUDR)'),
    ('pv_cgsp', 'PV du Comité de Gestion et de Suivi des Projets (CGSP)', 'social', NULL, NULL, FALSE, 'Loi 016/01 art. 251')
ON CONFLICT (code) DO UPDATE SET
    label = EXCLUDED.label,
    scope_type = EXCLUDED.scope_type,
    authority = EXCLUDED.authority,
    validity_months = EXCLUDED.validity_months,
    default_blocking = EXCLUDED.default_blocking,
    legal_ref = EXCLUDED.legal_ref;

-- ---------------------------------------------------------------------
-- 15. Seed: org presets (types de compte => capacités, docs, modules)
-- ---------------------------------------------------------------------
INSERT INTO org_profiles (code, label, org_type, activities, allowed_title_types, doc_required, enabled_modules, obligations, description) VALUES
    ('exploitant_forestier', 'Exploitant forestier', 'entreprise',
     ARRAY['exploitation'], ARRAY['CFAD','PFA','PGG'],
     ARRAY['agrement_exploitation','quittance_taxe_superficie','quittance_redevance_surveillance'],
     ARRAY['documents','titles','aac','felling','df10','transport','taxes'],
     '{"ccc": true, "fdl": true, "ppf": true, "eie": false, "pi_pdi": false}'::jsonb,
     'Exploitation forestière seule, sans unité de transformation.'),
    ('transformateur', 'Transformateur', 'entreprise',
     ARRAY['transformation'], ARRAY[]::TEXT[],
     ARRAY['agrement_transformation','certificat_conformite_pi','certificat_conformite_pdi'],
     ARRAY['documents','supply','transformation','transport','taxes'],
     '{"ccc": false, "fdl": false, "ppf": false, "eie": true, "pi_pdi": true}'::jsonb,
     'Unité de transformation sans concession (achat de grumes).'),
    ('integre', 'Exploitant intégré', 'entreprise',
     ARRAY['exploitation','transformation'], ARRAY['CFAD','PFA','PGG'],
     ARRAY['agrement_exploitation','agrement_transformation','quittance_taxe_superficie','quittance_redevance_surveillance','certificat_conformite_pi','certificat_conformite_pdi'],
     ARRAY['documents','titles','aac','felling','df10','supply','transformation','transport','taxes'],
     '{"ccc": true, "fdl": true, "ppf": true, "eie": true, "pi_pdi": true}'::jsonb,
     'Concession forestière intégrée à une unité de transformation.'),
    ('negoce_export', 'Négoce / Export', 'entreprise',
     ARRAY['negoce','export'], ARRAY[]::TEXT[],
     ARRAY['agrement_vente','quittance_taxe_abattage_export'],
     ARRAY['documents','specification','cites','taxes'],
     '{"ccc": false, "fdl": false, "ppf": false, "eie": false, "pi_pdi": false}'::jsonb,
     'Commerce et export de produits bois transformés.'),
    ('foret_communautaire', 'Forêt communautaire', 'communaute',
     ARRAY['gestion_communautaire','exploitation'], ARRAY['FC'],
     ARRAY['plan_simple_gestion','convention_gestion_fc','certificat_annuel_exploitation_cae','quittance_taxe_superficie'],
     ARRAY['documents','community_forest','annual_plan','felling','df10','taxes'],
     '{"ccc": false, "fdl": false, "ppf": true, "eie": false, "pi_pdi": false}'::jsonb,
     'Communauté villageoise exploitant une forêt communautaire (domaine rural).')
ON CONFLICT (code) DO UPDATE SET
    label = EXCLUDED.label,
    org_type = EXCLUDED.org_type,
    activities = EXCLUDED.activities,
    allowed_title_types = EXCLUDED.allowed_title_types,
    doc_required = EXCLUDED.doc_required,
    enabled_modules = EXCLUDED.enabled_modules,
    obligations = EXCLUDED.obligations,
    description = EXCLUDED.description;
