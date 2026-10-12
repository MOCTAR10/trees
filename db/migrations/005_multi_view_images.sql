-- 005_multi_view_images.sql — multi-angle capture artefacts
-- Stores per-organ image references and view metadata (organ, azimuth, sharpness)
-- to support the orbit + organ close-up capture flow.
-- Idempotent: safe to re-run against a live volume.

ALTER TABLE tree_scans ADD COLUMN IF NOT EXISTS image_urls JSONB;
ALTER TABLE tree_scans ADD COLUMN IF NOT EXISTS view_meta JSONB;

-- Allow the averaged multi-view DBH method alongside the single-view methods.
ALTER TABLE tree_scans DROP CONSTRAINT IF EXISTS tree_scans_dbh_method_check;
ALTER TABLE tree_scans ADD CONSTRAINT tree_scans_dbh_method_check
    CHECK (dbh_method IN (
        'yolo_opencv_hybrid', 'opencv_fallback', 'manual', 'mock', 'multi_view_avg'
    ));
