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

  it('returns -100% when current is 0 and prior is positive', () => {
    const g = computeYearGrowth(0, 500)
    expect(g).toBeCloseTo(-100)
  })

  it('returns +200% growth when current is 3x prior', () => {
    const g = computeYearGrowth(300, 100)
    expect(g).toBeCloseTo(200)
  })

  it('returns exact -50% when halved', () => {
    const g = computeYearGrowth(500_000, 1_000_000)
    expect(g).toBeCloseTo(-50)
  })

  it('symmetry: growth from 100→200 is not inverse of 200→100', () => {
    const up   = computeYearGrowth(200, 100)!   // +100%
    const down = computeYearGrowth(100, 200)!   // -50%
    expect(up).toBeCloseTo(100)
    expect(down).toBeCloseTo(-50)
    expect(up).not.toBeCloseTo(down)
  })

  it('small fractional values', () => {
    const g = computeYearGrowth(1.05, 1.00)
    expect(g).toBeCloseTo(5)
  })

  it('very large prior with tiny current → returns a valid number', () => {
    const g = computeYearGrowth(1, 1_000_000)
    expect(g).not.toBeNull()
    expect(g).toBeCloseTo(-99.9999, 3)
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

  it('handles very large positive growth', () => {
    const label = computeYoyLabel(1000)
    expect(label).toContain('▲')
    expect(label).toContain('+')
    expect(label).toContain('1000')
  })

  it('handles very large negative growth', () => {
    const label = computeYoyLabel(-99.9)
    expect(label).toContain('▼')
    expect(label).toContain('-')
  })

  it('formats small positive fraction correctly', () => {
    expect(computeYoyLabel(0.1)).toBe('▲ +0.1%')
  })

  it('formats small negative fraction correctly', () => {
    expect(computeYoyLabel(-0.1)).toBe('▼ -0.1%')
  })

  it('does not return "—" for 0 (zero is valid growth)', () => {
    expect(computeYoyLabel(0)).not.toBe('—')
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

  it('Q2 correctly includes April (month 04)', () => {
    const aprilOnly = [makeMonth('2025-04', 50_000)]
    const result = computeQuarterlyRevenue(aprilOnly)
    const q2 = result.find(q => q.quarter === 'Q2')!
    expect(q2.revenue_try).toBe(50_000)
  })

  it('Q2 correctly includes June (month 06)', () => {
    const juneOnly = [makeMonth('2025-06', 75_000)]
    const result = computeQuarterlyRevenue(juneOnly)
    const q2 = result.find(q => q.quarter === 'Q2')!
    expect(q2.revenue_try).toBe(75_000)
  })

  it('Q3 correctly includes July (month 07)', () => {
    const julyOnly = [makeMonth('2025-07', 90_000)]
    const result = computeQuarterlyRevenue(julyOnly)
    const q3 = result.find(q => q.quarter === 'Q3')!
    expect(q3.revenue_try).toBe(90_000)
  })

  it('Q4 correctly includes December (month 12)', () => {
    const decOnly = [makeMonth('2025-12', 120_000)]
    const result = computeQuarterlyRevenue(decOnly)
    const q4 = result.find(q => q.quarter === 'Q4')!
    expect(q4.revenue_try).toBe(120_000)
  })

  it('non-adjacent months in same quarter aggregate correctly', () => {
    const q1Months = [
      makeMonth('2025-01', 10_000),
      makeMonth('2025-03', 20_000),
      // Feb missing
    ]
    const result = computeQuarterlyRevenue(q1Months)
    const q1 = result.find(q => q.quarter === 'Q1')!
    expect(q1.revenue_try).toBe(30_000)
  })

  it('negative net_income is included in quarterly aggregation', () => {
    const months = [
      makeMonth('2025-07', 50_000, 0, 0, -10_000),
      makeMonth('2025-08', 60_000, 0, 0,  20_000),
    ]
    const result = computeQuarterlyRevenue(months)
    const q3 = result.find(q => q.quarter === 'Q3')!
    expect(q3.net_income_try).toBe(10_000)
  })

  it('Q1 margin_pct is negative when Q1 net is negative', () => {
    const months = [makeMonth('2025-01', 100_000, 0, 0, -20_000)]
    const result = computeQuarterlyRevenue(months)
    const q1 = result.find(q => q.quarter === 'Q1')!
    expect(q1.margin_pct).toBeCloseTo(-20)
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

  it('returns the first month when all revenues are equal', () => {
    const equal = [
      makeMonth('2025-01', 100_000),
      makeMonth('2025-02', 100_000),
      makeMonth('2025-03', 100_000),
    ]
    const result = computeBestMonth(equal)
    expect(result).not.toBeNull()
    expect(result!.value).toBe(100_000)
  })

  it('returns correct best when first month is best', () => {
    const months = [
      makeMonth('2025-01', 200_000),
      makeMonth('2025-02',  50_000),
    ]
    const result = computeBestMonth(months)
    expect(result!.month).toBe('2025-01')
    expect(result!.value).toBe(200_000)
  })

  it('returns correct best when last month is best', () => {
    const months = [
      makeMonth('2025-01',  50_000),
      makeMonth('2025-12', 200_000),
    ]
    const result = computeBestMonth(months)
    expect(result!.month).toBe('2025-12')
    expect(result!.value).toBe(200_000)
  })

  it('handles zero revenue months — does not confuse with best', () => {
    const months = [
      makeMonth('2025-01',       0),
      makeMonth('2025-02', 100_000),
    ]
    const result = computeBestMonth(months)
    expect(result!.month).toBe('2025-02')
  })

  it('returns the value field (not the month object itself)', () => {
    const result = computeBestMonth(full12)
    expect(typeof result!.month).toBe('string')
    expect(typeof result!.value).toBe('number')
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

  it('returns the first month when all revenues are equal', () => {
    const equal = [
      makeMonth('2025-04', 50_000),
      makeMonth('2025-05', 50_000),
    ]
    const result = computeWorstMonth(equal)
    expect(result).not.toBeNull()
    expect(result!.value).toBe(50_000)
  })

  it('returns correct worst when first month is worst', () => {
    const months = [
      makeMonth('2025-01',  10_000),
      makeMonth('2025-02', 200_000),
    ]
    const result = computeWorstMonth(months)
    expect(result!.month).toBe('2025-01')
    expect(result!.value).toBe(10_000)
  })

  it('handles zero revenue → zero is worst', () => {
    const months = [
      makeMonth('2025-01',       0),
      makeMonth('2025-02', 100_000),
    ]
    const result = computeWorstMonth(months)
    expect(result!.month).toBe('2025-01')
    expect(result!.value).toBe(0)
  })

  it('best and worst are different months in full12', () => {
    const best  = computeBestMonth(full12)
    const worst = computeWorstMonth(full12)
    expect(best!.month).not.toBe(worst!.month)
    expect(best!.value).toBeGreaterThan(worst!.value)
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

  it('gross_margin_pct is in range [0,100] for normal inputs', () => {
    const result = computeAnnualMetrics(full12)
    expect(result.gross_margin_pct).toBeGreaterThanOrEqual(0)
    expect(result.gross_margin_pct).toBeLessThanOrEqual(100)
  })

  it('ebitda can be negative when expenses > gross_profit', () => {
    const highExpenses = [makeMonth('2025-01', 100_000, 60_000, 80_000, undefined, 0)]
    const result = computeAnnualMetrics(highExpenses)
    // gross_profit = 40_000; expenses = 80_000; ebitda = -40_000
    expect(result.ebitda_try).toBeCloseTo(-40_000)
  })

  it('net_margin_pct is negative when net_income is negative', () => {
    const lossy = [makeMonth('2025-01', 100_000, 0, 0, -30_000, 5_000)]
    const result = computeAnnualMetrics(lossy)
    expect(result.net_margin_pct).toBeCloseTo(-30)
  })

  it('2-period aggregate: cash_end is from the second period', () => {
    const months = [
      makeMonth('2025-01', 100_000, 0, 0, undefined, 5_000),
      makeMonth('2025-02', 120_000, 0, 0, undefined, 8_000),
    ]
    const result = computeAnnualMetrics(months)
    expect(result.cash_end_try).toBe(8_000)
  })

  it('cogs_try is zero when all months have zero cogs', () => {
    const noCogs = full12.map(m => ({ ...m, cogs_try: 0 }))
    const result = computeAnnualMetrics(noCogs)
    expect(result.cogs_try).toBe(0)
  })

  it('gross_profit equals revenue when cogs is zero', () => {
    const noCogs = full12.map(m => ({ ...m, cogs_try: 0 }))
    const result = computeAnnualMetrics(noCogs)
    expect(result.gross_profit_try).toBe(result.revenue_try)
  })

  it('annual revenue is sum of quarterly revenues', () => {
    const annual    = computeAnnualMetrics(full12)
    const quarterly = computeQuarterlyRevenue(full12)
    const qTotal    = quarterly.reduce((s, q) => s + q.revenue_try, 0)
    expect(annual.revenue_try).toBe(qTotal)
  })
})

// ── Integration: growth + label pipeline ──────────────────────────────────────

describe('computeYearGrowth + computeYoyLabel pipeline', () => {
  it('full pipeline: current > prior → positive label with arrow', () => {
    const annual2025 = computeAnnualMetrics(full12)
    const prior2024  = 900_000
    const growth     = computeYearGrowth(annual2025.revenue_try, prior2024)
    const label      = computeYoyLabel(growth)
    expect(label).toContain('▲')
    expect(label).toContain('+')
  })

  it('full pipeline: prior = 0 → label is "—"', () => {
    const growth = computeYearGrowth(500_000, 0)
    const label  = computeYoyLabel(growth)
    expect(label).toBe('—')
  })

  it('full pipeline: decline → ▼ label', () => {
    const growth = computeYearGrowth(800_000, 1_000_000)
    const label  = computeYoyLabel(growth)
    expect(label).toContain('▼')
  })
})
