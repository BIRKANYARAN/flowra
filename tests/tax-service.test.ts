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

// ─────────────────────────────────────────────────────────────────────────────
// computeFilingDueDate() — additional boundary tests
// ─────────────────────────────────────────────────────────────────────────────

describe('computeFilingDueDate() — additional boundary tests', () => {
  it('April → 26th of May', () => {
    expect(computeFilingDueDate('2026-04-30')).toBe('2026-05-26')
  })

  it('June → 26th of July', () => {
    expect(computeFilingDueDate('2026-06-30')).toBe('2026-07-26')
  })

  it('August → 26th of September', () => {
    expect(computeFilingDueDate('2026-08-31')).toBe('2026-09-26')
  })

  it('September → 26th of October', () => {
    expect(computeFilingDueDate('2026-09-30')).toBe('2026-10-26')
  })

  it('March → 26th of April', () => {
    expect(computeFilingDueDate('2026-03-31')).toBe('2026-04-26')
  })

  it('July → 26th of August', () => {
    expect(computeFilingDueDate('2026-07-31')).toBe('2026-08-26')
  })

  it('always returns YYYY-MM-26 format', () => {
    const months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']
    for (const m of months) {
      const result = computeFilingDueDate(`2026-${m}-01`)
      expect(result).toMatch(/^\d{4}-\d{2}-26$/)
    }
  })

  it('due date is always in the next month', () => {
    // For May, due is June (month 6)
    const result = computeFilingDueDate('2026-05-15')
    expect(result.startsWith('2026-06')).toBe(true)
  })

  it('Dec → Jan next year (year boundary)', () => {
    const result = computeFilingDueDate('2025-12-01')
    expect(result).toBe('2026-01-26')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeKdv() — additional boundary tests
// ─────────────────────────────────────────────────────────────────────────────

describe('computeKdv() — additional boundary tests', () => {
  it('large positive net VAT', () => {
    const r = computeKdv({ sales_vat_try: 1_000_000, purchase_vat_try: 0, expense_vat_try: 0 })
    expect(r.net_vat_try).toBe(1_000_000)
  })

  it('large negative net VAT (heavy input credits)', () => {
    const r = computeKdv({ sales_vat_try: 0, purchase_vat_try: 500_000, expense_vat_try: 500_000 })
    expect(r.net_vat_try).toBe(-1_000_000)
  })

  it('purchase_vat_try alone reduces net', () => {
    const r = computeKdv({ sales_vat_try: 10_000, purchase_vat_try: 8_000, expense_vat_try: 0 })
    expect(r.net_vat_try).toBe(2_000)
  })

  it('expense_vat_try alone reduces net', () => {
    const r = computeKdv({ sales_vat_try: 10_000, purchase_vat_try: 0, expense_vat_try: 6_000 })
    expect(r.net_vat_try).toBe(4_000)
  })

  it('all three non-zero deductions', () => {
    const r = computeKdv({ sales_vat_try: 50_000, purchase_vat_try: 10_000, expense_vat_try: 15_000 })
    expect(r.net_vat_try).toBe(25_000)
  })

  it('passthrough: input fields are preserved in output', () => {
    const r = computeKdv({ sales_vat_try: 500, purchase_vat_try: 200, expense_vat_try: 100 })
    expect(r.sales_vat_try).toBe(500)
    expect(r.purchase_vat_try).toBe(200)
    expect(r.expense_vat_try).toBe(100)
  })

  it('fractional rounding: 0.1 + 0.2 normalized', () => {
    const r = computeKdv({ sales_vat_try: 0.3, purchase_vat_try: 0.1, expense_vat_try: 0.1 })
    const dp = String(Math.abs(r.net_vat_try)).split('.')[1]?.length ?? 0
    expect(dp).toBeLessThanOrEqual(2)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeCorporateTax() — additional boundary tests
// ─────────────────────────────────────────────────────────────────────────────

describe('computeCorporateTax() — additional boundary tests', () => {
  it('standard 25% rate on known numbers', () => {
    const r = computeCorporateTax({
      revenue_try: 500_000, cost_try: 200_000, deductible_expenses_try: 100_000, rate_percent: 25,
    })
    // matrah = 200_000, tax = 50_000, net = 150_000
    expect(r.matrah_try).toBe(200_000)
    expect(r.tax_try).toBe(50_000)
    expect(r.net_after_tax_try).toBe(150_000)
  })

  it('20% rate: historically was the standard', () => {
    const r = computeCorporateTax({
      revenue_try: 100_000, cost_try: 0, deductible_expenses_try: 0, rate_percent: 20,
    })
    expect(r.tax_try).toBeCloseTo(20_000, 2)
    expect(r.net_after_tax_try).toBeCloseTo(80_000, 2)
  })

  it('net_after_tax_try = matrah - tax', () => {
    const r = computeCorporateTax({
      revenue_try: 300_000, cost_try: 100_000, deductible_expenses_try: 50_000, rate_percent: 25,
    })
    expect(r.net_after_tax_try).toBeCloseTo(r.matrah_try - r.tax_try, 2)
  })

  it('small positive matrah → correct tax (rounds to 2dp)', () => {
    // matrah = 10, tax = 10 * 0.25 = 2.50
    const r = computeCorporateTax({
      revenue_try: 110, cost_try: 100, deductible_expenses_try: 0, rate_percent: 25,
    })
    expect(r.matrah_try).toBeCloseTo(10, 2)
    expect(r.tax_try).toBeCloseTo(2.5, 2)
    expect(r.net_after_tax_try).toBeCloseTo(7.5, 2)
  })

  it('rate_percent=50 → tax is half of matrah', () => {
    const r = computeCorporateTax({
      revenue_try: 200_000, cost_try: 0, deductible_expenses_try: 0, rate_percent: 50,
    })
    expect(r.tax_try).toBe(100_000)
    expect(r.net_after_tax_try).toBe(100_000)
  })

  it('result object always has all four fields', () => {
    const r = computeCorporateTax({
      revenue_try: 100, cost_try: 0, deductible_expenses_try: 0, rate_percent: 25,
    })
    expect(r).toHaveProperty('matrah_try')
    expect(r).toHaveProperty('tax_try')
    expect(r).toHaveProperty('net_after_tax_try')
    expect(r).toHaveProperty('rate_percent')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// nextCorporateTaxAdvanceDue() — additional boundary tests
// ─────────────────────────────────────────────────────────────────────────────

describe('nextCorporateTaxAdvanceDue() — additional boundary tests', () => {
  it('October 1 → October 17', () => {
    expect(nextCorporateTaxAdvanceDue('2026-10-01')).toBe('2026-10-17')
  })

  it('October 17 → January 17 next year', () => {
    expect(nextCorporateTaxAdvanceDue('2026-10-17')).toBe('2027-01-17')
  })

  it('July 17 → October 17', () => {
    expect(nextCorporateTaxAdvanceDue('2026-07-17')).toBe('2026-10-17')
  })

  it('January 17 → April 17', () => {
    expect(nextCorporateTaxAdvanceDue('2026-01-17')).toBe('2026-04-17')
  })

  it('February 1 → April 17', () => {
    expect(nextCorporateTaxAdvanceDue('2026-02-01')).toBe('2026-04-17')
  })

  it('November 1 → January 17 next year', () => {
    expect(nextCorporateTaxAdvanceDue('2026-11-01')).toBe('2027-01-17')
  })

  it('due date is always on 17th of a month', () => {
    const dates = ['2026-01-01', '2026-04-01', '2026-07-01', '2026-10-01']
    for (const d of dates) {
      const result = nextCorporateTaxAdvanceDue(d)
      expect(result.endsWith('-17')).toBe(true)
    }
  })

  it('due month is always one of Jan, Apr, Jul, Oct', () => {
    const validMonths = ['01', '04', '07', '10']
    const inputDates = ['2026-02-15', '2026-05-20', '2026-08-08', '2026-11-30']
    for (const d of inputDates) {
      const result = nextCorporateTaxAdvanceDue(d)
      const month = result.slice(5, 7)
      expect(validMonths).toContain(month)
    }
  })
})
