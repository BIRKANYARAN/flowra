/**
 * TaxService pure-function unit tests.
 *
 * Tests cover:
 *   • computeKDVFromRows()   — pure VAT computation from row arrays
 *   • computeFilingDueDate() — Turkish KDV filing due-date rule
 *
 * Run with: npx vitest run tests/tax-service.test.ts
 */

import { describe, it, expect } from 'vitest'
import {
  computeKDVFromRows,
  computeFilingDueDate,
  computeKdv,
  computeCorporateTax,
  nextCorporateTaxAdvanceDue,
} from '../lib/services/tax.service'

// ─────────────────────────────────────────────────────────────────────────────
// computeKDVFromRows()
// ─────────────────────────────────────────────────────────────────────────────

describe('computeKDVFromRows()', () => {
  it('empty inputs → all zeros, vat_payable false', () => {
    const r = computeKDVFromRows([], [])
    expect(r.output_vat_try).toBe(0)
    expect(r.input_vat_try).toBe(0)
    expect(r.net_vat_try).toBe(0)
    expect(r.vat_payable).toBe(false)
  })

  it('sales only → output = sum(kdv_amount_try), input = 0', () => {
    const r = computeKDVFromRows(
      [
        { kdv_amount_try: 1800, tax_rate: 18 },
        { kdv_amount_try: 400,  tax_rate: 8  },
      ],
      [],
    )
    expect(r.output_vat_try).toBe(2200)
    expect(r.input_vat_try).toBe(0)
    expect(r.net_vat_try).toBe(2200)
    expect(r.vat_payable).toBe(true)
  })

  it('expenses only → output = 0, input = sum(kdv_deductible_try)', () => {
    const r = computeKDVFromRows(
      [],
      [
        { kdv_deductible_try: 500 },
        { kdv_deductible_try: 300 },
      ],
    )
    expect(r.output_vat_try).toBe(0)
    expect(r.input_vat_try).toBe(800)
    expect(r.net_vat_try).toBe(-800)
    expect(r.vat_payable).toBe(false)
  })

  it('net positive → vat_payable true', () => {
    const r = computeKDVFromRows(
      [{ kdv_amount_try: 5000 }],
      [{ kdv_deductible_try: 2000 }],
    )
    expect(r.net_vat_try).toBe(3000)
    expect(r.vat_payable).toBe(true)
  })

  it('net negative → vat_payable false (refund / carry forward)', () => {
    const r = computeKDVFromRows(
      [{ kdv_amount_try: 1000 }],
      [{ kdv_deductible_try: 3000 }],
    )
    expect(r.net_vat_try).toBe(-2000)
    expect(r.vat_payable).toBe(false)
  })

  it('mixed rates → correct output total regardless of rate', () => {
    // 8% on 50000 base = 4000; 18% on 100000 base = 18000 → total output = 22000
    const r = computeKDVFromRows(
      [
        { kdv_amount_try: 4000,  tax_rate: 8  },
        { kdv_amount_try: 18000, tax_rate: 18 },
      ],
      [{ kdv_deductible_try: 5000 }],
    )
    expect(r.output_vat_try).toBe(22000)
    expect(r.input_vat_try).toBe(5000)
    expect(r.net_vat_try).toBe(17000)
    expect(r.vat_payable).toBe(true)
  })

  it('zero net → vat_payable false (exactly equal output and input)', () => {
    const r = computeKDVFromRows(
      [{ kdv_amount_try: 1500 }],
      [{ kdv_deductible_try: 1500 }],
    )
    expect(r.net_vat_try).toBe(0)
    expect(r.vat_payable).toBe(false)
  })

  it('rounding to 2 decimal places', () => {
    // 0.1 + 0.2 = 0.30000000000000004 in IEEE 754; round2 should normalise to 0.30
    const r = computeKDVFromRows(
      [{ kdv_amount_try: 0.1 }, { kdv_amount_try: 0.2 }],
      [{ kdv_deductible_try: 0.005 }],
    )
    // output = 0.30 (round2 of 0.30000000000000004)
    // input  = 0.01 (round2 of 0.005 rounds to 0.01)
    // net    = 0.29
    expect(r.output_vat_try).toBe(0.3)
    expect(r.input_vat_try).toBe(0.01)
    expect(r.net_vat_try).toBe(0.29)
    expect(String(r.output_vat_try).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(2)
    expect(String(r.input_vat_try).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(2)
    expect(String(r.net_vat_try).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(2)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeFilingDueDate()
// ─────────────────────────────────────────────────────────────────────────────

describe('computeFilingDueDate()', () => {
  it('end of May → 26th of June in same year', () => {
    expect(computeFilingDueDate('2026-05-31')).toBe('2026-06-26')
  })

  it('end of December → 26th of January next year', () => {
    expect(computeFilingDueDate('2026-12-31')).toBe('2027-01-26')
  })

  it('end of January → 26th of February', () => {
    expect(computeFilingDueDate('2026-01-31')).toBe('2026-02-26')
  })

  it('end of November → 26th of December same year', () => {
    expect(computeFilingDueDate('2025-11-30')).toBe('2025-12-26')
  })

  it('mid-month period end still returns 26th of next month', () => {
    expect(computeFilingDueDate('2026-03-15')).toBe('2026-04-26')
  })

  it('February edge case → 26th of March', () => {
    expect(computeFilingDueDate('2026-02-28')).toBe('2026-03-26')
  })

  it('October → November', () => {
    expect(computeFilingDueDate('2026-10-31')).toBe('2026-11-26')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeKdv() — pure kernel
// ─────────────────────────────────────────────────────────────────────────────

describe('computeKdv()', () => {
  it('all zero inputs → net 0', () => {
    const r = computeKdv({ sales_vat_try: 0, purchase_vat_try: 0, expense_vat_try: 0 })
    expect(r.net_vat_try).toBe(0)
    expect(r.sales_vat_try).toBe(0)
    expect(r.purchase_vat_try).toBe(0)
    expect(r.expense_vat_try).toBe(0)
  })

  it('sales only → net = sales_vat', () => {
    const r = computeKdv({ sales_vat_try: 10_000, purchase_vat_try: 0, expense_vat_try: 0 })
    expect(r.net_vat_try).toBe(10_000)
  })

  it('deducts both purchase and expense vat', () => {
    const r = computeKdv({ sales_vat_try: 20_000, purchase_vat_try: 5_000, expense_vat_try: 3_000 })
    expect(r.net_vat_try).toBe(12_000)
  })

  it('net can be negative when inputs exceed outputs', () => {
    const r = computeKdv({ sales_vat_try: 1_000, purchase_vat_try: 3_000, expense_vat_try: 500 })
    expect(r.net_vat_try).toBe(-2_500)
  })

  it('values are rounded to 2dp', () => {
    const r = computeKdv({ sales_vat_try: 0.1, purchase_vat_try: 0.003, expense_vat_try: 0.002 })
    const dp = String(Math.abs(r.net_vat_try)).split('.')[1]?.length ?? 0
    expect(dp).toBeLessThanOrEqual(2)
  })

  it('returned object has all four fields', () => {
    const r = computeKdv({ sales_vat_try: 100, purchase_vat_try: 30, expense_vat_try: 20 })
    expect(r).toHaveProperty('sales_vat_try')
    expect(r).toHaveProperty('purchase_vat_try')
    expect(r).toHaveProperty('expense_vat_try')
    expect(r).toHaveProperty('net_vat_try')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeCorporateTax() — pure kernel
// ─────────────────────────────────────────────────────────────────────────────

describe('computeCorporateTax()', () => {
  it('standard case: 25% rate on profitable company', () => {
    // revenue=1M, cost=400k, expenses=200k → matrah=400k, tax=100k, net=300k
    const r = computeCorporateTax({
      revenue_try: 1_000_000,
      cost_try: 400_000,
      deductible_expenses_try: 200_000,
      rate_percent: 25,
    })
    expect(r.matrah_try).toBe(400_000)
    expect(r.tax_try).toBe(100_000)
    expect(r.net_after_tax_try).toBe(300_000)
    expect(r.rate_percent).toBe(25)
  })

  it('negative matrah (loss) → tax = 0, net = matrah', () => {
    const r = computeCorporateTax({
      revenue_try: 100_000,
      cost_try: 200_000,
      deductible_expenses_try: 50_000,
      rate_percent: 25,
    })
    expect(r.matrah_try).toBe(-150_000)
    expect(r.tax_try).toBe(0)
    expect(r.net_after_tax_try).toBe(-150_000)
  })

  it('zero matrah → tax = 0', () => {
    const r = computeCorporateTax({
      revenue_try: 100_000,
      cost_try: 70_000,
      deductible_expenses_try: 30_000,
      rate_percent: 25,
    })
    expect(r.matrah_try).toBe(0)
    expect(r.tax_try).toBe(0)
    expect(r.net_after_tax_try).toBe(0)
  })

  it('zero tax rate → tax = 0, net = matrah', () => {
    const r = computeCorporateTax({
      revenue_try: 500_000,
      cost_try: 200_000,
      deductible_expenses_try: 100_000,
      rate_percent: 0,
    })
    expect(r.matrah_try).toBe(200_000)
    expect(r.tax_try).toBe(0)
    expect(r.net_after_tax_try).toBe(200_000)
  })

  it('100% tax rate → net = 0', () => {
    const r = computeCorporateTax({
      revenue_try: 200_000,
      cost_try: 100_000,
      deductible_expenses_try: 50_000,
      rate_percent: 100,
    })
    expect(r.matrah_try).toBe(50_000)
    expect(r.tax_try).toBe(50_000)
    expect(r.net_after_tax_try).toBe(0)
  })

  it('all zeros → all zeros', () => {
    const r = computeCorporateTax({
      revenue_try: 0, cost_try: 0, deductible_expenses_try: 0, rate_percent: 25,
    })
    expect(r.matrah_try).toBe(0)
    expect(r.tax_try).toBe(0)
    expect(r.net_after_tax_try).toBe(0)
  })

  it('fractional result is rounded to 2dp', () => {
    // matrah = 1/3 * 3 = 1, tax = 0.333... at some odd rate
    const r = computeCorporateTax({
      revenue_try: 100, cost_try: 0, deductible_expenses_try: 0, rate_percent: 33,
    })
    const dpTax = String(r.tax_try).split('.')[1]?.length ?? 0
    const dpNet = String(r.net_after_tax_try).split('.')[1]?.length ?? 0
    expect(dpTax).toBeLessThanOrEqual(2)
    expect(dpNet).toBeLessThanOrEqual(2)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// nextCorporateTaxAdvanceDue()
// ─────────────────────────────────────────────────────────────────────────────

describe('nextCorporateTaxAdvanceDue()', () => {
  it('January 1 → next due is January 17 same year (Jan 17 is first in-year due)', () => {
    expect(nextCorporateTaxAdvanceDue('2026-01-01')).toBe('2026-01-17')
  })

  it('April 16 → next due is April 17', () => {
    expect(nextCorporateTaxAdvanceDue('2026-04-16')).toBe('2026-04-17')
  })

  it('April 17 itself → next due is July 17', () => {
    // '2026-04-17' is NOT greater than '2026-04-17' so it skips to next
    expect(nextCorporateTaxAdvanceDue('2026-04-17')).toBe('2026-07-17')
  })

  it('July 1 → next due is July 17', () => {
    expect(nextCorporateTaxAdvanceDue('2026-07-01')).toBe('2026-07-17')
  })

  it('October 18 → next due is January 17 next year', () => {
    expect(nextCorporateTaxAdvanceDue('2026-10-18')).toBe('2027-01-17')
  })

  it('December 31 → next due is January 17 next year', () => {
    expect(nextCorporateTaxAdvanceDue('2026-12-31')).toBe('2027-01-17')
  })

  it('result is always a valid YYYY-MM-DD string', () => {
    const result = nextCorporateTaxAdvanceDue('2026-06-01')
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('result date is always after the input date', () => {
    const input = '2026-05-15'
    const result = nextCorporateTaxAdvanceDue(input)
    expect(result > input).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeKDVFromRows() — additional edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe('computeKDVFromRows() — additional edge cases', () => {
  it('many sales rows sum correctly', () => {
    const sales = Array.from({ length: 10 }, () => ({ kdv_amount_try: 1000 }))
    const r = computeKDVFromRows(sales, [])
    expect(r.output_vat_try).toBe(10_000)
    expect(r.vat_payable).toBe(true)
  })

  it('many expense rows sum correctly', () => {
    const expenses = Array.from({ length: 5 }, () => ({ kdv_deductible_try: 200 }))
    const r = computeKDVFromRows([], expenses)
    expect(r.input_vat_try).toBe(1_000)
    expect(r.vat_payable).toBe(false)
  })

  it('single row with zero kdv_amount_try → output 0', () => {
    const r = computeKDVFromRows([{ kdv_amount_try: 0 }], [])
    expect(r.output_vat_try).toBe(0)
    expect(r.vat_payable).toBe(false)
  })

  it('net_vat_try = output - input always', () => {
    const r = computeKDVFromRows(
      [{ kdv_amount_try: 7500 }, { kdv_amount_try: 2500 }],
      [{ kdv_deductible_try: 3000 }, { kdv_deductible_try: 1000 }],
    )
    expect(r.net_vat_try).toBe(r.output_vat_try - r.input_vat_try)
  })
})
