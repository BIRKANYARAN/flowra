/**
 * Tests for lib/admin/gl-divergence.ts
 *
 * Pure unit tests for the divergence computation logic.
 * No DB calls — all cases use in-memory data.
 *
 * Run with: npx vitest run tests/gl-divergence.test.ts
 */
import { describe, it, expect } from 'vitest'
import { computeDivergence }   from '../lib/admin/gl-divergence'
import type { OperationalIds, JournaledRef } from '../lib/admin/gl-divergence'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSale(id: string, amount_try = 1000) { return { id, amount_try } }
function makeJournaled(source_type: string, source_id: string): JournaledRef {
  return { source_type, source_id }
}

// ── 1. All records matched ────────────────────────────────────────────────────

describe('computeDivergence — all records matched', () => {
  it('returns zero missing when every record has a journal entry', () => {
    const ops: OperationalIds = {
      sales:     [makeSale('s1'), makeSale('s2')],
      expenses:  [{ id: 'e1', amount_try: 500 }],
      purchases: [{ id: 'p1', amount_try: 2000 }],
    }
    const journaled: JournaledRef[] = [
      makeJournaled('sale',     's1'),
      makeJournaled('sale',     's2'),
      makeJournaled('expense',  'e1'),
      makeJournaled('purchase', 'p1'),
    ]

    const result = computeDivergence(ops, journaled)

    expect(result.sales.total).toBe(2)
    expect(result.sales.with_entries).toBe(2)
    expect(result.sales.missing).toBe(0)
    expect(result.sales.missing_amount_try).toBe(0)

    expect(result.expenses.missing).toBe(0)
    expect(result.purchases.missing).toBe(0)
  })
})

// ── 2. No records matched ─────────────────────────────────────────────────────

describe('computeDivergence — none matched', () => {
  it('reports all records as missing when journal_entries is empty', () => {
    const ops: OperationalIds = {
      sales:     [makeSale('s1', 1000), makeSale('s2', 2000)],
      expenses:  [{ id: 'e1', amount_try: 300 }],
      purchases: [],
    }
    const journaled: JournaledRef[] = []

    const result = computeDivergence(ops, journaled)

    expect(result.sales.total).toBe(2)
    expect(result.sales.with_entries).toBe(0)
    expect(result.sales.missing).toBe(2)
    expect(result.sales.missing_amount_try).toBe(3000)   // 1000 + 2000

    expect(result.expenses.missing).toBe(1)
    expect(result.expenses.missing_amount_try).toBe(300)

    expect(result.purchases.total).toBe(0)
    expect(result.purchases.missing).toBe(0)
  })
})

// ── 3. Partial match ──────────────────────────────────────────────────────────

describe('computeDivergence — partial match', () => {
  it('correctly counts matched and unmatched records', () => {
    const ops: OperationalIds = {
      sales:     [makeSale('s1', 100), makeSale('s2', 200), makeSale('s3', 300)],
      expenses:  [{ id: 'e1', amount_try: 50 }, { id: 'e2', amount_try: 75 }],
      purchases: [{ id: 'p1', amount_try: 1000 }],
    }
    const journaled: JournaledRef[] = [
      makeJournaled('sale',    's1'),    // matched
      makeJournaled('sale',    's3'),    // matched — s2 is missing
      makeJournaled('expense', 'e2'),    // matched — e1 is missing
      // purchase p1 is missing
    ]

    const result = computeDivergence(ops, journaled)

    // Sales: s1 and s3 matched, s2 missing
    expect(result.sales.total).toBe(3)
    expect(result.sales.with_entries).toBe(2)
    expect(result.sales.missing).toBe(1)
    expect(result.sales.missing_amount_try).toBe(200)   // only s2

    // Expenses: e2 matched, e1 missing
    expect(result.expenses.total).toBe(2)
    expect(result.expenses.with_entries).toBe(1)
    expect(result.expenses.missing).toBe(1)
    expect(result.expenses.missing_amount_try).toBe(50)

    // Purchases: p1 missing
    expect(result.purchases.total).toBe(1)
    expect(result.purchases.with_entries).toBe(0)
    expect(result.purchases.missing).toBe(1)
    expect(result.purchases.missing_amount_try).toBe(1000)
  })
})

// ── 4. Empty inputs ───────────────────────────────────────────────────────────

describe('computeDivergence — empty inputs', () => {
  it('handles completely empty operational records gracefully', () => {
    const ops: OperationalIds = { sales: [], expenses: [], purchases: [] }
    const journaled: JournaledRef[] = []

    const result = computeDivergence(ops, journaled)

    expect(result.sales.total).toBe(0)
    expect(result.sales.missing).toBe(0)
    expect(result.expenses.total).toBe(0)
    expect(result.expenses.missing).toBe(0)
    expect(result.purchases.total).toBe(0)
    expect(result.purchases.missing).toBe(0)
  })

  it('handles empty operational records with non-empty journal entries', () => {
    const ops: OperationalIds = { sales: [], expenses: [], purchases: [] }
    const journaled: JournaledRef[] = [
      makeJournaled('sale',    'orphan-1'),
      makeJournaled('expense', 'orphan-2'),
    ]

    const result = computeDivergence(ops, journaled)

    expect(result.sales.total).toBe(0)
    expect(result.sales.missing).toBe(0)
    expect(result.expenses.missing).toBe(0)
  })
})

// ── 5. source_type filtering ──────────────────────────────────────────────────

describe('computeDivergence — source_type filtering', () => {
  it('does NOT match a sale record against a journal entry with wrong source_type', () => {
    const ops: OperationalIds = {
      sales:     [makeSale('id-1', 500)],
      expenses:  [],
      purchases: [],
    }
    // Journal entry exists but with source_type='expense' — should NOT match sale
    const journaled: JournaledRef[] = [
      makeJournaled('expense', 'id-1'),
    ]

    const result = computeDivergence(ops, journaled)

    expect(result.sales.with_entries).toBe(0)
    expect(result.sales.missing).toBe(1)
    expect(result.sales.missing_amount_try).toBe(500)
  })

  it('does NOT match a purchase against a sale journal entry', () => {
    const ops: OperationalIds = {
      sales:     [],
      expenses:  [],
      purchases: [{ id: 'shared-id', amount_try: 999 }],
    }
    // Only a sale journal entry with the same id exists
    const journaled: JournaledRef[] = [
      makeJournaled('sale', 'shared-id'),
    ]

    const result = computeDivergence(ops, journaled)

    expect(result.purchases.with_entries).toBe(0)
    expect(result.purchases.missing).toBe(1)
  })

  it('correctly separates types when same source_id appears in multiple source_types', () => {
    const ops: OperationalIds = {
      sales:     [makeSale('dup-id', 100)],
      expenses:  [{ id: 'dup-id', amount_try: 200 }],
      purchases: [{ id: 'dup-id', amount_try: 300 }],
    }
    const journaled: JournaledRef[] = [
      makeJournaled('sale',    'dup-id'),   // only sale matched
    ]

    const result = computeDivergence(ops, journaled)

    expect(result.sales.with_entries).toBe(1)
    expect(result.sales.missing).toBe(0)

    expect(result.expenses.with_entries).toBe(0)
    expect(result.expenses.missing).toBe(1)

    expect(result.purchases.with_entries).toBe(0)
    expect(result.purchases.missing).toBe(1)
  })
})

// ── 6. Percentage calculation (via totals) ────────────────────────────────────

describe('computeDivergence — percentage calculation', () => {
  it('provides correct counts for caller to compute divergence_pct', () => {
    // 10 sales, 5 matched → 50% divergence for sales
    const sales = Array.from({ length: 10 }, (_, i) => makeSale(`s${i}`, 100))
    const ops: OperationalIds = {
      sales,
      expenses:  [],
      purchases: [],
    }
    const journaled: JournaledRef[] = Array.from({ length: 5 }, (_, i) =>
      makeJournaled('sale', `s${i}`),
    )

    const result = computeDivergence(ops, journaled)

    const totalRecords = result.sales.total + result.expenses.total + result.purchases.total
    const totalMissing =
      result.sales.missing + result.expenses.missing + result.purchases.missing
    const pct = totalMissing / totalRecords * 100

    expect(result.sales.total).toBe(10)
    expect(result.sales.with_entries).toBe(5)
    expect(result.sales.missing).toBe(5)
    expect(result.sales.missing_amount_try).toBe(500)   // 5 × 100
    expect(pct).toBeCloseTo(50, 1)
  })

  it('zero divergence_pct when all records are journaled', () => {
    const ops: OperationalIds = {
      sales:     [makeSale('x', 1000)],
      expenses:  [{ id: 'y', amount_try: 500 }],
      purchases: [],
    }
    const journaled = [
      makeJournaled('sale',    'x'),
      makeJournaled('expense', 'y'),
    ]

    const result  = computeDivergence(ops, journaled)
    const total   = result.sales.total + result.expenses.total + result.purchases.total
    const missing = result.sales.missing + result.expenses.missing + result.purchases.missing
    const pct     = total > 0 ? (missing / total) * 100 : 0

    expect(pct).toBe(0)
  })

  it('100% divergence_pct when nothing is journaled', () => {
    const ops: OperationalIds = {
      sales:     [makeSale('a', 300), makeSale('b', 700)],
      expenses:  [{ id: 'c', amount_try: 200 }],
      purchases: [],
    }
    const result  = computeDivergence(ops, [])
    const total   = result.sales.total + result.expenses.total + result.purchases.total
    const missing = result.sales.missing + result.expenses.missing + result.purchases.missing
    const pct     = total > 0 ? (missing / total) * 100 : 0

    expect(total).toBe(3)
    expect(missing).toBe(3)
    expect(pct).toBe(100)
  })
})

// ── 7. missing_amount_try accuracy ───────────────────────────────────────────

describe('computeDivergence — missing_amount_try calculations', () => {

  it('missing_amount_try is 0 when all records are journaled', () => {
    const ops: OperationalIds = {
      sales:     [makeSale('s1', 500), makeSale('s2', 300)],
      expenses:  [{ id: 'e1', amount_try: 200 }],
      purchases: [{ id: 'p1', amount_try: 1000 }],
    }
    const journaled = [
      makeJournaled('sale',     's1'),
      makeJournaled('sale',     's2'),
      makeJournaled('expense',  'e1'),
      makeJournaled('purchase', 'p1'),
    ]
    const result = computeDivergence(ops, journaled)
    expect(result.sales.missing_amount_try).toBe(0)
    expect(result.expenses.missing_amount_try).toBe(0)
    expect(result.purchases.missing_amount_try).toBe(0)
  })

  it('missing_amount_try sums all unmatched amounts correctly', () => {
    const ops: OperationalIds = {
      sales:     [makeSale('s1', 100), makeSale('s2', 200), makeSale('s3', 400)],
      expenses:  [],
      purchases: [],
    }
    // Only s2 is journaled — s1 (100) and s3 (400) are missing
    const journaled = [makeJournaled('sale', 's2')]
    const result = computeDivergence(ops, journaled)
    expect(result.sales.missing_amount_try).toBe(500)  // 100 + 400
  })

  it('missing_amount_try handles zero-amount records', () => {
    const ops: OperationalIds = {
      sales:     [makeSale('s1', 0), makeSale('s2', 0)],
      expenses:  [],
      purchases: [],
    }
    const result = computeDivergence(ops, [])
    expect(result.sales.missing_amount_try).toBe(0)
    expect(result.sales.missing).toBe(2)
  })

  it('missing_amount_try is correct for purchases when none are journaled', () => {
    const ops: OperationalIds = {
      sales:     [],
      expenses:  [],
      purchases: [
        { id: 'p1', amount_try: 5_000 },
        { id: 'p2', amount_try: 3_000 },
        { id: 'p3', amount_try: 2_000 },
      ],
    }
    const result = computeDivergence(ops, [])
    expect(result.purchases.missing_amount_try).toBe(10_000)
  })
})

// ── 8. with_entries invariant ─────────────────────────────────────────────────

describe('computeDivergence — with_entries + missing = total invariant', () => {

  it('with_entries + missing always equals total for sales', () => {
    const ops: OperationalIds = {
      sales:     [makeSale('s1'), makeSale('s2'), makeSale('s3')],
      expenses:  [{ id: 'e1', amount_try: 100 }],
      purchases: [{ id: 'p1', amount_try: 200 }, { id: 'p2', amount_try: 300 }],
    }
    const journaled = [
      makeJournaled('sale',    's1'),
      makeJournaled('expense', 'e1'),
    ]
    const result = computeDivergence(ops, journaled)

    expect(result.sales.with_entries + result.sales.missing).toBe(result.sales.total)
    expect(result.expenses.with_entries + result.expenses.missing).toBe(result.expenses.total)
    expect(result.purchases.with_entries + result.purchases.missing).toBe(result.purchases.total)
  })

  it('with_entries never exceeds total', () => {
    const ops: OperationalIds = {
      sales:     [makeSale('s1', 100)],
      expenses:  [],
      purchases: [],
    }
    // More journal entries than operational records for the type
    const journaled = [
      makeJournaled('sale', 's1'),
      makeJournaled('sale', 's2'),  // s2 doesn't exist
      makeJournaled('sale', 's3'),
    ]
    const result = computeDivergence(ops, journaled)
    expect(result.sales.with_entries).toBe(1)
    expect(result.sales.missing).toBe(0)
    expect(result.sales.total).toBe(1)
  })
})

// ── 9. Large dataset ──────────────────────────────────────────────────────────

describe('computeDivergence — large datasets', () => {

  it('handles 100 sales with 75 journaled → 25 missing', () => {
    const sales = Array.from({ length: 100 }, (_, i) => makeSale(`s${i}`, 1000))
    const ops: OperationalIds = { sales, expenses: [], purchases: [] }
    const journaled = Array.from({ length: 75 }, (_, i) => makeJournaled('sale', `s${i}`))

    const result = computeDivergence(ops, journaled)
    expect(result.sales.total).toBe(100)
    expect(result.sales.with_entries).toBe(75)
    expect(result.sales.missing).toBe(25)
    expect(result.sales.missing_amount_try).toBe(25_000)
  })

  it('handles 50 expenses all journaled → 0 missing', () => {
    const expenses = Array.from({ length: 50 }, (_, i) => ({ id: `e${i}`, amount_try: 200 }))
    const ops: OperationalIds = { sales: [], expenses, purchases: [] }
    const journaled = expenses.map(e => makeJournaled('expense', e.id))

    const result = computeDivergence(ops, journaled)
    expect(result.expenses.total).toBe(50)
    expect(result.expenses.missing).toBe(0)
    expect(result.expenses.missing_amount_try).toBe(0)
  })
})

// ── 10. Duplicate source_ids in operational records ───────────────────────────

describe('computeDivergence — duplicate source_ids', () => {

  it('counts each operational record independently, even if they share an id', () => {
    // Two records with the same id — both should be checked against the journal set
    const ops: OperationalIds = {
      sales: [makeSale('dup', 100), makeSale('dup', 200)],
      expenses:  [],
      purchases: [],
    }
    // Journal has one entry for 'dup'
    const journaled = [makeJournaled('sale', 'dup')]

    const result = computeDivergence(ops, journaled)
    // Both records match because the set lookup returns true for both
    expect(result.sales.total).toBe(2)
    expect(result.sales.with_entries).toBe(2)
    expect(result.sales.missing).toBe(0)
  })
})

// ── 11. All records matched → no divergence ───────────────────────────────────

describe('computeDivergence — all records matched produces no divergence', () => {
  it('all sales matched → sales.missing is 0', () => {
    const ops: OperationalIds = {
      sales:     [makeSale('s1', 100), makeSale('s2', 200)],
      expenses:  [],
      purchases: [],
    }
    const journaled = [makeJournaled('sale', 's1'), makeJournaled('sale', 's2')]
    const result = computeDivergence(ops, journaled)
    expect(result.sales.missing).toBe(0)
    expect(result.sales.missing_amount_try).toBe(0)
    expect(result.sales.with_entries).toBe(2)
  })

  it('all expenses matched → expenses.missing is 0', () => {
    const ops: OperationalIds = {
      sales:     [],
      expenses:  [{ id: 'e1', amount_try: 400 }, { id: 'e2', amount_try: 600 }],
      purchases: [],
    }
    const journaled = [makeJournaled('expense', 'e1'), makeJournaled('expense', 'e2')]
    const result = computeDivergence(ops, journaled)
    expect(result.expenses.missing).toBe(0)
    expect(result.expenses.with_entries).toBe(2)
  })

  it('all purchases matched → purchases.missing is 0', () => {
    const ops: OperationalIds = {
      sales:     [],
      expenses:  [],
      purchases: [{ id: 'p1', amount_try: 1_000 }],
    }
    const journaled = [makeJournaled('purchase', 'p1')]
    const result = computeDivergence(ops, journaled)
    expect(result.purchases.missing).toBe(0)
    expect(result.purchases.with_entries).toBe(1)
  })
})

// ── 12. Missing journal entries appear in divergence ─────────────────────────

describe('computeDivergence — missing journal entries', () => {
  it('sales without journal entries appear in missing count', () => {
    const ops: OperationalIds = {
      sales:     [makeSale('unmatched-1', 500), makeSale('unmatched-2', 300)],
      expenses:  [],
      purchases: [],
    }
    const result = computeDivergence(ops, [])
    expect(result.sales.missing).toBe(2)
    expect(result.sales.missing_amount_try).toBe(800)
  })

  it('expenses without journal entries appear in missing count', () => {
    const ops: OperationalIds = {
      sales:     [],
      expenses:  [{ id: 'e1', amount_try: 750 }],
      purchases: [],
    }
    const result = computeDivergence(ops, [])
    expect(result.expenses.missing).toBe(1)
    expect(result.expenses.missing_amount_try).toBe(750)
  })

  it('purchases without journal entries appear in missing count', () => {
    const ops: OperationalIds = {
      sales:     [],
      expenses:  [],
      purchases: [{ id: 'p1', amount_try: 2_000 }, { id: 'p2', amount_try: 3_000 }],
    }
    const result = computeDivergence(ops, [])
    expect(result.purchases.missing).toBe(2)
    expect(result.purchases.missing_amount_try).toBe(5_000)
  })
})

// ── 13. Extra journal entries (ghost references) ──────────────────────────────

describe('computeDivergence — extra journal entries (ghost references)', () => {
  it('journal entries for non-existent sales do not inflate with_entries', () => {
    const ops: OperationalIds = { sales: [], expenses: [], purchases: [] }
    const journaled = [
      makeJournaled('sale', 'ghost-1'),
      makeJournaled('sale', 'ghost-2'),
    ]
    const result = computeDivergence(ops, journaled)
    expect(result.sales.with_entries).toBe(0)
    expect(result.sales.total).toBe(0)
    expect(result.sales.missing).toBe(0)
  })

  it('extra journal entries for non-existent expenses are ignored', () => {
    const ops: OperationalIds = {
      sales:     [],
      expenses:  [{ id: 'e1', amount_try: 100 }],
      purchases: [],
    }
    const journaled = [
      makeJournaled('expense', 'e1'),
      makeJournaled('expense', 'ghost-expense'),
    ]
    const result = computeDivergence(ops, journaled)
    expect(result.expenses.total).toBe(1)
    expect(result.expenses.with_entries).toBe(1)
    expect(result.expenses.missing).toBe(0)
  })
})

// ── 14. Mixed case (some matched, some missing, some extra) ───────────────────

describe('computeDivergence — mixed matched/missing/ghost entries', () => {
  it('correctly handles a mixed scenario across all source types', () => {
    const ops: OperationalIds = {
      sales:     [makeSale('s1', 100), makeSale('s2', 200), makeSale('s3', 300)],
      expenses:  [{ id: 'e1', amount_try: 50 }, { id: 'e2', amount_try: 75 }],
      purchases: [{ id: 'p1', amount_try: 1_000 }],
    }
    const journaled: JournaledRef[] = [
      makeJournaled('sale',     's1'),          // matched
      makeJournaled('sale',     'ghost-sale'),  // extra (ghost)
      makeJournaled('expense',  'e2'),          // matched
      makeJournaled('purchase', 'ghost-p'),     // extra (ghost)
    ]
    const result = computeDivergence(ops, journaled)

    // Sales: s1 matched, s2 and s3 missing
    expect(result.sales.total).toBe(3)
    expect(result.sales.with_entries).toBe(1)
    expect(result.sales.missing).toBe(2)
    expect(result.sales.missing_amount_try).toBe(500)  // s2 + s3

    // Expenses: e2 matched, e1 missing
    expect(result.expenses.total).toBe(2)
    expect(result.expenses.with_entries).toBe(1)
    expect(result.expenses.missing).toBe(1)
    expect(result.expenses.missing_amount_try).toBe(50)

    // Purchases: p1 missing (ghost entry with different id)
    expect(result.purchases.total).toBe(1)
    expect(result.purchases.with_entries).toBe(0)
    expect(result.purchases.missing).toBe(1)
    expect(result.purchases.missing_amount_try).toBe(1_000)
  })
})

// ── 15. Empty inputs edge cases ───────────────────────────────────────────────

describe('computeDivergence — empty inputs edge cases', () => {
  it('all empty operational and empty journaled → all zeros', () => {
    const result = computeDivergence({ sales: [], expenses: [], purchases: [] }, [])
    expect(result.sales.total).toBe(0)
    expect(result.sales.missing).toBe(0)
    expect(result.expenses.total).toBe(0)
    expect(result.expenses.missing).toBe(0)
    expect(result.purchases.total).toBe(0)
    expect(result.purchases.missing).toBe(0)
  })

  it('empty operational with non-empty journaled → ghost refs ignored, all zeros', () => {
    const journaled = [
      makeJournaled('sale', 'x'), makeJournaled('expense', 'y'), makeJournaled('purchase', 'z'),
    ]
    const result = computeDivergence({ sales: [], expenses: [], purchases: [] }, journaled)
    expect(result.sales.total).toBe(0)
    expect(result.expenses.total).toBe(0)
    expect(result.purchases.total).toBe(0)
  })

  it('non-empty operational with empty journaled → all missing', () => {
    const ops: OperationalIds = {
      sales:     [makeSale('s1', 100)],
      expenses:  [{ id: 'e1', amount_try: 200 }],
      purchases: [{ id: 'p1', amount_try: 300 }],
    }
    const result = computeDivergence(ops, [])
    expect(result.sales.missing).toBe(1)
    expect(result.expenses.missing).toBe(1)
    expect(result.purchases.missing).toBe(1)
  })
})

// ── 16. Divergence count matches unmatched records ────────────────────────────

describe('computeDivergence — divergence count invariant', () => {
  it('missing count = total - with_entries for sales', () => {
    const ops: OperationalIds = {
      sales: Array.from({ length: 7 }, (_, i) => makeSale(`s${i}`, 100)),
      expenses: [],
      purchases: [],
    }
    const journaled = Array.from({ length: 4 }, (_, i) => makeJournaled('sale', `s${i}`))
    const result = computeDivergence(ops, journaled)
    expect(result.sales.missing).toBe(result.sales.total - result.sales.with_entries)
  })

  it('missing count = total - with_entries for expenses', () => {
    const ops: OperationalIds = {
      sales: [],
      expenses: Array.from({ length: 5 }, (_, i) => ({ id: `e${i}`, amount_try: 50 })),
      purchases: [],
    }
    const journaled = Array.from({ length: 3 }, (_, i) => makeJournaled('expense', `e${i}`))
    const result = computeDivergence(ops, journaled)
    expect(result.expenses.missing).toBe(result.expenses.total - result.expenses.with_entries)
  })

  it('missing count = total - with_entries for purchases', () => {
    const ops: OperationalIds = {
      sales: [],
      expenses: [],
      purchases: Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, amount_try: 100 })),
    }
    const journaled = Array.from({ length: 2 }, (_, i) => makeJournaled('purchase', `p${i}`))
    const result = computeDivergence(ops, journaled)
    expect(result.purchases.missing).toBe(result.purchases.total - result.purchases.with_entries)
  })
})

// ── 17. source_type filtering — sales vs expenses vs purchases ────────────────

describe('computeDivergence — source_type filtering', () => {
  it('sale journal entry does not match an expense operational record', () => {
    const ops: OperationalIds = {
      sales: [],
      expenses: [{ id: 'shared', amount_try: 100 }],
      purchases: [],
    }
    const journaled = [makeJournaled('sale', 'shared')]
    const result = computeDivergence(ops, journaled)
    expect(result.expenses.with_entries).toBe(0)
    expect(result.expenses.missing).toBe(1)
  })

  it('purchase journal entry does not match a sale operational record', () => {
    const ops: OperationalIds = {
      sales: [makeSale('shared', 200)],
      expenses: [],
      purchases: [],
    }
    const journaled = [makeJournaled('purchase', 'shared')]
    const result = computeDivergence(ops, journaled)
    expect(result.sales.with_entries).toBe(0)
    expect(result.sales.missing).toBe(1)
  })

  it('expense journal entry does not match a purchase operational record', () => {
    const ops: OperationalIds = {
      sales: [],
      expenses: [],
      purchases: [{ id: 'shared', amount_try: 300 }],
    }
    const journaled = [makeJournaled('expense', 'shared')]
    const result = computeDivergence(ops, journaled)
    expect(result.purchases.with_entries).toBe(0)
    expect(result.purchases.missing).toBe(1)
  })

  it('each source_type is completely independent', () => {
    // Same ID exists in all three operational types, each has its own journal entry
    const ops: OperationalIds = {
      sales:     [makeSale('id-x', 100)],
      expenses:  [{ id: 'id-x', amount_try: 200 }],
      purchases: [{ id: 'id-x', amount_try: 300 }],
    }
    const journaled = [
      makeJournaled('sale',     'id-x'),
      makeJournaled('expense',  'id-x'),
      makeJournaled('purchase', 'id-x'),
    ]
    const result = computeDivergence(ops, journaled)
    expect(result.sales.with_entries).toBe(1)
    expect(result.expenses.with_entries).toBe(1)
    expect(result.purchases.with_entries).toBe(1)
    expect(result.sales.missing).toBe(0)
    expect(result.expenses.missing).toBe(0)
    expect(result.purchases.missing).toBe(0)
  })
})
