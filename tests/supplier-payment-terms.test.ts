/**
 * Supplier Payment Terms Service — unit tests
 *
 * Tests all pure helpers:
 *   - computeSupplierDaysToPay       (paid / unpaid cases)
 *   - classifySupplierPaymentTiming  (all 6 classifications, with/without due_date)
 *   - computeSupplierPaymentScore    (all late types, early bonus cap, clamp 0-100)
 *   - classifySupplierPaymentClass   (all 4 grade boundaries)
 *   - computeSupplierDpo             (empty → null, single value, multiple avg)
 *
 * No DB or network calls — all in-memory.
 */

import { describe, it, expect } from 'vitest'
import {
  computeSupplierDaysToPay,
  classifySupplierPaymentTiming,
  computeSupplierPaymentScore,
  classifySupplierPaymentClass,
  computeSupplierDpo,
} from '../lib/services/commercial/supplier-payment-terms.service'

// ── computeSupplierDaysToPay ──────────────────────────────────────────────────

describe('computeSupplierDaysToPay', () => {

  // Test 1: returns null when paidAt is null (unpaid)
  it('1. returns null when paidAt is null', () => {
    expect(computeSupplierDaysToPay('2026-01-01', null)).toBeNull()
  })

  // Test 2: same day payment → 0 days
  it('2. same day payment → 0 days', () => {
    expect(computeSupplierDaysToPay('2026-01-15', '2026-01-15')).toBe(0)
  })

  // Test 3: paid 10 days after creation → 10
  it('3. paid 10 days after creation → 10', () => {
    expect(computeSupplierDaysToPay('2026-01-01', '2026-01-11')).toBe(10)
  })

  // Test 4: paid 30 days after creation → 30
  it('4. paid 30 days after creation → 30', () => {
    expect(computeSupplierDaysToPay('2026-01-01', '2026-01-31')).toBe(30)
  })

  // Test 5: paid with timestamptz (includes time) — date part only used
  it('5. paid with timestamp — date part determines days', () => {
    expect(computeSupplierDaysToPay('2026-01-01T00:00:00Z', '2026-01-06T23:59:59Z')).toBe(5)
  })

})

// ── classifySupplierPaymentTiming ─────────────────────────────────────────────

describe('classifySupplierPaymentTiming — with explicit due_date', () => {

  const created = '2026-01-01'
  const due     = '2026-02-01'  // 31 days after created

  // Test 6: unpaid → 'unpaid'
  it('6. paidAt null → "unpaid"', () => {
    expect(classifySupplierPaymentTiming(created, null, due)).toBe('unpaid')
  })

  // Test 7: paid 10 days before due → 'early'
  it('7. paid 10 days before due → "early"', () => {
    const paidAt = '2026-01-22'  // due Jan 31+1=Feb 1; Jan 22 = 10 days before
    expect(classifySupplierPaymentTiming(created, paidAt, due)).toBe('early')
  })

  // Test 8: paid 3 days before due → 'on_time'
  it('8. paid 3 days before due → "on_time"', () => {
    const paidAt = '2026-01-29'  // 3 days before Feb 1
    expect(classifySupplierPaymentTiming(created, paidAt, due)).toBe('on_time')
  })

  // Test 9: paid exactly on due → 'on_time'
  it('9. paid on due date → "on_time"', () => {
    expect(classifySupplierPaymentTiming(created, due, due)).toBe('on_time')
  })

  // Test 10: paid 3 days after due → 'on_time'
  it('10. paid 3 days after due → "on_time"', () => {
    const paidAt = '2026-02-04'
    expect(classifySupplierPaymentTiming(created, paidAt, due)).toBe('on_time')
  })

  // Test 11: paid 15 days after due → 'late_30'
  it('11. paid 15 days after due → "late_30"', () => {
    const paidAt = '2026-02-16'
    expect(classifySupplierPaymentTiming(created, paidAt, due)).toBe('late_30')
  })

  // Test 12: paid 30 days after due → 'late_30' (boundary)
  it('12. paid exactly 30 days after due → "late_30"', () => {
    const paidAt = '2026-03-03'  // Feb 1 + 30 days
    expect(classifySupplierPaymentTiming(created, paidAt, due)).toBe('late_30')
  })

  // Test 13: paid 45 days after due → 'late_60'
  it('13. paid 45 days after due → "late_60"', () => {
    const paidAt = '2026-03-17'  // Feb 1 + 45 days
    expect(classifySupplierPaymentTiming(created, paidAt, due)).toBe('late_60')
  })

  // Test 14: paid 61 days after due → 'late_90plus'
  it('14. paid 61+ days after due → "late_90plus"', () => {
    const paidAt = '2026-04-03'  // Feb 1 + 61 days
    expect(classifySupplierPaymentTiming(created, paidAt, due)).toBe('late_90plus')
  })

})

describe('classifySupplierPaymentTiming — without due_date (implicit due = created + 30)', () => {

  const created = '2026-01-01'  // implicit due = Jan 31

  // Test 15: paid 10 days after created (21 days before implicit due) → 'early'
  it('15. no due_date, paid day 10 (well before implicit due) → "early"', () => {
    const paidAt = '2026-01-11'  // delta from Jan 31 = -20 days → early
    expect(classifySupplierPaymentTiming(created, paidAt, null)).toBe('early')
  })

  // Test 16: paid on day 30 (on implicit due) → 'on_time'
  it('16. no due_date, paid on implicit due (day 30) → "on_time"', () => {
    const paidAt = '2026-01-31'
    expect(classifySupplierPaymentTiming(created, paidAt, null)).toBe('on_time')
  })

  // Test 17: paid 40 days after created → 'late_30' (10 days overdue)
  it('17. no due_date, paid 40 days after created → "late_30"', () => {
    const paidAt = '2026-02-10'  // 10 days past implicit due Jan 31
    expect(classifySupplierPaymentTiming(created, paidAt, null)).toBe('late_30')
  })

})

// ── computeSupplierPaymentScore ───────────────────────────────────────────────

describe('computeSupplierPaymentScore', () => {

  // Test 18: empty timings → 100
  it('18. empty timings → 100', () => {
    expect(computeSupplierPaymentScore([])).toBe(100)
  })

  // Test 19: all on_time → 100 (no deductions, no bonus)
  it('19. all on_time → 100', () => {
    expect(computeSupplierPaymentScore(['on_time', 'on_time', 'on_time'])).toBe(100)
  })

  // Test 20: early payments add +3 each, capped at +15
  it('20. 5 early payments → bonus 15 (capped), score 100', () => {
    const timings = Array(5).fill('early') as typeof timings
    expect(computeSupplierPaymentScore(timings)).toBe(100)
  })

  it('20b. 10 early payments → bonus still capped at 15, score 100', () => {
    const timings = Array(10).fill('early') as typeof timings
    expect(computeSupplierPaymentScore(timings)).toBe(100)
  })

  // Test 21: 1 late_30 → 100 - 5 = 95
  it('21. 1 late_30 → 95', () => {
    expect(computeSupplierPaymentScore(['late_30'])).toBe(95)
  })

  // Test 22: 1 late_60 → 100 - 15 = 85
  it('22. 1 late_60 → 85', () => {
    expect(computeSupplierPaymentScore(['late_60'])).toBe(85)
  })

  // Test 23: 1 late_90plus → 100 - 25 = 75
  it('23. 1 late_90plus → 75', () => {
    expect(computeSupplierPaymentScore(['late_90plus'])).toBe(75)
  })

  // Test 24: 1 unpaid → 100 - 25 = 75
  it('24. 1 unpaid → 75', () => {
    expect(computeSupplierPaymentScore(['unpaid'])).toBe(75)
  })

  // Test 25: mixed — clamps to 0
  it('25. many severe lates → clamped to 0', () => {
    const timings = Array(10).fill('late_90plus') as typeof timings
    // 100 - 10*25 = -150 → clamped to 0
    expect(computeSupplierPaymentScore(timings)).toBe(0)
  })

  // Test 26: early bonus partially offsets late
  it('26. 3 early + 1 late_30 → 100 + min(9,15) - 5 = 104 clamped to 100', () => {
    const score = computeSupplierPaymentScore(['early', 'early', 'early', 'late_30'])
    // 100 + 9 - 5 = 104 → clamped to 100
    expect(score).toBe(100)
  })

})

// ── classifySupplierPaymentClass ──────────────────────────────────────────────

describe('classifySupplierPaymentClass', () => {

  // Test 27: score 80 → 'excellent'
  it('27. score 80 → "excellent"', () => {
    expect(classifySupplierPaymentClass(80)).toBe('excellent')
  })

  // Test 28: score 100 → 'excellent'
  it('28. score 100 → "excellent"', () => {
    expect(classifySupplierPaymentClass(100)).toBe('excellent')
  })

  // Test 29: score 65 → 'good'
  it('29. score 65 → "good"', () => {
    expect(classifySupplierPaymentClass(65)).toBe('good')
  })

  // Test 30: score 79 → 'good'
  it('30. score 79 → "good"', () => {
    expect(classifySupplierPaymentClass(79)).toBe('good')
  })

  // Test 31: score 50 → 'average'
  it('31. score 50 → "average"', () => {
    expect(classifySupplierPaymentClass(50)).toBe('average')
  })

  // Test 32: score 64 → 'average'
  it('32. score 64 → "average"', () => {
    expect(classifySupplierPaymentClass(64)).toBe('average')
  })

  // Test 33: score 49 → 'poor'
  it('33. score 49 → "poor"', () => {
    expect(classifySupplierPaymentClass(49)).toBe('poor')
  })

  // Test 34: score 0 → 'poor'
  it('34. score 0 → "poor"', () => {
    expect(classifySupplierPaymentClass(0)).toBe('poor')
  })

})

// ── computeSupplierDpo ────────────────────────────────────────────────────────

describe('computeSupplierDpo', () => {

  // Test 35: empty array → null
  it('35. empty array → null', () => {
    expect(computeSupplierDpo([])).toBeNull()
  })

  // Test 36: single value
  it('36. single value of 30 → 30', () => {
    expect(computeSupplierDpo([{ days_to_pay: 30 }])).toBe(30)
  })

  // Test 37: multiple values — average
  it('37. multiple values → average (rounded to 1 decimal)', () => {
    const result = computeSupplierDpo([
      { days_to_pay: 10 },
      { days_to_pay: 20 },
      { days_to_pay: 30 },
    ])
    expect(result).toBe(20)
  })

  // Test 38: non-integer average
  it('38. non-integer average → rounded to 1 decimal', () => {
    const result = computeSupplierDpo([
      { days_to_pay: 10 },
      { days_to_pay: 21 },
    ])
    // (10 + 21) / 2 = 15.5
    expect(result).toBe(15.5)
  })

})
