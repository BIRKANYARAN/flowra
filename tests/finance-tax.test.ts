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
