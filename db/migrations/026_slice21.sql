-- Slice 21 — Contrôles terrain du Ministère (planche 2 du guide) :
-- contrôle du marquage (art. 130–133), visa du carnet DF10 (art. 49),
-- contrôle en route (art. 135), contrôle de transformation (DGICBVPF).
-- Additive and idempotent.

CREATE TABLE IF NOT EXISTS field_controls (
    id                     SERIAL PRIMARY KEY,
    control_type           TEXT NOT NULL
                           CHECK (control_type IN ('marquage', 'visa_df10', 'route', 'transformation')),
    result                 TEXT NOT NULL
                           CHECK (result IN ('conforme', 'reserve', 'non_conforme')),
    tree_code              TEXT,
    transport_document_id  INTEGER REFERENCES transport_documents(id) ON DELETE SET NULL,
    aac_id                 INTEGER REFERENCES annual_cut_blocks(id) ON DELETE SET NULL,
    org_id                 INTEGER REFERENCES organizations(id) ON DELETE SET NULL,
    findings               JSONB NOT NULL DEFAULT '[]'::jsonb,
    notes                  TEXT,
    pv_reference           TEXT,
    geom                   geometry(Point, 4326),
    controlled_by          INTEGER REFERENCES users(id) ON DELETE SET NULL,
    controlled_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_field_controls_type ON field_controls (control_type, controlled_at DESC);
CREATE INDEX IF NOT EXISTS idx_field_controls_tree ON field_controls (tree_code);
CREATE INDEX IF NOT EXISTS idx_field_controls_aac ON field_controls (aac_id);
CREATE INDEX IF NOT EXISTS idx_field_controls_org ON field_controls (org_id);
CREATE INDEX IF NOT EXISTS idx_field_controls_geom ON field_controls USING GIST (geom);
