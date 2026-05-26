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
})
