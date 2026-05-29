/**
 * Invoice Aging Service — unit tests
 *
 * Tests all pure helpers:
 *   - computeAgingDays       (due_date past/future/same-day, no due_date)
 *   - assignAgingBucket      (all 5 buckets, boundary values: 0, 30, 60, 90, 91)
 *   - computeInvoiceUrgency  (low/medium/high, cap at 100, reliability penalty)
 *   - computePortfolioRisk   (empty, single, weighted average)
 *   - estimateCollectionDays (all 4 reliability tiers + boundaries)
 *
 * No DB or network calls — all in-memory.
 */

import { describe, it, expect } from 'vitest'
import {
  computeAgingDays,
  assignAgingBucket,
  computeInvoiceUrgency,
  computePortfolioRisk,
  estimateCollectionDays,
} from '../lib/services/commercial/invoice-aging.service'

// ─────────────────────────────────────────────────────────────────────────────
// computeAgingDays
// ─────────────────────────────────────────────────────────────────────────────

describe('computeAgingDays', () => {

  // Test 1: due_date in the past — positive aging days
  it('returns positive days when due_date is in the past', () => {
    const days = computeAgingDays('2025-01-01', '2025-01-01', '2025-02-01')
    expect(days).toBe(31)
  })

  // Test 2: due_date in the future — negative aging days (not yet due)
  it('returns negative days when due_date is in the future', () => {
    const days = computeAgingDays('2025-01-01', '2025-06-01', '2025-05-01')
    expect(days).toBe(-31)
  })

  // Test 3: same day as asOf — 0 days
  it('returns 0 when due_date equals asOf', () => {
    const days = computeAgingDays('2025-01-01', '2025-03-15', '2025-03-15')
    expect(days).toBe(0)
  })

  // Test 4: no due_date — falls back to created_at
  it('uses created_at when due_date is null', () => {
    const days = computeAgingDays('2025-01-01', null, '2025-01-31')
    expect(days).toBe(30)
  })

  // Test 5: no due_date, same day as created_at — 0 days
  it('returns 0 when created_at equals asOf and no due_date', () => {
    const days = computeAgingDays('2025-05-01', null, '2025-05-01')
    expect(days).toBe(0)
  })

  // Test 6: created_at with datetime string (ISO format)
  it('handles datetime strings by slicing to date', () => {
    const days = computeAgingDays('2025-01-01T10:00:00Z', null, '2025-01-11')
    expect(days).toBe(10)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// assignAgingBucket
// ─────────────────────────────────────────────────────────────────────────────

describe('assignAgingBucket', () => {

  // Test 7: 0 days → current
  it('returns current for 0 days', () => {
    expect(assignAgingBucket(0)).toBe('current')
  })

  // Test 8: negative days → current (not yet due)
  it('returns current for negative days (future due date)', () => {
    expect(assignAgingBucket(-10)).toBe('current')
  })

  // Test 9: 1 day → overdue_30
  it('returns overdue_30 for 1 day', () => {
    expect(assignAgingBucket(1)).toBe('overdue_30')
  })

  // Test 10: boundary 30 days → overdue_30
  it('returns overdue_30 for exactly 30 days', () => {
    expect(assignAgingBucket(30)).toBe('overdue_30')
  })

  // Test 11: boundary 31 days → overdue_60
  it('returns overdue_60 for 31 days', () => {
    expect(assignAgingBucket(31)).toBe('overdue_60')
  })

  // Test 12: boundary 60 days → overdue_60
  it('returns overdue_60 for exactly 60 days', () => {
    expect(assignAgingBucket(60)).toBe('overdue_60')
  })

  // Test 13: boundary 61 days → overdue_90
  it('returns overdue_90 for 61 days', () => {
    expect(assignAgingBucket(61)).toBe('overdue_90')
  })

  // Test 14: boundary 90 days → overdue_90
  it('returns overdue_90 for exactly 90 days', () => {
    expect(assignAgingBucket(90)).toBe('overdue_90')
  })

  // Test 15: boundary 91 days → overdue_90plus
  it('returns overdue_90plus for 91 days', () => {
    expect(assignAgingBucket(91)).toBe('overdue_90plus')
  })

  // Test 16: large value → overdue_90plus
  it('returns overdue_90plus for large values', () => {
    expect(assignAgingBucket(365)).toBe('overdue_90plus')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeInvoiceUrgency
// ─────────────────────────────────────────────────────────────────────────────

describe('computeInvoiceUrgency', () => {

  // Test 17: low scenario — current invoice, small amount, reliable customer
  it('returns low urgency for current, small invoice, reliable customer', () => {
    // agingDays=0 → 0*0.5=0; amount=10000/100000*10=1; reliability=80>=60, no penalty → 1
    const score = computeInvoiceUrgency(0, 10_000, 80)
    expect(score).toBe(1)
  })

  // Test 18: medium scenario — 30 days overdue, ₺50K, average reliability
  it('returns medium urgency for 30-day overdue ₺50K average customer', () => {
    // agingDays=30 → 30*0.5=15; amount=50000/100000*10=5; reliability=65>=60, no penalty → 20
    const score = computeInvoiceUrgency(30, 50_000, 65)
    expect(score).toBe(20)
  })

  // Test 19: high scenario — 60 days overdue, ₺200K, poor customer
  it('returns high urgency for 60-day overdue ₺200K poor customer', () => {
    // aging=60 → 60*0.5=30; amount=200000/100000*10=20; reliability=40<60 → +20; total=70
    const score = computeInvoiceUrgency(60, 200_000, 40)
    expect(score).toBe(70)
  })

  // Test 20: cap at 100
  it('caps urgency at 100', () => {
    // aging=200 → min(200*0.5=100,50)=50; amount=1000000/100000*10=100→min=30; penalty=+20; total=100
    const score = computeInvoiceUrgency(200, 1_000_000, 20)
    expect(score).toBe(100)
  })

  // Test 21: reliability penalty threshold — exactly 60 (no penalty)
  it('does not apply penalty when reliability equals 60', () => {
    // aging=20 → 10; amount=0 → 0; reliability=60, no penalty → 10
    const score = computeInvoiceUrgency(20, 0, 60)
    expect(score).toBe(10)
  })

  // Test 22: reliability penalty — just below 60 (penalty applied)
  it('applies penalty when reliability is 59', () => {
    // aging=20 → 10; amount=0 → 0; reliability=59<60 → +20; total=30
    const score = computeInvoiceUrgency(20, 0, 59)
    expect(score).toBe(30)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computePortfolioRisk
// ─────────────────────────────────────────────────────────────────────────────

describe('computePortfolioRisk', () => {

  // Test 23: empty array → 0
  it('returns 0 for empty invoice list', () => {
    expect(computePortfolioRisk([])).toBe(0)
  })

  // Test 24: single invoice → same as its urgency
  it('returns urgency value for a single invoice', () => {
    const risk = computePortfolioRisk([{ urgency: 75, amount_try: 100_000 }])
    expect(risk).toBe(75)
  })

  // Test 25: weighted average — two invoices
  it('computes weighted average across two invoices', () => {
    // (80*100000 + 20*100000) / 200000 = 50
    const risk = computePortfolioRisk([
      { urgency: 80, amount_try: 100_000 },
      { urgency: 20, amount_try: 100_000 },
    ])
    expect(risk).toBe(50)
  })

  // Test 26: larger invoice dominates weighting
  it('weights by amount — larger invoice dominates', () => {
    // (10*900000 + 90*100000) / 1000000 = (9000000 + 9000000)/1000000 = 18
    const risk = computePortfolioRisk([
      { urgency: 10, amount_try: 900_000 },
      { urgency: 90, amount_try: 100_000 },
    ])
    expect(risk).toBe(18)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// estimateCollectionDays
// ─────────────────────────────────────────────────────────────────────────────

describe('estimateCollectionDays', () => {

  // Test 27: excellent tier (≥80) → 15 days
  it('returns 15 days for excellent reliability (score 80)', () => {
    expect(estimateCollectionDays(80)).toBe(15)
  })

  // Test 28: excellent tier — high score
  it('returns 15 days for score 100', () => {
    expect(estimateCollectionDays(100)).toBe(15)
  })

  // Test 29: good tier (65-79) → 25 days
  it('returns 25 days for good reliability (score 70)', () => {
    expect(estimateCollectionDays(70)).toBe(25)
  })

  // Test 30: good tier boundary (score 65) → 25 days
  it('returns 25 days for score exactly 65', () => {
    expect(estimateCollectionDays(65)).toBe(25)
  })

  // Test 31: average tier (50-64) → 45 days
  it('returns 45 days for average reliability (score 55)', () => {
    expect(estimateCollectionDays(55)).toBe(45)
  })

  // Test 32: average tier boundary (score 50) → 45 days
  it('returns 45 days for score exactly 50', () => {
    expect(estimateCollectionDays(50)).toBe(45)
  })

  // Test 33: poor tier (<50) → 75 days
  it('returns 75 days for poor reliability (score 49)', () => {
    expect(estimateCollectionDays(49)).toBe(75)
  })

  // Test 34: poor tier — score 0
  it('returns 75 days for score 0', () => {
    expect(estimateCollectionDays(0)).toBe(75)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeAgingDays — additional edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe('computeAgingDays — threshold boundary checks', () => {

  it('handles a full year gap (366 days — 2024 is a leap year)', () => {
    // 2024 is a leap year: Jan 1 2024 → Jan 1 2025 = 366 days
    const days = computeAgingDays('2024-01-01', '2024-01-01', '2025-01-01')
    expect(days).toBe(366)
  })

  it('handles a leap-year partial gap (Jan 1 to Dec 31 = 365 days)', () => {
    // 2024 is a leap year — Jan 1 to Dec 31 = 365 days
    const days = computeAgingDays('2024-01-01', '2024-01-01', '2024-12-31')
    expect(days).toBe(365)
  })

  it('handles end-of-month boundary (Feb 28 → Mar 1 = 1 day)', () => {
    const days = computeAgingDays('2025-02-28', '2025-02-28', '2025-03-01')
    expect(days).toBe(1)
  })

  it('handles end-of-month boundary for leap year (Feb 29 → Mar 1 = 1 day)', () => {
    const days = computeAgingDays('2024-02-29', '2024-02-29', '2024-03-01')
    expect(days).toBe(1)
  })

  it('due_date one day before asOf → 1 day aging', () => {
    const days = computeAgingDays('2025-01-01', '2025-03-14', '2025-03-15')
    expect(days).toBe(1)
  })

  it('due_date one day after asOf → -1 day aging (not yet overdue)', () => {
    const days = computeAgingDays('2025-01-01', '2025-03-16', '2025-03-15')
    expect(days).toBe(-1)
  })

  it('no due_date, created_at is future → negative aging days', () => {
    const days = computeAgingDays('2025-06-01', null, '2025-05-01')
    expect(days).toBe(-31)
  })

  it('large date gap when no due_date — uses created_at', () => {
    // 2023-01-01 → 2025-01-01: 2024 is leap (366 days) + 365 days = 731 days
    const days = computeAgingDays('2023-01-01', null, '2025-01-01')
    expect(days).toBe(731)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// assignAgingBucket — additional edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe('assignAgingBucket — zero, negative, and large values', () => {

  it('returns current for very large negative value (far future due date)', () => {
    expect(assignAgingBucket(-999)).toBe('current')
  })

  it('returns overdue_60 for exactly 31 and exactly 60', () => {
    expect(assignAgingBucket(31)).toBe('overdue_60')
    expect(assignAgingBucket(60)).toBe('overdue_60')
  })

  it('returns overdue_90 for exactly 61 and exactly 90', () => {
    expect(assignAgingBucket(61)).toBe('overdue_90')
    expect(assignAgingBucket(90)).toBe('overdue_90')
  })

  it('returns overdue_90plus for 92 days', () => {
    expect(assignAgingBucket(92)).toBe('overdue_90plus')
  })

  it('returns overdue_90plus for 1000 days', () => {
    expect(assignAgingBucket(1000)).toBe('overdue_90plus')
  })

  it('all 5 bucket values are covered by representative inputs', () => {
    const results = new Set([
      assignAgingBucket(-5),
      assignAgingBucket(15),
      assignAgingBucket(45),
      assignAgingBucket(75),
      assignAgingBucket(120),
    ])
    expect(results.size).toBe(5)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeInvoiceUrgency — additional edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe('computeInvoiceUrgency — zero/negative inputs and ceiling behaviour', () => {

  it('returns 0 for all-zero inputs', () => {
    expect(computeInvoiceUrgency(0, 0, 100)).toBe(0)
  })

  it('negative aging days are treated as 0 (not overdue)', () => {
    const score = computeInvoiceUrgency(-30, 0, 100)
    expect(score).toBe(0)
  })

  it('amount cap: amounts above ₺300K still cap at 30 for amount component', () => {
    // ₺1 000 000 → 100 points raw, but capped at 30
    // aging=0, reliability=100 → 0 + 30 + 0 = 30
    const score = computeInvoiceUrgency(0, 1_000_000, 100)
    expect(score).toBe(30)
  })

  it('aging cap: aging of 200 days caps at 50 for aging component', () => {
    // aging=200 → min(100, 50) = 50; amount=0; no penalty → 50
    const score = computeInvoiceUrgency(200, 0, 100)
    expect(score).toBe(50)
  })

  it('reliability=0 adds penalty of 20', () => {
    // aging=10 → 5; amount=0; penalty=20 → 25
    const score = computeInvoiceUrgency(10, 0, 0)
    expect(score).toBe(25)
  })

  it('reliability=100 adds no penalty', () => {
    // aging=10 → 5; amount=0; no penalty → 5
    const score = computeInvoiceUrgency(10, 0, 100)
    expect(score).toBe(5)
  })

  it('sum that would exceed 100 is capped at exactly 100', () => {
    // aging=100 → 50; amount=1000000 → 30; penalty=20 → 100
    const score = computeInvoiceUrgency(100, 1_000_000, 0)
    expect(score).toBe(100)
  })

  it('score is always a non-negative integer', () => {
    for (const [aging, amount, reliability] of [
      [0, 0, 100], [-5, 0, 100], [45, 50_000, 70], [91, 200_000, 30],
    ] as Array<[number, number, number]>) {
      const score = computeInvoiceUrgency(aging, amount, reliability)
      expect(score).toBeGreaterThanOrEqual(0)
      expect(Number.isInteger(score)).toBe(true)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computePortfolioRisk — additional edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe('computePortfolioRisk — zero amounts and rounding', () => {

  it('returns 0 when all invoices have amount 0', () => {
    const risk = computePortfolioRisk([
      { urgency: 80, amount_try: 0 },
      { urgency: 20, amount_try: 0 },
    ])
    expect(risk).toBe(0)
  })

  it('returns the single invoice urgency when only one invoice exists', () => {
    expect(computePortfolioRisk([{ urgency: 42, amount_try: 1_000 }])).toBe(42)
  })

  it('small invoice with high urgency does not dominate large low-urgency invoice', () => {
    // (10 × 900_000 + 90 × 100_000) / 1_000_000 = 18
    const risk = computePortfolioRisk([
      { urgency: 10, amount_try: 900_000 },
      { urgency: 90, amount_try: 100_000 },
    ])
    expect(risk).toBe(18)
  })

  it('risk is capped at 100 even when computed weighted average exceeds 100', () => {
    // Can't normally exceed 100 since urgency is 0-100, but test cap guard
    const risk = computePortfolioRisk([
      { urgency: 100, amount_try: 1_000_000 },
    ])
    expect(risk).toBeLessThanOrEqual(100)
  })

  it('3 equal-weight invoices produce their average urgency', () => {
    const risk = computePortfolioRisk([
      { urgency: 10, amount_try: 100 },
      { urgency: 50, amount_try: 100 },
      { urgency: 90, amount_try: 100 },
    ])
    // (10+50+90)/3 = 50
    expect(risk).toBe(50)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// estimateCollectionDays — boundary confirmation
// ─────────────────────────────────────────────────────────────────────────────

describe('estimateCollectionDays — exhaustive tier boundaries', () => {

  it('tier excellent: boundary at 79 returns 45 days (good tier)', () => {
    expect(estimateCollectionDays(79)).toBe(25)
  })

  it('tier excellent: boundary at 80 returns 15 days', () => {
    expect(estimateCollectionDays(80)).toBe(15)
  })

  it('tier good: boundary at 64 returns 45 days (average tier)', () => {
    expect(estimateCollectionDays(64)).toBe(45)
  })

  it('tier good: boundary at 65 returns 25 days', () => {
    expect(estimateCollectionDays(65)).toBe(25)
  })

  it('tier average: boundary at 49 returns 75 days (poor tier)', () => {
    expect(estimateCollectionDays(49)).toBe(75)
  })

  it('tier average: boundary at 50 returns 45 days', () => {
    expect(estimateCollectionDays(50)).toBe(45)
  })

  it('only 4 unique return values exist across all inputs', () => {
    const values = new Set(
      [0, 10, 30, 49, 50, 55, 64, 65, 70, 79, 80, 90, 100].map(estimateCollectionDays),
    )
    expect(values.size).toBe(4)
    expect([...values].sort((a, b) => a - b)).toEqual([15, 25, 45, 75])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeAgingDays — explicit day range tests (0, 30, 60, 90, 91+)
// ─────────────────────────────────────────────────────────────────────────────

describe('computeAgingDays — key day ranges', () => {

  it('returns 0 for same-day due date', () => {
    expect(computeAgingDays('2026-01-01', '2026-06-15', '2026-06-15')).toBe(0)
  })

  it('returns 30 for due_date 30 days before asOf', () => {
    expect(computeAgingDays('2026-01-01', '2026-05-01', '2026-05-31')).toBe(30)
  })

  it('returns 60 for due_date 60 days before asOf', () => {
    expect(computeAgingDays('2026-01-01', '2026-04-01', '2026-05-31')).toBe(60)
  })

  it('returns 90 for due_date 90 days before asOf', () => {
    expect(computeAgingDays('2026-01-01', '2026-03-02', '2026-05-31')).toBe(90)
  })

  it('returns 91 for due_date 91 days before asOf', () => {
    expect(computeAgingDays('2026-01-01', '2026-03-01', '2026-05-31')).toBe(91)
  })

  it('returns negative days for future due date', () => {
    // due 15 days from now
    const days = computeAgingDays('2026-01-01', '2026-06-30', '2026-06-15')
    expect(days).toBeLessThan(0)
    expect(days).toBe(-15)
  })

  it('no due_date — uses created_at, returns 0 for same day', () => {
    expect(computeAgingDays('2026-06-15', null, '2026-06-15')).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// assignAgingBucket — all 5 bucket boundaries exactly
// ─────────────────────────────────────────────────────────────────────────────

describe('assignAgingBucket — all 5 bucket boundary checks', () => {

  // Boundary 0: current
  it('boundary 0 → current', () => {
    expect(assignAgingBucket(0)).toBe('current')
  })

  // Boundary 1: start of overdue_30
  it('boundary 1 → overdue_30', () => {
    expect(assignAgingBucket(1)).toBe('overdue_30')
  })

  // Boundary 30: end of overdue_30
  it('boundary 30 → overdue_30', () => {
    expect(assignAgingBucket(30)).toBe('overdue_30')
  })

  // Boundary 31: start of overdue_60
  it('boundary 31 → overdue_60', () => {
    expect(assignAgingBucket(31)).toBe('overdue_60')
  })

  // Boundary 60: end of overdue_60
  it('boundary 60 → overdue_60', () => {
    expect(assignAgingBucket(60)).toBe('overdue_60')
  })

  // Boundary 61: start of overdue_90
  it('boundary 61 → overdue_90', () => {
    expect(assignAgingBucket(61)).toBe('overdue_90')
  })

  // Boundary 90: end of overdue_90
  it('boundary 90 → overdue_90', () => {
    expect(assignAgingBucket(90)).toBe('overdue_90')
  })

  // Boundary 91: start of overdue_90plus
  it('boundary 91 → overdue_90plus', () => {
    expect(assignAgingBucket(91)).toBe('overdue_90plus')
  })

  // Negative value → current
  it('negative value → current', () => {
    expect(assignAgingBucket(-1)).toBe('current')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeInvoiceUrgency — urgency capped at 100
// ─────────────────────────────────────────────────────────────────────────────

describe('computeInvoiceUrgency — capped at 100', () => {

  it('max aging + max amount + penalty = capped at 100', () => {
    // aging=1000 → min(500,50)=50; amount=10M → min(1000,30)=30; penalty=20 → 100
    const score = computeInvoiceUrgency(1000, 10_000_000, 0)
    expect(score).toBe(100)
  })

  it('very old invoice with large amount still caps at 100', () => {
    const score = computeInvoiceUrgency(500, 5_000_000, 10)
    expect(score).toBe(100)
  })

  it('score never exceeds 100 for any combination of inputs', () => {
    const testCases = [
      [200, 500_000, 0],
      [100, 300_000, 0],
      [50, 0, 0],
      [91, 200_000, 30],
    ]
    for (const [aging, amount, reliability] of testCases) {
      expect(computeInvoiceUrgency(aging, amount, reliability)).toBeLessThanOrEqual(100)
    }
  })

  it('urgency is always a non-negative integer', () => {
    const cases = [
      [0, 0, 100],
      [30, 50_000, 70],
      [91, 0, 0],
    ]
    for (const [a, b, c] of cases) {
      const score = computeInvoiceUrgency(a, b, c)
      expect(score).toBeGreaterThanOrEqual(0)
      expect(Number.isInteger(score)).toBe(true)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// estimateCollectionDays — monotonically decreasing with score
// ─────────────────────────────────────────────────────────────────────────────

describe('estimateCollectionDays — monotonically decreasing with reliability score', () => {

  it('higher reliability always gives ≤ collection days than lower reliability', () => {
    // tiers: poor<average<good<excellent
    const poor    = estimateCollectionDays(30)
    const average = estimateCollectionDays(55)
    const good    = estimateCollectionDays(70)
    const excellent = estimateCollectionDays(85)

    expect(poor).toBeGreaterThanOrEqual(average)
    expect(average).toBeGreaterThanOrEqual(good)
    expect(good).toBeGreaterThanOrEqual(excellent)
  })

  it('score 0 gives maximum collection days (75)', () => {
    expect(estimateCollectionDays(0)).toBe(75)
  })

  it('score 100 gives minimum collection days (15)', () => {
    expect(estimateCollectionDays(100)).toBe(15)
  })

  it('all outputs are positive numbers', () => {
    const scores = [0, 10, 49, 50, 64, 65, 79, 80, 100]
    for (const s of scores) {
      expect(estimateCollectionDays(s)).toBeGreaterThan(0)
    }
  })

  it('function returns one of exactly 4 possible values', () => {
    const allScores = Array.from({ length: 101 }, (_, i) => i)
    const outputs = new Set(allScores.map(estimateCollectionDays))
    expect(outputs.size).toBe(4)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computePortfolioRisk — weighted average formula verification
// ─────────────────────────────────────────────────────────────────────────────

describe('computePortfolioRisk — weighted average formula', () => {

  it('weighted average: (u1*a1 + u2*a2) / (a1+a2)', () => {
    // (60*200 + 40*300) / 500 = (12000+12000)/500 = 48
    const risk = computePortfolioRisk([
      { urgency: 60, amount_try: 200 },
      { urgency: 40, amount_try: 300 },
    ])
    expect(risk).toBeCloseTo(48, 1)
  })

  it('single-invoice portfolio: risk = its urgency', () => {
    expect(computePortfolioRisk([{ urgency: 73, amount_try: 500_000 }])).toBe(73)
  })

  it('equal weights: risk is arithmetic mean of urgencies', () => {
    // All same amount → plain average
    const risk = computePortfolioRisk([
      { urgency: 20, amount_try: 100 },
      { urgency: 80, amount_try: 100 },
    ])
    expect(risk).toBe(50)
  })

  it('all zero amounts: risk = 0', () => {
    expect(computePortfolioRisk([
      { urgency: 100, amount_try: 0 },
      { urgency: 50, amount_try: 0 },
    ])).toBe(0)
  })

  it('3-invoice weighted average computed correctly', () => {
    // (10*1000 + 50*2000 + 90*1000) / 4000 = (10000+100000+90000)/4000 = 50
    const risk = computePortfolioRisk([
      { urgency: 10, amount_try: 1_000 },
      { urgency: 50, amount_try: 2_000 },
      { urgency: 90, amount_try: 1_000 },
    ])
    expect(risk).toBe(50)
  })

  it('empty list returns 0', () => {
    expect(computePortfolioRisk([])).toBe(0)
  })
})
