-- ════════════════════════════════════════════════════════════════════════════
-- FLOWRA — Phase 9-C GL Mode Rollback Package
--
-- Purpose: Safely revert gl_mode from parallel or gl_primary back to shadow.
--
-- CRITICAL: Read the assessment section before executing.
-- DO NOT run blindly. Each section has explicit GO/NO-GO conditions.
--
-- This script is referenced by lib/admin/gl-rollback.ts which computes the
-- human-readable assessment and risk level. Use that API endpoint first.
-- ════════════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 0 — ASSESSMENT (always run first, read-only)
-- ════════════════════════════════════════════════════════════════════════════

-- 0a. What is the current gl_mode?
SELECT id, name, gl_mode, updated_at
FROM companies
WHERE id = '<COMPANY_ID>';

-- 0b. Are there any locked or closed periods?
-- If count > 0 and gl_mode was gl_primary during close, rollback has reporting implications.
SELECT id, year, month, status, closed_at
FROM accounting_periods
WHERE company_id = '<COMPANY_ID>'
  AND status IN ('locked', 'closed')
ORDER BY year DESC, month DESC;

-- 0c. How many journal entries exist?
SELECT
  COUNT(*)                   AS total_entries,
  MIN(created_at)::date      AS earliest_entry,
  MAX(created_at)::date      AS latest_entry,
  SUM(jel.debit_try)         AS total_debits,
  SUM(jel.credit_try)        AS total_credits,
  ABS(SUM(jel.debit_try) - SUM(jel.credit_try)) AS imbalance
FROM journal_entries je
JOIN journal_entry_lines jel ON jel.entry_id = je.id
WHERE je.company_id = '<COMPANY_ID>';

-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 1 — ROLLBACK: parallel → shadow
-- GO condition: no locked periods that used GL data as source of truth.
-- Journal entries are preserved (not deleted) — they remain available for
-- re-advancement to parallel mode without re-running backfill.
-- ════════════════════════════════════════════════════════════════════════════

-- Run ONLY if current gl_mode = 'parallel' and you want to revert to shadow.

BEGIN;

-- Guard: confirm we are in parallel mode
DO $$
DECLARE v_mode text;
BEGIN
  SELECT gl_mode INTO v_mode FROM companies WHERE id = '<COMPANY_ID>';
  IF v_mode != 'parallel' THEN
    RAISE EXCEPTION 'Rollback aborted: expected gl_mode = parallel, found %. Use correct rollback section.', v_mode;
  END IF;
END $$;

-- Revert gl_mode
UPDATE companies
SET    gl_mode    = 'shadow',
       updated_at = NOW()
WHERE  id = '<COMPANY_ID>';

-- Log the rollback in audit_logs (if the table supports free-form entries)
INSERT INTO audit_logs
  (company_id, user_id, action, resource_type, resource_id, new_values, created_at)
VALUES
  ('<COMPANY_ID>', '<ADMIN_USER_ID>', 'GL_MODE_ROLLBACK',
   'company', '<COMPANY_ID>',
   '{"from": "parallel", "to": "shadow", "reason": "Phase 9-C rollback"}'::jsonb,
   NOW())
ON CONFLICT DO NOTHING;

COMMIT;

-- After SQL: call API to clear in-process cache
-- PATCH /api/admin/gl-mode  { "gl_mode": "shadow" }

-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 2 — ROLLBACK: gl_primary → parallel
-- GO condition: confirm engineering sign-off. Check locked periods above.
-- ════════════════════════════════════════════════════════════════════════════

-- Run ONLY if current gl_mode = 'gl_primary' and you want to revert to parallel.
-- !! COMMENT OUT SECTION 1 BEFORE RUNNING SECTION 2 !!

-- BEGIN;
--
-- DO $$
-- DECLARE v_mode text;
-- BEGIN
--   SELECT gl_mode INTO v_mode FROM companies WHERE id = '<COMPANY_ID>';
--   IF v_mode != 'gl_primary' THEN
--     RAISE EXCEPTION 'Rollback aborted: expected gl_mode = gl_primary, found %.', v_mode;
--   END IF;
-- END $$;
--
-- UPDATE companies SET gl_mode = 'parallel', updated_at = NOW() WHERE id = '<COMPANY_ID>';
--
-- INSERT INTO audit_logs
--   (company_id, user_id, action, resource_type, resource_id, new_values, created_at)
-- VALUES
--   ('<COMPANY_ID>', '<ADMIN_USER_ID>', 'GL_MODE_ROLLBACK',
--    'company', '<COMPANY_ID>',
--    '{"from": "gl_primary", "to": "parallel", "reason": "Phase 9-C rollback"}'::jsonb,
--    NOW())
-- ON CONFLICT DO NOTHING;
--
-- COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 3 — ROLLBACK: gl_primary → shadow (CRITICAL — engineering required)
-- !! DO NOT RUN WITHOUT EXPLICIT ENGINEERING LEAD SIGN-OFF !!
-- ════════════════════════════════════════════════════════════════════════════

-- BEGIN;
--
-- DO $$
-- DECLARE
--   v_mode    text;
--   v_locked  bigint;
-- BEGIN
--   SELECT gl_mode INTO v_mode FROM companies WHERE id = '<COMPANY_ID>';
--   IF v_mode != 'gl_primary' THEN
--     RAISE EXCEPTION 'Rollback aborted: expected gl_mode = gl_primary, found %.', v_mode;
--   END IF;
--
--   SELECT COUNT(*) INTO v_locked
--   FROM accounting_periods
--   WHERE company_id = '<COMPANY_ID>' AND status = 'locked';
--
--   IF v_locked > 0 THEN
--     RAISE WARNING '% locked period(s) exist. Their snapshots used GL data. Reporting inconsistency possible.', v_locked;
--   END IF;
-- END $$;
--
-- UPDATE companies SET gl_mode = 'shadow', updated_at = NOW() WHERE id = '<COMPANY_ID>';
--
-- INSERT INTO audit_logs
--   (company_id, user_id, action, resource_type, resource_id, new_values, created_at)
-- VALUES
--   ('<COMPANY_ID>', '<ADMIN_USER_ID>', 'GL_MODE_ROLLBACK',
--    'company', '<COMPANY_ID>',
--    '{"from": "gl_primary", "to": "shadow", "severity": "critical", "reason": "Phase 9-C emergency rollback"}'::jsonb,
--    NOW())
-- ON CONFLICT DO NOTHING;
--
-- COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 4 — POST-ROLLBACK VERIFICATION
-- ════════════════════════════════════════════════════════════════════════════

-- Confirm gl_mode reverted
SELECT id, gl_mode, updated_at FROM companies WHERE id = '<COMPANY_ID>';

-- Confirm journal entries still intact (they are never deleted by rollback)
SELECT COUNT(*) AS journal_entries_preserved
FROM journal_entries
WHERE company_id = '<COMPANY_ID>';

-- Confirm audit log entry was written
SELECT action, new_values, created_at
FROM audit_logs
WHERE company_id   = '<COMPANY_ID>'
  AND action       = 'GL_MODE_ROLLBACK'
ORDER BY created_at DESC
LIMIT 5;
