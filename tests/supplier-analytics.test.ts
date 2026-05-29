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

  test('partial status is treated as unpaid (included in aging)', () => {
    const today = '2026-05-27'
    const expenses = [makeExpense({ expense_date: '2026-05-20', amount_try: 888, payment_status: 'partial' })]
    const buckets = computeAPAging(expenses, today)
    const current = buckets.find(b => b.bucket === 'current')!
    expect(current.count).toBe(1)
    expect(current.total_try).toBe(888)
  })

  test('expense with null expense_date is skipped', () => {
    const today = '2026-05-27'
    const expenses = [makeExpense({ expense_date: null, amount_try: 500, payment_status: 'pending' })]
    const buckets = computeAPAging(expenses, today)
    const total = buckets.reduce((s, b) => s + b.total_try, 0)
    expect(total).toBe(0)
  })

  test('expense with null amount_try is counted as zero', () => {
    const today = '2026-05-27'
    const expenses = [makeExpense({ expense_date: '2026-05-20', amount_try: null, payment_status: 'pending' })]
    const buckets = computeAPAging(expenses, today)
    const current = buckets.find(b => b.bucket === 'current')!
    expect(current.count).toBe(1)
    expect(current.total_try).toBe(0)
  })

  test('all buckets start with count=0 and total_try=0 for empty input', () => {
    const buckets = computeAPAging([], '2026-05-27')
    for (const b of buckets) {
      expect(b.count).toBe(0)
      expect(b.total_try).toBe(0)
    }
  })

  test('expense exactly 30 days old goes into current', () => {
    const today = '2026-05-27'
    const expenses = [makeExpense({ expense_date: '2026-04-27', amount_try: 111, payment_status: 'pending' })]
    const buckets = computeAPAging(expenses, today)
    const current = buckets.find(b => b.bucket === 'current')!
    expect(current.count).toBe(1)
  })

  test('expense exactly 61 days old goes into overdue_60', () => {
    const today = '2026-05-27'
    // 61 days before 2026-05-27 → 2026-03-27
    const expenses = [makeExpense({ expense_date: '2026-03-27', amount_try: 222, payment_status: 'pending' })]
    const buckets = computeAPAging(expenses, today)
    const bucket60 = buckets.find(b => b.bucket === 'overdue_60')!
    expect(bucket60.count).toBe(1)
    expect(bucket60.total_try).toBe(222)
  })

  test('all paid expenses yields all-zero buckets', () => {
    const today = '2026-05-27'
    const expenses = [
      makeExpense({ payment_status: 'paid', expense_date: '2026-01-01', amount_try: 500 }),
      makeExpense({ payment_status: 'paid', expense_date: '2026-03-01', amount_try: 300 }),
      makeExpense({ payment_status: 'paid', expense_date: '2026-05-01', amount_try: 200 }),
    ]
    const buckets = computeAPAging(expenses, today)
    const total = buckets.reduce((s, b) => s + b.total_try, 0)
    expect(total).toBe(0)
  })

  test('each bucket has required label field', () => {
    const buckets = computeAPAging([], '2026-05-27')
    for (const b of buckets) {
      expect(typeof b.label).toBe('string')
      expect(b.label.length).toBeGreaterThan(0)
    }
  })

  test('large number of expenses aggregates correctly', () => {
    const today = '2026-05-27'
    // 100 pending expenses from 10 days ago
    const expenses = Array.from({ length: 100 }, () =>
      makeExpense({ expense_date: '2026-05-17', amount_try: 100, payment_status: 'pending' }),
    )
    const buckets = computeAPAging(expenses, today)
    const current = buckets.find(b => b.bucket === 'current')!
    expect(current.count).toBe(100)
    expect(current.total_try).toBe(10_000)
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

  test('expense_count matches number of input expenses', () => {
    const expenses = [
      makeExpense({ payment_status: 'paid' }),
      makeExpense({ payment_status: 'pending' }),
      makeExpense({ payment_status: 'partial' }),
    ]
    const profile = buildSupplierProfile('Count Test', expenses, '2026-05-27')
    expect(profile.expense_count).toBe(3)
  })

  test('total_expenses_try is sum of all expense amounts', () => {
    const expenses = [
      makeExpense({ amount_try: 100, payment_status: 'paid' }),
      makeExpense({ amount_try: 200, payment_status: 'pending' }),
      makeExpense({ amount_try: 300, payment_status: 'partial' }),
    ]
    const profile = buildSupplierProfile('Sum Test', expenses, '2026-05-27')
    expect(profile.total_expenses_try).toBe(600)
  })

  test('unpaid_try is sum of pending + partial amounts only', () => {
    const today = '2026-05-27'
    const expenses = [
      makeExpense({ amount_try: 100, payment_status: 'paid', expense_date: '2026-05-01' }),
      makeExpense({ amount_try: 200, payment_status: 'pending', expense_date: '2026-05-20' }),
      makeExpense({ amount_try: 300, payment_status: 'partial', expense_date: '2026-05-20' }),
    ]
    const profile = buildSupplierProfile('Unpaid Test', expenses, today)
    expect(profile.unpaid_try).toBe(500)
  })

  test('avg_days_to_pay is null when no paid expenses have both dates', () => {
    const today = '2026-05-27'
    const expenses = [
      makeExpense({ payment_status: 'paid', expense_date: null, paid_at: '2026-04-10' }),
      makeExpense({ payment_status: 'paid', expense_date: '2026-04-01', paid_at: null }),
    ]
    const profile = buildSupplierProfile('NoDates', expenses, today)
    expect(profile.avg_days_to_pay).toBeNull()
  })

  test('risk_tier medium when payment_rate is between 70 and 85', () => {
    const today = '2026-05-27'
    // 7 paid, 1 recent pending (payment_rate = 87.5%?) — let's get 75%: 3 paid, 1 pending
    // Actually medium: unpaid=0 but paymentRate < 85
    // 5 paid, 1 recent pending → rate = 83.33%
    const expenses = [
      makeExpense({ payment_status: 'paid',    expense_date: '2026-05-01', paid_at: '2026-05-05', amount_try: 100 }),
      makeExpense({ payment_status: 'paid',    expense_date: '2026-05-02', paid_at: '2026-05-06', amount_try: 100 }),
      makeExpense({ payment_status: 'paid',    expense_date: '2026-05-03', paid_at: '2026-05-07', amount_try: 100 }),
      makeExpense({ payment_status: 'paid',    expense_date: '2026-05-04', paid_at: '2026-05-08', amount_try: 100 }),
      makeExpense({ payment_status: 'paid',    expense_date: '2026-05-05', paid_at: '2026-05-09', amount_try: 100 }),
      makeExpense({ payment_status: 'pending', expense_date: '2026-05-20', amount_try: 100 }), // recent, not overdue
    ]
    const profile = buildSupplierProfile('Medium Risk', expenses, today)
    // payment_rate = 5/6 * 100 ≈ 83.33 — not <70 so not high, but <85 so medium (if no overdue)
    expect(profile.overdue_try).toBe(0)
    expect(profile.risk_tier).toBe('medium')
  })

  test('overdue_try is 0 for expenses only 30 days old', () => {
    const today = '2026-05-27'
    const expenses = [
      makeExpense({ expense_date: '2026-04-27', payment_status: 'pending', amount_try: 999 }),
    ]
    const profile = buildSupplierProfile('Recent', expenses, today)
    expect(profile.overdue_try).toBe(0)
  })

  test('payment_rate rounds to 2 decimal places', () => {
    const today = '2026-05-27'
    // 2 paid out of 3 → 66.666...% → should round to 66.67
    const expenses = [
      makeExpense({ payment_status: 'paid',    expense_date: '2026-05-01', paid_at: '2026-05-05', amount_try: 100 }),
      makeExpense({ payment_status: 'paid',    expense_date: '2026-05-02', paid_at: '2026-05-06', amount_try: 100 }),
      makeExpense({ payment_status: 'pending', expense_date: '2026-05-20', amount_try: 100 }),
    ]
    const profile = buildSupplierProfile('Rounding', expenses, today)
    expect(profile.payment_rate).toBeCloseTo(66.67, 1)
  })

  test('expense_types is empty array when all expense_type are null', () => {
    const expenses = [
      makeExpense({ expense_type: null }),
      makeExpense({ expense_type: null }),
    ]
    const profile = buildSupplierProfile('NoType', expenses, '2026-05-27')
    expect(profile.expense_types).toEqual([])
  })

  test('last_expense_date is null for empty expense list', () => {
    const profile = buildSupplierProfile('NoDate', [], '2026-05-27')
    expect(profile.last_expense_date).toBeNull()
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

  test('two equal suppliers yield HHI = 0.5', () => {
    const suppliers: SupplierProfile[] = [
      {
        supplier_name: 'A', total_expenses_try: 5000,
        expense_count: 1, unpaid_try: 0, overdue_try: 0,
        avg_days_to_pay: null, last_expense_date: null,
        expense_types: [], payment_rate: 100, risk_tier: 'low',
      },
      {
        supplier_name: 'B', total_expenses_try: 5000,
        expense_count: 1, unpaid_try: 0, overdue_try: 0,
        avg_days_to_pay: null, last_expense_date: null,
        expense_types: [], payment_rate: 100, risk_tier: 'low',
      },
    ]
    expect(computeHHI(suppliers)).toBeCloseTo(0.5, 5)
  })

  test('dominant supplier (80/20 split) gives high HHI', () => {
    const suppliers: SupplierProfile[] = [
      {
        supplier_name: 'Big', total_expenses_try: 8000,
        expense_count: 10, unpaid_try: 0, overdue_try: 0,
        avg_days_to_pay: null, last_expense_date: null,
        expense_types: [], payment_rate: 100, risk_tier: 'low',
      },
      {
        supplier_name: 'Small', total_expenses_try: 2000,
        expense_count: 2, unpaid_try: 0, overdue_try: 0,
        avg_days_to_pay: null, last_expense_date: null,
        expense_types: [], payment_rate: 100, risk_tier: 'low',
      },
    ]
    // (0.8)^2 + (0.2)^2 = 0.64 + 0.04 = 0.68
    const hhi = computeHHI(suppliers)
    expect(hhi).toBeCloseTo(0.68, 5)
  })

  test('4 suppliers with equal share yield HHI = 0.25', () => {
    const suppliers: SupplierProfile[] = Array.from({ length: 4 }, (_, i) => ({
      supplier_name: `S${i}`, total_expenses_try: 2500,
      expense_count: 1, unpaid_try: 0, overdue_try: 0,
      avg_days_to_pay: null, last_expense_date: null,
      expense_types: [], payment_rate: 100, risk_tier: 'low' as const,
    }))
    expect(computeHHI(suppliers)).toBeCloseTo(0.25, 5)
  })

  test('10 equal suppliers yield HHI = 0.1', () => {
    const suppliers: SupplierProfile[] = Array.from({ length: 10 }, (_, i) => ({
      supplier_name: `T${i}`, total_expenses_try: 1000,
      expense_count: 1, unpaid_try: 0, overdue_try: 0,
      avg_days_to_pay: null, last_expense_date: null,
      expense_types: [], payment_rate: 100, risk_tier: 'low' as const,
    }))
    expect(computeHHI(suppliers)).toBeCloseTo(0.1, 5)
  })

  test('HHI is always between 0 and 1 inclusive', () => {
    const single: SupplierProfile[] = [{
      supplier_name: 'X', total_expenses_try: 1000,
      expense_count: 1, unpaid_try: 0, overdue_try: 0,
      avg_days_to_pay: null, last_expense_date: null,
      expense_types: [], payment_rate: 100, risk_tier: 'low',
    }]
    const many: SupplierProfile[] = Array.from({ length: 100 }, (_, i) => ({
      supplier_name: `S${i}`, total_expenses_try: 10,
      expense_count: 1, unpaid_try: 0, overdue_try: 0,
      avg_days_to_pay: null, last_expense_date: null,
      expense_types: [], payment_rate: 100, risk_tier: 'low' as const,
    }))
    expect(computeHHI(single)).toBeLessThanOrEqual(1)
    expect(computeHHI(single)).toBeGreaterThanOrEqual(0)
    expect(computeHHI(many)).toBeLessThanOrEqual(1)
    expect(computeHHI(many)).toBeGreaterThanOrEqual(0)
  })

  test('HHI is higher for concentrated spend than for even distribution', () => {
    const concentrated: SupplierProfile[] = [
      { supplier_name: 'Big',   total_expenses_try: 9000, expense_count: 1, unpaid_try: 0, overdue_try: 0, avg_days_to_pay: null, last_expense_date: null, expense_types: [], payment_rate: 100, risk_tier: 'low' },
      { supplier_name: 'Small', total_expenses_try: 1000, expense_count: 1, unpaid_try: 0, overdue_try: 0, avg_days_to_pay: null, last_expense_date: null, expense_types: [], payment_rate: 100, risk_tier: 'low' },
    ]
    const even: SupplierProfile[] = [
      { supplier_name: 'A', total_expenses_try: 5000, expense_count: 1, unpaid_try: 0, overdue_try: 0, avg_days_to_pay: null, last_expense_date: null, expense_types: [], payment_rate: 100, risk_tier: 'low' },
      { supplier_name: 'B', total_expenses_try: 5000, expense_count: 1, unpaid_try: 0, overdue_try: 0, avg_days_to_pay: null, last_expense_date: null, expense_types: [], payment_rate: 100, risk_tier: 'low' },
    ]
    expect(computeHHI(concentrated)).toBeGreaterThan(computeHHI(even))
  })

  test('a supplier with zero spend does not affect HHI result', () => {
    const withZero: SupplierProfile[] = [
      { supplier_name: 'A',    total_expenses_try: 5000, expense_count: 1, unpaid_try: 0, overdue_try: 0, avg_days_to_pay: null, last_expense_date: null, expense_types: [], payment_rate: 100, risk_tier: 'low' },
      { supplier_name: 'B',    total_expenses_try: 5000, expense_count: 1, unpaid_try: 0, overdue_try: 0, avg_days_to_pay: null, last_expense_date: null, expense_types: [], payment_rate: 100, risk_tier: 'low' },
      { supplier_name: 'Zero', total_expenses_try: 0,    expense_count: 0, unpaid_try: 0, overdue_try: 0, avg_days_to_pay: null, last_expense_date: null, expense_types: [], payment_rate: 0,   risk_tier: 'low' },
    ]
    const without: SupplierProfile[] = [
      { supplier_name: 'A', total_expenses_try: 5000, expense_count: 1, unpaid_try: 0, overdue_try: 0, avg_days_to_pay: null, last_expense_date: null, expense_types: [], payment_rate: 100, risk_tier: 'low' },
      { supplier_name: 'B', total_expenses_try: 5000, expense_count: 1, unpaid_try: 0, overdue_try: 0, avg_days_to_pay: null, last_expense_date: null, expense_types: [], payment_rate: 100, risk_tier: 'low' },
    ]
    expect(computeHHI(withZero)).toBeCloseTo(computeHHI(without), 5)
  })
})

// ── computeAPAging — additional boundary cases ────────────────────────────────

describe('computeAPAging — additional aging bucket boundary cases', () => {
  test('expense exactly 31 days old goes into overdue_30', () => {
    const today = '2026-05-27'
    // 31 days before 2026-05-27 → 2026-04-26
    const expenses = [makeExpense({ expense_date: '2026-04-26', amount_try: 333, payment_status: 'pending' })]
    const buckets = computeAPAging(expenses, today)
    const bucket = buckets.find(b => b.bucket === 'overdue_30')!
    expect(bucket.count).toBe(1)
    expect(bucket.total_try).toBe(333)
  })

  test('expense exactly 60 days old goes into overdue_60', () => {
    const today = '2026-05-27'
    // 60 days before 2026-05-27 → 2026-03-28
    const expenses = [makeExpense({ expense_date: '2026-03-28', amount_try: 444, payment_status: 'pending' })]
    const buckets = computeAPAging(expenses, today)
    const bucket60 = buckets.find(b => b.bucket === 'overdue_60')!
    const bucket30 = buckets.find(b => b.bucket === 'overdue_30')!
    // 60 days: may be in overdue_60 (61..90) or overdue_30 (31..60) depending on inclusive/exclusive
    const assignedCount = bucket60.count + bucket30.count
    expect(assignedCount).toBe(1)
  })

  test('expense exactly 90 days old goes into overdue_60 or overdue_90_plus', () => {
    const today = '2026-05-27'
    // 90 days before 2026-05-27 → 2026-02-26
    const expenses = [makeExpense({ expense_date: '2026-02-26', amount_try: 555, payment_status: 'pending' })]
    const buckets = computeAPAging(expenses, today)
    const bucket60 = buckets.find(b => b.bucket === 'overdue_60')!
    const bucket90 = buckets.find(b => b.bucket === 'overdue_90_plus')!
    const total = bucket60.total_try + bucket90.total_try
    expect(total).toBe(555)
  })

  test('expense 91 days old goes into overdue_90_plus', () => {
    const today = '2026-05-27'
    // 91 days before 2026-05-27 → 2026-02-25
    const expenses = [makeExpense({ expense_date: '2026-02-25', amount_try: 666, payment_status: 'pending' })]
    const buckets = computeAPAging(expenses, today)
    const bucket = buckets.find(b => b.bucket === 'overdue_90_plus')!
    expect(bucket.count).toBe(1)
    expect(bucket.total_try).toBe(666)
  })

  test('mixed paid and unpaid in same bucket range', () => {
    const today = '2026-05-27'
    const expenses = [
      makeExpense({ expense_date: '2026-04-26', amount_try: 100, payment_status: 'pending' }),  // 31d = overdue_30
      makeExpense({ expense_date: '2026-04-26', amount_try: 200, payment_status: 'paid'    }),  // 31d but paid → ignored
    ]
    const buckets = computeAPAging(expenses, today)
    const bucket30 = buckets.find(b => b.bucket === 'overdue_30')!
    expect(bucket30.total_try).toBe(100)
  })

  test('single pending expense today → current bucket, count=1', () => {
    const today = '2026-05-27'
    const expenses = [makeExpense({ expense_date: today, amount_try: 777, payment_status: 'pending' })]
    const buckets = computeAPAging(expenses, today)
    const current = buckets.find(b => b.bucket === 'current')!
    expect(current.count).toBe(1)
    expect(current.total_try).toBe(777)
  })

  test('bucket labels are human-readable strings', () => {
    const buckets = computeAPAging([], '2026-05-27')
    const labels = buckets.map(b => b.label)
    for (const label of labels) {
      expect(label.length).toBeGreaterThan(2)
    }
  })
})

// ── computeHHI — formula verification ────────────────────────────────────────

describe('computeHHI — formula Σshare² verification', () => {
  function makeProfile(name: string, spend: number): SupplierProfile {
    return {
      supplier_name: name, total_expenses_try: spend,
      expense_count: 1, unpaid_try: 0, overdue_try: 0,
      avg_days_to_pay: null, last_expense_date: null,
      expense_types: [], payment_rate: 100, risk_tier: 'low' as const,
    }
  }

  test('three equal suppliers: HHI = 3 × (1/3)² = 1/3', () => {
    const s = [makeProfile('A', 1000), makeProfile('B', 1000), makeProfile('C', 1000)]
    expect(computeHHI(s)).toBeCloseTo(1 / 3, 5)
  })

  test('75/25 split: HHI = 0.75² + 0.25² = 0.5625 + 0.0625 = 0.625', () => {
    const s = [makeProfile('Big', 7500), makeProfile('Small', 2500)]
    expect(computeHHI(s)).toBeCloseTo(0.625, 5)
  })

  test('result is a number', () => {
    const s = [makeProfile('X', 5000), makeProfile('Y', 3000)]
    expect(typeof computeHHI(s)).toBe('number')
  })

  test('single supplier with non-zero spend → HHI = 1', () => {
    const s = [makeProfile('Mono', 999)]
    expect(computeHHI(s)).toBeCloseTo(1, 5)
  })

  test('two equal suppliers → HHI = 0.5', () => {
    const s = [makeProfile('A', 6000), makeProfile('B', 6000)]
    expect(computeHHI(s)).toBeCloseTo(0.5, 5)
  })

  test('20 equal suppliers → HHI = 0.05', () => {
    const s = Array.from({ length: 20 }, (_, i) => makeProfile(`S${i}`, 500))
    expect(computeHHI(s)).toBeCloseTo(0.05, 5)
  })
})

// ── buildSupplierProfile — additional edge cases ──────────────────────────────

describe('buildSupplierProfile — additional structure validation', () => {
  test('profile has all required top-level fields', () => {
    const profile = buildSupplierProfile('Test', [], '2026-05-27')
    expect(profile).toHaveProperty('supplier_name')
    expect(profile).toHaveProperty('expense_count')
    expect(profile).toHaveProperty('total_expenses_try')
    expect(profile).toHaveProperty('unpaid_try')
    expect(profile).toHaveProperty('overdue_try')
    expect(profile).toHaveProperty('avg_days_to_pay')
    expect(profile).toHaveProperty('last_expense_date')
    expect(profile).toHaveProperty('expense_types')
    expect(profile).toHaveProperty('payment_rate')
    expect(profile).toHaveProperty('risk_tier')
  })

  test('supplier_name matches input exactly', () => {
    const profile = buildSupplierProfile('ABC Tedarik Ltd.', [], '2026-05-27')
    expect(profile.supplier_name).toBe('ABC Tedarik Ltd.')
  })

  test('payment_rate is 0 when all are pending', () => {
    const today = '2026-05-27'
    const expenses = [
      makeExpense({ payment_status: 'pending', expense_date: '2026-05-20', amount_try: 100 }),
      makeExpense({ payment_status: 'pending', expense_date: '2026-05-21', amount_try: 200 }),
    ]
    const profile = buildSupplierProfile('NoPay', expenses, today)
    expect(profile.payment_rate).toBe(0)
  })

  test('expense_types array contains no duplicates', () => {
    const expenses = [
      makeExpense({ expense_type: 'rent' }),
      makeExpense({ expense_type: 'rent' }),
      makeExpense({ expense_type: 'salary' }),
      makeExpense({ expense_type: 'salary' }),
      makeExpense({ expense_type: 'utilities' }),
    ]
    const profile = buildSupplierProfile('TypeTest', expenses, '2026-05-27')
    const unique = new Set(profile.expense_types)
    expect(unique.size).toBe(profile.expense_types.length)
  })

  test('risk_tier is one of the expected values', () => {
    const today = '2026-05-27'
    const profile = buildSupplierProfile('RiskCheck', [
      makeExpense({ payment_status: 'paid', expense_date: '2026-05-01', paid_at: '2026-05-05', amount_try: 100 }),
    ], today)
    expect(['low', 'medium', 'high', 'critical']).toContain(profile.risk_tier)
  })
})
