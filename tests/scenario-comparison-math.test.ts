// Node-env tests for the pure decision/ranking functions in
// scenario-comparison.service.ts — they drive which planning scenario gets
// recommended, and were untested.
import { describe, it, expect } from 'vitest'
import {
  computeBaselineDelta, computeImpliedCagr, computeScenarioDelta,
  computeRiskAdjustedReturn, classifyScenarioRisk, recommendScenario, computeScenarioRank,
} from '@/lib/services/planning/scenario-comparison.service'

const summary = (over: Record<string, unknown>) => ({
  id: 'x', total_revenue: 1000, total_net_income: 100, net_margin_pct: 10,
  runway_months: 12, min_cash: 100_000, ...over,
// eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any

describe('computeBaselineDelta (% change vs baseline)', () => {
  it('= (value − baseline) / |baseline| × 100', () => {
    expect(computeBaselineDelta(120, 100)).toBe(20)
    expect(computeBaselineDelta(80, 100)).toBe(-20)
    expect(computeBaselineDelta(100, -100)).toBe(200) // uses |baseline|
  })
  it('returns null on null inputs or a zero baseline', () => {
    expect(computeBaselineDelta(null, 100)).toBeNull()
    expect(computeBaselineDelta(5, null)).toBeNull()
    expect(computeBaselineDelta(5, 0)).toBeNull()
  })
})

describe('computeImpliedCagr (m1 → m12, 12 months = 1 year)', () => {
  it('= (m12/m1 − 1) × 100', () => {
    expect(computeImpliedCagr(100, 121)).toBeCloseTo(21)
    expect(computeImpliedCagr(100, 100)).toBe(0)
  })
  it('returns null on null inputs, zero start, or a non-positive ratio', () => {
    expect(computeImpliedCagr(100, null)).toBeNull()
    expect(computeImpliedCagr(0, 100)).toBeNull()
    expect(computeImpliedCagr(100, -50)).toBeNull()
  })
})

describe('computeRiskAdjustedReturn', () => {
  it('= (netIncome/capital) × max(0.1, 1 + minCash/capital)', () => {
    // 100k/1M = 0.1 base; penalty max(0.1, 1.05) = 1.05 → 0.105
    expect(computeRiskAdjustedReturn(100_000, 50_000, 1_000_000)).toBeCloseTo(0.105, 4)
  })
  it('floors the penalty at 0.1 when min cash is deeply negative', () => {
    // penalty max(0.1, 1 − 2) = 0.1 → 0.1 × 0.1 = 0.01
    expect(computeRiskAdjustedReturn(100_000, -2_000_000, 1_000_000)).toBeCloseTo(0.01, 4)
  })
  it('returns null when total capital is zero', () => {
    expect(computeRiskAdjustedReturn(100_000, 0, 0)).toBeNull()
  })
})

describe('classifyScenarioRisk (min cash + runway tiers)', () => {
  it('critical when min cash < 0 or runway < 3', () => {
    expect(classifyScenarioRisk(-1, 24)).toBe('critical')
    expect(classifyScenarioRisk(300_000, 2)).toBe('critical')
  })
  it('high / moderate / low otherwise', () => {
    expect(classifyScenarioRisk(40_000, 24)).toBe('high')      // < 50k
    expect(classifyScenarioRisk(300_000, 5)).toBe('high')      // runway < 6
    expect(classifyScenarioRisk(100_000, 24)).toBe('moderate') // < 200k
    expect(classifyScenarioRisk(300_000, 10)).toBe('moderate') // runway < 12
    expect(classifyScenarioRisk(300_000, 24)).toBe('low')
  })
})

describe('computeScenarioDelta', () => {
  it('reports revenue/net-income/runway deltas and the better-than flags', () => {
    const base = summary({ total_revenue: 1000, total_net_income: 100, net_margin_pct: 10, runway_months: 12 })
    const comp = summary({ total_revenue: 1500, total_net_income: 200, net_margin_pct: 13, runway_months: 18 })
    const d = computeScenarioDelta(base, comp)
    expect(d.revenue_delta).toBe(500)
    expect(d.revenue_delta_pct).toBeCloseTo(50)
    expect(d.net_income_delta).toBe(100)
    expect(d.runway_delta_months).toBe(6)
    expect(d.is_revenue_better).toBe(true)
    expect(d.is_margin_better).toBe(true)
    expect(d.is_runway_better).toBe(true)
  })
})

describe('recommendScenario', () => {
  it('among solvent scenarios picks the highest net margin', () => {
    const out = recommendScenario([
      summary({ id: 'a', runway_months: 12, min_cash: 100_000, net_margin_pct: 10 }),
      summary({ id: 'b', runway_months: 12, min_cash: 100_000, net_margin_pct: 20 }),
      summary({ id: 'c', runway_months: 2,  min_cash: -5_000,  net_margin_pct: 50 }), // insolvent → excluded
    ])
    expect(out).toBe('b')
  })
  it('falls back to the highest min-cash when nothing is solvent', () => {
    const out = recommendScenario([
      summary({ id: 'a', runway_months: 2, min_cash: -100, net_margin_pct: 5 }),
      summary({ id: 'b', runway_months: 2, min_cash: -50,  net_margin_pct: 1 }),
    ])
    expect(out).toBe('b')
  })
  it('returns null for an empty list', () => {
    expect(recommendScenario([])).toBeNull()
  })
})

describe('computeScenarioRank (composite of revenue/margin/runway/risk)', () => {
  it('ranks a scenario that dominates every dimension as #1', () => {
    const all = [
      summary({ id: 'A', total_revenue: 1000, net_margin_pct: 20, runway_months: 24, min_cash: 500_000 }),
      summary({ id: 'B', total_revenue: 500,  net_margin_pct: 10, runway_months: 12, min_cash: 100_000 }),
    ]
    expect(computeScenarioRank(all[0], all)).toBe(1)
    expect(computeScenarioRank(all[1], all)).toBe(2)
  })
})
