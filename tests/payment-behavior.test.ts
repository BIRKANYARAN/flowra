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

  // Test 11: Exactly 60 days boundary — >30d so −5 deduction only
  it('11. exactly 60 days → −5, score 95', () => {
    const result = computeReliabilityScore([{ days_to_pay: 60 }])
    expect(result).toBe(95)
  })

  // Test 12: Exactly 61 days boundary — >60d so −10 deduction
  it('12. exactly 61 days → −10, score 90', () => {
    const result = computeReliabilityScore([{ days_to_pay: 61 }])
    expect(result).toBe(90)
  })

  // Test 13: Exactly 90 days — >60d so −10 deduction, not −20
  it('13. exactly 90 days → −10, score 90', () => {
    const result = computeReliabilityScore([{ days_to_pay: 90 }])
    expect(result).toBe(90)
  })

  // Test 14: Exactly 91 days — >90d so −20 deduction
  it('14. exactly 91 days → −20, score 80', () => {
    const result = computeReliabilityScore([{ days_to_pay: 91 }])
    expect(result).toBe(80)
  })

  // Test 15: One payment on day 0 (paid same day) — on-time, +5 bonus
  it('15. day 0 payment → on-time, score 100', () => {
    const result = computeReliabilityScore([{ days_to_pay: 0 }])
    expect(result).toBe(100)
  })

  // Test 16: Negative days_to_pay (paid before sale date) — counts as on-time
  it('16. negative days_to_pay (prepaid) → on-time, score 100', () => {
    const result = computeReliabilityScore([{ days_to_pay: -5 }])
    expect(result).toBe(100)
  })

  // Test 17: Three >90 day payments → 100 - 60 = 40
  it('17. three 95-day payments → 40', () => {
    const result = computeReliabilityScore([
      { days_to_pay: 95 },
      { days_to_pay: 95 },
      { days_to_pay: 95 },
    ])
    expect(result).toBe(40)
  })

  // Test 18: Mixed severity: one >90, one >60, one >30 → −20 −10 −5 = −35 → 65
  it('18. one >90, one >60, one >30 → score 65', () => {
    const result = computeReliabilityScore([
      { days_to_pay: 95 },
      { days_to_pay: 65 },
      { days_to_pay: 35 },
    ])
    expect(result).toBe(65)
  })

  // Test 19: 1 on-time + 6 >90 day payments → 100 - 120 + 5 = clamped 0
  it('19. one on-time + six >90-day late → clamped 0', () => {
    const result = computeReliabilityScore([
      { days_to_pay: 15 },
      ...Array.from({ length: 6 }, () => ({ days_to_pay: 100 })),
    ])
    expect(result).toBe(0)
  })

  // Test 20: Three on-time payments → bonus = min(15, 25) = 15 → 100+15 = clamped 100
  it('20. three on-time payments → 100 clamped', () => {
    const result = computeReliabilityScore([
      { days_to_pay: 5 },
      { days_to_pay: 10 },
      { days_to_pay: 25 },
    ])
    expect(result).toBe(100)
  })

  // Test 21: Score clamped exactly at 0 from large deductions
  it('21. five >90-day payments → exactly 0', () => {
    const payments = Array.from({ length: 5 }, () => ({ days_to_pay: 150 }))
    const result = computeReliabilityScore(payments)
    expect(result).toBe(0)
  })

  // Test 22: Single payment at 30 days → on-time → +5 bonus → 105 → clamped 100
  it('22. single payment at exactly 30 days → 100', () => {
    expect(computeReliabilityScore([{ days_to_pay: 30 }])).toBe(100)
  })

  // Test 23: One on-time (< 30) + one exactly 30 = 2 on-time: +10 → 110 → 100
  it('23. one 5-day + one 30-day → both on-time → 100', () => {
    const result = computeReliabilityScore([
      { days_to_pay: 5 },
      { days_to_pay: 30 },
    ])
    expect(result).toBe(100)
  })

  // Test 24: 4 on-time payments → bonus = min(20, 25) = 20 → 120 → 100
  it('24. four on-time payments → bonus 20 → clamped 100', () => {
    const payments = Array.from({ length: 4 }, () => ({ days_to_pay: 1 }))
    expect(computeReliabilityScore(payments)).toBe(100)
  })

  // Test 25: 1 >90 + 4 on-time → 100 - 20 + 20 = 100
  it('25. one >90-day late + four on-time → 100', () => {
    const result = computeReliabilityScore([
      { days_to_pay: 95 },
      { days_to_pay: 5 },
      { days_to_pay: 5 },
      { days_to_pay: 5 },
      { days_to_pay: 5 },
    ])
    expect(result).toBe(100)
  })

  // Test 26: 1 >90 + 5 on-time → 100 - 20 + 25 = 105 → clamped 100
  it('26. one >90-day late + five on-time → 100 clamped', () => {
    const result = computeReliabilityScore([
      { days_to_pay: 120 },
      { days_to_pay: 10 },
      { days_to_pay: 10 },
      { days_to_pay: 10 },
      { days_to_pay: 10 },
      { days_to_pay: 10 },
    ])
    expect(result).toBe(100)
  })

  // Test 27: Return value always an integer (no fractional values)
  it('27. returned score is always an integer', () => {
    const result = computeReliabilityScore([{ days_to_pay: 35 }, { days_to_pay: 25 }])
    expect(Number.isInteger(result)).toBe(true)
  })

  // Test 28: Large on-time count — bonus never exceeds 25
  it('28. 100 on-time payments → bonus still capped at 25 → 100', () => {
    const payments = Array.from({ length: 100 }, () => ({ days_to_pay: 1 }))
    expect(computeReliabilityScore(payments)).toBe(100)
  })

  // Test 29: Two >60d late + one on-time: 100 - 10 - 10 + 5 = 85
  it('29. two 65-day late + one 5-day → 85', () => {
    const result = computeReliabilityScore([
      { days_to_pay: 65 },
      { days_to_pay: 65 },
      { days_to_pay: 5 },
    ])
    expect(result).toBe(85)
  })

  // Test 30: All payments exactly 1 day — all on-time, max bonus → 100
  it('30. one 1-day payment → on-time → 100', () => {
    expect(computeReliabilityScore([{ days_to_pay: 1 }])).toBe(100)
  })

})

// ── classifyPaymentBehavior ───────────────────────────────────────────────────

describe('classifyPaymentBehavior — pure', () => {

  // Test 31: score ≥ 85 and avgDays ≤ 20 → excellent
  it('31. score=90, avg=15 → excellent', () => {
    expect(classifyPaymentBehavior(90, 15)).toBe('excellent')
  })

  // Test 32: score ≥ 85 but avg > 20 → good (not excellent)
  it('32. score=90, avg=25 → good (avg too high for excellent)', () => {
    expect(classifyPaymentBehavior(90, 25)).toBe('good')
  })

  // Test 33: score < 30 → unreliable
  it('33. score=25, avg=null → unreliable', () => {
    expect(classifyPaymentBehavior(25, null)).toBe('unreliable')
  })

  // Test 34: score=70 → good
  it('34. score=70, avg=null → good', () => {
    expect(classifyPaymentBehavior(70, null)).toBe('good')
  })

  // Test 35: score=50 → average
  it('35. score=50, avg=null → average', () => {
    expect(classifyPaymentBehavior(50, null)).toBe('average')
  })

  // Test 36: score=35 → poor
  it('36. score=35, avg=null → poor', () => {
    expect(classifyPaymentBehavior(35, null)).toBe('poor')
  })

  // Test 37: score=85, avg exactly 20 → excellent boundary
  it('37. score=85, avg=20 → excellent (boundary)', () => {
    expect(classifyPaymentBehavior(85, 20)).toBe('excellent')
  })

  // Test 38: score=85, avg=21 → good (just over avg threshold)
  it('38. score=85, avg=21 → good (avg just over 20)', () => {
    expect(classifyPaymentBehavior(85, 21)).toBe('good')
  })

  // Test 39: score=100, avg=0 → excellent
  it('39. score=100, avg=0 → excellent', () => {
    expect(classifyPaymentBehavior(100, 0)).toBe('excellent')
  })

  // Test 40: score=85, avg=null → good (null avg cannot satisfy excellent condition)
  it('40. score=85, avg=null → good (null avg means not excellent)', () => {
    expect(classifyPaymentBehavior(85, null)).toBe('good')
  })

  // Test 41: score=70 boundary → good (exactly 70)
  it('41. score=70 exactly → good', () => {
    expect(classifyPaymentBehavior(70, null)).toBe('good')
  })

  // Test 42: score=69 → average (just under good threshold)
  it('42. score=69 → average', () => {
    expect(classifyPaymentBehavior(69, null)).toBe('average')
  })

  // Test 43: score=50 exactly → average (boundary)
  it('43. score=50 exactly → average', () => {
    expect(classifyPaymentBehavior(50, null)).toBe('average')
  })

  // Test 44: score=49 → poor (just under average)
  it('44. score=49 → poor', () => {
    expect(classifyPaymentBehavior(49, null)).toBe('poor')
  })

  // Test 45: score=30 boundary → poor
  it('45. score=30 exactly → poor', () => {
    expect(classifyPaymentBehavior(30, null)).toBe('poor')
  })

  // Test 46: score=29 → unreliable (just under poor)
  it('46. score=29 → unreliable', () => {
    expect(classifyPaymentBehavior(29, null)).toBe('unreliable')
  })

  // Test 47: score=0 → unreliable
  it('47. score=0 → unreliable', () => {
    expect(classifyPaymentBehavior(0, null)).toBe('unreliable')
  })

  // Test 48: excellent requires BOTH score ≥ 85 AND avgDays ≤ 20
  it('48. score=100, avg=20 → excellent (both conditions met)', () => {
    expect(classifyPaymentBehavior(100, 20)).toBe('excellent')
  })

  // Test 49: score=84 (just under excellent threshold) → good even with low avg
  it('49. score=84, avg=5 → good (score just under 85)', () => {
    expect(classifyPaymentBehavior(84, 5)).toBe('good')
  })

  // Test 50: unreliable with a non-null avg days
  it('50. score=10, avg=120 → unreliable (score drives classification)', () => {
    expect(classifyPaymentBehavior(10, 120)).toBe('unreliable')
  })

})

// ── computeDaysToPay ──────────────────────────────────────────────────────────

describe('computeDaysToPay — pure', () => {

  // Test 51: 14 days between sale and payment
  it('51. 2026-05-01 → 2026-05-15 = 14 days', () => {
    expect(computeDaysToPay('2026-05-01', '2026-05-15')).toBe(14)
  })

  // Test 52: Paid before sale date → negative
  it('52. paid before sale date → -1', () => {
    expect(computeDaysToPay('2026-05-01', '2026-04-30')).toBe(-1)
  })

  // Test 53: Same day → 0
  it('53. paid same day → 0', () => {
    expect(computeDaysToPay('2026-05-01', '2026-05-01')).toBe(0)
  })

  // Test 54: Exactly 30 days
  it('54. 2026-01-01 → 2026-01-31 = 30 days', () => {
    expect(computeDaysToPay('2026-01-01', '2026-01-31')).toBe(30)
  })

  // Test 55: Cross-month boundary
  it('55. 2026-01-20 → 2026-02-19 = 30 days', () => {
    expect(computeDaysToPay('2026-01-20', '2026-02-19')).toBe(30)
  })

  // Test 56: Cross-year boundary
  it('56. 2025-12-01 → 2026-01-30 = 60 days', () => {
    expect(computeDaysToPay('2025-12-01', '2026-01-30')).toBe(60)
  })

  // Test 57: Long time delay
  it('57. 2025-01-01 → 2025-12-31 = 364 days', () => {
    expect(computeDaysToPay('2025-01-01', '2025-12-31')).toBe(364)
  })

  // Test 58: Handles datetime strings (trims to YYYY-MM-DD)
  it('58. datetime strings → uses only date portion', () => {
    const result = computeDaysToPay('2026-05-01T12:00:00', '2026-05-11T09:30:00')
    expect(result).toBe(10)
  })

  // Test 59: 1 day difference
  it('59. 2026-03-01 → 2026-03-02 = 1 day', () => {
    expect(computeDaysToPay('2026-03-01', '2026-03-02')).toBe(1)
  })

  // Test 60: Large negative (paid 30 days before sale)
  it('60. paid 30 days before → −30', () => {
    expect(computeDaysToPay('2026-05-31', '2026-05-01')).toBe(-30)
  })

  // Test 61: Leap year — Feb 29 to Mar 01 = 1 day
  it('61. 2024-02-29 → 2024-03-01 = 1 day (leap year)', () => {
    expect(computeDaysToPay('2024-02-29', '2024-03-01')).toBe(1)
  })

  // Test 62: End of month to start of next month
  it('62. 2026-03-31 → 2026-04-01 = 1 day', () => {
    expect(computeDaysToPay('2026-03-31', '2026-04-01')).toBe(1)
  })

})

// ── predictPaymentDate ────────────────────────────────────────────────────────

describe('predictPaymentDate — pure', () => {

  // Test 63: Expected date 15 days from sale
  it('63. 2026-05-20 + 15 days → 2026-06-04', () => {
    expect(predictPaymentDate('2026-05-20', 15)).toBe('2026-06-04')
  })

  // Test 64: null avgDaysToPay → null
  it('64. avgDaysToPay=null → null', () => {
    expect(predictPaymentDate('2026-05-20', null)).toBe(null)
  })

  // Test 65: 0 days avg → same day
  it('65. avgDaysToPay=0 → same date', () => {
    expect(predictPaymentDate('2026-05-01', 0)).toBe('2026-05-01')
  })

  // Test 66: 30 days
  it('66. 2026-01-01 + 30 days → 2026-01-31', () => {
    expect(predictPaymentDate('2026-01-01', 30)).toBe('2026-01-31')
  })

  // Test 67: 60 days cross-month boundary
  it('67. 2026-01-01 + 60 days → 2026-03-02', () => {
    expect(predictPaymentDate('2026-01-01', 60)).toBe('2026-03-02')
  })

  // Test 68: Cross-year boundary
  it('68. 2025-12-01 + 60 days → 2026-01-30', () => {
    expect(predictPaymentDate('2025-12-01', 60)).toBe('2026-01-30')
  })

  // Test 69: Negative avgDaysToPay (paid before sale date)
  it('69. negative avgDaysToPay → date in the past', () => {
    const result = predictPaymentDate('2026-05-15', -5)
    expect(result).toBe('2026-05-10')
  })

  // Test 70: Very large days prediction
  it('70. 365 days from 2026-01-01 → 2027-01-01', () => {
    expect(predictPaymentDate('2026-01-01', 365)).toBe('2027-01-01')
  })

  // Test 71: Returns ISO YYYY-MM-DD format
  it('71. returned date is in YYYY-MM-DD format', () => {
    const result = predictPaymentDate('2026-03-01', 10)
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  // Test 72: End of month → predictable rollover
  it('72. 2026-01-31 + 1 day → 2026-02-01', () => {
    expect(predictPaymentDate('2026-01-31', 1)).toBe('2026-02-01')
  })

  // Test 73: Datetime input (trims to date)
  it('73. datetime input → uses date portion only', () => {
    const result = predictPaymentDate('2026-05-01T08:00:00', 30)
    expect(result).toBe('2026-05-31')
  })

  // Test 74: 90 day standard terms
  it('74. 2026-01-01 + 90 days → 2026-04-01', () => {
    expect(predictPaymentDate('2026-01-01', 90)).toBe('2026-04-01')
  })

  // Test 75: Leap year — Feb 29 exists
  it('75. 2024-02-01 + 28 days → 2024-02-29 (leap year)', () => {
    expect(predictPaymentDate('2024-02-01', 28)).toBe('2024-02-29')
  })

  // Test 76: One week average payment
  it('76. 2026-05-01 + 7 days → 2026-05-08', () => {
    expect(predictPaymentDate('2026-05-01', 7)).toBe('2026-05-08')
  })

})

// ── computeDaysToPay — additional formula verification ────────────────────────

describe('computeDaysToPay — formula verification', () => {
  it('exact 45-day gap is computed correctly', () => {
    expect(computeDaysToPay('2026-01-01', '2026-02-15')).toBe(45)
  })

  it('same-day payment always returns 0', () => {
    const pairs: [string, string][] = [
      ['2026-01-15', '2026-01-15'],
      ['2025-06-30', '2025-06-30'],
      ['2024-12-31', '2024-12-31'],
    ]
    pairs.forEach(([s, p]) => expect(computeDaysToPay(s, p)).toBe(0))
  })

  it('31-day month gap: Jan 1 → Feb 1 = 31 days', () => {
    expect(computeDaysToPay('2026-01-01', '2026-02-01')).toBe(31)
  })

  it('28-day Feb (non-leap): Feb 1 → Mar 1 = 28 days', () => {
    expect(computeDaysToPay('2025-02-01', '2025-03-01')).toBe(28)
  })

  it('29-day Feb (leap year): Feb 1 → Mar 1 = 29 days', () => {
    expect(computeDaysToPay('2024-02-01', '2024-03-01')).toBe(29)
  })

  it('result is an integer (no fractional days)', () => {
    const result = computeDaysToPay('2026-03-10', '2026-04-20')
    expect(Number.isInteger(result)).toBe(true)
  })
})

// ── predictPaymentDate — formula: saleDate + avgDays ─────────────────────────

describe('predictPaymentDate — formula: saleDate + avgDaysToPay', () => {
  it('saleDate + 0 = same date (immediate payment expectation)', () => {
    expect(predictPaymentDate('2026-06-15', 0)).toBe('2026-06-15')
  })

  it('saleDate + 14 = two weeks later', () => {
    expect(predictPaymentDate('2026-06-01', 14)).toBe('2026-06-15')
  })

  it('null avgDaysToPay returns null (no prediction possible)', () => {
    expect(predictPaymentDate('2026-06-01', null)).toBeNull()
  })

  it('saleDate + 31 crosses into next month', () => {
    expect(predictPaymentDate('2026-06-01', 31)).toBe('2026-07-02')
  })

  it('result is always in YYYY-MM-DD format when avgDays is not null', () => {
    const res = predictPaymentDate('2026-08-20', 45)
    expect(res).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('large avgDaysToPay crosses year boundary', () => {
    const res = predictPaymentDate('2026-11-01', 120)
    expect(res).not.toBeNull()
    expect(res!.startsWith('2027')).toBe(true)
  })
})

// ── computeReliabilityScore — all on-time vs all late ────────────────────────

describe('computeReliabilityScore — all on-time vs all late extremes', () => {
  it('all on-time payments (5 records) returns 100', () => {
    const payments = Array.from({ length: 5 }, () => ({ days_to_pay: 15 }))
    expect(computeReliabilityScore(payments)).toBe(100)
  })

  it('all late >90 days (5 records) returns 0', () => {
    const payments = Array.from({ length: 5 }, () => ({ days_to_pay: 120 }))
    expect(computeReliabilityScore(payments)).toBe(0)
  })

  it('single 31-day payment yields score 95', () => {
    expect(computeReliabilityScore([{ days_to_pay: 31 }])).toBe(95)
  })

  it('single 61-day payment yields score 90', () => {
    expect(computeReliabilityScore([{ days_to_pay: 61 }])).toBe(90)
  })

  it('single 91-day payment yields score 80', () => {
    expect(computeReliabilityScore([{ days_to_pay: 91 }])).toBe(80)
  })

  it('empty history yields 100 (neutral — no data = no penalty)', () => {
    expect(computeReliabilityScore([])).toBe(100)
  })

  it('score is always an integer', () => {
    const result = computeReliabilityScore([{ days_to_pay: 45 }, { days_to_pay: 10 }])
    expect(Number.isInteger(result)).toBe(true)
  })
})

// ── classifyPaymentBehavior — all classification levels at exact boundaries ──

describe('classifyPaymentBehavior — all boundary values', () => {
  it('score=85 + avg=20 → excellent (both criteria met exactly)', () => {
    expect(classifyPaymentBehavior(85, 20)).toBe('excellent')
  })

  it('score=86 + avg=19 → excellent', () => {
    expect(classifyPaymentBehavior(86, 19)).toBe('excellent')
  })

  it('score=70 → good (lower boundary of good)', () => {
    expect(classifyPaymentBehavior(70, null)).toBe('good')
  })

  it('score=69 → average (just under good)', () => {
    expect(classifyPaymentBehavior(69, null)).toBe('average')
  })

  it('score=50 → average (lower boundary of average)', () => {
    expect(classifyPaymentBehavior(50, null)).toBe('average')
  })

  it('score=49 → poor (just under average)', () => {
    expect(classifyPaymentBehavior(49, null)).toBe('poor')
  })

  it('score=30 → poor (lower boundary of poor)', () => {
    expect(classifyPaymentBehavior(30, null)).toBe('poor')
  })

  it('score=29 → unreliable (just under poor)', () => {
    expect(classifyPaymentBehavior(29, null)).toBe('unreliable')
  })

  it('score=0 → unreliable (absolute minimum)', () => {
    expect(classifyPaymentBehavior(0, null)).toBe('unreliable')
  })

  it('score=100 + avg=0 → excellent (maximum score)', () => {
    expect(classifyPaymentBehavior(100, 0)).toBe('excellent')
  })
})
