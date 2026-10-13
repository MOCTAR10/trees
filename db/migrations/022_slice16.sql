-- =====================================================================
-- Slice 16 — Carte 2.0 & contrôles Global Forest Watch.
--
-- * ``tree_scans.forest_checks`` : contrôles GFW figés au moment du scan
--   (perte de couvert par année, alertes RADD, forêt naturelle 2020, aire
--   protégée, concession, biomasse cartographiée, verdict RDUE indicatif).
-- * ``gfw_features`` : couches vectorielles GFW importées pour le Gabon
--   (aires protégées WDPA, concessions forestières, minières…) par
--   ``python -m tools.import_gfw_layers`` — servies à la carte et utilisées
--   hors-ligne par les contrôles spatiaux. Additif et sûr.
-- =====================================================================

ALTER TABLE tree_scans
    ADD COLUMN IF NOT EXISTS forest_checks JSONB;

CREATE TABLE IF NOT EXISTS gfw_features (
    id          BIGSERIAL PRIMARY KEY,
    layer       TEXT NOT NULL,
    source_id   TEXT NOT NULL,
    name        TEXT,
    attrs       JSONB NOT NULL DEFAULT '{}'::jsonb,
    geom        GEOMETRY(Geometry, 4326) NOT NULL,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (layer, source_id)
);

CREATE INDEX IF NOT EXISTS idx_gfw_features_geom ON gfw_features USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_gfw_features_layer ON gfw_features (layer);
