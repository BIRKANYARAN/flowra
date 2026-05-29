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
