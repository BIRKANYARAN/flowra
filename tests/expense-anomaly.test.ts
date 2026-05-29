/**
 * Tests for lib/services/finance/expense-anomaly.service.ts
 * All pure functions — no DB calls, no side effects.
 * Run with: npx vitest run tests/expense-anomaly.test.ts
 */

import { describe, it, expect } from 'vitest'
import {
  computeMean,
  computeStdDev,
  computeZScore,
  computeIQRBounds,
  classifyAnomalySeverity,
  isPotentialDuplicate,
} from '../lib/services/finance/expense-anomaly.service'

// ═══════════════════════════════════════════════════════════════════════════
// computeMean
// ═══════════════════════════════════════════════════════════════════════════

describe('computeMean', () => {
  it('1. returns correct mean for normal array', () => {
    expect(computeMean([10, 20, 30])).toBeCloseTo(20)
  })

  it('2. returns 0 for empty array', () => {
    expect(computeMean([])).toBe(0)
  })

  it('3. returns the value itself for single element', () => {
    expect(computeMean([42])).toBe(42)
  })

  it('4. handles all identical values', () => {
    expect(computeMean([5, 5, 5, 5])).toBe(5)
  })

  it('5. handles floating point values', () => {
    expect(computeMean([1.5, 2.5, 3.0])).toBeCloseTo(7 / 3)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// computeStdDev
// ═══════════════════════════════════════════════════════════════════════════

describe('computeStdDev', () => {
  it('6. computes population stddev correctly', () => {
    // mean=3, deviations squared: 4,1,0,1,4 → variance=2 → stddev≈1.414
    const values = [1, 2, 3, 4, 5]
    const mean = computeMean(values)
    expect(computeStdDev(values, mean)).toBeCloseTo(Math.sqrt(2))
  })

  it('7. returns 0 for empty array', () => {
    expect(computeStdDev([], 0)).toBe(0)
  })

  it('8. returns 0 for single-element array', () => {
    expect(computeStdDev([99], 99)).toBe(0)
  })

  it('9. returns 0 for all identical values', () => {
    expect(computeStdDev([7, 7, 7], 7)).toBe(0)
  })

  it('10. returns positive value for varied array', () => {
    const values = [100, 200, 300, 400]
    const mean = computeMean(values)
    expect(computeStdDev(values, mean)).toBeGreaterThan(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// computeZScore
// ═══════════════════════════════════════════════════════════════════════════

describe('computeZScore', () => {
  it('11. computes z-score correctly for value above mean', () => {
    // mean=10, stdDev=2, value=12 → z=1
    expect(computeZScore(12, 10, 2)).toBeCloseTo(1)
  })

  it('12. computes z-score correctly for value below mean', () => {
    // mean=10, stdDev=2, value=6 → z=-2
    expect(computeZScore(6, 10, 2)).toBeCloseTo(-2)
  })

  it('13. returns 0 when value equals mean', () => {
    expect(computeZScore(10, 10, 5)).toBe(0)
  })

  it('14. returns null when stdDev is 0', () => {
    expect(computeZScore(10, 10, 0)).toBeNull()
  })

  it('15. returns null when stdDev is 0 even if value differs from mean', () => {
    expect(computeZScore(20, 10, 0)).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// computeIQRBounds
// ═══════════════════════════════════════════════════════════════════════════

describe('computeIQRBounds', () => {
  it('16. computes IQR bounds for normal dataset of 4+ values', () => {
    const result = computeIQRBounds([1, 2, 3, 4])
    expect(result).not.toBeNull()
    expect(result!.iqr).toBeGreaterThan(0)
    expect(result!.upper_bound).toBeGreaterThan(result!.q3)
    expect(result!.lower_bound).toBeLessThan(result!.q1)
  })

  it('17. returns null for fewer than 4 values (3 values)', () => {
    expect(computeIQRBounds([1, 2, 3])).toBeNull()
  })

  it('18. returns null for empty array', () => {
    expect(computeIQRBounds([])).toBeNull()
  })

  it('19. upper_bound = Q3 + 1.5 × IQR', () => {
    const values = [10, 20, 30, 40, 50, 60, 70, 80]
    const result = computeIQRBounds(values)
    expect(result).not.toBeNull()
    expect(result!.upper_bound).toBeCloseTo(result!.q3 + 1.5 * result!.iqr)
  })

  it('20. lower_bound = Q1 - 1.5 × IQR', () => {
    const values = [10, 20, 30, 40, 50, 60, 70, 80]
    const result = computeIQRBounds(values)
    expect(result).not.toBeNull()
    expect(result!.lower_bound).toBeCloseTo(result!.q1 - 1.5 * result!.iqr)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// classifyAnomalySeverity
// ═══════════════════════════════════════════════════════════════════════════

describe('classifyAnomalySeverity', () => {
  const noBounds = null

  it('21. classifies high severity when |z_score| > 3', () => {
    expect(classifyAnomalySeverity(3.5, 100, noBounds)).toBe('high')
    expect(classifyAnomalySeverity(-3.5, 100, noBounds)).toBe('high')
  })

  it('22. classifies medium severity when |z_score| is 2–3', () => {
    expect(classifyAnomalySeverity(2.5, 100, noBounds)).toBe('medium')
  })

  it('23. classifies low severity when |z_score| is 1.5–2', () => {
    expect(classifyAnomalySeverity(1.7, 100, noBounds)).toBe('low')
  })

  it('24. classifies none for |z_score| <= 1.5', () => {
    expect(classifyAnomalySeverity(1.0, 100, noBounds)).toBe('none')
  })

  it('25. IQR fallback: high when value > upper_bound × 1.5', () => {
    const bounds = { lower_bound: 0, upper_bound: 100 }
    // value=160 > 150 (100 × 1.5)
    expect(classifyAnomalySeverity(null, 160, bounds)).toBe('high')
  })

  it('26. IQR fallback: medium when value > upper_bound but <= upper_bound × 1.5', () => {
    const bounds = { lower_bound: 0, upper_bound: 100 }
    // value=110 > 100 but < 150
    expect(classifyAnomalySeverity(null, 110, bounds)).toBe('medium')
  })

  it('27. IQR fallback: none when value <= upper_bound', () => {
    const bounds = { lower_bound: 0, upper_bound: 100 }
    expect(classifyAnomalySeverity(null, 80, bounds)).toBe('none')
  })

  it('28. returns none when z_score is null and iqrBounds is null', () => {
    expect(classifyAnomalySeverity(null, 500, null)).toBe('none')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// isPotentialDuplicate
// ═══════════════════════════════════════════════════════════════════════════

describe('isPotentialDuplicate', () => {
  const base = {
    supplier_name: 'Acme Corp',
    amount_try: 1000,
    created_at: '2026-01-10T12:00:00Z',
  }

  it('29. returns true for exact match same supplier + same amount within window', () => {
    const others = [
      {
        supplier_name: 'Acme Corp',
        amount_try: 1000,
        created_at: '2026-01-12T12:00:00Z', // 2 days later — within 7 days
      },
    ]
    expect(isPotentialDuplicate(base, others)).toBe(true)
  })

  it('30. returns true for amount within ±1 TRY tolerance', () => {
    const others = [
      {
        supplier_name: 'Acme Corp',
        amount_try: 1000.5,
        created_at: '2026-01-11T12:00:00Z',
      },
    ]
    expect(isPotentialDuplicate(base, others)).toBe(true)
  })

  it('31. returns false for different supplier', () => {
    const others = [
      {
        supplier_name: 'Other Corp',
        amount_try: 1000,
        created_at: '2026-01-11T12:00:00Z',
      },
    ]
    expect(isPotentialDuplicate(base, others)).toBe(false)
  })

  it('32. returns false for same supplier but amount difference > 1 TRY', () => {
    const others = [
      {
        supplier_name: 'Acme Corp',
        amount_try: 1002, // > 1 TRY difference
        created_at: '2026-01-11T12:00:00Z',
      },
    ]
    expect(isPotentialDuplicate(base, others)).toBe(false)
  })

  it('33. returns false when the matching entry is outside the window', () => {
    const others = [
      {
        supplier_name: 'Acme Corp',
        amount_try: 1000,
        created_at: '2026-01-01T12:00:00Z', // 9 days before — outside 7-day window
      },
    ]
    expect(isPotentialDuplicate(base, others)).toBe(false)
  })

  it('34. returns false when expense has no supplier_name', () => {
    const noSupplier = { ...base, supplier_name: null }
    const others = [
      {
        supplier_name: null as string | null,
        amount_try: 1000,
        created_at: '2026-01-11T12:00:00Z',
      },
    ]
    expect(isPotentialDuplicate(noSupplier, others)).toBe(false)
  })

  it('35. returns false for empty others array', () => {
    expect(isPotentialDuplicate(base, [])).toBe(false)
  })

  it('36. respects custom windowDays parameter — outside short window', () => {
    const others = [
      {
        supplier_name: 'Acme Corp',
        amount_try: 1000,
        created_at: '2026-01-18T12:00:00Z', // 8 days later
      },
    ]
    // Default window is 7 days — should miss
    expect(isPotentialDuplicate(base, others, 7)).toBe(false)
  })

  it('37. respects custom windowDays parameter — within wider window', () => {
    const others = [
      {
        supplier_name: 'Acme Corp',
        amount_try: 1000,
        created_at: '2026-01-18T12:00:00Z', // 8 days later
      },
    ]
    // Custom window of 10 days — should match
    expect(isPotentialDuplicate(base, others, 10)).toBe(true)
  })

  it('38. is case-insensitive for supplier_name comparison', () => {
    const others = [
      {
        supplier_name: 'acme corp', // lowercase
        amount_try: 1000,
        created_at: '2026-01-11T12:00:00Z',
      },
    ]
    expect(isPotentialDuplicate(base, others)).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// computeMean — additional edge cases
// ═══════════════════════════════════════════════════════════════════════════

describe('computeMean additional', () => {
  it('39. two elements', () => {
    expect(computeMean([4, 8])).toBeCloseTo(6)
  })

  it('40. large values', () => {
    expect(computeMean([1_000_000, 2_000_000])).toBeCloseTo(1_500_000)
  })

  it('41. negative values', () => {
    expect(computeMean([-10, -20, -30])).toBeCloseTo(-20)
  })

  it('42. mixed positive and negative', () => {
    expect(computeMean([-50, 50])).toBeCloseTo(0)
  })

  it('43. ten identical values', () => {
    const vals = Array(10).fill(100)
    expect(computeMean(vals)).toBe(100)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// computeStdDev — additional edge cases
// ═══════════════════════════════════════════════════════════════════════════

describe('computeStdDev additional', () => {
  it('44. two-element array', () => {
    // mean=5, deviations: ±5, variance=25, stddev=5
    expect(computeStdDev([0, 10], 5)).toBeCloseTo(5)
  })

  it('45. known dataset: [2,4,4,4,5,5,7,9] population stddev = 2', () => {
    const mean = computeMean([2, 4, 4, 4, 5, 5, 7, 9])
    expect(computeStdDev([2, 4, 4, 4, 5, 5, 7, 9], mean)).toBeCloseTo(2, 4)
  })

  it('46. large spread', () => {
    const vals = [0, 100, 200]
    const mean = computeMean(vals)
    expect(computeStdDev(vals, mean)).toBeGreaterThan(0)
  })

  it('47. ten identical values → stddev = 0', () => {
    const vals = Array(10).fill(500)
    expect(computeStdDev(vals, 500)).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// computeZScore — additional edge cases
// ═══════════════════════════════════════════════════════════════════════════

describe('computeZScore additional', () => {
  it('48. large positive z-score', () => {
    // value=50, mean=10, stdDev=5 → z=8
    expect(computeZScore(50, 10, 5)).toBeCloseTo(8)
  })

  it('49. large negative z-score', () => {
    expect(computeZScore(-10, 10, 5)).toBeCloseTo(-4)
  })

  it('50. z-score = 3 (boundary)', () => {
    expect(computeZScore(16, 10, 2)).toBeCloseTo(3)
  })

  it('51. z-score = -3 (boundary)', () => {
    expect(computeZScore(4, 10, 2)).toBeCloseTo(-3)
  })

  it('52. very small stdDev with value at mean → z=0', () => {
    expect(computeZScore(100, 100, 0.001)).toBeCloseTo(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// computeIQRBounds — additional edge cases
// ═══════════════════════════════════════════════════════════════════════════

describe('computeIQRBounds additional', () => {
  it('53. returns null for 1 value', () => {
    expect(computeIQRBounds([100])).toBeNull()
  })

  it('54. returns null for 2 values', () => {
    expect(computeIQRBounds([100, 200])).toBeNull()
  })

  it('55. returns null for exactly 3 values', () => {
    expect(computeIQRBounds([1, 2, 3])).toBeNull()
  })

  it('56. returns non-null for exactly 4 values', () => {
    expect(computeIQRBounds([1, 2, 3, 4])).not.toBeNull()
  })

  it('57. upper_bound > q3 for any real dataset', () => {
    const result = computeIQRBounds([10, 20, 30, 40, 50])!
    expect(result.upper_bound).toBeGreaterThan(result.q3)
  })

  it('58. lower_bound < q1 for any real dataset', () => {
    const result = computeIQRBounds([10, 20, 30, 40, 50])!
    expect(result.lower_bound).toBeLessThan(result.q1)
  })

  it('59. IQR = q3 - q1', () => {
    const result = computeIQRBounds([5, 10, 15, 20, 25, 30])!
    expect(result.iqr).toBeCloseTo(result.q3 - result.q1, 4)
  })

  it('60. all identical values → iqr = 0', () => {
    const result = computeIQRBounds([100, 100, 100, 100, 100])!
    expect(result.iqr).toBeCloseTo(0, 5)
    expect(result.upper_bound).toBeCloseTo(result.q3, 5)
  })

  it('61. 10-element dataset has valid bounds', () => {
    const result = computeIQRBounds([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])!
    expect(result).not.toBeNull()
    expect(result.upper_bound).toBeGreaterThan(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// classifyAnomalySeverity — additional edge cases
// ═══════════════════════════════════════════════════════════════════════════

describe('classifyAnomalySeverity additional', () => {
  const noBounds = null

  it('62. z=3.0 exactly is NOT > 3 → medium (z>2 is true)', () => {
    expect(classifyAnomalySeverity(3.0, 100, noBounds)).toBe('medium')
  })

  it('63. z=3.0001 → high', () => {
    expect(classifyAnomalySeverity(3.0001, 100, noBounds)).toBe('high')
  })

  it('64. z=2.0 exactly is NOT > 2 → low (z>1.5 is true)', () => {
    expect(classifyAnomalySeverity(2.0, 100, noBounds)).toBe('low')
  })

  it('65. z=1.5 exactly is NOT > 1.5 → none', () => {
    expect(classifyAnomalySeverity(1.5, 100, noBounds)).toBe('none')
  })

  it('66. z=1.5001 → low', () => {
    expect(classifyAnomalySeverity(1.5001, 100, noBounds)).toBe('low')
  })

  it('67. negative z=-3.5 → high (abs = 3.5)', () => {
    expect(classifyAnomalySeverity(-3.5, 100, noBounds)).toBe('high')
  })

  it('68. negative z=-2.5 → medium', () => {
    expect(classifyAnomalySeverity(-2.5, 100, noBounds)).toBe('medium')
  })

  it('69. negative z=-1.7 → low', () => {
    expect(classifyAnomalySeverity(-1.7, 100, noBounds)).toBe('low')
  })

  it('70. IQR: value exactly at upper_bound is NOT > upper_bound → none from IQR check', () => {
    const bounds = { lower_bound: 0, upper_bound: 100 }
    expect(classifyAnomalySeverity(null, 100, bounds)).toBe('none')
  })

  it('71. IQR: value exactly at upper_bound × 1.5 is NOT > upper_bound×1.5 → medium', () => {
    const bounds = { lower_bound: 0, upper_bound: 100 }
    // 150 is not > 150 → medium? No: check says > ub → medium. 150 is not > 150. → none?
    // Actually 150 > upper_bound(100) → medium. But 150 > 150? No → not high.
    expect(classifyAnomalySeverity(null, 150, bounds)).toBe('medium')
  })

  it('72. z=null and iqrBounds non-null but value below lower_bound → none (below bounds not flagged)', () => {
    const bounds = { lower_bound: 50, upper_bound: 200 }
    // value=10 < lower_bound → no rule triggers → none
    expect(classifyAnomalySeverity(null, 10, bounds)).toBe('none')
  })

  it('73. combined: z-score high takes priority when both trigger', () => {
    const bounds = { lower_bound: 0, upper_bound: 100 }
    // z=3.5 → high; value=200 > 100×1.5=150 → also high; result should be high
    expect(classifyAnomalySeverity(3.5, 200, bounds)).toBe('high')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// isPotentialDuplicate — additional edge cases
// ═══════════════════════════════════════════════════════════════════════════

describe('isPotentialDuplicate additional', () => {
  const base = {
    supplier_name: 'Tech Supplier',
    amount_try: 5000,
    created_at: '2026-03-15T10:00:00Z',
  }

  it('74. returns false when other has null supplier', () => {
    const others = [{
      supplier_name: null as string | null,
      amount_try: 5000,
      created_at: '2026-03-16T10:00:00Z',
    }]
    expect(isPotentialDuplicate(base, others)).toBe(false)
  })

  it('75. amount difference of exactly 1.0 TRY → still duplicate (|diff| <= 1)', () => {
    const others = [{
      supplier_name: 'Tech Supplier',
      amount_try: 5001,  // exactly 1 TRY difference
      created_at: '2026-03-16T10:00:00Z',
    }]
    expect(isPotentialDuplicate(base, others)).toBe(true)
  })

  it('76. amount difference of 1.01 TRY → not duplicate', () => {
    const others = [{
      supplier_name: 'Tech Supplier',
      amount_try: 5001.01,
      created_at: '2026-03-16T10:00:00Z',
    }]
    expect(isPotentialDuplicate(base, others)).toBe(false)
  })

  it('77. same day duplicate', () => {
    const others = [{
      supplier_name: 'Tech Supplier',
      amount_try: 5000,
      created_at: '2026-03-15T18:00:00Z',
    }]
    expect(isPotentialDuplicate(base, others)).toBe(true)
  })

  it('78. exactly 7 days later (window boundary)', () => {
    // 7 days = 604800000 ms; base is 2026-03-15; +7 days = 2026-03-22
    const others = [{
      supplier_name: 'Tech Supplier',
      amount_try: 5000,
      created_at: '2026-03-22T10:00:00Z',
    }]
    // |diff| = 7 * 86400000 ms exactly = windowMs; NOT > windowMs → duplicate
    expect(isPotentialDuplicate(base, others)).toBe(true)
  })

  it('79. supplier names with different case and whitespace (trimmed)', () => {
    const others = [{
      supplier_name: '  TECH SUPPLIER  ',
      amount_try: 5000,
      created_at: '2026-03-16T10:00:00Z',
    }]
    expect(isPotentialDuplicate(base, others)).toBe(true)
  })

  it('80. multiple others — only one matches', () => {
    const others = [
      { supplier_name: 'Different Corp', amount_try: 5000, created_at: '2026-03-16T10:00:00Z' },
      { supplier_name: 'Tech Supplier', amount_try: 9999, created_at: '2026-03-16T10:00:00Z' },
      { supplier_name: 'Tech Supplier', amount_try: 5000, created_at: '2026-03-16T10:00:00Z' },
    ]
    expect(isPotentialDuplicate(base, others)).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// computeMean — formula verification
// ═══════════════════════════════════════════════════════════════════════════

describe('computeMean — formula verification', () => {
  it('81. sum / count: [3, 7] → 10/2 = 5', () => {
    expect(computeMean([3, 7])).toBe(5)
  })

  it('82. [0, 0, 0] → 0', () => {
    expect(computeMean([0, 0, 0])).toBe(0)
  })

  it('83. fractional result: [1, 2] → 1.5', () => {
    expect(computeMean([1, 2])).toBeCloseTo(1.5, 5)
  })

  it('84. single large value: [1_000_000] → 1_000_000', () => {
    expect(computeMean([1_000_000])).toBe(1_000_000)
  })

  it('85. five elements sum: [10, 20, 30, 40, 50] → 150/5 = 30', () => {
    expect(computeMean([10, 20, 30, 40, 50])).toBe(30)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// computeStdDev — uniform values always give 0
// ═══════════════════════════════════════════════════════════════════════════

describe('computeStdDev — uniform values', () => {
  it('86. [100, 100] → stdDev = 0', () => {
    expect(computeStdDev([100, 100], 100)).toBe(0)
  })

  it('87. [0.5, 0.5, 0.5] → stdDev = 0', () => {
    expect(computeStdDev([0.5, 0.5, 0.5], 0.5)).toBe(0)
  })

  it('88. [99999, 99999, 99999, 99999] → stdDev = 0', () => {
    expect(computeStdDev([99999, 99999, 99999, 99999], 99999)).toBe(0)
  })

  it('89. population formula: sqrt(mean_sq_dev). [0, 4] mean=2 → sqrt(4) = 2', () => {
    expect(computeStdDev([0, 4], 2)).toBeCloseTo(2, 5)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// computeZScore — formula ((value - mean) / stdDev)
// ═══════════════════════════════════════════════════════════════════════════

describe('computeZScore — formula validation', () => {
  it('90. (value - mean) / stdDev: (15 - 10) / 5 = 1.0', () => {
    expect(computeZScore(15, 10, 5)).toBeCloseTo(1.0, 5)
  })

  it('91. negative numerator: (5 - 10) / 5 = -1.0', () => {
    expect(computeZScore(5, 10, 5)).toBeCloseTo(-1.0, 5)
  })

  it('92. null when stdDev exactly 0 but value != mean', () => {
    expect(computeZScore(999, 1, 0)).toBeNull()
  })

  it('93. zero result: value = mean, any stdDev > 0', () => {
    expect(computeZScore(50, 50, 10)).toBeCloseTo(0, 5)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// computeIQRBounds — Q1/Q3/IQR formula and boundary
// ═══════════════════════════════════════════════════════════════════════════

describe('computeIQRBounds — Q1/Q3 formula', () => {
  it('94. null with exactly 3 values', () => {
    expect(computeIQRBounds([5, 10, 15])).toBeNull()
  })

  it('95. non-null with exactly 4 values (threshold)', () => {
    const result = computeIQRBounds([1, 2, 3, 4])
    expect(result).not.toBeNull()
  })

  it('96. upper_bound = q3 + 1.5 * iqr (4 element check)', () => {
    const result = computeIQRBounds([1, 2, 3, 4])!
    expect(result.upper_bound).toBeCloseTo(result.q3 + 1.5 * result.iqr, 5)
  })

  it('97. lower_bound = q1 - 1.5 * iqr (4 element check)', () => {
    const result = computeIQRBounds([1, 2, 3, 4])!
    expect(result.lower_bound).toBeCloseTo(result.q1 - 1.5 * result.iqr, 5)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// classifyAnomalySeverity — exact Z-score boundaries
// ═══════════════════════════════════════════════════════════════════════════

describe('classifyAnomalySeverity — exact Z-score boundaries', () => {
  const noBounds = null

  it('98. |z| > 3 → high; |z| = 3.001 → high', () => {
    expect(classifyAnomalySeverity(3.001, 0, noBounds)).toBe('high')
  })

  it('99. |z| = 3.0 → NOT > 3, so medium (since > 2)', () => {
    expect(classifyAnomalySeverity(3.0, 0, noBounds)).toBe('medium')
  })

  it('100. |z| > 2 and <= 3 → medium; z = 2.001', () => {
    expect(classifyAnomalySeverity(2.001, 0, noBounds)).toBe('medium')
  })

  it('101. |z| = 2.0 → NOT > 2, so low (since > 1.5)', () => {
    expect(classifyAnomalySeverity(2.0, 0, noBounds)).toBe('low')
  })

  it('102. |z| > 1.5 and <= 2 → low; z = 1.501', () => {
    expect(classifyAnomalySeverity(1.501, 0, noBounds)).toBe('low')
  })

  it('103. |z| = 1.5 → NOT > 1.5 → none', () => {
    expect(classifyAnomalySeverity(1.5, 0, noBounds)).toBe('none')
  })

  it('104. |z| = 0 → none', () => {
    expect(classifyAnomalySeverity(0, 0, noBounds)).toBe('none')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// isPotentialDuplicate — exact amount match and tolerance boundary
// ═══════════════════════════════════════════════════════════════════════════

describe('isPotentialDuplicate — amount tolerance', () => {
  const base = {
    supplier_name: 'Test Corp',
    amount_try: 2000,
    created_at: '2026-06-01T09:00:00Z',
  }

  it('105. exact same amount → duplicate', () => {
    const others = [{ supplier_name: 'Test Corp', amount_try: 2000, created_at: '2026-06-02T09:00:00Z' }]
    expect(isPotentialDuplicate(base, others)).toBe(true)
  })

  it('106. amount differs by 0.99 → within tolerance → duplicate', () => {
    const others = [{ supplier_name: 'Test Corp', amount_try: 2000.99, created_at: '2026-06-02T09:00:00Z' }]
    expect(isPotentialDuplicate(base, others)).toBe(true)
  })

  it('107. amount differs by 1.0 → within tolerance (≤ 1) → duplicate', () => {
    const others = [{ supplier_name: 'Test Corp', amount_try: 2001, created_at: '2026-06-02T09:00:00Z' }]
    expect(isPotentialDuplicate(base, others)).toBe(true)
  })

  it('108. amount differs by 1.01 → beyond tolerance → not duplicate', () => {
    const others = [{ supplier_name: 'Test Corp', amount_try: 2001.01, created_at: '2026-06-02T09:00:00Z' }]
    expect(isPotentialDuplicate(base, others)).toBe(false)
  })

  it('109. negative amount diff within tolerance (base - other = -1.0)', () => {
    const others = [{ supplier_name: 'Test Corp', amount_try: 1999, created_at: '2026-06-02T09:00:00Z' }]
    expect(isPotentialDuplicate(base, others)).toBe(true)
  })

  it('110. empty supplier_name on both → no match (base has no supplier)', () => {
    const noSupplier = { ...base, supplier_name: null }
    const others = [{ supplier_name: null as string | null, amount_try: 2000, created_at: '2026-06-02T09:00:00Z' }]
    expect(isPotentialDuplicate(noSupplier, others)).toBe(false)
  })
})
