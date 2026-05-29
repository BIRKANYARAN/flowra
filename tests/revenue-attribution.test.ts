/**
 * Tests for pure helper functions in revenue-attribution.service.ts
 *
 * Covers:
 *   - computeTrend: growing, stable, declining, new
 *   - computeConcentrationPct: empty, 1 item, 3+ items
 *   - rankAndSort: descending sort + rank assignment
 *
 * No DB, no Supabase, no HTTP — pure functions only.
 *
 * Run with: npx vitest run tests/revenue-attribution.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  computeTrend,
  computeConcentrationPct,
  rankAndSort,
  type RevenueContributor,
} from '../lib/services/commercial/revenue-attribution.service'

// ─────────────────────────────────────────────────────────────────────────────
// computeTrend
// ─────────────────────────────────────────────────────────────────────────────

describe('computeTrend', () => {
  it('growing: +20% change returns "growing"', () => {
    expect(computeTrend(12000, 10000)).toBe('growing')
  })

  it('growing: exactly +11% returns "growing"', () => {
    expect(computeTrend(11100, 10000)).toBe('growing')
  })

  it('stable: +5% change returns "stable"', () => {
    expect(computeTrend(10500, 10000)).toBe('stable')
  })

  it('stable: 0% change returns "stable"', () => {
    expect(computeTrend(10000, 10000)).toBe('stable')
  })

  it('stable: exactly +10% boundary returns "stable" (not growing)', () => {
    // Exactly 10% is NOT > 10%, so stable
    expect(computeTrend(11000, 10000)).toBe('stable')
  })

  it('declining: -15% change returns "declining"', () => {
    expect(computeTrend(8500, 10000)).toBe('declining')
  })

  it('declining: exactly -11% returns "declining"', () => {
    expect(computeTrend(8900, 10000)).toBe('declining')
  })

  it('new: prior=0 and current>0 returns "new"', () => {
    expect(computeTrend(5000, 0)).toBe('new')
  })

  it('new: prior=0 and current=0 returns "stable" (not new)', () => {
    // Zero current with zero prior → stable (no activity)
    expect(computeTrend(0, 0)).toBe('stable')
  })

  it('stable: exactly -10% boundary returns "stable" (not declining)', () => {
    // Exactly -10% is NOT < -10%, so stable
    expect(computeTrend(9000, 10000)).toBe('stable')
  })

  it('declining: -50% returns "declining"', () => {
    expect(computeTrend(500, 1000)).toBe('declining')
  })

  it('growing: +100% doubles revenue returns "growing"', () => {
    expect(computeTrend(20000, 10000)).toBe('growing')
  })

  it('stable: prior very large, tiny positive change → stable', () => {
    // 10001 / 10000 = +0.01% change — stable
    expect(computeTrend(10001, 10000)).toBe('stable')
  })

  it('declining: current=0 with prior>0 returns "declining"', () => {
    expect(computeTrend(0, 1000)).toBe('declining')
  })

  it('growing: fractional amounts work correctly', () => {
    expect(computeTrend(110.5, 100)).toBe('growing')
  })

  it('stable: -9.9% is within stable range', () => {
    expect(computeTrend(9010, 10000)).toBe('stable')
  })

  it('growing: +10.01% crosses growing threshold', () => {
    expect(computeTrend(11001, 10000)).toBe('growing')
  })

  it('declining: -10.01% crosses declining threshold', () => {
    expect(computeTrend(8999, 10000)).toBe('declining')
  })

  it('new: prior=0 and current=1 returns "new"', () => {
    expect(computeTrend(1, 0)).toBe('new')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeConcentrationPct
// ─────────────────────────────────────────────────────────────────────────────

function makeContributor(overrides: Partial<RevenueContributor>): RevenueContributor {
  return {
    name:                'Test',
    total_try:           10000,
    pct_of_total:        50,
    transaction_count:   5,
    avg_transaction_try: 2000,
    trend:               'stable',
    rank:                1,
    ...overrides,
  }
}

describe('computeConcentrationPct', () => {
  it('empty array returns null', () => {
    expect(computeConcentrationPct([])).toBeNull()
  })

  it('single item: returns that item pct_of_total', () => {
    const contributors = [makeContributor({ pct_of_total: 60 })]
    expect(computeConcentrationPct(contributors)).toBe(60)
  })

  it('three items: sums all three pct_of_total', () => {
    const contributors = [
      makeContributor({ pct_of_total: 40 }),
      makeContributor({ pct_of_total: 30 }),
      makeContributor({ pct_of_total: 20 }),
    ]
    expect(computeConcentrationPct(contributors)).toBe(90)
  })

  it('more than 3 items: only sums top 3', () => {
    const contributors = [
      makeContributor({ pct_of_total: 40 }),
      makeContributor({ pct_of_total: 30 }),
      makeContributor({ pct_of_total: 20 }),
      makeContributor({ pct_of_total: 10 }),
    ]
    // Should sum only first 3 = 90
    expect(computeConcentrationPct(contributors)).toBe(90)
  })

  it('two items: sums both', () => {
    const contributors = [
      makeContributor({ pct_of_total: 60 }),
      makeContributor({ pct_of_total: 40 }),
    ]
    expect(computeConcentrationPct(contributors)).toBe(100)
  })

  it('five items: only sums first 3', () => {
    const contributors = [
      makeContributor({ pct_of_total: 30 }),
      makeContributor({ pct_of_total: 25 }),
      makeContributor({ pct_of_total: 20 }),
      makeContributor({ pct_of_total: 15 }),
      makeContributor({ pct_of_total: 10 }),
    ]
    expect(computeConcentrationPct(contributors)).toBe(75)
  })

  it('with zero pct_of_total items', () => {
    const contributors = [
      makeContributor({ pct_of_total: 0 }),
      makeContributor({ pct_of_total: 0 }),
    ]
    expect(computeConcentrationPct(contributors)).toBe(0)
  })

  it('with fractional pct_of_total', () => {
    const contributors = [
      makeContributor({ pct_of_total: 33.33 }),
      makeContributor({ pct_of_total: 33.33 }),
      makeContributor({ pct_of_total: 33.34 }),
    ]
    const result = computeConcentrationPct(contributors)
    expect(result).toBeCloseTo(100, 0)
  })

  it('does not mutate the input array', () => {
    const contributors = [
      makeContributor({ pct_of_total: 50 }),
      makeContributor({ pct_of_total: 30 }),
      makeContributor({ pct_of_total: 20 }),
    ]
    const originalLength = contributors.length
    computeConcentrationPct(contributors)
    expect(contributors).toHaveLength(originalLength)
  })

  it('single item with 100% returns 100', () => {
    const contributors = [makeContributor({ pct_of_total: 100 })]
    expect(computeConcentrationPct(contributors)).toBe(100)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// rankAndSort
// ─────────────────────────────────────────────────────────────────────────────

type ContributorInput = Omit<RevenueContributor, 'rank'>

function makeInput(name: string, total_try: number): ContributorInput {
  return {
    name,
    total_try,
    pct_of_total:        0,
    transaction_count:   1,
    avg_transaction_try: total_try,
    trend:               'stable',
  }
}

describe('rankAndSort', () => {
  it('sorts descending by total_try', () => {
    const input = [
      makeInput('C', 1000),
      makeInput('A', 5000),
      makeInput('B', 3000),
    ]
    const result = rankAndSort(input)
    expect(result.map(r => r.name)).toEqual(['A', 'B', 'C'])
  })

  it('assigns rank 1 to highest contributor', () => {
    const input = [makeInput('A', 5000), makeInput('B', 3000)]
    const result = rankAndSort(input)
    expect(result[0].rank).toBe(1)
    expect(result[0].name).toBe('A')
  })

  it('assigns sequential ranks 1, 2, 3', () => {
    const input = [
      makeInput('Z', 100),
      makeInput('X', 500),
      makeInput('Y', 300),
    ]
    const result = rankAndSort(input)
    expect(result[0].rank).toBe(1)
    expect(result[1].rank).toBe(2)
    expect(result[2].rank).toBe(3)
  })

  it('does not mutate the original array', () => {
    const input = [makeInput('A', 1000), makeInput('B', 5000)]
    const originalOrder = input.map(i => i.name)
    rankAndSort(input)
    expect(input.map(i => i.name)).toEqual(originalOrder)
  })

  it('handles single item with rank 1', () => {
    const result = rankAndSort([makeInput('Solo', 9999)])
    expect(result).toHaveLength(1)
    expect(result[0].rank).toBe(1)
  })

  it('handles empty array', () => {
    expect(rankAndSort([])).toEqual([])
  })

  it('preserves all other fields from input', () => {
    const input = [{
      name: 'Test',
      total_try: 5000,
      pct_of_total: 25.5,
      transaction_count: 10,
      avg_transaction_try: 500,
      trend: 'growing' as const,
    }]
    const result = rankAndSort(input)
    expect(result[0].pct_of_total).toBe(25.5)
    expect(result[0].transaction_count).toBe(10)
    expect(result[0].trend).toBe('growing')
  })

  it('handles equal total_try values — both get sequential ranks', () => {
    const input = [
      makeInput('A', 1000),
      makeInput('B', 1000),
    ]
    const result = rankAndSort(input)
    expect(result[0].rank).toBe(1)
    expect(result[1].rank).toBe(2)
  })

  it('handles many contributors ranked correctly', () => {
    const input = Array.from({ length: 10 }, (_, i) => makeInput(`C${i}`, (10 - i) * 1000))
    const result = rankAndSort(input)
    expect(result[0].total_try).toBe(10000)
    expect(result[9].total_try).toBe(1000)
    result.forEach((r, i) => expect(r.rank).toBe(i + 1))
  })

  it('handles zero total_try — placed at end', () => {
    const input = [makeInput('Big', 5000), makeInput('Zero', 0)]
    const result = rankAndSort(input)
    expect(result[0].name).toBe('Big')
    expect(result[1].name).toBe('Zero')
  })

  it('returns a new array, not the same reference', () => {
    const input = [makeInput('A', 1000)]
    const result = rankAndSort(input)
    expect(result).not.toBe(input)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeTrend — large value and precision edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe('computeTrend — large values and precision', () => {
  it('very large values: current=1_000_000, prior=500_000 → growing (+100%)', () => {
    expect(computeTrend(1_000_000, 500_000)).toBe('growing')
  })

  it('very large values: current=500_000, prior=1_000_000 → declining (-50%)', () => {
    expect(computeTrend(500_000, 1_000_000)).toBe('declining')
  })

  it('prior = 1 (minimal base): current=2 → growing (+100%)', () => {
    expect(computeTrend(2, 1)).toBe('growing')
  })

  it('prior = 1000, current = 1001 → stable (only +0.1% change)', () => {
    expect(computeTrend(1001, 1000)).toBe('stable')
  })

  it('prior = 1000, current = 899 → declining (-10.1%)', () => {
    expect(computeTrend(899, 1000)).toBe('declining')
  })

  it('prior = 1000, current = 1101 → growing (+10.1%)', () => {
    expect(computeTrend(1101, 1000)).toBe('growing')
  })

  it('negative current revenue is treated as decline (edge case)', () => {
    // Negative revenue is unusual but the math should handle it
    // -100 vs 1000 = -110% → declining
    expect(computeTrend(-100, 1000)).toBe('declining')
  })

  it('both prior and current = 1 → stable (0% change)', () => {
    expect(computeTrend(1, 1)).toBe('stable')
  })

  it('fractional precision: 10.0001% → growing', () => {
    // 10000.01 / 10000 = +0.0001% above 10% threshold
    expect(computeTrend(11000.01, 10000)).toBe('growing')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeConcentrationPct — edge cases and large inputs
// ─────────────────────────────────────────────────────────────────────────────

describe('computeConcentrationPct — additional edge cases', () => {
  it('all zero pct_of_total with many items returns 0', () => {
    const contributors = Array.from({ length: 10 }, () => makeContributor({ pct_of_total: 0 }))
    expect(computeConcentrationPct(contributors)).toBe(0)
  })

  it('three items with pct 0, 0, 100 → sum is 100', () => {
    const contributors = [
      makeContributor({ pct_of_total: 0 }),
      makeContributor({ pct_of_total: 0 }),
      makeContributor({ pct_of_total: 100 }),
    ]
    expect(computeConcentrationPct(contributors)).toBe(100)
  })

  it('10 items: only sums first 3 regardless of count', () => {
    const contributors = Array.from({ length: 10 }, (_, i) =>
      makeContributor({ pct_of_total: 10 })
    )
    expect(computeConcentrationPct(contributors)).toBe(30)
  })

  it('result is non-negative for non-negative inputs', () => {
    const contributors = [
      makeContributor({ pct_of_total: 50 }),
      makeContributor({ pct_of_total: 30 }),
      makeContributor({ pct_of_total: 20 }),
    ]
    const result = computeConcentrationPct(contributors)
    expect(result).toBeGreaterThanOrEqual(0)
  })

  it('does not throw for array with exactly 3 items', () => {
    const contributors = [
      makeContributor({ pct_of_total: 33 }),
      makeContributor({ pct_of_total: 33 }),
      makeContributor({ pct_of_total: 34 }),
    ]
    expect(() => computeConcentrationPct(contributors)).not.toThrow()
  })

  it('order matters: slices first 3, not highest 3', () => {
    // If array is pre-sorted descending (as rankAndSort would do), first 3 are top 3
    const contributors = [
      makeContributor({ pct_of_total: 40 }),
      makeContributor({ pct_of_total: 30 }),
      makeContributor({ pct_of_total: 20 }),
      makeContributor({ pct_of_total: 5 }),
      makeContributor({ pct_of_total: 5 }),
    ]
    // Slices first 3: 40 + 30 + 20 = 90
    expect(computeConcentrationPct(contributors)).toBe(90)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// rankAndSort — comprehensive sorting
// ─────────────────────────────────────────────────────────────────────────────

describe('rankAndSort — comprehensive sorting', () => {
  it('already sorted descending remains correct', () => {
    const input = [
      makeInput('A', 5000),
      makeInput('B', 3000),
      makeInput('C', 1000),
    ]
    const result = rankAndSort(input)
    expect(result[0].name).toBe('A')
    expect(result[1].name).toBe('B')
    expect(result[2].name).toBe('C')
  })

  it('reverse-sorted input gets correctly reordered', () => {
    const input = [
      makeInput('C', 1000),
      makeInput('B', 3000),
      makeInput('A', 5000),
    ]
    const result = rankAndSort(input)
    expect(result[0].name).toBe('A')
    expect(result[2].name).toBe('C')
  })

  it('all ranks are consecutive positive integers starting from 1', () => {
    const input = [makeInput('A', 9000), makeInput('B', 6000), makeInput('C', 3000), makeInput('D', 1000)]
    const result = rankAndSort(input)
    result.forEach((r, i) => {
      expect(r.rank).toBe(i + 1)
      expect(r.rank).toBeGreaterThan(0)
    })
  })

  it('single very large total_try item has rank 1', () => {
    const input = [makeInput('Big', Number.MAX_SAFE_INTEGER)]
    const result = rankAndSort(input)
    expect(result[0].rank).toBe(1)
    expect(result[0].total_try).toBe(Number.MAX_SAFE_INTEGER)
  })

  it('avg_transaction_try is preserved in output', () => {
    const input = [{
      name: 'Test',
      total_try: 10000,
      pct_of_total: 50,
      transaction_count: 4,
      avg_transaction_try: 2500 as number | null,
      trend: 'stable' as const,
    }]
    const result = rankAndSort(input)
    expect(result[0].avg_transaction_try).toBe(2500)
  })

  it('null avg_transaction_try is preserved', () => {
    const input = [{
      name: 'No Avg',
      total_try: 5000,
      pct_of_total: 100,
      transaction_count: 0,
      avg_transaction_try: null as number | null,
      trend: 'stable' as const,
    }]
    const result = rankAndSort(input)
    expect(result[0].avg_transaction_try).toBeNull()
  })

  it('ties: both items with same total_try get different ranks', () => {
    const input = [makeInput('X', 5000), makeInput('Y', 5000), makeInput('Z', 5000)]
    const result = rankAndSort(input)
    const ranks = result.map(r => r.rank)
    expect(new Set(ranks).size).toBe(3)  // all unique ranks
    expect(ranks).toContain(1)
    expect(ranks).toContain(2)
    expect(ranks).toContain(3)
  })

  it('trend value is correctly preserved through sort', () => {
    const input = [
      { name: 'G', total_try: 2000, pct_of_total: 20, transaction_count: 5, avg_transaction_try: 400, trend: 'growing' as const },
      { name: 'D', total_try: 1000, pct_of_total: 10, transaction_count: 3, avg_transaction_try: 333, trend: 'declining' as const },
    ]
    const result = rankAndSort(input)
    expect(result[0].trend).toBe('growing')
    expect(result[1].trend).toBe('declining')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeTrend — boundary values for all 4 types
// ─────────────────────────────────────────────────────────────────────────────

describe('computeTrend — boundary value tests', () => {
  // new: prior=0 and current>0
  it('new: prior=0, current=1 → "new" (minimum nonzero current)', () => {
    expect(computeTrend(1, 0)).toBe('new')
  })

  it('new: prior=0, current=999999 → "new"', () => {
    expect(computeTrend(999_999, 0)).toBe('new')
  })

  // growing: changePct > 10 (strictly)
  it('growing: +10.001% → "growing" (just above boundary)', () => {
    // 10001/10000 - 1 = 0.01% → wait, that's 0.01
    // To get just above 10%: prior=10000, current=11001 → 10.01%
    expect(computeTrend(11001, 10000)).toBe('growing')
  })

  it('growing boundary: +10% exactly → "stable" (not growing)', () => {
    expect(computeTrend(11000, 10000)).toBe('stable')
  })

  // declining: changePct < -10 (strictly)
  it('declining: -10.001% → "declining" (just below boundary)', () => {
    // prior=10000, current=8999 → (8999-10000)/10000*100 = -10.01%
    expect(computeTrend(8999, 10000)).toBe('declining')
  })

  it('declining boundary: -10% exactly → "stable" (not declining)', () => {
    expect(computeTrend(9000, 10000)).toBe('stable')
  })

  // stable: various cases in the middle band
  it('stable: -9.99% → "stable"', () => {
    // prior=10000, current=9001 → -9.99%
    expect(computeTrend(9001, 10000)).toBe('stable')
  })

  it('stable: +9.99% → "stable"', () => {
    // prior=10000, current=10999 → +9.99%
    expect(computeTrend(10999, 10000)).toBe('stable')
  })

  // Edge: prior=0, current=0 → stable
  it('stable: both 0 → "stable"', () => {
    expect(computeTrend(0, 0)).toBe('stable')
  })

  // Large values
  it('growing: large numbers +50% → "growing"', () => {
    expect(computeTrend(1_500_000, 1_000_000)).toBe('growing')
  })

  it('declining: nearly to zero → "declining"', () => {
    expect(computeTrend(1, 10000)).toBe('declining')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeConcentrationPct — all edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe('computeConcentrationPct — edge cases', () => {
  function makeContributor(name: string, pct: number): RevenueContributor {
    return { name, total_try: pct * 100, pct_of_total: pct, transaction_count: 1, avg_transaction_try: pct * 100, trend: 'stable', rank: 1 }
  }

  it('empty array → null', () => {
    expect(computeConcentrationPct([])).toBeNull()
  })

  it('1 item → returns that item pct_of_total', () => {
    const result = computeConcentrationPct([makeContributor('A', 60)])
    expect(result).toBe(60)
  })

  it('exactly 3 items → sum of all 3 pct_of_total', () => {
    const result = computeConcentrationPct([
      makeContributor('A', 40),
      makeContributor('B', 30),
      makeContributor('C', 20),
    ])
    expect(result).toBe(90)
  })

  it('more than 3 items → only slices first 3', () => {
    const result = computeConcentrationPct([
      makeContributor('A', 40),
      makeContributor('B', 30),
      makeContributor('C', 20),
      makeContributor('D', 10), // should be ignored
    ])
    expect(result).toBe(90)
  })

  it('2 items → sum of both', () => {
    const result = computeConcentrationPct([
      makeContributor('A', 55),
      makeContributor('B', 25),
    ])
    expect(result).toBe(80)
  })

  it('concentration of 100% → returns 100', () => {
    const result = computeConcentrationPct([makeContributor('A', 100)])
    expect(result).toBe(100)
  })

  it('zero pct items → returns 0', () => {
    const result = computeConcentrationPct([
      makeContributor('A', 0),
      makeContributor('B', 0),
      makeContributor('C', 0),
    ])
    expect(result).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// rankAndSort — additional edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe('rankAndSort — additional edge cases', () => {
  function makeInput(name: string, total: number): Omit<RevenueContributor, 'rank'> {
    return { name, total_try: total, pct_of_total: 10, transaction_count: 1, avg_transaction_try: total, trend: 'stable' }
  }

  it('single item gets rank 1', () => {
    const result = rankAndSort([makeInput('Solo', 5000)])
    expect(result).toHaveLength(1)
    expect(result[0].rank).toBe(1)
    expect(result[0].name).toBe('Solo')
  })

  it('empty array returns empty array', () => {
    const result = rankAndSort([])
    expect(result).toHaveLength(0)
  })

  it('descending order: highest total_try gets rank 1', () => {
    const input = [
      makeInput('Low',  1000),
      makeInput('High', 9000),
      makeInput('Mid',  5000),
    ]
    const result = rankAndSort(input)
    expect(result[0].name).toBe('High')
    expect(result[0].rank).toBe(1)
    expect(result[1].name).toBe('Mid')
    expect(result[1].rank).toBe(2)
    expect(result[2].name).toBe('Low')
    expect(result[2].rank).toBe(3)
  })

  it('equal revenues: both get unique sequential ranks', () => {
    const input = [makeInput('A', 5000), makeInput('B', 5000)]
    const result = rankAndSort(input)
    const ranks = result.map(r => r.rank).sort()
    expect(ranks).toEqual([1, 2])
  })

  it('ranks are always 1-indexed and sequential', () => {
    const input = [
      makeInput('A', 100),
      makeInput('B', 200),
      makeInput('C', 300),
      makeInput('D', 400),
    ]
    const result = rankAndSort(input)
    const ranks = result.map(r => r.rank).sort((a, b) => a - b)
    expect(ranks).toEqual([1, 2, 3, 4])
  })

  it('does not mutate input array', () => {
    const input = [makeInput('A', 1000), makeInput('B', 9000)]
    const inputCopy = [...input]
    rankAndSort(input)
    expect(input[0].name).toBe(inputCopy[0].name)
    expect(input[1].name).toBe(inputCopy[1].name)
  })

  it('zero total_try items sort after nonzero items', () => {
    const input = [makeInput('Zero', 0), makeInput('Positive', 5000)]
    const result = rankAndSort(input)
    expect(result[0].name).toBe('Positive')
    expect(result[0].rank).toBe(1)
    expect(result[1].name).toBe('Zero')
    expect(result[1].rank).toBe(2)
  })
})
