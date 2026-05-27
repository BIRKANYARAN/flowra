/**
 * Fiscal Year Summary Service — pure-math tests.
 *
 * Scope: no DB — pure function coverage for:
 *   computeYearGrowth     · computeYoyLabel
 *   computeQuarterlyRevenue · computeBestMonth · computeWorstMonth
 *   computeAnnualMetrics
 *
 * Run with:  npx vitest run tests/fiscal-year-summary.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  computeYearGrowth,
  computeYoyLabel,
  computeQuarterlyRevenue,
  computeBestMonth,
  computeWorstMonth,
  computeAnnualMetrics,
  type MonthlyData,
} from '../lib/services/finance/fiscal-year-summary.service'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeMonth(
  periodKey:   string,
  revenue:     number,
  cogs        = 0,
  expenses    = 0,
  netIncome?:  number,
  cashEnd     = 0,
): MonthlyData {
  return {
    period_key:     periodKey,
    revenue_try:    revenue,
    cogs_try:       cogs,
    expenses_try:   expenses,
    net_income_try: netIncome ?? revenue - cogs - expenses,
    cash_end_try:   cashEnd,
  }
}

// 12 months of data — Jan to Dec 2025
const full12: MonthlyData[] = [
  makeMonth('2025-01',  80_000, 30_000, 20_000, undefined, 5_000),
  makeMonth('2025-02',  90_000, 35_000, 22_000, undefined, 6_000),
  makeMonth('2025-03', 100_000, 40_000, 25_000, undefined, 7_000),
  makeMonth('2025-04',  70_000, 28_000, 18_000, undefined, 4_000),
  makeMonth('2025-05',  60_000, 24_000, 15_000, undefined, 3_000),
  makeMonth('2025-06',  75_000, 30_000, 20_000, undefined, 5_500),
  makeMonth('2025-07', 110_000, 44_000, 28_000, undefined, 9_000),
  makeMonth('2025-08', 120_000, 48_000, 30_000, undefined, 10_000),
  makeMonth('2025-09', 130_000, 52_000, 33_000, undefined, 12_000),
  makeMonth('2025-10',  95_000, 38_000, 24_000, undefined, 7_500),
  makeMonth('2025-11', 105_000, 42_000, 26_000, undefined, 8_000),
  makeMonth('2025-12', 115_000, 46_000, 29_000, undefined, 11_000),
]
// best = 2025-09 at 130_000 revenue; worst = 2025-05 at 60_000

// ── computeYearGrowth ─────────────────────────────────────────────────────────

describe('computeYearGrowth', () => {
  it('returns positive growth when current > prior', () => {
    const g = computeYearGrowth(110, 100)
    expect(g).toBeCloseTo(10)
  })

  it('returns negative growth when current < prior', () => {
    const g = computeYearGrowth(90, 100)
    expect(g).toBeCloseTo(-10)
  })

  it('returns 0 when current === prior', () => {
    const g = computeYearGrowth(100, 100)
    expect(g).toBeCloseTo(0)
  })

  it('returns null when prior is 0 (division-by-zero guard)', () => {
    expect(computeYearGrowth(100, 0)).toBeNull()
    expect(computeYearGrowth(0, 0)).toBeNull()
  })

  it('uses absolute prior in denominator for negative prior', () => {
    // prior = -100, current = -50  → growth = (-50 - -100) / 100 = +50%
    const g = computeYearGrowth(-50, -100)
    expect(g).toBeCloseTo(50)
  })

  it('handles large numbers without precision loss', () => {
    const g = computeYearGrowth(2_000_000, 1_000_000)
    expect(g).toBeCloseTo(100)
  })
})

// ── computeYoyLabel ───────────────────────────────────────────────────────────

describe('computeYoyLabel', () => {
  it('returns "—" for null growth', () => {
    expect(computeYoyLabel(null)).toBe('—')
  })

  it('formats positive growth with ▲ and + prefix', () => {
    expect(computeYoyLabel(12.3)).toBe('▲ +12.3%')
  })

  it('formats negative growth with ▼ and negative sign', () => {
    expect(computeYoyLabel(-5.1)).toBe('▼ -5.1%')
  })

  it('formats zero growth as ▲ +0.0%', () => {
    expect(computeYoyLabel(0)).toBe('▲ +0.0%')
  })

  it('rounds to one decimal place', () => {
    expect(computeYoyLabel(12.345)).toBe('▲ +12.3%')
    expect(computeYoyLabel(-5.678)).toBe('▼ -5.7%')
  })
})

// ── computeQuarterlyRevenue ───────────────────────────────────────────────────

describe('computeQuarterlyRevenue', () => {
  it('groups 12 months into exactly 4 quarters', () => {
    const result = computeQuarterlyRevenue(full12)
    expect(result).toHaveLength(4)
    expect(result.map(q => q.quarter)).toEqual(['Q1', 'Q2', 'Q3', 'Q4'])
  })

  it('sums revenue correctly for Q1 (Jan-Mar)', () => {
    const result = computeQuarterlyRevenue(full12)
    const q1 = result.find(q => q.quarter === 'Q1')!
    expect(q1.revenue_try).toBe(80_000 + 90_000 + 100_000)
  })

  it('sums revenue correctly for Q3 (Jul-Sep)', () => {
    const result = computeQuarterlyRevenue(full12)
    const q3 = result.find(q => q.quarter === 'Q3')!
    expect(q3.revenue_try).toBe(110_000 + 120_000 + 130_000)
  })

  it('sums net_income correctly for Q4 (Oct-Dec)', () => {
    const result = computeQuarterlyRevenue(full12)
    const q4 = result.find(q => q.quarter === 'Q4')!
    const expected = (95_000 - 38_000 - 24_000) + (105_000 - 42_000 - 26_000) + (115_000 - 46_000 - 29_000)
    expect(q4.net_income_try).toBe(expected)
  })

  it('computes margin_pct as net/revenue × 100 for quarters with revenue', () => {
    const result = computeQuarterlyRevenue(full12)
    for (const q of result) {
      if (q.revenue_try > 0) {
        expect(q.margin_pct).toBeCloseTo((q.net_income_try / q.revenue_try) * 100)
      }
    }
  })

  it('returns margin_pct = 0 for quarter with zero revenue', () => {
    const emptyQ = [makeMonth('2025-01', 0, 0, 0, 0)]
    const result = computeQuarterlyRevenue(emptyQ)
    expect(result[0].margin_pct).toBe(0)
  })

  it('returns all-zero quarters for empty input', () => {
    const result = computeQuarterlyRevenue([])
    expect(result).toHaveLength(4)
    result.forEach(q => {
      expect(q.revenue_try).toBe(0)
      expect(q.net_income_try).toBe(0)
    })
  })

  it('total quarterly revenue equals sum of all monthly revenues', () => {
    const result = computeQuarterlyRevenue(full12)
    const qTotal  = result.reduce((s, q) => s + q.revenue_try, 0)
    const mTotal  = full12.reduce((s, m) => s + m.revenue_try, 0)
    expect(qTotal).toBe(mTotal)
  })
})

// ── computeBestMonth / computeWorstMonth ──────────────────────────────────────

describe('computeBestMonth', () => {
  it('returns null for empty array', () => {
    expect(computeBestMonth([])).toBeNull()
  })

  it('identifies the month with highest revenue', () => {
    const result = computeBestMonth(full12)
    expect(result).not.toBeNull()
    expect(result!.month).toBe('2025-09')
    expect(result!.value).toBe(130_000)
  })

  it('returns single-month array correctly', () => {
    const single = [makeMonth('2025-06', 50_000)]
    const result = computeBestMonth(single)
    expect(result!.month).toBe('2025-06')
    expect(result!.value).toBe(50_000)
  })
})

describe('computeWorstMonth', () => {
  it('returns null for empty array', () => {
    expect(computeWorstMonth([])).toBeNull()
  })

  it('identifies the month with lowest revenue', () => {
    const result = computeWorstMonth(full12)
    expect(result).not.toBeNull()
    expect(result!.month).toBe('2025-05')
    expect(result!.value).toBe(60_000)
  })

  it('returns single-month array correctly', () => {
    const single = [makeMonth('2025-03', 25_000)]
    const result = computeWorstMonth(single)
    expect(result!.month).toBe('2025-03')
    expect(result!.value).toBe(25_000)
  })
})

// ── computeAnnualMetrics ──────────────────────────────────────────────────────

describe('computeAnnualMetrics', () => {
  it('returns all-zero metrics for empty array', () => {
    const result = computeAnnualMetrics([])
    expect(result.revenue_try).toBe(0)
    expect(result.gross_margin_pct).toBe(0)
    expect(result.net_margin_pct).toBe(0)
    expect(result.cash_end_try).toBe(0)
  })

  it('sums revenue across all months', () => {
    const result = computeAnnualMetrics(full12)
    const expected = full12.reduce((s, m) => s + m.revenue_try, 0)
    expect(result.revenue_try).toBe(expected)
  })

  it('sums cogs across all months', () => {
    const result = computeAnnualMetrics(full12)
    const expected = full12.reduce((s, m) => s + m.cogs_try, 0)
    expect(result.cogs_try).toBe(expected)
  })

  it('sums expenses across all months', () => {
    const result = computeAnnualMetrics(full12)
    const expected = full12.reduce((s, m) => s + m.expenses_try, 0)
    expect(result.expenses_try).toBe(expected)
  })

  it('sums net_income across all months', () => {
    const result = computeAnnualMetrics(full12)
    const expected = full12.reduce((s, m) => s + m.net_income_try, 0)
    expect(result.net_income_try).toBe(expected)
  })

  it('computes gross_profit = revenue - cogs', () => {
    const result = computeAnnualMetrics(full12)
    expect(result.gross_profit_try).toBeCloseTo(result.revenue_try - result.cogs_try)
  })

  it('computes gross_margin_pct = gross_profit / revenue × 100', () => {
    const result = computeAnnualMetrics(full12)
    const expected = (result.gross_profit_try / result.revenue_try) * 100
    expect(result.gross_margin_pct).toBeCloseTo(expected)
  })

  it('computes ebitda = gross_profit - expenses', () => {
    const result = computeAnnualMetrics(full12)
    expect(result.ebitda_try).toBeCloseTo(result.gross_profit_try - result.expenses_try)
  })

  it('computes net_margin_pct = net_income / revenue × 100', () => {
    const result = computeAnnualMetrics(full12)
    const expected = (result.net_income_try / result.revenue_try) * 100
    expect(result.net_margin_pct).toBeCloseTo(expected)
  })

  it('returns gross_margin_pct = 0 when revenue is 0', () => {
    const zeroRevenue = [makeMonth('2025-01', 0, 0, 100, -100, 0)]
    const result = computeAnnualMetrics(zeroRevenue)
    expect(result.gross_margin_pct).toBe(0)
    expect(result.net_margin_pct).toBe(0)
  })

  it('cash_end = last period cash_end_try', () => {
    const result = computeAnnualMetrics(full12)
    // last period is 2025-12 with cash_end = 11_000
    expect(result.cash_end_try).toBe(11_000)
  })

  it('handles single-period input', () => {
    const single = [makeMonth('2025-06', 100_000, 40_000, 25_000, 35_000, 8_000)]
    const result = computeAnnualMetrics(single)
    expect(result.revenue_try).toBe(100_000)
    expect(result.gross_profit_try).toBe(60_000)
    expect(result.gross_margin_pct).toBeCloseTo(60)
    expect(result.net_income_try).toBe(35_000)
    expect(result.net_margin_pct).toBeCloseTo(35)
    expect(result.cash_end_try).toBe(8_000)
  })
})
