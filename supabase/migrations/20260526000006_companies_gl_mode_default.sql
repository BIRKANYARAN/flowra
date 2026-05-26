-- migrate:up
-- ─────────────────────────────────────────────────────────────────────────────
-- Add gl_mode column to companies table
--
-- Controls how the GL engine writes journal entries for this company:
--   shadow      = no journal entries written (read-only shadow mode)
--   parallel    = async journal entries (non-blocking)
--   gl_primary  = sync blocking journal entries (full GL primary mode)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS gl_mode text NOT NULL DEFAULT 'shadow'
  CHECK (gl_mode IN ('shadow', 'parallel', 'gl_primary'));

COMMENT ON COLUMN companies.gl_mode IS
  'GL write mode: shadow=no journal entries, parallel=async journal entries, gl_primary=sync blocking';

-- migrate:down
ALTER TABLE companies DROP COLUMN IF EXISTS gl_mode;
