-- =====================================================================
-- Phase 4 (Slice 5) — Fiscalité (échéances), social (CCC/FDL) & EUDR
-- tax_dues / eudr_diligence (+ indexes). Additive, idempotent.
-- community_agreements (CCC/FDL) already exists in 009_gouvernance.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tax dues (échéances) — obligations declared by the Ministry, settled
--    by a company receipt. Status is derived at read time:
--      paye       → a receipt is attached (receipt_id)
--      en_retard  → due_at passed and still unpaid  (double droit, art. 283)
--      du         → otherwise
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tax_dues (
    id          SERIAL PRIMARY KEY,
    org_id      INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
    title_id    INTEGER REFERENCES forest_titles(id) ON DELETE SET NULL,
    tax_type    TEXT NOT NULL
                CHECK (tax_type IN ('superficie','abattage','surveillance',
                                    'transformation','renouvellement','transfert','fermage')),
    period_year INTEGER NOT NULL,
    amount_fcfa DOUBLE PRECISION NOT NULL,
    due_at      DATE,
    notes       TEXT,
    receipt_id  INTEGER REFERENCES tax_receipts(id) ON DELETE SET NULL,
    created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dues_org ON tax_dues (org_id);
CREATE INDEX IF NOT EXISTS idx_dues_year ON tax_dues (period_year);
CREATE INDEX IF NOT EXISTS idx_dues_title ON tax_dues (title_id);

-- ---------------------------------------------------------------------
-- 2. EUDR due-diligence statements, at the parcel of origin (RDUE art. 9–11).
--    Geolocation per stem already lives in tree_registry.geom; this records
--    the parcel polygon + the proof of consultation and the counts computed
--    at submission time.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS eudr_diligence (
    id                       SERIAL PRIMARY KEY,
    org_id                   INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
    title_id                 INTEGER REFERENCES forest_titles(id) ON DELETE SET NULL,
    parcel_label             TEXT NOT NULL,
    parcel_geom              GEOMETRY(Polygon, 4326),
    consultation_document_id INTEGER REFERENCES legal_documents(id) ON DELETE SET NULL,
    geolocated_stem_count    INTEGER NOT NULL DEFAULT 0,
    felled_stem_count        INTEGER NOT NULL DEFAULT 0,
    declared_volume_m3       DOUBLE PRECISION,
    notes                    TEXT,
    status                   TEXT NOT NULL DEFAULT 'soumis'
                             CHECK (status IN ('soumis','valide','rejete')),
    submitted_by             INTEGER REFERENCES users(id) ON DELETE SET NULL,
    decided_by               INTEGER REFERENCES users(id) ON DELETE SET NULL,
    decided_at               TIMESTAMPTZ,
    decision_motif           TEXT,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_eudr_org ON eudr_diligence (org_id);
CREATE INDEX IF NOT EXISTS idx_eudr_status ON eudr_diligence (status);
CREATE INDEX IF NOT EXISTS idx_eudr_geom ON eudr_diligence USING GIST (parcel_geom);
