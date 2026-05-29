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

describe('markOverdue — future dates not returned', () => {
  it('sale with due_date > asOf is not returned even if unpaid', () => {
    const sales: Sale[] = [
      sale({ id: 'future-1', due_date: '2026-05-27', payment_status: 'unpaid' }),
    ]
    const ids = markOverdue(sales, AS_OF)
    expect(ids).not.toContain('future-1')
    expect(ids).toHaveLength(0)
  })

  it('sale with due_date far in future is not returned', () => {
    const sales: Sale[] = [
      sale({ id: 'future-far', due_date: '2027-12-31', payment_status: 'unpaid' }),
    ]
    const ids = markOverdue(sales, AS_OF)
    expect(ids).not.toContain('future-far')
  })

  it('only past sales returned when mixed past/future', () => {
    const sales: Sale[] = [
      sale({ id: 'past',   due_date: '2026-05-20', payment_status: 'unpaid' }),
      sale({ id: 'future', due_date: '2026-06-01', payment_status: 'unpaid' }),
    ]
    const ids = markOverdue(sales, AS_OF)
    expect(ids).toContain('past')
    expect(ids).not.toContain('future')
  })

  it('multiple future dates all excluded', () => {
    const sales: Sale[] = [
      sale({ id: 'f1', due_date: '2026-05-27', payment_status: 'unpaid' }),
      sale({ id: 'f2', due_date: '2026-06-15', payment_status: 'unpaid' }),
      sale({ id: 'f3', due_date: '2027-01-01', payment_status: 'partial' }),
    ]
    const ids = markOverdue(sales, AS_OF)
    expect(ids).toHaveLength(0)
  })
})

describe('markOverdue — only overdue-eligible statuses', () => {
  it('unpaid status is eligible (returned)', () => {
    const sales: Sale[] = [sale({ id: 'unpaid-1', due_date: '2026-05-20', payment_status: 'unpaid' })]
    const ids = markOverdue(sales, AS_OF)
    expect(ids).toContain('unpaid-1')
  })

  it('partial status is eligible (returned)', () => {
    const sales: Sale[] = [sale({ id: 'partial-1', due_date: '2026-05-20', payment_status: 'partial' })]
    const ids = markOverdue(sales, AS_OF)
    expect(ids).toContain('partial-1')
  })

  it('paid status is NOT eligible (excluded)', () => {
    const sales: Sale[] = [sale({ id: 'paid-1', due_date: '2026-05-20', payment_status: 'paid' })]
    const ids = markOverdue(sales, AS_OF)
    expect(ids).not.toContain('paid-1')
  })

  it('overdue status is NOT eligible (already overdue, not re-flagged)', () => {
    const sales: Sale[] = [sale({ id: 'overdue-1', due_date: '2026-05-20', payment_status: 'overdue' })]
    const ids = markOverdue(sales, AS_OF)
    expect(ids).not.toContain('overdue-1')
  })

  it('all 4 statuses tested together', () => {
    const sales: Sale[] = [
      sale({ id: 'u', due_date: '2026-05-20', payment_status: 'unpaid' }),
      sale({ id: 'p', due_date: '2026-05-20', payment_status: 'partial' }),
      sale({ id: 'pd', due_date: '2026-05-20', payment_status: 'paid' }),
      sale({ id: 'ov', due_date: '2026-05-20', payment_status: 'overdue' }),
    ]
    const ids = markOverdue(sales, AS_OF)
    expect(ids).toContain('u')
    expect(ids).toContain('p')
    expect(ids).not.toContain('pd')
    expect(ids).not.toContain('ov')
  })
})

describe('markOverdue — boundary: due_date one day before asOf', () => {
  it('due_date 2026-05-25, asOf 2026-05-26 → returned', () => {
    const sales: Sale[] = [
      sale({ id: 'boundary-before', due_date: '2026-05-25', payment_status: 'unpaid' }),
    ]
    const ids = markOverdue(sales, '2026-05-26')
    expect(ids).toContain('boundary-before')
  })

  it('due_date 2026-05-25 with partial status, asOf 2026-05-26 → returned', () => {
    const sales: Sale[] = [
      sale({ id: 'boundary-partial', due_date: '2026-05-25', payment_status: 'partial' }),
    ]
    const ids = markOverdue(sales, '2026-05-26')
    expect(ids).toContain('boundary-partial')
  })
})

describe('markOverdue — boundary: due_date one day after asOf', () => {
  it('due_date 2026-05-27, asOf 2026-05-26 → NOT returned', () => {
    const sales: Sale[] = [
      sale({ id: 'boundary-after', due_date: '2026-05-27', payment_status: 'unpaid' }),
    ]
    const ids = markOverdue(sales, '2026-05-26')
    expect(ids).not.toContain('boundary-after')
  })

  it('due_date 2026-05-27 with partial status, asOf 2026-05-26 → NOT returned', () => {
    const sales: Sale[] = [
      sale({ id: 'boundary-after-partial', due_date: '2026-05-27', payment_status: 'partial' }),
    ]
    const ids = markOverdue(sales, '2026-05-26')
    expect(ids).not.toContain('boundary-after-partial')
  })
})

describe('markOverdue — large batch mixed statuses', () => {
  it('10 sales with various statuses and dates — exact count of 4 qualifying', () => {
    const asOf = '2026-05-26'
    const sales: Sale[] = [
      sale({ id: 'q1',  due_date: '2026-05-20', payment_status: 'unpaid' }),   // qualifies
      sale({ id: 'q2',  due_date: '2026-05-21', payment_status: 'partial' }),  // qualifies
      sale({ id: 'q3',  due_date: '2026-05-22', payment_status: 'unpaid' }),   // qualifies
      sale({ id: 'q4',  due_date: '2026-05-23', payment_status: 'partial' }),  // qualifies
      sale({ id: 'nq1', due_date: '2026-05-20', payment_status: 'paid' }),     // paid — no
      sale({ id: 'nq2', due_date: '2026-05-20', payment_status: 'overdue' }),  // already overdue — no
      sale({ id: 'nq3', due_date: '2026-05-26', payment_status: 'unpaid' }),   // same day — no
      sale({ id: 'nq4', due_date: '2026-05-27', payment_status: 'unpaid' }),   // future — no
      sale({ id: 'nq5', due_date: '2026-06-01', payment_status: 'partial' }),  // future — no
      sale({ id: 'nq6', due_date: '2026-05-25', payment_status: 'paid' }),     // paid — no
    ]
    const ids = markOverdue(sales, asOf)
    expect(ids).toHaveLength(4)
    expect(ids).toContain('q1')
    expect(ids).toContain('q2')
    expect(ids).toContain('q3')
    expect(ids).toContain('q4')
  })

  it('all 10 sales qualify when all unpaid and past due', () => {
    const sales: Sale[] = Array.from({ length: 10 }, (_, i) =>
      sale({ id: `bulk-${i}`, due_date: '2026-01-01', payment_status: 'unpaid' })
    )
    const ids = markOverdue(sales, AS_OF)
    expect(ids).toHaveLength(10)
  })

  it('no sales qualify when all paid', () => {
    const sales: Sale[] = Array.from({ length: 10 }, (_, i) =>
      sale({ id: `paid-${i}`, due_date: '2026-01-01', payment_status: 'paid' })
    )
    const ids = markOverdue(sales, AS_OF)
    expect(ids).toHaveLength(0)
  })
})

describe('markOverdue — returns only IDs (string values)', () => {
  it('all returned values are strings', () => {
    const sales: Sale[] = [
      sale({ id: 'str-1', due_date: '2026-05-20', payment_status: 'unpaid' }),
      sale({ id: 'str-2', due_date: '2026-05-21', payment_status: 'partial' }),
    ]
    const ids = markOverdue(sales, AS_OF)
    for (const id of ids) {
      expect(typeof id).toBe('string')
    }
  })

  it('returned IDs match input sale IDs exactly', () => {
    const sales: Sale[] = [
      sale({ id: 'exact-id-abc', due_date: '2026-05-20', payment_status: 'unpaid' }),
    ]
    const ids = markOverdue(sales, AS_OF)
    expect(ids[0]).toBe('exact-id-abc')
  })

  it('returns array not set', () => {
    const sales: Sale[] = [sale({ id: 'arr-1', due_date: '2026-05-20', payment_status: 'unpaid' })]
    const ids = markOverdue(sales, AS_OF)
    expect(Array.isArray(ids)).toBe(true)
  })
})

describe('markOverdue — no duplicates in output', () => {
  it('input with unique IDs produces output with unique IDs', () => {
    const sales: Sale[] = [
      sale({ id: 'unique-1', due_date: '2026-05-20', payment_status: 'unpaid' }),
      sale({ id: 'unique-2', due_date: '2026-05-21', payment_status: 'unpaid' }),
      sale({ id: 'unique-3', due_date: '2026-05-22', payment_status: 'partial' }),
    ]
    const ids = markOverdue(sales, AS_OF)
    const unique = new Set(ids)
    expect(unique.size).toBe(ids.length)
  })

  it('no duplicate IDs in output for 5 qualifying sales', () => {
    const sales: Sale[] = Array.from({ length: 5 }, (_, i) =>
      sale({ id: `dedup-${i}`, due_date: '2026-01-15', payment_status: 'unpaid' })
    )
    const ids = markOverdue(sales, AS_OF)
    const unique = new Set(ids)
    expect(unique.size).toBe(5)
  })
})

describe('markOverdue — preserves all qualifying IDs', () => {
  it('5 qualifying sales all appear in result', () => {
    const qualifyingIds = ['id-a', 'id-b', 'id-c', 'id-d', 'id-e']
    const sales: Sale[] = qualifyingIds.map(id =>
      sale({ id, due_date: '2026-04-01', payment_status: 'unpaid' })
    )
    const ids = markOverdue(sales, AS_OF)
    expect(ids).toHaveLength(5)
    for (const qId of qualifyingIds) {
      expect(ids).toContain(qId)
    }
  })

  it('5 qualifying + 3 non-qualifying → 5 in result', () => {
    const sales: Sale[] = [
      sale({ id: 'q-1', due_date: '2026-04-01', payment_status: 'unpaid' }),
      sale({ id: 'q-2', due_date: '2026-04-02', payment_status: 'partial' }),
      sale({ id: 'q-3', due_date: '2026-04-03', payment_status: 'unpaid' }),
      sale({ id: 'q-4', due_date: '2026-04-04', payment_status: 'partial' }),
      sale({ id: 'q-5', due_date: '2026-04-05', payment_status: 'unpaid' }),
      sale({ id: 'nq-1', due_date: '2026-04-01', payment_status: 'paid' }),
      sale({ id: 'nq-2', due_date: '2026-06-01', payment_status: 'unpaid' }),
      sale({ id: 'nq-3', due_date: AS_OF,        payment_status: 'unpaid' }),
    ]
    const ids = markOverdue(sales, AS_OF)
    expect(ids).toHaveLength(5)
    expect(ids).toContain('q-1')
    expect(ids).toContain('q-5')
  })
})
