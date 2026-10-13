-- =====================================================================
-- Slice 18 — DBH par bords confirmés par l'opérateur.
--
-- L'opérateur place (ou ajuste) les deux bords du tronc sur la photo DBH ;
-- le diamètre est calculé hors-ligne sur le téléphone et recalculé par le
-- serveur avec la même géométrie (méthode ``operator_edges``). Additif.
-- =====================================================================

ALTER TABLE tree_scans DROP CONSTRAINT IF EXISTS tree_scans_dbh_method_check;
ALTER TABLE tree_scans ADD CONSTRAINT tree_scans_dbh_method_check
    CHECK (dbh_method IN (
        'operator_edges',
        'sam2_opencv', 'opencv_depth',
        'yolo_opencv_hybrid', 'opencv_fallback', 'opencv_edge_profile', 'vision',
        'multi_view_avg', 'multi_view_median',
        'tape_circumference', 'caliper', 'manual',
        'unavailable', 'mock'
    ));
