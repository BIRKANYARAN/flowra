/**
 * Tests for lib/admin/journal-backfill.ts — pure backfill status computation
 * Run with: npx vitest run tests/journal-backfill.test.ts
 */
import { describe, it, expect } from 'vitest'
import { computeBackfillStatus } from '../lib/admin/journal-backfill'

describe('computeBackfillStatus', () => {

  it('returns complete=true when all journaled counts match operational counts', () => {
    const result = computeBackfillStatus(
      { sales: 10, expenses: 5, purchases: 3 },
      { sales: 10, expenses: 5, purchases: 3 },
    )
    expect(result.backfill_complete).toBe(true)
    expect(result.total_missing).toBe(0)
    expect(result.missing).toEqual({ sales: 0, expenses: 0, purchases: 0 })
  })

  it('returns complete=true when all counts are zero', () => {
    const result = computeBackfillStatus(
      { sales: 0, expenses: 0, purchases: 0 },
      { sales: 0, expenses: 0, purchases: 0 },
    )
    expect(result.backfill_complete).toBe(true)
    expect(result.total_missing).toBe(0)
  })

  it('returns complete=false and correct missing counts for a partial backfill', () => {
    const result = computeBackfillStatus(
      { sales: 20, expenses: 15, purchases: 8 },
      { sales: 18, expenses: 10, purchases: 8 },
    )
    expect(result.backfill_complete).toBe(false)
    expect(result.missing.sales).toBe(2)
    expect(result.missing.expenses).toBe(5)
    expect(result.missing.purchases).toBe(0)
    expect(result.total_missing).toBe(7)
  })

  it('clamps missing counts to 0 when journaled exceeds operational (no negative values)', () => {
    const result = computeBackfillStatus(
      { sales: 5, expenses: 3, purchases: 0 },
      { sales: 7, expenses: 3, purchases: 1 },  // journaled > operational
    )
    expect(result.missing.sales).toBe(0)
    expect(result.missing.expenses).toBe(0)
    expect(result.missing.purchases).toBe(0)
    expect(result.total_missing).toBe(0)
    expect(result.backfill_complete).toBe(true)
  })

})
