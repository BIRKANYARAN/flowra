-- ════════════════════════════════════════════════════════════════════════════
-- FLOWRA — Phase 9-C Journal Entry Backfill
--
-- Purpose: Generate GL journal entries for all operational records (sales,
--          expenses, purchases) that were created while gl_mode = 'shadow'
--          (i.e., before dual-write was enabled).
--
-- Safety:
--   - Fully idempotent: uses INSERT ... ON CONFLICT DO NOTHING on a unique
--     index (source_type, source_id) per company so running twice is safe.
--   - Wrapped in a transaction: either all entries are created or none.
--   - Dry-run section at top: run SELECT queries first to validate counts.
--   - Replace <COMPANY_ID> with the actual UUID before running.
--
-- Run order:
--   1. Run DRY RUN section and verify counts make sense.
--   2. Confirm gl_mode is still 'shadow' or 'parallel' (NOT gl_primary).
--   3. Run the BACKFILL section inside a transaction.
--   4. Re-run /api/admin/gl-divergence to verify 0 missing records.
--   5. Re-run /api/admin/gl-shadow-audit to confirm divergence < 1%.
-- ════════════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 0 — CONFIGURATION
-- Replace these values before running.
-- ════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  -- Validation: ensure journal_entries table has the unique constraint
  -- that makes the INSERT idempotent.
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'journal_entries'
      AND indexname  = 'idx_journal_entries_source_unique'
  ) THEN
    RAISE EXCEPTION
      'Missing unique index idx_journal_entries_source_unique on journal_entries(company_id, source_type, source_id). '
      'Create it before running backfill: '
      'CREATE UNIQUE INDEX idx_journal_entries_source_unique ON journal_entries(company_id, source_type, source_id);';
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 1 — DRY RUN (safe read-only — run first)
-- ════════════════════════════════════════════════════════════════════════════

-- 1a. How many sales lack a journal entry?
SELECT
  COUNT(*)                          AS total_sales,
  COUNT(je.id)                      AS journaled_sales,
  COUNT(*) - COUNT(je.id)           AS missing_sales,
  COALESCE(SUM(CASE WHEN je.id IS NULL THEN s.total END), 0) AS missing_amount_try
FROM sales s
LEFT JOIN journal_entries je
  ON je.company_id  = s.company_id
 AND je.source_type = 'sale'
 AND je.source_id   = s.id
WHERE s.company_id = '<COMPANY_ID>'
  AND s.deleted_at IS NULL;

-- 1b. How many expenses lack a journal entry?
SELECT
  COUNT(*)                          AS total_expenses,
  COUNT(je.id)                      AS journaled_expenses,
  COUNT(*) - COUNT(je.id)           AS missing_expenses,
  COALESCE(SUM(CASE WHEN je.id IS NULL THEN e.amount_try END), 0) AS missing_amount_try
FROM expenses e
LEFT JOIN journal_entries je
  ON je.company_id  = e.company_id
 AND je.source_type = 'expense'
 AND je.source_id   = e.id
WHERE e.company_id = '<COMPANY_ID>'
  AND e.deleted_at IS NULL;

-- 1c. How many purchases lack a journal entry?
SELECT
  COUNT(*)                          AS total_purchases,
  COUNT(je.id)                      AS journaled_purchases,
  COUNT(*) - COUNT(je.id)           AS missing_purchases,
  COALESCE(SUM(CASE WHEN je.id IS NULL THEN p.total END), 0) AS missing_amount_try
FROM purchases p
LEFT JOIN journal_entries je
  ON je.company_id  = p.company_id
 AND je.source_type = 'purchase'
 AND je.source_id   = p.id
WHERE p.company_id = '<COMPANY_ID>'
  AND p.deleted_at IS NULL;

-- 1d. Current trial balance (expect 0 rows if shadow mode, some rows if parallel)
SELECT
  account_code,
  SUM(jel.debit_try)  AS total_debit,
  SUM(jel.credit_try) AS total_credit
FROM journal_entry_lines jel
JOIN journal_entries je ON je.id = jel.entry_id
WHERE je.company_id = '<COMPANY_ID>'
GROUP BY account_code
ORDER BY account_code;

-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 2 — BACKFILL (transactional — run only after dry-run validation)
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- Guard: abort if gl_mode is already gl_primary (backfill must run before cutover)
DO $$
DECLARE
  v_mode text;
BEGIN
  SELECT gl_mode INTO v_mode FROM companies WHERE id = '<COMPANY_ID>';
  IF v_mode = 'gl_primary' THEN
    RAISE EXCEPTION
      'Backfill rejected: gl_mode is already gl_primary. '
      'Backfill must run before advancing to gl_primary mode.';
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 2a. SALE_ACCRUAL entries — every non-deleted sale gets a journal entry
--     DR 120 Alıcılar (total)
--     CR 600 Yurt İçi Satışlar (total - kdv)
--     CR 391 Hesaplanan KDV (kdv)
-- ────────────────────────────────────────────────────────────────────────────

WITH sale_batch AS (
  SELECT
    s.id                                          AS sale_id,
    s.company_id,
    s.sale_date                                   AS entry_date,
    s.period_id,
    COALESCE(s.total, 0)                          AS total_try,
    COALESCE(s.kdv_amount_try, ROUND(COALESCE(s.total, 0) * 0.20 / 1.20, 2)) AS kdv_try,
    COALESCE(s.customer_name, 'Unknown')          AS description
  FROM sales s
  WHERE s.company_id = '<COMPANY_ID>'
    AND s.deleted_at  IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM journal_entries je
      WHERE je.company_id  = s.company_id
        AND je.source_type = 'sale'
        AND je.source_id   = s.id
    )
),
inserted_entries AS (
  INSERT INTO journal_entries
    (company_id, source_type, source_id, entry_date, period_id, description, reference, entry_type)
  SELECT
    company_id,
    'sale',
    sale_id,
    entry_date,
    period_id,
    'Satış tahakkuku — ' || description,
    'BACKFILL-SALE',
    'SALE_ACCRUAL'
  FROM sale_batch
  ON CONFLICT (company_id, source_type, source_id) DO NOTHING
  RETURNING id, source_id AS sale_id
)
INSERT INTO journal_entry_lines
  (entry_id, account_code, account_name, debit_try, credit_try, description)
SELECT
  ie.id,
  code,
  name,
  debit_try,
  credit_try,
  'Backfill'
FROM inserted_entries ie
JOIN sale_batch sb ON sb.sale_id = ie.sale_id
CROSS JOIN LATERAL (VALUES
  ('120', 'Alıcılar',              sb.total_try,                    0::numeric),
  ('600', 'Yurt İçi Satışlar',     0::numeric, sb.total_try - sb.kdv_try),
  ('391', 'Hesaplanan KDV',        0::numeric, sb.kdv_try)
) AS lines(code, name, debit_try, credit_try);

-- ────────────────────────────────────────────────────────────────────────────
-- 2b. EXPENSE_ACCRUAL entries — every non-deleted expense
--     DR 7xx Gider hesabı (amount_try)
--     DR 191 İndirilecek KDV (kdv_deductible, if any — approximated as 0 for backfill)
--     CR 320 Satıcılar / CR 102 Bankalar depending on payment_status
--
--  Note: For simplicity in backfill, all expenses go to CR 320 (trade payables).
--  Paid expenses that were cash-settled should be manually corrected via adjustment entries.
-- ────────────────────────────────────────────────────────────────────────────

WITH expense_batch AS (
  SELECT
    e.id                                            AS expense_id,
    e.company_id,
    COALESCE(e.expense_date, e.created_at::date)    AS entry_date,
    e.period_id,
    COALESCE(e.amount_try, 0)                       AS amount_try,
    CASE e.expense_category
      WHEN 'salary'    THEN '771'
      WHEN 'rent'      THEN '772'
      WHEN 'software'  THEN '773'
      WHEN 'marketing' THEN '760'
      WHEN 'logistics' THEN '760'
      ELSE '770'
    END                                             AS debit_acct,
    e.description                                   AS description
  FROM expenses e
  WHERE e.company_id = '<COMPANY_ID>'
    AND e.deleted_at  IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM journal_entries je
      WHERE je.company_id  = e.company_id
        AND je.source_type = 'expense'
        AND je.source_id   = e.id
    )
),
inserted_expense_entries AS (
  INSERT INTO journal_entries
    (company_id, source_type, source_id, entry_date, period_id, description, reference, entry_type)
  SELECT
    company_id,
    'expense',
    expense_id,
    entry_date,
    period_id,
    'Gider tahakkuku — ' || COALESCE(description, ''),
    'BACKFILL-EXPENSE',
    'EXPENSE_ACCRUAL'
  FROM expense_batch
  ON CONFLICT (company_id, source_type, source_id) DO NOTHING
  RETURNING id, source_id AS expense_id
)
INSERT INTO journal_entry_lines
  (entry_id, account_code, account_name, debit_try, credit_try, description)
SELECT
  ie.id,
  code,
  name,
  debit_try,
  credit_try,
  'Backfill'
FROM inserted_expense_entries ie
JOIN expense_batch eb ON eb.expense_id = ie.expense_id
CROSS JOIN LATERAL (VALUES
  (eb.debit_acct, 'Gider',      eb.amount_try, 0::numeric),
  ('320',         'Satıcılar',  0::numeric,    eb.amount_try)
) AS lines(code, name, debit_try, credit_try);

-- ────────────────────────────────────────────────────────────────────────────
-- 2c. PURCHASE_FINALIZE entries — every non-deleted finalized purchase
--     DR 153 Ticari Mallar (total_try)
--     CR 320 Satıcılar (total_try)
-- ────────────────────────────────────────────────────────────────────────────

WITH purchase_batch AS (
  SELECT
    p.id                                            AS purchase_id,
    p.company_id,
    COALESCE(p.purchase_date, p.created_at::date)   AS entry_date,
    p.period_id,
    COALESCE(p.total, 0)                            AS amount_try,
    p.notes                                         AS description
  FROM purchases p
  WHERE p.company_id = '<COMPANY_ID>'
    AND p.deleted_at  IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM journal_entries je
      WHERE je.company_id  = p.company_id
        AND je.source_type = 'purchase'
        AND je.source_id   = p.id
    )
),
inserted_purchase_entries AS (
  INSERT INTO journal_entries
    (company_id, source_type, source_id, entry_date, period_id, description, reference, entry_type)
  SELECT
    company_id,
    'purchase',
    purchase_id,
    entry_date,
    period_id,
    'Stok alımı — ' || COALESCE(description, ''),
    'BACKFILL-PURCHASE',
    'PURCHASE_FINALIZE'
  FROM purchase_batch
  ON CONFLICT (company_id, source_type, source_id) DO NOTHING
  RETURNING id, source_id AS purchase_id
)
INSERT INTO journal_entry_lines
  (entry_id, account_code, account_name, debit_try, credit_try, description)
SELECT
  ie.id,
  code,
  name,
  debit_try,
  credit_try,
  'Backfill'
FROM inserted_purchase_entries ie
JOIN purchase_batch pb ON pb.purchase_id = ie.purchase_id
CROSS JOIN LATERAL (VALUES
  ('153', 'Ticari Mallar', pb.amount_try, 0::numeric),
  ('320', 'Satıcılar',     0::numeric,    pb.amount_try)
) AS lines(code, name, debit_try, credit_try);

-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 3 — POST-BACKFILL VERIFICATION (run inside same transaction)
-- ════════════════════════════════════════════════════════════════════════════

-- Verify trial balance: total debits must equal total credits
DO $$
DECLARE
  v_total_dr  numeric;
  v_total_cr  numeric;
  v_imbalance numeric;
BEGIN
  SELECT
    COALESCE(SUM(jel.debit_try),  0),
    COALESCE(SUM(jel.credit_try), 0)
  INTO v_total_dr, v_total_cr
  FROM journal_entry_lines jel
  JOIN journal_entries je ON je.id = jel.entry_id
  WHERE je.company_id = '<COMPANY_ID>';

  v_imbalance := ABS(v_total_dr - v_total_cr);

  IF v_imbalance > 0.01 THEN
    RAISE WARNING
      'Trial balance imbalance detected: DR=% CR=% (delta=%). '
      'Review journal_entry_lines for orphaned or asymmetric entries.',
      v_total_dr, v_total_cr, v_imbalance;
  ELSE
    RAISE NOTICE 'Trial balance OK: DR=% CR=% (imbalance=% < 0.01 TRY)', v_total_dr, v_total_cr, v_imbalance;
  END IF;
END $$;

-- Verify: no remaining gaps
DO $$
DECLARE
  v_missing_sales     bigint;
  v_missing_expenses  bigint;
  v_missing_purchases bigint;
BEGIN
  SELECT COUNT(*) INTO v_missing_sales
  FROM sales s
  WHERE s.company_id = '<COMPANY_ID>'
    AND s.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM journal_entries je
      WHERE je.company_id = s.company_id AND je.source_type = 'sale' AND je.source_id = s.id
    );

  SELECT COUNT(*) INTO v_missing_expenses
  FROM expenses e
  WHERE e.company_id = '<COMPANY_ID>'
    AND e.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM journal_entries je
      WHERE je.company_id = e.company_id AND je.source_type = 'expense' AND je.source_id = e.id
    );

  SELECT COUNT(*) INTO v_missing_purchases
  FROM purchases p
  WHERE p.company_id = '<COMPANY_ID>'
    AND p.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM journal_entries je
      WHERE je.company_id = p.company_id AND je.source_type = 'purchase' AND je.source_id = p.id
    );

  IF v_missing_sales + v_missing_expenses + v_missing_purchases > 0 THEN
    RAISE EXCEPTION
      'Backfill incomplete: % sales, % expenses, % purchases still missing journal entries. ROLLBACK.',
      v_missing_sales, v_missing_expenses, v_missing_purchases;
  ELSE
    RAISE NOTICE 'Backfill complete: 0 missing entries across all operational record types.';
  END IF;
END $$;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 4 — UNIQUE INDEX (create if not exists, idempotent guard)
-- Run this BEFORE the backfill if the index does not exist.
-- ════════════════════════════════════════════════════════════════════════════
-- CREATE UNIQUE INDEX IF NOT EXISTS idx_journal_entries_source_unique
--   ON journal_entries (company_id, source_type, source_id);

-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 5 — ADVANCE GL MODE (run after backfill + verification pass)
-- ════════════════════════════════════════════════════════════════════════════
-- UPDATE companies SET gl_mode = 'parallel', updated_at = NOW()
--   WHERE id = '<COMPANY_ID>';
-- Then call: PATCH /api/admin/gl-mode { gl_mode: 'parallel' }
-- to clear the in-process cache.
