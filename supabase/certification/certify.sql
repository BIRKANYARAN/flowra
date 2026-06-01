-- ════════════════════════════════════════════════════════════════════════════
-- FLOWRA PRODUCTION CERTIFICATION — read-only verification (items 1,3,4,5,7,8,9,13)
--
-- Run against PRODUCTION as a role that can read pg_catalog (service role / owner):
--   psql "$DATABASE_URL" -f supabase/certification/certify.sql
-- Every check emits a row: check | status (PASS/FAIL/WARN) | detail.
-- READ-ONLY: no DDL/DML. Safe to run anytime.
-- ════════════════════════════════════════════════════════════════════════════
\pset pager off
\timing off

-- ── 1+2. Schema drift: the 7 folded tables must EXIST in production ───────────
WITH expected(t) AS (VALUES
  ('alert_feed'),('company_documents'),('decision_context_snapshots'),
  ('kpi_targets'),('monthly_budgets'),('partner_compensation_payments'),
  ('product_reorder_thresholds'))
SELECT 'schema_drift:'||e.t AS check,
       CASE WHEN c.relname IS NULL THEN 'FAIL' ELSE 'PASS' END AS status,
       CASE WHEN c.relname IS NULL THEN 'MISSING — apply its migration to prod' ELSE 'present' END AS detail
FROM expected e
LEFT JOIN pg_class c ON c.relname = e.t AND c.relkind='r'
ORDER BY 1;

-- ── 3. RPC inventory: required functions must EXIST with expected arity ───────
WITH expected(fn, args) AS (VALUES
  ('convert_proforma_to_sale', 7),
  ('claim_event_batch', 2),
  ('upsert_monthly_metrics', 9),
  ('claim_next_job', 1),
  ('fail_job', 2))
SELECT 'rpc:'||e.fn AS check,
       CASE WHEN p.proname IS NULL THEN 'FAIL'
            WHEN p.pronargs <> e.args THEN 'WARN' ELSE 'PASS' END AS status,
       COALESCE('args='||p.pronargs||' expected='||e.args, 'MISSING') AS detail
FROM expected e
LEFT JOIN pg_proc p ON p.proname = e.fn
LEFT JOIN pg_namespace n ON n.oid=p.pronamespace AND n.nspname='public'
ORDER BY 1;

-- ── 4+10(static). RLS coverage: every RLS-enabled table must have >=1 policy ──
SELECT 'rls_no_policy:'||c.relname AS check, 'FAIL' AS status,
       'RLS enabled but ZERO policies (deny-all leak risk)' AS detail
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace AND n.nspname='public'
WHERE c.relkind='r' AND c.relrowsecurity
  AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid)
UNION ALL
-- Tables with company_id but RLS DISABLED (tenant-leak risk)
SELECT 'rls_disabled_tenant_table:'||c.relname, 'FAIL',
       'has company_id but ROW LEVEL SECURITY is OFF'
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace AND n.nspname='public'
JOIN pg_attribute a ON a.attrelid=c.oid AND a.attname='company_id' AND a.attnum>0
WHERE c.relkind='r' AND NOT c.relrowsecurity
UNION ALL
SELECT 'rls_summary', 'PASS',
       (SELECT count(*)::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity)||' RLS tables, '||
       (SELECT count(*)::text FROM pg_policy)||' policies';

-- ── 5+8. Cron / job-runner state ─────────────────────────────────────────────
SELECT 'pg_cron_installed', CASE WHEN count(*)>0 THEN 'PASS' ELSE 'WARN' END,
       CASE WHEN count(*)>0 THEN 'pg_cron present (DB-scheduled jobs possible)'
            ELSE 'pg_cron NOT installed — scheduling is via Vercel Cron only' END
FROM pg_extension WHERE extname='pg_cron';
-- job_runs backlog (idempotency purge worker)
SELECT 'job_runs_recent', CASE WHEN to_regclass('public.job_runs') IS NULL THEN 'WARN' ELSE 'PASS' END,
       COALESCE((SELECT 'last run '||max(created_at)::text FROM job_runs), 'job_runs table absent or empty');

-- ── 9. Event outbox: backlog + processor schema sanity ───────────────────────
SELECT 'event_outbox_backlog',
       CASE WHEN to_regclass('public.event_outbox') IS NULL THEN 'WARN'
            WHEN (SELECT count(*) FROM event_outbox WHERE processed=false) > 0 THEN 'FAIL' ELSE 'PASS' END,
       CASE WHEN to_regclass('public.event_outbox') IS NULL THEN 'event_outbox table absent'
            ELSE COALESCE((SELECT count(*)::text FROM event_outbox WHERE processed=false),'0')||' undrained events' END;
-- Confirm event_outbox has the columns the processor must use (processed/claimed_by/error)
SELECT 'event_outbox_schema',
       CASE WHEN bool_and(present) THEN 'PASS' ELSE 'FAIL' END,
       string_agg(col||'='||present::text, ' ') AS detail
FROM (
  SELECT col, EXISTS(SELECT 1 FROM information_schema.columns
                     WHERE table_name='event_outbox' AND column_name=col) AS present
  FROM (VALUES ('company_id'),('processed'),('claimed_by'),('error'),('retry_count')) v(col)
) s;

-- ── 13. Audit chain vs PRODUCTION data — recompute & count broken links ──────
-- Mirrors lib/services/audit-chain.service.ts: content_hash =
--   sha256( action|entity_type|entity_id|old_data::json|new_data::json|created_at  +  prev.content_hash )
-- ordered by created_at per company. Reports rows whose stored hash != recomputed.
WITH ordered AS (
  SELECT company_id, id, action, entity_type, entity_id, old_data, new_data,
         created_at, content_hash,
         lag(content_hash) OVER (PARTITION BY company_id ORDER BY created_at) AS prev_hash
  FROM audit_logs
  WHERE content_hash IS NOT NULL
), recomputed AS (
  SELECT company_id, id, content_hash,
         encode(digest(
           concat_ws('|',
             coalesce(action,''), coalesce(entity_type,''), coalesce(entity_id,''),
             coalesce(old_data::text,'null'), coalesce(new_data::text,'null'),
             coalesce(created_at::text,''))
           || coalesce(prev_hash,''), 'sha256'), 'hex') AS expected
  FROM ordered
)
SELECT 'audit_chain_integrity',
       CASE WHEN count(*) FILTER (WHERE content_hash<>expected)=0 THEN 'PASS' ELSE 'FAIL' END,
       count(*)::text||' stamped rows, '||
       count(*) FILTER (WHERE content_hash<>expected)::text||' broken links' AS detail
FROM recomputed;
-- NOTE: requires pgcrypto (digest). If absent: CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- Rows stamped BEFORE the verifier fix used the same payload formula, so a clean
-- prod chain should report 0 broken links here.
