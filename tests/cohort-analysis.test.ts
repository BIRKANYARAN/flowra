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
})
