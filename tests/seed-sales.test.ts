import { describe, it, expect } from 'vitest'
import { buildSalesRows, type SeededSaleRow } from '@/app/api/seed/_seed/sales'

// Fixed reference date so date-derived assertions are deterministic.
const NOW = new Date('2026-06-15T10:00:00Z')
const rows: SeededSaleRow[] = buildSalesRows('co-1', 'user-1', NOW)

describe('seed sales — demo dataset', () => {
  it('produces a non-trivial spread of sales', () => {
    expect(rows.length).toBe(16)
    expect(rows.every(r => r.company_id === 'co-1' && r.user_id === 'user-1')).toBe(true)
    expect(rows.every(r => r.currency === 'TRY')).toBe(true)
  })

  it('covers every payment_status so all collection views populate', () => {
    const statuses = new Set(rows.map(r => r.payment_status))
    expect(statuses).toEqual(new Set(['paid', 'pending', 'partial', 'overdue']))
  })

  it('KDV is ~18% of the net (total = net + kdv)', () => {
    for (const r of rows) {
      const net = r.total - r.kdv_amount_try
      // kdv / net ≈ 0.18
      expect(r.kdv_amount_try / net).toBeGreaterThan(0.17)
      expect(r.kdv_amount_try / net).toBeLessThan(0.19)
    }
  })

  it('paid sales are fully collected with a paid_at and no due_date', () => {
    const paid = rows.filter(r => r.payment_status === 'paid')
    expect(paid.length).toBeGreaterThan(0)
    for (const r of paid) {
      expect(r.paid_amount).toBe(r.total)
      expect(r.paid_at).toBeTruthy()
      expect(r.due_date).toBeNull()
    }
  })

  it('partial sales are partly collected; pending are uncollected; both have a due_date', () => {
    const partial = rows.filter(r => r.payment_status === 'partial')
    const pending = rows.filter(r => r.payment_status === 'pending')
    expect(partial.length).toBeGreaterThan(0)
    for (const r of partial) {
      expect(r.paid_amount).toBeGreaterThan(0)
      expect(r.paid_amount).toBeLessThan(r.total)
      expect(r.due_date).toBeTruthy()
    }
    for (const r of pending) {
      expect(r.paid_amount).toBe(0)
      expect(r.due_date).toBeTruthy()
    }
  })

  it('overdue sales have a due_date strictly in the past', () => {
    const overdue = rows.filter(r => r.payment_status === 'overdue')
    expect(overdue.length).toBeGreaterThan(0)
    const today = NOW.toISOString().slice(0, 10)
    for (const r of overdue) {
      expect(r.due_date! < today).toBe(true)
    }
  })

  it('spans at least 5 distinct months for the revenue trend', () => {
    const months = new Set(rows.map(r => r.sale_date.slice(0, 7)))
    expect(months.size).toBeGreaterThanOrEqual(5)
  })

  it('all sale_date / due_date are valid YYYY-MM-DD', () => {
    const re = /^\d{4}-\d{2}-\d{2}$/
    for (const r of rows) {
      expect(re.test(r.sale_date)).toBe(true)
      if (r.due_date !== null) expect(re.test(r.due_date)).toBe(true)
    }
  })
})
