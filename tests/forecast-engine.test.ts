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

// ── SEASONAL_PRESETS — structure and keys ─────────────────────────────────────

describe('SEASONAL_PRESETS — structure', () => {
  it('has keys: uniform, retail_turkey, service_b2b', () => {
    expect(SEASONAL_PRESETS).toHaveProperty('uniform')
    expect(SEASONAL_PRESETS).toHaveProperty('retail_turkey')
    expect(SEASONAL_PRESETS).toHaveProperty('service_b2b')
  })

  it('each preset has exactly 12 monthly weights', () => {
    for (const key of Object.keys(SEASONAL_PRESETS) as (keyof typeof SEASONAL_PRESETS)[]) {
      expect(SEASONAL_PRESETS[key]).toHaveLength(12)
    }
  })

  it('uniform weights are all equal (1/12)', () => {
    const expected = 1 / 12
    SEASONAL_PRESETS.uniform.forEach(w => expect(w).toBeCloseTo(expected, 5))
  })

  it('retail_turkey weights sum to approximately 1.0', () => {
    const sum = SEASONAL_PRESETS.retail_turkey.reduce((s, w) => s + w, 0)
    expect(sum).toBeCloseTo(1.0, 5)
  })

  it('service_b2b weights sum to approximately 1.0', () => {
    const sum = SEASONAL_PRESETS.service_b2b.reduce((s, w) => s + w, 0)
    expect(sum).toBeCloseTo(1.0, 5)
  })

  it('all preset weights are positive', () => {
    for (const key of Object.keys(SEASONAL_PRESETS) as (keyof typeof SEASONAL_PRESETS)[]) {
      SEASONAL_PRESETS[key].forEach(w => expect(w).toBeGreaterThan(0))
    }
  })

  it('retail_turkey has higher weights in Oct (index 9) than Jan (index 0)', () => {
    // October (index 9) should be higher than January (index 0) for Turkish retail
    expect(SEASONAL_PRESETS.retail_turkey[9]).toBeGreaterThanOrEqual(SEASONAL_PRESETS.retail_turkey[0])
  })
})

// ── distributeRevenue — uniform model detailed ────────────────────────────────

describe('distributeRevenue uniform — detailed arithmetic', () => {
  it('distributes 1_200_000 equally: each month is 100_000', () => {
    const result = distributeRevenue(1_200_000, 'uniform')
    result.forEach(v => expect(v).toBeCloseTo(100_000, 1))
  })

  it('returns exactly 12 elements', () => {
    expect(distributeRevenue(600_000, 'uniform')).toHaveLength(12)
  })

  it('sum of uniform distribution equals total annual revenue', () => {
    const total = 840_000
    const sum = distributeRevenue(total, 'uniform').reduce((s, v) => s + v, 0)
    expect(sum).toBeCloseTo(total, 1)
  })

  it('uniform with odd total: distribution is still approximately equal', () => {
    // 1_000_001 / 12 ≈ 83_333.4
    const result = distributeRevenue(1_000_001, 'uniform')
    const min = Math.min(...result)
    const max = Math.max(...result)
    expect(max - min).toBeLessThanOrEqual(1)   // rounding at most ₺1 apart
  })

  it('zero total annual → all months are 0', () => {
    const result = distributeRevenue(0, 'uniform')
    result.forEach(v => expect(v).toBe(0))
  })
})

// ── distributeRevenue — seasonal model ───────────────────────────────────────

describe('distributeRevenue seasonal — uses retail_turkey preset', () => {
  it('seasonal: returns 12 monthly values', () => {
    expect(distributeRevenue(1_000_000, 'seasonal')).toHaveLength(12)
  })

  it('seasonal: values are NOT all equal (unlike uniform)', () => {
    const result = distributeRevenue(1_200_000, 'seasonal')
    const allEqual = result.every(v => Math.abs(v - result[0]) < 1)
    expect(allEqual).toBe(false)
  })

  it('seasonal: sum is close to total annual (within ±10)', () => {
    const sum = distributeRevenue(1_000_000, 'seasonal').reduce((s, v) => s + v, 0)
    expect(Math.abs(sum - 1_000_000)).toBeLessThanOrEqual(10)
  })

  it('seasonal: months with higher weights produce higher revenue', () => {
    const result = distributeRevenue(1_200_000, 'seasonal')
    // June (index 5) has weight 0.10 and January (index 0) has 0.06
    expect(result[5]).toBeGreaterThan(result[0])
  })
})

// ── computeDebtPressureTimeline — detailed checks ────────────────────────────

describe('computeDebtPressureTimeline — 12 month projection', () => {
  it('generates exactly 12 periods when 12 entries are provided', () => {
    const income  = Array(12).fill(100_000)
    const service = Array(12).fill(20_000)
    const result = computeDebtPressureTimeline({ projectedMonthlyNetIncome: income, monthlyDebtService: service, startMonth: '2025-01' })
    expect(result.periods).toHaveLength(12)
  })

  it('month labels advance correctly from start month', () => {
    const income  = Array(12).fill(100_000)
    const service = Array(12).fill(20_000)
    const result = computeDebtPressureTimeline({ projectedMonthlyNetIncome: income, monthlyDebtService: service, startMonth: '2025-01' })
    expect(result.periods[0].month).toBe('2025-01')
    expect(result.periods[11].month).toBe('2025-12')
  })

  it('year boundary: month labels cross year correctly', () => {
    const income  = Array(3).fill(100_000)
    const service = Array(3).fill(10_000)
    const result = computeDebtPressureTimeline({ projectedMonthlyNetIncome: income, monthlyDebtService: service, startMonth: '2025-11' })
    expect(result.periods[0].month).toBe('2025-11')
    expect(result.periods[1].month).toBe('2025-12')
    expect(result.periods[2].month).toBe('2026-01')
  })

  it('DSR < 0.30 → healthy status', () => {
    const result = computeDebtPressureTimeline({
      projectedMonthlyNetIncome: [100_000],
      monthlyDebtService: [25_000],   // 0.25 < 0.30
      startMonth: '2025-01',
    })
    expect(result.periods[0].status).toBe('healthy')
  })

  it('DSR between 0.30 and 0.49 → strained status', () => {
    const result = computeDebtPressureTimeline({
      projectedMonthlyNetIncome: [100_000],
      monthlyDebtService: [40_000],   // 0.40
      startMonth: '2025-01',
    })
    expect(result.periods[0].status).toBe('strained')
  })

  it('DSR between 0.50 and 0.69 → critical status', () => {
    const result = computeDebtPressureTimeline({
      projectedMonthlyNetIncome: [100_000],
      monthlyDebtService: [60_000],   // 0.60
      startMonth: '2025-01',
    })
    expect(result.periods[0].status).toBe('critical')
  })

  it('months_insolvent counts correctly', () => {
    // dsr: 80_000/10_000=8.0(insolvent), 5_000/10_000=0.5(critical), 80_000/10_000=8.0(insolvent)
    const result = computeDebtPressureTimeline({
      projectedMonthlyNetIncome: [10_000, 10_000, 10_000],
      monthlyDebtService:        [80_000,  5_000, 80_000],
      startMonth: '2025-01',
    })
    expect(result.months_insolvent).toBe(2)
    expect(result.months_critical).toBe(1)
  })

  it('peak_dsr is set to maximum DSR value', () => {
    const result = computeDebtPressureTimeline({
      projectedMonthlyNetIncome: [100_000, 100_000],
      monthlyDebtService:        [20_000, 80_000],   // 0.2, 0.8
      startMonth: '2025-01',
    })
    expect(result.peak_dsr).toBeCloseTo(0.8, 1)
  })
})

// ── buildThreeScenarios — detailed variant checks ────────────────────────────

describe('buildThreeScenarios — variant names and multipliers', () => {
  const baseMonthlyRevenue  = Array(12).fill(100_000)
  const baseMonthlyExpenses = Array(12).fill(70_000)
  const taxRate = 0.25

  it('returns all three scenario keys: base, optimistic, pessimistic', () => {
    const result = buildThreeScenarios({ baseMonthlyRevenue, baseMonthlyExpenses, taxRate })
    expect(result).toHaveProperty('base')
    expect(result).toHaveProperty('optimistic')
    expect(result).toHaveProperty('pessimistic')
  })

  it('base scenario multiplier is 1.0', () => {
    const { base } = buildThreeScenarios({ baseMonthlyRevenue, baseMonthlyExpenses, taxRate })
    expect(base.multiplier).toBe(1.0)
  })

  it('optimistic multiplier = 1 + growthFactor (default 1.15)', () => {
    const { optimistic } = buildThreeScenarios({ baseMonthlyRevenue, baseMonthlyExpenses, taxRate })
    expect(optimistic.multiplier).toBeCloseTo(1.15, 5)
  })

  it('pessimistic multiplier = 1 - stressFactor (default 0.80)', () => {
    const { pessimistic } = buildThreeScenarios({ baseMonthlyRevenue, baseMonthlyExpenses, taxRate })
    expect(pessimistic.multiplier).toBeCloseTo(0.80, 5)
  })

  it('custom growthFactor/stressFactor are reflected in multipliers', () => {
    const result = buildThreeScenarios({ baseMonthlyRevenue, baseMonthlyExpenses, taxRate, growthFactor: 0.25, stressFactor: 0.30 })
    expect(result.optimistic.multiplier).toBeCloseTo(1.25, 5)
    expect(result.pessimistic.multiplier).toBeCloseTo(0.70, 5)
  })

  it('base scenario monthly_revenue length is 12', () => {
    const { base } = buildThreeScenarios({ baseMonthlyRevenue, baseMonthlyExpenses, taxRate })
    expect(base.monthly_revenue).toHaveLength(12)
    expect(base.monthly_net).toHaveLength(12)
  })

  it('runway_months is null when business is profitable', () => {
    const { base } = buildThreeScenarios({ baseMonthlyRevenue, baseMonthlyExpenses, taxRate, initialCash: 1_000_000 })
    expect(base.runway_months).toBeNull()
  })

  it('runway_months is set when cash goes negative', () => {
    const expenses = Array(12).fill(130_000)  // losses every month
    const { base } = buildThreeScenarios({ baseMonthlyRevenue, baseMonthlyExpenses: expenses, taxRate, initialCash: 50_000 })
    expect(base.runway_months).not.toBeNull()
  })

  it('scenario names are correct strings', () => {
    const { base, optimistic, pessimistic } = buildThreeScenarios({ baseMonthlyRevenue, baseMonthlyExpenses, taxRate })
    expect(base.name).toBe('base')
    expect(optimistic.name).toBe('optimistic')
    expect(pessimistic.name).toBe('pessimistic')
  })
})

// ── computeForecast — monthly_breakdown array ─────────────────────────────────

describe('computeForecast — monthly_breakdown structure', () => {
  it('base scenario has exactly 12 monthly entries', () => {
    const result = computeForecast(mkInputs())
    expect(result.base).toHaveLength(12)
  })

  it('each month object has label property as non-empty string', () => {
    const result = computeForecast(mkInputs())
    result.base.forEach(m => {
      expect(typeof m.label).toBe('string')
      expect(m.label.length).toBeGreaterThan(0)
    })
  })

  it('revenue is consistent across all months for fixed inputs', () => {
    // With fixed avgMonthlyRevenue, all 12 months have the same revenue
    const result = computeForecast(mkInputs({ avgMonthlyRevenue: 50_000 }))
    result.base.forEach(m => expect(m.revenue).toBeCloseTo(50_000, 0))
  })

  it('net is revenue minus (expenses + debtService) each month', () => {
    const inputs = mkInputs({ avgMonthlyRevenue: 100_000, avgMonthlyExpenses: 70_000, monthlyDebtService: 5_000 })
    const result = computeForecast(inputs)
    result.base.forEach(m => expect(m.net).toBeCloseTo(100_000 - 70_000 - 5_000, 0))
  })

  it('optimistic scenario has higher monthly revenue than base', () => {
    const result = computeForecast(mkInputs({ avgMonthlyRevenue: 100_000, optimisticGrowthFactor: 0.20 }))
    result.optimistic.forEach(m => expect(m.revenue).toBeCloseTo(120_000, 0))
  })

  it('pessimistic scenario has lower monthly revenue than base', () => {
    const result = computeForecast(mkInputs({ avgMonthlyRevenue: 100_000, pessimisticStressFactor: 0.10 }))
    result.pessimistic.forEach(m => expect(m.revenue).toBeCloseTo(90_000, 0))
  })
})
