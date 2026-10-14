-- Slice 20 — Espace Ministère : provinces administratives et province des titres.
-- Additive and idempotent.

-- Administrative areas (ADM1 = the 9 provinces), imported once from an open
-- source (tools.import_provinces) with their licence recorded.
CREATE TABLE IF NOT EXISTS admin_areas (
    id          SERIAL PRIMARY KEY,
    level       SMALLINT NOT NULL DEFAULT 1,
    code        TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    geom        geometry(MultiPolygon, 4326),
    source      TEXT NOT NULL,
    license     TEXT NOT NULL,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admin_areas_geom ON admin_areas USING GIST (geom);

-- Province of a title: set by the Ministry when the title has no geometry, or
-- to correct the one derived from the geometry (largest overlap).
ALTER TABLE forest_titles ADD COLUMN IF NOT EXISTS province_code TEXT
    REFERENCES admin_areas(code) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_titles_province ON forest_titles (province_code);

-- Province of each title, read-time: the Ministry's setting wins, otherwise the
-- province with the largest overlap of the title geometry (else its UFAs, else
-- its AACs).
CREATE OR REPLACE VIEW v_title_province AS
SELECT t.id AS title_id,
       COALESCE(t.province_code, d.code) AS province_code,
       CASE
           WHEN t.province_code IS NOT NULL THEN 'manuel'
           WHEN d.code IS NOT NULL THEN 'geometrie'
       END AS province_source
FROM forest_titles t
LEFT JOIN LATERAL (
    SELECT a.code
    FROM admin_areas a,
         LATERAL (
             SELECT COALESCE(
                 t.geom,
                 (SELECT ST_Union(u.geom) FROM management_units u WHERE u.title_id = t.id),
                 (SELECT ST_Union(b.geom)
                    FROM annual_cut_blocks b
                    JOIN management_units u ON u.id = b.ufa_id
                   WHERE u.title_id = t.id)
             ) AS g
         ) gg
    WHERE gg.g IS NOT NULL AND ST_Intersects(a.geom, gg.g)
    ORDER BY ST_Area(ST_Intersection(a.geom, gg.g)) DESC
    LIMIT 1
) d ON TRUE;
