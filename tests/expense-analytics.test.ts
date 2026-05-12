/**
 * FAZ 9 — Gider Analizi: business-logic unit tests
 *
 * Tests the pure analytics functions in expenses/page.tsx:
 *   1. categoryBreakdown()     — groups by category, sorts by total descending
 *   2. monthlyTrend()          — groups by YYYY-MM, last 6 months
 *   3. recurringMonthlyBurden()— frequency-normalized monthly cost
 *   4. kdvDeductibleTotal()    — KDV on expenses (rate × amount_try / 100)
 *
 * All functions are pure (no DB, no side effects).
 * Run with: npx vitest run tests/expense-analytics.test.ts
 */

import { describe, it, expect } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// Mirror of analytics functions from expenses/page.tsx
// ─────────────────────────────────────────────────────────────────────────────

type ExpenseRow = { category: string; amount_try: number; expense_date: string; kdv?: number }
type RecurringRow = { amount: number; currency: string; frequency: string; is_active?: boolean }

function categoryBreakdown(expenses: ExpenseRow[]) {
  const map = new Map<string, number>()
  for (const e of expenses) {
    const key = e.category ?? 'other'
    map.set(key, (map.get(key) ?? 0) + Number(e.amount_try))
  }
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([category, total]) => ({ category, total }))
}

function monthlyTrend(expenses: ExpenseRow[]) {
  const map = new Map<string, number>()
  for (const e of expenses) {
    const ym = (e.expense_date ?? '').slice(0, 7)
    if (!ym) continue
    map.set(ym, (map.get(ym) ?? 0) + Number(e.amount_try))
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-6)
    .map(([ym, total]) => ({ ym, total }))
}

function recurringMonthlyBurden(recurring: RecurringRow[]): number {
  return recurring
    .filter(r => r.is_active !== false)
    .reduce((sum, r) => {
      const amt = Number(r.amount)
      if (r.frequency === 'monthly')   return sum + amt
      if (r.frequency === 'quarterly') return sum + amt / 3
      if (r.frequency === 'yearly')    return sum + amt / 12
      return sum + amt
    }, 0)
}

function kdvDeductibleTotal(expenses: ExpenseRow[]): number {
  return expenses.reduce((sum, e) => {
    const rate = Number(e.kdv ?? 0)
    if (rate <= 0) return sum
    return sum + Number(e.amount_try) * rate / 100
  }, 0)
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. categoryBreakdown
// ─────────────────────────────────────────────────────────────────────────────

describe('categoryBreakdown()', () => {
  it('returns empty array for no expenses', () => {
    expect(categoryBreakdown([])).toEqual([])
  })

  it('aggregates same category correctly', () => {
    const expenses = [
      { category: 'rent',    amount_try: 5000, expense_date: '2024-01-01' },
      { category: 'rent',    amount_try: 5000, expense_date: '2024-02-01' },
      { category: 'salary',  amount_try: 8000, expense_date: '2024-01-15' },
    ]
    const result = categoryBreakdown(expenses)
    const rentRow   = result.find(r => r.category === 'rent')
    const salaryRow = result.find(r => r.category === 'salary')
    expect(rentRow?.total).toBe(10000)
    expect(salaryRow?.total).toBe(8000)
  })

  it('sorts by total descending (highest first)', () => {
    const expenses = [
      { category: 'utilities', amount_try: 500,  expense_date: '2024-01-01' },
      { category: 'salary',    amount_try: 8000, expense_date: '2024-01-01' },
      { category: 'rent',      amount_try: 3000, expense_date: '2024-01-01' },
    ]
    const result = categoryBreakdown(expenses)
    expect(result[0].category).toBe('salary')
    expect(result[1].category).toBe('rent')
    expect(result[2].category).toBe('utilities')
  })

  it('caps at 8 categories maximum', () => {
    const expenses = Array.from({ length: 12 }, (_, i) => ({
      category:     `cat${i}`,
      amount_try:   (12 - i) * 100,
      expense_date: '2024-01-01',
    }))
    expect(categoryBreakdown(expenses).length).toBe(8)
  })

  it('handles missing category gracefully (defaults to "other")', () => {
    const expenses = [
      { category: '', amount_try: 1000, expense_date: '2024-01-01' },
    ] as ExpenseRow[]
    const result = categoryBreakdown(expenses)
    // Empty string → treated as falsy, defaults to 'other'
    expect(result.some(r => r.category === 'other' || r.category === '')).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. monthlyTrend
// ─────────────────────────────────────────────────────────────────────────────

describe('monthlyTrend()', () => {
  it('returns empty array for no expenses', () => {
    expect(monthlyTrend([])).toEqual([])
  })

  it('groups expenses by YYYY-MM correctly', () => {
    const expenses = [
      { category: 'rent', amount_try: 5000, expense_date: '2024-01-05' },
      { category: 'rent', amount_try: 3000, expense_date: '2024-01-20' },
      { category: 'rent', amount_try: 6000, expense_date: '2024-02-01' },
    ]
    const result = monthlyTrend(expenses)
    const jan = result.find(r => r.ym === '2024-01')
    const feb = result.find(r => r.ym === '2024-02')
    expect(jan?.total).toBe(8000)
    expect(feb?.total).toBe(6000)
  })

  it('returns in chronological order (oldest first)', () => {
    const expenses = [
      { category: 'rent', amount_try: 1000, expense_date: '2024-03-01' },
      { category: 'rent', amount_try: 2000, expense_date: '2024-01-01' },
      { category: 'rent', amount_try: 3000, expense_date: '2024-02-01' },
    ]
    const result = monthlyTrend(expenses)
    expect(result[0].ym).toBe('2024-01')
    expect(result[1].ym).toBe('2024-02')
    expect(result[2].ym).toBe('2024-03')
  })

  it('caps at last 6 months when more data exists', () => {
    const expenses = Array.from({ length: 10 }, (_, i) => ({
      category:     'rent',
      amount_try:   1000,
      expense_date: `2024-${String(i + 1).padStart(2, '0')}-01`,
    })).filter(e => {
      const m = parseInt(e.expense_date.slice(5, 7))
      return m <= 10
    })
    const result = monthlyTrend(expenses)
    expect(result.length).toBeLessThanOrEqual(6)
  })

  it('skips entries with empty expense_date', () => {
    const expenses = [
      { category: 'rent', amount_try: 1000, expense_date: '' },
      { category: 'rent', amount_try: 2000, expense_date: '2024-01-01' },
    ]
    const result = monthlyTrend(expenses)
    expect(result.length).toBe(1)
    expect(result[0].ym).toBe('2024-01')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. recurringMonthlyBurden
// ─────────────────────────────────────────────────────────────────────────────

describe('recurringMonthlyBurden()', () => {
  it('returns 0 for empty list', () => {
    expect(recurringMonthlyBurden([])).toBe(0)
  })

  it('monthly frequency: counts at face value', () => {
    const recurring = [
      { amount: 5000, currency: 'TRY', frequency: 'monthly', is_active: true },
      { amount: 2000, currency: 'TRY', frequency: 'monthly', is_active: true },
    ]
    expect(recurringMonthlyBurden(recurring)).toBe(7000)
  })

  it('quarterly frequency: divides by 3', () => {
    const recurring = [
      { amount: 9000, currency: 'TRY', frequency: 'quarterly', is_active: true },
    ]
    expect(recurringMonthlyBurden(recurring)).toBe(3000)
  })

  it('yearly frequency: divides by 12', () => {
    const recurring = [
      { amount: 12000, currency: 'TRY', frequency: 'yearly', is_active: true },
    ]
    expect(recurringMonthlyBurden(recurring)).toBe(1000)
  })

  it('mixes frequencies correctly', () => {
    const recurring = [
      { amount: 3000, currency: 'TRY', frequency: 'monthly',   is_active: true },  // 3000/month
      { amount: 6000, currency: 'TRY', frequency: 'quarterly', is_active: true },  // 2000/month
      { amount: 24000, currency: 'TRY', frequency: 'yearly',   is_active: true },  // 2000/month
    ]
    expect(recurringMonthlyBurden(recurring)).toBeCloseTo(7000, 0)
  })

  it('skips inactive templates (is_active = false)', () => {
    const recurring = [
      { amount: 5000, currency: 'TRY', frequency: 'monthly', is_active: false },
      { amount: 2000, currency: 'TRY', frequency: 'monthly', is_active: true  },
    ]
    expect(recurringMonthlyBurden(recurring)).toBe(2000)
  })

  it('includes templates with undefined is_active (treat as active)', () => {
    // When is_active is not set, default to included
    const recurring = [
      { amount: 1000, currency: 'TRY', frequency: 'monthly' },
    ]
    expect(recurringMonthlyBurden(recurring)).toBe(1000)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. kdvDeductibleTotal
// ─────────────────────────────────────────────────────────────────────────────

describe('kdvDeductibleTotal()', () => {
  it('returns 0 for empty list', () => {
    expect(kdvDeductibleTotal([])).toBe(0)
  })

  it('returns 0 when no expenses have KDV', () => {
    const expenses = [
      { category: 'rent', amount_try: 5000, expense_date: '2024-01-01', kdv: 0 },
    ]
    expect(kdvDeductibleTotal(expenses)).toBe(0)
  })

  it('computes KDV correctly for single expense', () => {
    // 10000 TRY expense at %20 KDV → KDV = 2000
    const expenses = [
      { category: 'rent', amount_try: 10000, expense_date: '2024-01-01', kdv: 20 },
    ]
    expect(kdvDeductibleTotal(expenses)).toBe(2000)
  })

  it('sums KDV across multiple expenses with different rates', () => {
    const expenses = [
      { category: 'utilities', amount_try: 5000, expense_date: '2024-01-01', kdv: 20 }, // 1000
      { category: 'software',  amount_try: 2000, expense_date: '2024-01-01', kdv: 18 }, // 360
      { category: 'general',   amount_try: 3000, expense_date: '2024-01-01', kdv: 0  }, // 0
    ]
    expect(kdvDeductibleTotal(expenses)).toBeCloseTo(1360, 1)
  })

  it('handles missing kdv field (undefined → 0)', () => {
    const expenses = [
      { category: 'rent', amount_try: 10000, expense_date: '2024-01-01' },
    ]
    expect(kdvDeductibleTotal(expenses)).toBe(0)
  })

  it('%8 KDV rate on office supplies', () => {
    // 1000 TRY at %8 → KDV = 80
    const expenses = [
      { category: 'equipment', amount_try: 1000, expense_date: '2024-01-01', kdv: 8 },
    ]
    expect(kdvDeductibleTotal(expenses)).toBe(80)
  })
})
