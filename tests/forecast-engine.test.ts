/**
 * Tests for lib/engines/forecast.engine.ts
 *
 * Pure functions — no DB calls, no side effects.
 * Run with: npx vitest run tests/forecast-engine.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  computeForecast,
  buildForecastInputs,
  computeDebtPressureTimeline,
  distributeRevenue,
  buildThreeScenarios,
  SEASONAL_PRESETS,
  type ForecastInputs,
  type TrailingMonthActual,
} from '../lib/engines/forecast.engine'

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a minimal ForecastInputs for testing */
function mkInputs(overrides: Partial<ForecastInputs> = {}): ForecastInputs {
  return {
    avgMonthlyRevenue:       100_000,
    avgMonthlyExpenses:       80_000,
    currentCash:             200_000,
    monthlyDebtService:            0,
    optimisticGrowthFactor:     0.15,
    pessimisticStressFactor:    0.20,
    startYear:                  2025,
    startMonth:                    1,
    ...overrides,
  }
}

// ── computeForecast — basic structure ─────────────────────────────────────────

describe('computeForecast — output structure', () => {
  it('returns three scenarios: base, optimistic, pessimistic', () => {
    const result = computeForecast(mkInputs())
    expect(result.base).toHaveLength(12)
    expect(result.optimistic).toHaveLength(12)
    expect(result.pessimistic).toHaveLength(12)
  })

  it('each scenario has 12 months', () => {
    const result = computeForecast(mkInputs())
    for (const scenario of [result.base, result.optimistic, result.pessimistic]) {
      expect(scenario).toHaveLength(12)
    }
  })

  it('each month has label, revenue, net, cash fields', () => {
    const result = computeForecast(mkInputs())
    const month  = result.base[0]
    expect(typeof month.label).toBe('string')
    expect(typeof month.revenue).toBe('number')
    expect(typeof month.net).toBe('number')
    expect(typeof month.cash).toBe('number')
  })

  it('summary has base, optimistic, pessimistic keys', () => {
    const result = computeForecast(mkInputs())
    expect(result.summary.base).toBeDefined()
    expect(result.summary.optimistic).toBeDefined()
    expect(result.summary.pessimistic).toBeDefined()
  })
})

// ── computeForecast — scenario ordering ──────────────────────────────────────

describe('computeForecast — scenario ordering', () => {
  it('optimistic always has higher revenue than base (per month)', () => {
    const result = computeForecast(mkInputs({ avgMonthlyRevenue: 100_000 }))
    for (let i = 0; i < 12; i++) {
      expect(result.optimistic[i].revenue).toBeGreaterThan(result.base[i].revenue)
    }
  })

  it('pessimistic always has lower revenue than base (per month)', () => {
    const result = computeForecast(mkInputs({ avgMonthlyRevenue: 100_000 }))
    for (let i = 0; i < 12; i++) {
      expect(result.pessimistic[i].revenue).toBeLessThan(result.base[i].revenue)
    }
  })

  it('optimistic end-cash >= base end-cash >= pessimistic end-cash', () => {
    const result = computeForecast(mkInputs())
    const baseCash       = result.base[11].cash
    const optimisticCash = result.optimistic[11].cash
    const pessimisticCash= result.pessimistic[11].cash
    expect(optimisticCash).toBeGreaterThanOrEqual(baseCash)
    expect(baseCash).toBeGreaterThanOrEqual(pessimisticCash)
  })
})

// ── computeForecast — cash accumulation ──────────────────────────────────────

describe('computeForecast — cash accumulation', () => {
  it('cash is cumulative: month[i].cash = month[i-1].cash + net[i]', () => {
    const result = computeForecast(mkInputs({ currentCash: 500_000 }))
    for (let i = 1; i < 12; i++) {
      const expected = Number((result.base[i - 1].cash + result.base[i].net).toFixed(2))
      expect(result.base[i].cash).toBeCloseTo(expected, 1)
    }
  })

  it('first month cash = currentCash + net[0]', () => {
    const inputs = mkInputs({ currentCash: 300_000, avgMonthlyRevenue: 100_000, avgMonthlyExpenses: 80_000, monthlyDebtService: 0 })
    const result = computeForecast(inputs)
    const expected = 300_000 + (100_000 - 80_000)  // = 320,000
    expect(result.base[0].cash).toBeCloseTo(expected, 0)
  })
})

// ── computeForecast — debt service ───────────────────────────────────────────

describe('computeForecast — debt service reduces cash', () => {
  it('adding debt service reduces net income and cash vs no debt', () => {
    const noDebt   = computeForecast(mkInputs({ monthlyDebtService: 0 }))
    const withDebt = computeForecast(mkInputs({ monthlyDebtService: 10_000 }))
    // Net should be lower by 10,000 each month
    for (let i = 0; i < 12; i++) {
      expect(noDebt.base[i].net - withDebt.base[i].net).toBeCloseTo(10_000, 0)
    }
  })

  it('high debt service can turn profitable baseline into negative net', () => {
    const inputs = mkInputs({
      avgMonthlyRevenue:  100_000,
      avgMonthlyExpenses:  80_000,
      monthlyDebtService:  30_000,  // forces net = 100k - 110k = -10k
    })
    const result = computeForecast(inputs)
    // All months in base should have negative net
    for (const month of result.base) {
      expect(month.net).toBeLessThan(0)
    }
  })
})

// ── computeForecast — runway detection (runwayEndMonth) ──────────────────────

describe('computeForecast — runway end detection', () => {
  it('runwayEndMonth is null when cash stays positive throughout', () => {
    const result = computeForecast(mkInputs({
      currentCash: 5_000_000,
      avgMonthlyRevenue: 200_000,
      avgMonthlyExpenses: 100_000,
    }))
    expect(result.summary.base.runwayEndMonth).toBeNull()
  })

  it('runwayEndMonth is set when cash goes negative', () => {
    const result = computeForecast(mkInputs({
      currentCash:         50_000,
      avgMonthlyRevenue:   80_000,
      avgMonthlyExpenses: 100_000,  // burning ₺20K/month
    }))
    // With ₺50K cash and -₺20K/month, cash goes negative around month 3
    expect(result.summary.base.runwayEndMonth).not.toBeNull()
    expect(typeof result.summary.base.runwayEndMonth).toBe('string')
  })
})

// ── computeForecast — month labels ───────────────────────────────────────────

describe('computeForecast — month labels', () => {
  it('January start produces 12 monthly labels ending in December', () => {
    const result = computeForecast(mkInputs({ startYear: 2025, startMonth: 1 }))
    const labels = result.base.map(m => m.label)
    expect(labels[0]).toContain('2025')
    expect(labels[11]).toContain('2025')
    // All 12 labels should be unique
    expect(new Set(labels).size).toBe(12)
  })

  it('month wrap: November start crosses year boundary', () => {
    const result = computeForecast(mkInputs({ startYear: 2025, startMonth: 11 }))
    const labels = result.base.map(m => m.label)
    // Some labels should contain 2025, some 2026
    const has2025 = labels.some(l => l.includes('2025'))
    const has2026 = labels.some(l => l.includes('2026'))
    expect(has2025).toBe(true)
    expect(has2026).toBe(true)
  })

  it('all 12 month labels are unique (no repeats)', () => {
    const result = computeForecast(mkInputs())
    const labels = result.base.map(m => m.label)
    expect(new Set(labels).size).toBe(12)
  })
})

// ── computeForecast — zero revenue edge case ──────────────────────────────────

describe('computeForecast — edge cases', () => {
  it('zero revenue: net = -(expenses + debt), cash depletes monotonically', () => {
    const result = computeForecast(mkInputs({
      avgMonthlyRevenue: 0,
      avgMonthlyExpenses: 50_000,
      currentCash: 500_000,
    }))
    for (let i = 1; i < 12; i++) {
      expect(result.base[i].cash).toBeLessThan(result.base[i - 1].cash)
    }
  })

  it('zero expenses: net = revenue, cash grows monotonically', () => {
    const result = computeForecast(mkInputs({
      avgMonthlyRevenue: 100_000,
      avgMonthlyExpenses: 0,
    }))
    for (let i = 1; i < 12; i++) {
      expect(result.base[i].cash).toBeGreaterThan(result.base[i - 1].cash)
    }
  })

  it('currentCash=0: first month cash equals net', () => {
    const inputs = mkInputs({
      currentCash: 0,
      avgMonthlyRevenue: 100_000,
      avgMonthlyExpenses: 80_000,
    })
    const result = computeForecast(inputs)
    expect(result.base[0].cash).toBeCloseTo(20_000, 0)
  })
})

// ── computeForecast — summary statistics ────────────────────────────────────

describe('computeForecast — summary statistics', () => {
  it('summary totalRevenue = sum of monthly revenues', () => {
    const result = computeForecast(mkInputs({ avgMonthlyRevenue: 100_000 }))
    const sumRevenue = result.base.reduce((s, m) => s + m.revenue, 0)
    expect(result.summary.base.totalRevenue).toBeCloseTo(sumRevenue, 0)
  })

  it('summary totalNet = sum of monthly nets', () => {
    const result = computeForecast(mkInputs())
    const sumNet = result.base.reduce((s, m) => s + m.net, 0)
    expect(result.summary.base.totalNet).toBeCloseTo(sumNet, 0)
  })

  it('summary endCash = last month cash', () => {
    const result = computeForecast(mkInputs())
    expect(result.summary.base.endCash).toBe(result.base[11].cash)
  })

  it('summary recommendation is non-empty string', () => {
    const result = computeForecast(mkInputs())
    expect(typeof result.summary.base.recommendation).toBe('string')
    expect(result.summary.base.recommendation.length).toBeGreaterThan(0)
  })
})

// ── buildForecastInputs ───────────────────────────────────────────────────────

describe('buildForecastInputs', () => {
  const trailing6: TrailingMonthActual[] = [
    { revenue: 100_000, expenses: 80_000 },
    { revenue: 120_000, expenses: 85_000 },
    { revenue: 90_000,  expenses: 78_000 },
    { revenue: 110_000, expenses: 82_000 },
    { revenue: 95_000,  expenses: 79_000 },
    { revenue: 105_000, expenses: 81_000 },
  ]

  it('computes average monthly revenue from trailing months', () => {
    const inputs = buildForecastInputs(trailing6, 200_000, 0, 2025, 3)
    const expected = (100_000 + 120_000 + 90_000 + 110_000 + 95_000 + 105_000) / 6
    expect(inputs.avgMonthlyRevenue).toBeCloseTo(expected, 0)
  })

  it('computes average monthly expenses from trailing months', () => {
    const inputs = buildForecastInputs(trailing6, 200_000, 0, 2025, 3)
    const expected = (80_000 + 85_000 + 78_000 + 82_000 + 79_000 + 81_000) / 6
    expect(inputs.avgMonthlyExpenses).toBeCloseTo(expected, 0)
  })

  it('passes currentCash through unchanged', () => {
    const inputs = buildForecastInputs(trailing6, 500_000, 0, 2025, 3)
    expect(inputs.currentCash).toBe(500_000)
  })

  it('passes monthlyDebtService through unchanged', () => {
    const inputs = buildForecastInputs(trailing6, 200_000, 25_000, 2025, 3)
    expect(inputs.monthlyDebtService).toBe(25_000)
  })

  it('sets default growth factors (15% optimistic, 20% pessimistic)', () => {
    const inputs = buildForecastInputs(trailing6, 200_000, 0, 2025, 3)
    expect(inputs.optimisticGrowthFactor).toBe(0.15)
    expect(inputs.pessimisticStressFactor).toBe(0.20)
  })

  it('handles single trailing month (no division by 0)', () => {
    const single = [{ revenue: 100_000, expenses: 80_000 }]
    const inputs = buildForecastInputs(single, 200_000, 0, 2025, 1)
    expect(inputs.avgMonthlyRevenue).toBe(100_000)
    expect(inputs.avgMonthlyExpenses).toBe(80_000)
  })

  it('handles empty trailing array gracefully (division by max(0,1)=1)', () => {
    const inputs = buildForecastInputs([], 200_000, 0, 2025, 1)
    // max(0, 1) = 1, so 0/1 = 0
    expect(inputs.avgMonthlyRevenue).toBe(0)
    expect(inputs.avgMonthlyExpenses).toBe(0)
  })
})

// ── computeDebtPressureTimeline ───────────────────────────────────────────────

describe('computeDebtPressureTimeline — status classification', () => {
  it('all healthy months returns clearance_month = null (was never strained)', () => {
    // clearance_month only set after being strained; if always healthy, it stays null
    const result = computeDebtPressureTimeline({
      projectedMonthlyNetIncome: [100_000, 100_000, 100_000],
      monthlyDebtService:        [10_000,  10_000,  10_000],  // dsr = 0.1 → healthy
      startMonth: '2025-01',
    })
    expect(result.clearance_month).toBeNull()
  })

  it('DSR > 0.7 → insolvent status', () => {
    const result = computeDebtPressureTimeline({
      projectedMonthlyNetIncome: [10_000],
      monthlyDebtService:        [8_000],   // 8000/10000 = 0.8 > 0.7
      startMonth: '2025-01',
    })
    expect(result.periods[0].status).toBe('insolvent')
  })

  it('clearance_month is null if never falls below 0.3 after being strained', () => {
    // dsr stays at 0.4 (strained) all 3 months
    const result = computeDebtPressureTimeline({
      projectedMonthlyNetIncome: [100_000, 100_000, 100_000],
      monthlyDebtService:        [40_000,  40_000,  40_000],
      startMonth: '2025-03',
    })
    expect(result.clearance_month).toBeNull()
  })

  it('peak_dsr is the maximum DSR across all months', () => {
    const result = computeDebtPressureTimeline({
      projectedMonthlyNetIncome: [100_000, 100_000, 100_000],
      monthlyDebtService:        [10_000,  60_000,  20_000],
      startMonth: '2025-01',
    })
    // month 2: 60000/100000 = 0.6 is the highest
    expect(result.peak_dsr).toBeCloseTo(0.6, 1)
    expect(result.peak_month).toBe('2025-02')
  })

  it('months_strained counts strained periods correctly', () => {
    // dsr: 0.4, 0.6, 0.8, 0.1 → strained=1, critical=1, insolvent=1
    const result = computeDebtPressureTimeline({
      projectedMonthlyNetIncome: [100_000, 100_000, 100_000, 100_000],
      monthlyDebtService:        [40_000,  60_000,  80_000,  10_000],
      startMonth: '2025-01',
    })
    expect(result.months_strained).toBe(1)
    expect(result.months_critical).toBe(1)
    expect(result.months_insolvent).toBe(1)
  })

  it('clearance_month is set when recovery follows a strained period', () => {
    // strained then healthy
    const result = computeDebtPressureTimeline({
      projectedMonthlyNetIncome: [100_000, 100_000, 100_000],
      monthlyDebtService:        [40_000,  40_000,  5_000],  // last month dsr = 0.05 → healthy
      startMonth: '2025-06',
    })
    expect(result.clearance_month).toBe('2025-08')
  })
})

// ── distributeRevenue ─────────────────────────────────────────────────────────

describe('distributeRevenue', () => {
  it('uniform: all 12 months are equal', () => {
    const result = distributeRevenue(1_200_000, 'uniform')
    expect(result).toHaveLength(12)
    result.forEach(v => expect(v).toBeCloseTo(100_000, 0))
  })

  it('seasonal: sums to totalAnnual within rounding', () => {
    const result = distributeRevenue(1_000_000, 'seasonal')
    const sum = result.reduce((s, v) => s + v, 0)
    expect(sum).toBeCloseTo(1_000_000, -1)  // within ±10 due to rounding
  })

  it('custom: weights normalized when they do not sum to 1', () => {
    // weights sum to 2 — should be normalized
    const weights = Array(12).fill(2 / 12)
    const result = distributeRevenue(1_200_000, 'custom', weights)
    const sum = result.reduce((s, v) => s + v, 0)
    expect(sum).toBeCloseTo(1_200_000, -1)
  })

  it('custom: throws if wrong number of weights provided', () => {
    expect(() => distributeRevenue(1_000_000, 'custom', [0.1, 0.2])).toThrow()
  })

  it('custom: throws if all weights are zero', () => {
    expect(() => distributeRevenue(1_000_000, 'custom', Array(12).fill(0))).toThrow()
  })
})

// ── buildThreeScenarios ───────────────────────────────────────────────────────

describe('buildThreeScenarios', () => {
  const baseMonthlyRevenue  = Array(12).fill(100_000)
  const baseMonthlyExpenses = Array(12).fill(80_000)
  const taxRate = 0.20

  it('optimistic revenue > base revenue each month', () => {
    const { base, optimistic } = buildThreeScenarios({ baseMonthlyRevenue, baseMonthlyExpenses, taxRate })
    for (let i = 0; i < 12; i++) {
      expect(optimistic.monthly_revenue[i]).toBeGreaterThan(base.monthly_revenue[i])
    }
  })

  it('pessimistic net < base net (due to lower revenue, same expenses)', () => {
    const { base, pessimistic } = buildThreeScenarios({ baseMonthlyRevenue, baseMonthlyExpenses, taxRate })
    const baseTotal = base.monthly_net.reduce((s, n) => s + n, 0)
    const pessTotal = pessimistic.monthly_net.reduce((s, n) => s + n, 0)
    expect(pessTotal).toBeLessThan(baseTotal)
  })

  it('cumulative_net matches sum of monthly_net', () => {
    const { base, optimistic, pessimistic } = buildThreeScenarios({ baseMonthlyRevenue, baseMonthlyExpenses, taxRate })
    for (const scenario of [base, optimistic, pessimistic]) {
      const sum = scenario.monthly_net.reduce((s, n) => s + n, 0)
      expect(scenario.cumulative_net).toBeCloseTo(sum, 0)
    }
  })
})
