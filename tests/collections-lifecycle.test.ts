// ── tests/collections-lifecycle.test.ts ──────────────────────────────────────
// Pure function tests for collections-pure.ts helpers.
// Do NOT modify existing collections test files.

import { describe, it, expect } from 'vitest'
import {
  classifyAgingBucket,
  computeCollectionPriority,
  formatAgingBucket,
  sumByBucket,
} from '../lib/utils/collections-pure'

// ── classifyAgingBucket ───────────────────────────────────────────────────────

describe('classifyAgingBucket', () => {
  // current bucket
  it('returns current for 0 days overdue', () => {
    expect(classifyAgingBucket(0)).toBe('current')
  })
  it('returns current for negative days (not yet due)', () => {
    expect(classifyAgingBucket(-1)).toBe('current')
  })
  it('returns current for large negative days', () => {
    expect(classifyAgingBucket(-365)).toBe('current')
  })

  // 1_30 bucket
  it('returns 1_30 for 1 day overdue', () => {
    expect(classifyAgingBucket(1)).toBe('1_30')
  })
  it('returns 1_30 for 15 days overdue', () => {
    expect(classifyAgingBucket(15)).toBe('1_30')
  })
  it('returns 1_30 for 30 days overdue (upper boundary)', () => {
    expect(classifyAgingBucket(30)).toBe('1_30')
  })

  // 31_60 bucket
  it('returns 31_60 for 31 days overdue (lower boundary)', () => {
    expect(classifyAgingBucket(31)).toBe('31_60')
  })
  it('returns 31_60 for 45 days overdue', () => {
    expect(classifyAgingBucket(45)).toBe('31_60')
  })
  it('returns 31_60 for 60 days overdue (upper boundary)', () => {
    expect(classifyAgingBucket(60)).toBe('31_60')
  })

  // 61_90 bucket
  it('returns 61_90 for 61 days overdue (lower boundary)', () => {
    expect(classifyAgingBucket(61)).toBe('61_90')
  })
  it('returns 61_90 for 75 days overdue', () => {
    expect(classifyAgingBucket(75)).toBe('61_90')
  })
  it('returns 61_90 for 90 days overdue (upper boundary)', () => {
    expect(classifyAgingBucket(90)).toBe('61_90')
  })

  // 91_plus bucket
  it('returns 91_plus for 91 days overdue (lower boundary)', () => {
    expect(classifyAgingBucket(91)).toBe('91_plus')
  })
  it('returns 91_plus for 180 days overdue', () => {
    expect(classifyAgingBucket(180)).toBe('91_plus')
  })
  it('returns 91_plus for very large overdue', () => {
    expect(classifyAgingBucket(9999)).toBe('91_plus')
  })
})

// ── computeCollectionPriority ─────────────────────────────────────────────────

describe('computeCollectionPriority', () => {
  it('returns a number in [0, 100] range', () => {
    const score = computeCollectionPriority(500_000, 90, 0)
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(100)
  })

  it('high amount + high days + no payments = near 100', () => {
    const score = computeCollectionPriority(1_000_000, 180, 0)
    expect(score).toBe(100)
  })

  it('zero amount + zero days + has payments = 0', () => {
    const score = computeCollectionPriority(0, 0, 5)
    expect(score).toBe(0)
  })

  it('zero amount + zero days + no previous payments = 20', () => {
    const score = computeCollectionPriority(0, 0, 0)
    expect(score).toBe(20)
  })

  it('no previous payments gives higher priority than same case with payments', () => {
    const withPayments    = computeCollectionPriority(200_000, 60, 3)
    const withoutPayments = computeCollectionPriority(200_000, 60, 0)
    expect(withoutPayments).toBeGreaterThan(withPayments)
  })

  it('score increases with higher amount (same days)', () => {
    const low  = computeCollectionPriority(100_000, 30, 1)
    const high = computeCollectionPriority(900_000, 30, 1)
    expect(high).toBeGreaterThan(low)
  })

  it('score increases with more overdue days (same amount)', () => {
    const early = computeCollectionPriority(300_000, 10, 1)
    const late  = computeCollectionPriority(300_000, 120, 1)
    expect(late).toBeGreaterThan(early)
  })

  it('amount capped at 1 000 000 — extra amount does not exceed 100', () => {
    const capped     = computeCollectionPriority(1_000_000, 180, 0)
    const overCapped = computeCollectionPriority(99_000_000, 180, 0)
    expect(capped).toBe(100)
    expect(overCapped).toBe(100)
  })

  it('negative daysOverdue treated as 0 (not due yet)', () => {
    const notDue = computeCollectionPriority(500_000, -30, 1)
    const zero   = computeCollectionPriority(500_000, 0, 1)
    expect(notDue).toBe(zero)
  })

  it('returns integer (rounded)', () => {
    const score = computeCollectionPriority(123_456, 47, 2)
    expect(Number.isInteger(score)).toBe(true)
  })

  it('score is deterministic', () => {
    const a = computeCollectionPriority(400_000, 55, 0)
    const b = computeCollectionPriority(400_000, 55, 0)
    expect(a).toBe(b)
  })
})

// ── formatAgingBucket ─────────────────────────────────────────────────────────

describe('formatAgingBucket', () => {
  it('formats current bucket in Turkish', () => {
    expect(formatAgingBucket('current')).toBe('Vadesi Gelmemiş')
  })
  it('formats 1_30 bucket', () => {
    expect(formatAgingBucket('1_30')).toBe('1-30 Gün')
  })
  it('formats 31_60 bucket', () => {
    expect(formatAgingBucket('31_60')).toBe('31-60 Gün')
  })
  it('formats 61_90 bucket', () => {
    expect(formatAgingBucket('61_90')).toBe('61-90 Gün')
  })
  it('formats 91_plus bucket', () => {
    expect(formatAgingBucket('91_plus')).toBe('90+ Gün')
  })
  it('unknown bucket returns the raw string as fallback', () => {
    expect(formatAgingBucket('unknown_bucket')).toBe('unknown_bucket')
  })
})

// ── sumByBucket ───────────────────────────────────────────────────────────────

describe('sumByBucket', () => {
  it('returns empty record for empty input', () => {
    expect(sumByBucket([])).toEqual({})
  })

  it('aggregates a single item', () => {
    const result = sumByBucket([{ bucket: 'current', amount: 500 }])
    expect(result).toEqual({ current: 500 })
  })

  it('sums multiple items in the same bucket', () => {
    const result = sumByBucket([
      { bucket: '1_30', amount: 100 },
      { bucket: '1_30', amount: 200 },
      { bucket: '1_30', amount: 50 },
    ])
    expect(result['1_30']).toBe(350)
  })

  it('keeps buckets independent', () => {
    const result = sumByBucket([
      { bucket: 'current', amount: 1000 },
      { bucket: '1_30',   amount: 200 },
      { bucket: '31_60',  amount: 300 },
    ])
    expect(result['current']).toBe(1000)
    expect(result['1_30']).toBe(200)
    expect(result['31_60']).toBe(300)
  })

  it('handles all 5 standard buckets', () => {
    const items = [
      { bucket: 'current',  amount: 2_100_000 },
      { bucket: '1_30',     amount: 450_000 },
      { bucket: '31_60',    amount: 320_000 },
      { bucket: '61_90',    amount: 180_000 },
      { bucket: '91_plus',  amount: 95_000 },
    ]
    const result = sumByBucket(items)
    expect(result['current']).toBe(2_100_000)
    expect(result['1_30']).toBe(450_000)
    expect(result['31_60']).toBe(320_000)
    expect(result['61_90']).toBe(180_000)
    expect(result['91_plus']).toBe(95_000)
  })

  it('correctly accumulates mixed buckets from many rows', () => {
    const items = [
      { bucket: 'current', amount: 100 },
      { bucket: '91_plus', amount: 999 },
      { bucket: 'current', amount: 400 },
      { bucket: '91_plus', amount: 1 },
    ]
    const result = sumByBucket(items)
    expect(result['current']).toBe(500)
    expect(result['91_plus']).toBe(1000)
  })

  it('handles zero amounts', () => {
    const result = sumByBucket([
      { bucket: 'current', amount: 0 },
      { bucket: 'current', amount: 0 },
    ])
    expect(result['current']).toBe(0)
  })

  it('handles large amounts without overflow', () => {
    const result = sumByBucket([
      { bucket: '91_plus', amount: 999_999_999 },
      { bucket: '91_plus', amount: 1 },
    ])
    expect(result['91_plus']).toBe(1_000_000_000)
  })
})
