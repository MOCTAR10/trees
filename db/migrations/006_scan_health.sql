-- 006_scan_health.sql — Persist the bark health heuristic on scans (Diagnostic tab)
-- Idempotent: safe to re-run against a live volume.

ALTER TABLE tree_scans ADD COLUMN IF NOT EXISTS health_status TEXT;
