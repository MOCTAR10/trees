-- =====================================================================
-- Slice 14 — Mesure de l'arbre : DBH fiabilisé, hauteur mesurée,
--             stock de carbone vivant.
--
-- Le DBH d'un scan provient désormais d'une **référence terrain** (ruban à
-- 1,30 m → C / π, ou compas forestier) lorsqu'elle est saisie, la vision
-- (silhouette tangente + focale EXIF) servant de contrôle croisé ; à défaut,
-- de la vision seule, filtrée par un garde de plausibilité. Les colonnes
-- ci-dessous conservent ce contrôle et la qualité de la mesure, ainsi que la
-- hauteur (clinomètre / saisie / courbe H-D) et le stock de carbone dérivé
-- (Chave 2014 AGB + racines, fraction carbone IPCC 0,47). Additif et sûr.
-- =====================================================================

ALTER TABLE tree_scans
    ADD COLUMN IF NOT EXISTS dbh_vision_cm DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS dbh_uncertainty_cm DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS measurement_notes JSONB,
    ADD COLUMN IF NOT EXISTS height_method TEXT,
    ADD COLUMN IF NOT EXISTS aboveground_biomass_kg DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS carbon_stock_kg DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS co2e_kg DOUBLE PRECISION;

-- Nouvelles provenances du DBH (référence terrain, profil de bords, médiane
-- multi-vues, non mesuré). Les anciennes valeurs restent admises.
ALTER TABLE tree_scans DROP CONSTRAINT IF EXISTS tree_scans_dbh_method_check;
ALTER TABLE tree_scans ADD CONSTRAINT tree_scans_dbh_method_check
    CHECK (dbh_method IN (
        'yolo_opencv_hybrid', 'opencv_fallback', 'opencv_edge_profile', 'vision',
        'multi_view_avg', 'multi_view_median',
        'tape_circumference', 'caliper', 'manual',
        'unavailable', 'mock'
    ));
