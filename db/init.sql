-- =====================================================================
-- Digital Forestry — Phase 1 core schema
-- Extensions: PostGIS (geospatial) + pgvector (RAG embeddings)
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---------------------------------------------------------------------
-- Users (field operators, admins)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id              SERIAL PRIMARY KEY,
    external_id     UUID UNIQUE NOT NULL DEFAULT uuid_generate_v4(),
    email           TEXT UNIQUE,
    display_name    TEXT NOT NULL,
    role            TEXT NOT NULL DEFAULT 'operator'
                    CHECK (role IN ('operator', 'cooperative', 'company', 'admin')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Tree scans (Phase 1: measurement engine)
-- Dendrometry + geospatial + raw capture references
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tree_scans (
    id                      SERIAL PRIMARY KEY,
    user_id                 INTEGER REFERENCES users(id) ON DELETE SET NULL,

    -- Geospatial
    geom                    GEOMETRY(Point, 4326),
    altitude_m              DOUBLE PRECISION,

    -- Identification
    species_scientific_name TEXT,
    species_confidence      DOUBLE PRECISION,
    gbif_species_key        BIGINT,
    iucn_status             TEXT,

    -- Dendrometry
    measured_dbh_cm         DOUBLE PRECISION,
    dbh_method              TEXT DEFAULT 'yolo_opencv_hybrid'
                            CHECK (dbh_method IN ('yolo_opencv_hybrid', 'opencv_fallback', 'manual', 'mock')),
    dbh_confidence          DOUBLE PRECISION,
    estimated_height_m      DOUBLE PRECISION,
    estimated_age_years     DOUBLE PRECISION,
    age_model_used          TEXT,

    -- Environment
    soil_type               TEXT,
    canopy_density_fcd      DOUBLE PRECISION,

    -- Capture artefacts
    image_trunk_url         TEXT,
    image_leaf_url          TEXT,
    image_habitat_url       TEXT,
    ar_depth_m              DOUBLE PRECISION,
    camera_focal_px         DOUBLE PRECISION,

    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tree_scans_geom ON tree_scans USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_tree_scans_species ON tree_scans (species_scientific_name);

-- ---------------------------------------------------------------------
-- Vector store for LlamaIndex RAG (384-dim multilingual embeddings)
-- Backed by pgvector; metadata extracted into indexed columns
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rag_documents (
    id              TEXT PRIMARY KEY,           -- LlamaIndex doc_id
    content         TEXT NOT NULL,
    embedding       vector(384) NOT NULL,

    -- Metadata filters (Phase 1 + Phase 2)
    doc_type        TEXT NOT NULL               -- species | equation | legal | protocol
                    CHECK (doc_type IN ('species', 'equation', 'legal', 'protocol')),
    species         TEXT,                       -- scientific name or '*'
    soil_type       TEXT,                       -- optional hint
    residue_type    TEXT,                       -- branches | bark | roots | foliage | stumps | sawdust | '*'
    transformation_technology TEXT,
    legal_framework_reference  TEXT,
    language        TEXT NOT NULL DEFAULT 'en',
    source          TEXT NOT NULL,              -- citation / URL
    metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rag_embedding ON rag_documents
    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS idx_rag_metadata ON rag_documents USING GIN (metadata);
CREATE INDEX IF NOT EXISTS idx_rag_species ON rag_documents (species);
CREATE INDEX IF NOT EXISTS idx_rag_residue ON rag_documents (residue_type);
