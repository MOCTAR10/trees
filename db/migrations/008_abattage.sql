-- =====================================================================
-- Phase 3 (slice 1) — Abattage & traçabilité
-- tree_registry / felling_declarations (+ lines) / custody_events
-- Idempotent: safe to re-run against a live volume.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tree registry: one enduring identity per stem (QR / paint / GPS+photo)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tree_registry (
    id                  SERIAL PRIMARY KEY,
    tree_code           TEXT UNIQUE NOT NULL,          -- e.g. GA-2026-000123
    marking_type        TEXT NOT NULL DEFAULT 'gps_photo'
                        CHECK (marking_type IN ('qr', 'peinture', 'gps_photo')),
    geom                GEOMETRY(Point, 4326),
    species_scientific_name TEXT,
    measured_dbh_cm     DOUBLE PRECISION,
    company_id          INTEGER REFERENCES users(id) ON DELETE SET NULL,
    status              TEXT NOT NULL DEFAULT 'inventorie'
                        CHECK (status IN ('inventorie', 'declare', 'autorise',
                                          'abattu', 'transporte', 'transforme')),
    permit_number       TEXT,
    aac_label           TEXT,                          -- Assiette Annuelle de Coupe (text until geometries arrive)
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_registry_code ON tree_registry (tree_code);
CREATE INDEX IF NOT EXISTS idx_registry_geom ON tree_registry USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_registry_status ON tree_registry (status);
CREATE INDEX IF NOT EXISTS idx_registry_company ON tree_registry (company_id);

-- ---------------------------------------------------------------------
-- 2. Felling declarations (company declares -> admin authorizes)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS felling_declarations (
    id                  SERIAL PRIMARY KEY,
    company_id          INTEGER REFERENCES users(id) ON DELETE SET NULL,
    permit_type         TEXT NOT NULL
                        CHECK (permit_type IN
                          ('CFAD', 'PFA', 'PGG', 'ASC', 'ACBSL', 'foret_communautaire')),
    permit_number       TEXT NOT NULL,
    ufa_label           TEXT,
    aac_label           TEXT,
    campaign_year       INTEGER,
    status              TEXT NOT NULL DEFAULT 'soumise'
                        CHECK (status IN ('soumise', 'autorisee', 'rejetee')),
    decision_motif      TEXT,
    decided_by          INTEGER REFERENCES users(id) ON DELETE SET NULL,
    decided_at          TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_decl_company ON felling_declarations (company_id);
CREATE INDEX IF NOT EXISTS idx_decl_status ON felling_declarations (status);

CREATE TABLE IF NOT EXISTS declaration_lines (
    id                  SERIAL PRIMARY KEY,
    declaration_id      INTEGER NOT NULL REFERENCES felling_declarations(id) ON DELETE CASCADE,
    tree_code           TEXT NOT NULL,
    marking_type        TEXT NOT NULL DEFAULT 'gps_photo'
                        CHECK (marking_type IN ('qr', 'peinture', 'gps_photo')),
    species_scientific_name TEXT,
    measured_dbh_cm     DOUBLE PRECISION,
    latitude            DOUBLE PRECISION,
    longitude           DOUBLE PRECISION,
    dme_cm              DOUBLE PRECISION,              -- reference DME applied (provisional until arrêté)
    violations          JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_decl_lines_decl ON declaration_lines (declaration_id);
CREATE INDEX IF NOT EXISTS idx_decl_lines_code ON declaration_lines (tree_code);

-- ---------------------------------------------------------------------
-- 3. Custody ledger (append-only chain of custody per tree code)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS custody_events (
    id                  SERIAL PRIMARY KEY,
    tree_code           TEXT NOT NULL,
    event               TEXT NOT NULL
                        CHECK (event IN ('abattu', 'transporte', 'receptionne', 'transforme')),
    actor_id            INTEGER REFERENCES users(id) ON DELETE SET NULL,
    geom                GEOMETRY(Point, 4326),
    photo_url           TEXT,
    note                TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_custody_code ON custody_events (tree_code);
CREATE INDEX IF NOT EXISTS idx_custody_event ON custody_events (event);

-- ---------------------------------------------------------------------
-- 4. Chain link: residues quantified from a registered felled tree
-- ---------------------------------------------------------------------
ALTER TABLE tree_scans_and_residues
    ADD COLUMN IF NOT EXISTS tree_code TEXT
    REFERENCES tree_registry(tree_code) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_residues_tree_code ON tree_scans_and_residues (tree_code);
