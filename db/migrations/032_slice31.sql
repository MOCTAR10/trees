-- Slice 31 — Inventaire d'exploitation importé d'un tableur (Loi 016/01 art. 60-62, 122, 124).
-- Additive and idempotent.

-- 1. Audit trail: one row per confirmed import (who, when, which file, counts).
CREATE TABLE IF NOT EXISTS inventory_imports (
    id               SERIAL PRIMARY KEY,
    organization_id  INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    aac_id           INTEGER REFERENCES annual_cut_blocks(id) ON DELETE SET NULL,
    title_id         INTEGER REFERENCES forest_titles(id) ON DELETE SET NULL,
    imported_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
    file_name        TEXT NOT NULL,
    file_format      TEXT NOT NULL CHECK (file_format IN ('xlsx', 'csv')),
    model_version    TEXT NOT NULL,
    rows_total       INTEGER NOT NULL DEFAULT 0,
    stems_created    INTEGER NOT NULL DEFAULT 0,
    to_fell_count    INTEGER NOT NULL DEFAULT 0,
    kept_count       INTEGER NOT NULL DEFAULT 0,
    warnings_count   INTEGER NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_imports_org ON inventory_imports (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_imports_aac ON inventory_imports (aac_id);

-- 2. Inventory fields on the registry. ``inventory_destination`` NULL = a stem
--    inventoried by scan (fellable, as before); avenir / reserve / semencier are
--    trees to preserve (art. 122) and can never be declared nor felled.
ALTER TABLE tree_registry
    ADD COLUMN IF NOT EXISTS inventory_destination TEXT
        CHECK (inventory_destination IN ('abattre', 'avenir', 'reserve', 'semencier')),
    ADD COLUMN IF NOT EXISTS inventory_import_id INTEGER REFERENCES inventory_imports(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS painted_number TEXT,
    ADD COLUMN IF NOT EXISTS bole_height_m DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS inventory_layon TEXT,
    ADD COLUMN IF NOT EXISTS inventory_placette TEXT,
    ADD COLUMN IF NOT EXISTS inventory_quality TEXT CHECK (inventory_quality IN ('1', '2', '3')),
    ADD COLUMN IF NOT EXISTS surveyed_on DATE,
    ADD COLUMN IF NOT EXISTS inventory_notes TEXT;

CREATE INDEX IF NOT EXISTS idx_registry_inventory_import ON tree_registry (inventory_import_id);
CREATE INDEX IF NOT EXISTS idx_registry_painted ON tree_registry (aac_id, painted_number)
    WHERE painted_number IS NOT NULL;
