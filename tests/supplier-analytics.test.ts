/**
 * Tests for lib/services/commercial/supplier-analytics.service.ts
 *
 * Tests cover only pure functions — no DB calls.
 * Run with: npx vitest run tests/supplier-analytics.test.ts
 */
import { describe, test, expect } from 'vitest'
import {
  computeAPAging,
  buildSupplierProfile,
  computeHHI,
  type SupplierProfile,
} from '../lib/services/commercial/supplier-analytics.service'

// ── Helpers ───────────────────────────────────────────────────────────────────

interface MockExpenseRow {
  supplier_name?: string | null
  amount_try?: number | null
  expense_type?: string | null
  expense_date?: string | null
  payment_status?: string | null
  paid_at?: string | null
  updated_at?: string | null
}

function makeExpense(overrides: Partial<MockExpenseRow> = {}): MockExpenseRow {
  return {
    supplier_name:  'Test Tedarikçi',
    amount_try:     1000,
    expense_type:   'general',
    expense_date:   '2026-04-01',
    payment_status: 'pending',
    paid_at:        null,
    updated_at:     null,
    ...overrides,
  }
}

// ── computeAPAging ────────────────────────────────────────────────────────────

describe('computeAPAging', () => {
  test('returns 4 buckets always', () => {
    const buckets = computeAPAging([], '2026-05-27')
    expect(buckets).toHaveLength(4)
    const keys = buckets.map(b => b.bucket)
    expect(keys).toContain('current')
    expect(keys).toContain('overdue_30')
    expect(keys).toContain('overdue_60')
    expect(keys).toContain('overdue_90_plus')
  })

  test('ignores paid expenses', () => {
    const expenses = [makeExpense({ payment_status: 'paid', expense_date: '2026-05-01' })]
    const buckets = computeAPAging(expenses, '2026-05-27')
    const total = buckets.reduce((s, b) => s + b.total_try, 0)
    expect(total).toBe(0)
  })

  test('buckets current (≤30 days) correctly', () => {
    const today = '2026-05-27'
    // 10 days old — should be current
    const expenses = [makeExpense({ expense_date: '2026-05-17', amount_try: 500, payment_status: 'pending' })]
    const buckets = computeAPAging(expenses, today)
    const current = buckets.find(b => b.bucket === 'current')!
    expect(current.count).toBe(1)
    expect(current.total_try).toBe(500)
  })

  test('buckets overdue_30 (31-60 days) correctly', () => {
    const today = '2026-05-27'
    // 45 days old
    const expenses = [makeExpense({ expense_date: '2026-04-12', amount_try: 750, payment_status: 'pending' })]
    const buckets = computeAPAging(expenses, today)
    const bucket = buckets.find(b => b.bucket === 'overdue_30')!
    expect(bucket.count).toBe(1)
    expect(bucket.total_try).toBe(750)
  })

  test('buckets overdue_90_plus (>90 days) correctly', () => {
    const today = '2026-05-27'
    // 120 days old
    const expenses = [makeExpense({ expense_date: '2026-01-27', amount_try: 2000, payment_status: 'partial' })]
    const buckets = computeAPAging(expenses, today)
    const bucket = buckets.find(b => b.bucket === 'overdue_90_plus')!
    expect(bucket.count).toBe(1)
    expect(bucket.total_try).toBe(2000)
  })

  test('multiple expenses spread across buckets', () => {
    const today = '2026-05-27'
    const expenses = [
      makeExpense({ expense_date: '2026-05-20', amount_try: 100, payment_status: 'pending' }), // 7d = current
      makeExpense({ expense_date: '2026-04-15', amount_try: 200, payment_status: 'pending' }), // 42d = overdue_30
      makeExpense({ expense_date: '2026-03-10', amount_try: 300, payment_status: 'pending' }), // 78d = overdue_60
      makeExpense({ expense_date: '2026-01-01', amount_try: 400, payment_status: 'partial' }), // 146d = overdue_90_plus
    ]
    const buckets = computeAPAging(expenses, today)
    const totalAcrossBuckets = buckets.reduce((s, b) => s + b.total_try, 0)
    expect(totalAcrossBuckets).toBe(1000)
    expect(buckets.find(b => b.bucket === 'current')!.total_try).toBe(100)
    expect(buckets.find(b => b.bucket === 'overdue_30')!.total_try).toBe(200)
    expect(buckets.find(b => b.bucket === 'overdue_60')!.total_try).toBe(300)
    expect(buckets.find(b => b.bucket === 'overdue_90_plus')!.total_try).toBe(400)
  })
})

// ── buildSupplierProfile ──────────────────────────────────────────────────────

describe('buildSupplierProfile', () => {
  test('returns correct supplier_name', () => {
    const profile = buildSupplierProfile('Acme AŞ', [], '2026-05-27')
    expect(profile.supplier_name).toBe('Acme AŞ')
  })

  test('zero counts for empty expense list', () => {
    const profile = buildSupplierProfile('Boş', [], '2026-05-27')
    expect(profile.expense_count).toBe(0)
    expect(profile.total_expenses_try).toBe(0)
    expect(profile.unpaid_try).toBe(0)
    expect(profile.overdue_try).toBe(0)
    expect(profile.avg_days_to_pay).toBeNull()
  })

  test('payment_rate is 100 when all paid', () => {
    const expenses = [
      makeExpense({ payment_status: 'paid', paid_at: '2026-04-10' }),
      makeExpense({ payment_status: 'paid', paid_at: '2026-04-15' }),
    ]
    const profile = buildSupplierProfile('Ödemiş AŞ', expenses, '2026-05-27')
    expect(profile.payment_rate).toBe(100)
    expect(profile.unpaid_try).toBe(0)
  })

  test('avg_days_to_pay computed from paid expenses', () => {
    const today = '2026-05-27'
    const expenses = [
      makeExpense({ payment_status: 'paid', expense_date: '2026-04-01', paid_at: '2026-04-11', amount_try: 500 }), // 10 days
      makeExpense({ payment_status: 'paid', expense_date: '2026-04-01', paid_at: '2026-04-21', amount_try: 500 }), // 20 days
    ]
    const profile = buildSupplierProfile('Tedarikçi', expenses, today)
    expect(profile.avg_days_to_pay).toBe(15)  // (10 + 20) / 2
  })

  test('risk_tier critical when overdue_try > 0 (>60 days unpaid)', () => {
    const today = '2026-05-27'
    const expenses = [
      // 120 days ago and still unpaid → overdue
      makeExpense({ expense_date: '2026-01-27', payment_status: 'pending', amount_try: 5000 }),
    ]
    const profile = buildSupplierProfile('Kritik AŞ', expenses, today)
    expect(profile.risk_tier).toBe('critical')
    expect(profile.overdue_try).toBe(5000)
  })

  test('risk_tier high when unpaid exists and payment_rate < 70', () => {
    const today = '2026-05-27'
    // 1 paid, 3 pending (recent, not overdue) → payment_rate = 25%
    const expenses = [
      makeExpense({ payment_status: 'paid',    expense_date: '2026-05-01', paid_at: '2026-05-05', amount_try: 1000 }),
      makeExpense({ payment_status: 'pending', expense_date: '2026-05-10', amount_try: 1000 }),
      makeExpense({ payment_status: 'pending', expense_date: '2026-05-15', amount_try: 1000 }),
      makeExpense({ payment_status: 'pending', expense_date: '2026-05-20', amount_try: 1000 }),
    ]
    const profile = buildSupplierProfile('Yüksek Risk AŞ', expenses, today)
    expect(profile.payment_rate).toBe(25)
    expect(profile.risk_tier).toBe('high')
  })

  test('risk_tier low when all paid promptly', () => {
    const today = '2026-05-27'
    const expenses = [
      makeExpense({ payment_status: 'paid', expense_date: '2026-05-01', paid_at: '2026-05-05', amount_try: 1000 }),
      makeExpense({ payment_status: 'paid', expense_date: '2026-05-10', paid_at: '2026-05-12', amount_try: 1000 }),
    ]
    const profile = buildSupplierProfile('Düşük Risk AŞ', expenses, today)
    expect(profile.risk_tier).toBe('low')
    expect(profile.payment_rate).toBe(100)
  })

  test('expense_types collects unique types', () => {
    const expenses = [
      makeExpense({ expense_type: 'rent' }),
      makeExpense({ expense_type: 'salary' }),
      makeExpense({ expense_type: 'rent' }),  // duplicate
    ]
    const profile = buildSupplierProfile('Test', expenses, '2026-05-27')
    expect(profile.expense_types).toHaveLength(2)
    expect(profile.expense_types).toContain('rent')
    expect(profile.expense_types).toContain('salary')
  })

  test('last_expense_date is the most recent expense_date', () => {
    const expenses = [
      makeExpense({ expense_date: '2026-03-01' }),
      makeExpense({ expense_date: '2026-05-15' }),
      makeExpense({ expense_date: '2026-04-10' }),
    ]
    const profile = buildSupplierProfile('Test', expenses, '2026-05-27')
    expect(profile.last_expense_date).toBe('2026-05-15')
  })
})

// ── computeHHI ────────────────────────────────────────────────────────────────

describe('computeHHI', () => {
  test('returns 0 for empty supplier list', () => {
    expect(computeHHI([])).toBe(0)
  })

  test('returns 1 for single supplier (monopoly)', () => {
    const suppliers: SupplierProfile[] = [
      {
        supplier_name: 'Tek Tedarikçi', total_expenses_try: 10000,
        expense_count: 5, unpaid_try: 0, overdue_try: 0,
        avg_days_to_pay: 10, last_expense_date: '2026-05-01',
        expense_types: ['general'], payment_rate: 100, risk_tier: 'low',
      },
    ]
    expect(computeHHI(suppliers)).toBe(1)
  })

  test('returns low HHI for equally distributed suppliers', () => {
    // 5 suppliers with equal 20% share → HHI = 5 × 0.04 = 0.2 (moderate)
    const suppliers: SupplierProfile[] = Array.from({ length: 5 }, (_, i) => ({
      supplier_name: `Tedarikçi ${i}`, total_expenses_try: 2000,
      expense_count: 1, unpaid_try: 0, overdue_try: 0,
      avg_days_to_pay: null, last_expense_date: null,
      expense_types: [], payment_rate: 100, risk_tier: 'low' as const,
    }))
    const hhi = computeHHI(suppliers)
    expect(hhi).toBeCloseTo(0.2, 5)
  })

  test('returns 0 when all suppliers have zero spend', () => {
    const suppliers: SupplierProfile[] = [
      {
        supplier_name: 'Sıfır', total_expenses_try: 0,
        expense_count: 0, unpaid_try: 0, overdue_try: 0,
        avg_days_to_pay: null, last_expense_date: null,
        expense_types: [], payment_rate: 0, risk_tier: 'low',
      },
    ]
    expect(computeHHI(suppliers)).toBe(0)
  })
})
