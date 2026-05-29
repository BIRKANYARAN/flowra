/**
 * Tests for lib/services/commercial/cohort-analysis.service.ts
 * Pure helper functions only — no DB calls, no side effects.
 * Run with: npx vitest run tests/cohort-analysis.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  groupByFirstMonth,
  computeRetention,
  buildCohortRow,
} from '../lib/services/commercial/cohort-analysis.service'

// ═══════════════════════════════════════════════════════════════════════════
// groupByFirstMonth
// ═══════════════════════════════════════════════════════════════════════════

describe('groupByFirstMonth', () => {
  it('assigns a customer to the month of their only sale', () => {
    const sales = [{ customer_key: 'id:1', sale_month: '2026-01', total_try: 500 }]
    expect(groupByFirstMonth(sales)).toEqual({ 'id:1': '2026-01' })
  })

  it('assigns a customer to the earliest sale month when they have multiple sales', () => {
    const sales = [
      { customer_key: 'id:1', sale_month: '2026-03', total_try: 100 },
      { customer_key: 'id:1', sale_month: '2026-01', total_try: 200 },
      { customer_key: 'id:1', sale_month: '2026-02', total_try: 150 },
    ]
    expect(groupByFirstMonth(sales)['id:1']).toBe('2026-01')
  })

  it('handles multiple customers independently', () => {
    const sales = [
      { customer_key: 'id:1', sale_month: '2026-01', total_try: 100 },
      { customer_key: 'id:2', sale_month: '2026-02', total_try: 200 },
      { customer_key: 'id:2', sale_month: '2026-01', total_try: 150 }, // id:2 first sale is Jan
    ]
    const result = groupByFirstMonth(sales)
    expect(result['id:1']).toBe('2026-01')
    expect(result['id:2']).toBe('2026-01')
  })

  it('returns empty object for empty input', () => {
    expect(groupByFirstMonth([])).toEqual({})
  })

  it('does not confuse customers with similar keys', () => {
    const sales = [
      { customer_key: 'name:Ahmet',  sale_month: '2026-03', total_try: 100 },
      { customer_key: 'name:Ahmet2', sale_month: '2026-01', total_try: 100 },
    ]
    const result = groupByFirstMonth(sales)
    expect(result['name:Ahmet']).toBe('2026-03')
    expect(result['name:Ahmet2']).toBe('2026-01')
  })

  it('uses string comparison for months (YYYY-MM), correctly finds minimum', () => {
    const sales = [
      { customer_key: 'id:1', sale_month: '2025-12', total_try: 100 },
      { customer_key: 'id:1', sale_month: '2026-01', total_try: 200 },
    ]
    expect(groupByFirstMonth(sales)['id:1']).toBe('2025-12')
  })

  it('handles a single customer with many repeated months — takes earliest', () => {
    const sales = [
      { customer_key: 'id:5', sale_month: '2026-06', total_try: 100 },
      { customer_key: 'id:5', sale_month: '2026-06', total_try: 100 },
      { customer_key: 'id:5', sale_month: '2026-04', total_try: 100 },
      { customer_key: 'id:5', sale_month: '2026-04', total_try: 100 },
    ]
    expect(groupByFirstMonth(sales)['id:5']).toBe('2026-04')
  })

  it('handles many customers — each gets their own correct first month', () => {
    const sales = Array.from({ length: 5 }, (_, i) => ({
      customer_key: `id:${i}`,
      sale_month: `2026-0${i + 1}`,
      total_try: 100,
    }))
    const result = groupByFirstMonth(sales)
    for (let i = 0; i < 5; i++) {
      expect(result[`id:${i}`]).toBe(`2026-0${i + 1}`)
    }
  })

  it('correctly handles id: prefixed keys vs name: prefixed keys', () => {
    const sales = [
      { customer_key: 'id:abc', sale_month: '2026-05', total_try: 300 },
      { customer_key: 'name:abc', sale_month: '2026-03', total_try: 200 },
    ]
    const result = groupByFirstMonth(sales)
    expect(result['id:abc']).toBe('2026-05')
    expect(result['name:abc']).toBe('2026-03')
  })

  it('does not include duplicates — each customer key appears once in result', () => {
    const sales = [
      { customer_key: 'id:1', sale_month: '2026-01', total_try: 100 },
      { customer_key: 'id:1', sale_month: '2026-02', total_try: 100 },
      { customer_key: 'id:1', sale_month: '2026-03', total_try: 100 },
    ]
    const result = groupByFirstMonth(sales)
    expect(Object.keys(result)).toHaveLength(1)
  })

  it('total_try is not used in grouping — only sale_month matters', () => {
    const salesHighTotal = [{ customer_key: 'id:1', sale_month: '2026-05', total_try: 99999 }]
    const salesLowTotal  = [{ customer_key: 'id:1', sale_month: '2026-01', total_try: 1 }]
    const result = groupByFirstMonth([...salesHighTotal, ...salesLowTotal])
    expect(result['id:1']).toBe('2026-01')
  })

  it('processes 100 customers correctly', () => {
    const sales = Array.from({ length: 100 }, (_, i) => ({
      customer_key: `id:${i}`,
      sale_month: `2026-${String((i % 12) + 1).padStart(2, '0')}`,
      total_try: 100,
    }))
    const result = groupByFirstMonth(sales)
    expect(Object.keys(result)).toHaveLength(100)
  })

  it('year boundary: 2025-12 correctly earlier than 2026-01', () => {
    const sales = [
      { customer_key: 'id:x', sale_month: '2026-01', total_try: 100 },
      { customer_key: 'id:x', sale_month: '2025-12', total_try: 100 },
      { customer_key: 'id:x', sale_month: '2026-06', total_try: 100 },
    ]
    expect(groupByFirstMonth(sales)['id:x']).toBe('2025-12')
  })

  it('single entry per customer returns a map with correct key-value pair', () => {
    const sales = [
      { customer_key: 'name:Bilinmiyor', sale_month: '2026-02', total_try: 50 },
    ]
    const result = groupByFirstMonth(sales)
    expect(result).toHaveProperty('name:Bilinmiyor', '2026-02')
  })

  it('result map has exactly as many entries as unique customers', () => {
    const sales = [
      { customer_key: 'id:1', sale_month: '2026-01', total_try: 100 },
      { customer_key: 'id:2', sale_month: '2026-01', total_try: 100 },
      { customer_key: 'id:1', sale_month: '2026-02', total_try: 100 },
      { customer_key: 'id:3', sale_month: '2026-03', total_try: 100 },
      { customer_key: 'id:2', sale_month: '2026-02', total_try: 100 },
    ]
    const result = groupByFirstMonth(sales)
    expect(Object.keys(result)).toHaveLength(3)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// computeRetention
// ═══════════════════════════════════════════════════════════════════════════

describe('computeRetention', () => {
  it('returns 0 when cohort size is 0 (avoids division by zero)', () => {
    expect(computeRetention(5, 0)).toBe(0)
    expect(computeRetention(0, 0)).toBe(0)
  })

  it('returns 100 when all cohort members are active', () => {
    expect(computeRetention(10, 10)).toBe(100)
  })

  it('returns 50 for half active', () => {
    expect(computeRetention(5, 10)).toBe(50)
  })

  it('returns correct partial retention percentage', () => {
    expect(computeRetention(3, 10)).toBeCloseTo(30)
  })

  it('returns 0 when no active customers', () => {
    expect(computeRetention(0, 10)).toBe(0)
  })

  it('returns 100 for cohort of 1 with 1 active', () => {
    expect(computeRetention(1, 1)).toBe(100)
  })

  it('returns 33.33 for 1 out of 3 active', () => {
    expect(computeRetention(1, 3)).toBeCloseTo(33.33, 1)
  })

  it('returns 25 for 1 out of 4 active', () => {
    expect(computeRetention(1, 4)).toBeCloseTo(25)
  })

  it('returns value between 0 and 100 for valid inputs', () => {
    const result = computeRetention(7, 20)
    expect(result).toBeGreaterThanOrEqual(0)
    expect(result).toBeLessThanOrEqual(100)
  })

  it('returns 0 for cohort size 0 regardless of active count', () => {
    expect(computeRetention(100, 0)).toBe(0)
  })

  it('can return > 100 if activeCustomers > cohortSize (no clamping)', () => {
    // Function definition allows this edge case
    const result = computeRetention(15, 10)
    expect(result).toBeCloseTo(150)
  })

  it('formula: active/size × 100', () => {
    const active = 7
    const size   = 13
    expect(computeRetention(active, size)).toBeCloseTo((active / size) * 100, 10)
  })

  it('returns 10 for 1 out of 10', () => {
    expect(computeRetention(1, 10)).toBeCloseTo(10)
  })

  it('returns 20 for 2 out of 10', () => {
    expect(computeRetention(2, 10)).toBeCloseTo(20)
  })

  it('result scales linearly with active count', () => {
    const size = 100
    for (let active = 0; active <= size; active += 10) {
      expect(computeRetention(active, size)).toBeCloseTo(active, 5)
    }
  })

  it('cohort of 50, all active → 100%', () => {
    expect(computeRetention(50, 50)).toBeCloseTo(100)
  })

  it('cohort of 1000, half active → 50%', () => {
    expect(computeRetention(500, 1000)).toBeCloseTo(50)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// buildCohortRow
// ═══════════════════════════════════════════════════════════════════════════

describe('buildCohortRow', () => {
  const cohortMonth = '2026-01'
  const customerKeys = ['id:1', 'id:2']

  const allSales = [
    // id:1 — sales in Jan and Feb
    { customer_key: 'id:1', sale_month: '2026-01', total_try: 1000 },
    { customer_key: 'id:1', sale_month: '2026-02', total_try: 500  },
    // id:2 — sale only in Jan
    { customer_key: 'id:2', sale_month: '2026-01', total_try: 800  },
    // id:3 — a customer from a different cohort (should be ignored)
    { customer_key: 'id:3', sale_month: '2026-01', total_try: 9999 },
  ]

  it('returns the correct cohort_month and cohort_label', () => {
    const row = buildCohortRow(cohortMonth, customerKeys, allSales)
    expect(row.cohort_month).toBe('2026-01')
    expect(typeof row.cohort_label).toBe('string')
    expect(row.cohort_label.length).toBeGreaterThan(0)
  })

  it('returns the correct cohort_size', () => {
    const row = buildCohortRow(cohortMonth, customerKeys, allSales)
    expect(row.cohort_size).toBe(2)
  })

  it('aggregates revenue correctly per month', () => {
    const row = buildCohortRow(cohortMonth, customerKeys, allSales)
    // Jan: 1000 + 800 = 1800 (only id:1 and id:2, not id:3)
    expect(row.monthly_revenue['2026-01']).toBe(1800)
    // Feb: only id:1 had a sale
    expect(row.monthly_revenue['2026-02']).toBe(500)
  })

  it('counts active customers per month correctly', () => {
    const row = buildCohortRow(cohortMonth, customerKeys, allSales)
    expect(row.monthly_customers['2026-01']).toBe(2)
    expect(row.monthly_customers['2026-02']).toBe(1)
  })

  it('computes retention_pct correctly', () => {
    const row = buildCohortRow(cohortMonth, customerKeys, allSales)
    // Jan: 2/2 = 100%
    expect(row.retention_pct['2026-01']).toBeCloseTo(100)
    // Feb: 1/2 = 50%
    expect(row.retention_pct['2026-02']).toBeCloseTo(50)
  })

  it('excludes sales from months before the cohort_month', () => {
    const salesWithPre = [
      { customer_key: 'id:1', sale_month: '2025-12', total_try: 9999 }, // before cohort
      { customer_key: 'id:1', sale_month: '2026-01', total_try: 1000 },
    ]
    const row = buildCohortRow(cohortMonth, ['id:1'], salesWithPre)
    expect(row.monthly_revenue['2025-12']).toBeUndefined()
    expect(row.monthly_revenue['2026-01']).toBe(1000)
  })

  it('returns empty monthly maps for a cohort with no sales data', () => {
    const row = buildCohortRow('2026-05', ['id:99'], [])
    expect(Object.keys(row.monthly_revenue)).toHaveLength(0)
    expect(Object.keys(row.monthly_customers)).toHaveLength(0)
    expect(Object.keys(row.retention_pct)).toHaveLength(0)
  })

  it('cohort_size deduplicates customer keys (Set)', () => {
    const duplicateKeys = ['id:1', 'id:1', 'id:2']
    const row = buildCohortRow('2026-01', duplicateKeys, allSales)
    expect(row.cohort_size).toBe(2)
  })

  it('excludes customers not in customerKeys list', () => {
    const row = buildCohortRow('2026-01', ['id:1'], allSales)
    // id:2 and id:3 should be excluded
    expect(row.monthly_revenue['2026-01']).toBe(1000)
    expect(row.cohort_size).toBe(1)
  })

  it('handles single customer cohort correctly', () => {
    const singleSales = [
      { customer_key: 'id:solo', sale_month: '2026-01', total_try: 2000 },
      { customer_key: 'id:solo', sale_month: '2026-02', total_try: 1500 },
    ]
    const row = buildCohortRow('2026-01', ['id:solo'], singleSales)
    expect(row.cohort_size).toBe(1)
    expect(row.monthly_revenue['2026-01']).toBe(2000)
    expect(row.retention_pct['2026-01']).toBe(100)
    expect(row.retention_pct['2026-02']).toBe(100)
  })

  it('months with no cohort activity have no entries in monthly_revenue', () => {
    const row = buildCohortRow('2026-01', ['id:1'], [
      { customer_key: 'id:1', sale_month: '2026-01', total_try: 500 },
      // No sale in Feb
      { customer_key: 'id:1', sale_month: '2026-03', total_try: 300 },
    ])
    expect(row.monthly_revenue['2026-02']).toBeUndefined()
    expect(row.monthly_revenue['2026-03']).toBe(300)
  })

  it('multiple sales in same month by same customer counted once for active customers', () => {
    const sales = [
      { customer_key: 'id:1', sale_month: '2026-01', total_try: 100 },
      { customer_key: 'id:1', sale_month: '2026-01', total_try: 200 },
    ]
    const row = buildCohortRow('2026-01', ['id:1'], sales)
    expect(row.monthly_customers['2026-01']).toBe(1)
    expect(row.monthly_revenue['2026-01']).toBe(300)
  })

  it('cohort_label is a non-empty string (Turkish month name)', () => {
    const row = buildCohortRow('2026-03', ['id:1'], [])
    expect(row.cohort_label).toBeTruthy()
    expect(row.cohort_label).toContain('2026')
  })

  it('months_tracked only includes months with data', () => {
    const row = buildCohortRow('2026-04', ['id:7'], [
      { customer_key: 'id:7', sale_month: '2026-04', total_try: 999 },
    ])
    expect(Object.keys(row.monthly_revenue)).toContain('2026-04')
    expect(Object.keys(row.monthly_revenue)).not.toContain('2026-05')
  })

  it('retention_pct matches monthly_customers / cohort_size × 100 for each month', () => {
    const keys = ['id:1', 'id:2', 'id:3', 'id:4']
    const sales = [
      { customer_key: 'id:1', sale_month: '2026-01', total_try: 100 },
      { customer_key: 'id:2', sale_month: '2026-01', total_try: 100 },
      { customer_key: 'id:3', sale_month: '2026-01', total_try: 100 },
      { customer_key: 'id:4', sale_month: '2026-01', total_try: 100 },
      { customer_key: 'id:1', sale_month: '2026-02', total_try: 100 },
      { customer_key: 'id:2', sale_month: '2026-02', total_try: 100 },
    ]
    const row = buildCohortRow('2026-01', keys, sales)
    expect(row.cohort_size).toBe(4)
    expect(row.retention_pct['2026-01']).toBeCloseTo(100)   // 4/4
    expect(row.retention_pct['2026-02']).toBeCloseTo(50)    // 2/4
  })

  it('revenue accumulates across multiple customers in same month', () => {
    const keys = ['id:a', 'id:b', 'id:c']
    const sales = [
      { customer_key: 'id:a', sale_month: '2026-05', total_try: 1_000 },
      { customer_key: 'id:b', sale_month: '2026-05', total_try: 2_000 },
      { customer_key: 'id:c', sale_month: '2026-05', total_try: 3_000 },
    ]
    const row = buildCohortRow('2026-05', keys, sales)
    expect(row.monthly_revenue['2026-05']).toBe(6_000)
    expect(row.monthly_customers['2026-05']).toBe(3)
  })

  it('cohort_size = 0 when customerKeys is empty', () => {
    const row = buildCohortRow('2026-01', [], allSales)
    expect(row.cohort_size).toBe(0)
  })

  it('revenue is 0 for empty cohort (no keys match)', () => {
    const row = buildCohortRow('2026-01', [], allSales)
    expect(Object.keys(row.monthly_revenue)).toHaveLength(0)
  })

  it('does not include future months when only cohort_month has data', () => {
    const row = buildCohortRow('2026-06', ['id:z'], [
      { customer_key: 'id:z', sale_month: '2026-06', total_try: 500 },
    ])
    expect(Object.keys(row.monthly_revenue)).toHaveLength(1)
    expect(row.monthly_revenue['2026-06']).toBe(500)
  })

  it('cohort_label for Jan 2026 is a Turkish string', () => {
    const row = buildCohortRow('2026-01', [], [])
    // Turkish locale: should contain "Ocak" or "2026"
    expect(row.cohort_label.length).toBeGreaterThan(0)
  })

  it('monthly_revenue, monthly_customers, retention_pct all have same keys', () => {
    const row = buildCohortRow('2026-01', ['id:1', 'id:2'], allSales)
    const revenueKeys   = Object.keys(row.monthly_revenue).sort()
    const customerKeys2 = Object.keys(row.monthly_customers).sort()
    const retentionKeys = Object.keys(row.retention_pct).sort()
    expect(revenueKeys).toEqual(customerKeys2)
    expect(customerKeys2).toEqual(retentionKeys)
  })
})
