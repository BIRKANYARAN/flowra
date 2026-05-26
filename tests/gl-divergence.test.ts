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
