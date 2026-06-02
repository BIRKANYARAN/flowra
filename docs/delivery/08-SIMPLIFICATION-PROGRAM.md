# FLOWRA — Product Simplification Program
### KEEP / MERGE / MOVE / DELETE / REWRITE classification + execution outcome

Goal: a simpler, cleaner, easier-to-maintain Flowra — **no new features**. A 5-dimension parallel audit classified the whole product; every DELETE/MERGE was verified 0-reference (import/fetch greps) and gated (tsc · full suite · build) before executing. Nothing here changed product behavior.

---

## Executed autonomously (verified-safe) — 5 batches, all deployed

**Net surface reduction:** API routes **334 → 325**, services **224 → 220**, components **282 → 272**, plus a 397-line dead class, 2 dead barrels, 2 orphan lib modules, a dead tab chain, and a drifted-duplicate config block. ~23 source files + 7 dead test files removed; **−410 tests** (all covering deleted code); **zero production reference loss**.

| Batch | DELETE / MERGE | Detail |
|---|---|---|
| 1 | 14 files | 9 dead API routes (0 fetch callers; live equivalents kept): intelligence/executive-summary, tax-summary, tax/calendar, finance/tax-compliance-calendar, tax/reserve, finance/annual-summary, finance/quarterly-summary, insights/situation-summary, the bare /api/export backup. 2 dead services + tests. 7 dead components/duplicate islands (collections/CollectionsClient, _shared/CeoIntelligencePanel, SituationLine, reports/PrintButton; orphan forks commercial/_suppliers, commercial/_velocity, finance/_scenarios). 2 dead barrels (ui-kit/index, lib/db/index). 2 orphan lib (design-invariants, safeQuery). |
| 2 | 397 lines + 3 edits | Removed the dead `ExecutiveSummaryService` class (executive-summary.service 1005→609); kept the live `ExecutiveSummaryComputeService`. Repointed a stale manifest endpoint; collapsed 2 `/dashboard/cfo` redirect hops to direct links. |
| 3 | OverviewTab chain | The Finance "overview" tab was intentionally retired (page.tsx redirects `?tab=overview`→/dashboard). Removed the orphaned OverviewTab + its 2 extracted sections + AnnualSummaryService (0 importers once OverviewTab gone) + tests. |
| 4 | audit-chain.service | Dead JS duplicate of the live in-DB audit chain (trigger + `verify_audit_chain` RPC). Removed it + 2 dedicated tests + 3 interleaved test blocks. |
| 5 | nav-config exports | `ROUTE_REDIRECTS` was a **drifted** duplicate of the live `middleware.ts` `DASHBOARD_REDIRECTS` (a real maintenance hazard). Removed it + the stale `MOBILE_NAV*` exports + their test blocks. |

---

## KEEP (verified live — not duplicates, despite appearances)
- `/api/executive-summary` (dashboard cockpit), `/api/reports/executive-summary` (reports PDF), `board-pack` vs `cfo-pack` — distinct live endpoints.
- The 7 named CSV export sub-routes (`/api/export/{customers,sales,…}`) — live UI links.
- `partner-crud` / `partner-transaction` services — live behind the `PartnerService` facade.
- `SeasonalityService`, `PeriodComparisonService` — live in multiple places.
- The 25 dashboard hubs + top-level dirs (catalog/collections/simulation/stocks/tasks…) — all have live importers / distinct features.

## REWRITE (deferred — oversized but cohesive, NOT dead)
Reviewed and **rejected as split candidates** (single-domain, live, no twin): `reconciliation.engine.ts` (1520), `generatePdf.ts` (1372), `journal-entry.service.ts` (1076), `working-capital` (976), `period-comparison` (943), `sales-funnel` (939), `cashflow-waterfall` (898). Only cosmetic helper-extraction seams exist; low value, high churn → not done.

---

## NEEDS DECISION (NOT executed — your call)
These are genuine simplifications but each changes UX or removes a safety net, so they need your sign-off:

1. **WorkingCapitalSection fork** — `app/dashboard/finance/_shared/WorkingCapitalSection.tsx` (233 L, used by CFOTab) vs `components/dashboard/WorkingCapitalSection.tsx` (307 L, used by BalanceTab). Both live, **drifted**. Merge into one parameterized component (UX-affecting if the two densities differ) or keep both.
2. **PDF primitives duplication** — `generatePdf.ts` and `lib/pdf/reconciliation.pdf.ts` each reimplement `fetchFontB64` + `fmtDate`; the two `fmtDate` impls **differ on null handling**. Extract a shared `pdf-primitives.ts` after reconciling the signatures (verify byte-identical output first).
3. **Unwired safety modules — WIRE or DELETE?** `lib/rate-limit.ts` (no route uses it → API has no rate limiting), `lib/admin/gl-rollback.ts` (GL-cutover rollback tool), `lib/services/pcle/pcle.immutability.ts` (financial-record immutability guard — currently enforced only at the DB layer). These are *intended* safety mechanisms left unwired — deleting them is a regression; wiring them is the right move but a product/security decision.
4. **inventory/supplier-performance.service** — a near-duplicate of `commercial/supplier-performance`, but its tests lock in **genuinely different** behavior (retargeting them to the live service failed 9 assertions). Deleting it loses that coverage; reconciling the two implementations is a small refactor decision.
5. **Hub consolidation** — `sales` vs `sales-flow` vs `orders` vs `proformas`, `commercial` vs `collections`, `catalog` vs `stocks` all looked overlapping but are **live and distinct**; any merge is a navigation/UX redesign decision, not autonomous cleanup.

---

## Stop condition
All verified-safe, zero-reference simplifications have been executed, gated, and deployed; production is healthy (9/9 checks). What remains either changes UX, reconciles drifted implementations, or removes an intended safety mechanism — each a decision for you, captured above. No further autonomous simplification remains that is safe to make without your input.
