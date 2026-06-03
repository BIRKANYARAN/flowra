# Flowra — Autonomous Evolution, Final Report

*Terminal report after 5 autonomous evolution cycles. Stop condition met: no SAFE executable work
remains; every remaining item requires a business/accounting/legal/shareholder decision.*

---

## Completed work (5 cycles — all gated `tsc 0 · ~25.5k tests · build green`, deployed, prod 200)

| Cycle | Commit | What shipped |
|---|---|---|
| 1 | `4bafa7a` | Fixed stale **20% corporate-tax rate → 25%** (the path the earlier unification missed; one dashboard disagreed with the whole app); deleted the dead residual-plug balance sheet; added the corporate-tax-rate single-source **guard test**. |
| 2 | `c54d7b9` | Removed a dead 385-line service class; threaded **COGS truncation warnings** into 4 silently-capping services; **fixed the KDV output-VAT bug** (read non-existent `sales.kdv_total` → compliance dashboard showed ₺0); added period-lock + FX guard tests; guarded a 500-prone route. |
| 3 | `cb89e85` | **5 live schema-drift bugs** that silently zeroed real figures — FIFO-audit, sales-velocity, reorder-alerts, interest-sensitivity, and a 500'ing sales CSV export. |
| 4 | `2dd6a90` | Hardened **11 routes' body-parsing** (malformed JSON → 422 not 500). **Audit positive: zero missing-auth gaps, zero broken routes** across all `app/api/**`. |
| 5 | `bb6505c` | `competitive-pricing` `sale_items.quantity → qty` (the last clean same-table rename). |

**Cross-cutting wins:** every fix was code-/schema-grounded and **the verification process caught false
positives 4 times** (the `companyId=""` non-bug, a "dead stub" that was live, a "missing column" that
existed, and ~13 "renames" that were actually currency re-sources) — preventing destructive action on
bad claims. New CI guards now turn three regressions (stale tax rate, a new net-income path, a silent
1:1 FX fallback, a broken period-lock predicate) into red builds. The full map of every figure, its
owners, and its drift is in `FLOWRA-CANONICAL-FIGURES.md`.

---

## Remaining decision packages — recommended decisions + expected impact

Each changes a regulated/shareholder number, so each needs your one-line ruling. Priority order:

### DP-1 · Canonical matrah (tax base) — **keystone**
- **Decision:** which matrah definition is canonical across all screens.
- **Recommend:** `revenue (net of KDV) − COGS − deductible expenses + KKEG`, with `getCorporateTax` as
  the single owner; retire the parallel definitions.
- **Impact:** the CFO cockpit, P&L tax line, Vergi and Kurumlar tabs stop disagreeing on KV; unblocks DP-2.
- **Effort:** L · **Risk:** med (changes reported KV; ship with a before/after regression snapshot).

### DP-2 · Canonical net income
- **Decision:** which of the 5 net-income owners is authoritative.
- **Recommend:** GL-derived (`GLIncomeStatementService`) is statutory once GL is primary;
  `income-statement.service.ts` + `finance.service` are explicitly the *operational estimates*,
  reconciled by the existing shadow-audit.
- **Impact:** one net-income number everywhere; removes the "statements disagree" class permanently.
- **Effort:** L · **Risk:** med.

### DP-3 · Dividend legal reserve (TTK 519)
- **Decision:** canonical legal-reserve formula.
- **Recommend:** `dividend-calculator.service.ts` — it applies the **20%-of-paid-in-capital cap**;
  `dividend.service.ts`'s flat 5% over-reserves (under-distributes) once the cap is reached.
- **Impact:** correct distributable profit; removes a TTK 509 over/under-distribution exposure.
- **Effort:** M · **Risk:** med (shareholder-facing; highest stakes).

### DP-4 · Tax-reserve service (input-KDV policy)
- **Decision:** how input-KDV deductibility is determined (the `kdv_deductible` filter doesn't exist).
- **Recommend:** match the sibling services — input KDV = expenses with `kdv > 0` (no separate
  deductibility flag, since the schema has none); then the bundled column-renames are mechanical.
- **Impact:** the tax-reserve report's KDV + corporate-tax estimates stop reading ₺0.
- **Effort:** M · **Risk:** med (tax figure).

### DP-5 · Partner capital — canonical definition + the bundled `paid_amount_try → paid_try` fixes
- **Decision:** canonical capital-account basis (net-invested vs committed/paid), then apply the 3
  factual column-fixes (`distribution-simulator`, `capital-statement`, `dividend-ledger`).
- **Recommend:** pick one basis; the renames are unambiguous once the canonical service is chosen.
- **Impact:** partner paid-in-capital displays stop showing ₺0.
- **Effort:** M · **Risk:** med (shareholder-facing).

### DP-6 · Foreign-currency revenue in product analytics
- **Decision:** how `line_total_try` (TRY revenue) is sourced for product/category margin analytics
  (the real `sale_items.line_total` is in the sale's currency — using it misstates TRY for FX sales).
- **Recommend:** re-source TRY revenue from `sales.revenue_try` (or FX-convert), not `line_total`.
- **Impact:** product/category/profitability analytics become correct for non-TRY sales (currently
  these queries 400 and show empty — so no regression, only restoration done correctly).
- **Effort:** M · **Risk:** low-med (advisory analytics, but a real currency-correctness call).

### DP-7 · Balance-sheet convergence & health-score canonical (advisory)
- Converge the operational vs GL balance sheet; pick one of the 4 health scorers
  (`FinancialHealthScorecardService` recommended). **Impact:** consistency. **Effort:** L/M · **Risk:** low.

### DP-8 · Activate the GL line tables (strategic, from the V2 blueprint)
- Several deferred drifts read `journal_entries.debit_try/credit_try`, which belong on the **line-level
  tables that aren't wired yet** — concrete evidence for the V2 "make the GL primary" track. This is a
  project, not an edit (see `12-V2-CLEAN-SHEET-BLUEPRINT.md`).

### Also pending (low priority, judgment calls)
- 5 test-only dead modules (`db/mappers`, `pcle.immutability`, `rate-limit`, `gl-rollback`,
  `inventory/supplier-performance`): deleting discards coverage; for `pcle.immutability` and
  `rate-limit`, **wiring them in is the better answer than deleting** (they're unwired guards).

---

## Bottom line
The autonomous program has exhausted the work that is safe to execute without changing a statutory or
shareholder figure. To resume execution, approve any DP above — **DP-1 (canonical matrah) is the
keystone**: one ruling there unblocks DP-2 and a cascade of figure-consistency work. Each will be
implemented end-to-end with a before/after regression snapshot, gated, and deployed.
