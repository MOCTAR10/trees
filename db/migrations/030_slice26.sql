-- =====================================================================
-- Slice 26 — Registre de transformation (usine) et suites des contrôles
-- Idempotent: safe to re-run against a live volume.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Registre de transformation : sorties d'usine (les entrées sont les
--    bordereaux réceptionnés, dérivés à la lecture)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mill_outputs (
    id                      SERIAL PRIMARY KEY,
    org_id                  INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    produced_on             DATE NOT NULL DEFAULT CURRENT_DATE,
    product_type            TEXT NOT NULL
                            CHECK (product_type IN ('sciage', 'placage', 'contreplaque',
                                                    'bois_profile', 'autre')),
    species_scientific_name TEXT,
    volume_m3               DOUBLE PRECISION NOT NULL CHECK (volume_m3 > 0 AND volume_m3 <= 10000),
    tree_codes              TEXT[] NOT NULL DEFAULT '{}',
    lot_reference           TEXT,
    destination             TEXT CHECK (destination IN ('local', 'export')),
    notes                   TEXT,
    recorded_by             INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mill_outputs_org ON mill_outputs (org_id, produced_on);

-- ---------------------------------------------------------------------
-- 2. Suites d'un contrôle non conforme (mise en demeure, amende,
--    transaction, saisie, suspension, poursuites) — « à valider par le métier »
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS control_followups (
    id              SERIAL PRIMARY KEY,
    control_id      INTEGER NOT NULL REFERENCES field_controls(id) ON DELETE CASCADE,
    action_type     TEXT NOT NULL
                    CHECK (action_type IN ('mise_en_demeure', 'amende', 'transaction',
                                           'saisie', 'suspension', 'poursuite')),
    amount_fcfa     DOUBLE PRECISION CHECK (amount_fcfa IS NULL OR amount_fcfa >= 0),
    reference       TEXT,
    due_at          DATE,
    status          TEXT NOT NULL DEFAULT 'notifie'
                    CHECK (status IN ('notifie', 'conteste', 'execute', 'annule')),
    notes           TEXT,
    reply           TEXT,
    replied_at      TIMESTAMPTZ,
    decision_motif  TEXT,
    decided_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
    closed_by       INTEGER REFERENCES users(id) ON DELETE SET NULL,
    closed_at       TIMESTAMPTZ,
    close_motif     TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_control_followups_control ON control_followups (control_id);
CREATE INDEX IF NOT EXISTS idx_control_followups_open ON control_followups (status, due_at);
