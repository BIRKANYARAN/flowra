/**
 * FAZ 11 — Müşteri Zekası: business-logic unit tests
 *
 * Tests the pure analytics functions in customers/page.tsx and customers/[id]/page.tsx:
 *   1. totalBilled()                — sum of total_try across all sales
 *   2. outstandingBalance()         — sum where payment_status !== 'paid'
 *   3. topCustomersByRevenue()      — top-N grouped by customer_name, sorted desc
 *   4. computeSummary()             — per-customer: billed, paid, balance, count
 *   5. proformaConversionRate()     — % of proformas with status 'converted'
 *
 * All functions are pure (no DB, no side effects).
 * Run with: npx vitest run tests/customer-analytics.test.ts
 */

import { describe, it, expect } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// Mirror of analytics functions from customers/page.tsx + customers/[id]/page.tsx
// ─────────────────────────────────────────────────────────────────────────────

interface SaleAgg {
  customer_name: string
  total_try: number
  payment_status: string
}

function totalBilled(sales: SaleAgg[]): number {
  return sales.reduce((s, r) => s + Number(r.total_try ?? 0), 0)
}

function outstandingBalance(sales: SaleAgg[]): number {
  return sales
    .filter(r => r.payment_status !== 'paid')
    .reduce((s, r) => s + Number(r.total_try ?? 0), 0)
}

function topCustomersByRevenue(
  sales: SaleAgg[],
  n: number,
): { name: string; total: number }[] {
  const map = new Map<string, number>()
  for (const s of sales) {
    const key = s.customer_name ?? 'Bilinmiyor'
    map.set(key, (map.get(key) ?? 0) + Number(s.total_try ?? 0))
  }
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([name, total]) => ({ name, total }))
}

interface SaleSummaryRow {
  total_try: number
  payment_status: string
}
function computeSummary(sales: SaleSummaryRow[]) {
  const totalBilledTry = sales.reduce((s, r) => s + Number(r.total_try ?? 0), 0)
  const totalPaidTry   = sales
    .filter(r => r.payment_status === 'paid')
    .reduce((s, r) => s + Number(r.total_try ?? 0), 0)
  return {
    sale_count:       sales.length,
    total_billed_try: totalBilledTry,
    total_paid_try:   totalPaidTry,
    balance_try:      totalBilledTry - totalPaidTry,
  }
}

function proformaConversionRate(proformas: { status: string }[]): number {
  if (!proformas.length) return 0
  const converted = proformas.filter(p => p.status === 'converted').length
  return Math.round((converted / proformas.length) * 100)
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. totalBilled
// ─────────────────────────────────────────────────────────────────────────────

describe('totalBilled()', () => {
  it('returns 0 for empty sales', () => {
    expect(totalBilled([])).toBe(0)
  })

  it('sums total_try across all sales regardless of payment status', () => {
    const sales = [
      { customer_name: 'A', total_try: 10000, payment_status: 'paid'   },
      { customer_name: 'B', total_try: 5000,  payment_status: 'unpaid' },
      { customer_name: 'A', total_try: 3000,  payment_status: 'partial'},
    ]
    expect(totalBilled(sales)).toBe(18000)
  })

  it('handles string-ish numbers (coerced via Number())', () => {
    const sales = [
      { customer_name: 'A', total_try: '8500' as unknown as number, payment_status: 'paid' },
    ]
    expect(totalBilled(sales)).toBe(8500)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. outstandingBalance
// ─────────────────────────────────────────────────────────────────────────────

describe('outstandingBalance()', () => {
  it('returns 0 for empty sales', () => {
    expect(outstandingBalance([])).toBe(0)
  })

  it('excludes paid sales from balance', () => {
    const sales = [
      { customer_name: 'A', total_try: 10000, payment_status: 'paid'   },
      { customer_name: 'B', total_try: 3000,  payment_status: 'unpaid' },
      { customer_name: 'C', total_try: 2000,  payment_status: 'partial'},
      { customer_name: 'D', total_try: 1500,  payment_status: 'overdue'},
    ]
    expect(outstandingBalance(sales)).toBe(6500)  // 3000 + 2000 + 1500
  })

  it('returns 0 when all sales are paid', () => {
    const sales = [
      { customer_name: 'A', total_try: 5000, payment_status: 'paid' },
      { customer_name: 'B', total_try: 7000, payment_status: 'paid' },
    ]
    expect(outstandingBalance(sales)).toBe(0)
  })

  it('returns full total when nothing is paid', () => {
    const sales = [
      { customer_name: 'X', total_try: 4000, payment_status: 'unpaid' },
    ]
    expect(outstandingBalance(sales)).toBe(4000)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. topCustomersByRevenue
// ─────────────────────────────────────────────────────────────────────────────

describe('topCustomersByRevenue()', () => {
  it('returns empty array for no sales', () => {
    expect(topCustomersByRevenue([], 5)).toEqual([])
  })

  it('aggregates multiple sales by same customer', () => {
    const sales = [
      { customer_name: 'Acme', total_try: 10000, payment_status: 'paid'   },
      { customer_name: 'Acme', total_try: 5000,  payment_status: 'unpaid' },
      { customer_name: 'Beta', total_try: 8000,  payment_status: 'paid'   },
    ]
    const result = topCustomersByRevenue(sales, 5)
    const acme = result.find(r => r.name === 'Acme')
    expect(acme?.total).toBe(15000)
  })

  it('sorts by revenue descending', () => {
    const sales = [
      { customer_name: 'Small', total_try: 1000, payment_status: 'paid' },
      { customer_name: 'Large', total_try: 50000, payment_status: 'paid' },
      { customer_name: 'Med',   total_try: 10000, payment_status: 'paid' },
    ]
    const result = topCustomersByRevenue(sales, 5)
    expect(result[0].name).toBe('Large')
    expect(result[1].name).toBe('Med')
    expect(result[2].name).toBe('Small')
  })

  it('caps at N results', () => {
    const sales = Array.from({ length: 10 }, (_, i) => ({
      customer_name: `Customer${i}`,
      total_try: (10 - i) * 1000,
      payment_status: 'paid',
    }))
    expect(topCustomersByRevenue(sales, 3).length).toBe(3)
  })

  it('returns fewer than N when data has fewer customers', () => {
    const sales = [
      { customer_name: 'Only', total_try: 5000, payment_status: 'paid' },
    ]
    expect(topCustomersByRevenue(sales, 5).length).toBe(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. computeSummary
// ─────────────────────────────────────────────────────────────────────────────

describe('computeSummary()', () => {
  it('returns zeroes for empty sales', () => {
    const s = computeSummary([])
    expect(s.sale_count).toBe(0)
    expect(s.total_billed_try).toBe(0)
    expect(s.total_paid_try).toBe(0)
    expect(s.balance_try).toBe(0)
  })

  it('computes billed, paid, balance correctly', () => {
    const sales = [
      { total_try: 20000, payment_status: 'paid'   },
      { total_try: 10000, payment_status: 'unpaid' },
      { total_try: 5000,  payment_status: 'partial'},
    ]
    const s = computeSummary(sales)
    expect(s.sale_count).toBe(3)
    expect(s.total_billed_try).toBe(35000)
    expect(s.total_paid_try).toBe(20000)
    expect(s.balance_try).toBe(15000)
  })

  it('balance_try is negative when credit note reduces billed below paid (edge case)', () => {
    // Paid sale + credit note (negative unpaid adjustment) can make balance negative
    // totalBilled = 5000 + (-2000) = 3000; totalPaid = 5000; balance = -2000
    const sales = [
      { total_try: 5000,  payment_status: 'paid'   },
      { total_try: -2000, payment_status: 'unpaid' },  // credit note
    ]
    const s = computeSummary(sales)
    expect(s.total_billed_try).toBe(3000)
    expect(s.total_paid_try).toBe(5000)
    expect(s.balance_try).toBeLessThan(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. proformaConversionRate
// ─────────────────────────────────────────────────────────────────────────────

describe('proformaConversionRate()', () => {
  it('returns 0 for empty proformas', () => {
    expect(proformaConversionRate([])).toBe(0)
  })

  it('returns 100 when all proformas are converted', () => {
    const proformas = [
      { status: 'converted' },
      { status: 'converted' },
    ]
    expect(proformaConversionRate(proformas)).toBe(100)
  })

  it('returns 0 when none are converted', () => {
    const proformas = [
      { status: 'draft' },
      { status: 'sent'  },
      { status: 'rejected' },
    ]
    expect(proformaConversionRate(proformas)).toBe(0)
  })

  it('rounds to nearest integer', () => {
    // 1 out of 3 = 33.33% → 33
    const proformas = [
      { status: 'converted' },
      { status: 'draft'     },
      { status: 'sent'      },
    ]
    expect(proformaConversionRate(proformas)).toBe(33)
  })

  it('50% conversion rate for equal split', () => {
    const proformas = [
      { status: 'converted' },
      { status: 'draft'     },
    ]
    expect(proformaConversionRate(proformas)).toBe(50)
  })
})
