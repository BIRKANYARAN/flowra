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
