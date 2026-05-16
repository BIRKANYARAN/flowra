-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Flowra Enterprise Schema Verification
-- Run in Supabase SQL Editor after running flowra_FULL_MIGRATION.sql
-- Expected result: all 'status' column values = 'EXISTS'
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SELECT 'TABLE CHECK' as check_type, table_name as object_name,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = t.table_name
  ) THEN '✅ EXISTS' ELSE '❌ MISSING' END as status
FROM (VALUES
  ('companies'),
  ('company_members'),
  ('partners'),
  ('sales'),
  ('sale_items'),
  ('expenses'),
  ('purchases'),
  ('purchase_items'),
  ('products'),
  ('stock_lots'),
  ('partner_transactions'),
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
  ('audit_logs'),
  ('job_runs')
) t(table_name)

UNION ALL

SELECT 'COLUMN CHECK', col_check, status FROM (
  SELECT 'audit_logs.content_hash' as col_check,
    CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'audit_logs' AND column_name = 'content_hash'
    ) THEN '✅ EXISTS' ELSE '❌ MISSING' END as status
  UNION ALL
  SELECT 'audit_logs.prev_hash',
    CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'audit_logs' AND column_name = 'prev_hash'
    ) THEN '✅ EXISTS' ELSE '❌ MISSING' END
  UNION ALL
  SELECT 'partner_loan_tranches.annual_interest_rate',
    CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'partner_loan_tranches' AND column_name = 'annual_interest_rate'
    ) THEN '✅ EXISTS' ELSE '❌ MISSING' END
  UNION ALL
  SELECT 'companies.gl_mode',
    CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'companies' AND column_name = 'gl_mode'
    ) THEN '✅ EXISTS' ELSE '❌ MISSING' END
  UNION ALL
  SELECT 'tasks.status',
    CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'status'
    ) THEN '✅ EXISTS' ELSE '❌ MISSING' END
  UNION ALL
  SELECT 'sales.payment_status',
    CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'sales' AND column_name = 'payment_status'
    ) THEN '✅ EXISTS' ELSE '❌ MISSING' END
  UNION ALL
  SELECT 'sales.due_date',
    CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'sales' AND column_name = 'due_date'
    ) THEN '✅ EXISTS' ELSE '❌ MISSING' END
) col_checks

UNION ALL

SELECT 'RLS CHECK', table_name,
  CASE WHEN rowsecurity = true THEN '✅ RLS ON' ELSE '❌ RLS OFF' END
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'companies', 'sales', 'expenses', 'purchases', 'partners',
    'partner_finance_events', 'journal_entries', 'accounting_periods',
    'audit_logs', 'alert_rules', 'job_runs'
  )

UNION ALL

SELECT 'ENUM CHECK', 'period_status_enum',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'period_status_enum'
  ) THEN '✅ EXISTS' ELSE '❌ MISSING' END

UNION ALL

SELECT 'ENUM CHECK', 'period_status_enum values',
  string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder)
FROM pg_type t
JOIN pg_enum e ON t.oid = e.enumtypid
WHERE t.typname = 'period_status_enum'

UNION ALL

SELECT 'GL MODE CHECK', 'companies with gl_mode',
  COALESCE(
    (SELECT string_agg(name || '=' || COALESCE(gl_mode, 'NULL'), ', ')
     FROM companies LIMIT 5),
    '(no companies yet)'
  )

ORDER BY 1, 2;
