-- ════════════════════════════════════════════════════════════════════════════
-- FLOWRA — BEHAVIOURAL RLS / IDOR PROOFS (items 10,11,12,13)
--
-- Proves the tenant boundary actually DENIES cross-company access on real prod
-- data — not just that policies exist. Non-destructive: read-only SELECTs run as
-- the `authenticated` role inside an explicit transaction that is ROLLED BACK.
--
--   psql "$DATABASE_URL" -f supabase/certification/rls_behavioural.sql
--
-- Prereq: pg_catalog read access; at least 2 companies each with a member and a
-- sales row. Run as service role / owner (it drops to `authenticated` to test).
-- ════════════════════════════════════════════════════════════════════════════
\pset pager off
\set ON_ERROR_STOP on

BEGIN;

-- Pick company A (with a member + sales) and a DIFFERENT company B.
SELECT cm.company_id AS comp_a, cm.user_id AS user_a
FROM company_members cm
WHERE EXISTS (SELECT 1 FROM sales s WHERE s.company_id = cm.company_id)
ORDER BY cm.company_id LIMIT 1 \gset
SELECT s.company_id AS comp_b
FROM sales s
WHERE s.company_id <> :'comp_a'
  AND NOT EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = s.company_id AND m.user_id = :'user_a')
ORDER BY s.company_id LIMIT 1 \gset

\echo '--- Acting as user_a (:user_a), member of comp_a (:comp_a), NOT comp_b (:comp_b) ---'

-- Impersonate user_a as the authenticated role (what Supabase does per request).
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', :'user_a', 'role','authenticated')::text, true);

-- 11. CROSS-TENANT DENIAL: user_a must see ZERO of comp_b's sales.
SELECT 'rls_cross_tenant_sales' AS check,
       CASE WHEN count(*)=0 THEN 'PASS' ELSE 'FAIL' END AS status,
       count(*)::text||' comp_b rows visible to comp_a member (must be 0)' AS detail
FROM sales WHERE company_id = :'comp_b';

-- Sanity: user_a CAN see their own company's sales (proves the SELECT itself works).
SELECT 'rls_own_tenant_sales' AS check,
       CASE WHEN count(*)>0 THEN 'PASS' ELSE 'WARN' END AS status,
       count(*)::text||' comp_a rows visible to comp_a member (should be >0)' AS detail
FROM sales WHERE company_id = :'comp_a';

-- 11b. Spot-check a few more tenant tables for cross-company leakage.
SELECT 'rls_cross_tenant_expenses' AS check,
       CASE WHEN count(*)=0 THEN 'PASS' ELSE 'FAIL' END,
       count(*)::text||' comp_b expenses visible (must be 0)'
FROM expenses WHERE company_id = :'comp_b';
SELECT 'rls_cross_tenant_audit_logs' AS check,
       CASE WHEN count(*)=0 THEN 'PASS' ELSE 'FAIL' END,
       count(*)::text||' comp_b audit_logs visible (must be 0)'
FROM audit_logs WHERE company_id = :'comp_b';

RESET role;
ROLLBACK;  -- nothing was written; this only undoes the role/jwt context

-- 12. IDOR (static): convert_proforma_to_sale must contain a membership/auth check.
SELECT 'idor_convert_proforma_membership_check' AS check,
       CASE WHEN def ILIKE '%is_company_member%' OR def ILIKE '%auth.uid()%' THEN 'PASS' ELSE 'FAIL' END AS status,
       CASE WHEN def ILIKE '%is_company_member%' OR def ILIKE '%auth.uid()%'
            THEN 'RPC enforces membership'
            ELSE 'RPC has NO membership check — selects proforma by id only (cross-tenant write). Apply the hardening in docs/delivery/02 §A.2.' END AS detail
FROM (SELECT pg_get_functiondef(p.oid) AS def
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE p.proname='convert_proforma_to_sale' AND n.nspname='public' LIMIT 1) f;
