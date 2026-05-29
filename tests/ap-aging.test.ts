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

  it('22. all zero days → avg = 0', () => {
    const entries = [
      makeEntry({ id: 'a', days_outstanding: 0 }),
      makeEntry({ id: 'b', days_outstanding: 0 }),
      makeEntry({ id: 'c', days_outstanding: 0 }),
    ]
    expect(computeAvgDaysOutstanding(entries)).toBe(0)
  })

  it('23. large values: [100, 200, 300] → avg = 200', () => {
    const entries = [
      makeEntry({ id: 'a', days_outstanding: 100 }),
      makeEntry({ id: 'b', days_outstanding: 200 }),
      makeEntry({ id: 'c', days_outstanding: 300 }),
    ]
    expect(computeAvgDaysOutstanding(entries)).toBe(200)
  })

  it('24. rounding precision: [1, 2, 3, 4] → avg = 2.5', () => {
    const entries = [
      makeEntry({ id: 'a', days_outstanding: 1 }),
      makeEntry({ id: 'b', days_outstanding: 2 }),
      makeEntry({ id: 'c', days_outstanding: 3 }),
      makeEntry({ id: 'd', days_outstanding: 4 }),
    ]
    expect(computeAvgDaysOutstanding(entries)).toBeCloseTo(2.5, 2)
  })

  it('25. single entry with 0 days → 0', () => {
    expect(computeAvgDaysOutstanding([makeEntry({ days_outstanding: 0 })])).toBe(0)
  })

  it('26. single entry with 91 days → 91', () => {
    expect(computeAvgDaysOutstanding([makeEntry({ days_outstanding: 91 })])).toBe(91)
  })

  it('27. five entries all 30 days → avg = 30', () => {
    const entries = Array.from({ length: 5 }, (_, i) => makeEntry({ id: `e${i}`, days_outstanding: 30 }))
    expect(computeAvgDaysOutstanding(entries)).toBe(30)
  })
})

// ── assignAPBucket — additional boundary tests ────────────────────────────────

describe('assignAPBucket — extended boundary cases', () => {

  it('28. day -1 (future by 1) → "current"', () => {
    expect(assignAPBucket(-1)).toBe('current')
  })

  it('29. day -100 (far future) → "current"', () => {
    expect(assignAPBucket(-100)).toBe('current')
  })

  it('30. day 29 → "days_1_30"', () => {
    expect(assignAPBucket(29)).toBe('days_1_30')
  })

  it('31. day 32 → "days_31_60"', () => {
    expect(assignAPBucket(32)).toBe('days_31_60')
  })

  it('32. day 59 → "days_31_60"', () => {
    expect(assignAPBucket(59)).toBe('days_31_60')
  })

  it('33. day 62 → "days_61_90"', () => {
    expect(assignAPBucket(62)).toBe('days_61_90')
  })

  it('34. day 89 → "days_61_90"', () => {
    expect(assignAPBucket(89)).toBe('days_61_90')
  })

  it('35. day 92 → "days_91_plus"', () => {
    expect(assignAPBucket(92)).toBe('days_91_plus')
  })

  it('36. day 500 → "days_91_plus"', () => {
    expect(assignAPBucket(500)).toBe('days_91_plus')
  })

  it('37. day 1000 → "days_91_plus"', () => {
    expect(assignAPBucket(1000)).toBe('days_91_plus')
  })
})

// ── buildBucketSummaries — extended tests ─────────────────────────────────────

describe('buildBucketSummaries — extended coverage', () => {

  it('38. single entry in "current" bucket → current count=1, others=0', () => {
    const entries = [makeEntry({ id: 'a', amount_try: 5000, days_outstanding: 0, bucket: 'current' })]
    const summaries = buildBucketSummaries(entries, 5000)
    const current = summaries.find(s => s.bucket === 'current')!
    expect(current.count).toBe(1)
    expect(current.total_try).toBe(5000)
    expect(current.pct_of_total).toBe(100)
  })

  it('39. single entry in "days_1_30" bucket', () => {
    const entries = [makeEntry({ id: 'a', amount_try: 1000, days_outstanding: 15, bucket: 'days_1_30' })]
    const summaries = buildBucketSummaries(entries, 1000)
    const bucket = summaries.find(s => s.bucket === 'days_1_30')!
    expect(bucket.count).toBe(1)
    expect(bucket.total_try).toBe(1000)
  })

  it('40. single entry in "days_61_90" bucket', () => {
    const entries = [makeEntry({ id: 'a', amount_try: 750, days_outstanding: 80, bucket: 'days_61_90' })]
    const summaries = buildBucketSummaries(entries, 750)
    const bucket = summaries.find(s => s.bucket === 'days_61_90')!
    expect(bucket.count).toBe(1)
    expect(bucket.total_try).toBe(750)
    expect(bucket.pct_of_total).toBe(100)
  })

  it('41. multiple entries same bucket accumulate total', () => {
    const entries = [
      makeEntry({ id: 'a', amount_try: 300, days_outstanding: 10, bucket: 'days_1_30' }),
      makeEntry({ id: 'b', amount_try: 700, days_outstanding: 25, bucket: 'days_1_30' }),
    ]
    const summaries = buildBucketSummaries(entries, 1000)
    const bucket = summaries.find(s => s.bucket === 'days_1_30')!
    expect(bucket.count).toBe(2)
    expect(bucket.total_try).toBe(1000)
    expect(bucket.pct_of_total).toBe(100)
  })

  it('42. pct_of_total rounds to 2 decimal places', () => {
    const entries = [
      makeEntry({ id: 'a', amount_try: 100, days_outstanding: 5,  bucket: 'days_1_30' }),
      makeEntry({ id: 'b', amount_try: 200, days_outstanding: 50, bucket: 'days_31_60' }),
    ]
    const summaries = buildBucketSummaries(entries, 300)
    const bucket1 = summaries.find(s => s.bucket === 'days_1_30')!
    const bucket2 = summaries.find(s => s.bucket === 'days_31_60')!
    expect(bucket1.pct_of_total).toBeCloseTo(33.33, 1)
    expect(bucket2.pct_of_total).toBeCloseTo(66.67, 1)
  })

  it('43. always returns exactly 5 buckets regardless of entries', () => {
    const entries = [makeEntry({ id: 'a', amount_try: 100, days_outstanding: 200, bucket: 'days_91_plus' })]
    expect(buildBucketSummaries(entries, 100)).toHaveLength(5)
  })

  it('44. bucket with no entries has count=0 and total_try=0', () => {
    const entries = [makeEntry({ id: 'a', amount_try: 100, days_outstanding: 5, bucket: 'days_1_30' })]
    const summaries = buildBucketSummaries(entries, 100)
    const current = summaries.find(s => s.bucket === 'current')!
    expect(current.count).toBe(0)
    expect(current.total_try).toBe(0)
    expect(current.pct_of_total).toBe(0)
  })

  it('45. fractional amounts round correctly', () => {
    const entries = [
      makeEntry({ id: 'a', amount_try: 333.333, days_outstanding: 5,  bucket: 'days_1_30' }),
      makeEntry({ id: 'b', amount_try: 333.333, days_outstanding: 40, bucket: 'days_31_60' }),
      makeEntry({ id: 'c', amount_try: 333.334, days_outstanding: 70, bucket: 'days_61_90' }),
    ]
    const total = 999.999 + 0.001
    const summaries = buildBucketSummaries(entries, 1000)
    for (const s of summaries) {
      expect(Number.isFinite(s.total_try)).toBe(true)
      expect(Number.isFinite(s.pct_of_total)).toBe(true)
    }
  })

  it('46. large number of entries in one bucket accumulate correctly', () => {
    const entries = Array.from({ length: 10 }, (_, i) =>
      makeEntry({ id: `e${i}`, amount_try: 1000, days_outstanding: 5, bucket: 'days_1_30' })
    )
    const summaries = buildBucketSummaries(entries, 10000)
    const bucket = summaries.find(s => s.bucket === 'days_1_30')!
    expect(bucket.count).toBe(10)
    expect(bucket.total_try).toBe(10000)
    expect(bucket.pct_of_total).toBe(100)
  })

  it('47. total outstanding computed from passed param, not sum of entries', () => {
    const entries = [makeEntry({ id: 'a', amount_try: 1000, days_outstanding: 5, bucket: 'days_1_30' })]
    // Pass totalOutstanding = 2000 (double the entry amount)
    const summaries = buildBucketSummaries(entries, 2000)
    const bucket = summaries.find(s => s.bucket === 'days_1_30')!
    expect(bucket.pct_of_total).toBe(50)  // 1000/2000 × 100
  })

  it('48. two entries with different amounts have correct relative pct', () => {
    const entries = [
      makeEntry({ id: 'a', amount_try: 250, days_outstanding: 50, bucket: 'days_31_60' }),
      makeEntry({ id: 'b', amount_try: 750, days_outstanding: 95, bucket: 'days_91_plus' }),
    ]
    const summaries = buildBucketSummaries(entries, 1000)
    const b1 = summaries.find(s => s.bucket === 'days_31_60')!
    const b2 = summaries.find(s => s.bucket === 'days_91_plus')!
    expect(b1.pct_of_total).toBe(25)
    expect(b2.pct_of_total).toBe(75)
  })

  it('49. entries with amount_try=0 contribute count but no total', () => {
    const entries = [
      makeEntry({ id: 'a', amount_try: 0, days_outstanding: 10, bucket: 'days_1_30' }),
      makeEntry({ id: 'b', amount_try: 500, days_outstanding: 10, bucket: 'days_1_30' }),
    ]
    const summaries = buildBucketSummaries(entries, 500)
    const bucket = summaries.find(s => s.bucket === 'days_1_30')!
    expect(bucket.count).toBe(2)
    expect(bucket.total_try).toBe(500)
  })

  it('50. current bucket can have high outstanding amount', () => {
    const entries = [
      makeEntry({ id: 'a', amount_try: 999999, days_outstanding: 0, bucket: 'current' }),
    ]
    const summaries = buildBucketSummaries(entries, 999999)
    const bucket = summaries.find(s => s.bucket === 'current')!
    expect(bucket.total_try).toBe(999999)
    expect(bucket.pct_of_total).toBe(100)
  })

  it('51. pct_of_total for all buckets sums to exactly 100 for even split', () => {
    const entries = [
      makeEntry({ id: 'a', amount_try: 200, days_outstanding: 0,  bucket: 'current' }),
      makeEntry({ id: 'b', amount_try: 200, days_outstanding: 15, bucket: 'days_1_30' }),
      makeEntry({ id: 'c', amount_try: 200, days_outstanding: 45, bucket: 'days_31_60' }),
      makeEntry({ id: 'd', amount_try: 200, days_outstanding: 75, bucket: 'days_61_90' }),
      makeEntry({ id: 'e', amount_try: 200, days_outstanding: 95, bucket: 'days_91_plus' }),
    ]
    const summaries = buildBucketSummaries(entries, 1000)
    const sumPct = summaries.reduce((acc, s) => acc + s.pct_of_total, 0)
    expect(sumPct).toBeCloseTo(100, 2)
  })

  it('52. entries across 3 buckets leave other 2 empty', () => {
    const entries = [
      makeEntry({ id: 'a', amount_try: 100, days_outstanding: 10, bucket: 'days_1_30' }),
      makeEntry({ id: 'b', amount_try: 200, days_outstanding: 50, bucket: 'days_31_60' }),
      makeEntry({ id: 'c', amount_try: 300, days_outstanding: 95, bucket: 'days_91_plus' }),
    ]
    const summaries = buildBucketSummaries(entries, 600)
    const empty = summaries.filter(s => s.count === 0)
    expect(empty).toHaveLength(2)
  })

  it('53. pct_of_total = 0 for empty buckets when total > 0', () => {
    const entries = [makeEntry({ id: 'a', amount_try: 1000, days_outstanding: 5, bucket: 'days_1_30' })]
    const summaries = buildBucketSummaries(entries, 1000)
    const empty = summaries.filter(s => s.bucket !== 'days_1_30')
    for (const b of empty) {
      expect(b.pct_of_total).toBe(0)
    }
  })

  it('54. bucket order is canonical even with mixed entry order', () => {
    const entries = [
      makeEntry({ id: 'e', amount_try: 100, days_outstanding: 95, bucket: 'days_91_plus' }),
      makeEntry({ id: 'a', amount_try: 100, days_outstanding: 0,  bucket: 'current' }),
      makeEntry({ id: 'b', amount_try: 100, days_outstanding: 15, bucket: 'days_1_30' }),
    ]
    const summaries = buildBucketSummaries(entries, 300)
    expect(summaries[0].bucket).toBe('current')
    expect(summaries[4].bucket).toBe('days_91_plus')
  })

  it('55. all 5 buckets non-zero when one entry per bucket', () => {
    const entries = [
      makeEntry({ id: 'a', amount_try: 100, days_outstanding: 0,  bucket: 'current' }),
      makeEntry({ id: 'b', amount_try: 100, days_outstanding: 15, bucket: 'days_1_30' }),
      makeEntry({ id: 'c', amount_try: 100, days_outstanding: 45, bucket: 'days_31_60' }),
      makeEntry({ id: 'd', amount_try: 100, days_outstanding: 75, bucket: 'days_61_90' }),
      makeEntry({ id: 'e', amount_try: 100, days_outstanding: 95, bucket: 'days_91_plus' }),
    ]
    const summaries = buildBucketSummaries(entries, 500)
    for (const s of summaries) {
      expect(s.count).toBe(1)
      expect(s.total_try).toBe(100)
    }
  })

  it('56. 10 entries in days_91_plus accumulate to correct total', () => {
    const entries = Array.from({ length: 10 }, (_, i) =>
      makeEntry({ id: `e${i}`, amount_try: 500, days_outstanding: 100 + i, bucket: 'days_91_plus' })
    )
    const summaries = buildBucketSummaries(entries, 5000)
    const bucket = summaries.find(s => s.bucket === 'days_91_plus')!
    expect(bucket.count).toBe(10)
    expect(bucket.total_try).toBe(5000)
  })

  it('57. very small amounts represented without NaN', () => {
    const entries = [
      makeEntry({ id: 'a', amount_try: 0.01, days_outstanding: 10, bucket: 'days_1_30' }),
    ]
    const summaries = buildBucketSummaries(entries, 0.01)
    const bucket = summaries.find(s => s.bucket === 'days_1_30')!
    expect(Number.isNaN(bucket.pct_of_total)).toBe(false)
    expect(bucket.pct_of_total).toBeCloseTo(100)
  })

  it('58. entries with negative amounts (credits): still aggregated', () => {
    const entries = [
      makeEntry({ id: 'a', amount_try: -200, days_outstanding: 10, bucket: 'days_1_30' }),
      makeEntry({ id: 'b', amount_try: 500,  days_outstanding: 20, bucket: 'days_1_30' }),
    ]
    const summaries = buildBucketSummaries(entries, 300)
    const bucket = summaries.find(s => s.bucket === 'days_1_30')!
    expect(bucket.count).toBe(2)
    expect(bucket.total_try).toBeCloseTo(300)
  })
})

// ── assignAPBucket + buildBucketSummaries integration ────────────────────────

describe('assignAPBucket + buildBucketSummaries — integration', () => {

  it('59. computed buckets from assignAPBucket match buildBucketSummaries grouping', () => {
    const daysValues = [0, 15, 45, 75, 120]
    const entries = daysValues.map((d, i) => {
      const bucket = assignAPBucket(d)
      return makeEntry({ id: `e${i}`, amount_try: 100, days_outstanding: d, bucket })
    })
    const summaries = buildBucketSummaries(entries, 500)
    for (const s of summaries) {
      expect(s.count).toBe(1)
    }
  })

  it('60. bucket with multiple payment_statuses still groups correctly', () => {
    const entries = [
      { ...makeEntry({ id: 'a', amount_try: 400, days_outstanding: 5, bucket: 'days_1_30' as const }), payment_status: 'pending' },
      { ...makeEntry({ id: 'b', amount_try: 600, days_outstanding: 20, bucket: 'days_1_30' as const }), payment_status: 'partial' },
    ]
    const summaries = buildBucketSummaries(entries, 1000)
    const bucket = summaries.find(s => s.bucket === 'days_1_30')!
    expect(bucket.total_try).toBe(1000)
    expect(bucket.count).toBe(2)
  })

  it('61. total_try for a bucket is always rounded to 2 decimal places', () => {
    const entries = [
      makeEntry({ id: 'a', amount_try: 1.005, days_outstanding: 5, bucket: 'days_1_30' }),
      makeEntry({ id: 'b', amount_try: 1.005, days_outstanding: 10, bucket: 'days_1_30' }),
    ]
    const summaries = buildBucketSummaries(entries, 2.01)
    const bucket = summaries.find(s => s.bucket === 'days_1_30')!
    // Should be a finite number with at most 2 decimal places
    expect(Number.isFinite(bucket.total_try)).toBe(true)
  })

  it('62. assignAPBucket boundary: day 30 classified correctly affects summary', () => {
    const days = 30
    const bucket = assignAPBucket(days)
    expect(bucket).toBe('days_1_30')
    const entry = makeEntry({ id: 'a', amount_try: 999, days_outstanding: days, bucket })
    const summaries = buildBucketSummaries([entry], 999)
    expect(summaries.find(s => s.bucket === 'days_1_30')!.count).toBe(1)
    expect(summaries.find(s => s.bucket === 'days_31_60')!.count).toBe(0)
  })

  it('63. assignAPBucket boundary: day 31 classified correctly affects summary', () => {
    const days = 31
    const bucket = assignAPBucket(days)
    expect(bucket).toBe('days_31_60')
    const entry = makeEntry({ id: 'a', amount_try: 999, days_outstanding: days, bucket })
    const summaries = buildBucketSummaries([entry], 999)
    expect(summaries.find(s => s.bucket === 'days_31_60')!.count).toBe(1)
    expect(summaries.find(s => s.bucket === 'days_1_30')!.count).toBe(0)
  })

  it('64. pct_of_total is 0 for all buckets when total=0 regardless of entries', () => {
    const entries = [
      makeEntry({ id: 'a', amount_try: 1000, days_outstanding: 45, bucket: 'days_31_60' }),
    ]
    const summaries = buildBucketSummaries(entries, 0)
    for (const s of summaries) {
      expect(s.pct_of_total).toBe(0)
    }
  })

  it('65. building summaries from 50 entries works without error', () => {
    const entries = Array.from({ length: 50 }, (_, i) => {
      const days = i * 3
      return makeEntry({ id: `e${i}`, amount_try: 100, days_outstanding: days, bucket: assignAPBucket(days) })
    })
    const total = 50 * 100
    const summaries = buildBucketSummaries(entries, total)
    expect(summaries).toHaveLength(5)
    const sumCount = summaries.reduce((s, b) => s + b.count, 0)
    expect(sumCount).toBe(50)
  })

  it('66. computeAvgDaysOutstanding with mixed current/overdue entries', () => {
    const entries = [
      makeEntry({ id: 'a', days_outstanding: 0  }),  // current
      makeEntry({ id: 'b', days_outstanding: 30 }),  // days_1_30
      makeEntry({ id: 'c', days_outstanding: 60 }),  // days_31_60
      makeEntry({ id: 'd', days_outstanding: 90 }),  // days_61_90
      makeEntry({ id: 'e', days_outstanding: 120 }), // days_91_plus
    ]
    const avg = computeAvgDaysOutstanding(entries)
    expect(avg).toBe(60)  // (0+30+60+90+120)/5
  })

  it('67. computeAvgDaysOutstanding with all days in same bucket', () => {
    const entries = [
      makeEntry({ id: 'a', days_outstanding: 91 }),
      makeEntry({ id: 'b', days_outstanding: 93 }),
      makeEntry({ id: 'c', days_outstanding: 95 }),
    ]
    const avg = computeAvgDaysOutstanding(entries)
    expect(avg).toBeCloseTo(93)
  })

  it('68. computeAvgDaysOutstanding with single very large value', () => {
    const entries = [makeEntry({ id: 'a', days_outstanding: 730 })]
    expect(computeAvgDaysOutstanding(entries)).toBe(730)
  })

  it('69. buildBucketSummaries preserves exact amounts (no float drift)', () => {
    const entries = [
      makeEntry({ id: 'a', amount_try: 1234.56, days_outstanding: 5, bucket: 'days_1_30' }),
    ]
    const summaries = buildBucketSummaries(entries, 1234.56)
    const bucket = summaries.find(s => s.bucket === 'days_1_30')!
    expect(bucket.total_try).toBeCloseTo(1234.56, 2)
  })

  it('70. buildBucketSummaries: all entries paid (amount=0) → all counts still registered', () => {
    const entries = [
      makeEntry({ id: 'a', amount_try: 0, days_outstanding: 10, bucket: 'days_1_30' }),
      makeEntry({ id: 'b', amount_try: 0, days_outstanding: 50, bucket: 'days_31_60' }),
    ]
    const summaries = buildBucketSummaries(entries, 0)
    const b1 = summaries.find(s => s.bucket === 'days_1_30')!
    const b2 = summaries.find(s => s.bucket === 'days_31_60')!
    expect(b1.count).toBe(1)
    expect(b2.count).toBe(1)
  })
})

// ── assignAPBucket — all bucket-boundary pairs exhaustive ─────────────────────

describe('assignAPBucket — exhaustive boundary pairs', () => {

  it('71. day -100 → current', () => { expect(assignAPBucket(-100)).toBe('current') })
  it('72. day -50 → current',  () => { expect(assignAPBucket(-50)).toBe('current') })
  it('73. day -10 → current',  () => { expect(assignAPBucket(-10)).toBe('current') })
  it('74. day -1 → current',   () => { expect(assignAPBucket(-1)).toBe('current') })
  it('75. day 0 → current',    () => { expect(assignAPBucket(0)).toBe('current') })
  it('76. day 1 → days_1_30',  () => { expect(assignAPBucket(1)).toBe('days_1_30') })
  it('77. day 15 → days_1_30', () => { expect(assignAPBucket(15)).toBe('days_1_30') })
  it('78. day 30 → days_1_30', () => { expect(assignAPBucket(30)).toBe('days_1_30') })
  it('79. day 31 → days_31_60',() => { expect(assignAPBucket(31)).toBe('days_31_60') })
  it('80. day 45 → days_31_60',() => { expect(assignAPBucket(45)).toBe('days_31_60') })
  it('81. day 60 → days_31_60',() => { expect(assignAPBucket(60)).toBe('days_31_60') })
  it('82. day 61 → days_61_90',() => { expect(assignAPBucket(61)).toBe('days_61_90') })
  it('83. day 75 → days_61_90',() => { expect(assignAPBucket(75)).toBe('days_61_90') })
  it('84. day 90 → days_61_90',() => { expect(assignAPBucket(90)).toBe('days_61_90') })
  it('85. day 91 → days_91_plus', () => { expect(assignAPBucket(91)).toBe('days_91_plus') })
  it('86. day 180 → days_91_plus',() => { expect(assignAPBucket(180)).toBe('days_91_plus') })
  it('87. day 999 → days_91_plus',() => { expect(assignAPBucket(999)).toBe('days_91_plus') })
})

// ── computeAvgDaysOutstanding — comprehensive ─────────────────────────────────

describe('computeAvgDaysOutstanding — comprehensive', () => {

  it('88. ten entries all at 50 days → avg 50', () => {
    const entries = Array.from({ length: 10 }, (_, i) =>
      makeEntry({ id: `e${i}`, days_outstanding: 50 })
    )
    expect(computeAvgDaysOutstanding(entries)).toBe(50)
  })

  it('89. entries [0, 90] → avg 45', () => {
    const entries = [
      makeEntry({ id: 'a', days_outstanding: 0 }),
      makeEntry({ id: 'b', days_outstanding: 90 }),
    ]
    expect(computeAvgDaysOutstanding(entries)).toBe(45)
  })

  it('90. entries [10, 10, 10, 10, 10] → avg 10', () => {
    const entries = Array.from({ length: 5 }, (_, i) =>
      makeEntry({ id: `e${i}`, days_outstanding: 10 })
    )
    expect(computeAvgDaysOutstanding(entries)).toBe(10)
  })

  it('91. entries [3, 7] → avg 5', () => {
    const entries = [
      makeEntry({ id: 'a', days_outstanding: 3 }),
      makeEntry({ id: 'b', days_outstanding: 7 }),
    ]
    expect(computeAvgDaysOutstanding(entries)).toBe(5)
  })

  it('92. entries [1, 2, 3, 4, 5] → avg 3', () => {
    const entries = Array.from({ length: 5 }, (_, i) =>
      makeEntry({ id: `e${i}`, days_outstanding: i + 1 })
    )
    expect(computeAvgDaysOutstanding(entries)).toBe(3)
  })

  it('93. rounding: [1, 2] → avg 1.5 (not truncated)', () => {
    const entries = [
      makeEntry({ id: 'a', days_outstanding: 1 }),
      makeEntry({ id: 'b', days_outstanding: 2 }),
    ]
    expect(computeAvgDaysOutstanding(entries)).toBe(1.5)
  })

  it('94. entries [100, 100, 100] → avg 100', () => {
    const entries = Array.from({ length: 3 }, (_, i) =>
      makeEntry({ id: `e${i}`, days_outstanding: 100 })
    )
    expect(computeAvgDaysOutstanding(entries)).toBe(100)
  })

  it('95. entries [0, 0, 0] → avg 0', () => {
    const entries = Array.from({ length: 3 }, (_, i) =>
      makeEntry({ id: `e${i}`, days_outstanding: 0 })
    )
    expect(computeAvgDaysOutstanding(entries)).toBe(0)
  })
})

// ── buildBucketSummaries — stress tests ──────────────────────────────────────

describe('buildBucketSummaries — stress/edge', () => {

  it('96. 100 entries evenly distributed across 5 buckets → 20 per bucket', () => {
    const entriesPerBucket = 20
    const bucketDays = [0, 15, 45, 75, 100]
    const bucketKeys = ['current', 'days_1_30', 'days_31_60', 'days_61_90', 'days_91_plus'] as const

    const entries: ReturnType<typeof makeEntry>[] = []
    let idx = 0
    for (let b = 0; b < 5; b++) {
      for (let j = 0; j < entriesPerBucket; j++) {
        const days = bucketDays[b]
        entries.push(makeEntry({
          id: `e${idx++}`,
          amount_try: 100,
          days_outstanding: days,
          bucket: assignAPBucket(days),
        }))
      }
    }

    const total = entries.reduce((s, e) => s + e.amount_try, 0)
    const summaries = buildBucketSummaries(entries, total)

    for (const s of summaries) {
      expect(s.count).toBe(20)
      expect(s.total_try).toBe(2000)
    }
  })

  it('97. total_try in bucket = sum of entry amounts for that bucket', () => {
    const entries = [
      makeEntry({ id: 'a', amount_try: 100.50, days_outstanding: 5, bucket: 'days_1_30' }),
      makeEntry({ id: 'b', amount_try: 200.25, days_outstanding: 20, bucket: 'days_1_30' }),
      makeEntry({ id: 'c', amount_try: 50.00, days_outstanding: 10, bucket: 'days_1_30' }),
    ]
    const expectedTotal = 100.50 + 200.25 + 50.00  // = 350.75
    const summaries = buildBucketSummaries(entries, 350.75)
    const bucket = summaries.find(s => s.bucket === 'days_1_30')!
    expect(bucket.total_try).toBeCloseTo(350.75, 2)
  })

  it('98. 0 entries → avg is null and bucket counts all 0', () => {
    expect(computeAvgDaysOutstanding([])).toBeNull()
    const summaries = buildBucketSummaries([], 0)
    const totalCount = summaries.reduce((s, b) => s + b.count, 0)
    expect(totalCount).toBe(0)
  })

  it('99. single entry with days=1 (minimum non-current) → days_1_30 bucket', () => {
    const entry = makeEntry({ id: 'a', amount_try: 500, days_outstanding: 1, bucket: 'days_1_30' })
    const summaries = buildBucketSummaries([entry], 500)
    expect(summaries.find(s => s.bucket === 'days_1_30')!.count).toBe(1)
    expect(summaries.find(s => s.bucket === 'current')!.count).toBe(0)
  })

  it('100. pct_of_total is 0 for unused buckets and sum=100 for used', () => {
    // Only days_91_plus has entries
    const entries = [makeEntry({ id: 'a', amount_try: 1000, days_outstanding: 120, bucket: 'days_91_plus' })]
    const summaries = buildBucketSummaries(entries, 1000)
    const over90 = summaries.find(s => s.bucket === 'days_91_plus')!
    expect(over90.pct_of_total).toBe(100)
    const otherSum = summaries
      .filter(s => s.bucket !== 'days_91_plus')
      .reduce((s, b) => s + b.pct_of_total, 0)
    expect(otherSum).toBe(0)
  })
})
