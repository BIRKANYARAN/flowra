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

  it('6. returns 0 when paidInCapital is zero (cap = 0)', () => {
    // zero paid-in capital → 20% of 0 = 0, cap 0 → result 0
    expect(computePeriodLegalReserve(50_000, 0, 0)).toBe(0)
  })

  it('7. negative existing reserves — gap = target + |existing|', () => {
    // paidInCapital 200k → target 40k; existing -5k → gap 45k
    // proposed = 100k × 0.05 = 5k < 45k → result 5k
    const result = computePeriodLegalReserve(100_000, 200_000, -5_000)
    expect(result).toBeCloseTo(5_000, 2)
  })

  it('8. large paid-in capital → large cap, full 5% applies', () => {
    // paidInCapital 5M → cap 1M; existing 0 → gap 1M
    // netIncome 100k → proposed 5k < 1M → result 5k
    const result = computePeriodLegalReserve(100_000, 5_000_000, 0)
    expect(result).toBeCloseTo(5_000, 2)
  })

  it('9. exactly at the 20% cap — returns 0 (no more room)', () => {
    // paidInCapital 500k → cap = 100k; existing 100k → gap 0
    expect(computePeriodLegalReserve(200_000, 500_000, 100_000)).toBe(0)
  })

  it('10. very small net income — returns tiny reserve correctly', () => {
    // netIncome 100 × 0.05 = 5
    const result = computePeriodLegalReserve(100, 10_000, 0)
    expect(result).toBeCloseTo(5, 2)
  })

})

// ── computeClosingBalance ─────────────────────────────────────────────────────

describe('computeClosingBalance', () => {

  it('11. normal: opening + netIncome - legalReserve - dividends - compensation', () => {
    const result = computeClosingBalance(100_000, 50_000, 2_500, 10_000, 5_000, 0)
    expect(result).toBeCloseTo(100_000 + 50_000 - 2_500 - 10_000 - 5_000, 2)
  })

  it('12. positive adjustments increase the closing balance', () => {
    const withAdj    = computeClosingBalance(50_000, 20_000, 1_000, 0, 0, 5_000)
    const withoutAdj = computeClosingBalance(50_000, 20_000, 1_000, 0, 0, 0)
    expect(withAdj - withoutAdj).toBeCloseTo(5_000, 2)
  })

  it('13. negative result when deductions exceed opening + income', () => {
    const result = computeClosingBalance(0, 10_000, 500, 50_000, 0, 0)
    expect(result).toBeLessThan(0)
    expect(result).toBeCloseTo(0 + 10_000 - 500 - 50_000, 2)
  })

  it('14. zero deductions: closing = opening + netIncome', () => {
    const result = computeClosingBalance(100_000, 30_000, 0, 0, 0, 0)
    expect(result).toBeCloseTo(130_000, 2)
  })

  it('15. compensation reduces closing balance', () => {
    const withComp    = computeClosingBalance(80_000, 20_000, 1_000, 5_000, 3_000, 0)
    const withoutComp = computeClosingBalance(80_000, 20_000, 1_000, 5_000, 0, 0)
    expect(withoutComp - withComp).toBeCloseTo(3_000, 2)
  })

  it('16. all values zero → closing is zero', () => {
    expect(computeClosingBalance(0, 0, 0, 0, 0, 0)).toBe(0)
  })

  it('17. negative opening balance carried forward', () => {
    const result = computeClosingBalance(-50_000, 20_000, 0, 0, 0, 0)
    expect(result).toBeCloseTo(-30_000, 2)
  })

  it('18. negative adjustments reduce closing balance', () => {
    const withNegAdj = computeClosingBalance(100_000, 10_000, 0, 0, 0, -5_000)
    expect(withNegAdj).toBeCloseTo(105_000, 2)
  })

  it('19. large values produce correct result', () => {
    const result = computeClosingBalance(1_000_000, 500_000, 25_000, 100_000, 50_000, 0)
    expect(result).toBeCloseTo(1_325_000, 2)
  })

  it('20. fractional values rounded to 2 decimal places', () => {
    const result = computeClosingBalance(100.5, 20.5, 0.5, 0.5, 0.5, 0)
    expect(result).toBeCloseTo(119.5, 2)
  })

})

// ── isAccumulatedDeficit ──────────────────────────────────────────────────────

describe('isAccumulatedDeficit', () => {

  it('21. positive closing → not a deficit', () => {
    expect(isAccumulatedDeficit(100_000)).toBe(false)
  })

  it('22. negative closing → accumulated deficit', () => {
    expect(isAccumulatedDeficit(-1)).toBe(true)
  })

  it('23. zero closing → not a deficit', () => {
    expect(isAccumulatedDeficit(0)).toBe(false)
  })

  it('24. large negative value is deficit', () => {
    expect(isAccumulatedDeficit(-1_000_000)).toBe(true)
  })

  it('25. small positive value is not deficit', () => {
    expect(isAccumulatedDeficit(0.01)).toBe(false)
  })

  it('26. very small negative value is deficit', () => {
    expect(isAccumulatedDeficit(-0.01)).toBe(true)
  })

})

// ── computeEquityCoverageRatio ────────────────────────────────────────────────

describe('computeEquityCoverageRatio', () => {

  it('27. normal: ratio = closing / totalLiabilities', () => {
    const ratio = computeEquityCoverageRatio(200_000, 100_000)
    expect(ratio).toBeCloseTo(2.0, 2)
  })

  it('28. returns null when totalLiabilities = 0', () => {
    expect(computeEquityCoverageRatio(500_000, 0)).toBeNull()
  })

  it('29. negative equity results in negative ratio', () => {
    const ratio = computeEquityCoverageRatio(-50_000, 100_000)
    expect(ratio).toBeCloseTo(-0.5, 2)
  })

  it('30. ratio < 1 when equity is less than liabilities', () => {
    const ratio = computeEquityCoverageRatio(40_000, 100_000)
    expect(ratio).toBeCloseTo(0.4, 2)
    expect(ratio!).toBeLessThan(1)
  })

  it('31. ratio = 1 when equity equals liabilities', () => {
    const ratio = computeEquityCoverageRatio(100_000, 100_000)
    expect(ratio).toBeCloseTo(1.0, 2)
  })

  it('32. large numbers produce correct ratio', () => {
    const ratio = computeEquityCoverageRatio(3_000_000, 1_000_000)
    expect(ratio).toBeCloseTo(3.0, 2)
  })

  it('33. very small equity over very large liabilities — fractional ratio', () => {
    const ratio = computeEquityCoverageRatio(1_000, 1_000_000)
    // 1000 / 1_000_000 = 0.001, round2 → 0
    expect(ratio).toBeCloseTo(0, 2)
  })

})

// ── buildRollforwardLine ──────────────────────────────────────────────────────

describe('buildRollforwardLine', () => {

  it('34. line closing matches computed closing balance', () => {
    const line = buildRollforwardLine('2025-01', 100_000, 50_000, 2_500, 10_000, 5_000, 0)
    const expected = computeClosingBalance(100_000, 50_000, 2_500, 10_000, 5_000, 0)
    expect(line.closing_try).toBeCloseTo(expected, 2)
  })

  it('35. is_deficit = false when closing is positive', () => {
    const line = buildRollforwardLine('2025-02', 50_000, 20_000, 1_000, 0, 0, 0)
    expect(line.is_deficit).toBe(false)
  })

  it('36. is_deficit = true when closing is negative', () => {
    const line = buildRollforwardLine('2025-03', 0, -30_000, 0, 0, 0, 0)
    expect(line.is_deficit).toBe(true)
    expect(line.closing_try).toBeLessThan(0)
  })

  it('37. period_label for monthly key includes month name (Ocak)', () => {
    const line = buildRollforwardLine('2025-01', 0, 0, 0, 0, 0, 0)
    expect(line.period_label).toContain('Ocak')
    expect(line.period_label).toContain('2025')
  })

  it('38. period_label for annual key ends with "Yılı"', () => {
    const line = buildRollforwardLine('2025', 0, 0, 0, 0, 0, 0)
    expect(line.period_label).toBe('2025 Yılı')
  })

  it('39. numeric fields are rounded to 2 decimal places', () => {
    const line = buildRollforwardLine('2025-04', 1.005, 2.005, 0.005, 0.005, 0.005, 0.005)
    // opening_try should equal Math.round(1.005 * 100) / 100
    expect(line.opening_try).toBe(Math.round(1.005 * 100) / 100)
    // closing value should equal its own round2
    expect(line.closing_try).toBeCloseTo(Math.round(line.closing_try * 100) / 100, 5)
  })

  it('40. adjustments increase closing balance', () => {
    const withAdj    = buildRollforwardLine('2025-05', 10_000, 5_000, 250, 0, 0, 2_000)
    const withoutAdj = buildRollforwardLine('2025-05', 10_000, 5_000, 250, 0, 0, 0)
    expect(withAdj.closing_try - withoutAdj.closing_try).toBeCloseTo(2_000, 2)
  })

  it('41. period_key is stored on the line exactly as passed', () => {
    const line = buildRollforwardLine('2024-12', 0, 0, 0, 0, 0, 0)
    expect(line.period_key).toBe('2024-12')
  })

  it('42. zero-income period: closing = opening', () => {
    const line = buildRollforwardLine('2025-06', 75_000, 0, 0, 0, 0, 0)
    expect(line.closing_try).toBeCloseTo(75_000, 2)
    expect(line.is_deficit).toBe(false)
  })

  it('43. all deductions together produce expected closing', () => {
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

  it('44. December period label is Aralık', () => {
    const line = buildRollforwardLine('2025-12', 0, 0, 0, 0, 0, 0)
    expect(line.period_label).toContain('Aralık')
  })

  it('45. net_income_try field stored correctly on the line', () => {
    const line = buildRollforwardLine('2025-08', 0, 75_000, 0, 0, 0, 0)
    expect(line.net_income_try).toBeCloseTo(75_000, 2)
  })

  it('46. dividends_try field stored correctly on the line', () => {
    const line = buildRollforwardLine('2025-09', 100_000, 50_000, 0, 20_000, 0, 0)
    expect(line.dividends_try).toBeCloseTo(20_000, 2)
  })

  it('47. large loss period transitions from profit to deficit', () => {
    const line = buildRollforwardLine('2025-10', 10_000, -50_000, 0, 0, 0, 0)
    expect(line.closing_try).toBeCloseTo(-40_000, 2)
    expect(line.is_deficit).toBe(true)
  })

  it('48. period_label for February is Şubat', () => {
    const line = buildRollforwardLine('2025-02', 0, 0, 0, 0, 0, 0)
    expect(line.period_label).toContain('Şubat')
  })

  it('49. period_label for March is Mart', () => {
    const line = buildRollforwardLine('2025-03', 0, 0, 0, 0, 0, 0)
    expect(line.period_label).toContain('Mart')
  })

  it('50. period_label for June is Haziran', () => {
    const line = buildRollforwardLine('2025-06', 0, 0, 0, 0, 0, 0)
    expect(line.period_label).toContain('Haziran')
  })

  it('51. period_label for July is Temmuz', () => {
    const line = buildRollforwardLine('2025-07', 0, 0, 0, 0, 0, 0)
    expect(line.period_label).toContain('Temmuz')
  })

  it('52. legal_reserve_try stored on line', () => {
    const line = buildRollforwardLine('2025-11', 0, 100_000, 5_000, 0, 0, 0)
    expect(line.legal_reserve_try).toBeCloseTo(5_000, 2)
  })

  it('53. compensation_try stored on line', () => {
    const line = buildRollforwardLine('2025-11', 0, 100_000, 0, 0, 8_000, 0)
    expect(line.compensation_try).toBeCloseTo(8_000, 2)
  })

  it('54. adjustments_try stored on line', () => {
    const line = buildRollforwardLine('2025-11', 0, 100_000, 0, 0, 0, 3_500)
    expect(line.adjustments_try).toBeCloseTo(3_500, 2)
  })

  it('55. opening_try stored on line', () => {
    const line = buildRollforwardLine('2025-05', 200_000, 0, 0, 0, 0, 0)
    expect(line.opening_try).toBeCloseTo(200_000, 2)
  })

})

// ── computePeriodLegalReserve — boundary tests ────────────────────────────────

describe('computePeriodLegalReserve — boundary tests', () => {

  it('56. gap of exactly 1 TRY → proposed capped at 1', () => {
    // paidInCapital 100k → cap 20k; existing 19_999 → gap 1
    // netIncome 100k → proposed 5_000 > gap 1 → capped at 1
    const result = computePeriodLegalReserve(100_000, 100_000, 19_999)
    expect(result).toBeCloseTo(1, 2)
  })

  it('57. exact threshold: existing = target - 0.01 → small reserve still applied', () => {
    // paidInCapital 1_000 → cap 200; existing 199.99 → gap 0.01
    // proposed = 10k × 0.05 = 500 → capped at 0.01
    const result = computePeriodLegalReserve(10_000, 1_000, 199.99)
    expect(result).toBeCloseTo(0.01, 2)
  })

  it('58. net income of 1 TRY → reserve is 0.05 TRY', () => {
    const result = computePeriodLegalReserve(1, 10_000, 0)
    expect(result).toBeCloseTo(0.05, 2)
  })

  it('59. returns 0 when paidInCapital negative (edge case)', () => {
    // Negative paid-in capital → cap ≤ 0 → no reserve
    const result = computePeriodLegalReserve(100_000, -50_000, 0)
    expect(result).toBe(0)
  })

})

// ── computeClosingBalance — boundary tests ────────────────────────────────────

describe('computeClosingBalance — boundary tests', () => {

  it('60. legalReserve equal to netIncome → closing = opening', () => {
    const result = computeClosingBalance(50_000, 10_000, 10_000, 0, 0, 0)
    expect(result).toBeCloseTo(50_000, 2)
  })

  it('61. dividends equal to opening + netIncome → closing is 0 or negative', () => {
    const result = computeClosingBalance(10_000, 5_000, 0, 15_000, 0, 0)
    expect(result).toBeCloseTo(0, 2)
  })

  it('62. all deductions sum > opening + netIncome → closing negative', () => {
    const result = computeClosingBalance(5_000, 3_000, 1_000, 7_000, 2_000, 0)
    // 5000 + 3000 - 1000 - 7000 - 2000 = -2000
    expect(result).toBeLessThan(0)
    expect(result).toBeCloseTo(-2_000, 2)
  })

  it('63. very large values remain precise', () => {
    const result = computeClosingBalance(10_000_000, 2_000_000, 100_000, 500_000, 200_000, 0)
    expect(result).toBeCloseTo(11_200_000, 0)
  })

})

// ── isAccumulatedDeficit — boundary tests ─────────────────────────────────────

describe('isAccumulatedDeficit — boundary tests', () => {

  it('64. exactly 0 is not deficit', () => {
    expect(isAccumulatedDeficit(0)).toBe(false)
  })

  it('65. -0 is not deficit (JavaScript -0 === 0)', () => {
    expect(isAccumulatedDeficit(-0)).toBe(false)
  })

  it('66. Number.EPSILON is not deficit', () => {
    expect(isAccumulatedDeficit(Number.EPSILON)).toBe(false)
  })

  it('67. -Number.EPSILON is deficit', () => {
    expect(isAccumulatedDeficit(-Number.EPSILON)).toBe(true)
  })

})

// ── computeEquityCoverageRatio — boundary tests ───────────────────────────────

describe('computeEquityCoverageRatio — boundary tests', () => {

  it('68. both equity and liabilities are 0 → returns null', () => {
    expect(computeEquityCoverageRatio(0, 0)).toBeNull()
  })

  it('69. very small liabilities → large ratio', () => {
    const ratio = computeEquityCoverageRatio(1_000_000, 1)
    expect(ratio).toBeDefined()
    expect(ratio!).toBeGreaterThan(1_000)
  })

  it('70. ratio sign matches equity sign', () => {
    const pos = computeEquityCoverageRatio(100, 100)
    const neg = computeEquityCoverageRatio(-100, 100)
    expect(pos!).toBeGreaterThan(0)
    expect(neg!).toBeLessThan(0)
  })

})

// ── Integration: multi-period rollforward chain ───────────────────────────────

describe('multi-period rollforward chain', () => {

  it('71. closing of period N becomes opening of period N+1', () => {
    const p1 = buildRollforwardLine('2025-01', 0, 50_000, 2_500, 5_000, 0, 0)
    const p2 = buildRollforwardLine('2025-02', p1.closing_try, 30_000, 1_500, 0, 0, 0)
    expect(p2.opening_try).toBeCloseTo(p1.closing_try, 2)
  })

  it('72. two profitable periods accumulate correctly', () => {
    const p1 = buildRollforwardLine('2025-01', 0, 100_000, 5_000, 20_000, 0, 0)
    const p2 = buildRollforwardLine('2025-02', p1.closing_try, 80_000, 4_000, 10_000, 0, 0)
    expect(p1.is_deficit).toBe(false)
    expect(p2.is_deficit).toBe(false)
    expect(p2.closing_try).toBeGreaterThan(p1.closing_try)
  })

  it('73. loss period after profit period may still remain non-deficit', () => {
    const p1 = buildRollforwardLine('2025-01', 0, 200_000, 10_000, 0, 0, 0)
    const p2 = buildRollforwardLine('2025-02', p1.closing_try, -50_000, 0, 0, 0, 0)
    // Even after a loss, if opening was large enough, closing is still positive
    expect(p2.closing_try).toBeGreaterThan(0)
    expect(p2.is_deficit).toBe(false)
  })

  it('74. three-period chain: total net income equals sum of individual net incomes', () => {
    const incomes = [100_000, -30_000, 50_000]
    let opening = 0
    const lines = incomes.map((ni, i) => {
      const line = buildRollforwardLine(`2025-0${i + 1}`, opening, ni, 0, 0, 0, 0)
      opening = line.closing_try
      return line
    })
    const totalNetIncome = lines.reduce((s, l) => s + l.net_income_try, 0)
    expect(totalNetIncome).toBeCloseTo(incomes.reduce((s, n) => s + n, 0), 2)
  })

  it('75. period chain with dividends: each period correctly deducts dividends', () => {
    const p1 = buildRollforwardLine('2025-01', 100_000, 50_000, 2_500, 30_000, 0, 0)
    const p2 = buildRollforwardLine('2025-02', p1.closing_try, 60_000, 3_000, 20_000, 0, 0)
    expect(p1.dividends_try).toBeCloseTo(30_000, 2)
    expect(p2.dividends_try).toBeCloseTo(20_000, 2)
    expect(p1.closing_try).toBeCloseTo(100_000 + 50_000 - 2_500 - 30_000, 2)
    expect(p2.closing_try).toBeCloseTo(p1.closing_try + 60_000 - 3_000 - 20_000, 2)
  })

})

// ── computePeriodLegalReserve — edge cases zero income / already-at-cap ───────

describe('computePeriodLegalReserve — zero income and already-at-cap', () => {

  it('76. zero net income → always 0 reserve regardless of cap headroom', () => {
    // Even if there is plenty of room, no income = no reserve
    expect(computePeriodLegalReserve(0, 500_000, 0)).toBe(0)
  })

  it('77. net income = 1, paidInCapital = 0 → cap = 0, reserve = 0', () => {
    expect(computePeriodLegalReserve(1, 0, 0)).toBe(0)
  })

  it('78. already at cap (existing = 20% of paidInCapital) → 0 reserve', () => {
    expect(computePeriodLegalReserve(200_000, 250_000, 50_000)).toBe(0)
  })

  it('79. existing just 1 cent below cap → takes only the remaining 0.01 TRY', () => {
    // paidInCapital 100 → cap 20; existing = 19.99 → gap = 0.01
    // proposed = 1000 × 0.05 = 50 → capped at 0.01
    const result = computePeriodLegalReserve(1_000, 100, 19.99)
    expect(result).toBeCloseTo(0.01, 2)
  })

  it('80. 5% rate: proposed = net × 0.05 exactly when gap is large', () => {
    // paidInCapital 1_000_000 → cap 200_000; existing = 0 → gap = 200_000
    // netIncome = 60_000 → proposed = 3_000 < gap → result = 3_000
    const result = computePeriodLegalReserve(60_000, 1_000_000, 0)
    expect(result).toBeCloseTo(60_000 * 0.05, 2)
  })

})

// ── retained earnings accumulation across multiple periods ────────────────────

describe('retained earnings accumulation — multi-period scenarios', () => {

  it('81. four consecutive profitable periods accumulate correctly', () => {
    let opening = 0
    const incomes   = [50_000, 60_000, 40_000, 70_000]
    const reserves  = incomes.map(ni => computePeriodLegalReserve(ni, 200_000, 0))
    const closings: number[] = []
    for (let i = 0; i < incomes.length; i++) {
      const closing = computeClosingBalance(opening, incomes[i], reserves[i], 0, 0, 0)
      closings.push(closing)
      opening = closing
    }
    // Each closing should be greater than the previous
    for (let i = 1; i < closings.length; i++) {
      expect(closings[i]).toBeGreaterThan(closings[i - 1])
    }
  })

  it('82. loss period after accumulated profit reduces closing', () => {
    const p1 = buildRollforwardLine('2025-01', 0, 100_000, 5_000, 0, 0, 0)
    const p2 = buildRollforwardLine('2025-02', p1.closing_try, -20_000, 0, 0, 0, 0)
    expect(p2.closing_try).toBeLessThan(p1.closing_try)
    expect(p2.is_deficit).toBe(false) // still positive
  })

  it('83. repeated small losses eventually cause a deficit', () => {
    let opening = 10_000
    for (let i = 0; i < 6; i++) {
      opening = computeClosingBalance(opening, -2_000, 0, 0, 0, 0)
    }
    // 10_000 - 6 × 2_000 = -2_000
    expect(opening).toBeCloseTo(-2_000, 2)
    expect(isAccumulatedDeficit(opening)).toBe(true)
  })

  it('84. dividend distribution across 3 periods', () => {
    let opening = 200_000
    const dividends = [20_000, 30_000, 10_000]
    for (const div of dividends) {
      opening = computeClosingBalance(opening, 50_000, 2_500, div, 0, 0)
    }
    // 200_000 + 3×50_000 - 3×2_500 - 60_000 = 200_000 + 150_000 - 7_500 - 60_000 = 282_500
    expect(opening).toBeCloseTo(282_500, 2)
  })

  it('85. compensation (huzur hakkı) reduces closing consistently', () => {
    const withComp    = computeClosingBalance(100_000, 50_000, 2_500, 10_000, 5_000, 0)
    const withoutComp = computeClosingBalance(100_000, 50_000, 2_500, 10_000, 0, 0)
    expect(withoutComp - withComp).toBeCloseTo(5_000, 2)
  })

})

// ── withholding tax / boundary scenarios ──────────────────────────────────────

describe('equity coverage ratio — boundary values', () => {

  it('86. ratio rounds to 2 decimal places', () => {
    const ratio = computeEquityCoverageRatio(100_000, 30_000)
    // 100_000 / 30_000 = 3.333... → rounds to 3.33
    expect(ratio).toBeCloseTo(3.33, 2)
  })

  it('87. liabilities = 1 TRY → very large positive ratio', () => {
    const ratio = computeEquityCoverageRatio(500_000, 1)
    expect(ratio).toBeGreaterThan(100_000)
  })

  it('88. negative equity, small liabilities → large negative ratio', () => {
    const ratio = computeEquityCoverageRatio(-100_000, 100)
    expect(ratio).toBeLessThan(-100)
  })

  it('89. equity = liabilities → ratio = 1', () => {
    const ratio = computeEquityCoverageRatio(75_000, 75_000)
    expect(ratio).toBeCloseTo(1.0, 2)
  })

  it('90. zero equity with non-zero liabilities → ratio = 0', () => {
    const ratio = computeEquityCoverageRatio(0, 50_000)
    expect(ratio).toBeCloseTo(0, 2)
  })

})
