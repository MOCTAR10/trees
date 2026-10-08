-- =====================================================================
-- Phase 2 — Circular Economy Valorization Engine
-- community_cooperatives / tree_scans_and_residues / circular_economy_knowledge
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Community cooperatives (PostGIS matching within 15 km)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS community_cooperatives (
    id                          SERIAL PRIMARY KEY,
    geom                        GEOMETRY(Point, 4326) NOT NULL,
    cooperative_name            TEXT NOT NULL,
    profile_type                TEXT NOT NULL
                                CHECK (profile_type IN
                                  ('agricultural_biochar', 'energy_briquettes',
                                   'artisan_furniture', 'bio_chemical_extraction')),
    contact_phone               TEXT,
    capacity_kg_per_day         DOUBLE PRECISION,
    is_certified                BOOLEAN NOT NULL DEFAULT FALSE,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coops_geom ON community_cooperatives USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_coops_profile ON community_cooperatives (profile_type);

-- Seed: Gabonese cooperatives (Libreville, Port-Gentil, Franceville, Ogooué region)
INSERT INTO community_cooperatives (geom, cooperative_name, profile_type, capacity_kg_per_day, is_certified)
VALUES
    (ST_SetSRID(ST_MakePoint(9.4541, 0.4162), 4326),  'Coopérative Nkoltang Biochar',      'agricultural_biochar',   250, TRUE),
    (ST_SetSRID(ST_MakePoint(9.4399, 0.3902), 4326),  'Coopérative Owendo Briquettes',     'energy_briquettes',      400, TRUE),
    (ST_SetSRID(ST_MakePoint(8.7821, -0.7195), 4326), 'Coopérative Ozigo Ébénisterie',     'artisan_furniture',     120, TRUE),
    (ST_SetSRID(ST_MakePoint(13.4383, -1.6333),4326), 'Coopérative Franceville extraits',  'bio_chemical_extraction', 80, FALSE),
    (ST_SetSRID(ST_MakePoint(9.2936, 0.3858), 4326),  'Coopérative Lambaréné Bois Futé',   'artisan_furniture',     150, TRUE),
    (ST_SetSRID(ST_MakePoint(10.7960, -0.4370),4326), 'Coopérative Mouila Vert',           'agricultural_biochar',   180, FALSE),
    (ST_SetSRID(ST_MakePoint(11.8567, -1.5896),4326), 'Coopérative Koulamoutou Mycélium',  'bio_chemical_extraction', 90, TRUE)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- 2. Scans + residue quantification (extends Phase 1 scan output)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tree_scans_and_residues (
    id                          SERIAL PRIMARY KEY,
    scan_id                     INTEGER REFERENCES tree_scans(id) ON DELETE SET NULL,
    user_id                     INTEGER REFERENCES users(id) ON DELETE SET NULL,

    -- Geospatial (SRID 4326, GIST indexed)
    geom                        GEOMETRY(Point, 4326) NOT NULL,

    -- Dendrometric
    species_scientific_name     TEXT NOT NULL,
    measured_dbh_cm             DOUBLE PRECISION NOT NULL,
    estimated_age               DOUBLE PRECISION,
    estimated_height_m          DOUBLE PRECISION,

    -- Biomass quantification (dynamic, from biomass_engine)
    total_agb_kg                DOUBLE PRECISION,
    total_bgb_kg                DOUBLE PRECISION,
    volume_branches_m3          DOUBLE PRECISION,
    weight_branches_fine_kg     DOUBLE PRECISION,   -- <10 cm : biochar / briquettes
    weight_branches_thick_kg    DOUBLE PRECISION,   -- >15 cm : mobile sawing
    weight_bark_kg              DOUBLE PRECISION,
    weight_foliar_kg            DOUBLE PRECISION,
    volume_stump_m3             DOUBLE PRECISION,
    weight_roots_kg             DOUBLE PRECISION,
    volume_sawdust_m3           DOUBLE PRECISION,

    -- Marketplace & logistics
    status                      TEXT NOT NULL DEFAULT 'available'
                                CHECK (status IN ('available', 'allocated', 'collected')),
    logging_company_id          INTEGER,
    assigned_community_cooperative_id INTEGER REFERENCES community_cooperatives(id) ON DELETE SET NULL,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Finalized endogenous action plan (strict JSON from /api/v2)
    valorization_plan           JSONB
);

CREATE INDEX IF NOT EXISTS idx_residues_geom ON tree_scans_and_residues USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_residues_status ON tree_scans_and_residues (status);
CREATE INDEX IF NOT EXISTS idx_residues_species ON tree_scans_and_residues (species_scientific_name);

-- ---------------------------------------------------------------------
-- 3. Circular economy knowledge (RAG, pgvector 384)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS circular_economy_knowledge (
    id                          TEXT PRIMARY KEY,
    content                     TEXT NOT NULL,
    embedding                   vector(384) NOT NULL,

    -- Metadata schema (Phase 2 spec)
    residue_type                TEXT NOT NULL
                                CHECK (residue_type IN
                                  ('branches', 'bark', 'roots', 'foliage', 'stumps', 'sawdust', 'mixed')),
    species_target              TEXT,               -- scientific name or '*'
    transformation_technology   TEXT,               -- tlud_pyrolysis, mycelium_board, hotwater_tannin, ...
    legal_framework_reference   TEXT,               -- loi_016_01, fsc_p3_p4, pafc, paris_art6
    language                    TEXT NOT NULL DEFAULT 'en',
    source                      TEXT NOT NULL,
    metadata                    JSONB NOT NULL DEFAULT '{}'::jsonb,

    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cek_embedding ON circular_economy_knowledge
    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS idx_cek_residue ON circular_economy_knowledge (residue_type);
CREATE INDEX IF NOT EXISTS idx_cek_species ON circular_economy_knowledge (species_target);
CREATE INDEX IF NOT EXISTS idx_cek_tech ON circular_economy_knowledge (transformation_technology);
