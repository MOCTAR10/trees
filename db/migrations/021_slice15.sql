-- =====================================================================
-- Slice 15 — Scanner IA : découpe du tronc (SAM 2.1), distance estimée
--             (Depth Anything V2), arbre du registre lié par QR, données
--             d'entraînement étiquetées.
--
-- * ``tree_code`` rattache un scan à la grume du registre (QR scanné) : le
--   DBH et le carbone suivent alors le titre / l'AAC de l'arbre.
-- * ``depth_source`` dit d'où vient la distance au tronc (``typed`` saisie,
--   ``ai`` estimée par le modèle de profondeur).
-- * ``media_key`` désigne le dossier de la photo DBH + masque conservés pour
--   un scan mesuré au ruban/compas (vérité terrain = jeu d'entraînement).
-- Additif et sûr.
-- =====================================================================

ALTER TABLE tree_scans
    ADD COLUMN IF NOT EXISTS tree_code TEXT,
    ADD COLUMN IF NOT EXISTS depth_source TEXT,
    ADD COLUMN IF NOT EXISTS media_key TEXT;

CREATE INDEX IF NOT EXISTS idx_tree_scans_tree_code ON tree_scans (tree_code);
CREATE INDEX IF NOT EXISTS idx_tree_scans_geom ON tree_scans USING GIST (geom);

ALTER TABLE tree_scans DROP CONSTRAINT IF EXISTS tree_scans_dbh_method_check;
ALTER TABLE tree_scans ADD CONSTRAINT tree_scans_dbh_method_check
    CHECK (dbh_method IN (
        'sam2_opencv', 'opencv_depth',
        'yolo_opencv_hybrid', 'opencv_fallback', 'opencv_edge_profile', 'vision',
        'multi_view_avg', 'multi_view_median',
        'tape_circumference', 'caliper', 'manual',
        'unavailable', 'mock'
    ));
