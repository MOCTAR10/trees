-- =====================================================================
-- Projects: field data-collection campaigns (Ministry / companies)
-- =====================================================================

CREATE TABLE IF NOT EXISTS projects (
    id           SERIAL PRIMARY KEY,
    title        TEXT NOT NULL,
    description  TEXT NOT NULL DEFAULT '',
    target_type  TEXT NOT NULL DEFAULT 'all'
                 CHECK (target_type IN ('species', 'family', 'genus', 'all')),
    target_value TEXT NOT NULL DEFAULT '',
    objective    TEXT NOT NULL DEFAULT 'cartographie'
                 CHECK (objective IN ('cartographie', 'inventaire', 'sante', 'restauration', 'autre')),
    latitude     DOUBLE PRECISION,
    longitude    DOUBLE PRECISION,
    radius_km    DOUBLE PRECISION,
    status       TEXT NOT NULL DEFAULT 'open'
                 CHECK (status IN ('draft', 'open', 'closed')),
    created_by   INTEGER REFERENCES users(id) ON DELETE CASCADE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_projects_status ON projects (status);

CREATE TABLE IF NOT EXISTS project_participants (
    project_id  INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    company_id  INTEGER REFERENCES users(id) ON DELETE CASCADE,
    joined_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (project_id, company_id)
);

ALTER TABLE tree_scans ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_tree_scans_project ON tree_scans (project_id);
