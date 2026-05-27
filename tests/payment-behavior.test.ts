/**
 * Customer Payment Behavior Analysis — unit tests
 *
 * Tests pure computation logic: reliability scoring, classification,
 * days-to-pay, and payment date prediction.
 * No DB or network calls.
 */

import { describe, it, expect } from 'vitest'
import {
  computeReliabilityScore,
  classifyPaymentBehavior,
  computeDaysToPay,
  predictPaymentDate,
} from '../lib/services/commercial/payment-behavior.service'

// ── computeReliabilityScore ───────────────────────────────────────────────────

describe('computeReliabilityScore — pure', () => {

  // Test 1: Empty history → 100 (no history = not penalized)
  it('1. empty payments → 100', () => {
    expect(computeReliabilityScore([])).toBe(100)
  })

  // Test 2: Two on-time payments → bonuses push above 100, clamped to 100
  it('2. two on-time payments → clamped to 100', () => {
    const result = computeReliabilityScore([{ days_to_pay: 10 }, { days_to_pay: 15 }])
    expect(result).toBe(100)
  })

  // Test 3: One 31-60 day late payment → −5; one 61-90 day late → −10; total 85
  it('3. one 35-day + one 70-day late → 85', () => {
    const result = computeReliabilityScore([{ days_to_pay: 35 }, { days_to_pay: 70 }])
    expect(result).toBe(85)
  })

  // Test 4: One 91-day late payment → 100 - 20 = 80
  it('4. one 100-day late payment → 80', () => {
    const result = computeReliabilityScore([{ days_to_pay: 100 }])
    expect(result).toBe(80)
  })

  // Test 5: Five on-time payments → max bonus +25, clamped to 100
  it('5. five on-time payments → clamped to 100', () => {
    const payments = Array.from({ length: 5 }, () => ({ days_to_pay: 5 }))
    expect(computeReliabilityScore(payments)).toBe(100)
  })

  // Test 6: Max bonus is capped at 25 (6 on-time = +30 bonus, still → 100)
  it('6. six on-time payments → bonus capped at 25, clamped to 100', () => {
    const payments = Array.from({ length: 6 }, () => ({ days_to_pay: 1 }))
    expect(computeReliabilityScore(payments)).toBe(100)
  })

  // Test 7: Score cannot go below 0
  it('7. many very late payments → clamped to 0', () => {
    const payments = Array.from({ length: 10 }, () => ({ days_to_pay: 120 }))
    const result = computeReliabilityScore(payments)
    expect(result).toBe(0)
  })

  // Test 8: Mixed on-time and late: 2 on-time (+10), 1 late >30d (-5) → 105 → clamped 100
  it('8. two on-time, one 35-day late → 100 clamped', () => {
    const result = computeReliabilityScore([
      { days_to_pay: 10 },
      { days_to_pay: 20 },
      { days_to_pay: 35 },
    ])
    expect(result).toBe(100)
  })

  // Test 9: Exactly 30 days is on-time (boundary)
  it('9. exactly 30 days → on-time, no deduction, +5 bonus', () => {
    const result = computeReliabilityScore([{ days_to_pay: 30 }])
    expect(result).toBe(100)
  })

  // Test 10: Exactly 31 days → late >30d, −5 deduction, no bonus
  it('10. exactly 31 days → late, score 95', () => {
    const result = computeReliabilityScore([{ days_to_pay: 31 }])
    expect(result).toBe(95)
  })

})

// ── classifyPaymentBehavior ───────────────────────────────────────────────────

describe('classifyPaymentBehavior — pure', () => {

  // Test 11: score ≥ 85 and avgDays ≤ 20 → excellent
  it('11. score=90, avg=15 → excellent', () => {
    expect(classifyPaymentBehavior(90, 15)).toBe('excellent')
  })

  // Test 12: score ≥ 85 but avg > 20 → good (not excellent)
  it('12. score=90, avg=25 → good (avg too high for excellent)', () => {
    expect(classifyPaymentBehavior(90, 25)).toBe('good')
  })

  // Test 13: score < 30 → unreliable
  it('13. score=25, avg=null → unreliable', () => {
    expect(classifyPaymentBehavior(25, null)).toBe('unreliable')
  })

  // Test 14: score=70 → good
  it('14. score=70, avg=null → good', () => {
    expect(classifyPaymentBehavior(70, null)).toBe('good')
  })

  // Test 15: score=50 → average
  it('15. score=50, avg=null → average', () => {
    expect(classifyPaymentBehavior(50, null)).toBe('average')
  })

  // Test 16: score=35 → poor
  it('16. score=35, avg=null → poor', () => {
    expect(classifyPaymentBehavior(35, null)).toBe('poor')
  })

  // Test 17: score=85, avg exactly 20 → excellent boundary
  it('17. score=85, avg=20 → excellent (boundary)', () => {
    expect(classifyPaymentBehavior(85, 20)).toBe('excellent')
  })

})

// ── computeDaysToPay ──────────────────────────────────────────────────────────

describe('computeDaysToPay — pure', () => {

  // Test 18: 14 days between sale and payment
  it('18. 2026-05-01 → 2026-05-15 = 14 days', () => {
    expect(computeDaysToPay('2026-05-01', '2026-05-15')).toBe(14)
  })

  // Test 19: Paid before sale date → negative
  it('19. paid before sale date → -1', () => {
    expect(computeDaysToPay('2026-05-01', '2026-04-30')).toBe(-1)
  })

  // Test 20: Same day → 0
  it('20. paid same day → 0', () => {
    expect(computeDaysToPay('2026-05-01', '2026-05-01')).toBe(0)
  })

})

// ── predictPaymentDate ────────────────────────────────────────────────────────

describe('predictPaymentDate — pure', () => {

  // Test 21: Expected date 15 days from sale
  it('21. 2026-05-20 + 15 days → 2026-06-04', () => {
    expect(predictPaymentDate('2026-05-20', 15)).toBe('2026-06-04')
  })

  // Test 22: null avgDaysToPay → null
  it('22. avgDaysToPay=null → null', () => {
    expect(predictPaymentDate('2026-05-20', null)).toBe(null)
  })

  // Test 23: 0 days avg → same day
  it('23. avgDaysToPay=0 → same date', () => {
    expect(predictPaymentDate('2026-05-01', 0)).toBe('2026-05-01')
  })

  // Test 24: 30 days
  it('24. 2026-01-01 + 30 days → 2026-01-31', () => {
    expect(predictPaymentDate('2026-01-01', 30)).toBe('2026-01-31')
  })

})
