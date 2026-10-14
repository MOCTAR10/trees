-- =====================================================================
-- Slice 22 — Cycle de vie de la grume
-- Registre : statut « receptionne », détenteur courant (custodian_org_id),
-- AAC rattachée à la déclaration (rattrapage). Transport : organisation
-- destinataire et réception ; événements de garde liés au bordereau.
-- Idempotent : peut être rejoué sur une base existante.
-- =====================================================================

ALTER TABLE tree_registry DROP CONSTRAINT IF EXISTS tree_registry_status_check;
ALTER TABLE tree_registry ADD CONSTRAINT tree_registry_status_check
    CHECK (status IN ('inventorie', 'declare', 'autorise', 'abattu',
                      'transporte', 'receptionne', 'transforme'));

ALTER TABLE tree_registry
    ADD COLUMN IF NOT EXISTS custodian_org_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_registry_custodian ON tree_registry (custodian_org_id);

ALTER TABLE transport_documents
    ADD COLUMN IF NOT EXISTS destination_org_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS received_by        INTEGER REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS received_at        TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_transport_destination ON transport_documents (destination_org_id);

ALTER TABLE custody_events
    ADD COLUMN IF NOT EXISTS transport_document_id INTEGER REFERENCES transport_documents(id) ON DELETE SET NULL;

UPDATE tree_registry r
   SET aac_id = d.aac_id
  FROM declaration_lines l
  JOIN felling_declarations d ON d.id = l.declaration_id
 WHERE l.tree_code = r.tree_code
   AND r.aac_id IS NULL
   AND d.aac_id IS NOT NULL;

UPDATE tree_registry r
   SET aac_id = (SELECT b.id FROM annual_cut_blocks b WHERE b.label = r.aac_label)
 WHERE r.aac_id IS NULL
   AND r.aac_label IS NOT NULL
   AND (SELECT count(*) FROM annual_cut_blocks b WHERE b.label = r.aac_label) = 1;

UPDATE tree_registry r
   SET title_id = b_title.title_id
  FROM (SELECT b.id AS aac_id, u.title_id
          FROM annual_cut_blocks b JOIN management_units u ON u.id = b.ufa_id) b_title
 WHERE r.title_id IS NULL
   AND r.aac_id = b_title.aac_id;

UPDATE tree_registry r
   SET custodian_org_id = u.organization_id
  FROM users u
 WHERE r.custodian_org_id IS NULL
   AND u.id = r.company_id
   AND u.organization_id IS NOT NULL;
