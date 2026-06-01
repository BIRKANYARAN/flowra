-- ════════════════════════════════════════════════════════════════════════════
-- 20260602000002_hardening_and_idempotency.sql
--
-- Three safe, verified hardening fixes from the final correction audit:
--
-- (1) DATA INTEGRITY / RELIABILITY — interest-accrual double-post is irreversible.
--     The interest-accrual cron writes LOAN_INTEREST_ACCRUAL rows into the
--     append-only partner_finance_events ledger, deduped only by an app-level
--     SELECT-then-INSERT (TOCTOU). A concurrent double-fire could double-post
--     interest into a ledger with no UPDATE/DELETE. Add a partial UNIQUE index on
--     the exact dedup grain (company_id, event_type, event_date, reference=tranche:<id>)
--     so a second same-day accrual for a tranche is rejected by the DB.
--     Verified: 0 existing duplicate groups → index builds cleanly.
--
-- (2) SECURITY (defense-in-depth) — job_runs INSERT policy was WITH CHECK (true),
--     letting any authenticated/anon caller forge job-run history. The real writer
--     is the service-role worker (bypasses RLS), so restrict the RLS INSERT path to
--     company admins. Service-role inserts are unaffected.
--
-- (3) SECURITY (defense-in-depth) — the anon (public publishable key) role holds
--     blanket write grants on every public table. No anon WRITE path exists
--     anywhere (RLS WITH CHECK already blocks them), so revoke anon INSERT/UPDATE/
--     DELETE/TRUNCATE — closing the "future table without RLS is world-writable"
--     hole. anon SELECT is intentionally retained here (narrowing it is roadmapped
--     and lower value since RLS already blocks anon reads of tenant data).
--
-- Idempotent. Validated BEGIN/ROLLBACK against production.
-- ════════════════════════════════════════════════════════════════════════════

-- (1) interest-accrual idempotency
CREATE UNIQUE INDEX IF NOT EXISTS uq_loan_interest_accrual
  ON public.partner_finance_events (company_id, event_type, event_date, reference)
  WHERE event_type = 'LOAN_INTEREST_ACCRUAL';

-- (2) job_runs INSERT: block RLS-path forgery (service-role bypasses RLS, unaffected)
DROP POLICY IF EXISTS job_runs_insert_service ON public.job_runs;
CREATE POLICY job_runs_insert_service ON public.job_runs
  FOR INSERT
  WITH CHECK (company_id IS NOT NULL AND is_company_admin(company_id));

-- (3) anon: revoke all WRITE privileges (no legitimate anon write path exists)
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLES FROM anon;
