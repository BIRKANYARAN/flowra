/**
 * AP Aging Service — unit tests
 *
 * Tests pure helpers:
 *   - assignAPBucket       (5 cases + edge cases)
 *   - buildBucketSummaries (empty, single bucket, spread, zero total)
 *   - computeAvgDaysOutstanding (empty → null, normal average)
 *
 * No DB or network calls — all in-memory.
 */

import { describe, it, expect } from 'vitest'
import {
  assignAPBucket,
  buildBucketSummaries,
  computeAvgDaysOutstanding,
} from '../lib/services/finance/ap-aging.service'
import type { APAgingEntry } from '../lib/services/finance/ap-aging.service'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEntry(overrides: Partial<APAgingEntry> = {}): APAgingEntry {
  const days = overrides.days_outstanding ?? 0
  return {
    id:               'entry-1',
    supplier_name:    'Test Tedarikçi',
    expense_type:     'rent',
    amount_try:       1000,
    expense_date:     '2026-01-01',
    days_outstanding: days,
    bucket:           assignAPBucket(days),
    payment_status:   'pending',
    description:      null,
    category:         null,
    ...overrides,
  }
}

// ── assignAPBucket ────────────────────────────────────────────────────────────

describe('assignAPBucket — pure bucket assignment', () => {

  // Test 1: day 0 → current
  it('1. day 0 → "current"', () => {
    expect(assignAPBucket(0)).toBe('current')
  })

  // Test 2: negative days (future-dated) → current
  it('2. negative days (future-dated, e.g. -5) → "current"', () => {
    expect(assignAPBucket(-5)).toBe('current')
  })

  // Test 3: day 1 → days_1_30
  it('3. day 1 → "days_1_30"', () => {
    expect(assignAPBucket(1)).toBe('days_1_30')
  })

  // Test 4: day 30 (edge) → days_1_30
  it('4. day 30 (edge) → "days_1_30"', () => {
    expect(assignAPBucket(30)).toBe('days_1_30')
  })

  // Test 5: day 31 (edge) → days_31_60
  it('5. day 31 (edge) → "days_31_60"', () => {
    expect(assignAPBucket(31)).toBe('days_31_60')
  })

  // Test 6: day 60 (edge) → days_31_60
  it('6. day 60 (edge) → "days_31_60"', () => {
    expect(assignAPBucket(60)).toBe('days_31_60')
  })

  // Test 7: day 61 (edge) → days_61_90
  it('7. day 61 (edge) → "days_61_90"', () => {
    expect(assignAPBucket(61)).toBe('days_61_90')
  })

  // Test 8: day 90 (edge) → days_61_90
  it('8. day 90 (edge) → "days_61_90"', () => {
    expect(assignAPBucket(90)).toBe('days_61_90')
  })

  // Test 9: day 91 (edge) → days_91_plus
  it('9. day 91 (edge) → "days_91_plus"', () => {
    expect(assignAPBucket(91)).toBe('days_91_plus')
  })

  // Test 10: large value → days_91_plus
  it('10. day 365 → "days_91_plus"', () => {
    expect(assignAPBucket(365)).toBe('days_91_plus')
  })
})

// ── buildBucketSummaries ──────────────────────────────────────────────────────

describe('buildBucketSummaries — bucket aggregation', () => {

  // Test 11: empty entries → all 5 buckets with zeros, no division by zero
  it('11. empty entries → all 5 buckets with 0 totals (no division by zero)', () => {
    const summaries = buildBucketSummaries([], 0)
    expect(summaries).toHaveLength(5)
    for (const s of summaries) {
      expect(s.total_try).toBe(0)
      expect(s.count).toBe(0)
      expect(s.pct_of_total).toBe(0)
    }
  })

  // Test 12: all entries in one bucket → that bucket has 100%, others 0%
  it('12. all entries in days_91_plus → that bucket is 100%, others 0%', () => {
    const entries = [
      makeEntry({ id: 'a', amount_try: 500,  days_outstanding: 100, bucket: 'days_91_plus' }),
      makeEntry({ id: 'b', amount_try: 1500, days_outstanding: 120, bucket: 'days_91_plus' }),
    ]
    const total = 2000
    const summaries = buildBucketSummaries(entries, total)
    const over90 = summaries.find(s => s.bucket === 'days_91_plus')!
    expect(over90.total_try).toBe(2000)
    expect(over90.count).toBe(2)
    expect(over90.pct_of_total).toBe(100)

    // All other buckets are 0%
    for (const s of summaries.filter(x => x.bucket !== 'days_91_plus')) {
      expect(s.total_try).toBe(0)
      expect(s.pct_of_total).toBe(0)
    }
  })

  // Test 13: spread across buckets → percentages sum to ~100%
  it('13. entries spread across buckets → pct_of_total sums to ~100%', () => {
    const entries = [
      makeEntry({ id: 'a', amount_try: 200,  days_outstanding: 0,  bucket: 'current' }),
      makeEntry({ id: 'b', amount_try: 300,  days_outstanding: 15, bucket: 'days_1_30' }),
      makeEntry({ id: 'c', amount_try: 250,  days_outstanding: 45, bucket: 'days_31_60' }),
      makeEntry({ id: 'd', amount_try: 150,  days_outstanding: 75, bucket: 'days_61_90' }),
      makeEntry({ id: 'e', amount_try: 100,  days_outstanding: 95, bucket: 'days_91_plus' }),
    ]
    const total = 1000
    const summaries = buildBucketSummaries(entries, total)

    const sumPct = summaries.reduce((acc, s) => acc + s.pct_of_total, 0)
    expect(sumPct).toBeCloseTo(100, 1)

    const current = summaries.find(s => s.bucket === 'current')!
    expect(current.total_try).toBe(200)
    expect(current.pct_of_total).toBe(20)

    const d91 = summaries.find(s => s.bucket === 'days_91_plus')!
    expect(d91.total_try).toBe(100)
    expect(d91.pct_of_total).toBe(10)
  })

  // Test 14: zero total does not cause NaN (no division by zero)
  it('14. non-empty entries but totalOutstanding=0 → pct_of_total stays 0 (no NaN)', () => {
    const entries = [
      makeEntry({ id: 'a', amount_try: 0, days_outstanding: 10, bucket: 'days_1_30' }),
    ]
    const summaries = buildBucketSummaries(entries, 0)
    for (const s of summaries) {
      expect(Number.isNaN(s.pct_of_total)).toBe(false)
      expect(s.pct_of_total).toBe(0)
    }
  })

  // Test 15: Turkish labels are set correctly
  it('15. bucket labels match expected Turkish strings', () => {
    const summaries = buildBucketSummaries([], 0)
    const labelMap = Object.fromEntries(summaries.map(s => [s.bucket, s.label]))
    expect(labelMap['current']).toBe('Güncel')
    expect(labelMap['days_1_30']).toBe('1-30 Gün')
    expect(labelMap['days_31_60']).toBe('31-60 Gün')
    expect(labelMap['days_61_90']).toBe('61-90 Gün')
    expect(labelMap['days_91_plus']).toBe('90+ Gün')
  })

  // Test 16: bucket order is always current → days_1_30 → ... → days_91_plus
  it('16. buckets are always returned in the canonical order', () => {
    const summaries = buildBucketSummaries([], 0)
    const order = summaries.map(s => s.bucket)
    expect(order).toEqual(['current', 'days_1_30', 'days_31_60', 'days_61_90', 'days_91_plus'])
  })
})

// ── computeAvgDaysOutstanding ─────────────────────────────────────────────────

describe('computeAvgDaysOutstanding — average computation', () => {

  // Test 17: empty array → null
  it('17. empty array → null', () => {
    expect(computeAvgDaysOutstanding([])).toBeNull()
  })

  // Test 18: single entry → that entry's days_outstanding
  it('18. single entry with 45 days → 45', () => {
    const entries = [makeEntry({ days_outstanding: 45 })]
    expect(computeAvgDaysOutstanding(entries)).toBe(45)
  })

  // Test 19: multiple entries → arithmetic mean
  it('19. entries [10, 20, 30] → avg = 20', () => {
    const entries = [
      makeEntry({ id: 'a', days_outstanding: 10 }),
      makeEntry({ id: 'b', days_outstanding: 20 }),
      makeEntry({ id: 'c', days_outstanding: 30 }),
    ]
    expect(computeAvgDaysOutstanding(entries)).toBe(20)
  })

  // Test 20: fractional average rounded to 2 decimal places
  it('20. entries [1, 2] → avg = 1.5', () => {
    const entries = [
      makeEntry({ id: 'a', days_outstanding: 1 }),
      makeEntry({ id: 'b', days_outstanding: 2 }),
    ]
    expect(computeAvgDaysOutstanding(entries)).toBe(1.5)
  })

  // Test 21: entries including negatives (future-dated) — avg can be fractional
  it('21. entries [-5, 95] → avg = 45', () => {
    const entries = [
      makeEntry({ id: 'a', days_outstanding: -5 }),
      makeEntry({ id: 'b', days_outstanding: 95 }),
    ]
    expect(computeAvgDaysOutstanding(entries)).toBe(45)
  })
})
