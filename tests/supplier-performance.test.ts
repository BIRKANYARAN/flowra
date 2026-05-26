/**
 * Supplier Performance Service — unit tests
 *
 * Tests pure helpers:
 *   - gradeSupplierPerformance  (5 grades × multiple combos)
 *   - computeFulfillmentRate    (normal, zero non-cancelled, all cancelled)
 *   - computeOnTimeRate         (normal, zero received → null)
 *   - isOverdue                 (past date + pending, future date, received status)
 *
 * No DB or network calls — all in-memory.
 */

import { describe, it, expect } from 'vitest'
import {
  gradeSupplierPerformance,
  computeFulfillmentRate,
  computeOnTimeRate,
  isOverdue,
} from '../lib/services/commercial/supplier-performance.service'

// ── gradeSupplierPerformance ──────────────────────────────────────────────────

describe('gradeSupplierPerformance — performance grading', () => {

  // Test 1: insufficient_data — count < 3
  it('1. poCount < 3 → "insufficient_data" regardless of rates', () => {
    expect(gradeSupplierPerformance(100, 100, 2)).toBe('insufficient_data')
  })

  // Test 2: insufficient_data — count = 0
  it('2. poCount = 0 → "insufficient_data"', () => {
    expect(gradeSupplierPerformance(0, null, 0)).toBe('insufficient_data')
  })

  // Test 3: excellent — fulfillment≥95% AND on_time≥90%
  it('3. fulfillment=100, onTime=95, count=5 → "excellent"', () => {
    expect(gradeSupplierPerformance(100, 95, 5)).toBe('excellent')
  })

  // Test 4: excellent — fulfillment≥95% AND on_time=null
  it('4. fulfillment=97, onTime=null, count=4 → "excellent"', () => {
    expect(gradeSupplierPerformance(97, null, 4)).toBe('excellent')
  })

  // Test 5: excellent edge — fulfillment exactly 95, on_time exactly 90
  it('5. fulfillment=95, onTime=90, count=3 → "excellent"', () => {
    expect(gradeSupplierPerformance(95, 90, 3)).toBe('excellent')
  })

  // Test 6: good — fulfillment≥85% AND on_time≥75%
  it('6. fulfillment=88, onTime=80, count=10 → "good"', () => {
    expect(gradeSupplierPerformance(88, 80, 10)).toBe('good')
  })

  // Test 7: good — fulfillment≥85%, on_time=null
  it('7. fulfillment=90, onTime=null, count=5 → "excellent" (fulfillment≥95? no → good)', () => {
    expect(gradeSupplierPerformance(90, null, 5)).toBe('good')
  })

  // Test 8: good edge — fulfillment exactly 85, on_time exactly 75
  it('8. fulfillment=85, onTime=75, count=5 → "good"', () => {
    expect(gradeSupplierPerformance(85, 75, 5)).toBe('good')
  })

  // Test 9: NOT good because on_time < 75 (falls through to fair or poor)
  it('9. fulfillment=88, onTime=50, count=5 → "fair" (fulfillment≥70 but fails good onTime)', () => {
    expect(gradeSupplierPerformance(88, 50, 5)).toBe('fair')
  })

  // Test 10: fair — fulfillment≥70% but not meeting good criteria
  it('10. fulfillment=75, onTime=60, count=4 → "fair"', () => {
    expect(gradeSupplierPerformance(75, 60, 4)).toBe('fair')
  })

  // Test 11: fair edge — fulfillment exactly 70
  it('11. fulfillment=70, onTime=null, count=3 → "good" (70 < 85) → fair', () => {
    expect(gradeSupplierPerformance(70, null, 3)).toBe('fair')
  })

  // Test 12: poor — fulfillment < 70%
  it('12. fulfillment=60, onTime=null, count=5 → "poor"', () => {
    expect(gradeSupplierPerformance(60, null, 5)).toBe('poor')
  })

  // Test 13: poor — 0% fulfillment
  it('13. fulfillment=0, onTime=null, count=3 → "poor"', () => {
    expect(gradeSupplierPerformance(0, null, 3)).toBe('poor')
  })

  // Test 14: good requires BOTH criteria — high fulfillment but low on_time still gets bumped
  it('14. fulfillment=95, onTime=60, count=5 → "fair" (on_time<75, so not good/excellent)', () => {
    expect(gradeSupplierPerformance(95, 60, 5)).toBe('fair')
  })
})

// ── computeFulfillmentRate ────────────────────────────────────────────────────

describe('computeFulfillmentRate — fulfillment computation', () => {

  // Test 15: normal case — some received, some pending, some cancelled
  it('15. received=8, total=12, cancelled=2 → 8/10 × 100 = 80%', () => {
    expect(computeFulfillmentRate(8, 12, 2)).toBe(80)
  })

  // Test 16: 100% fulfillment
  it('16. received=5, total=5, cancelled=0 → 100%', () => {
    expect(computeFulfillmentRate(5, 5, 0)).toBe(100)
  })

  // Test 17: zero non-cancelled — returns 0, no division by zero
  it('17. all cancelled (total=5, cancelled=5) → 0% (no division by zero)', () => {
    expect(computeFulfillmentRate(0, 5, 5)).toBe(0)
  })

  // Test 18: empty state — all zeros
  it('18. received=0, total=0, cancelled=0 → 0% (empty state)', () => {
    expect(computeFulfillmentRate(0, 0, 0)).toBe(0)
  })

  // Test 19: partial fulfillment rounds correctly
  it('19. received=1, total=3, cancelled=0 → 33.33%', () => {
    expect(computeFulfillmentRate(1, 3, 0)).toBeCloseTo(33.33, 1)
  })
})

// ── computeOnTimeRate ─────────────────────────────────────────────────────────

describe('computeOnTimeRate — on-time rate computation', () => {

  // Test 20: normal case
  it('20. onTime=9, received=10 → 90%', () => {
    expect(computeOnTimeRate(9, 10)).toBe(90)
  })

  // Test 21: zero received → null (not 0)
  it('21. onTime=0, received=0 → null', () => {
    expect(computeOnTimeRate(0, 0)).toBeNull()
  })

  // Test 22: 100% on-time
  it('22. onTime=5, received=5 → 100%', () => {
    expect(computeOnTimeRate(5, 5)).toBe(100)
  })

  // Test 23: 0% on-time (all late) — received > 0
  it('23. onTime=0, received=4 → 0%', () => {
    expect(computeOnTimeRate(0, 4)).toBe(0)
  })

  // Test 24: fractional result
  it('24. onTime=1, received=3 → 33.33%', () => {
    const result = computeOnTimeRate(1, 3)
    expect(result).not.toBeNull()
    expect(result!).toBeCloseTo(33.33, 1)
  })
})

// ── isOverdue ─────────────────────────────────────────────────────────────────

describe('isOverdue — overdue detection', () => {

  // Test 25: past expected date + pending status → overdue
  it('25. expectedDate past + status "ordered" → true', () => {
    expect(isOverdue('2026-05-01', 'ordered', '2026-05-27')).toBe(true)
  })

  // Test 26: future expected date + pending status → not overdue
  it('26. expectedDate future + status "ordered" → false', () => {
    expect(isOverdue('2026-06-01', 'ordered', '2026-05-27')).toBe(false)
  })

  // Test 27: received status → not overdue regardless of date
  it('27. status "received" + past date → false (already received)', () => {
    expect(isOverdue('2026-01-01', 'received', '2026-05-27')).toBe(false)
  })

  // Test 28: cancelled status → not overdue
  it('28. status "cancelled" + past date → false', () => {
    expect(isOverdue('2026-01-01', 'cancelled', '2026-05-27')).toBe(false)
  })

  // Test 29: null expected date → not overdue
  it('29. null expectedDate + pending → false', () => {
    expect(isOverdue(null, 'ordered', '2026-05-27')).toBe(false)
  })

  // Test 30: draft status with past expected date → overdue
  it('30. expectedDate past + status "draft" → true', () => {
    expect(isOverdue('2026-04-01', 'draft', '2026-05-27')).toBe(true)
  })

  // Test 31: partially_received + past date → overdue
  it('31. expectedDate past + status "partially_received" → true', () => {
    expect(isOverdue('2026-03-15', 'partially_received', '2026-05-27')).toBe(true)
  })

  // Test 32: same day as expected date → not overdue (expected <= today is ok)
  it('32. expectedDate = today + status "ordered" → false (today is not past)', () => {
    expect(isOverdue('2026-05-27', 'ordered', '2026-05-27')).toBe(false)
  })
})
