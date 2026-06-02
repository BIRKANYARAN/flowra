# Flowra — Canonical Figure Registry

*The verified map of where each core financial figure is computed today, which paths diverge, and
the recommended canonical owner. Produced by a code-grounded audit (importer counts + formula
quotes verified against source). This is the executable checklist for the "one source of truth"
program (RC-1): each DECISION row needs an accounting/tax sign-off before the merge, because merging
two divergent paths changes a reported number.*

**Legend** — `SAFE_DELETE`: a member has ~0 production importers and is redundant (remove freely).
`SAFE_GUARD`: effectively one owner already — lock it with a CI catalogue test (no number changes).
`DECISION`: ≥2 live members compute the same concept with different formulas → merging changes a
statutory/reported figure → approval-gated.

---

## 1 · Net income / income statement — **DECISION**
Five live, intentionally-divergent owners (operational estimate vs GL truth vs simplified MoM):
| Path | Importers | Net-income formula |
|---|---|---|
| `lib/services/finance/income-statement.service.ts` | 5 | EBT − 25%×max(0,EBT); EBT = rev−COGS−opex−interest |
| `lib/services/ledger/gl-income-statement.service.ts` | 3 | GL-derived; net = ebt − **booked** acct 360 (often 0 if KV unbooked) |
| `lib/services/finance.service.ts` | 26 | `net_after_tax_try` (matrah×rate) **and** `getNetProfit` (gross − all expenses, no tax) |
| `lib/finance/financial-core.ts` | 8 | aggregator — delegates to FinanceService (not an independent formula) |
| `lib/services/finance/period-comparison.service.ts` | 1 | rev − expenses (no COGS, no tax — deliberately simplified MoM) |

**Recommended canonical:** in `gl_primary` mode `GLIncomeStatementService` is the statutory source;
`income-statement.service.ts` + `finance.service.getFinancialSummary` are the operational/estimate
owners, reconciled at runtime by `lib/admin/gl-shadow-audit.ts`. **Do not** count `financial-core`
or `reconciliation.engine` section-15 as deletable — they are consumers that delegate.
**Safe interim:** a catalogue/CI guard locking these 5 formulas so a 6th path can't be added silently.

## 2 · Corporate tax / matrah — **PARTIALLY FIXED ✅ + DECISION**
- ✅ **Rate divergence fixed (this cycle):** `tax/tax-compliance.service.ts` hardcoded the stale **0.20**;
  brought to `CORPORATE_TAX_RATE_TR` (25%), matching `tax.service.ts`, `income-statement.service.ts`,
  and the statutory rate. Locked by `tests/corporate-tax-rate-single-source.test.ts`.
- ⏳ **Matrah-base divergence (DECISION):** the paths still build the matrah base slightly differently
  (deductible-only opex vs all-expenses; interest treatment). Unifying the *base* changes the reported
  KV → needs a tax-authority ruling on the canonical matrah definition. **Recommended:** the
  `getCorporateTax` kernel (revenue − COGS − deductible + KKEG) as the single matrah owner.

## 3 · Balance sheet / equity — **SAFE_DELETE done ✅ + DECISION**
| Path | Importers | Note |
|---|---|---|
| ~~`lib/finance/balance-sheet.ts`~~ | 0 | ✅ **DELETED this cycle** — dead residual-plug (`retained = A−L−paidIn`, always "balances") |
| `lib/services/balance-sheet.service.ts` | 28 | live canonical point-in-time BS; reports real imbalance |
| `lib/services/ledger/gl-balance-sheet.service.ts` | 6 | GL-account-sourced (acct 570/590/500) — statutory in gl_primary |
| `lib/services/finance/retained-earnings.service.ts` | 4 | retained-earnings rollforward (distinct concept, keep) |

**Recommended canonical:** `gl-balance-sheet.service.ts` in gl_primary; `balance-sheet.service.ts` is
the operational owner. Reconcile, then converge (DECISION — changes equity presentation).

## 4 · Working capital / cash-release — **DECISION (+ a dead class to clean later)**
| Path | Importers | Note |
|---|---|---|
| `lib/services/finance/working-capital.service.ts` | 6 | canonical CCC/DSO/DPO/DIO — keep |
| `lib/services/finance/working-capital-optimization.service.ts` | 1 | live cash-release (backs the wired /api route) |
| `lib/services/finance/working-capital-optimizer.service.ts` | 1 (type-only) | runtime class **dead** (0 callers); only its TYPES are imported → can't hard-delete without moving the types. Follow-up cleanup. |

The two optimization services compute "cash-release potential" with **different formulas** → DECISION.

## 5 · Distribution / dividend / PCLE — **DECISION (highest stakes)**
- **Legal reserve (TTK 519) diverges:** `pcle/dividend.service.ts:137` = flat 5% of net income, **missing
  the 20%-of-paid-in-capital cap**; `pcle/dividend-calculator.service.ts` = `min(profit×5%, max(0,
  paidIn×20% − existingReserves))` **with** the cap. → different distributable figures.
  **Recommended canonical:** `dividend-calculator.service.ts` (the cap is the legally-correct TTK 519
  behavior; the flat-5% path over-reserves once cumulative reserves reach 20% of capital).
- Capital accounts (`capital-account.service.ts` net-invested vs `partner-capital-statement.service.ts`
  committed/paid) — different bases → DECISION.
- 7 distribution surfaces + 2 capital services + waterfalls — consolidate behind one
  `compute/propose/declare/void` once the canonical legal-reserve formula is chosen.

## 6 · Financial-health score — **DECISION (advisory)**
Four live 0-100 scorers, four formulas: `finance/health-scorecard.service.ts` (graded-ratio mean),
`intelligence/financial-health-score.service.ts` (Altman-Z weighted), `intelligence/financial-health-scorecard.service.ts`
(6 weighted dimensions), `_cfo/healthScore.ts` (additive buckets). All advisory, but each is shown in
the UI, so collapsing changes a displayed score. **Recommended canonical:** `FinancialHealthScorecardService`
(richest, 6 explicit weighted dimensions + trend). DECISION (advisory, low risk).

---

## Cycle log
- **Evolution cycle 1:** deleted dead `lib/finance/balance-sheet.ts`; fixed the stale 20% corporate-tax
  rate in `tax/tax-compliance.service.ts` + DRY'd `tax.service.ts`; added
  `tests/corporate-tax-rate-single-source.test.ts`. Number-neutral except the intended KV-rate
  correction (20→25%, completing the earlier income-statement unification).
- **Evolution cycle 2:** 9 code-grounded SAFE items, all tsc+tests+build verifiable:
  1. Deleted the dead `WorkingCapitalOptimizerService` runtime class (kept its types + tested pure fns;
     the live path uses `WorkingCapitalOptimizationService`).
  2–5. **Data-honesty:** threaded the COGS row-cap truncation warning (log-level, number-neutral) into
     `margin-trend`, `ebitda-bridge`, `financial-ratios`, `gross-margin-bridge` — they previously
     truncated COGS silently; also fixed two swallowed `catch {}` in gross-margin-bridge.
  6. **Correctness (number-changing):** `tax/tax-compliance.service.ts` read a **non-existent**
     `sales.kdv_total` → the query 400'd → the compliance dashboard's Hesaplanan KDV (output VAT) was
     silently **0**. Fixed to `kdv_amount_try` (the real column). Same class as the prior accepted
     non-existent-column fixes; makes KDV correct, not a policy change.
  7–8. **Guards (zero runtime change):** `tests/period-guard-predicate.test.ts` (locks the lock/close/
     open/adjustment write-block predicate) + `tests/fx-source-contract.test.ts` (locks the no-silent-1:1
     rule: identity/unavailable sources + the no-rate warn).
  9. **Reliability:** guarded `req.json()` in `POST /api/cost-entries` → 422 on malformed body (was an
     unhandled 500).
- **Open DECISIONs (need sign-off, priority order):** #1 net-income canonical · #2 matrah base ·
  #5 dividend legal-reserve formula (TTK 519 cap) · #3 balance-sheet convergence · #6 health score.
  Plus a few **test-only dead modules** whose deletion is a judgment call (discards coverage):
  `lib/db/mappers.ts`, `pcle/pcle.immutability.ts` (an *unwired* immutability guard — may be a missing
  control, not dead), `inventory/supplier-performance.service.ts` (duplicate), `lib/admin/gl-rollback.ts`,
  `lib/rate-limit.ts` (unwired rate-limiter — wiring it is the better answer than deleting).

---

## Schema-drift register (cycle 3)
A live-schema cross-reference of every service `.select()/.eq()/.is()` found a class of bugs where a
**non-existent column** is read → PostgREST 400 → `data` null → a real figure **silently shows 0**
(the same root as the cycle-2 KDV bug). 13 found, classified:

**FIXED (cycle 3 — live, unambiguous rename, non-statutory operational features that were broken):**
- `inventory/fifo-audit.service.ts` — `sale_item_allocations.stock_lot_id,qty` → `lot_id,qty_allocated`
  (every lot showed un-consumed → FIFO integrity scoring wrong).
- `inventory/sales-velocity.service.ts` — `sale_item_allocations.qty` → `qty_allocated` (units sold = 0).
- `inventory/reorder-alert.service.ts` — `sale_items.qty_sold` → `qty` (consumption = 0 → reorder alerts never fired).
- `pcle/interest-rate-sensitivity.service.ts` — `sales.invoice_date` → `sale_date` (revenue = 0 → sensitivity empty).
- `app/api/export/sales/route.ts` — `sale_items.unit_price_try` → `unit_price` (whole sales CSV export was 500'ing).

**DEFERRED — DECISION (touch tax/dividend/shareholder-capital figures or are multi-field-broken):**
- `tax/tax-reserve.service.ts` — 6-field drift incl. an **input-KDV deductibility policy** choice
  (`kdv_deductible` filter doesn't exist; siblings use `kdv>0`). Coordinated fix + policy ruling.
- `pcle/dividend-calculator.service.ts` — `accounting_periods.net_profit_try` → `period_profit_try`:
  unambiguous rename, **but it sets the dividend distributable basis** (statutory) → with the
  dividend-reserve DECISION.
- `pcle/{distribution-simulator,capital-statement,dividend-ledger}.service.ts` —
  `partner_capital_commitments.paid_amount_try` → `paid_try`: factual paid-in-capital fixes, but they
  move **shareholder-facing capital figures** → bundle with the capital-account canonical decision.
- ~30 more structural/ambiguous drifts (e.g. `sale_items.unit_cost` doesn't exist — cost lives in
  `sale_item_allocations`; `expenses.vendor_name`/`supplier_name` don't exist; ledger services read
  `journal_entries.debit_try/credit_try` which live on `journal_entry_lines`). These need a re-source
  /join, not a rename → DECISION (and several reveal the GL line-level tables aren't wired yet).
