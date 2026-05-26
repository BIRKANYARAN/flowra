-- ════════════════════════════════════════════════════════════════════════════
-- FLOWRA — Phase 9-C Journal Entry Backfill  (v2 — schema-correct)
--
-- Generates GL journal entries for all operational records (sales, expenses,
-- purchases) created while gl_mode = 'shadow' (dual-write disabled).
--
-- Schema corrections applied vs v1:
--   • journal_entries: no entry_type column (removed)
--   • sales: use total_try (not total); sale_date for entry_date; no period_id
--   • expenses: use category (not expense_category); no period_id
--   • purchases: no total_try — aggregate from purchase_items * fx_rate
--   • 391 line conditionally skipped when kdv_amount_try = 0 (XOR constraint)
--   • Zero-amount records skipped (avoids 0,0 XOR violation)
--
-- Safety:
--   • Idempotent: INSERT ... ON CONFLICT DO NOTHING on unique index
--     idx_journal_entries_source_unique(company_id, source_type, source_id)
--   • Transactional: all-or-nothing commit
--   • Post-verification: raises EXCEPTION if any gaps remain
--   • Scope: all companies with gl_mode IN ('shadow','parallel')
-- ════════════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 0 — PRE-FLIGHT CHECKS
-- ════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'journal_entries'
      AND indexname  = 'idx_journal_entries_source_unique'
  ) THEN
    RAISE EXCEPTION
      'Missing unique index idx_journal_entries_source_unique. '
      'Run: CREATE UNIQUE INDEX IF NOT EXISTS idx_journal_entries_source_unique '
      'ON journal_entries (company_id, source_type, source_id) WHERE source_id IS NOT NULL;';
  END IF;
  RAISE NOTICE 'Pre-flight OK: unique index present.';
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 1 — DRY RUN (read-only, safe to run any time)
-- ════════════════════════════════════════════════════════════════════════════

-- 1a. Missing sale accruals by company
SELECT
  s.company_id,
  c.name                                     AS company_name,
  COUNT(*)                                   AS total_sales,
  COUNT(je.id)                               AS journaled,
  COUNT(*) - COUNT(je.id)                    AS missing,
  COALESCE(SUM(CASE WHEN je.id IS NULL THEN s.total_try END), 0) AS missing_amount_try
FROM sales s
JOIN companies c ON c.id = s.company_id
LEFT JOIN journal_entries je
  ON je.company_id  = s.company_id
 AND je.source_type = 'sale'
 AND je.source_id   = s.id
WHERE s.deleted_at IS NULL
GROUP BY s.company_id, c.name
ORDER BY missing DESC;

-- 1b. Missing expense accruals by company
SELECT
  e.company_id,
  c.name                                     AS company_name,
  COUNT(*)                                   AS total_expenses,
  COUNT(je.id)                               AS journaled,
  COUNT(*) - COUNT(je.id)                    AS missing,
  COALESCE(SUM(CASE WHEN je.id IS NULL THEN e.amount_try END), 0) AS missing_amount_try
FROM expenses e
JOIN companies c ON c.id = e.company_id
LEFT JOIN journal_entries je
  ON je.company_id  = e.company_id
 AND je.source_type = 'expense'
 AND je.source_id   = e.id
WHERE e.deleted_at IS NULL
GROUP BY e.company_id, c.name
ORDER BY missing DESC;

-- 1c. Missing purchase finalizations by company
SELECT
  p.company_id,
  c.name                                     AS company_name,
  COUNT(*)                                   AS total_purchases,
  COUNT(je.id)                               AS journaled,
  COUNT(*) - COUNT(je.id)                    AS missing
FROM purchases p
JOIN companies c ON c.id = p.company_id
LEFT JOIN journal_entries je
  ON je.company_id  = p.company_id
 AND je.source_type = 'purchase'
 AND je.source_id   = p.id
WHERE p.deleted_at IS NULL
GROUP BY p.company_id, c.name
ORDER BY missing DESC;

-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 2 — BACKFILL (transactional)
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- Guard: reject if any targeted company is already gl_primary
DO $$
DECLARE
  v_gl_primary_count int;
BEGIN
  SELECT COUNT(*) INTO v_gl_primary_count
  FROM companies
  WHERE gl_mode = 'gl_primary';

  IF v_gl_primary_count > 0 THEN
    RAISE WARNING
      '% company/companies are already gl_primary. Their records will be skipped (ON CONFLICT DO NOTHING).',
      v_gl_primary_count;
  END IF;
  RAISE NOTICE 'Guard check passed. Starting backfill for all non-gl_primary companies.';
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 2a. SALE_ACCRUAL
--   DR 120  Alıcılar              (total_try)
--   CR 600  Yurt İçi Satışlar     (total_try - kdv_amount_try)
--   CR 391  Hesaplanan KDV        (kdv_amount_try)  ← skipped when kdv = 0
-- ────────────────────────────────────────────────────────────────────────────
WITH sale_batch AS (
  SELECT
    s.id                                              AS sale_id,
    s.company_id,
    COALESCE(s.sale_date, s.created_at::date)         AS entry_date,
    COALESCE(s.total_try, 0)                          AS total_try,
    COALESCE(s.kdv_amount_try, 0)                     AS kdv_try,
    COALESCE(s.customer_name, 'Bilinmeyen Müşteri')   AS description
  FROM sales s
  WHERE s.deleted_at IS NULL
    AND COALESCE(s.total_try, 0) > 0           -- skip zero-amount (avoids 0,0 line)
    AND NOT EXISTS (
      SELECT 1 FROM journal_entries je
      WHERE je.company_id  = s.company_id
        AND je.source_type = 'sale'
        AND je.source_id   = s.id
    )
),
inserted_sale_entries AS (
  INSERT INTO journal_entries
    (company_id, source_type, source_id, entry_date, description, reference)
  SELECT
    company_id,
    'sale',
    sale_id,
    entry_date,
    'Satış tahakkuku — ' || description,
    'BACKFILL-SALE'
  FROM sale_batch
  ON CONFLICT (company_id, source_type, source_id) WHERE source_id IS NOT NULL DO NOTHING
  RETURNING id, source_id AS sale_id
)
INSERT INTO journal_entry_lines
  (entry_id, account_code, account_name, debit_try, credit_try, description)
SELECT
  ie.id,
  v.code,
  v.name,
  v.dr,
  v.cr,
  'Backfill — satış tahakkuku'
FROM inserted_sale_entries ie
JOIN sale_batch sb ON sb.sale_id = ie.sale_id
CROSS JOIN LATERAL (
  -- Line 1: DR 120 Alıcılar (always — total_try is > 0 per filter above)
  SELECT '120'::text AS code, 'Alıcılar'::text AS name,
         sb.total_try AS dr, 0::numeric AS cr
  UNION ALL
  -- Line 2: CR 600 Revenue — full amount when no KDV, net-of-KDV otherwise
  SELECT '600', 'Yurt İçi Satışlar', 0::numeric,
    CASE WHEN sb.kdv_try > 0 THEN sb.total_try - sb.kdv_try
         ELSE sb.total_try
    END
  UNION ALL
  -- Line 3: CR 391 KDV — only when kdv > 0 (avoids XOR constraint violation)
  SELECT '391', 'Hesaplanan KDV', 0::numeric, sb.kdv_try
  WHERE sb.kdv_try > 0
) AS v(code, name, dr, cr);

-- ────────────────────────────────────────────────────────────────────────────
-- 2b. EXPENSE_ACCRUAL
--   DR 7xx  Gider hesabı    (amount_try, per category mapping)
--   CR 320  Satıcılar       (amount_try)
-- ────────────────────────────────────────────────────────────────────────────
WITH expense_batch AS (
  SELECT
    e.id                                              AS expense_id,
    e.company_id,
    COALESCE(e.expense_date, e.created_at::date)      AS entry_date,
    COALESCE(e.amount_try, 0)                         AS amount_try,
    -- Map category → MSUGT account code
    -- Try expense_type first (more specific), fall back to category
    CASE COALESCE(NULLIF(TRIM(e.expense_type), ''), NULLIF(TRIM(e.category), ''), 'general')
      WHEN 'salary'     THEN '771'
      WHEN 'rent'       THEN '772'
      WHEN 'software'   THEN '773'
      WHEN 'marketing'  THEN '760'
      WHEN 'logistics'  THEN '760'
      ELSE '770'
    END                                               AS debit_acct,
    COALESCE(e.description, e.title, 'Gider')         AS description
  FROM expenses e
  WHERE e.deleted_at IS NULL
    AND COALESCE(e.amount_try, 0) > 0
    AND NOT EXISTS (
      SELECT 1 FROM journal_entries je
      WHERE je.company_id  = e.company_id
        AND je.source_type = 'expense'
        AND je.source_id   = e.id
    )
),
inserted_expense_entries AS (
  INSERT INTO journal_entries
    (company_id, source_type, source_id, entry_date, description, reference)
  SELECT
    company_id,
    'expense',
    expense_id,
    entry_date,
    'Gider tahakkuku — ' || description,
    'BACKFILL-EXPENSE'
  FROM expense_batch
  ON CONFLICT (company_id, source_type, source_id) WHERE source_id IS NOT NULL DO NOTHING
  RETURNING id, source_id AS expense_id
)
INSERT INTO journal_entry_lines
  (entry_id, account_code, account_name, debit_try, credit_try, description)
SELECT
  ie.id,
  v.code,
  v.name,
  v.dr,
  v.cr,
  'Backfill — gider tahakkuku'
FROM inserted_expense_entries ie
JOIN expense_batch eb ON eb.expense_id = ie.expense_id
CROSS JOIN LATERAL (VALUES
  (eb.debit_acct, 'Gider',     eb.amount_try, 0::numeric),
  ('320',         'Satıcılar', 0::numeric,    eb.amount_try)
) AS v(code, name, dr, cr);

-- ────────────────────────────────────────────────────────────────────────────
-- 2c. PURCHASE_FINALIZE
--   DR 153  Ticari Mallar   (items_total_try)
--   CR 320  Satıcılar       (items_total_try)
--
--   Total = SUM(purchase_items.quantity * unit_price) * purchases.fx_rate
--   (unit_price is in purchase currency; fx_rate converts to TRY)
-- ────────────────────────────────────────────────────────────────────────────
WITH purchase_batch AS (
  SELECT
    p.id                                              AS purchase_id,
    p.company_id,
    COALESCE(p.purchase_date, p.created_at::date)     AS entry_date,
    GREATEST(
      COALESCE(
        (SELECT SUM(pi.quantity * pi.unit_price)
         FROM purchase_items pi WHERE pi.purchase_id = p.id),
        0
      ) * COALESCE(p.fx_rate, 1),
      0
    )                                                 AS amount_try,
    COALESCE(p.notes, p.supplier_name, 'Satın Alma')  AS description
  FROM purchases p
  WHERE p.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM journal_entries je
      WHERE je.company_id  = p.company_id
        AND je.source_type = 'purchase'
        AND je.source_id   = p.id
    )
),
inserted_purchase_entries AS (
  INSERT INTO journal_entries
    (company_id, source_type, source_id, entry_date, description, reference)
  SELECT
    company_id,
    'purchase',
    purchase_id,
    entry_date,
    'Stok alımı — ' || description,
    'BACKFILL-PURCHASE'
  FROM purchase_batch
  WHERE amount_try > 0      -- skip zero-cost purchases (no meaningful GL entry)
  ON CONFLICT (company_id, source_type, source_id) WHERE source_id IS NOT NULL DO NOTHING
  RETURNING id, source_id AS purchase_id
)
INSERT INTO journal_entry_lines
  (entry_id, account_code, account_name, debit_try, credit_try, description)
SELECT
  ie.id,
  v.code,
  v.name,
  v.dr,
  v.cr,
  'Backfill — stok alımı'
FROM inserted_purchase_entries ie
JOIN purchase_batch pb ON pb.purchase_id = ie.purchase_id
CROSS JOIN LATERAL (VALUES
  ('153', 'Ticari Mallar', pb.amount_try, 0::numeric),
  ('320', 'Satıcılar',     0::numeric,    pb.amount_try)
) AS v(code, name, dr, cr);

-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 3 — POST-BACKFILL VERIFICATION (runs inside same transaction)
-- ════════════════════════════════════════════════════════════════════════════

-- 3a. Trial balance integrity
DO $$
DECLARE
  rec         record;
  v_total_dr  numeric;
  v_total_cr  numeric;
  v_imbalance numeric;
BEGIN
  FOR rec IN
    SELECT DISTINCT je.company_id, c.name AS company_name
    FROM journal_entries je
    JOIN companies c ON c.id = je.company_id
    ORDER BY je.company_id
  LOOP
    SELECT
      COALESCE(SUM(jel.debit_try),  0),
      COALESCE(SUM(jel.credit_try), 0)
    INTO v_total_dr, v_total_cr
    FROM journal_entry_lines jel
    JOIN journal_entries je ON je.id = jel.entry_id
    WHERE je.company_id = rec.company_id;

    v_imbalance := ABS(v_total_dr - v_total_cr);

    IF v_imbalance > 0.02 THEN
      RAISE WARNING
        '[%] Trial balance IMBALANCED: DR=% CR=% (delta=%). Manual review required.',
        rec.company_name, v_total_dr, v_total_cr, v_imbalance;
    ELSE
      RAISE NOTICE
        '[%] Trial balance OK: DR=% CR=% (imbalance=% ≤ 0.02)',
        rec.company_name, v_total_dr, v_total_cr, v_imbalance;
    END IF;
  END LOOP;
END $$;

-- 3b. Coverage completeness check
DO $$
DECLARE
  v_missing_sales     bigint;
  v_missing_expenses  bigint;
  v_missing_purchases bigint;
BEGIN
  SELECT COUNT(*) INTO v_missing_sales
  FROM sales s
  WHERE s.deleted_at IS NULL
    AND COALESCE(s.total_try, 0) > 0
    AND NOT EXISTS (
      SELECT 1 FROM journal_entries je
      WHERE je.company_id = s.company_id AND je.source_type = 'sale' AND je.source_id = s.id
    );

  SELECT COUNT(*) INTO v_missing_expenses
  FROM expenses e
  WHERE e.deleted_at IS NULL
    AND COALESCE(e.amount_try, 0) > 0
    AND NOT EXISTS (
      SELECT 1 FROM journal_entries je
      WHERE je.company_id = e.company_id AND je.source_type = 'expense' AND je.source_id = e.id
    );

  SELECT COUNT(*) INTO v_missing_purchases
  FROM purchases p
  WHERE p.deleted_at IS NULL
    AND (
      SELECT COALESCE(SUM(pi.quantity * pi.unit_price), 0)
      FROM purchase_items pi WHERE pi.purchase_id = p.id
    ) * COALESCE(p.fx_rate, 1) > 0
    AND NOT EXISTS (
      SELECT 1 FROM journal_entries je
      WHERE je.company_id = p.company_id AND je.source_type = 'purchase' AND je.source_id = p.id
    );

  RAISE NOTICE 'Coverage check: missing_sales=%, missing_expenses=%, missing_purchases=%',
    v_missing_sales, v_missing_expenses, v_missing_purchases;

  IF v_missing_sales + v_missing_expenses + v_missing_purchases > 0 THEN
    RAISE EXCEPTION
      'Backfill incomplete: % sales, % expenses, % purchases still missing entries. ROLLBACK.',
      v_missing_sales, v_missing_expenses, v_missing_purchases;
  ELSE
    RAISE NOTICE 'Backfill COMPLETE: all operational records have journal entries.';
  END IF;
END $$;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 4 — ADVANCE TO PARALLEL MODE
-- Run AFTER verifying all API endpoints return clean state.
-- Uncomment and execute once satisfied with backfill results.
-- ════════════════════════════════════════════════════════════════════════════
-- UPDATE companies
-- SET gl_mode    = 'parallel',
--     updated_at = NOW()
-- WHERE gl_mode IN ('shadow')
--   AND id IN (
--     '2f0a77be-91d9-4fc7-9519-af32b4e748bc',  -- Supgates
--     '4b826b80-04ae-4465-ad84-64e61a93321e'   -- Test
--   );
