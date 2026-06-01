// Node-env tests for computeDeductibleOpExpenses — the corporate-tax matrah base.
// getCfoMetrics previously subtracted ALL operational opex for its matrah,
// understating tax and disagreeing with the formal P&L; this kernel subtracts
// DEDUCTIBLE operational expenses only (TTK — non-deductible KKEG don't shield tax).
import { describe, it, expect } from 'vitest'
import { computeDeductibleOpExpenses } from '@/lib/finance/cfo-metrics'

describe('computeDeductibleOpExpenses (corporate-tax matrah base)', () => {
  it('includes deductible operational expense categories', () => {
    const rows = [
      { amount_try: 1000, expense_type: 'operational', category: 'rent' },
      { amount_try: 500,  expense_type: 'operational', category: 'salary' },
      { amount_try: 200,  expense_type: 'operational', category: 'marketing' },
    ]
    expect(computeDeductibleOpExpenses(rows)).toBe(1700)
  })

  it('EXCLUDES non-deductible (KKEG) categories: tax / principal / dividend / partner_loan', () => {
    const rows = [
      { amount_try: 1000, expense_type: 'operational', category: 'rent' },     // deductible
      { amount_try: 5000, expense_type: 'operational', category: 'tax' },      // non-deductible
      { amount_try: 3000, expense_type: 'operational', category: 'principal' },// non-deductible
      { amount_try: 2000, expense_type: 'operational', category: 'dividend' }, // non-deductible
    ]
    expect(computeDeductibleOpExpenses(rows)).toBe(1000) // only rent
  })

  it('EXCLUDES non-operational financing flows by expense_type', () => {
    const rows = [
      { amount_try: 1000, expense_type: 'operational',      category: 'rent' },
      { amount_try: 9999, expense_type: 'partner_financing', category: 'general' },
      { amount_try: 8888, expense_type: 'loan_repayment',    category: 'general' },
      { amount_try: 7777, expense_type: 'internal_transfer', category: 'general' },
    ]
    expect(computeDeductibleOpExpenses(rows)).toBe(1000)
  })

  it('defaults unknown categories to deductible (matches resolveDeductibility), missing fields → 0', () => {
    expect(computeDeductibleOpExpenses([{ amount_try: 300, expense_type: 'operational', category: 'unknown_cat' }])).toBe(300)
    expect(computeDeductibleOpExpenses([{}])).toBe(0)
    expect(computeDeductibleOpExpenses([])).toBe(0)
  })
})
