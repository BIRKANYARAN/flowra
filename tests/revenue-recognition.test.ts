/**
 * Revenue Recognition & Accrual Tracking — unit tests
 *
 * Tests all pure computation functions.
 * No DB or network calls — pure function tests only.
 */

import { describe, it, expect } from 'vitest'
import {
  computeAccrualCashDiff,
  computeCollectionEfficiency,
  classifyCollectionEfficiency,
  computeDeferredRatio,
  computeRevenueBacklog,
} from '../lib/services/finance/revenue-recognition.service'

// ── computeAccrualCashDiff ────────────────────────────────────────────────────

describe('computeAccrualCashDiff', () => {

  // Test 1: positive diff (A/R created)
  it('1. accrual > cash → positive diff (uncollected A/R)', () => {
    expect(computeAccrualCashDiff(100_000, 60_000)).toBe(40_000)
  })

  // Test 2: negative diff (overpayment / advance)
  it('2. accrual < cash → negative diff (advance / overpayment)', () => {
    expect(computeAccrualCashDiff(50_000, 80_000)).toBe(-30_000)
  })

  // Test 3: zero diff (fully collected)
  it('3. accrual = cash → zero diff (fully collected)', () => {
    expect(computeAccrualCashDiff(75_000, 75_000)).toBe(0)
  })

  // Test 4: both zero
  it('4. both zero → zero', () => {
    expect(computeAccrualCashDiff(0, 0)).toBe(0)
  })

  // Test 5: accrual only, no cash
  it('5. accrual only, no cash → diff = accrual', () => {
    expect(computeAccrualCashDiff(200_000, 0)).toBe(200_000)
  })

})

// ── computeCollectionEfficiency ───────────────────────────────────────────────

describe('computeCollectionEfficiency', () => {

  // Test 6: normal case
  it('6. normal: 80k collected / 100k accrual → 80%', () => {
    expect(computeCollectionEfficiency(80_000, 100_000)).toBeCloseTo(80)
  })

  // Test 7: zero accrual → null
  it('7. zero accrual → null (division by zero guard)', () => {
    expect(computeCollectionEfficiency(0, 0)).toBeNull()
  })

  // Test 8: zero accrual with non-zero cash → null
  it('8. non-zero cash, zero accrual → null', () => {
    expect(computeCollectionEfficiency(5_000, 0)).toBeNull()
  })

  // Test 9: over 100% (advance payments)
  it('9. cash > accrual → efficiency > 100% (advance payments)', () => {
    const result = computeCollectionEfficiency(120_000, 100_000)
    expect(result).toBeCloseTo(120)
  })

  // Test 10: 100% collection
  it('10. full collection → 100%', () => {
    expect(computeCollectionEfficiency(50_000, 50_000)).toBeCloseTo(100)
  })

  // Test 11: partial collection
  it('11. partial: 1 collected / 4 accrual → 25%', () => {
    expect(computeCollectionEfficiency(25_000, 100_000)).toBeCloseTo(25)
  })

})

// ── classifyCollectionEfficiency ─────────────────────────────────────────────

describe('classifyCollectionEfficiency', () => {

  // Test 12: null → unknown
  it('12. null → unknown', () => {
    expect(classifyCollectionEfficiency(null)).toBe('unknown')
  })

  // Test 13: ≥90% → excellent
  it('13. 95% → excellent', () => {
    expect(classifyCollectionEfficiency(95)).toBe('excellent')
  })

  // Test 14: boundary 90% → excellent
  it('14. 90% (boundary) → excellent', () => {
    expect(classifyCollectionEfficiency(90)).toBe('excellent')
  })

  // Test 15: 89% → good
  it('15. 89% → good', () => {
    expect(classifyCollectionEfficiency(89)).toBe('good')
  })

  // Test 16: 70% (boundary) → good
  it('16. 70% (boundary) → good', () => {
    expect(classifyCollectionEfficiency(70)).toBe('good')
  })

  // Test 17: 69% → fair
  it('17. 69% → fair', () => {
    expect(classifyCollectionEfficiency(69)).toBe('fair')
  })

  // Test 18: 50% (boundary) → fair
  it('18. 50% (boundary) → fair', () => {
    expect(classifyCollectionEfficiency(50)).toBe('fair')
  })

  // Test 19: 49% → poor
  it('19. 49% → poor', () => {
    expect(classifyCollectionEfficiency(49)).toBe('poor')
  })

  // Test 20: 0% → poor
  it('20. 0% → poor', () => {
    expect(classifyCollectionEfficiency(0)).toBe('poor')
  })

  // Test 21: 100% → excellent
  it('21. 100% → excellent', () => {
    expect(classifyCollectionEfficiency(100)).toBe('excellent')
  })

  // Test 22: >100% → excellent (advance payments)
  it('22. 110% (advance) → excellent', () => {
    expect(classifyCollectionEfficiency(110)).toBe('excellent')
  })

})

// ── computeDeferredRatio ──────────────────────────────────────────────────────

describe('computeDeferredRatio', () => {

  // Test 23: normal ratio
  it('23. 30k deferred / 100k accrual → 30%', () => {
    expect(computeDeferredRatio(30_000, 100_000)).toBeCloseTo(30)
  })

  // Test 24: zero accrual → 0 (not division error)
  it('24. zero accrual → 0 (safe fallback)', () => {
    expect(computeDeferredRatio(50_000, 0)).toBe(0)
  })

  // Test 25: no deferred → 0%
  it('25. no deferred → 0%', () => {
    expect(computeDeferredRatio(0, 100_000)).toBe(0)
  })

  // Test 26: deferred > accrual (large pipeline)
  it('26. deferred > accrual → ratio > 100%', () => {
    const result = computeDeferredRatio(200_000, 100_000)
    expect(result).toBeCloseTo(200)
  })

  // Test 27: both zero → 0
  it('27. both zero → 0', () => {
    expect(computeDeferredRatio(0, 0)).toBe(0)
  })

})

// ── computeRevenueBacklog ─────────────────────────────────────────────────────

describe('computeRevenueBacklog', () => {

  // Test 28: normal case
  it('28. 500k pipeline × 60% win rate → 300k backlog', () => {
    expect(computeRevenueBacklog(500_000, 60)).toBeCloseTo(300_000)
  })

  // Test 29: zero win rate → 0 backlog
  it('29. zero win rate → 0 backlog', () => {
    expect(computeRevenueBacklog(500_000, 0)).toBe(0)
  })

  // Test 30: 100% win rate → backlog = pipeline
  it('30. 100% win rate → backlog = full pipeline', () => {
    expect(computeRevenueBacklog(250_000, 100)).toBeCloseTo(250_000)
  })

  // Test 31: zero pipeline → 0
  it('31. zero pipeline → 0 backlog regardless of win rate', () => {
    expect(computeRevenueBacklog(0, 75)).toBe(0)
  })

  // Test 32: fractional win rate
  it('32. fractional: 1M pipeline × 33.3% → ~333k', () => {
    expect(computeRevenueBacklog(1_000_000, 33.3)).toBeCloseTo(333_000, -2)
  })

})
