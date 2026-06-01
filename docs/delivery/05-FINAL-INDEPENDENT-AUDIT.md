# FLOWRA FINAL CERTIFICATION REPORT
### Independent, from-scratch audit — investor / CTO / auditor / CFO / enterprise-customer lenses

**Method.** Five parallel skeptical reviewers (architecture+scalability, security, accounting, UX+enterprise, maintainability+ops) read the *actual code*, trusting no prior report. Every DB-layer and accounting claim was then **independently re-verified by me against the live production database** (PG 17.6) and against the running code — several agent claims were corrected on verification (noted below). This report supersedes `04-PRODUCTION-CERTIFICATION-REPORT.md`, which was over-optimistic: this pass found real CRITICAL cross-tenant holes that the earlier certification missed.

---

## 1. Final score: **69 / 100** (honest, weighted toward correctness + security)

| Dimension | Score | One-line rationale |
|---|---|---|
| Security | 80 | App tier is methodical; DB tier had critical cross-tenant SECDEF holes — **now fixed this session**; anon table-grants + accepted_at remain. |
| Accounting correctness | 58 | Primitives (double-entry, FIFO, balanced-entry, dup-prevention) are genuinely sound, but the **numbers users act on** are mis-stated: dividend distributable omits COGS+tax, GL is dormant by default, FX falls back to 1:1. |
| Architecture & scalability | 66 | Clean boundaries + sound multi-tenancy, but the documented cache is disabled (`force-dynamic`), dashboards fan out to dozens of all-row queries, transaction-less N+1 stock-in. |
| Maintainability | 64 | ~26k tests but they cover *pure helpers*, not the 334 route handlers; no coverage tooling; 24 divergent install-SQL files. |
| Operations | 60 | Real health endpoint + structured logs + fail-closed crons, but rate-limiting is dead code, no APM, live crons skip the idempotency tracker. |
| UX & enterprise | 71 | Strong fundamentals (tr-TR locale, exports, RBAC, skeletons), gaps in a11y breadth, table pagination, error surfacing. |

**Verdict.** Flowra is a strong, correctness-obsessed *skeleton* with genuinely senior financial primitives and a now-solid tenant boundary — but it is **not yet a trustworthy accounting system of record**: the reporting/distribution layer materially mis-states profit, tax and distributable equity, the double-entry ledger is off by default, and operational/test maturity is thin. The gap to "enterprise-defensible" is a focused 3–4 sprint program on the items below, **none of which are rewrites**.

---

## 2. What was FIXED this session (safe, verified, deployed)

| # | Severity | Fix | Proof |
|---|---|---|---|
| F1 | **CRITICAL** | 6 SECURITY DEFINER functions (`create_journal_entry`, `verify_audit_chain`, `get_real_cost`, `get_sales_analytics`, `enqueue_job`, `bootstrap_user_company`) trusted a caller-supplied company/user id with no membership check & were `authenticated`-executable → cross-tenant GL forgery / data disclosure. Added `auth.uid() IS NOT NULL AND NOT is_company_member(<co>)` guards (bootstrap: identity self-check). | Live JWT-simulation: cross-tenant calls now `RAISE FORBIDDEN`; same-tenant + service-role still work; **0 unguarded SECDEF-with-company functions remain**. Migration `20260602000001`. |
| F2 | **HIGH** | `is_company_member`/`is_company_admin` (back ~every RLS policy) ignored `company_members.deleted_at` → removed members kept full access. Added `AND deleted_at IS NULL`. | Verified live; 0 soft-deleted today → zero current impact, prevents future. |

These came from this audit and were **not** in the prior certification.

---

## 3. Final gap list (classified — effort S<2h / M<1d / L>1d)

### CRITICAL
| # | Gap | Effort | Business impact | Risk | Status |
|---|---|---|---|---|---|
| C1 | **Dividend distributable omits COGS + corporate tax.** `dividend.service.ts` `ytdNetIncome = revenue − opex` (no COGS, no 25% tax); the TTK-509 cap uses this inflated figure. A correct engine (`pcle.distribution.ts`) exists but the wired path bypasses it. | M | Partners can declare dividends exceeding lawful after-tax distributable profit → **unlawful distribution (TTK 509), director liability**. | Legal/compliance | **ROADMAP** (needs legal sign-off; not a safe unilateral change) |
| C2 | **Near-zero integration test coverage.** ~26k tests are almost all pure-helper unit tests; only 4 reference `app/api`; the 334 route handlers + auth + RLS have essentially no integration coverage; no coverage tool configured. | L | A broken auth/RLS/tenant check ships green; the "26k tests" headline is misleading to acquirers. | Silent prod regressions | **ROADMAP** |

### HIGH
| # | Gap | Effort | Impact | Status |
|---|---|---|---|---|
| H1 | **GL dormant by default** — `gl_mode` defaults to `'shadow'`; in shadow mode `dualWrite` posts NO journal entries. Out of the box there is no posted ledger/trial balance; financials are derived sums. | M (cutover) | "Double-entry engine" inactive until an admin flips mode + runs backfill. | ROADMAP |
| H2 | **FX 1:1 ultimate fallback** (`lib/fx.ts` → `{rate:1,source:'unavailable'}`; `convert_proforma` `coalesce(fx_rate,1)`). A foreign-currency invoice with no rate books at par. | M | ~30× understatement of revenue/receivable/inventory on FX sales, no hard stop. | ROADMAP (reject `unavailable` for non-TRY) |
| H3 | **`estimateCorporateTax` divergent** — hardcoded `0.25`, gross revenue, no COGS, no KKEG filter. | M | YTD tax-estimate widget materially wrong; bad cash decisions. | ROADMAP (route through `computeCorporateTax`) |
| H4 | **Verify revenue/matrah are net of KDV across all consumers.** `getRevenue` *does* return `total_try`+`sales_vat_try` (agent's "gross" claim corrected), but confirm every P&L/tax consumer subtracts VAT and reads net `revenue_try`. | M | If any consumer uses gross, revenue+tax overstated ~20%. | ROADMAP (verify chain) |
| H5 | **Caching disabled** — 58 routes set `revalidate` *and* `force-dynamic`; the documented 5-min cache never takes effect. | S–M | DB load scales with pageviews; CFO/intelligence hubs can saturate the pool. | ROADMAP (per-company `unstable_cache` or drop misleading `revalidate`) |
| H6 | **`getCfoMetrics` 29-query orchestrator** called 2× per Finance page; `PeriodComparisonService.getReport` computed twice to read 2 fields. | S (dedup) / L (SQL push-down) | Dozens of full scans per page render. | ROADMAP |
| H7 | **Transaction-less N+1 stock-in** — purchase finalize loops `StockService.adjust` (~10 round-trips each) with no enclosing transaction. | L | Mid-loop failure leaves partial stock; latency ∝ PO size. | ROADMAP (server-side RPC) |
| H8 | **`anon` has table-level grants on all business tables** (`grant all … to anon`); RLS is the sole guard. | M | Any future table shipped without RLS is world-open. | ROADMAP (narrow anon to SELECT on public tables) |
| H9 | **`accepted_at` not enforced in membership predicates** — an invited-but-not-accepted user has RLS access. | S + decision | 1 currently-active admin would be locked out → business decision. | ROADMAP (deliberately deferred) |
| H10 | **No active rate limiting** — `rate-limit.ts` has 0 importers; auth/PDF/analytics endpoints unthrottled. | M | Brute-force / DoS. (Needs a shared Redis adapter for serverless.) | ROADMAP |
| H11 | **No error tracking/APM** (no Sentry). | S | Blind to prod error spikes until users report. | ROADMAP |
| H12 | **4 live crons skip the `job_runs` idempotency tracker.** | M | A retried interest-accrual run can double-post; no run observability. | ROADMAP |
| H13 | **Divergent install SQL** (release-package 50 tables vs supabase 58); drift guard inspects only 1 file & only `CREATE TABLE`. | L | Fresh install from the release package yields a different schema → 500s. | ROADMAP |
| H14 | **a11y breadth** — ~0 `aria-live`/`role=alert`, `aria-label` in 5 files/342 buttons, table rows not keyboard-operable. | M | Excludes assistive-tech users; enterprise RFP risk. | ROADMAP |
| H15 | **No table pagination/virtualization** (`FlowraTable` renders all rows). | M | Slow/janky or truncated large lists. | ROADMAP |
| H16 | **Server pages swallow fetch errors** (`catch { return [] }`) → blank "no records" instead of an error state during outages. | S | Admins act on falsely-empty audit/reconciliation data. | ROADMAP |

### MEDIUM
M1 More silent aggregate-truncation caps not wired to the helper (`customer-credit`, `vendor-concentration`, `ebitda/margin` bridges, `fx-exposure`) · M2 Dividend GL credits 335 (payroll) not 331 (shareholder payable) · M3 Withholding hardcoded 10% (GVK 94 is 15% since 2024-12) · M4 `getCost`/`getRevenue` don't exclude cancelled sales (asymmetric with income statement) · M5 `audit_logs_stamp` swallows hash errors → degrade-open (search_path cause already fixed; add null-hash alerting) · M6 duplicate weak existence-only `verify_audit_chain` definition still in install SQL · M7 `safeSystemQuery` returns RLS-bypassing builder for `customers`/`proformas` with no enforced scope (latent) · M8 `job_runs` INSERT policy `WITH CHECK (true)` · M9 `/api/fx` unauthenticated triggers service-role writes + external fetch · M10 no global toast; `window.confirm` for destructive deletes · M11 audit-log/members show raw `user_id` slices, not names (audit trail not accountability-usable) · M12 orphaned modules incl. `gl-rollback`/`pcle.immutability` (unwired safety mechanisms) · M13 `reconciliation.engine.ts` 1,520 LOC + 29 `as any` (least type-safe = the money-reconciler) · M14 circular dep `financial-core ↔ finance/tax` via dynamic `import()` · M15 no consolidated backup/restore/rollback runbook · M16 `supabase-server.ts` lacks `server-only` guard (boundary currently clean but unenforced).

### LOW
L1 reconciliation cash `Math.max(0,…)` hides overdrafts · L2 color-tone-only KPI direction on some tiles · L3 one leaked partial-English label (`WhatIfClient`) · L4 Bearer-token path no `aud`/issuer pinning beyond `getUser`.

---

## 4. Verified strengths (not gaps — for balance)
- **RLS coverage is complete**: 49/49 tenant tables RLS-enabled with a policy; behavioural cross-tenant denial holds.
- **GL primitives are correct**: balanced-entry enforcement (`abs(DR−CR)>0.01 → raise`), line-level debit-XOR-credit CHECK, `unique(company_id,source_type,source_id)` duplicate prevention, FIFO with zero-cost-lot rejection.
- **Audit chain repaired** (this program): in-DB SHA-256 stamp + tamper-proven verifier.
- **No committed secrets**; fail-closed `CRON_SECRET`; thorough 9-check health endpoint; centralized tr-TR locale with a lint invariant; broad export coverage; real RBAC.

---

## 5. Recommended roadmap (priority order)
1. **C1 + H1–H4** (accounting correctness) — the single highest-value cluster; needs a CFO/legal review of TTK 509 distributable + a GL-mode cutover plan. *This is what stands between Flowra and "trustworthy books".*
2. **C2 + H12** (test/observability) — integration harness for route+RLS, coverage tooling, wire `job_runs` into live crons, add Sentry + rate-limiting.
3. **H5–H7** (scalability) — per-company caching, dedup the double `getCfoMetrics`/`PeriodComparison`, move stock-in + heavy aggregates into RPCs.
4. **H8–H9, M6–M9** (security defense-in-depth) — narrow anon grants, decide accepted_at, tidy install-SQL verify duplicates.
5. **H13–H16, M10–M11** (enterprise polish) — reconcile install SQL + broaden drift guard, a11y pass, table pagination, error surfacing, audit-log name resolution.

---

## 6. Stop condition
The one CRITICAL gap that was **safely** fixable without a business/legal decision (the SECDEF cross-tenant cluster + removed-member access) is fixed and verified in production. Every remaining gap either (a) requires a **business/legal decision** (C1 dividend distributable, H1 GL cutover, H3/M3 tax rates, H9 accepted_at), (b) requires **infrastructure not present** (H10 Redis, H11 Sentry account), or (c) is **multi-sprint engineering** (C2 test harness, H7/H13). None is a further safe unilateral improvement — so this is a correct stopping point pending your direction on the roadmap.
