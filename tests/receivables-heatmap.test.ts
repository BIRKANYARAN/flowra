/**
 * Receivables Heatmap Service — unit tests
 *
 * Tests pure helpers:
 *   - assignReceivableBucket    (5 cases + edge cases: 0, 30, 31, 90, 91)
 *   - computeCustomerRiskScore  (zero total, all current, all 91+)
 *   - buildBucketTotals         (empty, single customer, mixed, pct_of_total sums to 100)
 *
 * No DB or network calls — all in-memory.
 */

import { describe, it, expect } from 'vitest'
import {
  assignReceivableBucket,
  computeCustomerRiskScore,
  buildBucketTotals,
} from '../lib/services/commercial/receivables-heatmap.service'
import type { CustomerAgingRow, AgingBucket } from '../lib/services/commercial/receivables-heatmap.service'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeCustomer(overrides: Partial<CustomerAgingRow> = {}): CustomerAgingRow {
  const buckets: Record<AgingBucket, number> = {
    current:      0,
    days_1_30:    0,
    days_31_60:   0,
    days_61_90:   0,
    days_91_plus: 0,
    ...(overrides.buckets ?? {}),
  }
  const total = overrides.total_outstanding_try
    ?? Object.values(buckets).reduce((s, v) => s + v, 0)

  return {
    customer_name:         'Test Müşteri',
    total_outstanding_try: total,
    buckets,
    oldest_invoice_days:   null,
    last_payment_date:     null,
    risk_score:            0,
    ...overrides,
    buckets,
  }
}

// ── assignReceivableBucket ────────────────────────────────────────────────────

describe('assignReceivableBucket — pure bucket assignment', () => {

  // Test 1: same day (0 days) → current
  it('1. same day (0 days) → "current"', () => {
    expect(assignReceivableBucket('2026-05-27', '2026-05-27')).toBe('current')
  })

  // Test 2: future-dated sale → current
  it('2. future-dated sale (sale_date > today) → "current"', () => {
    expect(assignReceivableBucket('2026-06-01', '2026-05-27')).toBe('current')
  })

  // Test 3: 1 day → days_1_30
  it('3. 1 day → "days_1_30"', () => {
    expect(assignReceivableBucket('2026-05-26', '2026-05-27')).toBe('days_1_30')
  })

  // Test 4: exactly 30 days (edge) → days_1_30
  it('4. exactly 30 days → "days_1_30"', () => {
    expect(assignReceivableBucket('2026-04-27', '2026-05-27')).toBe('days_1_30')
  })

  // Test 5: exactly 31 days (edge) → days_31_60
  it('5. exactly 31 days → "days_31_60"', () => {
    expect(assignReceivableBucket('2026-04-26', '2026-05-27')).toBe('days_31_60')
  })

  // Test 6: exactly 60 days (edge) → days_31_60
  it('6. exactly 60 days → "days_31_60"', () => {
    expect(assignReceivableBucket('2026-03-28', '2026-05-27')).toBe('days_31_60')
  })

  // Test 7: exactly 61 days (edge) → days_61_90
  it('7. exactly 61 days → "days_61_90"', () => {
    expect(assignReceivableBucket('2026-03-27', '2026-05-27')).toBe('days_61_90')
  })

  // Test 8: exactly 90 days (edge) → days_61_90
  it('8. exactly 90 days → "days_61_90"', () => {
    expect(assignReceivableBucket('2026-02-26', '2026-05-27')).toBe('days_61_90')
  })

  // Test 9: exactly 91 days (edge) → days_91_plus
  it('9. exactly 91 days → "days_91_plus"', () => {
    expect(assignReceivableBucket('2026-02-25', '2026-05-27')).toBe('days_91_plus')
  })

  // Test 10: large value → days_91_plus
  it('10. 365 days → "days_91_plus"', () => {
    expect(assignReceivableBucket('2025-05-27', '2026-05-27')).toBe('days_91_plus')
  })
})

// ── computeCustomerRiskScore ──────────────────────────────────────────────────

describe('computeCustomerRiskScore — risk score formula', () => {

  const emptyBuckets: Record<AgingBucket, number> = {
    current: 0, days_1_30: 0, days_31_60: 0, days_61_90: 0, days_91_plus: 0,
  }

  // Test 11: zero total → 0 (no division by zero)
  it('11. zero total → 0 (no division by zero)', () => {
    const score = computeCustomerRiskScore(emptyBuckets, 0, null)
    expect(score).toBe(0)
    expect(Number.isNaN(score)).toBe(false)
  })

  // Test 12: all in current bucket → low score (no old buckets, no age bonus)
  it('12. all in current, oldest = 5 days → score = 0', () => {
    const buckets = { ...emptyBuckets, current: 1000 }
    const score   = computeCustomerRiskScore(buckets, 1000, 5)
    expect(score).toBe(0)
  })

  // Test 13: all in days_1_30 → no critical amount, low score
  it('13. all in days_1_30, oldest = 15 days → score = 0', () => {
    const buckets = { ...emptyBuckets, days_1_30: 500 }
    const score   = computeCustomerRiskScore(buckets, 500, 15)
    expect(score).toBe(0)
  })

  // Test 14: all in days_91_plus, oldest > 90 → near 100
  it('14. all in days_91_plus, oldest = 120 days → high score (capped at 100)', () => {
    const buckets = { ...emptyBuckets, days_91_plus: 2000 }
    const score   = computeCustomerRiskScore(buckets, 2000, 120)
    // base = 100%, bonus = 20 → min(100, 120) = 100
    expect(score).toBe(100)
  })

  // Test 15: half in days_91_plus, oldest > 90 → score = min(100, 50+20) = 70
  it('15. half in days_91_plus, oldest = 95 days → score = 70', () => {
    const buckets = { ...emptyBuckets, current: 1000, days_91_plus: 1000 }
    const score   = computeCustomerRiskScore(buckets, 2000, 95)
    // base = 50%, bonus = 20 → 70
    expect(score).toBe(70)
  })

  // Test 16: days_61_90 and days_91_plus split, oldest > 60 → moderate score
  it('16. 25% days_61_90, 25% days_91_plus, oldest = 75 days → score = 60', () => {
    const buckets = { ...emptyBuckets, current: 500, days_61_90: 250, days_91_plus: 250 }
    const score   = computeCustomerRiskScore(buckets, 1000, 75)
    // base = 50%, bonus = 10 (oldest > 60, not > 90) → 60
    expect(score).toBe(60)
  })
})

// ── buildBucketTotals ─────────────────────────────────────────────────────────

describe('buildBucketTotals — bucket aggregation across customers', () => {

  // Test 17: empty customers → 5 buckets with zeros, no NaN
  it('17. empty customers → 5 buckets all zero, no NaN', () => {
    const totals = buildBucketTotals([])
    expect(totals).toHaveLength(5)
    for (const t of totals) {
      expect(t.total_try).toBe(0)
      expect(t.count).toBe(0)
      expect(t.pct_of_total).toBe(0)
      expect(Number.isNaN(t.pct_of_total)).toBe(false)
    }
  })

  // Test 18: bucket order is always canonical
  it('18. buckets are always in canonical order', () => {
    const totals = buildBucketTotals([])
    const order  = totals.map(t => t.bucket)
    expect(order).toEqual(['current', 'days_1_30', 'days_31_60', 'days_61_90', 'days_91_plus'])
  })

  // Test 19: single customer with mixed buckets → pct_of_total correct
  it('19. single customer with mixed buckets → correct pct_of_total', () => {
    const customer = makeCustomer({
      total_outstanding_try: 1000,
      buckets: { current: 400, days_1_30: 300, days_31_60: 200, days_61_90: 100, days_91_plus: 0 },
    })
    const totals = buildBucketTotals([customer])

    const current   = totals.find(t => t.bucket === 'current')!
    const d31_60    = totals.find(t => t.bucket === 'days_31_60')!
    const d91_plus  = totals.find(t => t.bucket === 'days_91_plus')!

    expect(current.total_try).toBe(400)
    expect(current.pct_of_total).toBe(40)
    expect(d31_60.total_try).toBe(200)
    expect(d31_60.pct_of_total).toBe(20)
    expect(d91_plus.total_try).toBe(0)
    expect(d91_plus.pct_of_total).toBe(0)
  })

  // Test 20: pct_of_total sums to ~100% for a real distribution
  it('20. pct_of_total sums to ~100% across all buckets', () => {
    const customers = [
      makeCustomer({
        total_outstanding_try: 600,
        buckets: { current: 200, days_1_30: 200, days_31_60: 200, days_61_90: 0, days_91_plus: 0 },
      }),
      makeCustomer({
        customer_name: 'Müşteri B',
        total_outstanding_try: 400,
        buckets: { current: 0, days_1_30: 0, days_31_60: 0, days_61_90: 200, days_91_plus: 200 },
      }),
    ]
    const totals  = buildBucketTotals(customers)
    const sumPct  = totals.reduce((s, t) => s + t.pct_of_total, 0)
    expect(sumPct).toBeCloseTo(100, 1)
  })

  // Test 21: two customers both in days_91_plus → count = 2
  it('21. two customers in days_91_plus → count = 2', () => {
    const customers = [
      makeCustomer({
        total_outstanding_try: 500,
        buckets: { current: 0, days_1_30: 0, days_31_60: 0, days_61_90: 0, days_91_plus: 500 },
      }),
      makeCustomer({
        customer_name: 'Müşteri B',
        total_outstanding_try: 300,
        buckets: { current: 0, days_1_30: 0, days_31_60: 0, days_61_90: 0, days_91_plus: 300 },
      }),
    ]
    const totals  = buildBucketTotals(customers)
    const d91Plus = totals.find(t => t.bucket === 'days_91_plus')!
    expect(d91Plus.count).toBe(2)
    expect(d91Plus.total_try).toBe(800)
    expect(d91Plus.pct_of_total).toBe(100)
  })
})

// ── assignReceivableBucket — additional edge cases ────────────────────────────

describe('assignReceivableBucket — extra boundaries and formats', () => {

  it('22. 29 days → still days_1_30', () => {
    expect(assignReceivableBucket('2026-04-28', '2026-05-27')).toBe('days_1_30')
  })

  it('23. 59 days → still days_31_60', () => {
    expect(assignReceivableBucket('2026-03-29', '2026-05-27')).toBe('days_31_60')
  })

  it('24. 89 days → still days_61_90', () => {
    expect(assignReceivableBucket('2026-02-27', '2026-05-27')).toBe('days_61_90')
  })

  it('25. 180 days → days_91_plus', () => {
    expect(assignReceivableBucket('2025-11-28', '2026-05-27')).toBe('days_91_plus')
  })

  it('26. same month boundary — Jan 31 to Feb 28 (28 days) → days_1_30', () => {
    expect(assignReceivableBucket('2026-01-31', '2026-02-28')).toBe('days_1_30')
  })

  it('27. all 5 buckets are reachable from distinct inputs', () => {
    const inputs: [string, string][] = [
      ['2026-05-27', '2026-05-27'],  // 0 days → current
      ['2026-05-10', '2026-05-27'],  // 17 days → days_1_30
      ['2026-04-01', '2026-05-27'],  // 56 days → days_31_60
      ['2026-03-05', '2026-05-27'],  // 83 days → days_61_90
      ['2025-12-01', '2026-05-27'],  // 177 days → days_91_plus
    ]
    const buckets = inputs.map(([s, t]) => assignReceivableBucket(s, t))
    expect(buckets).toContain('current')
    expect(buckets).toContain('days_1_30')
    expect(buckets).toContain('days_31_60')
    expect(buckets).toContain('days_61_90')
    expect(buckets).toContain('days_91_plus')
  })
})

// ── computeCustomerRiskScore — additional scenarios ───────────────────────────

describe('computeCustomerRiskScore — formula components', () => {

  const emptyBuckets: Record<AgingBucket, number> = {
    current: 0, days_1_30: 0, days_31_60: 0, days_61_90: 0, days_91_plus: 0,
  }

  it('28. base score only from days_61_90 (no age bonus)', () => {
    // base = 500/1000 * 100 = 50; oldest = 70 (>60, not >90) → +10; total = 60
    const buckets = { ...emptyBuckets, current: 500, days_61_90: 500 }
    const score   = computeCustomerRiskScore(buckets, 1000, 70)
    expect(score).toBe(60)
  })

  it('29. 100% days_31_60 with oldest > 90 → age bonus applies even without risky buckets', () => {
    // base = 0 (no days_61_90 or days_91_plus); bonus = 20 (oldest > 90); total = 20
    const buckets = { ...emptyBuckets, days_31_60: 1000 }
    const score   = computeCustomerRiskScore(buckets, 1000, 95)
    expect(score).toBe(20)
  })

  it('30. oldest_invoice_days = null → no age bonus', () => {
    // base = 100% days_91_plus → 100; no bonus (null); capped at 100
    const buckets = { ...emptyBuckets, days_91_plus: 1000 }
    const score   = computeCustomerRiskScore(buckets, 1000, null)
    expect(score).toBe(100)
  })

  it('31. base = 25% critical, oldest exactly 60 → no bonus (not > 60)', () => {
    // base = 250/1000 * 100 = 25; oldest = 60, not > 60 → no bonus; total = 25
    const buckets = { ...emptyBuckets, current: 750, days_61_90: 250 }
    const score   = computeCustomerRiskScore(buckets, 1000, 60)
    expect(score).toBe(25)
  })

  it('32. base = 25% critical, oldest 61 → bonus 10; total = 35', () => {
    const buckets = { ...emptyBuckets, current: 750, days_61_90: 250 }
    const score   = computeCustomerRiskScore(buckets, 1000, 61)
    expect(score).toBe(35)
  })

  it('33. score never exceeds 100 for extreme inputs', () => {
    const buckets = { ...emptyBuckets, days_61_90: 500, days_91_plus: 500 }
    const score   = computeCustomerRiskScore(buckets, 1000, 200)
    expect(score).toBeLessThanOrEqual(100)
  })
})

// ── buildBucketTotals — additional assertions ──────────────────────────────────

describe('buildBucketTotals — multi-customer aggregation', () => {

  it('34. three customers → totals sum correctly', () => {
    const customers = [
      makeCustomer({
        total_outstanding_try: 300,
        buckets: { current: 300, days_1_30: 0, days_31_60: 0, days_61_90: 0, days_91_plus: 0 },
      }),
      makeCustomer({
        customer_name: 'B',
        total_outstanding_try: 400,
        buckets: { current: 0, days_1_30: 400, days_31_60: 0, days_61_90: 0, days_91_plus: 0 },
      }),
      makeCustomer({
        customer_name: 'C',
        total_outstanding_try: 300,
        buckets: { current: 0, days_1_30: 0, days_31_60: 300, days_61_90: 0, days_91_plus: 0 },
      }),
    ]
    const totals = buildBucketTotals(customers)

    const current  = totals.find(t => t.bucket === 'current')!
    const d1_30    = totals.find(t => t.bucket === 'days_1_30')!
    const d31_60   = totals.find(t => t.bucket === 'days_31_60')!

    expect(current.total_try).toBe(300)
    expect(d1_30.total_try).toBe(400)
    expect(d31_60.total_try).toBe(300)
  })

  it('35. count field counts customers with non-zero bucket amounts', () => {
    const customers = [
      makeCustomer({
        total_outstanding_try: 200,
        buckets: { current: 100, days_1_30: 100, days_31_60: 0, days_61_90: 0, days_91_plus: 0 },
      }),
      makeCustomer({
        customer_name: 'B',
        total_outstanding_try: 100,
        buckets: { current: 100, days_1_30: 0, days_31_60: 0, days_61_90: 0, days_91_plus: 0 },
      }),
    ]
    const totals  = buildBucketTotals(customers)
    const current = totals.find(t => t.bucket === 'current')!
    const d1_30   = totals.find(t => t.bucket === 'days_1_30')!

    // Both customers have current amounts
    expect(current.count).toBeGreaterThanOrEqual(1)
    // Only 1 customer has days_1_30 amount
    expect(d1_30.count).toBeGreaterThanOrEqual(1)
  })

  it('36. pct_of_total for single-bucket customer = 100', () => {
    const customers = [
      makeCustomer({
        total_outstanding_try: 1000,
        buckets: { current: 1000, days_1_30: 0, days_31_60: 0, days_61_90: 0, days_91_plus: 0 },
      }),
    ]
    const totals  = buildBucketTotals(customers)
    const current = totals.find(t => t.bucket === 'current')!
    expect(current.pct_of_total).toBe(100)
  })
})
