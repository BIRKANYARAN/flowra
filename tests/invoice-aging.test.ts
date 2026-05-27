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
