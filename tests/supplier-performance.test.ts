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

// ── gradeSupplierPerformance — additional edge cases ─────────────────────────

describe('gradeSupplierPerformance — on-time boundary precision', () => {

  // on_time exactly 90 → still qualifies for excellent
  it('fulfillment=95, onTime=90 (exact threshold) → excellent', () => {
    expect(gradeSupplierPerformance(95, 90, 5)).toBe('excellent')
  })

  // on_time 89.99 → just below excellent on-time requirement
  it('fulfillment=98, onTime=89.99 → good (onTime<90 blocks excellent)', () => {
    expect(gradeSupplierPerformance(98, 89.99, 5)).toBe('good')
  })

  // fulfillment exactly 95, on_time null → excellent
  it('fulfillment=95, onTime=null → excellent (null on_time is permissive)', () => {
    expect(gradeSupplierPerformance(95, null, 10)).toBe('excellent')
  })

  // fulfillment 94.99 → just below excellent tier
  it('fulfillment=94.99, onTime=null → good', () => {
    expect(gradeSupplierPerformance(94.99, null, 10)).toBe('good')
  })

  // on_time exactly 75 with fulfillment=85 → good (boundary)
  it('fulfillment=85, onTime=75 (exact boundary) → good', () => {
    expect(gradeSupplierPerformance(85, 75, 4)).toBe('good')
  })

  // on_time 74.99 with fulfillment=85 → falls through good to fair
  it('fulfillment=85, onTime=74.99 → fair (just below onTime threshold)', () => {
    expect(gradeSupplierPerformance(85, 74.99, 5)).toBe('fair')
  })

  // poCount exactly 3 → qualifies (not insufficient_data)
  it('poCount=3 (minimum valid) → not insufficient_data', () => {
    const result = gradeSupplierPerformance(100, 100, 3)
    expect(result).not.toBe('insufficient_data')
  })

  // poCount exactly 2 → insufficient_data
  it('poCount=2 → insufficient_data', () => {
    expect(gradeSupplierPerformance(100, 100, 2)).toBe('insufficient_data')
  })

  // fulfillment 69.99 → just below fair → poor
  it('fulfillment=69.99 → poor (just below fair boundary)', () => {
    expect(gradeSupplierPerformance(69.99, null, 5)).toBe('poor')
  })

  // fulfillment 70 → fair (at fair boundary)
  it('fulfillment=70 (exact fair boundary) → fair', () => {
    expect(gradeSupplierPerformance(70, null, 5)).toBe('fair')
  })

  // high on-time but poor fulfillment still = poor
  it('fulfillment=10, onTime=100 → poor (fulfillment dominates)', () => {
    expect(gradeSupplierPerformance(10, 100, 10)).toBe('poor')
  })

  // large poCount doesn't change grade
  it('fulfillment=99, onTime=99, poCount=1000 → excellent', () => {
    expect(gradeSupplierPerformance(99, 99, 1000)).toBe('excellent')
  })
})

// ── computeFulfillmentRate — additional edge cases ────────────────────────────

describe('computeFulfillmentRate — rounding and edge cases', () => {

  // Rounding: result is rounded to 2 decimal places
  it('received=2, total=7, cancelled=1 → 2/6 = 33.33%', () => {
    expect(computeFulfillmentRate(2, 7, 1)).toBeCloseTo(33.33, 1)
  })

  // Cancelled > total edge case — nonCancelled would be negative → return 0
  it('cancelled > total (edge) → 0 (nonCancelled ≤ 0)', () => {
    expect(computeFulfillmentRate(0, 3, 5)).toBe(0)
  })

  // received === total - cancelled → 100%
  it('received = nonCancelled → 100%', () => {
    expect(computeFulfillmentRate(7, 10, 3)).toBe(100)
  })

  // Large numbers remain accurate
  it('received=500, total=1000, cancelled=200 → 500/800 = 62.5%', () => {
    expect(computeFulfillmentRate(500, 1000, 200)).toBeCloseTo(62.5, 1)
  })

  // Partial with no cancellations
  it('received=3, total=4, cancelled=0 → 75%', () => {
    expect(computeFulfillmentRate(3, 4, 0)).toBe(75)
  })

  // 0% fulfillment with active orders
  it('received=0, total=10, cancelled=0 → 0%', () => {
    expect(computeFulfillmentRate(0, 10, 0)).toBe(0)
  })

  // Mix of received and pending
  it('received=6, total=10, cancelled=1 → 6/9 = 66.67%', () => {
    expect(computeFulfillmentRate(6, 10, 1)).toBeCloseTo(66.67, 1)
  })
})

// ── computeOnTimeRate — additional edge cases ─────────────────────────────────

describe('computeOnTimeRate — precision and boundaries', () => {

  // All on-time
  it('onTime=10, received=10 → 100%', () => {
    expect(computeOnTimeRate(10, 10)).toBe(100)
  })

  // None on-time
  it('onTime=0, received=5 → 0%', () => {
    expect(computeOnTimeRate(0, 5)).toBe(0)
  })

  // Single order on-time
  it('onTime=1, received=1 → 100%', () => {
    expect(computeOnTimeRate(1, 1)).toBe(100)
  })

  // Two of three on-time
  it('onTime=2, received=3 → 66.67%', () => {
    const result = computeOnTimeRate(2, 3)
    expect(result).not.toBeNull()
    expect(result!).toBeCloseTo(66.67, 1)
  })

  // Large dataset
  it('onTime=95, received=100 → 95%', () => {
    expect(computeOnTimeRate(95, 100)).toBe(95)
  })

  // 50% rate
  it('onTime=5, received=10 → 50%', () => {
    expect(computeOnTimeRate(5, 10)).toBe(50)
  })

  // Single delivery, not on-time
  it('onTime=0, received=1 → 0%', () => {
    expect(computeOnTimeRate(0, 1)).toBe(0)
  })
})

// ── isOverdue — additional edge cases ────────────────────────────────────────

describe('isOverdue — additional status and date coverage', () => {

  // 'approved' status → not overdue (non-pending)
  it('status "approved" + past date → false (not a pending status)', () => {
    expect(isOverdue('2020-01-01', 'approved', '2026-05-29')).toBe(false)
  })

  // 'in_transit' status → not overdue (not a tracked pending status)
  it('status "in_transit" + past date → false', () => {
    expect(isOverdue('2020-01-01', 'in_transit', '2026-05-29')).toBe(false)
  })

  // Date one day before today → overdue
  it('expectedDate one day before today → true', () => {
    expect(isOverdue('2026-05-28', 'ordered', '2026-05-29')).toBe(true)
  })

  // Date one day after today → not overdue
  it('expectedDate one day after today → false', () => {
    expect(isOverdue('2026-05-30', 'ordered', '2026-05-29')).toBe(false)
  })

  // Empty string as expectedDate → false (falsy)
  it('expectedDate empty string → false', () => {
    expect(isOverdue('', 'ordered', '2026-05-29')).toBe(false)
  })

  // partially_received with date way in the past → overdue
  it('partially_received + date 2 years ago → true', () => {
    expect(isOverdue('2024-01-01', 'partially_received', '2026-05-29')).toBe(true)
  })

  // draft with date 30 days ago → overdue
  it('draft + date 30 days ago → true', () => {
    expect(isOverdue('2026-04-29', 'draft', '2026-05-29')).toBe(true)
  })

  // 'received' with very old date → always false
  it('received + date years ago → false', () => {
    expect(isOverdue('2020-01-01', 'received', '2026-05-29')).toBe(false)
  })

  // 'cancelled' with date yesterday → false
  it('cancelled + date yesterday → false', () => {
    expect(isOverdue('2026-05-28', 'cancelled', '2026-05-29')).toBe(false)
  })
})

// ── computeFulfillmentRate — formula verification ─────────────────────────────

describe('computeFulfillmentRate — formula: received / (total - cancelled) × 100', () => {
  it('exact formula: 3 received, 5 total, 0 cancelled = 3/5 × 100 = 60%', () => {
    expect(computeFulfillmentRate(3, 5, 0)).toBe(60)
  })

  it('100% when all non-cancelled are received', () => {
    expect(computeFulfillmentRate(10, 10, 0)).toBe(100)
  })

  it('0% when 0 received and cancellations present', () => {
    expect(computeFulfillmentRate(0, 8, 3)).toBe(0)
  })

  it('edge case: total = cancelled → nonCancelled = 0 → returns 0', () => {
    expect(computeFulfillmentRate(0, 4, 4)).toBe(0)
  })

  it('result is rounded to 2 decimal places', () => {
    // 2 / 3 × 100 = 66.67
    const r = computeFulfillmentRate(2, 3, 0)
    expect(r).toBeCloseTo(66.67, 1)
  })

  it('cancellations reduce denominator correctly', () => {
    // 6 received, 10 total, 4 cancelled → 6/6 = 100%
    expect(computeFulfillmentRate(6, 10, 4)).toBe(100)
  })

  it('0 ordered and 0 cancelled → 0 (empty state)', () => {
    expect(computeFulfillmentRate(0, 0, 0)).toBe(0)
  })
})

// ── computeOnTimeRate — formula verification ──────────────────────────────────

describe('computeOnTimeRate — formula: onTimeCount / receivedCount × 100', () => {
  it('exact formula: 7 on-time, 10 received = 70%', () => {
    expect(computeOnTimeRate(7, 10)).toBe(70)
  })

  it('returns null when receivedCount = 0 (avoid division by zero)', () => {
    expect(computeOnTimeRate(0, 0)).toBeNull()
  })

  it('returns null even when onTimeCount is positive but received = 0', () => {
    expect(computeOnTimeRate(5, 0)).toBeNull()
  })

  it('100% when all received are on-time', () => {
    expect(computeOnTimeRate(7, 7)).toBe(100)
  })

  it('0% when none are on-time', () => {
    expect(computeOnTimeRate(0, 7)).toBe(0)
  })

  it('fractional result is rounded to 2dp: 1/7 ≈ 14.29%', () => {
    const r = computeOnTimeRate(1, 7)
    expect(r).not.toBeNull()
    expect(r!).toBeCloseTo(14.29, 1)
  })

  it('large numbers: 99/100 = 99%', () => {
    expect(computeOnTimeRate(99, 100)).toBe(99)
  })
})

// ── isOverdue — same-day is NOT overdue ───────────────────────────────────────

describe('isOverdue — boundary: same-day expected date is not overdue', () => {
  it('same-day expectedDate and today → false (not yet past)', () => {
    expect(isOverdue('2026-06-15', 'ordered', '2026-06-15')).toBe(false)
  })

  it('one day before today → true (past)', () => {
    expect(isOverdue('2026-06-14', 'ordered', '2026-06-15')).toBe(true)
  })

  it('one day after today → false (future)', () => {
    expect(isOverdue('2026-06-16', 'ordered', '2026-06-15')).toBe(false)
  })

  it('draft with same-day expected → false', () => {
    expect(isOverdue('2026-06-15', 'draft', '2026-06-15')).toBe(false)
  })

  it('partially_received with same-day → false', () => {
    expect(isOverdue('2026-06-15', 'partially_received', '2026-06-15')).toBe(false)
  })

  it('yesterday as expected, received status → always false', () => {
    expect(isOverdue('2026-06-14', 'received', '2026-06-15')).toBe(false)
  })
})

// ── gradeSupplierPerformance — all 5 grade levels ────────────────────────────

describe('gradeSupplierPerformance — all grade levels with exact thresholds', () => {
  it('grade excellent: fulfillment=100, onTime=100, poCount=5', () => {
    expect(gradeSupplierPerformance(100, 100, 5)).toBe('excellent')
  })

  it('grade excellent: fulfillment=95 exactly, onTime=90 exactly, poCount=3', () => {
    expect(gradeSupplierPerformance(95, 90, 3)).toBe('excellent')
  })

  it('grade good: fulfillment=90, onTime=80, poCount=5', () => {
    expect(gradeSupplierPerformance(90, 80, 5)).toBe('good')
  })

  it('grade good: fulfillment=85 exactly, onTime=75 exactly, poCount=4', () => {
    expect(gradeSupplierPerformance(85, 75, 4)).toBe('good')
  })

  it('grade fair: fulfillment=70 exactly, onTime=null, poCount=3', () => {
    expect(gradeSupplierPerformance(70, null, 3)).toBe('fair')
  })

  it('grade fair: fulfillment=80, onTime=50, poCount=5 (onTime fails good threshold)', () => {
    expect(gradeSupplierPerformance(80, 50, 5)).toBe('fair')
  })

  it('grade poor: fulfillment=69, onTime=null, poCount=5', () => {
    expect(gradeSupplierPerformance(69, null, 5)).toBe('poor')
  })

  it('grade poor: fulfillment=0, onTime=0, poCount=10', () => {
    expect(gradeSupplierPerformance(0, 0, 10)).toBe('poor')
  })

  it('grade insufficient_data: poCount=1', () => {
    expect(gradeSupplierPerformance(99, 99, 1)).toBe('insufficient_data')
  })

  it('grade insufficient_data: poCount=2 (just below threshold)', () => {
    expect(gradeSupplierPerformance(100, 100, 2)).toBe('insufficient_data')
  })

  it('grade excellent when onTime is null and fulfillment >= 95', () => {
    expect(gradeSupplierPerformance(96, null, 10)).toBe('excellent')
  })

  it('grade good when onTime is null and fulfillment is between 85 and 94', () => {
    expect(gradeSupplierPerformance(87, null, 6)).toBe('good')
  })
})
