/**
 * Tests for the pure markOverdue() helper in lib/jobs/overdue-update.job.ts
 *
 * All tests are pure / in-memory — no DB connections required.
 */
import { describe, it, expect } from 'vitest'
import { markOverdue, Sale } from '../lib/jobs/overdue-update.job'

const AS_OF = '2026-05-26'

// ── Test data helpers ─────────────────────────────────────────────────────────

function sale(overrides: Partial<Sale> & { id: string }): Sale {
  return {
    due_date:       '2026-05-20',
    payment_status: 'unpaid',
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('markOverdue — all qualifying sales returned', () => {
  it('returns IDs for all sales with due_date < asOf and eligible status', () => {
    const sales: Sale[] = [
      sale({ id: 'a1', due_date: '2026-05-25', payment_status: 'unpaid' }),
      sale({ id: 'a2', due_date: '2026-05-20', payment_status: 'partial' }),
      sale({ id: 'a3', due_date: '2026-01-01', payment_status: 'unpaid' }),
    ]

    const ids = markOverdue(sales, AS_OF)

    expect(ids).toHaveLength(3)
    expect(ids).toContain('a1')
    expect(ids).toContain('a2')
    expect(ids).toContain('a3')
  })
})

describe('markOverdue — due_date = asOf is NOT overdue', () => {
  it('excludes sales whose due_date equals asOf (not yet overdue)', () => {
    const sales: Sale[] = [
      sale({ id: 'same-day', due_date: AS_OF, payment_status: 'unpaid' }),
      sale({ id: 'past',     due_date: '2026-05-25', payment_status: 'unpaid' }),
    ]

    const ids = markOverdue(sales, AS_OF)

    expect(ids).not.toContain('same-day')
    expect(ids).toContain('past')
  })
})

describe('markOverdue — paid sales excluded', () => {
  it('excludes sales with payment_status = "paid" even if overdue by date', () => {
    const sales: Sale[] = [
      sale({ id: 'paid',    due_date: '2026-05-10', payment_status: 'paid' }),
      sale({ id: 'overdue', due_date: '2026-05-10', payment_status: 'unpaid' }),
      sale({ id: 'already-overdue', due_date: '2026-05-10', payment_status: 'overdue' }),
    ]

    const ids = markOverdue(sales, AS_OF)

    expect(ids).not.toContain('paid')
    expect(ids).not.toContain('already-overdue')
    expect(ids).toContain('overdue')
  })
})

describe('markOverdue — empty input', () => {
  it('returns empty array for empty input', () => {
    const ids = markOverdue([], AS_OF)
    expect(ids).toEqual([])
  })
})
