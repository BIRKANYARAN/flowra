# FLOWRA — Business/Legal Decision Packages
### Changes that affect dividend legality, tax policy, GL cutover, or live users — prepared for explicit approval (Phase 5)

These are the items the autonomous correction program **will not execute unilaterally** because they change legally/financially material behavior or affect a currently-active user. Each is a real, verified finding. All *other* safe work proceeds automatically; only these wait on a decision.

---

## DP-1 (CRITICAL) — Dividend distributable profit omits COGS and corporate tax (TTK 509)

**Issue.** The wired dividend-declaration path computes the TTK-509 distributable cap on an inflated profit figure.

**Evidence.** `lib/services/pcle/dividend.service.ts:127-134`:
```
ytdNetIncome = ytdRevenue − ytdExpenses        // ytdRevenue = total_try (sales); expenses exclude financing types
```
There is **no COGS deduction** (COGS lives in `sale_item_allocations`, not `expenses`) and **no corporate-tax (25%) deduction**. The TTK-509 check (`:162`) then compares the requested gross dividend against this overstated `ytdNetIncome`. A correct 4-layer engine already exists at `lib/services/pcle/pcle.distribution.ts:64-216` (after-tax income, 5%→20% legal reserve, hard 509 block) but the production path does **not** use it.

**Risk.**
- **Legal/accounting:** partners can declare dividends exceeding lawful after-tax distributable profit → **unlawful distribution under TTK 509**, distributing money owed to the tax authority / encroaching on capital, **personal liability for directors**.
- **Magnitude:** for a trading company COGS is typically the largest cost; omitting it can overstate distributable profit by a wide margin.

**Options.**
1. **(Recommended)** Re-point `DividendService` to compute distributable from **after-tax net income with COGS** (delegate to / mirror `pcle.distribution.ts`). Net income = revenue(net of KDV) − COGS − deductible opex − corporate tax; reserve and 509 cap applied on that.
2. Keep the current path but add COGS + tax deduction inline (duplicates logic; not recommended — two engines diverge again).
3. Block dividend declaration entirely until (1) ships.

**Recommendation.** Option 1. It uses code that already exists and is the legally correct base. **Requires CFO/legal confirmation** of the exact distributable formula (esp. whether prior-year retained earnings and existing reserves are in scope) before it goes live, because it *reduces* the amount partners may legally distribute.

---

## DP-2 (HIGH) — Double-entry GL is dormant by default (`gl_mode = 'shadow'`)

**Issue.** Out of the box, financial mutations post **no** journal entries.

**Evidence.** `lib/middleware/period-guard.ts:120` `return (data?.gl_mode ?? 'shadow')`; `lib/services/ledger/dual-write.service.ts:51` `if (glMode === 'shadow') return null` (no posting). So unless an admin sets `gl_mode` to `parallel`/`gl_primary`, there is no posted ledger or trial balance — reported financials are derived aggregates.

**Risk.** A company believing it has a double-entry system of record actually has none until cutover; reconciliation runs on derived sums, not posted entries.

**Options.**
1. **(Recommended)** Keep `shadow` as the *initial* default but add an **explicit, guided GL-activation step** in admin onboarding (run the `flowra_phase9c_*` backfill/cutover, then flip to `gl_primary`), plus a dashboard banner while in shadow mode so it is never silently dormant.
2. Change the default to `gl_primary` for **new** companies only (existing companies unaffected) — requires the backfill to be safe-by-construction for an empty ledger.
3. Leave as-is (status quo) — not recommended; it is the "fake OK" pattern the mandate forbids.

**Recommendation.** Option 1 now (visibility + guided cutover) and Option 2 for new signups once verified. **Requires a business decision** on cutover timing for existing tenants (it changes whether operations can be *blocked* by GL failures in `gl_primary`).

---

## DP-3 (MEDIUM) — Dividend withholding rate hardcoded at 10%

**Issue.** `WITHHOLDING_RATE = 0.10` in `dividend.service.ts:145`, `pcle.distribution.ts:185`, `reconciliation.engine.ts:619`. Turkish GVK 94 dividend stopaj was **raised to 15% (eff. 2024-12-22)**.

**Risk.** Under-withholding by 5 points → net distributions overstated, under-payment of withholding tax.

**Recommendation.** Make it a **dated, configurable parameter** (not a constant) and set the current rate. **Requires operator/CFO confirmation** of the rate applicable to this company's declarations and effective dates before changing the number (rates change and depend on the declaration date).

---

## DP-4 (MEDIUM) — `accepted_at` not enforced in tenant-membership predicates

**Issue.** `is_company_member`/`is_company_admin` (now filter `deleted_at`, fixed) still do **not** require `accepted_at IS NOT NULL`, so an invited-but-not-accepted user has RLS access.

**Evidence (live data).** Of 5 active admins, **1 has `accepted_at IS NULL`** (an unaccepted invite). Adding the filter would immediately **remove that user's RLS access**.

**Risk.** Low security exposure (the app layer's `requireRole` already filters `accepted_at`), but applying the DB filter changes a **currently-active user's** access.

**Options.**
1. Backfill that user's `accepted_at` (treat them as accepted), then add the filter — only if they are a legitimate, active admin.
2. Add the filter and let the unaccepted invite lose access (correct security semantics; they re-accept).
3. Defer.

**Recommendation.** Confirm who that admin is. If legitimately active → Option 1; if a stale/erroneous invite → Option 2. **Requires a decision** because it affects a live user.

---

---

## DP-5 (CRITICAL) — Revenue & corporate-tax matrah are computed on GROSS (KDV-inclusive) sales

**Issue.** Across the entire revenue → matrah → P&L chain, revenue is taken from a **gross** (KDV-inclusive) source; the collected output KDV is never subtracted before the figure is used as income-statement revenue and as the corporate-tax base.

**Evidence (verified by tracing every consumer).** `lib/services/finance.service.ts:75` `getRevenue` selects `total_try:total` (the `total` column is gross incl. KDV) and returns it as `total_try`; `sales_vat_try` is carried alongside but **never subtracted**. The net column `sales.revenue_try` exists but **no consumer reads it** — `income-statement.service.ts:243` sums `total_try`; `tax.service.ts` and `lib/finance/financial-core.ts` revenue selects all use the gross source; these feed `getGrossProfit`/`getNetProfit`/`computeCorporateTax`. Net effect: revenue, gross profit, net profit, EBITDA, margins, **matrah and corporate tax are overstated by output KDV (~18–20%)**.

**Why this is NOT auto-fixed (the data-integrity prerequisite).** Verified against live production: the `revenue_try` / `kdv_amount_try` columns are **inconsistently populated** — `Σtotal=48,950` but `Σrevenue_try=29,960` and `Σkdv=4,177` do not reconcile, and **3 of 11 sales have `total>0` with `revenue_try` empty (0/NULL)**. Naively switching consumers to `revenue_try` today would **understate** revenue for those rows. A `total − kdv_amount_try` fallback helps only where `kdv_amount_try` is itself correct.

**Risk.** Materially wrong financial statements and **overstated tax liability** (correctness + compliance). But shipping the fix on the current data could *replace* an over-statement with an *under-statement* → equally wrong, and harder to detect.

**Options.**
1. **(Recommended)** Two-step: **(a)** verify/repair how `convert_proforma` populates `revenue_try`/`kdv_amount_try`, then **backfill** all sales so `total = revenue_try + kdv_amount_try` holds (data-integrity migration, validated row-by-row); **(b)** switch all revenue consumers to net `revenue_try` (with a `total − kdv` fallback only as a transitional guard). Add a test asserting revenue is net.
2. Switch consumers now with the `total − kdv` fallback and accept that rows with bad `kdv_amount_try` stay wrong — not recommended (trades one error for another).
3. Defer.

**Recommendation.** Option 1. **Requires (a)** CFO confirmation that `revenue_try` (net of KDV) is the correct income-statement/matrah base, and **(b)** sign-off on the backfill before it changes reported revenue and tax. This is the **single highest-value accounting correction** but must not be shipped blind — hence a decision package, not an autonomous change.

---

## Decision summary

| # | Decision needed | Owner | Blocks |
|---|---|---|---|
| DP-1 | Correct dividend distributable formula (COGS + tax) | CFO / legal | dividend legality |
| DP-2 | GL-mode cutover plan for existing tenants | Business | posted ledger |
| DP-3 | Current dividend withholding rate + effective date | CFO | withholding tax |
| DP-4 | Resolution for the 1 unaccepted-invite admin | Business | one live user's access |
| DP-5 | Net-of-KDV revenue base + sales-column backfill sign-off | CFO | revenue & tax correctness |

Everything else in `05-FINAL-INDEPENDENT-AUDIT.md` that is safely fixable proceeds automatically without waiting on these.
