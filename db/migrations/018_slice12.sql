-- =====================================================================
-- Phase 4 (Slice 12) — EUDR : géolocalisation exacte de chaque grume
-- (couverture de la parcelle d'origine). Additive, idempotent.
-- =====================================================================
-- The Slice 5 diligence already records the parcel polygon and the
-- geolocation coverage of the felled stems (tree_registry.geom). Building on
-- it, this slice makes the *per-log* geolocation explicit and auditable:
--   * inside_parcel_stem_count  — harvested stems whose exact felling
--     location falls inside the declared parcel polygon; and
--   * outside_parcel_stem_count — harvested stems located but outside it.
-- The exact felling location is COALESCE(tree_registry.stump_geom, geom):
-- the stump point recorded at felling, falling back to the inventory point.
--
-- Both counts are snapshotted at submission (like geolocated_stem_count); the
-- per-log list is derived at read from tree_registry (GET /diligence/{id}/stems).
-- =====================================================================

ALTER TABLE eudr_diligence
    ADD COLUMN IF NOT EXISTS inside_parcel_stem_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE eudr_diligence
    ADD COLUMN IF NOT EXISTS outside_parcel_stem_count INTEGER NOT NULL DEFAULT 0;

-- Support the per-log containment check on the exact felling location.
CREATE INDEX IF NOT EXISTS idx_registry_stump_geom ON tree_registry USING GIST (stump_geom);
