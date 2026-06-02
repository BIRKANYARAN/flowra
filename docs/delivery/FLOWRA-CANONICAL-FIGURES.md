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
- **Evolution cycle 1 (this commit):** deleted dead `lib/finance/balance-sheet.ts` (#3); fixed the stale
  20% corporate-tax rate in `tax/tax-compliance.service.ts` + DRY'd `tax.service.ts` (#2); added
  `tests/corporate-tax-rate-single-source.test.ts`. All number-neutral except the intended KV-rate
  correction (20→25%, completing the unification started by the earlier income-statement fix).
- **Open DECISIONs (need sign-off, in priority order):** #1 net-income canonical · #2 matrah base ·
  #5 dividend legal-reserve formula (TTK 519 cap) · #3 balance-sheet convergence · #6 health score ·
  #4 working-capital optimizer cleanup.
