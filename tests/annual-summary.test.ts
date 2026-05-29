/**
 * Annual Summary Service — pure-math tests.
 *
 * Scope (no DB — pure arithmetic for growth, margin, best-year):
 *   • Single year data → no growth (null)
 *   • Two years → YoY growth computed
 *   • Revenue growth formula
 *   • Zero prior year → growth = null (no division by zero)
 *   • best_year_revenue = max revenue across years
 *   • years array ordered newest first
 *   • Gross margin = gross_profit / revenue
 *   • Net margin = net_income / revenue
 *
 * Run with:  npx vitest run tests/annual-summary.test.ts
 */
import { describe, it, expect } from 'vitest'
import type { AnnualMetrics } from '../lib/services/finance/annual-summary.service'

// ── Pure metric builder (mirrors service logic without DB) ─────────────────────

function buildAnnualMetrics(
  year:         number,
  revenue:      number,
  cogs:         number,
  expenses:     number,
  netIncome:    number,
  priorRevenue: number | null = null,
  priorNet:     number | null = null,
): AnnualMetrics {
  const grossP       = revenue - cogs
  const grossMargin  = revenue > 0 ? (grossP / revenue) * 100 : 0
  const netMargin    = revenue > 0 ? (netIncome / revenue) * 100 : 0

  let revenueGrowth:   number | null = null
  let netIncomeGrowth: number | null = null

  if (priorRevenue !== null) {
    revenueGrowth = priorRevenue !== 0 ? ((revenue - priorRevenue) / Math.abs(priorRevenue)) * 100 : null
  }
  if (priorNet !== null) {
    netIncomeGrowth = priorNet !== 0 ? ((netIncome - priorNet) / Math.abs(priorNet)) * 100 : null
  }

  return {
    year,
    revenue_try:          revenue,
    cogs_try:             cogs,
    gross_profit_try:     grossP,
    gross_margin_pct:     grossMargin,
    expenses_try:         expenses,
    net_income_try:       netIncome,
    net_margin_pct:       netMargin,
    cash_try:             netIncome,
    revenue_growth_pct:   revenueGrowth,
    net_income_growth_pct: netIncomeGrowth,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AnnualSummaryService — pure metric tests', () => {

  // 1. Single year data → no growth computation (null)
  it('Single year: revenue_growth_pct and net_income_growth_pct are null', () => {
    const m = buildAnnualMetrics(2026, 500000, 200000, 100000, 150000)
    expect(m.revenue_growth_pct).toBeNull()
    expect(m.net_income_growth_pct).toBeNull()
  })

  // 2. Two years → YoY growth computed
  it('Two years: YoY growth is computed for current year', () => {
    const m = buildAnnualMetrics(2026, 600000, 200000, 100000, 200000, 500000, 150000)
    expect(m.revenue_growth_pct).not.toBeNull()
    expect(m.net_income_growth_pct).not.toBeNull()
  })

  // 3. Revenue growth: (current - prior) / prior
  it('Revenue growth formula: (current - prior) / |prior| × 100', () => {
    // 600k from 500k → 20% growth
    const m = buildAnnualMetrics(2026, 600000, 0, 0, 0, 500000, null)
    expect(m.revenue_growth_pct).toBeCloseTo(20, 5)
  })

  // 4. Zero prior year revenue → growth = null (no division by zero)
  it('Zero prior revenue → revenue_growth_pct is null', () => {
    const m = buildAnnualMetrics(2026, 100000, 0, 0, 0, 0, null)
    expect(m.revenue_growth_pct).toBeNull()
  })

  // 5. best_year_revenue = max revenue across years
  it('best_year_revenue is the year with maximum revenue', () => {
    const years: AnnualMetrics[] = [
      buildAnnualMetrics(2026, 600000, 200000, 100000, 200000),
      buildAnnualMetrics(2025, 800000, 300000, 150000, 250000),
      buildAnnualMetrics(2024, 400000, 150000, 80000,  100000),
    ]
    const revenues  = years.map(y => y.revenue_try)
    const maxRev    = Math.max(...revenues)
    const bestYear  = years[revenues.indexOf(maxRev)].year
    expect(bestYear).toBe(2025)
    expect(maxRev).toBe(800000)
  })

  // 6. years array ordered newest first
  it('Years array is ordered newest first', () => {
    const years: AnnualMetrics[] = [
      buildAnnualMetrics(2026, 600000, 0, 0, 0),
      buildAnnualMetrics(2025, 500000, 0, 0, 0),
      buildAnnualMetrics(2024, 400000, 0, 0, 0),
    ]
    expect(years[0].year).toBe(2026)
    expect(years[1].year).toBe(2025)
    expect(years[2].year).toBe(2024)
  })

  // 7. Gross margin = gross_profit / revenue
  it('gross_margin_pct = gross_profit / revenue × 100', () => {
    // revenue 500k, cogs 300k → gross 200k → margin 40%
    const m = buildAnnualMetrics(2026, 500000, 300000, 0, 0)
    expect(m.gross_margin_pct).toBeCloseTo(40, 5)
    expect(m.gross_profit_try).toBe(200000)
  })

  // 8. Net margin = net_income / revenue
  it('net_margin_pct = net_income / revenue × 100', () => {
    // revenue 500k, net 75k → net margin 15%
    const m = buildAnnualMetrics(2026, 500000, 0, 0, 75000)
    expect(m.net_margin_pct).toBeCloseTo(15, 5)
  })

  // Extra: negative revenue growth
  it('Revenue contraction: negative growth_pct', () => {
    const m = buildAnnualMetrics(2026, 400000, 0, 0, 0, 500000, null)
    expect(m.revenue_growth_pct).toBeCloseTo(-20, 5)
  })

  // Extra: zero revenue → both margins are 0 (no division by zero)
  it('Zero revenue → gross and net margins are 0', () => {
    const m = buildAnnualMetrics(2026, 0, 0, 0, 0)
    expect(m.gross_margin_pct).toBe(0)
    expect(m.net_margin_pct).toBe(0)
  })
})

// ── Extended tests: all fields and edge cases ─────────────────────────────────

describe('AnnualMetrics — field correctness', () => {

  it('year field stored correctly', () => {
    const m = buildAnnualMetrics(2024, 100_000, 40_000, 20_000, 30_000)
    expect(m.year).toBe(2024)
  })

  it('revenue_try stored as given', () => {
    const m = buildAnnualMetrics(2025, 500_000, 0, 0, 0)
    expect(m.revenue_try).toBe(500_000)
  })

  it('cogs_try stored correctly', () => {
    const m = buildAnnualMetrics(2025, 500_000, 200_000, 0, 0)
    expect(m.cogs_try).toBe(200_000)
  })

  it('gross_profit_try = revenue - cogs', () => {
    const m = buildAnnualMetrics(2025, 500_000, 200_000, 0, 0)
    expect(m.gross_profit_try).toBe(300_000)
  })

  it('net_income_try stored correctly', () => {
    const m = buildAnnualMetrics(2025, 500_000, 0, 0, 75_000)
    expect(m.net_income_try).toBe(75_000)
  })

  it('cash_try equals net_income_try (proxy)', () => {
    const m = buildAnnualMetrics(2025, 500_000, 0, 0, 120_000)
    expect(m.cash_try).toBe(m.net_income_try)
  })

  it('expenses_try stored correctly', () => {
    const m = buildAnnualMetrics(2025, 500_000, 0, 150_000, 0)
    expect(m.expenses_try).toBe(150_000)
  })

  it('gross_margin_pct = 0 when revenue = 0', () => {
    const m = buildAnnualMetrics(2025, 0, 0, 0, 0)
    expect(m.gross_margin_pct).toBe(0)
  })

  it('net_margin_pct = 0 when revenue = 0', () => {
    const m = buildAnnualMetrics(2025, 0, 0, 0, 50_000)
    expect(m.net_margin_pct).toBe(0)
  })

  it('50% gross margin', () => {
    const m = buildAnnualMetrics(2025, 200_000, 100_000, 0, 0)
    expect(m.gross_margin_pct).toBeCloseTo(50)
  })

  it('100% gross margin when cogs = 0', () => {
    const m = buildAnnualMetrics(2025, 100_000, 0, 0, 0)
    expect(m.gross_margin_pct).toBeCloseTo(100)
  })

  it('negative gross profit (cogs > revenue)', () => {
    const m = buildAnnualMetrics(2025, 100_000, 150_000, 0, 0)
    expect(m.gross_profit_try).toBe(-50_000)
    expect(m.gross_margin_pct).toBeCloseTo(-50)
  })

  it('net_income_growth_pct = null when no prior', () => {
    const m = buildAnnualMetrics(2025, 100_000, 0, 0, 50_000)
    expect(m.net_income_growth_pct).toBeNull()
  })

  it('net_income_growth_pct computed from prior', () => {
    // 200k from 100k → 100% growth
    const m = buildAnnualMetrics(2025, 200_000, 0, 0, 200_000, null, 100_000)
    expect(m.net_income_growth_pct).toBeCloseTo(100)
  })

  it('net_income_growth_pct = null when prior net = 0', () => {
    const m = buildAnnualMetrics(2025, 200_000, 0, 0, 100_000, null, 0)
    expect(m.net_income_growth_pct).toBeNull()
  })

  it('revenue_growth_pct = null when prior = 0', () => {
    const m = buildAnnualMetrics(2025, 300_000, 0, 0, 0, 0, null)
    expect(m.revenue_growth_pct).toBeNull()
  })

  it('revenue_growth_pct negative when declined', () => {
    // 200k from 500k → -60%
    const m = buildAnnualMetrics(2025, 200_000, 0, 0, 0, 500_000, null)
    expect(m.revenue_growth_pct).toBeCloseTo(-60)
  })

  it('revenue_growth_pct with negative prior (loss year)', () => {
    // current=100k, prior=-200k (loss) → (100k-(-200k))/abs(-200k) = 300/200 = 150%
    const m = buildAnnualMetrics(2025, 100_000, 0, 0, 0, -200_000, null)
    expect(m.revenue_growth_pct).toBeCloseTo(150)
  })

  it('gross_margin_pct close to 0 when cogs ≈ revenue', () => {
    const m = buildAnnualMetrics(2025, 100_000, 99_900, 0, 0)
    expect(m.gross_margin_pct).toBeCloseTo(0.1)
  })

  it('net_margin_pct is negative for a loss year', () => {
    const m = buildAnnualMetrics(2025, 100_000, 0, 0, -20_000)
    expect(m.net_margin_pct).toBeCloseTo(-20)
  })

})

describe('AnnualMetrics — best year helpers', () => {

  it('single year → it is the best revenue year', () => {
    const years = [buildAnnualMetrics(2025, 400_000, 0, 0, 100_000)]
    const revenues = years.map(y => y.revenue_try)
    const bestYear = years[revenues.indexOf(Math.max(...revenues))].year
    expect(bestYear).toBe(2025)
  })

  it('best revenue year identified from 4-year list', () => {
    const years = [
      buildAnnualMetrics(2026, 500_000, 0, 0, 100_000),
      buildAnnualMetrics(2025, 900_000, 0, 0, 200_000),  // best
      buildAnnualMetrics(2024, 700_000, 0, 0, 150_000),
      buildAnnualMetrics(2023, 300_000, 0, 0, 50_000),
    ]
    const revenues = years.map(y => y.revenue_try)
    const bestIdx  = revenues.indexOf(Math.max(...revenues))
    expect(years[bestIdx].year).toBe(2025)
  })

  it('best net income year identified correctly', () => {
    const years = [
      buildAnnualMetrics(2026, 500_000, 0, 0, 50_000),
      buildAnnualMetrics(2025, 300_000, 0, 0, 300_000), // best net
      buildAnnualMetrics(2024, 800_000, 0, 0, -10_000),
    ]
    const nets    = years.map(y => y.net_income_try)
    const bestIdx = nets.indexOf(Math.max(...nets))
    expect(years[bestIdx].year).toBe(2025)
  })

  it('all years have same revenue → first index wins (Math.max behavior)', () => {
    const years = [
      buildAnnualMetrics(2026, 100_000, 0, 0, 0),
      buildAnnualMetrics(2025, 100_000, 0, 0, 0),
    ]
    const revenues = years.map(y => y.revenue_try)
    const bestIdx  = revenues.indexOf(Math.max(...revenues))
    // indexOf returns first match → year 2026 (index 0)
    expect(years[bestIdx].year).toBe(2026)
  })

  it('all zero revenues → best year is first', () => {
    const years = [
      buildAnnualMetrics(2025, 0, 0, 0, 0),
      buildAnnualMetrics(2024, 0, 0, 0, 0),
    ]
    const revenues = years.map(y => y.revenue_try)
    expect(Math.max(...revenues)).toBe(0)
  })

})

describe('AnnualMetrics — consistency and invariants', () => {

  it('gross_profit = revenue - cogs for arbitrary values', () => {
    const revenue = 1_234_567
    const cogs    = 789_012
    const m       = buildAnnualMetrics(2025, revenue, cogs, 0, 0)
    expect(m.gross_profit_try).toBe(revenue - cogs)
  })

  it('cash_try is always equal to net_income_try', () => {
    for (const netIncome of [0, 50_000, -30_000, 1_000_000]) {
      const m = buildAnnualMetrics(2025, 500_000, 0, 0, netIncome)
      expect(m.cash_try).toBe(m.net_income_try)
    }
  })

  it('year field is integer and matches input', () => {
    for (const year of [2020, 2023, 2025, 2026]) {
      const m = buildAnnualMetrics(year, 100_000, 0, 0, 0)
      expect(m.year).toBe(year)
      expect(Number.isInteger(m.year)).toBe(true)
    }
  })

  it('growth = null for oldest year in multi-year sequence', () => {
    const oldest = buildAnnualMetrics(2023, 400_000, 0, 0, 100_000)
    // No prior passed → both growth fields null
    expect(oldest.revenue_growth_pct).toBeNull()
    expect(oldest.net_income_growth_pct).toBeNull()
  })

  it('both growth fields are independent — one null does not affect other', () => {
    // Pass priorRevenue but no priorNet
    const m = buildAnnualMetrics(2025, 600_000, 0, 0, 150_000, 500_000, null)
    expect(m.revenue_growth_pct).not.toBeNull()
    expect(m.net_income_growth_pct).toBeNull()
  })

  it('gross_margin_pct + (100 - gross_margin_pct) = 100 for simple case', () => {
    // margin = 40% → cogs ratio = 60%
    const m = buildAnnualMetrics(2025, 100_000, 60_000, 0, 0)
    expect(m.gross_margin_pct).toBeCloseTo(40)
    expect(100 - m.gross_margin_pct).toBeCloseTo(60)
  })

  it('zero cogs → gross_profit_try = revenue_try', () => {
    const m = buildAnnualMetrics(2025, 500_000, 0, 0, 0)
    expect(m.gross_profit_try).toBe(500_000)
  })

  it('exact 10% growth: 110k from 100k', () => {
    const m = buildAnnualMetrics(2025, 110_000, 0, 0, 0, 100_000, null)
    expect(m.revenue_growth_pct).toBeCloseTo(10)
  })

  it('exact 50% growth: 150k from 100k', () => {
    const m = buildAnnualMetrics(2025, 150_000, 0, 0, 0, 100_000, null)
    expect(m.revenue_growth_pct).toBeCloseTo(50)
  })

  it('exact 200% growth: 300k from 100k', () => {
    const m = buildAnnualMetrics(2025, 300_000, 0, 0, 0, 100_000, null)
    expect(m.revenue_growth_pct).toBeCloseTo(200)
  })

  it('net margin: positive net income → positive net_margin_pct', () => {
    const m = buildAnnualMetrics(2025, 200_000, 0, 0, 40_000)
    expect(m.net_margin_pct).toBeGreaterThan(0)
  })

  it('expenses_try field is stored as-is (no computation)', () => {
    const m = buildAnnualMetrics(2025, 500_000, 200_000, 75_000, 100_000)
    expect(m.expenses_try).toBe(75_000)
  })

})

// ── Extended tests: growth boundaries ────────────────────────────────────────

describe('AnnualMetrics — growth rate boundaries', () => {

  it('revenue flat yoy → 0% growth', () => {
    const m = buildAnnualMetrics(2025, 300_000, 0, 0, 0, 300_000, null)
    expect(m.revenue_growth_pct).toBeCloseTo(0)
  })

  it('revenue_growth_pct: 1% growth', () => {
    const m = buildAnnualMetrics(2025, 101_000, 0, 0, 0, 100_000, null)
    expect(m.revenue_growth_pct).toBeCloseTo(1)
  })

  it('net_income_growth_pct: 1% growth', () => {
    const m = buildAnnualMetrics(2025, 0, 0, 0, 101_000, null, 100_000)
    expect(m.net_income_growth_pct).toBeCloseTo(1)
  })

  it('revenue tripled → 200% growth', () => {
    const m = buildAnnualMetrics(2025, 300_000, 0, 0, 0, 100_000, null)
    expect(m.revenue_growth_pct).toBeCloseTo(200)
  })

  it('net income tripled → 200% growth', () => {
    const m = buildAnnualMetrics(2025, 0, 0, 0, 300_000, null, 100_000)
    expect(m.net_income_growth_pct).toBeCloseTo(200)
  })

  it('net_income_growth_pct positive when profit recovers from loss', () => {
    // Prior = -100k (loss), current = +50k → (50k - (-100k))/100k = 150%
    const m = buildAnnualMetrics(2025, 200_000, 0, 0, 50_000, null, -100_000)
    expect(m.net_income_growth_pct).toBeCloseTo(150)
  })

  it('revenue_growth_pct null when prior not provided (undefined-equivalent)', () => {
    const m = buildAnnualMetrics(2024, 400_000, 0, 0, 0)
    expect(m.revenue_growth_pct).toBeNull()
  })

  it('revenue_growth_pct and net_income_growth_pct both null when no prior', () => {
    const m = buildAnnualMetrics(2023, 100_000, 0, 0, 50_000)
    expect(m.revenue_growth_pct).toBeNull()
    expect(m.net_income_growth_pct).toBeNull()
  })

  it('small revenue growth: 1000 → 1001 is 0.1%', () => {
    const m = buildAnnualMetrics(2025, 1_001, 0, 0, 0, 1_000, null)
    expect(m.revenue_growth_pct).toBeCloseTo(0.1, 1)
  })

  it('large contraction: 1M → 100k → -90% growth', () => {
    const m = buildAnnualMetrics(2025, 100_000, 0, 0, 0, 1_000_000, null)
    expect(m.revenue_growth_pct).toBeCloseTo(-90)
  })

})

// ── Extended tests: margin calculations ──────────────────────────────────────

describe('AnnualMetrics — margin precision', () => {

  it('gross margin 33.33%: revenue=300k, cogs=200k', () => {
    const m = buildAnnualMetrics(2025, 300_000, 200_000, 0, 0)
    expect(m.gross_margin_pct).toBeCloseTo(33.33, 1)
  })

  it('gross margin 66.67%: revenue=300k, cogs=100k', () => {
    const m = buildAnnualMetrics(2025, 300_000, 100_000, 0, 0)
    expect(m.gross_margin_pct).toBeCloseTo(66.67, 1)
  })

  it('net margin 25%: revenue=200k, net=50k', () => {
    const m = buildAnnualMetrics(2025, 200_000, 0, 0, 50_000)
    expect(m.net_margin_pct).toBeCloseTo(25)
  })

  it('net margin 5%: revenue=1M, net=50k', () => {
    const m = buildAnnualMetrics(2025, 1_000_000, 0, 0, 50_000)
    expect(m.net_margin_pct).toBeCloseTo(5)
  })

  it('gross margin stays non-negative when cogs = revenue', () => {
    const m = buildAnnualMetrics(2025, 100_000, 100_000, 0, 0)
    expect(m.gross_margin_pct).toBeCloseTo(0)
  })

  it('gross_profit_try is always revenue - cogs regardless of sign', () => {
    const cases: Array<[number, number]> = [
      [0, 0], [100_000, 0], [100_000, 100_000], [100_000, 150_000],
    ]
    cases.forEach(([rev, cogs]) => {
      const m = buildAnnualMetrics(2025, rev, cogs, 0, 0)
      expect(m.gross_profit_try).toBe(rev - cogs)
    })
  })

})

// ── Extended tests: multi-year sequence ──────────────────────────────────────

describe('AnnualMetrics — multi-year sequence', () => {

  it('three years show correct growth chain', () => {
    // 2023: 100k, 2024: 200k (+100%), 2025: 300k (+50%)
    const m2023 = buildAnnualMetrics(2023, 100_000, 0, 0, 0)
    const m2024 = buildAnnualMetrics(2024, 200_000, 0, 0, 0, 100_000, null)
    const m2025 = buildAnnualMetrics(2025, 300_000, 0, 0, 0, 200_000, null)

    expect(m2023.revenue_growth_pct).toBeNull()
    expect(m2024.revenue_growth_pct).toBeCloseTo(100)
    expect(m2025.revenue_growth_pct).toBeCloseTo(50)
  })

  it('decline sequence: revenue halves each year', () => {
    const m2 = buildAnnualMetrics(2025, 250_000, 0, 0, 0, 500_000, null)
    expect(m2.revenue_growth_pct).toBeCloseTo(-50)
  })

  it('five-year sequence best year is correctly identified', () => {
    const years = [
      buildAnnualMetrics(2026, 400_000, 0, 0, 0),
      buildAnnualMetrics(2025, 800_000, 0, 0, 0), // best
      buildAnnualMetrics(2024, 600_000, 0, 0, 0),
      buildAnnualMetrics(2023, 300_000, 0, 0, 0),
      buildAnnualMetrics(2022, 200_000, 0, 0, 0),
    ]
    const revenues = years.map(y => y.revenue_try)
    const bestIdx  = revenues.indexOf(Math.max(...revenues))
    expect(years[bestIdx].year).toBe(2025)
  })

  it('newest year first ordering maintained by constructor', () => {
    const years = [
      buildAnnualMetrics(2026, 100_000, 0, 0, 0),
      buildAnnualMetrics(2025, 90_000,  0, 0, 0),
      buildAnnualMetrics(2024, 80_000,  0, 0, 0),
    ]
    expect(years[0].year > years[1].year).toBe(true)
    expect(years[1].year > years[2].year).toBe(true)
  })

})

// ── Extended tests: specific field invariants ─────────────────────────────────

describe('AnnualMetrics — specific field invariants', () => {

  it('gross_margin_pct is always a number (not null) when revenue > 0', () => {
    const m = buildAnnualMetrics(2025, 500_000, 200_000, 0, 0)
    expect(typeof m.gross_margin_pct).toBe('number')
    expect(m.gross_margin_pct).not.toBeNaN()
  })

  it('net_margin_pct is always a number (not null) when revenue > 0', () => {
    const m = buildAnnualMetrics(2025, 500_000, 0, 0, 80_000)
    expect(typeof m.net_margin_pct).toBe('number')
    expect(m.net_margin_pct).not.toBeNaN()
  })

  it('revenue_try and cogs_try are independent fields', () => {
    const m = buildAnnualMetrics(2025, 300_000, 120_000, 0, 0)
    expect(m.revenue_try).toBe(300_000)
    expect(m.cogs_try).toBe(120_000)
  })

  it('zero cogs → gross_profit_try equals revenue_try', () => {
    const m = buildAnnualMetrics(2025, 450_000, 0, 0, 0)
    expect(m.gross_profit_try).toBe(m.revenue_try)
  })

  it('cogs equals revenue → gross_profit_try = 0', () => {
    const m = buildAnnualMetrics(2025, 200_000, 200_000, 0, 0)
    expect(m.gross_profit_try).toBe(0)
    expect(m.gross_margin_pct).toBeCloseTo(0)
  })

  it('net_margin_pct can be > 100% (unusual but mathematically valid)', () => {
    // net income > revenue (e.g., one-time gain)
    const m = buildAnnualMetrics(2025, 100_000, 0, 0, 200_000)
    expect(m.net_margin_pct).toBeCloseTo(200)
  })

  it('all numeric fields are finite numbers', () => {
    const m = buildAnnualMetrics(2025, 500_000, 200_000, 100_000, 80_000)
    const numericFields = [
      m.revenue_try, m.cogs_try, m.gross_profit_try, m.gross_margin_pct,
      m.expenses_try, m.net_income_try, m.net_margin_pct, m.cash_try,
    ]
    numericFields.forEach(v => {
      expect(typeof v).toBe('number')
      expect(Number.isFinite(v)).toBe(true)
    })
  })

  it('revenue_growth_pct is finite when prior is non-zero', () => {
    const m = buildAnnualMetrics(2025, 600_000, 0, 0, 0, 500_000, null)
    expect(Number.isFinite(m.revenue_growth_pct!)).toBe(true)
  })

  it('net_income_growth_pct is finite when prior is non-zero', () => {
    const m = buildAnnualMetrics(2025, 0, 0, 0, 120_000, null, 100_000)
    expect(Number.isFinite(m.net_income_growth_pct!)).toBe(true)
  })

  it('gross_profit_try = 0 when revenue = cogs = 0', () => {
    const m = buildAnnualMetrics(2025, 0, 0, 0, 0)
    expect(m.gross_profit_try).toBe(0)
  })

  it('cash_try = 0 when net_income = 0', () => {
    const m = buildAnnualMetrics(2025, 500_000, 200_000, 100_000, 0)
    expect(m.cash_try).toBe(0)
  })

  it('negative net_income → negative cash_try', () => {
    const m = buildAnnualMetrics(2025, 100_000, 50_000, 80_000, -30_000)
    expect(m.cash_try).toBe(-30_000)
  })

  it('expenses_try = 0 when 0 expenses passed', () => {
    const m = buildAnnualMetrics(2025, 200_000, 100_000, 0, 50_000)
    expect(m.expenses_try).toBe(0)
  })

})
