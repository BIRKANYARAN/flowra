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

describe('markOverdue — return value type safety', () => {
  it('returns an array', () => {
    const result = markOverdue([], AS_OF)
    expect(Array.isArray(result)).toBe(true)
  })

  it('returns string array for qualifying sales', () => {
    const sales: Sale[] = [
      sale({ id: 'type-check-1', due_date: '2026-01-15', payment_status: 'unpaid' }),
      sale({ id: 'type-check-2', due_date: '2026-02-15', payment_status: 'partial' }),
    ]
    const ids = markOverdue(sales, AS_OF)
    expect(ids.every(id => typeof id === 'string')).toBe(true)
  })

  it('does not return Sale objects, only IDs', () => {
    const sales: Sale[] = [
      sale({ id: 'obj-check', due_date: '2026-01-15', payment_status: 'unpaid' }),
    ]
    const ids = markOverdue(sales, AS_OF)
    // Should be string IDs, not objects
    expect(typeof ids[0]).toBe('string')
    expect(ids[0]).toBe('obj-check')
  })

  it('empty result is empty array, not null/undefined', () => {
    const result = markOverdue([], AS_OF)
    expect(result).not.toBeNull()
    expect(result).not.toBeUndefined()
    expect(result).toEqual([])
  })
})

describe('markOverdue — asOf date variations', () => {
  it('asOf in early year marks old unpaid sales', () => {
    const asOf = '2026-01-15'
    const sales: Sale[] = [
      sale({ id: 'jan-early', due_date: '2026-01-14', payment_status: 'unpaid' }),
      sale({ id: 'jan-same',  due_date: '2026-01-15', payment_status: 'unpaid' }),
    ]
    const ids = markOverdue(sales, asOf)
    expect(ids).toContain('jan-early')
    expect(ids).not.toContain('jan-same')
  })

  it('asOf at year boundary', () => {
    const asOf = '2026-01-01'
    const sales: Sale[] = [
      sale({ id: 'dec-31', due_date: '2025-12-31', payment_status: 'unpaid' }),
      sale({ id: 'jan-01', due_date: '2026-01-01', payment_status: 'unpaid' }),
      sale({ id: 'jan-02', due_date: '2026-01-02', payment_status: 'unpaid' }),
    ]
    const ids = markOverdue(sales, asOf)
    expect(ids).toContain('dec-31')
    expect(ids).not.toContain('jan-01')
    expect(ids).not.toContain('jan-02')
  })

  it('asOf in far future marks all past unpaid sales', () => {
    const asOf = '2030-12-31'
    const sales: Sale[] = [
      sale({ id: 'old-1', due_date: '2020-01-01', payment_status: 'unpaid' }),
      sale({ id: 'old-2', due_date: '2025-06-15', payment_status: 'partial' }),
      sale({ id: 'old-3', due_date: '2026-05-25', payment_status: 'unpaid' }),
    ]
    const ids = markOverdue(sales, asOf)
    expect(ids).toHaveLength(3)
  })

  it('asOf in far past marks nothing (all sales are future)', () => {
    const asOf = '2020-01-01'
    const sales: Sale[] = [
      sale({ id: 'future-a', due_date: '2026-01-01', payment_status: 'unpaid' }),
      sale({ id: 'future-b', due_date: '2025-01-01', payment_status: 'partial' }),
    ]
    const ids = markOverdue(sales, asOf)
    expect(ids).toHaveLength(0)
  })
})

describe('markOverdue — single sale scenarios', () => {
  it('single unpaid past sale is returned', () => {
    const sales: Sale[] = [sale({ id: 'single-1', due_date: '2026-01-01', payment_status: 'unpaid' })]
    const ids = markOverdue(sales, AS_OF)
    expect(ids).toEqual(['single-1'])
  })

  it('single partial past sale is returned', () => {
    const sales: Sale[] = [sale({ id: 'single-2', due_date: '2026-01-01', payment_status: 'partial' })]
    const ids = markOverdue(sales, AS_OF)
    expect(ids).toEqual(['single-2'])
  })

  it('single paid past sale is not returned', () => {
    const sales: Sale[] = [sale({ id: 'single-3', due_date: '2026-01-01', payment_status: 'paid' })]
    const ids = markOverdue(sales, AS_OF)
    expect(ids).toEqual([])
  })

  it('single sale on asOf date is not returned', () => {
    const sales: Sale[] = [sale({ id: 'single-4', due_date: AS_OF, payment_status: 'unpaid' })]
    const ids = markOverdue(sales, AS_OF)
    expect(ids).toEqual([])
  })

  it('single future sale is not returned', () => {
    const sales: Sale[] = [sale({ id: 'single-5', due_date: '2027-01-01', payment_status: 'unpaid' })]
    const ids = markOverdue(sales, AS_OF)
    expect(ids).toEqual([])
  })
})

describe('markOverdue — filter does not mutate input', () => {
  it('original sales array is not modified', () => {
    const sales: Sale[] = [
      sale({ id: 'm1', due_date: '2026-01-01', payment_status: 'unpaid' }),
      sale({ id: 'm2', due_date: '2026-01-02', payment_status: 'paid' }),
    ]
    const originalLength = sales.length
    const originalFirst = { ...sales[0] }
    markOverdue(sales, AS_OF)
    expect(sales.length).toBe(originalLength)
    expect(sales[0].id).toBe(originalFirst.id)
    expect(sales[0].payment_status).toBe(originalFirst.payment_status)
  })

  it('input sale objects retain their properties after call', () => {
    const s = sale({ id: 'intact', due_date: '2026-01-01', payment_status: 'unpaid' })
    const salesArr = [s]
    markOverdue(salesArr, AS_OF)
    expect(s.id).toBe('intact')
    expect(s.payment_status).toBe('unpaid')
  })
})

describe('markOverdue — exact date string comparison', () => {
  it('lexicographic date comparison: 2026-05-25 < 2026-05-26 is true', () => {
    expect('2026-05-25' < '2026-05-26').toBe(true)
  })

  it('lexicographic date comparison: 2026-05-26 < 2026-05-26 is false', () => {
    expect('2026-05-26' < '2026-05-26').toBe(false)
  })

  it('sale with due 2026-04-30 and asOf 2026-05-01 is returned', () => {
    const sales: Sale[] = [sale({ id: 'apr-30', due_date: '2026-04-30', payment_status: 'unpaid' })]
    const ids = markOverdue(sales, '2026-05-01')
    expect(ids).toContain('apr-30')
  })

  it('sale with due 2026-05-31 and asOf 2026-05-31 is NOT returned (same day)', () => {
    const sales: Sale[] = [sale({ id: 'may-31', due_date: '2026-05-31', payment_status: 'unpaid' })]
    const ids = markOverdue(sales, '2026-05-31')
    expect(ids).not.toContain('may-31')
  })
})

describe('markOverdue — Sale interface properties', () => {
  it('Sale interface has id field', () => {
    const s: Sale = { id: 'test-id', due_date: '2026-01-01', payment_status: 'unpaid' }
    expect(s.id).toBe('test-id')
  })

  it('Sale interface has due_date field', () => {
    const s: Sale = { id: 'test-id', due_date: '2026-01-01', payment_status: 'unpaid' }
    expect(s.due_date).toBe('2026-01-01')
  })

  it('Sale interface has payment_status field', () => {
    const s: Sale = { id: 'test-id', due_date: '2026-01-01', payment_status: 'unpaid' }
    expect(s.payment_status).toBe('unpaid')
  })

  it('markOverdue uses id from Sale interface', () => {
    const s: Sale = { id: 'uuid-sale-123', due_date: '2026-01-01', payment_status: 'unpaid' }
    const ids = markOverdue([s], AS_OF)
    expect(ids[0]).toBe('uuid-sale-123')
  })
})

describe('markOverdue — comprehensive status x date matrix', () => {
  const tests: Array<{ status: string; date: string; asOf: string; expected: boolean; desc: string }> = [
    { status: 'unpaid',  date: '2026-05-25', asOf: '2026-05-26', expected: true,  desc: 'unpaid + past' },
    { status: 'partial', date: '2026-05-25', asOf: '2026-05-26', expected: true,  desc: 'partial + past' },
    { status: 'paid',    date: '2026-05-25', asOf: '2026-05-26', expected: false, desc: 'paid + past' },
    { status: 'overdue', date: '2026-05-25', asOf: '2026-05-26', expected: false, desc: 'overdue + past' },
    { status: 'unpaid',  date: '2026-05-26', asOf: '2026-05-26', expected: false, desc: 'unpaid + same day' },
    { status: 'unpaid',  date: '2026-05-27', asOf: '2026-05-26', expected: false, desc: 'unpaid + future' },
    { status: 'partial', date: '2026-05-26', asOf: '2026-05-26', expected: false, desc: 'partial + same day' },
    { status: 'partial', date: '2026-05-27', asOf: '2026-05-26', expected: false, desc: 'partial + future' },
  ]

  for (const { status, date, asOf, expected, desc } of tests) {
    it(`${desc} → expected=${expected}`, () => {
      const sales: Sale[] = [sale({ id: `matrix-${desc}`, due_date: date, payment_status: status })]
      const ids = markOverdue(sales, asOf)
      if (expected) {
        expect(ids).toContain(`matrix-${desc}`)
      } else {
        expect(ids).not.toContain(`matrix-${desc}`)
      }
    })
  }
})

describe('markOverdue — order preservation', () => {
  it('result order matches input order for qualifying sales', () => {
    const sales: Sale[] = [
      sale({ id: 'first',  due_date: '2026-01-01', payment_status: 'unpaid' }),
      sale({ id: 'second', due_date: '2026-02-01', payment_status: 'unpaid' }),
      sale({ id: 'third',  due_date: '2026-03-01', payment_status: 'unpaid' }),
    ]
    const ids = markOverdue(sales, AS_OF)
    expect(ids[0]).toBe('first')
    expect(ids[1]).toBe('second')
    expect(ids[2]).toBe('third')
  })

  it('non-qualifying sales do not affect order of qualifying ones', () => {
    const sales: Sale[] = [
      sale({ id: 'q-a',   due_date: '2026-01-01', payment_status: 'unpaid' }),
      sale({ id: 'nq-b',  due_date: '2026-01-01', payment_status: 'paid' }),
      sale({ id: 'q-c',   due_date: '2026-02-01', payment_status: 'unpaid' }),
    ]
    const ids = markOverdue(sales, AS_OF)
    expect(ids).toEqual(['q-a', 'q-c'])
  })
})
