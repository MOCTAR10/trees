-- Slice 19 — Accueil opérateur : identité de la personne, chantiers et
-- projets participatifs, participation sur invitation ou libre.
-- Additive and idempotent.

-- Identity of the person behind the account (greeting, reports, PDF).
ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name  TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS matricule  TEXT;

-- Project kind: an official work site (chantier) or an open citizen-science
-- campaign (participatif); participation open to all or on invitation.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'participatif';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS participation TEXT NOT NULL DEFAULT 'open';
-- A chantier is the field work of an annual cut block (AAC): its zone is the
-- AAC polygon and its scope the registry trees of that AAC.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS aac_id INTEGER REFERENCES annual_cut_blocks(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_projects_aac ON projects (aac_id);
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'projects_kind_check') THEN
        ALTER TABLE projects ADD CONSTRAINT projects_kind_check
            CHECK (kind IN ('chantier', 'participatif'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'projects_participation_check') THEN
        ALTER TABLE projects ADD CONSTRAINT projects_participation_check
            CHECK (participation IN ('open', 'invitation'));
    END IF;
END $$;

-- Participants are people (any role), not only companies.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'project_participants' AND column_name = 'company_id'
    ) THEN
        ALTER TABLE project_participants RENAME COLUMN company_id TO user_id;
    END IF;
END $$;

ALTER TABLE project_participants ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE project_participants ADD COLUMN IF NOT EXISTS invited_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE project_participants ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_participants_status_check') THEN
        ALTER TABLE project_participants ADD CONSTRAINT project_participants_status_check
            CHECK (status IN ('invited', 'active', 'declined'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_project_participants_user ON project_participants (user_id, status);
CREATE INDEX IF NOT EXISTS idx_tree_scans_user_created ON tree_scans (user_id, created_at DESC);
