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
