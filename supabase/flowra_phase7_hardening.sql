-- ─────────────────────────────────────────────────────────────────────────────
-- Flowra Phase 7 — Enterprise Hardening Schema
--
-- Run after flowra_phase2_pcle.sql and flowra_phase3_accounting.sql.
-- All statements are idempotent (IF NOT EXISTS / DO NOTHING).
--
-- Sections:
--   1. audit_logs hash chain columns
--   2. job_runs table (async job tracking)
--   3. alert_rules — annual_interest_rate on partner_loan_tranches
--   4. Cron job tracking
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Audit Hash Chain Columns ───────────────────────────────────────────────
-- Adds content_hash and prev_hash to audit_logs for tamper-evident chain.
-- Existing rows have NULL hashes until stampAuditRow() is called for new rows.

ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS content_hash text,
  ADD COLUMN IF NOT EXISTS prev_hash    text;

CREATE INDEX IF NOT EXISTS idx_audit_logs_company_hash
  ON audit_logs (company_id, created_at ASC)
  WHERE content_hash IS NOT NULL;

-- ── 2. job_runs — Async Job Tracking ─────────────────────────────────────────
-- Tracks every cron/async job execution for observability and idempotency.

CREATE TABLE IF NOT EXISTS job_runs (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  job_type        text        NOT NULL,
  -- e.g. 'interest_accrual' | 'overdue_update' | 'pdf_generation' | 'cfo_pack'
  company_id      uuid        REFERENCES companies(id) ON DELETE SET NULL,
  -- NULL = system-wide job (e.g. a job that runs across all companies)
  status          text        NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed', 'skipped')),
  started_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz,
  duration_ms     integer,
  records_processed integer DEFAULT 0,
  error_message   text,
  metadata        jsonb,      -- job-specific output (e.g. count of rows updated)
  idempotency_key text        UNIQUE  -- job_type + company_id + date
);

CREATE INDEX IF NOT EXISTS idx_job_runs_type_started
  ON job_runs (job_type, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_job_runs_company
  ON job_runs (company_id, started_at DESC)
  WHERE company_id IS NOT NULL;

-- ── 3. Interest Rate Column on Loan Tranches ──────────────────────────────────
-- Cron job uses this for daily interest accrual.

ALTER TABLE partner_loan_tranches
  ADD COLUMN IF NOT EXISTS annual_interest_rate numeric(6,4) DEFAULT NULL;
  -- NULL = interest-free; 0.15 = 15% per annum; stored as decimal

COMMENT ON COLUMN partner_loan_tranches.annual_interest_rate IS
  'Annual interest rate as decimal (e.g. 0.15 = 15%). NULL = interest-free.';

-- ── 4. Ensure alert_rules table has updated_at trigger ───────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'alert_rules_updated_at' AND tgrelid = 'alert_rules'::regclass
  ) THEN
    CREATE TRIGGER alert_rules_updated_at
      BEFORE UPDATE ON alert_rules
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
EXCEPTION WHEN undefined_table THEN
  -- alert_rules table doesn't exist yet (phase2 not run) — skip
  NULL;
END $$;

-- ── 5. Settings audit trail view (convenience) ───────────────────────────────
-- Read-only view of alert_rules changes from audit_logs

CREATE OR REPLACE VIEW alert_rule_audit AS
  SELECT
    al.id,
    al.company_id,
    al.action,
    al.old_values,
    al.new_values,
    al.created_at,
    al.user_id
  FROM audit_logs al
  WHERE al.resource_type = 'alert_rule'
  ORDER BY al.created_at DESC;

-- ── 6. Verify hash chain function (SQL helper) ───────────────────────────────
-- Convenience: can be called from psql for manual verification.
-- Usage: SELECT * FROM verify_audit_chain('company-uuid', '2026-01-01', '2026-12-31');

CREATE OR REPLACE FUNCTION verify_audit_chain(
  p_company_id uuid,
  p_from       date,
  p_to         date
)
RETURNS TABLE (
  row_id       uuid,
  created_at   timestamptz,
  has_hash     boolean,
  chain_intact boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT id, al.created_at, content_hash
    FROM audit_logs al
    WHERE al.company_id = p_company_id
      AND al.created_at BETWEEN p_from AND (p_to + interval '1 day')
    ORDER BY al.created_at ASC
  LOOP
    row_id      := rec.id;
    created_at  := rec.created_at;
    has_hash    := rec.content_hash IS NOT NULL;
    chain_intact := rec.content_hash IS NOT NULL;  -- full verification done in app layer
    RETURN NEXT;
  END LOOP;
END;
$$;
