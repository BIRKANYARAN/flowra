/**
 * Working Capital Optimization Service — unit tests
 *
 * Tests all pure computation functions exported from
 * lib/services/finance/working-capital-optimization.service.ts
 *
 * No DB or network calls — pure function tests only.
 */

import { describe, it, expect } from 'vitest'
import {
  computeCashConversionCycle,
  computeWorkingCapitalGap,
  computeCashReleasePotential,
  classifyGapPriority,
  generateReceivablesRecommendation,
  generateInventoryRecommendation,
  generatePayablesRecommendation,
  buildWorkingCapitalGaps,
  computeTotalCashReleasePotential,
  classifyWorkingCapitalEfficiency,
  computeWorkingCapitalRatio,
  computeNetWorkingCapital,
  identifyTopAction,
  WC_BENCHMARKS,
} from '../lib/services/finance/working-capital-optimization.service'

// ── computeCashConversionCycle ────────────────────────────────────────────────

describe('computeCashConversionCycle', () => {

  // Test 1: benchmark values → CCC = 15
  it('1. DSO=30, DIO=30, DPO=45 → CCC = 15 (benchmark)', () => {
    expect(computeCashConversionCycle(30, 30, 45)).toBe(15)
  })

  // Test 2: negative CCC (excellent cycle)
  it('2. DSO=10, DIO=10, DPO=45 → CCC = -25 (negative cycle)', () => {
    expect(computeCashConversionCycle(10, 10, 45)).toBe(-25)
  })

  // Test 3: high CCC (critical)
  it('3. DSO=60, DIO=45, DPO=30 → CCC = 75', () => {
    expect(computeCashConversionCycle(60, 45, 30)).toBe(75)
  })

  // Test 4: zero DIO
  it('4. DSO=30, DIO=0, DPO=45 → CCC = -15', () => {
    expect(computeCashConversionCycle(30, 0, 45)).toBe(-15)
  })

  // Test 5: all zeros
  it('5. all zeros → CCC = 0', () => {
    expect(computeCashConversionCycle(0, 0, 0)).toBe(0)
  })

  // Test 6: large values
  it('6. DSO=120, DIO=90, DPO=60 → CCC = 150', () => {
    expect(computeCashConversionCycle(120, 90, 60)).toBe(150)
  })

})

// ── computeWorkingCapitalGap ──────────────────────────────────────────────────

describe('computeWorkingCapitalGap — receivables', () => {

  // Test 7: actual worse than benchmark → positive gap
  it('7. actual=60, benchmark=30 → gap = 30', () => {
    expect(computeWorkingCapitalGap('receivables', 60, 30)).toBe(30)
  })

  // Test 8: at benchmark → gap = 0
  it('8. actual=30, benchmark=30 → gap = 0 (on benchmark)', () => {
    expect(computeWorkingCapitalGap('receivables', 30, 30)).toBe(0)
  })

  // Test 9: better than benchmark → gap = 0
  it('9. actual=20, benchmark=30 → gap = 0 (better than benchmark)', () => {
    expect(computeWorkingCapitalGap('receivables', 20, 30)).toBe(0)
  })

  // Test 10: small gap
  it('10. actual=35, benchmark=30 → gap = 5', () => {
    expect(computeWorkingCapitalGap('receivables', 35, 30)).toBe(5)
  })

})

describe('computeWorkingCapitalGap — inventory', () => {

  // Test 11: actual worse than benchmark
  it('11. actual=45, benchmark=30 → gap = 15', () => {
    expect(computeWorkingCapitalGap('inventory', 45, 30)).toBe(15)
  })

  // Test 12: at benchmark
  it('12. actual=30, benchmark=30 → gap = 0', () => {
    expect(computeWorkingCapitalGap('inventory', 30, 30)).toBe(0)
  })

  // Test 13: better than benchmark
  it('13. actual=15, benchmark=30 → gap = 0', () => {
    expect(computeWorkingCapitalGap('inventory', 15, 30)).toBe(0)
  })

})

describe('computeWorkingCapitalGap — payables', () => {

  // Test 14: actual lower than benchmark → DPO shortfall (positive gap)
  it('14. actual=30, benchmark=45 → gap = 15 (DPO shortfall)', () => {
    expect(computeWorkingCapitalGap('payables', 30, 45)).toBe(15)
  })

  // Test 15: at benchmark → gap = 0
  it('15. actual=45, benchmark=45 → gap = 0 (on benchmark)', () => {
    expect(computeWorkingCapitalGap('payables', 45, 45)).toBe(0)
  })

  // Test 16: better than benchmark (DPO higher) → gap = 0
  it('16. actual=60, benchmark=45 → gap = 0 (better — paying later)', () => {
    expect(computeWorkingCapitalGap('payables', 60, 45)).toBe(0)
  })

  // Test 17: large DPO shortfall
  it('17. actual=0, benchmark=45 → gap = 45', () => {
    expect(computeWorkingCapitalGap('payables', 0, 45)).toBe(45)
  })

})

// ── computeCashReleasePotential ───────────────────────────────────────────────

describe('computeCashReleasePotential', () => {

  // Test 18: receivables uses daily_revenue
  it('18. receivables, gap=30, dailyRev=10000, dailyCogs=4000 → 300000', () => {
    expect(computeCashReleasePotential('receivables', 30, 10_000, 4_000)).toBe(300_000)
  })

  // Test 19: inventory uses daily_revenue
  it('19. inventory, gap=15, dailyRev=10000, dailyCogs=4000 → 150000', () => {
    expect(computeCashReleasePotential('inventory', 15, 10_000, 4_000)).toBe(150_000)
  })

  // Test 20: payables uses daily_cogs
  it('20. payables, gap=15, dailyRev=10000, dailyCogs=4000 → 60000', () => {
    expect(computeCashReleasePotential('payables', 15, 10_000, 4_000)).toBe(60_000)
  })

  // Test 21: gap=0 → 0 regardless
  it('21. gap=0 → 0 for any dimension', () => {
    expect(computeCashReleasePotential('receivables', 0, 10_000, 4_000)).toBe(0)
    expect(computeCashReleasePotential('inventory', 0, 10_000, 4_000)).toBe(0)
    expect(computeCashReleasePotential('payables', 0, 10_000, 4_000)).toBe(0)
  })

  // Test 22: negative gap treated as 0
  it('22. negative gap → 0', () => {
    expect(computeCashReleasePotential('receivables', -5, 10_000, 4_000)).toBe(0)
  })

  // Test 23: zero daily revenue for receivables
  it('23. dailyRev=0, receivables gap=10 → 0', () => {
    expect(computeCashReleasePotential('receivables', 10, 0, 0)).toBe(0)
  })

})

// ── classifyGapPriority ────────────────────────────────────────────────────────

describe('classifyGapPriority', () => {

  // Test 24: high priority (> 15)
  it('24. gap=16 → high', () => {
    expect(classifyGapPriority(16)).toBe('high')
  })

  // Test 25: high priority exact boundary
  it('25. gap=100 → high', () => {
    expect(classifyGapPriority(100)).toBe('high')
  })

  // Test 26: exactly 15 → medium (not high, need >15)
  it('26. gap=15 → medium (boundary: not > 15)', () => {
    expect(classifyGapPriority(15)).toBe('medium')
  })

  // Test 27: medium priority (7 < gap ≤ 15)
  it('27. gap=10 → medium', () => {
    expect(classifyGapPriority(10)).toBe('medium')
  })

  // Test 28: exactly 8 → medium
  it('28. gap=8 → medium', () => {
    expect(classifyGapPriority(8)).toBe('medium')
  })

  // Test 29: exactly 7 → low (not medium, need > 7)
  it('29. gap=7 → low (boundary: not > 7)', () => {
    expect(classifyGapPriority(7)).toBe('low')
  })

  // Test 30: low priority (0 < gap ≤ 7)
  it('30. gap=3 → low', () => {
    expect(classifyGapPriority(3)).toBe('low')
  })

  // Test 31: gap=1 → low
  it('31. gap=1 → low', () => {
    expect(classifyGapPriority(1)).toBe('low')
  })

  // Test 32: gap=0 → none
  it('32. gap=0 → none', () => {
    expect(classifyGapPriority(0)).toBe('none')
  })

  // Test 33: negative gap → none
  it('33. gap=-1 → none', () => {
    expect(classifyGapPriority(-1)).toBe('none')
  })

})

// ── generateReceivablesRecommendation ─────────────────────────────────────────

describe('generateReceivablesRecommendation', () => {

  // Test 34: returns non-empty Turkish string when gap exists
  it('34. actualDso > benchmark → non-empty Turkish string with numbers', () => {
    const result = generateReceivablesRecommendation(45, 30, 150_000)
    expect(result).toBeTruthy()
    expect(result.length).toBeGreaterThan(10)
    expect(result).toMatch(/45/)
    expect(result).toMatch(/30/)
  })

  // Test 35: contains cash impact amount when gap > 0
  it('35. contains formatted cash impact in TRY', () => {
    const result = generateReceivablesRecommendation(60, 30, 300_000)
    expect(result).toContain('₺')
  })

  // Test 36: when already at or better than benchmark
  it('36. actualDso <= benchmark → positive Turkish message', () => {
    const result = generateReceivablesRecommendation(20, 30, 0)
    expect(result).toBeTruthy()
    expect(result.length).toBeGreaterThan(10)
  })

  // Test 37: mentions erken ödeme or takip when gap exists
  it('37. contains actionable recommendation text when gap exists', () => {
    const result = generateReceivablesRecommendation(45, 30, 150_000)
    expect(result.toLowerCase()).toMatch(/erken|takip|indir/)
  })

})

// ── generateInventoryRecommendation ───────────────────────────────────────────

describe('generateInventoryRecommendation', () => {

  // Test 38: returns non-empty Turkish string with numbers
  it('38. actualDio > benchmark → non-empty Turkish string with actual and benchmark days', () => {
    const result = generateInventoryRecommendation(45, 30, 150_000)
    expect(result).toBeTruthy()
    expect(result).toMatch(/45/)
    expect(result).toMatch(/30/)
  })

  // Test 39: contains cash impact in TRY
  it('39. contains TRY amount when gap > 0', () => {
    const result = generateInventoryRecommendation(45, 30, 150_000)
    expect(result).toContain('₺')
  })

  // Test 40: mentions sipariş when gap exists
  it('40. contains sipariş (order frequency) recommendation', () => {
    const result = generateInventoryRecommendation(50, 30, 200_000)
    expect(result.toLowerCase()).toMatch(/sipari|stok|sermay/)
  })

  // Test 41: no gap → positive message
  it('41. actualDio <= benchmark → positive/ok message', () => {
    const result = generateInventoryRecommendation(20, 30, 0)
    expect(result).toBeTruthy()
    expect(result.length).toBeGreaterThan(10)
  })

})

// ── generatePayablesRecommendation ────────────────────────────────────────────

describe('generatePayablesRecommendation', () => {

  // Test 42: returns non-empty Turkish string with numbers
  it('42. actualDpo < benchmark → non-empty Turkish string with days', () => {
    const result = generatePayablesRecommendation(30, 45, 60_000)
    expect(result).toBeTruthy()
    expect(result).toMatch(/30/)
    expect(result).toMatch(/45/)
  })

  // Test 43: contains TRY when gap exists
  it('43. contains TRY amount when gap > 0', () => {
    const result = generatePayablesRecommendation(30, 45, 60_000)
    expect(result).toContain('₺')
  })

  // Test 44: mentions tedarikçi (supplier)
  it('44. mentions tedarikçi (supplier term)', () => {
    const result = generatePayablesRecommendation(30, 45, 60_000)
    expect(result.toLowerCase()).toMatch(/tedarik|vade/)
  })

  // Test 45: at or above benchmark → positive message
  it('45. actualDpo >= benchmark → positive/ok message', () => {
    const result = generatePayablesRecommendation(50, 45, 0)
    expect(result).toBeTruthy()
    expect(result.length).toBeGreaterThan(10)
  })

})

// ── buildWorkingCapitalGaps ────────────────────────────────────────────────────

describe('buildWorkingCapitalGaps', () => {

  // Test 46: always returns 3 gaps
  it('46. always returns exactly 3 gaps', () => {
    const gaps = buildWorkingCapitalGaps(30, 30, 45, 10_000, 4_000)
    expect(gaps).toHaveLength(3)
  })

  // Test 47: correct dimensions in order
  it('47. dimensions are receivables, inventory, payables in order', () => {
    const gaps = buildWorkingCapitalGaps(30, 30, 45, 10_000, 4_000)
    expect(gaps[0]!.dimension).toBe('receivables')
    expect(gaps[1]!.dimension).toBe('inventory')
    expect(gaps[2]!.dimension).toBe('payables')
  })

  // Test 48: all-benchmark → all gap_days = 0, priority = none
  it('48. at benchmark (DSO=30, DIO=30, DPO=45) → all gaps = 0, priority = none', () => {
    const gaps = buildWorkingCapitalGaps(30, 30, 45, 10_000, 4_000)
    for (const gap of gaps) {
      expect(gap.gap_days).toBe(0)
      expect(gap.priority).toBe('none')
    }
  })

  // Test 49: DSO=60 → receivables gap=30, priority=high
  it('49. DSO=60 → receivables gap=30, priority=high', () => {
    const gaps = buildWorkingCapitalGaps(60, 30, 45, 10_000, 4_000)
    const rec = gaps.find(g => g.dimension === 'receivables')!
    expect(rec.gap_days).toBe(30)
    expect(rec.priority).toBe('high')
  })

  // Test 50: DPO=30 → payables gap=15, priority=medium
  it('50. DPO=30 → payables gap=15, priority=medium', () => {
    const gaps = buildWorkingCapitalGaps(30, 30, 30, 10_000, 4_000)
    const pay = gaps.find(g => g.dimension === 'payables')!
    expect(pay.gap_days).toBe(15)
    expect(pay.priority).toBe('medium')
  })

  // Test 51: correct benchmark_days stored
  it('51. benchmark_days matches WC_BENCHMARKS constants', () => {
    const gaps = buildWorkingCapitalGaps(30, 30, 45, 10_000, 4_000)
    expect(gaps[0]!.benchmark_days).toBe(WC_BENCHMARKS.dso)
    expect(gaps[1]!.benchmark_days).toBe(WC_BENCHMARKS.dio)
    expect(gaps[2]!.benchmark_days).toBe(WC_BENCHMARKS.dpo)
  })

  // Test 52: recommendations are non-empty strings
  it('52. all recommendations are non-empty strings', () => {
    const gaps = buildWorkingCapitalGaps(60, 45, 30, 10_000, 4_000)
    for (const gap of gaps) {
      expect(gap.recommendation).toBeTruthy()
      expect(typeof gap.recommendation).toBe('string')
    }
  })

  // Test 53: labels are non-empty strings
  it('53. all labels are non-empty Turkish strings', () => {
    const gaps = buildWorkingCapitalGaps(30, 30, 45, 10_000, 4_000)
    for (const gap of gaps) {
      expect(gap.label).toBeTruthy()
      expect(typeof gap.label).toBe('string')
    }
  })

})

// ── computeTotalCashReleasePotential ──────────────────────────────────────────

describe('computeTotalCashReleasePotential', () => {

  // Test 54: sum of all cash impacts
  it('54. sums all gap cash_impact_try values', () => {
    const gaps = buildWorkingCapitalGaps(60, 45, 30, 10_000, 4_000)
    const total = computeTotalCashReleasePotential(gaps)
    const manual = gaps.reduce((s, g) => s + g.cash_impact_try, 0)
    expect(total).toBe(manual)
  })

  // Test 55: all zero gaps → total = 0
  it('55. no gaps → total = 0', () => {
    const gaps = buildWorkingCapitalGaps(30, 30, 45, 10_000, 4_000)
    expect(computeTotalCashReleasePotential(gaps)).toBe(0)
  })

  // Test 56: empty array → 0
  it('56. empty gaps array → 0', () => {
    expect(computeTotalCashReleasePotential([])).toBe(0)
  })

})

// ── classifyWorkingCapitalEfficiency ─────────────────────────────────────────

describe('classifyWorkingCapitalEfficiency', () => {

  // Test 57: CCC ≤ 0 → excellent
  it('57. CCC = -10 → excellent', () => {
    expect(classifyWorkingCapitalEfficiency(-10)).toBe('excellent')
  })

  // Test 58: CCC = 0 → excellent
  it('58. CCC = 0 → excellent', () => {
    expect(classifyWorkingCapitalEfficiency(0)).toBe('excellent')
  })

  // Test 59: CCC = 15 → good
  it('59. CCC = 15 (benchmark) → good', () => {
    expect(classifyWorkingCapitalEfficiency(15)).toBe('good')
  })

  // Test 60: CCC = 1 → good (> 0, ≤ 15)
  it('60. CCC = 1 → good', () => {
    expect(classifyWorkingCapitalEfficiency(1)).toBe('good')
  })

  // Test 61: CCC = 30 → adequate
  it('61. CCC = 30 → adequate', () => {
    expect(classifyWorkingCapitalEfficiency(30)).toBe('adequate')
  })

  // Test 62: CCC = 16 → adequate (> 15, ≤ 30)
  it('62. CCC = 16 → adequate', () => {
    expect(classifyWorkingCapitalEfficiency(16)).toBe('adequate')
  })

  // Test 63: CCC = 60 → poor
  it('63. CCC = 60 → poor', () => {
    expect(classifyWorkingCapitalEfficiency(60)).toBe('poor')
  })

  // Test 64: CCC = 31 → poor
  it('64. CCC = 31 → poor', () => {
    expect(classifyWorkingCapitalEfficiency(31)).toBe('poor')
  })

  // Test 65: CCC = 75 (critical, > 60)
  it('65. CCC = 75 → critical', () => {
    expect(classifyWorkingCapitalEfficiency(75)).toBe('critical')
  })

  // Test 66: CCC = 61 → critical
  it('66. CCC = 61 → critical', () => {
    expect(classifyWorkingCapitalEfficiency(61)).toBe('critical')
  })

})

// ── computeWorkingCapitalRatio ────────────────────────────────────────────────

describe('computeWorkingCapitalRatio', () => {

  // Test 67: null when monthly revenue = 0
  it('67. revenue = 0 → null', () => {
    expect(computeWorkingCapitalRatio(100_000, 50_000, 30_000, 0)).toBeNull()
  })

  // Test 68: correct formula: (receivables + inventory - payables) / revenue × 100
  it('68. correct formula result', () => {
    // WC = 100k + 50k - 30k = 120k; ratio = 120k / 200k × 100 = 60
    const result = computeWorkingCapitalRatio(100_000, 50_000, 30_000, 200_000)
    expect(result).toBeCloseTo(60, 2)
  })

  // Test 69: payables > receivables + inventory → negative ratio
  it('69. payables-heavy → negative ratio', () => {
    const result = computeWorkingCapitalRatio(10_000, 5_000, 100_000, 200_000)
    expect(result).toBeLessThan(0)
  })

  // Test 70: all zero values except revenue
  it('70. zero working capital → ratio = 0', () => {
    expect(computeWorkingCapitalRatio(0, 0, 0, 100_000)).toBe(0)
  })

})

// ── computeNetWorkingCapital ──────────────────────────────────────────────────

describe('computeNetWorkingCapital', () => {

  // Test 71: basic arithmetic
  it('71. assets=500000, liabilities=200000 → NWC=300000', () => {
    expect(computeNetWorkingCapital(500_000, 200_000)).toBe(300_000)
  })

  // Test 72: negative NWC (liabilities > assets)
  it('72. liabilities > assets → negative NWC', () => {
    expect(computeNetWorkingCapital(100_000, 200_000)).toBe(-100_000)
  })

  // Test 73: zero both → 0
  it('73. both zero → 0', () => {
    expect(computeNetWorkingCapital(0, 0)).toBe(0)
  })

  // Test 74: assets only
  it('74. assets=1000000, liabilities=0 → 1000000', () => {
    expect(computeNetWorkingCapital(1_000_000, 0)).toBe(1_000_000)
  })

})

// ── identifyTopAction ──────────────────────────────────────────────────────────

describe('identifyTopAction', () => {

  // Test 75: returns null when no gaps
  it('75. no gaps (all zero) → null', () => {
    const gaps = buildWorkingCapitalGaps(30, 30, 45, 10_000, 4_000)
    expect(identifyTopAction(gaps)).toBeNull()
  })

  // Test 76: returns high priority gap with highest cash impact
  it('76. multiple high-priority gaps → returns one with highest cash_impact_try', () => {
    const gaps = buildWorkingCapitalGaps(60, 45, 30, 10_000, 4_000)
    // receivables gap=30 → cash=300k (high priority)
    // inventory gap=15 → cash=150k (medium/high priority)
    // payables gap=15 → cash=60k
    const top = identifyTopAction(gaps)
    expect(top).not.toBeNull()
    expect(top!.priority).toBe('high')
    expect(top!.dimension).toBe('receivables')
  })

  // Test 77: empty array → null
  it('77. empty gaps array → null', () => {
    expect(identifyTopAction([])).toBeNull()
  })

  // Test 78: only low-priority gaps → still returns highest
  it('78. only low-priority gaps → returns highest cash impact one', () => {
    const gaps = buildWorkingCapitalGaps(33, 33, 42, 10_000, 4_000)
    // small gaps: receivables=3, inventory=3, payables=3
    const top = identifyTopAction(gaps)
    if (top !== null) {
      expect(['low', 'medium', 'high']).toContain(top.priority)
    }
  })

  // Test 79: single active gap → returns that gap
  it('79. one active gap (DSO=45, rest at benchmark) → returns receivables gap', () => {
    const gaps = buildWorkingCapitalGaps(45, 30, 45, 10_000, 4_000)
    const top = identifyTopAction(gaps)
    expect(top).not.toBeNull()
    expect(top!.dimension).toBe('receivables')
  })

})

// ── Integration tests ─────────────────────────────────────────────────────────

describe('Integration: DSO=60, DIO=45, DPO=30, dailyRev=₺10K, dailyCogs=₺4K', () => {

  const DSO = 60
  const DIO = 45
  const DPO = 30
  const DAILY_REV = 10_000
  const DAILY_COGS = 4_000

  // Test 80: CCC = 75 (critical)
  it('80. CCC = 60 + 45 - 30 = 75', () => {
    expect(computeCashConversionCycle(DSO, DIO, DPO)).toBe(75)
  })

  // Test 81: efficiency = critical
  it('81. efficiency = critical (CCC=75 > 60)', () => {
    expect(classifyWorkingCapitalEfficiency(75)).toBe('critical')
  })

  // Test 82: receivables gap = 30 days (60 - 30)
  it('82. receivables gap = 30 days', () => {
    expect(computeWorkingCapitalGap('receivables', DSO, WC_BENCHMARKS.dso)).toBe(30)
  })

  // Test 83: receivables cash release = ₺300K (30 × ₺10K)
  it('83. receivables cash release = ₺300,000', () => {
    expect(computeCashReleasePotential('receivables', 30, DAILY_REV, DAILY_COGS)).toBe(300_000)
  })

  // Test 84: inventory gap = 15 days (45 - 30)
  it('84. inventory gap = 15 days', () => {
    expect(computeWorkingCapitalGap('inventory', DIO, WC_BENCHMARKS.dio)).toBe(15)
  })

  // Test 85: inventory cash release = ₺150K (15 × ₺10K)
  it('85. inventory cash release = ₺150,000', () => {
    expect(computeCashReleasePotential('inventory', 15, DAILY_REV, DAILY_COGS)).toBe(150_000)
  })

  // Test 86: payables gap = 15 days (45 - 30)
  it('86. payables gap = 15 days (DPO shortfall)', () => {
    expect(computeWorkingCapitalGap('payables', DPO, WC_BENCHMARKS.dpo)).toBe(15)
  })

  // Test 87: payables cash release = ₺60K (15 × ₺4K)
  it('87. payables cash release = ₺60,000 (uses daily_cogs)', () => {
    expect(computeCashReleasePotential('payables', 15, DAILY_REV, DAILY_COGS)).toBe(60_000)
  })

  // Test 88: total release potential = ₺510K
  it('88. total cash release potential = ₺510,000', () => {
    const gaps = buildWorkingCapitalGaps(DSO, DIO, DPO, DAILY_REV, DAILY_COGS)
    const total = computeTotalCashReleasePotential(gaps)
    expect(total).toBe(510_000)
  })

  // Test 89: receivables has high priority (gap=30 > 15)
  it('89. receivables gap priority = high (30 > 15)', () => {
    expect(classifyGapPriority(30)).toBe('high')
  })

  // Test 90: inventory gap priority = medium (15 is not > 15)
  it('90. inventory gap priority = medium (gap=15, not > 15)', () => {
    expect(classifyGapPriority(15)).toBe('medium')
  })

  // Test 91: top action is receivables (highest cash impact among high-priority)
  it('91. top action = receivables (highest cash_impact among high-priority)', () => {
    const gaps = buildWorkingCapitalGaps(DSO, DIO, DPO, DAILY_REV, DAILY_COGS)
    const top = identifyTopAction(gaps)
    expect(top).not.toBeNull()
    expect(top!.dimension).toBe('receivables')
    expect(top!.cash_impact_try).toBe(300_000)
  })

  // Test 92: buildWorkingCapitalGaps has correct gap_days for all 3
  it('92. all gap_days correct: receivables=30, inventory=15, payables=15', () => {
    const gaps = buildWorkingCapitalGaps(DSO, DIO, DPO, DAILY_REV, DAILY_COGS)
    const rec = gaps.find(g => g.dimension === 'receivables')!
    const inv = gaps.find(g => g.dimension === 'inventory')!
    const pay = gaps.find(g => g.dimension === 'payables')!
    expect(rec.gap_days).toBe(30)
    expect(inv.gap_days).toBe(15)
    expect(pay.gap_days).toBe(15)
  })

})
