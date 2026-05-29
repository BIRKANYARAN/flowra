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
