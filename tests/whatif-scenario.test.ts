// Node-env tests for computeScenario — the pure what-if engine extracted from
// WhatIfClient.tsx. It was explicitly "usable outside component" but untested.
import { describe, it, expect } from 'vitest'
import { computeScenario } from '@/app/dashboard/planning/_tabs/_whatif/scenario'

const baseline = { revenue: 1_000_000, cogs: 600_000, expenses: 200_000, salesVat: 0, purchaseVat: 0, monthlyDebtService: 50_000 }
const flat = { revChange: 0, expChange: 0, cogsChange: 0, collDelay: 0, debtChange: 0, taxRateOverride: 25 }

describe('computeScenario (extracted from WhatIfClient)', () => {
  it('with no slider changes reflects the baseline P&L', () => {
    const r = computeScenario(flat, baseline)
    expect(r.revenue).toBe(1_000_000)
    expect(r.grossProfit).toBe(400_000)              // 1M − 600k
    expect(r.grossMarginPct).toBeCloseTo(0.4)
    expect(r.ebitda).toBe(200_000)                   // 400k − 200k
    expect(r.ebt).toBe(150_000)                      // 200k − 50k debt
    expect(r.tax).toBe(37_500)                       // 150k × 25%
    expect(r.netIncome).toBe(112_500)
    expect(r.distributable).toBeCloseTo(106_875)     // ×0.95 reserve
    expect(r.runwayMonths).toBeNull()                // profitable → no runway
  })

  it('scales revenue/cogs/expenses/debt by their slider percentages', () => {
    const r = computeScenario({ ...flat, revChange: 10, cogsChange: -10, expChange: 50, debtChange: 100 }, baseline)
    expect(r.revenue).toBe(1_100_000)
    expect(r.cogs).toBe(540_000)
    expect(r.expenses).toBe(300_000)
    expect(r.debtSvc).toBe(100_000)
  })

  it('clamps negative scaled inputs to 0 and applies no tax on a loss', () => {
    const r = computeScenario({ ...flat, revChange: -100, expChange: 0 }, baseline)
    expect(r.revenue).toBe(0)
    expect(r.tax).toBe(0)            // ebt <= 0 → no tax
    expect(r.netIncome).toBeLessThan(0)
    expect(r.runwayMonths).toBe(0)  // loss + revenue 0 / burn → 0
  })

  it('honors a tax-rate override', () => {
    const a = computeScenario({ ...flat, taxRateOverride: 0 }, baseline)
    const b = computeScenario({ ...flat, taxRateOverride: 40 }, baseline)
    expect(a.tax).toBe(0)
    expect(b.tax).toBe(60_000)      // 150k × 40%
  })
})
