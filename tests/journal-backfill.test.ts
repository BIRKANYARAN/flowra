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

describe('computeBackfillStatus — single category missing', () => {
  it('only sales missing, expenses and purchases complete', () => {
    const result = computeBackfillStatus(
      { sales: 15, expenses: 5, purchases: 3 },
      { sales: 10, expenses: 5, purchases: 3 },
    )
    expect(result.missing.sales).toBe(5)
    expect(result.missing.expenses).toBe(0)
    expect(result.missing.purchases).toBe(0)
    expect(result.total_missing).toBe(5)
    expect(result.backfill_complete).toBe(false)
  })

  it('only sales missing by 1', () => {
    const result = computeBackfillStatus(
      { sales: 100, expenses: 50, purchases: 25 },
      { sales: 99, expenses: 50, purchases: 25 },
    )
    expect(result.missing.sales).toBe(1)
    expect(result.missing.expenses).toBe(0)
    expect(result.missing.purchases).toBe(0)
    expect(result.total_missing).toBe(1)
    expect(result.backfill_complete).toBe(false)
  })
})

describe('computeBackfillStatus — only expenses missing', () => {
  it('expenses 10 operational, journaled 3 → missing.expenses = 7', () => {
    const result = computeBackfillStatus(
      { sales: 5, expenses: 10, purchases: 4 },
      { sales: 5, expenses: 3,  purchases: 4 },
    )
    expect(result.missing.expenses).toBe(7)
    expect(result.missing.sales).toBe(0)
    expect(result.missing.purchases).toBe(0)
    expect(result.total_missing).toBe(7)
    expect(result.backfill_complete).toBe(false)
  })

  it('expenses 20 operational, journaled 0 → missing.expenses = 20', () => {
    const result = computeBackfillStatus(
      { sales: 0, expenses: 20, purchases: 0 },
      { sales: 0, expenses: 0,  purchases: 0 },
    )
    expect(result.missing.expenses).toBe(20)
    expect(result.total_missing).toBe(20)
    expect(result.backfill_complete).toBe(false)
  })
})

describe('computeBackfillStatus — only purchases missing', () => {
  it('purchases 100 operational, journaled 0 → missing.purchases = 100', () => {
    const result = computeBackfillStatus(
      { sales: 0, expenses: 0, purchases: 100 },
      { sales: 0, expenses: 0, purchases: 0   },
    )
    expect(result.missing.purchases).toBe(100)
    expect(result.missing.sales).toBe(0)
    expect(result.missing.expenses).toBe(0)
    expect(result.total_missing).toBe(100)
    expect(result.backfill_complete).toBe(false)
  })

  it('purchases 50 operational, journaled 49 → missing.purchases = 1', () => {
    const result = computeBackfillStatus(
      { sales: 10, expenses: 5, purchases: 50 },
      { sales: 10, expenses: 5, purchases: 49 },
    )
    expect(result.missing.purchases).toBe(1)
    expect(result.total_missing).toBe(1)
  })
})

describe('computeBackfillStatus — large numbers', () => {
  it('operational=10000, journaled=9999 per category → total_missing = 3', () => {
    const result = computeBackfillStatus(
      { sales: 10000, expenses: 10000, purchases: 10000 },
      { sales: 9999,  expenses: 9999,  purchases: 9999  },
    )
    expect(result.missing.sales).toBe(1)
    expect(result.missing.expenses).toBe(1)
    expect(result.missing.purchases).toBe(1)
    expect(result.total_missing).toBe(3)
    expect(result.backfill_complete).toBe(false)
  })

  it('very large numbers with no missing', () => {
    const result = computeBackfillStatus(
      { sales: 999999, expenses: 888888, purchases: 777777 },
      { sales: 999999, expenses: 888888, purchases: 777777 },
    )
    expect(result.total_missing).toBe(0)
    expect(result.backfill_complete).toBe(true)
  })

  it('large numbers — only sales missing', () => {
    const result = computeBackfillStatus(
      { sales: 50000, expenses: 20000, purchases: 10000 },
      { sales: 45000, expenses: 20000, purchases: 10000 },
    )
    expect(result.missing.sales).toBe(5000)
    expect(result.total_missing).toBe(5000)
  })
})

describe('computeBackfillStatus — exact totals', () => {
  it('total_missing equals sum of individual missing values', () => {
    const result = computeBackfillStatus(
      { sales: 30, expenses: 20, purchases: 10 },
      { sales: 25, expenses: 15, purchases: 7  },
    )
    const expectedTotal = result.missing.sales + result.missing.expenses + result.missing.purchases
    expect(result.total_missing).toBe(expectedTotal)
  })

  it('total_missing is 0 when all categories are 0', () => {
    const result = computeBackfillStatus(
      { sales: 0, expenses: 0, purchases: 0 },
      { sales: 0, expenses: 0, purchases: 0 },
    )
    const expectedTotal = result.missing.sales + result.missing.expenses + result.missing.purchases
    expect(result.total_missing).toBe(expectedTotal)
    expect(result.total_missing).toBe(0)
  })

  it('total_missing is always non-negative', () => {
    const result = computeBackfillStatus(
      { sales: 5, expenses: 3, purchases: 1 },
      { sales: 100, expenses: 100, purchases: 100 },
    )
    expect(result.total_missing).toBeGreaterThanOrEqual(0)
  })
})

describe('computeBackfillStatus — all complete (different values)', () => {
  it('all categories complete with large equal values', () => {
    const result = computeBackfillStatus(
      { sales: 500, expenses: 300, purchases: 200 },
      { sales: 500, expenses: 300, purchases: 200 },
    )
    expect(result.backfill_complete).toBe(true)
    expect(result.total_missing).toBe(0)
    expect(result.missing).toEqual({ sales: 0, expenses: 0, purchases: 0 })
  })

  it('all complete when journaled exceeds operational in all categories', () => {
    const result = computeBackfillStatus(
      { sales: 10, expenses: 10, purchases: 10 },
      { sales: 20, expenses: 30, purchases: 40 },
    )
    expect(result.backfill_complete).toBe(true)
    expect(result.total_missing).toBe(0)
  })
})

describe('computeBackfillStatus — overflow clamping', () => {
  it('all journaled >> operational → all missing = 0', () => {
    const result = computeBackfillStatus(
      { sales: 1, expenses: 1, purchases: 1 },
      { sales: 1000, expenses: 1000, purchases: 1000 },
    )
    expect(result.missing.sales).toBe(0)
    expect(result.missing.expenses).toBe(0)
    expect(result.missing.purchases).toBe(0)
    expect(result.total_missing).toBe(0)
    expect(result.backfill_complete).toBe(true)
  })

  it('journaled 10x operational → no missing', () => {
    const result = computeBackfillStatus(
      { sales: 5, expenses: 3, purchases: 2 },
      { sales: 50, expenses: 30, purchases: 20 },
    )
    expect(result.total_missing).toBe(0)
    expect(result.backfill_complete).toBe(true)
  })
})

describe('computeBackfillStatus — partial coverage', () => {
  it('sales 50% journaled, expenses 0%, purchases 100%', () => {
    const result = computeBackfillStatus(
      { sales: 100, expenses: 50, purchases: 30 },
      { sales: 50,  expenses: 0,  purchases: 30 },
    )
    expect(result.missing.sales).toBe(50)
    expect(result.missing.expenses).toBe(50)
    expect(result.missing.purchases).toBe(0)
    expect(result.total_missing).toBe(100)
    expect(result.backfill_complete).toBe(false)
  })

  it('25% journaled across all categories', () => {
    const result = computeBackfillStatus(
      { sales: 100, expenses: 100, purchases: 100 },
      { sales: 25,  expenses: 25,  purchases: 25  },
    )
    expect(result.missing.sales).toBe(75)
    expect(result.missing.expenses).toBe(75)
    expect(result.missing.purchases).toBe(75)
    expect(result.total_missing).toBe(225)
  })

  it('75% journaled across all categories', () => {
    const result = computeBackfillStatus(
      { sales: 200, expenses: 200, purchases: 200 },
      { sales: 150, expenses: 150, purchases: 150 },
    )
    expect(result.missing.sales).toBe(50)
    expect(result.missing.expenses).toBe(50)
    expect(result.missing.purchases).toBe(50)
    expect(result.total_missing).toBe(150)
    expect(result.backfill_complete).toBe(false)
  })
})

describe('computeBackfillStatus — return type shape', () => {
  it('result has backfill_complete boolean', () => {
    const result = computeBackfillStatus(
      { sales: 5, expenses: 3, purchases: 2 },
      { sales: 5, expenses: 3, purchases: 2 },
    )
    expect(typeof result.backfill_complete).toBe('boolean')
  })

  it('result has total_missing number', () => {
    const result = computeBackfillStatus(
      { sales: 5, expenses: 3, purchases: 2 },
      { sales: 5, expenses: 3, purchases: 2 },
    )
    expect(typeof result.total_missing).toBe('number')
  })

  it('result.missing has sales property', () => {
    const result = computeBackfillStatus(
      { sales: 5, expenses: 3, purchases: 2 },
      { sales: 5, expenses: 3, purchases: 2 },
    )
    expect('sales' in result.missing).toBe(true)
  })

  it('result.missing has expenses property', () => {
    const result = computeBackfillStatus(
      { sales: 5, expenses: 3, purchases: 2 },
      { sales: 5, expenses: 3, purchases: 2 },
    )
    expect('expenses' in result.missing).toBe(true)
  })

  it('result.missing has purchases property', () => {
    const result = computeBackfillStatus(
      { sales: 5, expenses: 3, purchases: 2 },
      { sales: 5, expenses: 3, purchases: 2 },
    )
    expect('purchases' in result.missing).toBe(true)
  })

  it('all missing values are non-negative integers', () => {
    const result = computeBackfillStatus(
      { sales: 10, expenses: 5, purchases: 3 },
      { sales: 3,  expenses: 5, purchases: 7 },
    )
    expect(result.missing.sales).toBeGreaterThanOrEqual(0)
    expect(result.missing.expenses).toBeGreaterThanOrEqual(0)
    expect(result.missing.purchases).toBeGreaterThanOrEqual(0)
  })
})

describe('computeBackfillStatus — backfill_complete logic', () => {
  it('backfill_complete is false when any single category is missing 1', () => {
    const cases = [
      { sales: 1, expenses: 0, purchases: 0 },
      { sales: 0, expenses: 1, purchases: 0 },
      { sales: 0, expenses: 0, purchases: 1 },
    ]
    for (const missing of cases) {
      const op = { sales: 5, expenses: 5, purchases: 5 }
      const j = {
        sales:     5 - missing.sales,
        expenses:  5 - missing.expenses,
        purchases: 5 - missing.purchases,
      }
      const result = computeBackfillStatus(op, j)
      expect(result.backfill_complete).toBe(false)
    }
  })

  it('backfill_complete transitions from false to true as journaled catches up', () => {
    const operational = { sales: 10, expenses: 10, purchases: 10 }

    const partial = computeBackfillStatus(operational, { sales: 9, expenses: 10, purchases: 10 })
    expect(partial.backfill_complete).toBe(false)

    const complete = computeBackfillStatus(operational, { sales: 10, expenses: 10, purchases: 10 })
    expect(complete.backfill_complete).toBe(true)
  })

  it('total_missing is 0 only when backfill_complete is true', () => {
    const result = computeBackfillStatus(
      { sales: 5, expenses: 5, purchases: 5 },
      { sales: 5, expenses: 5, purchases: 5 },
    )
    expect(result.total_missing === 0).toBe(result.backfill_complete)
  })

  it('total_missing > 0 only when backfill_complete is false', () => {
    const result = computeBackfillStatus(
      { sales: 5, expenses: 5, purchases: 5 },
      { sales: 4, expenses: 5, purchases: 5 },
    )
    expect(result.total_missing > 0).toBe(!result.backfill_complete)
  })
})

describe('computeBackfillStatus — idempotency', () => {
  it('calling twice with same args returns same result', () => {
    const op = { sales: 50, expenses: 30, purchases: 20 }
    const j  = { sales: 45, expenses: 28, purchases: 20 }
    const r1 = computeBackfillStatus(op, j)
    const r2 = computeBackfillStatus(op, j)
    expect(r1.backfill_complete).toBe(r2.backfill_complete)
    expect(r1.total_missing).toBe(r2.total_missing)
    expect(r1.missing).toEqual(r2.missing)
  })

  it('does not mutate input objects', () => {
    const op = { sales: 10, expenses: 5, purchases: 3 }
    const j  = { sales: 8,  expenses: 5, purchases: 3 }
    const opCopy = { ...op }
    const jCopy  = { ...j }
    computeBackfillStatus(op, j)
    expect(op).toEqual(opCopy)
    expect(j).toEqual(jCopy)
  })
})

describe('computeBackfillStatus — boundary values', () => {
  it('operational=1, journaled=0 → missing=1 per category', () => {
    const result = computeBackfillStatus(
      { sales: 1, expenses: 1, purchases: 1 },
      { sales: 0, expenses: 0, purchases: 0 },
    )
    expect(result.missing.sales).toBe(1)
    expect(result.missing.expenses).toBe(1)
    expect(result.missing.purchases).toBe(1)
    expect(result.total_missing).toBe(3)
  })

  it('operational=0, journaled=1 → all missing=0 (clamped)', () => {
    const result = computeBackfillStatus(
      { sales: 0, expenses: 0, purchases: 0 },
      { sales: 1, expenses: 1, purchases: 1 },
    )
    expect(result.missing.sales).toBe(0)
    expect(result.missing.expenses).toBe(0)
    expect(result.missing.purchases).toBe(0)
    expect(result.total_missing).toBe(0)
    expect(result.backfill_complete).toBe(true)
  })

  it('only sales=1 difference, all others equal', () => {
    const result = computeBackfillStatus(
      { sales: 1, expenses: 5, purchases: 5 },
      { sales: 0, expenses: 5, purchases: 5 },
    )
    expect(result.missing.sales).toBe(1)
    expect(result.total_missing).toBe(1)
    expect(result.backfill_complete).toBe(false)
  })

  it('only expenses=1 difference, all others equal', () => {
    const result = computeBackfillStatus(
      { sales: 5, expenses: 1, purchases: 5 },
      { sales: 5, expenses: 0, purchases: 5 },
    )
    expect(result.missing.expenses).toBe(1)
    expect(result.total_missing).toBe(1)
    expect(result.backfill_complete).toBe(false)
  })

  it('only purchases=1 difference, all others equal', () => {
    const result = computeBackfillStatus(
      { sales: 5, expenses: 5, purchases: 1 },
      { sales: 5, expenses: 5, purchases: 0 },
    )
    expect(result.missing.purchases).toBe(1)
    expect(result.total_missing).toBe(1)
    expect(result.backfill_complete).toBe(false)
  })
})

describe('computeBackfillStatus — real-world scenarios', () => {
  it('year-end audit: most journaled, few missing', () => {
    const result = computeBackfillStatus(
      { sales: 1200, expenses: 800, purchases: 400 },
      { sales: 1198, expenses: 799, purchases: 400 },
    )
    expect(result.missing.sales).toBe(2)
    expect(result.missing.expenses).toBe(1)
    expect(result.missing.purchases).toBe(0)
    expect(result.total_missing).toBe(3)
    expect(result.backfill_complete).toBe(false)
  })

  it('fresh company: nothing journaled yet', () => {
    const result = computeBackfillStatus(
      { sales: 50, expenses: 20, purchases: 10 },
      { sales: 0,  expenses: 0,  purchases: 0  },
    )
    expect(result.total_missing).toBe(80)
    expect(result.backfill_complete).toBe(false)
  })

  it('migration complete: all operational records journaled', () => {
    const result = computeBackfillStatus(
      { sales: 4500, expenses: 2200, purchases: 850 },
      { sales: 4500, expenses: 2200, purchases: 850 },
    )
    expect(result.backfill_complete).toBe(true)
    expect(result.total_missing).toBe(0)
  })
})

describe('computeBackfillStatus — missing values add up correctly', () => {
  it('sales 10 missing, expenses 5 missing, purchases 3 missing = 18 total', () => {
    const result = computeBackfillStatus(
      { sales: 20, expenses: 15, purchases: 10 },
      { sales: 10, expenses: 10, purchases: 7  },
    )
    expect(result.missing.sales).toBe(10)
    expect(result.missing.expenses).toBe(5)
    expect(result.missing.purchases).toBe(3)
    expect(result.total_missing).toBe(18)
  })

  it('large asymmetric missing counts', () => {
    const result = computeBackfillStatus(
      { sales: 5000, expenses: 100, purchases: 20 },
      { sales: 1000, expenses: 100, purchases: 10 },
    )
    expect(result.missing.sales).toBe(4000)
    expect(result.missing.expenses).toBe(0)
    expect(result.missing.purchases).toBe(10)
    expect(result.total_missing).toBe(4010)
  })

  it('total_missing = 0 is the only condition for backfill_complete=true', () => {
    const completeResult = computeBackfillStatus(
      { sales: 10, expenses: 10, purchases: 10 },
      { sales: 10, expenses: 10, purchases: 10 },
    )
    expect(completeResult.total_missing).toBe(0)
    expect(completeResult.backfill_complete).toBe(true)
  })

  it('total_missing equals exact arithmetic sum', () => {
    const result = computeBackfillStatus(
      { sales: 100, expenses: 50, purchases: 25 },
      { sales: 97,  expenses: 44, purchases: 21 },
    )
    const expected = (100 - 97) + (50 - 44) + (25 - 21)
    expect(result.total_missing).toBe(expected)
  })
})

describe('computeBackfillStatus — progressive journaling simulation', () => {
  it('step 1: nothing journaled yet', () => {
    const r = computeBackfillStatus(
      { sales: 100, expenses: 50, purchases: 30 },
      { sales: 0, expenses: 0, purchases: 0 },
    )
    expect(r.total_missing).toBe(180)
    expect(r.backfill_complete).toBe(false)
  })

  it('step 2: half journaled', () => {
    const r = computeBackfillStatus(
      { sales: 100, expenses: 50, purchases: 30 },
      { sales: 50, expenses: 25, purchases: 15 },
    )
    expect(r.total_missing).toBe(90)
    expect(r.backfill_complete).toBe(false)
  })

  it('step 3: nearly complete (1 missing)', () => {
    const r = computeBackfillStatus(
      { sales: 100, expenses: 50, purchases: 30 },
      { sales: 99, expenses: 50, purchases: 30 },
    )
    expect(r.total_missing).toBe(1)
    expect(r.backfill_complete).toBe(false)
  })

  it('step 4: fully journaled', () => {
    const r = computeBackfillStatus(
      { sales: 100, expenses: 50, purchases: 30 },
      { sales: 100, expenses: 50, purchases: 30 },
    )
    expect(r.total_missing).toBe(0)
    expect(r.backfill_complete).toBe(true)
  })
})

describe('computeBackfillStatus — purchases specific edge cases', () => {
  it('purchases zero in both → no missing', () => {
    const r = computeBackfillStatus(
      { sales: 10, expenses: 5, purchases: 0 },
      { sales: 10, expenses: 5, purchases: 0 },
    )
    expect(r.missing.purchases).toBe(0)
    expect(r.backfill_complete).toBe(true)
  })

  it('purchases only category with data', () => {
    const r = computeBackfillStatus(
      { sales: 0, expenses: 0, purchases: 50 },
      { sales: 0, expenses: 0, purchases: 40 },
    )
    expect(r.missing.purchases).toBe(10)
    expect(r.total_missing).toBe(10)
    expect(r.backfill_complete).toBe(false)
  })

  it('expenses only category with data', () => {
    const r = computeBackfillStatus(
      { sales: 0, expenses: 30, purchases: 0 },
      { sales: 0, expenses: 20, purchases: 0 },
    )
    expect(r.missing.expenses).toBe(10)
    expect(r.total_missing).toBe(10)
    expect(r.backfill_complete).toBe(false)
  })
})

describe('computeBackfillStatus — stress tests', () => {
  it('100 calls with same args produce same result', () => {
    const op = { sales: 500, expenses: 300, purchases: 100 }
    const j  = { sales: 450, expenses: 300, purchases: 95  }
    for (let i = 0; i < 100; i++) {
      const r = computeBackfillStatus(op, j)
      expect(r.missing.sales).toBe(50)
      expect(r.missing.expenses).toBe(0)
      expect(r.missing.purchases).toBe(5)
      expect(r.total_missing).toBe(55)
    }
  })

  it('sequential different inputs produce correct independent results', () => {
    const cases = [
      { op: { sales: 10, expenses: 5, purchases: 3 }, j: { sales: 10, expenses: 5, purchases: 3 }, total: 0 },
      { op: { sales: 10, expenses: 5, purchases: 3 }, j: { sales: 9,  expenses: 5, purchases: 3 }, total: 1 },
      { op: { sales: 10, expenses: 5, purchases: 3 }, j: { sales: 8,  expenses: 4, purchases: 3 }, total: 3 },
    ]
    for (const c of cases) {
      const r = computeBackfillStatus(c.op, c.j)
      expect(r.total_missing).toBe(c.total)
    }
  })
})
