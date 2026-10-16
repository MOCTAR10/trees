CREATE TABLE IF NOT EXISTS species_occurrence_cache (
    scientific_name TEXT NOT NULL,
    cell_lat        DOUBLE PRECISION NOT NULL,
    cell_lon        DOUBLE PRECISION NOT NULL,
    occurrences     INTEGER NOT NULL,
    checked_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (scientific_name, cell_lat, cell_lon)
);

CREATE TABLE IF NOT EXISTS species_learned (
    scientific_name TEXT PRIMARY KEY,
    family          TEXT,
    common_names    TEXT[] NOT NULL DEFAULT '{}',
    seen_count      INTEGER NOT NULL DEFAULT 0,
    best_score      DOUBLE PRECISION,
    first_seen      TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen       TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_latitude   DOUBLE PRECISION,
    last_longitude  DOUBLE PRECISION
);
CREATE INDEX IF NOT EXISTS idx_species_learned_seen ON species_learned (seen_count DESC);
