/**
 * Income Statement Service — pure-math unit tests.
 *
 * Covers all exported pure functions:
 *   • computeEbitda
 *   • computeOperatingMargin
 *   • computeEffectiveTaxRate
 *   • buildIncomeStatementLine
 *   • classifyVariance
 *   • periodKeyToDateRange
 *
 * Run with: npx vitest run tests/income-statement.test.ts
 */

import { describe, it, expect } from 'vitest'
import {
  computeEbitda,
  computeOperatingMargin,
  computeEffectiveTaxRate,
  buildIncomeStatementLine,
  classifyVariance,
  periodKeyToDateRange,
} from '../lib/services/finance/income-statement.service'

// ── computeEbitda ──────────────────────────────────────────────────────────────

describe('computeEbitda', () => {
  it('returns gross_profit minus opex for positive values', () => {
    expect(computeEbitda(500_000, 200_000)).toBe(300_000)
  })

  it('returns negative EBITDA when opex exceeds gross profit', () => {
    expect(computeEbitda(100_000, 150_000)).toBe(-50_000)
  })

  it('returns zero when gross profit equals opex', () => {
    expect(computeEbitda(75_000, 75_000)).toBe(0)
  })

  it('handles zero gross profit', () => {
    expect(computeEbitda(0, 50_000)).toBe(-50_000)
  })

  it('handles zero opex', () => {
    expect(computeEbitda(250_000, 0)).toBe(250_000)
  })

  it('handles both zero → 0', () => {
    expect(computeEbitda(0, 0)).toBe(0)
  })

  it('large values compute correctly', () => {
    expect(computeEbitda(10_000_000, 3_500_000)).toBe(6_500_000)
  })

  it('result is a number (not NaN)', () => {
    const result = computeEbitda(100_000, 40_000)
    expect(typeof result).toBe('number')
    expect(isNaN(result)).toBe(false)
  })

  it('negative gross profit (unusual) handled correctly', () => {
    expect(computeEbitda(-10_000, 20_000)).toBe(-30_000)
  })
})

// ── computeOperatingMargin ─────────────────────────────────────────────────────

describe('computeOperatingMargin', () => {
  it('computes correct margin for positive revenue', () => {
    expect(computeOperatingMargin(300_000, 1_000_000)).toBeCloseTo(30)
  })

  it('returns 0 when revenue is zero (division guard)', () => {
    expect(computeOperatingMargin(100_000, 0)).toBe(0)
  })

  it('returns negative margin when EBITDA is negative', () => {
    expect(computeOperatingMargin(-50_000, 500_000)).toBeCloseTo(-10)
  })

  it('handles 100% margin (EBITDA = revenue, no opex or COGS)', () => {
    expect(computeOperatingMargin(200_000, 200_000)).toBeCloseTo(100)
  })

  it('handles 50% margin', () => {
    expect(computeOperatingMargin(250_000, 500_000)).toBeCloseTo(50)
  })

  it('returns 0 for both EBITDA and revenue zero', () => {
    expect(computeOperatingMargin(0, 0)).toBe(0)
  })

  it('result can exceed 100% (for theoretical cases)', () => {
    const margin = computeOperatingMargin(150_000, 100_000)
    expect(margin).toBeCloseTo(150)
  })

  it('very small positive EBITDA → small positive margin', () => {
    const margin = computeOperatingMargin(1, 1_000_000)
    expect(margin).toBeCloseTo(0.0001, 4)
  })
})

// ── computeEffectiveTaxRate ────────────────────────────────────────────────────

describe('computeEffectiveTaxRate', () => {
  it('computes correct effective rate for profitable period', () => {
    expect(computeEffectiveTaxRate(40_000, 200_000)).toBeCloseTo(20)
  })

  it('returns 0 when EBT is exactly zero', () => {
    expect(computeEffectiveTaxRate(0, 0)).toBe(0)
  })

  it('returns 0 when EBT is negative (loss year — no tax)', () => {
    expect(computeEffectiveTaxRate(0, -100_000)).toBe(0)
  })

  it('returns 0 when tax is zero despite positive EBT (tax holiday)', () => {
    expect(computeEffectiveTaxRate(0, 500_000)).toBe(0)
  })

  it('handles fractional rates correctly', () => {
    expect(computeEffectiveTaxRate(25_000, 100_000)).toBeCloseTo(25)
  })

  it('returns 0 for EBT just below zero (-1)', () => {
    expect(computeEffectiveTaxRate(0, -1)).toBe(0)
  })

  it('EBT=1, tax=0.20 → effective rate 20%', () => {
    expect(computeEffectiveTaxRate(0.20, 1)).toBeCloseTo(20)
  })

  it('result is a number (not NaN or Infinity)', () => {
    const rate = computeEffectiveTaxRate(20_000, 100_000)
    expect(isFinite(rate)).toBe(true)
    expect(isNaN(rate)).toBe(false)
  })

  it('large positive EBT → proportional rate', () => {
    expect(computeEffectiveTaxRate(2_000_000, 10_000_000)).toBeCloseTo(20)
  })
})

// ── classifyVariance ───────────────────────────────────────────────────────────

describe('classifyVariance', () => {
  // Revenue lines: increase = favorable
  it('revenue line with positive change is favorable', () => {
    expect(classifyVariance(50_000, true)).toBe('favorable')
  })

  it('revenue line with negative change is unfavorable', () => {
    expect(classifyVariance(-30_000, true)).toBe('unfavorable')
  })

  // Cost lines: increase = unfavorable
  it('cost line with positive change is unfavorable', () => {
    expect(classifyVariance(20_000, false)).toBe('unfavorable')
  })

  it('cost line with negative change is favorable', () => {
    expect(classifyVariance(-10_000, false)).toBe('favorable')
  })

  // Neutral
  it('zero change is neutral regardless of line type (revenue)', () => {
    expect(classifyVariance(0, true)).toBe('neutral')
  })

  it('zero change is neutral regardless of line type (cost)', () => {
    expect(classifyVariance(0, false)).toBe('neutral')
  })

  it('large positive revenue change is favorable', () => {
    expect(classifyVariance(5_000_000, true)).toBe('favorable')
  })

  it('large negative cost change is favorable', () => {
    expect(classifyVariance(-1_000_000, false)).toBe('favorable')
  })

  it('always returns one of the three valid values', () => {
    const validValues = ['favorable', 'unfavorable', 'neutral']
    expect(validValues).toContain(classifyVariance(100, true))
    expect(validValues).toContain(classifyVariance(-100, false))
    expect(validValues).toContain(classifyVariance(0, true))
  })

  it('tiny positive revenue change → favorable', () => {
    expect(classifyVariance(0.01, true)).toBe('favorable')
  })

  it('tiny negative cost change → favorable', () => {
    expect(classifyVariance(-0.01, false)).toBe('favorable')
  })
})

// ── buildIncomeStatementLine ───────────────────────────────────────────────────

describe('buildIncomeStatementLine', () => {
  it('builds line with prior period — positive revenue variance', () => {
    const line = buildIncomeStatementLine('Net Satışlar', 1_000_000, 800_000, true)
    expect(line.label).toBe('Net Satışlar')
    expect(line.current_try).toBe(1_000_000)
    expect(line.prior_try).toBe(800_000)
    expect(line.change_try).toBe(200_000)
    expect(line.change_pct).toBeCloseTo(25)
    expect(line.variance_direction).toBe('favorable')
  })

  it('builds line without prior period — change fields are null', () => {
    const line = buildIncomeStatementLine('Net Satışlar', 500_000, null)
    expect(line.prior_try).toBeNull()
    expect(line.change_try).toBeNull()
    expect(line.change_pct).toBeNull()
    expect(line.variance_direction).toBe('neutral')
  })

  it('change_pct is null when prior period is zero (guard against division by zero)', () => {
    const line = buildIncomeStatementLine('Net Satışlar', 100_000, 0, true)
    expect(line.change_try).toBe(100_000)
    expect(line.change_pct).toBeNull()
  })

  it('marks subtotal rows correctly', () => {
    const line = buildIncomeStatementLine('Brüt Kâr', 300_000, 250_000, true, true, 0)
    expect(line.is_subtotal).toBe(true)
    expect(line.indent_level).toBe(0)
  })

  it('marks indented rows correctly', () => {
    const line = buildIncomeStatementLine('COGS', 200_000, 180_000, false, false, 1)
    expect(line.is_subtotal).toBe(false)
    expect(line.indent_level).toBe(1)
  })

  it('cost line with increasing cost is unfavorable', () => {
    const line = buildIncomeStatementLine('Faaliyet Giderleri', 150_000, 100_000, false)
    expect(line.variance_direction).toBe('unfavorable')
  })

  it('cost line with decreasing cost is favorable', () => {
    const line = buildIncomeStatementLine('Faaliyet Giderleri', 80_000, 100_000, false)
    expect(line.variance_direction).toBe('favorable')
    expect(line.change_try).toBe(-20_000)
  })

  it('revenue line with decrease is unfavorable', () => {
    const line = buildIncomeStatementLine('Net Satışlar', 400_000, 600_000, true)
    expect(line.variance_direction).toBe('unfavorable')
    expect(line.change_pct).toBeCloseTo(-33.33, 1)
  })

  it('computes change_pct correctly for large numbers', () => {
    const line = buildIncomeStatementLine('Net Satışlar', 1_200_000, 1_000_000, true)
    expect(line.change_pct).toBeCloseTo(20)
  })

  it('current equals prior → neutral variance, change_try=0', () => {
    const line = buildIncomeStatementLine('Net Satışlar', 500_000, 500_000, true)
    expect(line.change_try).toBe(0)
    expect(line.variance_direction).toBe('neutral')
  })

  it('default isRevenueLine is true when not specified', () => {
    const line = buildIncomeStatementLine('Revenue', 200_000, 100_000)
    expect(line.variance_direction).toBe('favorable')
  })

  it('default isSubtotal is false when not specified', () => {
    const line = buildIncomeStatementLine('Revenue', 200_000, 100_000)
    expect(line.is_subtotal).toBe(false)
  })

  it('default indentLevel is 0 when not specified', () => {
    const line = buildIncomeStatementLine('Revenue', 200_000, 100_000)
    expect(line.indent_level).toBe(0)
  })

  it('label is stored correctly', () => {
    const line = buildIncomeStatementLine('Net Dönem Kârı', 100_000, null)
    expect(line.label).toBe('Net Dönem Kârı')
  })

  it('current_try is stored correctly for zero value', () => {
    const line = buildIncomeStatementLine('Net Satışlar', 0, null)
    expect(line.current_try).toBe(0)
  })
})

// ── periodKeyToDateRange ───────────────────────────────────────────────────────

describe('periodKeyToDateRange', () => {
  it('returns correct range for January (31-day month)', () => {
    const range = periodKeyToDateRange('2025-01')
    expect(range.start).toBe('2025-01-01')
    expect(range.end).toBe('2025-01-31')
  })

  it('returns correct range for February (non-leap year)', () => {
    const range = periodKeyToDateRange('2025-02')
    expect(range.start).toBe('2025-02-01')
    expect(range.end).toBe('2025-02-28')
  })

  it('returns correct range for February (leap year)', () => {
    const range = periodKeyToDateRange('2024-02')
    expect(range.start).toBe('2024-02-01')
    expect(range.end).toBe('2024-02-29')
  })

  it('returns correct range for December', () => {
    const range = periodKeyToDateRange('2025-12')
    expect(range.start).toBe('2025-12-01')
    expect(range.end).toBe('2025-12-31')
  })

  it('returns correct range for a 30-day month (April)', () => {
    const range = periodKeyToDateRange('2025-04')
    expect(range.start).toBe('2025-04-01')
    expect(range.end).toBe('2025-04-30')
  })

  it('returns correct range for June (30-day month)', () => {
    const range = periodKeyToDateRange('2025-06')
    expect(range.start).toBe('2025-06-01')
    expect(range.end).toBe('2025-06-30')
  })

  it('returns correct range for July (31-day month)', () => {
    const range = periodKeyToDateRange('2025-07')
    expect(range.start).toBe('2025-07-01')
    expect(range.end).toBe('2025-07-31')
  })

  it('start always ends with -01', () => {
    for (let m = 1; m <= 12; m++) {
      const key = `2025-${String(m).padStart(2, '0')}`
      const range = periodKeyToDateRange(key)
      expect(range.start.endsWith('-01')).toBe(true)
    }
  })

  it('start format is YYYY-MM-01', () => {
    const range = periodKeyToDateRange('2026-03')
    expect(range.start).toMatch(/^\d{4}-\d{2}-01$/)
  })

  it('end format is YYYY-MM-DD', () => {
    const range = periodKeyToDateRange('2026-03')
    expect(range.end).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('2000-02 is leap year → February ends on 29', () => {
    const range = periodKeyToDateRange('2000-02')
    expect(range.end).toBe('2000-02-29')
  })

  it('1900-02 is NOT a leap year → February ends on 28', () => {
    const range = periodKeyToDateRange('1900-02')
    expect(range.end).toBe('1900-02-28')
  })
})
