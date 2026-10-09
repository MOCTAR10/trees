-- 004_rbac.sql — Role-based access control for users (Track F)
-- Adds credentials + role wiring on top of the pre-existing users table.
-- Idempotent: safe to re-run against a live volume.

ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- cooperative users are tied to a community cooperative (residue recipient)
ALTER TABLE users ADD COLUMN IF NOT EXISTS cooperative_id INTEGER
    REFERENCES community_cooperatives(id) ON DELETE SET NULL;

-- operators/company users belong to a logging company (self-reference)
ALTER TABLE users ADD COLUMN IF NOT EXISTS company_id INTEGER
    REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_company ON users(company_id);
