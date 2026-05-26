-- migrate:up
-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 0 / T0.4: Add SHA-256 tamper-evident hash chain to audit_logs
--
-- content_hash: SHA-256 of (action|entity_type|entity_id|old_data|new_data|created_at|prev_hash)
-- prev_hash:    content_hash of the chronologically previous audit_log for this company
--
-- The audit-chain.service.ts already handles pre-migration rows gracefully
-- (rows with NULL content_hash are skipped in chain verification).
-- New rows get stamped immediately after insert via lib/audit.ts.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS content_hash text,
  ADD COLUMN IF NOT EXISTS prev_hash     text;

-- Performance: chain verification walks rows in (company_id, created_at ASC) order
CREATE INDEX IF NOT EXISTS idx_audit_logs_company_created_chain
  ON audit_logs (company_id, created_at ASC)
  WHERE content_hash IS NOT NULL;

-- Quick lookup: find a row by its hash (for cross-referencing)
CREATE INDEX IF NOT EXISTS idx_audit_logs_content_hash
  ON audit_logs (content_hash)
  WHERE content_hash IS NOT NULL;

COMMENT ON COLUMN audit_logs.content_hash IS
  'SHA-256 of (action|entity_type|entity_id|old_data|new_data|created_at|prev_hash). NULL for pre-migration rows.';

COMMENT ON COLUMN audit_logs.prev_hash IS
  'content_hash of the preceding audit_log row for this company. NULL for first row or pre-migration rows.';

-- migrate:down
DROP INDEX IF EXISTS idx_audit_logs_content_hash;
DROP INDEX IF EXISTS idx_audit_logs_company_created_chain;

ALTER TABLE audit_logs
  DROP COLUMN IF EXISTS content_hash,
  DROP COLUMN IF EXISTS prev_hash;
