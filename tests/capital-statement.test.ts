/**
 * capital-statement.test.ts — Partner Capital Statement unit tests
 *
 * Tests cover:
 *   - buildCapitalStatementLine: correct closing equity calculation
 *   - buildCapitalStatementLine: formula verification (opening + contributions + profit - dividends - compensation + adjustments)
 *   - computeNetIncome: correct revenue/expense subtraction
 *   - allocateProfit: percentage allocation with rounding
 *   - computeYtdSummary: YTD totals correct
 *   - Edge cases: zero profit, negative profit (loss), zero contributions
 *
 * Run: npx vitest run tests/capital-statement.test.ts
 */

import { describe, it, expect } from 'vitest'
import {
  buildCapitalStatementLine,
  computeNetIncome,
  allocateProfit,
  computeYtdSummary,
  type CapitalStatementLine,
} from '../lib/services/pcle/capital-statement.service'

// ── buildCapitalStatementLine tests ──────────────────────────────────────────

describe('buildCapitalStatementLine', () => {
  it('returns correct closing equity with all positive inputs', () => {
    const line = buildCapitalStatementLine('2026-01', 100_000, 50_000, 20_000, 5_000, 3_000, 0)
    // closing = 100000 + 50000 + 20000 - 5000 - 3000 + 0 = 162000
    expect(line.closing_equity).toBe(162_000)
  })

  it('correctly populates all fields including period_label', () => {
    const line = buildCapitalStatementLine('2026-05', 0, 0, 0, 0, 0, 0)
    expect(line.period_key).toBe('2026-05')
    expect(line.period_label).toBe('Mayıs 2026')
  })

  it('formula: closing = opening + contributions + profit - dividends - compensation + adjustments', () => {
    const opening = 200_000
    const contributions = 30_000
    const profit = 15_000
    const dividends = 8_000
    const compensation = 4_000
    const adjustments = 1_000
    const line = buildCapitalStatementLine('2026-03', opening, contributions, profit, dividends, compensation, adjustments)
    const expected = opening + contributions + profit - dividends - compensation + adjustments
    expect(line.closing_equity).toBe(expected)
  })

  it('handles zero profit correctly', () => {
    const line = buildCapitalStatementLine('2026-06', 500_000, 0, 0, 0, 0, 0)
    expect(line.closing_equity).toBe(500_000)
    expect(line.profit_allocation).toBe(0)
  })

  it('handles negative profit (loss allocation) correctly', () => {
    const line = buildCapitalStatementLine('2026-07', 100_000, 0, -25_000, 0, 0, 0)
    // closing = 100000 + 0 + (-25000) - 0 - 0 + 0 = 75000
    expect(line.closing_equity).toBe(75_000)
    expect(line.profit_allocation).toBe(-25_000)
  })

  it('handles zero contributions correctly', () => {
    const line = buildCapitalStatementLine('2026-02', 300_000, 0, 10_000, 0, 0, 0)
    expect(line.equity_contributions).toBe(0)
    expect(line.closing_equity).toBe(310_000)
  })

  it('rounds closing equity to 2 decimal places', () => {
    const line = buildCapitalStatementLine('2026-01', 100_000.005, 0, 0.005, 0, 0, 0)
    expect(line.closing_equity).toBe(Math.round((100_000.005 + 0.005) * 100) / 100)
  })

  it('handles large equity correctly', () => {
    const line = buildCapitalStatementLine('2026-12', 10_000_000, 5_000_000, 2_500_000, 1_000_000, 500_000, 0)
    expect(line.closing_equity).toBe(16_000_000)
  })

  it('positive adjustments increase closing equity', () => {
    const line = buildCapitalStatementLine('2026-04', 100_000, 0, 0, 0, 0, 5_000)
    expect(line.closing_equity).toBe(105_000)
    expect(line.other_adjustments).toBe(5_000)
  })

  it('negative adjustments decrease closing equity', () => {
    const line = buildCapitalStatementLine('2026-04', 100_000, 0, 0, 0, 0, -2_500)
    expect(line.closing_equity).toBe(97_500)
  })

  it('opening_equity field is correctly stored', () => {
    const line = buildCapitalStatementLine('2026-08', 50_000, 10_000, 5_000, 2_000, 1_000, 0)
    expect(line.opening_equity).toBe(50_000)
  })

  it('dividends_declared field is correctly stored', () => {
    const line = buildCapitalStatementLine('2026-09', 100_000, 0, 10_000, 4_000, 0, 0)
    expect(line.dividends_declared).toBe(4_000)
    expect(line.closing_equity).toBe(106_000)
  })

  it('compensation_paid field is correctly stored', () => {
    const line = buildCapitalStatementLine('2026-10', 100_000, 0, 10_000, 0, 3_500, 0)
    expect(line.compensation_paid).toBe(3_500)
    expect(line.closing_equity).toBe(106_500)
  })

  it('period_key is stored as-is', () => {
    const line = buildCapitalStatementLine('2025-12', 0, 0, 0, 0, 0, 0)
    expect(line.period_key).toBe('2025-12')
  })

  it('period_label for December is Aralık', () => {
    const line = buildCapitalStatementLine('2025-12', 0, 0, 0, 0, 0, 0)
    expect(line.period_label).toBe('Aralık 2025')
  })

  it('period_label for January is Ocak', () => {
    const line = buildCapitalStatementLine('2025-01', 0, 0, 0, 0, 0, 0)
    expect(line.period_label).toBe('Ocak 2025')
  })

  it('all debits zero, all credits zero → closing equals opening', () => {
    const line = buildCapitalStatementLine('2026-11', 75_000, 0, 0, 0, 0, 0)
    expect(line.closing_equity).toBe(75_000)
  })

  it('zero opening equity with large contributions → closing equals contributions + profit', () => {
    const line = buildCapitalStatementLine('2026-01', 0, 500_000, 100_000, 0, 0, 0)
    expect(line.closing_equity).toBe(600_000)
  })
})

// ── computeNetIncome tests ────────────────────────────────────────────────────

describe('computeNetIncome', () => {
  it('returns revenue minus expenses', () => {
    expect(computeNetIncome(500_000, 300_000)).toBe(200_000)
  })

  it('returns negative net income when expenses exceed revenue (loss)', () => {
    expect(computeNetIncome(100_000, 150_000)).toBe(-50_000)
  })

  it('returns zero when revenue equals expenses (break-even)', () => {
    expect(computeNetIncome(250_000, 250_000)).toBe(0)
  })

  it('rounds to 2 decimal places', () => {
    expect(computeNetIncome(100_000.005, 50_000.003)).toBe(
      Math.round((100_000.005 - 50_000.003) * 100) / 100,
    )
  })

  it('handles zero revenue', () => {
    expect(computeNetIncome(0, 50_000)).toBe(-50_000)
  })

  it('handles zero expenses', () => {
    expect(computeNetIncome(100_000, 0)).toBe(100_000)
  })

  it('handles both zero', () => {
    expect(computeNetIncome(0, 0)).toBe(0)
  })

  it('handles large values', () => {
    expect(computeNetIncome(10_000_000, 7_500_000)).toBe(2_500_000)
  })

  it('result is a number (not NaN)', () => {
    const result = computeNetIncome(100_000, 60_000)
    expect(typeof result).toBe('number')
    expect(isNaN(result)).toBe(false)
  })
})

// ── allocateProfit tests ──────────────────────────────────────────────────────

describe('allocateProfit', () => {
  it('allocates 50% share correctly', () => {
    expect(allocateProfit(200_000, 50)).toBe(100_000)
  })

  it('allocates 33.33% share with rounding', () => {
    const result = allocateProfit(100_000, 33.33)
    expect(result).toBe(33_330)
  })

  it('allocates 0% share returns 0', () => {
    expect(allocateProfit(500_000, 0)).toBe(0)
  })

  it('allocates 100% share returns full net income', () => {
    expect(allocateProfit(150_000, 100)).toBe(150_000)
  })

  it('allocates negative profit (loss) proportionally', () => {
    expect(allocateProfit(-100_000, 40)).toBe(-40_000)
  })

  it('rounds result to 2 decimal places', () => {
    const result = allocateProfit(10_000, 33.33)
    expect(result).toBe(3_333)
  })

  it('25% allocation of 200_000 = 50_000', () => {
    expect(allocateProfit(200_000, 25)).toBe(50_000)
  })

  it('75% allocation of 400_000 = 300_000', () => {
    expect(allocateProfit(400_000, 75)).toBe(300_000)
  })

  it('zero net income with any share → 0', () => {
    expect(allocateProfit(0, 60)).toBe(0)
  })

  it('result is always a number (not NaN)', () => {
    const result = allocateProfit(300_000, 45)
    expect(typeof result).toBe('number')
    expect(isNaN(result)).toBe(false)
  })

  it('large net income allocation is accurate', () => {
    expect(allocateProfit(10_000_000, 30)).toBe(3_000_000)
  })

  it('share > 100 treated as mathematical percentage (no capping)', () => {
    // 200% of 50_000 = 100_000 (no guard expected — pure math)
    const result = allocateProfit(50_000, 200)
    expect(result).toBe(100_000)
  })
})

// ── computeYtdSummary tests ───────────────────────────────────────────────────

describe('computeYtdSummary', () => {
  function makeLine(
    periodKey: string,
    opening: number,
    contributions: number,
    profit: number,
    dividends: number,
    compensation: number,
  ): CapitalStatementLine {
    return buildCapitalStatementLine(periodKey, opening, contributions, profit, dividends, compensation, 0)
  }

  it('computes correct YTD totals from multiple months', () => {
    const lines = [
      makeLine('2026-01', 0, 50_000, 10_000, 5_000, 2_000),
      makeLine('2026-02', 53_000, 0, 8_000, 0, 2_000),
      makeLine('2026-03', 59_000, 20_000, 12_000, 3_000, 2_000),
    ]
    const summary = computeYtdSummary(lines)
    expect(summary.total_contributions_ytd).toBe(70_000)
    expect(summary.total_dividends_ytd).toBe(8_000)
    expect(summary.total_compensation_ytd).toBe(6_000)
  })

  it('current_equity equals closing equity of last line', () => {
    const lines = [
      makeLine('2026-01', 100_000, 0, 20_000, 5_000, 0),
      makeLine('2026-02', 115_000, 10_000, 15_000, 0, 0),
    ]
    const summary = computeYtdSummary(lines)
    expect(summary.current_equity).toBe(lines[lines.length - 1].closing_equity)
  })

  it('net_equity_change_ytd = closing - opening across all lines', () => {
    const lines = [
      makeLine('2026-01', 200_000, 50_000, 30_000, 10_000, 5_000),
      makeLine('2026-02', 265_000, 0, 20_000, 0, 5_000),
    ]
    const summary = computeYtdSummary(lines)
    expect(summary.net_equity_change_ytd).toBe(
      lines[lines.length - 1].closing_equity - lines[0].opening_equity,
    )
  })

  it('returns zeros for empty lines array', () => {
    const summary = computeYtdSummary([])
    expect(summary.total_contributions_ytd).toBe(0)
    expect(summary.total_dividends_ytd).toBe(0)
    expect(summary.total_compensation_ytd).toBe(0)
    expect(summary.net_equity_change_ytd).toBe(0)
    expect(summary.current_equity).toBe(0)
  })

  it('single month: totals reflect just that one line', () => {
    const lines = [
      makeLine('2026-06', 100_000, 20_000, 5_000, 3_000, 1_000),
    ]
    const summary = computeYtdSummary(lines)
    expect(summary.total_contributions_ytd).toBe(20_000)
    expect(summary.total_dividends_ytd).toBe(3_000)
    expect(summary.total_compensation_ytd).toBe(1_000)
    expect(summary.current_equity).toBe(lines[0].closing_equity)
  })

  it('net_equity_change_ytd is positive when equity grew', () => {
    const lines = [
      makeLine('2026-01', 0, 100_000, 50_000, 0, 0),
      makeLine('2026-02', 150_000, 50_000, 30_000, 0, 0),
    ]
    const summary = computeYtdSummary(lines)
    expect(summary.net_equity_change_ytd).toBeGreaterThan(0)
  })

  it('net_equity_change_ytd is negative when equity shrank (large dividends)', () => {
    const lines = [
      makeLine('2026-01', 1_000_000, 0, 10_000, 500_000, 0),
    ]
    const summary = computeYtdSummary(lines)
    expect(summary.net_equity_change_ytd).toBeLessThan(0)
  })

  it('total_contributions_ytd sums all months contributions', () => {
    const lines = [
      makeLine('2026-01', 0, 30_000, 0, 0, 0),
      makeLine('2026-02', 30_000, 20_000, 0, 0, 0),
      makeLine('2026-03', 50_000, 10_000, 0, 0, 0),
    ]
    const summary = computeYtdSummary(lines)
    expect(summary.total_contributions_ytd).toBe(60_000)
  })
})
