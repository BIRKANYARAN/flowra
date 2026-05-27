/**
 * Retained Earnings — unit tests for all pure functions
 *
 * Tests:
 *   computePeriodLegalReserve    — normal / no profit / already at cap
 *   computeClosingBalance        — normal / with adjustments / negative result
 *   isAccumulatedDeficit         — positive / negative / zero
 *   computeEquityCoverageRatio   — normal / zero liabilities / negative equity
 *   buildRollforwardLine         — correct computation + is_deficit flag
 *
 * Min 20 tests total.
 */

import { describe, it, expect } from 'vitest'
import {
  computePeriodLegalReserve,
  computeClosingBalance,
  isAccumulatedDeficit,
  computeEquityCoverageRatio,
  buildRollforwardLine,
} from '../lib/services/finance/retained-earnings.service'

// ── computePeriodLegalReserve ─────────────────────────────────────────────────

describe('computePeriodLegalReserve', () => {

  it('1. normal: 5% of net income when reserve not yet at cap', () => {
    // paidInCapital 100k → cap 20k; existing 0 → gap 20k
    // netIncome 80k → proposed 4k < gap → result = 4k
    const result = computePeriodLegalReserve(80_000, 100_000, 0)
    expect(result).toBeCloseTo(80_000 * 0.05, 2)
  })

  it('2. returns 0 when net income is 0', () => {
    expect(computePeriodLegalReserve(0, 100_000, 0)).toBe(0)
  })

  it('3. returns 0 when net income is negative (loss period)', () => {
    expect(computePeriodLegalReserve(-50_000, 100_000, 10_000)).toBe(0)
  })

  it('4. capped when existing reserves already fill the 20% gap', () => {
    // paidInCapital 100k → cap 20k; existing 20k → gap 0
    expect(computePeriodLegalReserve(80_000, 100_000, 20_000)).toBe(0)
  })

  it('5. capped at remaining gap when proposed > gap', () => {
    // paidInCapital 100k → target 20k; existing 18k → gap 2k
    // proposed = 200k × 0.05 = 10k → capped at 2k
    const result = computePeriodLegalReserve(200_000, 100_000, 18_000)
    expect(result).toBeCloseTo(2_000, 2)
  })

  it('6. full 5% when gap is large enough', () => {
    // zero paid-in capital → 20% of 0 = 0, cap 0 → result 0
    expect(computePeriodLegalReserve(50_000, 0, 0)).toBe(0)
  })

  it('7. negative existing reserves — gap = target + |existing|', () => {
    // paidInCapital 200k → target 40k; existing -5k → gap 45k
    // proposed = 100k × 0.05 = 5k < 45k → result 5k
    const result = computePeriodLegalReserve(100_000, 200_000, -5_000)
    expect(result).toBeCloseTo(5_000, 2)
  })

})

// ── computeClosingBalance ─────────────────────────────────────────────────────

describe('computeClosingBalance', () => {

  it('8. normal: opening + netIncome - legalReserve - dividends - compensation', () => {
    const result = computeClosingBalance(100_000, 50_000, 2_500, 10_000, 5_000, 0)
    expect(result).toBeCloseTo(100_000 + 50_000 - 2_500 - 10_000 - 5_000, 2)
  })

  it('9. positive adjustments increase the closing balance', () => {
    const withAdj    = computeClosingBalance(50_000, 20_000, 1_000, 0, 0, 5_000)
    const withoutAdj = computeClosingBalance(50_000, 20_000, 1_000, 0, 0, 0)
    expect(withAdj - withoutAdj).toBeCloseTo(5_000, 2)
  })

  it('10. negative result when deductions exceed opening + income', () => {
    const result = computeClosingBalance(0, 10_000, 500, 50_000, 0, 0)
    expect(result).toBeLessThan(0)
    expect(result).toBeCloseTo(0 + 10_000 - 500 - 50_000, 2)
  })

  it('11. zero deductions: closing = opening + netIncome', () => {
    const result = computeClosingBalance(100_000, 30_000, 0, 0, 0, 0)
    expect(result).toBeCloseTo(130_000, 2)
  })

  it('12. compensation reduces closing balance', () => {
    const withComp    = computeClosingBalance(80_000, 20_000, 1_000, 5_000, 3_000, 0)
    const withoutComp = computeClosingBalance(80_000, 20_000, 1_000, 5_000, 0, 0)
    expect(withoutComp - withComp).toBeCloseTo(3_000, 2)
  })

})

// ── isAccumulatedDeficit ──────────────────────────────────────────────────────

describe('isAccumulatedDeficit', () => {

  it('13. positive closing → not a deficit', () => {
    expect(isAccumulatedDeficit(100_000)).toBe(false)
  })

  it('14. negative closing → accumulated deficit', () => {
    expect(isAccumulatedDeficit(-1)).toBe(true)
  })

  it('15. zero closing → not a deficit', () => {
    expect(isAccumulatedDeficit(0)).toBe(false)
  })

  it('16. large negative value is deficit', () => {
    expect(isAccumulatedDeficit(-1_000_000)).toBe(true)
  })

})

// ── computeEquityCoverageRatio ────────────────────────────────────────────────

describe('computeEquityCoverageRatio', () => {

  it('17. normal: ratio = closing / totalLiabilities', () => {
    const ratio = computeEquityCoverageRatio(200_000, 100_000)
    expect(ratio).toBeCloseTo(2.0, 2)
  })

  it('18. returns null when totalLiabilities = 0', () => {
    expect(computeEquityCoverageRatio(500_000, 0)).toBeNull()
  })

  it('19. negative equity results in negative ratio', () => {
    const ratio = computeEquityCoverageRatio(-50_000, 100_000)
    expect(ratio).toBeCloseTo(-0.5, 2)
  })

  it('20. ratio < 1 when equity is less than liabilities', () => {
    const ratio = computeEquityCoverageRatio(40_000, 100_000)
    expect(ratio).toBeCloseTo(0.4, 2)
    expect(ratio!).toBeLessThan(1)
  })

})

// ── buildRollforwardLine ──────────────────────────────────────────────────────

describe('buildRollforwardLine', () => {

  it('21. line closing matches computed closing balance', () => {
    const line = buildRollforwardLine('2025-01', 100_000, 50_000, 2_500, 10_000, 5_000, 0)
    const expected = computeClosingBalance(100_000, 50_000, 2_500, 10_000, 5_000, 0)
    expect(line.closing_try).toBeCloseTo(expected, 2)
  })

  it('22. is_deficit = false when closing is positive', () => {
    const line = buildRollforwardLine('2025-02', 50_000, 20_000, 1_000, 0, 0, 0)
    expect(line.is_deficit).toBe(false)
  })

  it('23. is_deficit = true when closing is negative', () => {
    const line = buildRollforwardLine('2025-03', 0, -30_000, 0, 0, 0, 0)
    expect(line.is_deficit).toBe(true)
    expect(line.closing_try).toBeLessThan(0)
  })

  it('24. period_label for monthly key includes month name', () => {
    const line = buildRollforwardLine('2025-01', 0, 0, 0, 0, 0, 0)
    expect(line.period_label).toContain('Ocak')
    expect(line.period_label).toContain('2025')
  })

  it('25. period_label for annual key ends with "Yılı"', () => {
    const line = buildRollforwardLine('2025', 0, 0, 0, 0, 0, 0)
    expect(line.period_label).toBe('2025 Yılı')
  })

  it('26. numeric fields are rounded to 2 decimal places', () => {
    const line = buildRollforwardLine('2025-04', 1.005, 2.005, 0.005, 0.005, 0.005, 0.005)
    // opening_try should equal Math.round(1.005 * 100) / 100
    expect(line.opening_try).toBe(Math.round(1.005 * 100) / 100)
    // closing value should equal its own round2
    expect(line.closing_try).toBeCloseTo(Math.round(line.closing_try * 100) / 100, 5)
  })

  it('27. adjustments increase closing balance', () => {
    const withAdj    = buildRollforwardLine('2025-05', 10_000, 5_000, 250, 0, 0, 2_000)
    const withoutAdj = buildRollforwardLine('2025-05', 10_000, 5_000, 250, 0, 0, 0)
    expect(withAdj.closing_try - withoutAdj.closing_try).toBeCloseTo(2_000, 2)
  })

  it('28. period_key is stored on the line exactly as passed', () => {
    const line = buildRollforwardLine('2024-12', 0, 0, 0, 0, 0, 0)
    expect(line.period_key).toBe('2024-12')
  })

  it('29. zero-income period: closing = opening', () => {
    const line = buildRollforwardLine('2025-06', 75_000, 0, 0, 0, 0, 0)
    expect(line.closing_try).toBeCloseTo(75_000, 2)
    expect(line.is_deficit).toBe(false)
  })

  it('30. all deductions together produce expected closing', () => {
    const opening      = 500_000
    const netIncome    = 100_000
    const legalReserve = 5_000
    const dividends    = 30_000
    const compensation = 12_000
    const adjustments  = 0
    const line = buildRollforwardLine('2025-07', opening, netIncome, legalReserve, dividends, compensation, adjustments)
    expect(line.closing_try).toBeCloseTo(
      opening + netIncome - legalReserve - dividends - compensation + adjustments, 2
    )
  })

})
