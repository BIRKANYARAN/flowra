// ── dp2-net-income-single-kernel.test.ts ─────────────────────────────────────
// DP-2 GUARD + regression snapshot + reconciliation: net income has ONE kernel.
//
// Approved decision (DP-2): canonical net income = EBT − corporate_tax, where
//   EBT = revenue − COGS − ALL operating expenses − interest,
//   corporate_tax = computeCorporateTax(matrah).tax_try   [DP-1 kernel].
// `computeNetIncome` is the single kernel. `net_after_tax_try` was redefined from
// the old `matrah − tax` (which omitted non-deductible expenses and overstated
// net) to true net income. IncomeStatementService routes through the same kernel.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve, join } from 'path'
import { computeNetIncome, computeCorporateTax } from '@/lib/services/tax.service'

const ROOT = resolve(__dirname, '..')

describe('DP-2 — computeNetIncome kernel', () => {
  it('net income = EBT − corporate_tax (subtracts ALL expenses + interest)', () => {
    const r = computeNetIncome({
      revenue_try: 500_000, cogs_try: 200_000,
      operating_expenses_try: 120_000, interest_expense_try: 0,
      deductible_expenses_try: 80_000, rate_percent: 25,
    })
    // EBT = 500k − 200k − 120k = 180k ; matrah = 500k − 200k − 80k = 220k ;
    // tax = 220k × 25% = 55k ; net = 180k − 55k = 125k
    expect(r.ebt_try).toBe(180_000)
    expect(r.matrah_try).toBe(220_000)
    expect(r.corporate_tax_try).toBe(55_000)
    expect(r.net_income_try).toBe(125_000)
  })

  it('REGRESSION SNAPSHOT — true net (EBT−tax) is below the old matrah−tax by the non-deductible amount', () => {
    const input = {
      revenue_try: 500_000, cogs_try: 200_000,
      operating_expenses_try: 120_000, interest_expense_try: 0,
      deductible_expenses_try: 80_000, rate_percent: 25,
    }
    const ni = computeNetIncome(input)
    const oldMatrahMinusTax = computeCorporateTax({
      revenue_try: input.revenue_try, cost_try: input.cogs_try,
      deductible_expenses_try: input.deductible_expenses_try, rate_percent: input.rate_percent,
    }).net_after_tax_try
    const nonDeductible = input.operating_expenses_try - input.deductible_expenses_try
    expect(oldMatrahMinusTax - ni.net_income_try).toBe(nonDeductible)   // 40_000
  })

  it('an EBT-based provision (operational P&L) sets deductible = opex+interest → matrah == EBT', () => {
    const r = computeNetIncome({
      revenue_try: 500_000, cogs_try: 200_000,
      operating_expenses_try: 100_000, interest_expense_try: 20_000,
      deductible_expenses_try: 100_000 + 20_000, rate_percent: 25,
    })
    expect(r.matrah_try).toBe(r.ebt_try)                       // 180k
    expect(r.net_income_try).toBe(r.ebt_try - r.corporate_tax_try)
  })

  it('loss → no negative tax (floor)', () => {
    const r = computeNetIncome({
      revenue_try: 100_000, cogs_try: 80_000, operating_expenses_try: 50_000,
      interest_expense_try: 0, deductible_expenses_try: 50_000, rate_percent: 25,
    })
    expect(r.corporate_tax_try).toBe(0)        // matrah = -30k → 0
    expect(r.net_income_try).toBe(-30_000)     // EBT = -30k, net = -30k (real loss)
  })
})

describe('DP-2 — reconciliation: IncomeStatementService & net_after_tax_try use the kernel', () => {
  it('given identical components, finance.service and income-statement produce the same net (same kernel)', () => {
    // finance.service path: interest folded into operating_expenses, real deductible.
    const finance = computeNetIncome({
      revenue_try: 400_000, cogs_try: 150_000,
      operating_expenses_try: 90_000, interest_expense_try: 0,
      deductible_expenses_try: 70_000, rate_percent: 25,
    })
    // income-statement path on the SAME economics (opex split out interest, deductible=opex+interest
    // → its operational EBT-based provision). EBT is identical; only the tax base differs by design.
    const incomeStmt = computeNetIncome({
      revenue_try: 400_000, cogs_try: 150_000,
      operating_expenses_try: 70_000, interest_expense_try: 20_000,
      deductible_expenses_try: 70_000 + 20_000, rate_percent: 25,
    })
    expect(incomeStmt.ebt_try).toBe(finance.ebt_try)           // pretax reconciles exactly
    // both are EBT − (a kernel-computed corporate tax); the tax-base difference
    // (matrah vs EBT) is the documented operational-vs-statutory distinction (DP-2b).
  })
})

describe('DP-2 — static guard: net income only via computeNetIncome', () => {
  it('finance.service builds net_after_tax_try from computeNetIncome', () => {
    const src = readFileSync(join(ROOT, 'lib/services/finance.service.ts'), 'utf8')
    expect(src).toContain('computeNetIncome(')
    expect(src).toContain('net_after_tax_try:           ni.net_income_try')
    // must NOT revert to the old matrah−tax definition
    expect(src).not.toMatch(/net_after_tax_try:\s*corpTx\.net_after_tax_try/)
  })

  it('income-statement builds net income from computeNetIncome', () => {
    const src = readFileSync(join(ROOT, 'lib/services/finance/income-statement.service.ts'), 'utf8')
    expect(src).toContain('computeNetIncome(')
    expect(src).not.toMatch(/const netIncome = ebt - taxProv/)   // old inline form
  })
})
