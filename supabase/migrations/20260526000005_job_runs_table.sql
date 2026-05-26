-- migrate:up
-- ─────────────────────────────────────────────────────────────────────────────
-- Async job tracking table
--
-- Records every background job execution: interest accrual, overdue updates,
-- PDF generation, etc. Used for observability, deduplication via idempotency_key,
-- and detecting stale running jobs.
-- No RLS — accessed via service role only.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS job_runs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid REFERENCES companies(id) ON DELETE CASCADE,  -- null = platform-wide job
  job_type          text NOT NULL,  -- 'interest_accrual', 'overdue_update', 'pdf_generation', etc.
  status            text NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed','skipped')),
  started_at        timestamptz NOT NULL DEFAULT now(),
  completed_at      timestamptz,
  error_message     text,
  records_processed integer DEFAULT 0,
  metadata          jsonb DEFAULT '{}',
  idempotency_key   text UNIQUE  -- job_type + company_id + date to prevent duplicates
);

CREATE INDEX IF NOT EXISTS idx_job_runs_company_type
  ON job_runs(company_id, job_type, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_runs_status
  ON job_runs(status) WHERE status = 'running';

-- No RLS needed — job_runs is internal, accessed via service role only

-- migrate:down
DROP INDEX IF EXISTS idx_job_runs_status;
DROP INDEX IF EXISTS idx_job_runs_company_type;
DROP TABLE IF EXISTS job_runs;
