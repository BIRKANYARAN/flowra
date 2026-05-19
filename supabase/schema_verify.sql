-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Flowra Enterprise — Schema Verification
-- Run in Supabase SQL Editor after FLOWRA_FULL_INSTALL.sql
-- Expected: ALL rows show ✅
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- ── TABLE EXISTENCE ──────────────────────────────────────────────────────────
SELECT 'TABLE' as check_type, table_name as object_name,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = t.table_name
  ) THEN '✅ EXISTS' ELSE '❌ MISSING' END as status
FROM (VALUES
  ('companies'),
  ('company_members'),
  ('user_settings'),
  ('customers'),
  ('products'),
  ('banks'),
  ('expenses'),
  ('partners'),
  ('partner_loans'),
  ('stock_lots'),
  ('stock_movements'),
  ('proformas'),
  ('proforma_items'),
  ('sales'),
  ('sale_items'),
  ('sale_item_allocations'),
  ('collections'),
  ('tasks'),
  ('idempotency_keys'),
  ('event_outbox'),
  ('jobs'),
  ('monthly_metrics'),
  ('audit_logs'),
  ('interest_rates'),
  ('accounting_periods'),
  ('simulation_scenarios'),
  ('balance_sheet_snapshots'),
  ('partner_finance_events'),
  ('partner_loan_tranches'),
  ('partner_capital_commitments'),
  ('partner_compensation_schedules'),
  ('alert_rules'),
  ('journal_entries'),
  ('journal_entry_lines'),
  ('backfill_runs'),
  ('job_runs')
) t(table_name)

UNION ALL

-- ── COLUMN EXISTENCE ─────────────────────────────────────────────────────────
SELECT 'COLUMN', col_check, status FROM (
  SELECT 'companies.gl_mode' as col_check,
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='companies' AND column_name='gl_mode') THEN '✅ EXISTS' ELSE '❌ MISSING' END as status
  UNION ALL SELECT 'sales.payment_status',
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sales' AND column_name='payment_status') THEN '✅ EXISTS' ELSE '❌ MISSING' END
  UNION ALL SELECT 'sales.due_date',
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sales' AND column_name='due_date') THEN '✅ EXISTS' ELSE '❌ MISSING' END
  UNION ALL SELECT 'sales.paid_amount',
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sales' AND column_name='paid_amount') THEN '✅ EXISTS' ELSE '❌ MISSING' END
  UNION ALL SELECT 'tasks.status',
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tasks' AND column_name='status') THEN '✅ EXISTS' ELSE '❌ MISSING' END
  UNION ALL SELECT 'tasks.due_date',
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tasks' AND column_name='due_date') THEN '✅ EXISTS' ELSE '❌ MISSING' END
  UNION ALL SELECT 'audit_logs.content_hash',
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='audit_logs' AND column_name='content_hash') THEN '✅ EXISTS' ELSE '❌ MISSING' END
  UNION ALL SELECT 'audit_logs.prev_hash',
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='audit_logs' AND column_name='prev_hash') THEN '✅ EXISTS' ELSE '❌ MISSING' END
  UNION ALL SELECT 'audit_logs.entity_type',
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='audit_logs' AND column_name='entity_type') THEN '✅ EXISTS' ELSE '❌ MISSING' END
  UNION ALL SELECT 'sales.kdv_amount_try',
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sales' AND column_name='kdv_amount_try') THEN '✅ EXISTS' ELSE '❌ MISSING' END
  UNION ALL SELECT 'sale_items.kdv_rate',
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sale_items' AND column_name='kdv_rate') THEN '✅ EXISTS' ELSE '❌ MISSING' END
  UNION ALL SELECT 'partner_loan_tranches.interest_rate_annual_pct',
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='partner_loan_tranches' AND column_name='interest_rate_annual_pct') THEN '✅ EXISTS' ELSE '❌ MISSING' END
  UNION ALL SELECT 'partner_loan_tranches.annual_interest_rate',
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='partner_loan_tranches' AND column_name='annual_interest_rate') THEN '✅ EXISTS' ELSE '❌ MISSING' END
  UNION ALL SELECT 'accounting_periods.gl_enabled',
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='accounting_periods' AND column_name='gl_enabled') THEN '✅ EXISTS' ELSE '❌ MISSING' END
  UNION ALL SELECT 'accounting_periods.pre_close_at',
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='accounting_periods' AND column_name='pre_close_at') THEN '✅ EXISTS' ELSE '❌ MISSING' END
  UNION ALL SELECT 'journal_entries.is_voided',
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='journal_entries' AND column_name='is_voided') THEN '✅ EXISTS' ELSE '❌ MISSING' END
  UNION ALL SELECT 'job_runs.idempotency_key',
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='job_runs' AND column_name='idempotency_key') THEN '✅ EXISTS' ELSE '❌ MISSING' END
) col_checks

UNION ALL

-- ── RLS STATUS ───────────────────────────────────────────────────────────────
SELECT 'RLS', tablename,
  CASE WHEN rowsecurity = true THEN '✅ RLS ON' ELSE '❌ RLS OFF' END
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'companies','company_members','sales','expenses','purchases','partners',
    'partner_finance_events','journal_entries','journal_entry_lines',
    'accounting_periods','audit_logs','alert_rules','job_runs',
    'simulation_scenarios','balance_sheet_snapshots'
  )

UNION ALL

-- ── ENUM TYPES ───────────────────────────────────────────────────────────────
SELECT 'ENUM', type_check, status FROM (
  SELECT 'payment_status_enum' as type_check,
    CASE WHEN EXISTS (SELECT 1 FROM pg_type WHERE typname='payment_status_enum') THEN '✅ EXISTS' ELSE '❌ MISSING' END as status
  UNION ALL SELECT 'period_status_enum',
    CASE WHEN EXISTS (SELECT 1 FROM pg_type WHERE typname='period_status_enum') THEN '✅ EXISTS' ELSE '❌ MISSING' END
  UNION ALL SELECT 'task_status_enum',
    CASE WHEN EXISTS (SELECT 1 FROM pg_type WHERE typname='task_status_enum') THEN '✅ EXISTS' ELSE '❌ MISSING' END
  UNION ALL SELECT 'member_role_enum',
    CASE WHEN EXISTS (SELECT 1 FROM pg_type WHERE typname='member_role_enum') THEN '✅ EXISTS' ELSE '❌ MISSING' END
) enum_checks

UNION ALL

-- ── ENUM VALUES (period_status_enum must include pre_close) ──────────────────
SELECT 'ENUM_VALUES', 'period_status_enum',
  string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder)
FROM pg_type t
JOIN pg_enum e ON t.oid = e.enumtypid
WHERE t.typname = 'period_status_enum'

UNION ALL

-- ── FUNCTION EXISTENCE ───────────────────────────────────────────────────────
SELECT 'FUNCTION', routine_name,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.routines
    WHERE routine_schema='public' AND routine_name=f.routine_name
  ) THEN '✅ EXISTS' ELSE '❌ MISSING' END
FROM (VALUES
  ('bootstrap_user_company'),
  ('create_proforma_atomic'),
  ('convert_proforma_to_sale'),
  ('is_company_member'),
  ('is_company_admin'),
  ('create_journal_entry'),
  ('verify_audit_chain'),
  ('upsert_monthly_metrics'),
  ('enqueue_job'),
  ('claim_next_job'),
  ('complete_job'),
  ('fail_job'),
  ('touch_updated_at'),
  ('fn_check_journal_entry_balance'),
  ('fn_guard_period_write')
) f(routine_name)

UNION ALL

-- ── TRIGGER EXISTENCE ────────────────────────────────────────────────────────
SELECT 'TRIGGER', tgname,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = t.tgname
  ) THEN '✅ EXISTS' ELSE '❌ MISSING' END
FROM (VALUES
  ('trg_journal_entry_balance'),
  ('trg_guard_period_sales'),
  ('trg_guard_period_expenses'),
  ('accounting_periods_updated_at'),
  ('alert_rules_updated_at')
) t(tgname)

UNION ALL

-- ── VIEW EXISTENCE ───────────────────────────────────────────────────────────
SELECT 'VIEW', table_name,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.views
    WHERE table_schema='public' AND table_name=v.table_name
  ) THEN '✅ EXISTS' ELSE '❌ MISSING' END
FROM (VALUES
  ('v_gl_account_balances'),
  ('v_trial_balance'),
  ('alert_rule_audit')
) v(table_name)

UNION ALL

-- ── GL MODE CHECK ────────────────────────────────────────────────────────────
SELECT 'GL_MODE', 'companies with gl_mode',
  COALESCE(
    (SELECT string_agg(name || '=' || COALESCE(gl_mode,'NULL'), ', ') FROM companies WHERE deleted_at IS NULL LIMIT 5),
    '(no companies yet — OK for clean install)'
  )

UNION ALL

-- ── ALERT RULES SEED CHECK ───────────────────────────────────────────────────
SELECT 'SEED', 'alert_rules count',
  COALESCE(
    (SELECT count(*)::text || ' rules across ' || count(distinct company_id)::text || ' companies' FROM alert_rules),
    '0'
  )

ORDER BY 1, 2;
