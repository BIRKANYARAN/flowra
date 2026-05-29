/**
 * Phase 4 — Financial + Tax Core pure-math tests.
 *
 * Scope (deterministic, no DB):
 *   • computeKdv()             — VAT net arithmetic
 *   • computeCorporateTax()    — matrah, tax, net-after-tax
 *   • materializeRecurring()   — occurrence dates, day clamping, period overlap
 *   • resolveDeductibility()   — category map + row-level override
 *   • resolveExpenseType()     — category → type classification
 *   • periodForMonth()         — convenience helper
 *
 * These are the financial core functions. Accuracy > brevity in comments.
 *
 * Run with:  npx vitest run tests/finance-tax.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  computeKdv,
  computeCorporateTax,
} from '../lib/services/tax.service'
import {
  materializeRecurring,
  NON_DEDUCTIBLE_EXPENSE_TYPES,
  resolveDeductibility,
  resolveExpenseType,
  periodForMonth,
  CORPORATE_TAX_RATE_TR,
  KDV_STANDARD_TR,
  DEDUCTIBILITY_MAP,
} from '../lib/services/finance-rules'

// ─────────────────────────────────────────────────────────────────────────────
// computeKdv() — VAT net
// ─────────────────────────────────────────────────────────────────────────────

describe('computeKdv()', () => {
  it('positive net_vat → money owed to authority', () => {
    const r = computeKdv({ sales_vat_try: 10000, purchase_vat_try: 3000, expense_vat_try: 1000 })
    expect(r.net_vat_try).toBe(6000)
    expect(r.sales_vat_try).toBe(10000)
    expect(r.purchase_vat_try).toBe(3000)
    expect(r.expense_vat_try).toBe(1000)
  })

  it('negative net_vat → recoverable credit (carry forward)', () => {
    const r = computeKdv({ sales_vat_try: 2000, purchase_vat_try: 5000, expense_vat_try: 1000 })
    expect(r.net_vat_try).toBe(-4000)
  })

  it('zero VAT across the board → net zero', () => {
    const r = computeKdv({ sales_vat_try: 0, purchase_vat_try: 0, expense_vat_try: 0 })
    expect(r.net_vat_try).toBe(0)
  })

  it('rounds to 2 decimal places', () => {
    const r = computeKdv({ sales_vat_try: 100.001, purchase_vat_try: 0.0005, expense_vat_try: 0 })
    // 100.001 - 0.0005 = 100.0005 → rounds to 100
    expect(r.net_vat_try).toBe(100)
  })

  it('no purchases, no expenses → net equals sales VAT', () => {
    const r = computeKdv({ sales_vat_try: 5000, purchase_vat_try: 0, expense_vat_try: 0 })
    expect(r.net_vat_try).toBe(5000)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeCorporateTax() — matrah + tax
// ─────────────────────────────────────────────────────────────────────────────

describe('computeCorporateTax()', () => {
  it('standard profitable period (Turkey 25%)', () => {
    // matrah = 200000 - 80000 - 40000 = 80000
    // tax    = 80000 × 0.25 = 20000
    // net    = 80000 - 20000 = 60000
    const r = computeCorporateTax({
      revenue_try: 200000,
      cost_try: 80000,
      deductible_expenses_try: 40000,
      rate_percent: 25,
    })
    expect(r.matrah_try).toBe(80000)
    expect(r.tax_try).toBe(20000)
    expect(r.net_after_tax_try).toBe(60000)
    expect(r.rate_percent).toBe(25)
  })

  it('loss period → matrah negative, tax is ZERO (not negative)', () => {
    // Losses don't generate a tax refund from a one-period perspective.
    // net_after_tax = matrah - 0 = matrah (still negative — loss preserved)
    const r = computeCorporateTax({
      revenue_try: 50000,
      cost_try: 70000,
      deductible_expenses_try: 20000,
      rate_percent: 25,
    })
    expect(r.matrah_try).toBe(-40000)
    expect(r.tax_try).toBe(0)
    expect(r.net_after_tax_try).toBe(-40000)
  })

  it('break-even period (matrah = 0) → tax is 0', () => {
    const r = computeCorporateTax({
      revenue_try: 100000,
      cost_try: 60000,
      deductible_expenses_try: 40000,
      rate_percent: 25,
    })
    expect(r.matrah_try).toBe(0)
    expect(r.tax_try).toBe(0)
    expect(r.net_after_tax_try).toBe(0)
  })

  it('non-deductible expenses do NOT reduce matrah', () => {
    // Dividend (50000) is non-deductible → deductible_expenses = 30000 only
    // matrah = 200000 - 80000 - 30000 = 90000
    // (not 200000 - 80000 - 80000 = 40000)
    const r = computeCorporateTax({
      revenue_try: 200000,
      cost_try: 80000,
      deductible_expenses_try: 30000,   // salary only
      rate_percent: 25,
    })
    expect(r.matrah_try).toBe(90000)
    expect(r.tax_try).toBe(22500)
  })

  it('zero tax rate → no tax, net = matrah', () => {
    const r = computeCorporateTax({
      revenue_try: 100000,
      cost_try: 0,
      deductible_expenses_try: 0,
      rate_percent: 0,
    })
    expect(r.tax_try).toBe(0)
    expect(r.net_after_tax_try).toBe(100000)
  })

  it('high rate (30% for banks)', () => {
    const r = computeCorporateTax({
      revenue_try: 1000000,
      cost_try: 600000,
      deductible_expenses_try: 100000,
      rate_percent: 30,
    })
    // matrah = 300000; tax = 90000; net = 210000
    expect(r.matrah_try).toBe(300000)
    expect(r.tax_try).toBe(90000)
    expect(r.net_after_tax_try).toBe(210000)
  })

  it('floating point rounding stays at 2dp', () => {
    // matrah = 33333.33; tax at 25% = 8333.3325 → rounds to 8333.33
    const r = computeCorporateTax({
      revenue_try: 33333.33,
      cost_try: 0,
      deductible_expenses_try: 0,
      rate_percent: 25,
    })
    expect(r.tax_try).toBe(8333.33)
    // 33333.33 - 8333.33 = 25000.00 (exact IEEE 754 — no epsilon gap here)
    expect(r.net_after_tax_try).toBe(25000)
    // Verify: matrah - tax = net (no rounding gap larger than 0.01)
    expect(Math.abs(r.matrah_try - r.tax_try - r.net_after_tax_try)).toBeLessThanOrEqual(0.01)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// materializeRecurring() — occurrence dates
// ─────────────────────────────────────────────────────────────────────────────

describe('materializeRecurring()', () => {
  it('monthly — three occurrences within a quarter', () => {
    const dates = materializeRecurring(
      { frequency: 'monthly', start_date: '2025-01-01', end_date: null },
      { from: '2025-01-01', to: '2025-03-31' },
    )
    expect(dates).toEqual(['2025-01-01', '2025-02-01', '2025-03-01'])
  })

  it('quarterly — two occurrences across six months', () => {
    const dates = materializeRecurring(
      { frequency: 'quarterly', start_date: '2025-01-15', end_date: null },
      { from: '2025-01-01', to: '2025-06-30' },
    )
    expect(dates).toEqual(['2025-01-15', '2025-04-15'])
  })

  it('yearly — one occurrence in a 12-month window', () => {
    const dates = materializeRecurring(
      { frequency: 'yearly', start_date: '2024-03-20', end_date: null },
      { from: '2025-01-01', to: '2025-12-31' },
    )
    expect(dates).toEqual(['2025-03-20'])
  })

  it('end_date clips occurrences — no emissions after it', () => {
    const dates = materializeRecurring(
      { frequency: 'monthly', start_date: '2025-01-01', end_date: '2025-02-15' },
      { from: '2025-01-01', to: '2025-04-30' },
    )
    // March and April are past end_date → excluded
    expect(dates).toEqual(['2025-01-01', '2025-02-01'])
  })

  it('period.from clips earlier occurrences — no emissions before it', () => {
    const dates = materializeRecurring(
      { frequency: 'monthly', start_date: '2024-11-01', end_date: null },
      { from: '2025-01-01', to: '2025-02-28' },
    )
    // Nov 2024, Dec 2024 are before the period → excluded
    expect(dates).toEqual(['2025-01-01', '2025-02-01'])
  })

  it('start_date > period.to → no occurrences', () => {
    const dates = materializeRecurring(
      { frequency: 'monthly', start_date: '2026-01-01', end_date: null },
      { from: '2025-01-01', to: '2025-12-31' },
    )
    expect(dates).toEqual([])
  })

  it('empty period (from = to) → at most one occurrence', () => {
    const single = materializeRecurring(
      { frequency: 'monthly', start_date: '2025-06-15', end_date: null },
      { from: '2025-06-15', to: '2025-06-15' },
    )
    expect(single).toEqual(['2025-06-15'])

    const none = materializeRecurring(
      { frequency: 'monthly', start_date: '2025-06-15', end_date: null },
      { from: '2025-06-20', to: '2025-06-20' },
    )
    expect(none).toEqual([])
  })

  it('day-clamping — anchor on day 31, February clamps to 28 or 29', () => {
    // Jan 31 → Feb 28 (2025 is not a leap year) → Mar 31
    const dates = materializeRecurring(
      { frequency: 'monthly', start_date: '2025-01-31', end_date: null },
      { from: '2025-01-01', to: '2025-03-31' },
    )
    expect(dates).toEqual(['2025-01-31', '2025-02-28', '2025-03-31'])
  })

  it('day-clamping — anchor on day 31, leap Feb clamps to 29', () => {
    // 2024 is a leap year → Feb has 29 days
    const dates = materializeRecurring(
      { frequency: 'monthly', start_date: '2024-01-31', end_date: null },
      { from: '2024-01-01', to: '2024-02-29' },
    )
    expect(dates).toEqual(['2024-01-31', '2024-02-29'])
  })

  it('yearly over 3 years', () => {
    const dates = materializeRecurring(
      { frequency: 'yearly', start_date: '2023-07-04', end_date: null },
      { from: '2023-01-01', to: '2025-12-31' },
    )
    expect(dates).toEqual(['2023-07-04', '2024-07-04', '2025-07-04'])
  })

  it('no occurrences when period reversed (from > to) → returns empty', () => {
    const dates = materializeRecurring(
      { frequency: 'monthly', start_date: '2025-01-01', end_date: null },
      { from: '2025-03-01', to: '2025-01-01' },
    )
    expect(dates).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// resolveDeductibility() — category map + row-level override
// ─────────────────────────────────────────────────────────────────────────────

describe('resolveDeductibility()', () => {
  it('deductible categories return true when no override', () => {
    for (const cat of ['rent', 'salary', 'utilities', 'marketing', 'logistics', 'software', 'equipment', 'interest', 'general', 'other'] as const) {
      expect(resolveDeductibility(cat), `expected ${cat} to be deductible`).toBe(true)
    }
  })

  it('non-deductible categories return false when no override', () => {
    for (const cat of ['tax', 'principal', 'dividend', 'partner_loan'] as const) {
      expect(resolveDeductibility(cat), `expected ${cat} to be non-deductible`).toBe(false)
    }
  })

  it('explicit true override wins regardless of category map', () => {
    // dividend is normally non-deductible; an explicit override flips it
    expect(resolveDeductibility('dividend', true)).toBe(true)
  })

  it('explicit false override wins regardless of category map', () => {
    // salary is normally deductible; override to false flips it
    expect(resolveDeductibility('salary', false)).toBe(false)
  })

  it('null override → falls back to category map', () => {
    expect(resolveDeductibility('rent', null)).toBe(true)
    expect(resolveDeductibility('dividend', null)).toBe(false)
  })

  it('undefined override → falls back to category map', () => {
    expect(resolveDeductibility('salary', undefined)).toBe(true)
  })

  it('unknown category → defaults to true (defensive)', () => {
    expect(resolveDeductibility('unknown_future_category')).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// resolveExpenseType() — classification
// ─────────────────────────────────────────────────────────────────────────────

describe('resolveExpenseType()', () => {
  // Enterprise canonical type names (types/index.ts ExpenseType union)
  it('operating categories → operational', () => {
    for (const cat of ['general', 'rent', 'salary', 'utilities', 'marketing', 'logistics', 'software', 'other'] as const) {
      expect(resolveExpenseType(cat)).toBe('operational')
    }
  })
  it('capital: equipment', () => { expect(resolveExpenseType('equipment')).toBe('capital') })
  it('tax: tax',           () => { expect(resolveExpenseType('tax')).toBe('tax') })
  it('financial: interest',() => { expect(resolveExpenseType('interest')).toBe('financial') })
  it('distribution: dividend → dividend', () => { expect(resolveExpenseType('dividend')).toBe('dividend') })
  it('loan: principal → loan_repayment', () => {
    expect(resolveExpenseType('principal')).toBe('loan_repayment')
  })
  it('partner_loan → partner_financing (@deprecated category)', () => {
    // partner_loan is a legacy category — maps to partner_financing in enterprise,
    // not loan_repayment. Use partner_transactions for actual loan tracking.
    expect(resolveExpenseType('partner_loan')).toBe('partner_financing')
  })
  it('unknown → defaults to operational', () => {
    expect(resolveExpenseType('something_new')).toBe('operational')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// periodForMonth() helper
// ─────────────────────────────────────────────────────────────────────────────

describe('periodForMonth()', () => {
  it('January 2025 → full month range', () => {
    const p = periodForMonth('2025-01')
    expect(p.from).toBe('2025-01-01')
    expect(p.to).toBe('2025-01-31')
  })
  it('February 2025 (non-leap) → ends on 28', () => {
    const p = periodForMonth('2025-02')
    expect(p.to).toBe('2025-02-28')
  })
  it('February 2024 (leap year) → ends on 29', () => {
    const p = periodForMonth('2024-02')
    expect(p.to).toBe('2024-02-29')
  })
  it('December 2024 → ends on 31', () => {
    const p = periodForMonth('2024-12')
    expect(p.to).toBe('2024-12-31')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// NON_DEDUCTIBLE_EXPENSE_TYPES — Faz 11-C alignment set
//
// This set drives the deductibility override in finance.service.ts to align
// with the expense_type filter in /api/cfo-metrics. Both code paths must agree
// on which expense types are excluded from the corporate tax base.
// ─────────────────────────────────────────────────────────────────────────────

describe('NON_DEDUCTIBLE_EXPENSE_TYPES', () => {
  it('contains exactly the four non-P&L expense types', () => {
    // These four types are balance-sheet movements or after-tax distributions
    // and must be excluded from the corporate tax matrah in BOTH cfo-metrics
    // (expense_type column filter) and finance.service.ts (getOperatingExpenses).
    expect(NON_DEDUCTIBLE_EXPENSE_TYPES.has('internal_transfer')).toBe(true)
    expect(NON_DEDUCTIBLE_EXPENSE_TYPES.has('partner_financing')).toBe(true)
    expect(NON_DEDUCTIBLE_EXPENSE_TYPES.has('loan_repayment')).toBe(true)
    expect(NON_DEDUCTIBLE_EXPENSE_TYPES.has('dividend')).toBe(true)
  })

  it('does NOT contain operational expense types', () => {
    for (const t of ['operational', 'capital', 'financial', 'tax', 'other'] as const) {
      expect(NON_DEDUCTIBLE_EXPENSE_TYPES.has(t), `${t} should NOT be in non-deductible set`).toBe(false)
    }
  })

  it('has exactly 4 entries — no accidental additions', () => {
    expect(NON_DEDUCTIBLE_EXPENSE_TYPES.size).toBe(4)
  })

  it('mirrors cfo-metrics exclusion logic — internal_transfer is excluded', () => {
    // Regression guard: if this fails, the finance.service.ts and
    // /api/cfo-metrics divergence (Faz 11-C) would re-appear.
    // The cfo-metrics route excludes expenses where:
    //   expense_type === 'partner_financing' || 'loan_repayment' || 'dividend' || 'internal_transfer'
    // This set must contain the same four types.
    const cfoMetricsExclusions = new Set(['partner_financing', 'loan_repayment', 'dividend', 'internal_transfer'])
    for (const t of cfoMetricsExclusions) {
      expect(NON_DEDUCTIBLE_EXPENSE_TYPES.has(t as never), `${t} missing from set`).toBe(true)
    }
    expect(NON_DEDUCTIBLE_EXPENSE_TYPES.size).toBe(cfoMetricsExclusions.size)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Tax constant sanity checks
// ─────────────────────────────────────────────────────────────────────────────

describe('Tax constants', () => {
  it('CORPORATE_TAX_RATE_TR is 25 (Turkey 2024-25)', () => {
    expect(CORPORATE_TAX_RATE_TR).toBe(25)
  })
  it('KDV_STANDARD_TR is 20 (Turkey 2023+)', () => {
    expect(KDV_STANDARD_TR).toBe(20)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// End-to-end numerical scenario — "company truth" example
// ─────────────────────────────────────────────────────────────────────────────

describe('Full-company scenario (numerical)', () => {
  /**
   * Example company — Q1 2025:
   *   Revenue          = ₺500,000
   *   COGS             = ₺200,000
   *   Gross profit     = ₺300,000
   *
   *   Deductible expenses:
   *     Rent            ₺15,000
   *     Salary          ₺60,000
   *     Utilities       ₺5,000
   *     Interest (loan) ₺3,000
   *   Total deductible  = ₺83,000
   *
   *   Non-deductible expenses:
   *     Dividend        ₺50,000
   *     Loan principal  ₺20,000
   *   Total non-deduct. = ₺70,000
   *
   *   Matrah = 300,000 - 83,000 = ₺217,000
   *   Tax    = 217,000 × 25%   = ₺54,250
   *   Net    = 217,000 - 54,250 = ₺162,750
   *
   *   VAT:
   *     Sales VAT    ₺100,000
   *     Purchase VAT ₺30,000
   *     Expense VAT  ₺4,150  (rent 15000×20%, utilities 5000×20%, salary 0)
   *     Net VAT      = 100,000 - 30,000 - 4,150 = ₺65,850  (payable)
   */
  it('computes matrah and tax correctly', () => {
    const tax = computeCorporateTax({
      revenue_try:             500000,
      cost_try:                200000,
      deductible_expenses_try: 83000,
      rate_percent:            25,
    })
    expect(tax.matrah_try).toBe(217000)
    expect(tax.tax_try).toBe(54250)
    expect(tax.net_after_tax_try).toBe(162750)
  })

  it('computes KDV net correctly', () => {
    const vat = computeKdv({
      sales_vat_try:    100000,
      purchase_vat_try: 30000,
      expense_vat_try:  4150,
    })
    expect(vat.net_vat_try).toBe(65850)
  })

  it('non-deductible expenses (70,000) do NOT reduce matrah', () => {
    // If we naively include non-deductible, matrah would be 300000-153000=147000
    // Correct answer excludes them → matrah = 217000
    const taxWithAll = computeCorporateTax({
      revenue_try:             500000,
      cost_try:                200000,
      deductible_expenses_try: 153000,  // wrong: includes dividend + principal
      rate_percent:            25,
    })
    const taxDeductOnly = computeCorporateTax({
      revenue_try:             500000,
      cost_try:                200000,
      deductible_expenses_try: 83000,   // correct
      rate_percent:            25,
    })
    // The government collects MORE tax when non-deductible items are excluded
    expect(taxDeductOnly.tax_try).toBeGreaterThan(taxWithAll.tax_try)
    expect(taxDeductOnly.matrah_try).toBe(217000)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeKdv() — with explicit VAT rates (0%, 8%, 18%)
// ─────────────────────────────────────────────────────────────────────────────

describe('computeKdv() — explicit VAT rates', () => {
  it('0% rate — all zeros produce zero net_vat', () => {
    const r = computeKdv({ sales_vat_try: 0, purchase_vat_try: 0, expense_vat_try: 0 })
    expect(r.net_vat_try).toBe(0)
    expect(r.sales_vat_try).toBe(0)
  })

  it('8% rate — reduced-rate sales VAT only (no purchases)', () => {
    // Sales base = 50000, 8% KDV → sales_vat = 4000
    const r = computeKdv({ sales_vat_try: 4000, purchase_vat_try: 0, expense_vat_try: 0 })
    expect(r.net_vat_try).toBe(4000)
  })

  it('18% rate — net correctly computed', () => {
    // sales_vat = 18000 (100000 * 18%), purchase_vat = 7200, expense_vat = 360
    const r = computeKdv({ sales_vat_try: 18000, purchase_vat_try: 7200, expense_vat_try: 360 })
    expect(r.net_vat_try).toBe(10440)
  })

  it('20% standard rate with deductible expense VAT', () => {
    // sales_vat = 20000 (100k * 20%), expense_vat = 2000 (10k * 20%)
    const r = computeKdv({ sales_vat_try: 20000, purchase_vat_try: 0, expense_vat_try: 2000 })
    expect(r.net_vat_try).toBe(18000)
  })

  it('mixed rates — partial purchase VAT credit', () => {
    // Sales at 20% + 8%, purchase at 20%
    const r = computeKdv({ sales_vat_try: 12000, purchase_vat_try: 5000, expense_vat_try: 500 })
    expect(r.net_vat_try).toBe(6500)
  })

  it('all three components sum correctly (associativity)', () => {
    const s = 8000, p = 2000, e = 1000
    const r = computeKdv({ sales_vat_try: s, purchase_vat_try: p, expense_vat_try: e })
    expect(r.net_vat_try).toBeCloseTo(s - p - e, 2)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeCorporateTax() — additional edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe('computeCorporateTax() — additional edge cases', () => {
  it('zero expenses: matrah = revenue − cost', () => {
    const r = computeCorporateTax({
      revenue_try: 300000,
      cost_try: 100000,
      deductible_expenses_try: 0,
      rate_percent: 25,
    })
    expect(r.matrah_try).toBe(200000)
    expect(r.tax_try).toBe(50000)
    expect(r.net_after_tax_try).toBe(150000)
  })

  it('large loss scenario: net_after_tax equals matrah (no tax applied)', () => {
    const r = computeCorporateTax({
      revenue_try: 10000,
      cost_try: 100000,
      deductible_expenses_try: 5000,
      rate_percent: 25,
    })
    expect(r.tax_try).toBe(0)
    expect(r.net_after_tax_try).toBe(r.matrah_try)
    expect(r.matrah_try).toBeLessThan(0)
  })

  it('matrah = revenue − cost − deductible_expenses (formula validation)', () => {
    const input = { revenue_try: 450000, cost_try: 150000, deductible_expenses_try: 50000, rate_percent: 25 }
    const r = computeCorporateTax(input)
    const expectedMatrah = input.revenue_try - input.cost_try - input.deductible_expenses_try
    expect(r.matrah_try).toBeCloseTo(expectedMatrah, 2)
  })

  it('rate_percent = 100 → net_after_tax = 0 (all taxed away)', () => {
    const r = computeCorporateTax({
      revenue_try: 100000,
      cost_try: 0,
      deductible_expenses_try: 0,
      rate_percent: 100,
    })
    expect(r.tax_try).toBe(100000)
    expect(r.net_after_tax_try).toBe(0)
  })

  it('very small positive matrah — tax rounds to correct 2dp', () => {
    // matrah = 0.03, tax at 25% = 0.0075 → rounds to 0.01
    const r = computeCorporateTax({
      revenue_try: 0.03,
      cost_try: 0,
      deductible_expenses_try: 0,
      rate_percent: 25,
    })
    expect(r.matrah_try).toBeCloseTo(0.03, 2)
    expect(r.tax_try).toBeGreaterThanOrEqual(0)
    expect(r.tax_try).toBeLessThanOrEqual(0.01)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// materializeRecurring() — leap year and additional scenarios
// ─────────────────────────────────────────────────────────────────────────────

describe('materializeRecurring() — leap year February and extra scenarios', () => {
  it('anchor day 29 in Feb 2024 (leap) → Feb 29 included', () => {
    const dates = materializeRecurring(
      { frequency: 'monthly', start_date: '2024-01-29', end_date: null },
      { from: '2024-01-01', to: '2024-03-31' },
    )
    expect(dates).toContain('2024-02-29')
  })

  it('anchor day 29 in Feb 2025 (non-leap) → clamps to Feb 28', () => {
    const dates = materializeRecurring(
      { frequency: 'monthly', start_date: '2025-01-29', end_date: null },
      { from: '2025-02-01', to: '2025-02-28' },
    )
    expect(dates).toContain('2025-02-28')
  })

  it('leap year Feb 29 anchor — next occurrence in non-leap year clamps to 28', () => {
    // anchor: Feb 29 2024 → Mar 29 2024 → ... → Feb 28 2025
    const dates = materializeRecurring(
      { frequency: 'monthly', start_date: '2024-02-29', end_date: null },
      { from: '2025-02-01', to: '2025-02-28' },
    )
    expect(dates).toContain('2025-02-28')
    expect(dates).not.toContain('2025-03-01')
  })

  it('quarterly from Jan-15 over 12 months produces 4 occurrences', () => {
    const dates = materializeRecurring(
      { frequency: 'quarterly', start_date: '2025-01-15', end_date: null },
      { from: '2025-01-01', to: '2025-12-31' },
    )
    expect(dates).toHaveLength(4)
    expect(dates).toEqual(['2025-01-15', '2025-04-15', '2025-07-15', '2025-10-15'])
  })

  it('yearly with end_date before 3rd occurrence → only 2 results', () => {
    const dates = materializeRecurring(
      { frequency: 'yearly', start_date: '2023-05-01', end_date: '2024-12-31' },
      { from: '2023-01-01', to: '2025-12-31' },
    )
    expect(dates).toEqual(['2023-05-01', '2024-05-01'])
  })

  it('monthly anchor=30, February clamps to 28 in non-leap', () => {
    const dates = materializeRecurring(
      { frequency: 'monthly', start_date: '2025-01-30', end_date: null },
      { from: '2025-01-01', to: '2025-03-31' },
    )
    expect(dates).toEqual(['2025-01-30', '2025-02-28', '2025-03-30'])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// DEDUCTIBILITY_MAP — all 14 categories verified
// ─────────────────────────────────────────────────────────────────────────────

describe('DEDUCTIBILITY_MAP — complete category coverage', () => {
  it('board_fee is deductible', () => {
    expect(DEDUCTIBILITY_MAP['board_fee']).toBe(true)
  })

  it('rent is deductible', () => {
    expect(DEDUCTIBILITY_MAP['rent']).toBe(true)
  })

  it('salary is deductible', () => {
    expect(DEDUCTIBILITY_MAP['salary']).toBe(true)
  })

  it('utilities is deductible', () => {
    expect(DEDUCTIBILITY_MAP['utilities']).toBe(true)
  })

  it('software is deductible', () => {
    expect(DEDUCTIBILITY_MAP['software']).toBe(true)
  })

  it('marketing is deductible', () => {
    expect(DEDUCTIBILITY_MAP['marketing']).toBe(true)
  })

  it('logistics is deductible', () => {
    expect(DEDUCTIBILITY_MAP['logistics']).toBe(true)
  })

  it('equipment is deductible (simplified depreciation)', () => {
    expect(DEDUCTIBILITY_MAP['equipment']).toBe(true)
  })

  it('interest is deductible', () => {
    expect(DEDUCTIBILITY_MAP['interest']).toBe(true)
  })

  it('general is deductible', () => {
    expect(DEDUCTIBILITY_MAP['general']).toBe(true)
  })

  it('other is deductible', () => {
    expect(DEDUCTIBILITY_MAP['other']).toBe(true)
  })

  it('tax is NOT deductible', () => {
    expect(DEDUCTIBILITY_MAP['tax']).toBe(false)
  })

  it('principal is NOT deductible (balance-sheet movement)', () => {
    expect(DEDUCTIBILITY_MAP['principal']).toBe(false)
  })

  it('dividend is NOT deductible (after-tax distribution)', () => {
    expect(DEDUCTIBILITY_MAP['dividend']).toBe(false)
  })

  it('partner_loan is NOT deductible (@deprecated category)', () => {
    expect(DEDUCTIBILITY_MAP['partner_loan']).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// periodForMonth() — additional year/month parsing
// ─────────────────────────────────────────────────────────────────────────────

describe('periodForMonth() — additional parsing scenarios', () => {
  it('March 2025 → starts on 01 and ends on 31', () => {
    const p = periodForMonth('2025-03')
    expect(p.from).toBe('2025-03-01')
    expect(p.to).toBe('2025-03-31')
  })

  it('April 2025 → ends on 30 (30-day month)', () => {
    const p = periodForMonth('2025-04')
    expect(p.to).toBe('2025-04-30')
  })

  it('November 2024 → ends on 30', () => {
    const p = periodForMonth('2024-11')
    expect(p.to).toBe('2024-11-30')
  })

  it('September 2025 → ends on 30', () => {
    const p = periodForMonth('2025-09')
    expect(p.to).toBe('2025-09-30')
  })

  it('from is always first day of the month', () => {
    for (const ym of ['2024-01', '2024-06', '2025-12']) {
      expect(periodForMonth(ym).from).toBe(`${ym}-01`)
    }
  })

  it('throws for invalid format', () => {
    expect(() => periodForMonth('2025/01')).toThrow()
    expect(() => periodForMonth('202501')).toThrow()
  })
})
