# DP-2 — Canonical Net-Income Architecture (design only)

*Design for the single source of truth for net income. No implementation. Grounded in the current
code (post-DP-1: the corporate-tax line already flows through `computeCorporateTax`, so the remaining
divergence is the **base**, not the rate).*

---

## 1 · Net-income owners (map)

| # | Owner | Prod importers | Feeds (screens / reports) |
|---|---|---|---|
| A | `finance.service.ts` → `getFinancialSummary().net_after_tax_try` | **26** | PnlTab, CFOTab, insights, reports/income-statement, alerts/evaluate, financial-summary route, **financial-core (quarterly)**, reconciliation engine, **cfo-pack**, **board-pack**, governance-snapshot, PartnerImpact, DebtPressure |
| B | `finance.service.ts` → `getNetProfit().net_profit_try` | (within the 26) | pre-tax "net profit" consumers, dividend-adjacent reads |
| C | `finance/income-statement.service.ts` → `buildStatement().net_income` | 5 | PnlTab (formal P&L), IncomeStatementClient, income-statement route, gl-readiness, gl-shadow-audit |
| D | `ledger/gl-income-statement.service.ts` → `net_income_try` | 3 | PnlTab (gl mode), gl-readiness, gl-shadow-audit |
| E | `finance/period-comparison.service.ts` → `net_profit_try` | 1 | period-comparison route (MoM view) |
| — | `lib/finance/financial-core.ts` (quarterly/CFO) | 8 | **not independent** — delegates to A (`getFinancialSummary`) and to `computeTaxMetrics` (kernel) |

---

## 2 · Current formulas (exact)

- **A · `net_after_tax_try` = `matrah − corporate_tax`**
  where `matrah = revenue − COGS − deductible_expenses` (DP-1 kernel) and `corporate_tax = computeCorporateTax(matrah)`.
  → **subtracts only DEDUCTIBLE expenses; non-deductible (KKEG) expenses are never subtracted.**
- **B · `net_profit_try` = `gross_profit − ALL expenses`** (no tax). A *pre-tax* operating result.
- **C · income-statement `net_income` = `EBT − tax`**
  where `EBT = (revenue − COGS) − ALL operating_expenses − interest_expense`, `tax = computeTaxProvision(EBT)` (DP-1 kernel).
  → **subtracts all opex + interest; taxes the EBT base.** This is the MSUGT "Net Dönem Kârı".
- **D · GL `net_income_try` = `EBT_gl − tax_booked`**
  where `EBT_gl = (acct600 − acct620) − opex_accts − financeExp + otherIncome`, `tax_booked = balance(acct 360)`.
  → **tax is the BOOKED amount (≈ 0 until KV is journaled at filing)**, so GL net ≈ pre-tax most of the year.
- **E · period-comparison `net_profit_try` = `revenue − expenses`** (gross_profit = revenue, *"simplified: no COGS"*; no tax).

---

## 3 · Divergences

| Dimension | A net_after_tax | C income-statement | D GL | E period-comp |
|---|---|---|---|---|
| COGS | real FIFO | real FIFO | GL acct 620 | **none** (40% est for gross) |
| Non-deductible (KKEG) exp | **excluded** | subtracted | subtracted (GL) | subtracted (all exp) |
| Interest expense | (excluded from matrah) | separate EBT line | separate finance exp | folded in expenses |
| Tax base | matrah | EBT | booked (acct 360) | none |
| Corporate tax | DP-1 kernel | DP-1 kernel | **booked, ~0** | none |

**Material divergences:**
- **DV-1 (the big one): A vs C disagree by the expenses A omits.** `net_after_tax_try = matrah − tax`
  does not subtract non-deductible expenses (and treats interest only via matrah's deductible set),
  so for any company with KKEG/fines/non-deductible interest, **A overstates net income vs C.** A is the
  *most-imported* figure (26) and is consumed as "net income" on PnlTab, CFOTab, the report packs, and
  governance snapshots — so the overstatement is widespread.
- **DV-2: D (GL) uses booked tax (~0).** Until the KV provision is journaled, GL net ≈ pre-tax →
  materially higher than A/C. Only meaningful once GL is primary (DP-8) but already powers the shadow-audit deltas.
- **DV-3: E ignores COGS and tax entirely** → revenue − expenses; only safe as a *labelled* rough MoM trend.
- **DV-4: B is pre-tax** but named `net_profit_try` — easily mistaken for net income.

---

## 4 · Recommended canonical owner + definition

**Canonical net income (MSUGT "Net Dönem Kârı"):**
```
net_income = revenue − COGS − operating_expenses(ALL) − interest_expense − corporate_tax
             where corporate_tax = computeCorporateTax(canonical matrah).tax_try   [DP-1]
```
This is exactly what **owner C (`IncomeStatementService`) already computes.** So:

- **Canonical OPERATIONAL owner = `IncomeStatementService` (the formal Gelir Tablosu).** Extract its
  net-income math into a pure `computeNetIncome` kernel that everything reuses.
- **Canonical STATUTORY owner = `GLIncomeStatementService`** *when `gl_mode = gl_primary`* (posted ledger
  is truth). `gl-shadow-audit` reconciles operational (C) vs GL (D) — this stays.
- **Two-tier, reconciled, never two formulas:** operational net = the kernel; statutory net = the GL;
  the shadow-audit asserts they agree within tolerance. Outside gl_primary, the GL figure is the *estimate-checker*, not a second public number.

**Sub-decisions DP-2 entails (this is what your approval settles):**
- **C1 — fix `net_after_tax_try`.** It is `matrah − tax` (a *tax* concept), not net income. **Recommend:
  redefine it as true net income** = `gross_profit − ALL expenses − corporate_tax` (= owner C's value),
  so the 26 consumers automatically get the correct figure. *(Alternative: rename it `matrah_net_try`
  and migrate consumers to C — more churn, same end.)*
- **C2 — `getNetProfit.net_profit_try`** → relabel "Faaliyet Kârı (vergi öncesi)" / operating-profit-before-tax. It is **not** net income; keep it, just name it honestly.
- **C3 — period-comparison (E)** → route through the canonical kernel (real COGS + tax) **or** keep as an explicitly labelled *"basitleştirilmiş MoM eğilim"* estimate. Recommend: label (it's a trend view, exactness not needed).
- **C4 — GL booked tax (D)** → when `gl_primary` and KV is not yet journaled, fall back to the computed
  provision (or accrue it at period close) so GL net isn't stuck at pre-tax. Bundle with DP-8.

---

## 5 · Migration path (strangler — mirrors DP-1, numerically-neutral first)

- **Phase 0 — extract the kernel.** New pure `computeNetIncome({revenue, cogs, operating_expenses, interest_expense, matrah})` → `{ ebt, corporate_tax (via DP-1 kernel), net_income }`. Pure module, no Supabase. *No behaviour change.*
- **Phase 1 — C consumes the kernel.** `IncomeStatementService.buildStatement` calls `computeNetIncome`. **Numerically neutral** (it already computes this); a snapshot proves equality.
- **Phase 2 — fix A (C1).** `getFinancialSummary.net_after_tax_try` redefined to `gross − all_expenses − tax` (true net). **THIS CHANGES NUMBERS** (drops by the omitted-expense amount). Before/after snapshot per fixture; this is the one material change and the heart of DP-2.
- **Phase 3 — relabel B (C2); route/label E (C3).**
- **Phase 4 — CI guards.** (a) single-kernel guard: net income only computed in `computeNetIncome`; (b) **reconciliation test**: `IncomeStatementService.net_income` === `getFinancialSummary.net_after_tax_try` to the kuruş for shared fixtures; (c) shadow-audit asserts GL-vs-operational within tolerance. A second net-income formula → red build.
- **Phase 5 — consumers.** Most read A already; after C1 they get the corrected value with no change. Audit the 26 for any that *want* the pre-tax or matrah figure (point those at B or `matrah_try`).

---

## 6 · Expected impact

- **`net_after_tax_try` decreases** on every surface that shows it (PnlTab, CFOTab, insights, report
  packs, alerts, governance snapshots, financial-core quarterly) **by the non-deductible-expense (+interest-treatment) amount** — i.e. it becomes *correct* (today it overstates). **Companies with zero non-deductible expenses see no change.**
- **Owner C (formal P&L) net is unchanged** — it is already the canonical definition.
- **One net income everywhere**, GL-vs-operational reconciled, CI-locked — removes the structural
  "statements disagree" cause for net income (the registry's #1 divergence).
- **Risk: medium.** One genuine reported-number decrease (a correction, not a regression) → must be
  snapshotted and communicated. Everything else is neutral relabel/kernel-extraction.
- **Effort: L.** Bulk is Phase 2 + the reconciliation guard; consumers are mostly automatic.

**Dependencies:** DP-1 ✅ (tax line already on the kernel). DV-2/C4 (GL booked tax) overlaps DP-8 (GL
line tables). DP-2 is independently executable for the operational tier today.

---

### One-line recommendation
Make `IncomeStatementService`'s definition the single net-income kernel; **correct `net_after_tax_try`
to subtract all expenses (it currently overstates net by omitting non-deductible expenses)**; reconcile
GL-vs-operational via the existing shadow-audit; lock with a kuruş-level reconciliation CI test.
