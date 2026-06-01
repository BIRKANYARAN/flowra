# FLOWRA FINAL CERTIFICATION REPORT
### Autonomous Final Correction Program — execution outcome

Continues `05-FINAL-INDEPENDENT-AUDIT.md` (the from-scratch audit) and `06-DECISION-PACKAGES.md` (the legal/business items). Every change below was **verified against live production** (PG 17.6) before and after applying, gated (tsc · full suite · build), and deployed. Nothing here is claimed without a verification probe.

---

## Final readiness score: **74 / 100** (was 69)

| Dimension | Before | Now | What moved it |
|---|---|---|---|
| Security | 80 | **89** | Cross-tenant SECDEF cluster closed; removed-member RLS access fixed; anon writes revoked; job_runs policy tightened. (Remaining: anon SELECT narrowing, accepted_at decision, rate-limiting infra.) |
| Accounting correctness | 58 | **61** | Cancelled-sales asymmetry fixed. **Held down by two decision-blocked CRITICALs** (dividend distributable, gross-KDV revenue) that still mis-state distributable profit and revenue/tax. |
| Architecture & scalability | 66 | 68 | Dedup'd the double PeriodComparison. (Caching, N+1 stock-in still roadmapped.) |
| Maintainability | 64 | **71** | Dead code removed; release-package install mirror synced + parity guard added. (Integration-test gap remains.) |
| Operations | 60 | **67** | Interest-accrual double-post made impossible at the DB. (APM, rate-limiting, cron run-tracking remain.) |
| UX & enterprise | 71 | 71 | Unchanged this program (UX items deliberately roadmapped, not rushed). |

**Honest ceiling.** The score cannot go higher until the **decision-blocked accounting CRITICALs** (DP-1 dividend distributable, DP-5 gross-KDV revenue) are resolved — until then Flowra still produces materially wrong distributable-profit and revenue/tax figures — and until a real **integration-test layer** exists for the 334 route handlers (the ~26k tests cover pure helpers, not auth/RLS).

---

## What was FIXED this program (verified + deployed)

| Severity | Fix | Verification |
|---|---|---|
| **CRITICAL** | 6 SECURITY DEFINER functions (`create_journal_entry`, `verify_audit_chain`, `get_real_cost`, `get_sales_analytics`, `enqueue_job`, `bootstrap_user_company`) trusted a caller-supplied company/user id with no membership check → cross-tenant GL forgery / data disclosure. Added guards. | Live JWT-simulation: cross-tenant → `FORBIDDEN`; same-tenant + service-role OK. **0 unguarded SECDEF-with-company funcs remain.** |
| **HIGH** | `is_company_member`/`is_company_admin` (back ~every RLS policy) ignored `deleted_at` → removed members kept access. Added `AND deleted_at IS NULL`. | Live: both predicates filter deleted_at; 49/49 tenant tables RLS-on. |
| **HIGH (data integrity)** | Interest-accrual could **double-post into an append-only ledger** (TOCTOU). Added partial UNIQUE index on the exact dedup grain. | Live index present; 0 pre-existing dups; grain blocks only true duplicates. |
| **HIGH (fresh install)** | The **release-package install mirror was missing 8 tables** → fresh install from it 500'd. Synced to canonical (byte-identical, 58 tables) + added a drift-guard parity assertion. | `diff -q` identical; new test passes; drift guard now covers the mirror. |
| **Security (def-in-depth)** | `anon` held blanket WRITE grants on all tables → revoked INSERT/UPDATE/DELETE/TRUNCATE. `job_runs` INSERT policy was `WITH CHECK (true)` → restricted to admins (service-role writer bypasses RLS). | Live: anon write denied on all business tables; service-role path verified unaffected. |
| **Accounting correctness** | `finance.service` counted cancelled-not-deleted sales in revenue/COGS, diverging from the authoritative income statement → excluded `payment_status='cancelled'` in both. | Mirrors existing tested P&L behavior; 0 cancelled sales in prod (zero current impact, correct going forward). |
| **Performance** | Finance Overview computed `PeriodComparisonService.getReport()` twice → computed once, both views derived. | tsc + suite green; halves that service's query cost. |
| **Maintainability** | Removed 2 verified-dead modules (`job-runner.service.ts` duplicate, `company-scenario.ts` sim) + a dead test. | 0 production importers, 0 dynamic/registry refs; suite green. |

Earlier in the same continuous program: audit-chain repair (search_path), `system_logs` separation, event-outbox removal, truncation observability, and the prior SECDEF/RLS hardening — all deployed and verified.

---

## What was NOT fixed, and why

### Decision-blocked (see `06-DECISION-PACKAGES.md`) — require business/legal sign-off
- **DP-1 (CRITICAL)** Dividend distributable omits COGS + corporate tax (TTK 509 over-distribution exposure). A correct engine exists but is bypassed. **Changes legally-distributable amounts → CFO/legal decision.**
- **DP-5 (CRITICAL)** Revenue & corporate-tax matrah use GROSS (KDV-inclusive) sales. Real bug, but the `revenue_try`/`kdv_amount_try` columns are **inconsistently populated in prod** (3/11 rows `total>0` with empty `revenue_try`), so a blind switch would *understate* revenue. **Needs a data backfill + CFO sign-off.**
- **DP-2 (HIGH)** GL is dormant by default (`gl_mode='shadow'`) → no posted ledger until cutover. **Business decision on cutover.**
- **DP-3 (MEDIUM)** Dividend withholding hardcoded 10% (GVK 94 is 15% since 2024-12). **Needs operator confirmation of rate/date.**
- **DP-4 (MEDIUM)** `accepted_at` not enforced in membership predicates would lock out 1 currently-active unaccepted-invite admin. **Business decision on that user.**

### Infrastructure / multi-sprint — not safely doable autonomously now
- **C2 (CRITICAL)** Integration/route + RLS test coverage (≈0 today) — needs a test-DB harness (Supabase local / emulator).
- **H2 (HIGH)** FX 1:1 ultimate fallback books foreign sales at par when no rate exists. The safe fix changes sale-creation behavior (block vs flag) → belongs with the FX/accounting decision set; added to roadmap.
- **H7 (HIGH)** Transaction-less N+1 stock-in → needs a server-side RPC.
- **H10/H11 (HIGH)** Rate-limiting needs a shared Redis adapter (in-memory is ineffective on serverless); APM needs a Sentry account.

### Lower-priority UX (deliberately roadmapped, not rushed)
Audit-log shows raw `user_id` (needs name resolution), server pages render blank on DB-read failure, aria-live/aria-label breadth, table pagination. All real, all `M` effort; batched for a focused UX pass rather than risked piecemeal at program end.

### Verified NON-issues (corrected agent claims during this program)
- GL duplicate-prevention **is** enforced (unique index in prod + table constraint in fresh installs).
- `getRevenue` **does** surface `sales_vat_try` separately (the "gross" issue is real at the *consumer* level → DP-5, not at getRevenue's return).
- 3 of the "orphaned" modules (`rate-limit`, `pcle.immutability`, `gl-rollback`) are **unwired safety mechanisms to WIRE, not delete** — roadmapped accordingly (deleting them would be a regression).

---

## What must happen next (priority order)
1. **Resolve DP-1 & DP-5** (CFO/legal) — the only things between Flowra and trustworthy books. Then ship the dividend-engine consolidation + the KDV backfill-and-switch.
2. **Stand up an integration-test harness** (C2) — route + RLS coverage; add a coverage tool.
3. **DP-2 GL cutover** plan; **DP-3** rate; **DP-4** the one admin.
4. Wire the safety mechanisms (rate-limit + Redis, pcle.immutability, gl-rollback in the GL-mode flow); add APM.
5. UX pass: audit-log names, error states, a11y, pagination.

---

## Stop condition
All safe, non-decision, non-infra work identified by the from-scratch audit has been executed and verified in production. What remains requires a **business/legal decision** (DP-1–5, FX), **infrastructure not present** (test DB, Redis, Sentry), or a **deliberate UX sprint**. Per the program's own stop conditions, this is the correct stopping point — continuing would mean either making a legally-material change without sign-off or rushing UX work that the mandate says to do carefully. The decision packages in `06` are ready for your call.
