-- ════════════════════════════════════════════════════════════════════════════
-- FLOWRA — Phase 9-C: GL Primary Cutover Execution
--
-- ⚠️  DO NOT RUN until ALL conditions below are confirmed:
--
--   □ Minimum 24 hours in parallel mode with no GL imbalance alerts
--   □ Shadow audit: < 5% divergence on all 9 fields
--   □ Trial balance balanced for current period
--   □ /api/admin/gl-readiness returns decision = 'GO' or 'GO_WITH_WARNINGS'
--   □ Explicit user instruction received: "Advance to gl_primary"
--
-- Reversibility:
--   gl_primary → parallel: HIGH RISK (use supabase/flowra_phase9c_rollback.sql)
--   parallel → shadow:      LOW RISK (journal entries preserved, dual-write disabled)
--
-- Purpose: Advances qualifying companies from gl_mode='parallel' to 'gl_primary'.
-- Effect:
--   - Financial statements switch to read from GL accounts (not operational tables)
--   - Journal entries become the source of truth for all financial reporting
--   - Dual-write switches from async best-effort to sync blocking
-- ════════════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 0 — PRE-FLIGHT VALIDATION
-- Run these checks before advancing. All must pass.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_parallel_count  int;
  v_shadow_count    int;
  v_primary_count   int;
BEGIN
  SELECT
    COUNT(*) FILTER (WHERE gl_mode = 'parallel'),
    COUNT(*) FILTER (WHERE gl_mode = 'shadow'),
    COUNT(*) FILTER (WHERE gl_mode = 'gl_primary')
  INTO v_parallel_count, v_shadow_count, v_primary_count
  FROM companies;

  RAISE NOTICE 'Current state: % parallel, % shadow, % gl_primary',
    v_parallel_count, v_shadow_count, v_primary_count;

  IF v_parallel_count = 0 THEN
    RAISE EXCEPTION 'No companies in parallel mode. Nothing to advance.';
  END IF;
END $$;

-- Check: trial balance balanced for all parallel-mode companies
DO $$
DECLARE
  rec         record;
  v_total_dr  numeric;
  v_total_cr  numeric;
  v_imbalance numeric;
  v_failed    boolean := false;
BEGIN
  FOR rec IN
    SELECT id, name FROM companies WHERE gl_mode = 'parallel'
  LOOP
    SELECT
      COALESCE(SUM(jel.debit_try),  0),
      COALESCE(SUM(jel.credit_try), 0)
    INTO v_total_dr, v_total_cr
    FROM journal_entry_lines jel
    JOIN journal_entries je ON je.id = jel.entry_id
    WHERE je.company_id = rec.id;

    v_imbalance := ABS(v_total_dr - v_total_cr);

    IF v_imbalance > 0.02 THEN
      RAISE WARNING '[%] TRIAL BALANCE IMBALANCED: DR=% CR=% (delta=%). FIX BEFORE CUTOVER.',
        rec.name, v_total_dr, v_total_cr, v_imbalance;
      v_failed := true;
    ELSE
      RAISE NOTICE '[%] Trial balance OK: DR=% CR=% ✅', rec.name, v_total_dr, v_total_cr;
    END IF;
  END LOOP;

  IF v_failed THEN
    RAISE EXCEPTION 'Trial balance imbalance detected. Cannot advance to gl_primary.';
  END IF;

  RAISE NOTICE 'All pre-flight checks passed. Safe to advance.';
END $$;

-- Check: no missing journal entries
DO $$
DECLARE
  v_missing_sales     bigint;
  v_missing_expenses  bigint;
  v_missing_purchases bigint;
BEGIN
  SELECT COUNT(*) INTO v_missing_sales
  FROM sales s
  JOIN companies c ON c.id = s.company_id AND c.gl_mode = 'parallel'
  WHERE s.deleted_at IS NULL
    AND COALESCE(s.total_try, 0) > 0
    AND NOT EXISTS (
      SELECT 1 FROM journal_entries je
      WHERE je.company_id = s.company_id AND je.source_type = 'sale' AND je.source_id = s.id
    );

  SELECT COUNT(*) INTO v_missing_expenses
  FROM expenses e
  JOIN companies c ON c.id = e.company_id AND c.gl_mode = 'parallel'
  WHERE e.deleted_at IS NULL
    AND COALESCE(e.amount_try, 0) > 0
    AND NOT EXISTS (
      SELECT 1 FROM journal_entries je
      WHERE je.company_id = e.company_id AND je.source_type = 'expense' AND je.source_id = e.id
    );

  SELECT COUNT(*) INTO v_missing_purchases
  FROM purchases p
  JOIN companies c ON c.id = p.company_id AND c.gl_mode = 'parallel'
  WHERE p.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM journal_entries je
      WHERE je.company_id = p.company_id AND je.source_type = 'purchase' AND je.source_id = p.id
    );

  IF v_missing_sales + v_missing_expenses + v_missing_purchases > 0 THEN
    RAISE EXCEPTION
      'Missing journal entries: % sales, % expenses, % purchases. '
      'Run flowra_phase9c_backfill.sql first.',
      v_missing_sales, v_missing_expenses, v_missing_purchases;
  END IF;

  RAISE NOTICE 'Coverage OK: 0 missing journal entries across all parallel-mode companies. ✅';
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 1 — CUTOVER (TRANSACTION)
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

UPDATE companies
SET gl_mode    = 'gl_primary',
    updated_at = NOW()
WHERE gl_mode = 'parallel'
  AND id IN (
    '2f0a77be-0a28-436d-9e4e-52c3095f96ae',  -- Supgates Makine Sanayi ve Ticaret Ltd.
    '4b826b80-04ae-4465-ad84-64e61a93321e'   -- Test Şirketi A.Ş.
  );

-- Confirm result
DO $$
DECLARE
  v_advanced int;
BEGIN
  GET DIAGNOSTICS v_advanced = ROW_COUNT;
  IF v_advanced = 0 THEN
    RAISE EXCEPTION 'No companies updated. Check company IDs and current gl_mode.';
  END IF;
  RAISE NOTICE '% company/companies advanced to gl_primary. ✅', v_advanced;
END $$;

-- Show final state
SELECT id, name, gl_mode, updated_at FROM companies ORDER BY name;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 2 — POST-CUTOVER VERIFICATION
-- Run after commit to verify the switch took effect.
-- ════════════════════════════════════════════════════════════════════════════

-- Verify all target companies are now gl_primary
DO $$
DECLARE
  v_primary_count int;
BEGIN
  SELECT COUNT(*) INTO v_primary_count
  FROM companies
  WHERE gl_mode = 'gl_primary';

  RAISE NOTICE '% company/companies now in gl_primary mode.', v_primary_count;
END $$;

-- Final trial balance snapshot
SELECT
  c.name                               AS company,
  SUM(jel.debit_try)                   AS total_dr,
  SUM(jel.credit_try)                  AS total_cr,
  ABS(SUM(jel.debit_try) - SUM(jel.credit_try)) AS imbalance,
  COUNT(DISTINCT je.id)                AS total_entries,
  COUNT(*)                             AS total_lines
FROM journal_entry_lines jel
JOIN journal_entries je ON je.id = jel.entry_id
JOIN companies c ON c.id = je.company_id
WHERE c.gl_mode = 'gl_primary'
GROUP BY c.name
ORDER BY c.name;

-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 3 — ROLLBACK (emergency use only)
-- Uncomment ONLY if a critical issue is discovered post-cutover.
-- Effect: reverts to parallel mode (dual-write continues, GL reads disabled)
-- ════════════════════════════════════════════════════════════════════════════
-- BEGIN;
-- DO $$
-- BEGIN
--   IF NOT EXISTS (SELECT 1 FROM companies WHERE gl_mode = 'gl_primary') THEN
--     RAISE EXCEPTION 'No gl_primary companies found. Nothing to roll back.';
--   END IF;
-- END $$;
-- UPDATE companies
-- SET gl_mode    = 'parallel',
--     updated_at = NOW()
-- WHERE gl_mode = 'gl_primary'
--   AND id IN (
--     '2f0a77be-0a28-436d-9e4e-52c3095f96ae',
--     '4b826b80-04ae-4465-ad84-64e61a93321e'
--   );
-- COMMIT;
-- SELECT id, name, gl_mode FROM companies ORDER BY name;
