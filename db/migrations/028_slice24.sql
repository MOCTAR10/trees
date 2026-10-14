-- =====================================================================
-- Slice 24 — Échéances légales
-- AAC : dates d'ouverture et de fermeture (ouverture limitée à 3 ans, art. 121).
-- États annuels : transmission tracée (échéance du 31 mars, art. 244).
-- Idempotent : peut être rejoué sur une base existante.
-- =====================================================================

ALTER TABLE annual_cut_blocks
    ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

UPDATE annual_cut_blocks b
   SET opened_at = COALESCE(
       (SELECT min(a.issued_at) FROM aac_authorizations a
         WHERE a.aac_id = b.id AND a.status = 'delivre'),
       b.created_at)
 WHERE b.opened_at IS NULL AND b.status IN ('ouvert', 'ferme');

CREATE TABLE IF NOT EXISTS statement_filings (
    id           SERIAL PRIMARY KEY,
    org_id       INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    period_year  INTEGER NOT NULL CHECK (period_year BETWEEN 2000 AND 2100),
    period_kind  TEXT NOT NULL DEFAULT 'annuel' CHECK (period_kind IN ('annuel', 'trimestriel')),
    quarter      INTEGER CHECK (quarter BETWEEN 1 AND 4),
    stems_felled INTEGER,
    volume_m3    DOUBLE PRECISION,
    reference    TEXT,
    filed_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    filed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE NULLS NOT DISTINCT (org_id, period_year, period_kind, quarter)
);

CREATE INDEX IF NOT EXISTS idx_statement_filings_org ON statement_filings (org_id, period_year);
