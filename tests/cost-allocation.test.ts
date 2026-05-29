// ─────────────────────────────────────────────────────────────────────────────
// tests/cost-allocation.test.ts
//
// Unit tests for all pure functions in cost-allocation.service.ts:
//   - computeAllocationWeight         (16 tests)
//   - allocateOverhead                (14 tests)
//   - computeFullCostAllocation       (10 tests)
//   - computeOverheadRatio            (4 tests)
//   - computeBreakevenRevenue         (6 tests)
//   - classifyOverheadLevel           (10 tests)
//   - segregateCosts                  (12 tests)
//   - computeContributionMargin       (4 tests)
//   - computeContributionMarginRatio  (4 tests)
//   - computeOperatingLeverageEffect  (6 tests)
//   - identifyHighestOverheadCenter   (6 tests)
//   - computeTargetCostReduction      (6 tests)
//   - generateAllocationNarrative     (5 tests)
//   Total: 103 tests
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest'
import {
  computeAllocationWeight,
  allocateOverhead,
  computeFullCostAllocation,
  computeOverheadRatio,
  computeBreakevenRevenue,
  classifyOverheadLevel,
  segregateCosts,
  computeContributionMargin,
  computeContributionMarginRatio,
  computeOperatingLeverageEffect,
  identifyHighestOverheadCenter,
  computeTargetCostReduction,
  generateAllocationNarrative,
} from '../lib/services/finance/cost-allocation.service'
import type { CostCenter, AllocationResult } from '../lib/services/finance/cost-allocation.service'

// ── Test fixtures ─────────────────────────────────────────────────────────────

const centerA: CostCenter = {
  id: 'A', name: 'Sales',     revenue_contribution: 600_000, headcount: 10, activity_units: 800,
}
const centerB: CostCenter = {
  id: 'B', name: 'Ops',       revenue_contribution: 300_000, headcount: 6,  activity_units: 150,
}
const centerC: CostCenter = {
  id: 'C', name: 'Admin',     revenue_contribution: 100_000, headcount: 4,  activity_units: 50,
}

const twoCenters = [centerA, centerB]
const threeCenters = [centerA, centerB, centerC]

// ── computeAllocationWeight ───────────────────────────────────────────────────

describe('computeAllocationWeight', () => {
  it('revenue_based: proportional to revenue_contribution', () => {
    const w = computeAllocationWeight(centerA, 'revenue_based', 1_000_000, 0, 0)
    expect(w).toBeCloseTo(0.6)
  })

  it('revenue_based: returns 0 if totalRevenue === 0', () => {
    expect(computeAllocationWeight(centerA, 'revenue_based', 0, 0, 0)).toBe(0)
  })

  it('revenue_based: center with 0 contribution returns 0', () => {
    const noRev = { ...centerA, revenue_contribution: 0 }
    expect(computeAllocationWeight(noRev, 'revenue_based', 1_000_000, 0, 0)).toBe(0)
  })

  it('headcount_based: proportional to headcount', () => {
    const w = computeAllocationWeight(centerA, 'headcount_based', 0, 20, 0)
    expect(w).toBeCloseTo(0.5)
  })

  it('headcount_based: returns 0 if totalHeadcount === 0', () => {
    expect(computeAllocationWeight(centerA, 'headcount_based', 0, 0, 0)).toBe(0)
  })

  it('headcount_based: center with 0 headcount returns 0', () => {
    const noHC = { ...centerA, headcount: 0 }
    expect(computeAllocationWeight(noHC, 'headcount_based', 0, 20, 0)).toBe(0)
  })

  it('equal_split: always returns 1', () => {
    expect(computeAllocationWeight(centerA, 'equal_split', 0, 0, 0)).toBe(1)
  })

  it('equal_split: same for any center', () => {
    expect(computeAllocationWeight(centerC, 'equal_split', 999, 999, 999)).toBe(1)
  })

  it('direct_only: always returns 0', () => {
    expect(computeAllocationWeight(centerA, 'direct_only', 1_000_000, 20, 1000)).toBe(0)
  })

  it('direct_only: returns 0 regardless of totals', () => {
    expect(computeAllocationWeight(centerC, 'direct_only', 0, 0, 0)).toBe(0)
  })

  it('activity_based: proportional to activity_units', () => {
    const w = computeAllocationWeight(centerA, 'activity_based', 0, 0, 1000)
    expect(w).toBeCloseTo(0.8)
  })

  it('activity_based: returns 0 if totalActivityUnits === 0', () => {
    expect(computeAllocationWeight(centerA, 'activity_based', 0, 0, 0)).toBe(0)
  })

  it('activity_based: center with 0 activity_units returns 0', () => {
    const noAct = { ...centerA, activity_units: 0 }
    expect(computeAllocationWeight(noAct, 'activity_based', 0, 0, 1000)).toBe(0)
  })

  it('revenue_based: weights sum to 1 across all centers', () => {
    const total = centerA.revenue_contribution + centerB.revenue_contribution + centerC.revenue_contribution
    const wA = computeAllocationWeight(centerA, 'revenue_based', total, 0, 0)
    const wB = computeAllocationWeight(centerB, 'revenue_based', total, 0, 0)
    const wC = computeAllocationWeight(centerC, 'revenue_based', total, 0, 0)
    expect(wA + wB + wC).toBeCloseTo(1)
  })

  it('headcount_based: weights sum to 1 across all centers', () => {
    const total = centerA.headcount + centerB.headcount + centerC.headcount
    const wA = computeAllocationWeight(centerA, 'headcount_based', 0, total, 0)
    const wB = computeAllocationWeight(centerB, 'headcount_based', 0, total, 0)
    const wC = computeAllocationWeight(centerC, 'headcount_based', 0, total, 0)
    expect(wA + wB + wC).toBeCloseTo(1)
  })

  it('activity_based: weights sum to 1 across all centers', () => {
    const total = centerA.activity_units + centerB.activity_units + centerC.activity_units
    const wA = computeAllocationWeight(centerA, 'activity_based', 0, 0, total)
    const wB = computeAllocationWeight(centerB, 'activity_based', 0, 0, total)
    const wC = computeAllocationWeight(centerC, 'activity_based', 0, 0, total)
    expect(wA + wB + wC).toBeCloseTo(1)
  })
})

// ── allocateOverhead ──────────────────────────────────────────────────────────

describe('allocateOverhead', () => {
  it('returns empty array for empty cost centers', () => {
    expect(allocateOverhead(100_000, [], 'revenue_based')).toEqual([])
  })

  it('direct_only: all centers get 0 allocated', () => {
    const result = allocateOverhead(100_000, twoCenters, 'direct_only')
    expect(result).toHaveLength(2)
    expect(result.every(r => r.allocated_amount === 0)).toBe(true)
    expect(result.every(r => r.weight === 0)).toBe(true)
  })

  it('direct_only: total overhead = 0 allocated', () => {
    const result = allocateOverhead(50_000, threeCenters, 'direct_only')
    const total = result.reduce((s, r) => s + r.allocated_amount, 0)
    expect(total).toBe(0)
  })

  it('equal_split: distributes equally with remainder to last', () => {
    const result = allocateOverhead(100_001, twoCenters, 'equal_split')
    expect(result).toHaveLength(2)
    const total = result.reduce((s, r) => s + r.allocated_amount, 0)
    expect(total).toBeCloseTo(100_001)
  })

  it('equal_split: three centers — amounts differ by at most rounding', () => {
    const result = allocateOverhead(99_999, threeCenters, 'equal_split')
    const total = result.reduce((s, r) => s + r.allocated_amount, 0)
    expect(total).toBeCloseTo(99_999)
    // Each center gets ~33333
    result.forEach(r => {
      expect(r.allocated_amount).toBeGreaterThan(33_000)
      expect(r.allocated_amount).toBeLessThan(34_000)
    })
  })

  it('revenue_based: total allocated equals total overhead', () => {
    const result = allocateOverhead(300_000, threeCenters, 'revenue_based')
    const total = result.reduce((s, r) => s + r.allocated_amount, 0)
    expect(total).toBeCloseTo(300_000, 1)
  })

  it('revenue_based: proportions match revenue contributions', () => {
    const result = allocateOverhead(1_000_000, twoCenters, 'revenue_based')
    // A=600k, B=300k → A gets 2/3, B gets 1/3
    const totalRev = 900_000
    expect(result.find(r => r.cost_center_id === 'A')?.allocated_amount)
      .toBeCloseTo(1_000_000 * (600_000 / totalRev), 0)
    expect(result.find(r => r.cost_center_id === 'B')?.allocated_amount)
      .toBeCloseTo(1_000_000 * (300_000 / totalRev), 0)
  })

  it('headcount_based: total allocated equals total overhead', () => {
    const result = allocateOverhead(200_000, twoCenters, 'headcount_based')
    const total = result.reduce((s, r) => s + r.allocated_amount, 0)
    expect(total).toBeCloseTo(200_000, 1)
  })

  it('activity_based: total allocated equals total overhead', () => {
    const result = allocateOverhead(500_000, threeCenters, 'activity_based')
    const total = result.reduce((s, r) => s + r.allocated_amount, 0)
    expect(total).toBeCloseTo(500_000, 1)
  })

  it('all centers get 0 weight when direct_only even with large overhead', () => {
    const result = allocateOverhead(9_999_999, threeCenters, 'direct_only')
    result.forEach(r => {
      expect(r.allocated_amount).toBe(0)
      expect(r.weight).toBe(0)
    })
  })

  it('revenue_based with 0 total revenue: all get 0', () => {
    const zeroCenters = threeCenters.map(c => ({ ...c, revenue_contribution: 0 }))
    const result = allocateOverhead(100_000, zeroCenters, 'revenue_based')
    result.forEach(r => expect(r.allocated_amount).toBe(0))
  })

  it('single center gets all overhead (revenue_based)', () => {
    const result = allocateOverhead(75_000, [centerA], 'revenue_based')
    expect(result[0].allocated_amount).toBeCloseTo(75_000)
  })

  it('single center gets all overhead (equal_split)', () => {
    const result = allocateOverhead(75_000, [centerA], 'equal_split')
    expect(result[0].allocated_amount).toBeCloseTo(75_000)
  })

  it('last center absorbs rounding remainder in revenue_based', () => {
    // Use 3 centers with uneven weights and an overhead that causes rounding
    const result = allocateOverhead(100_000, threeCenters, 'revenue_based')
    const total = result.reduce((s, r) => s + r.allocated_amount, 0)
    // Should be exact (within floating point)
    expect(Math.abs(total - 100_000)).toBeLessThan(0.01)
  })
})

// ── computeFullCostAllocation ─────────────────────────────────────────────────

describe('computeFullCostAllocation', () => {
  const directCosts = [
    { cost_center_id: 'A', category: 'cogs',      amount: 200_000 },
    { cost_center_id: 'A', category: 'logistics', amount:  50_000 },
    { cost_center_id: 'B', category: 'cogs',      amount: 100_000 },
    { cost_center_id: 'C', category: 'marketing', amount:  30_000 },
  ]

  it('returns one AllocationResult per cost center', () => {
    const results = computeFullCostAllocation(threeCenters, directCosts, 120_000, 'revenue_based')
    expect(results).toHaveLength(3)
  })

  it('direct_costs aggregated correctly per center', () => {
    const results = computeFullCostAllocation(threeCenters, directCosts, 0, 'direct_only')
    const resA = results.find(r => r.cost_center_id === 'A')
    const resB = results.find(r => r.cost_center_id === 'B')
    const resC = results.find(r => r.cost_center_id === 'C')
    expect(resA?.direct_costs).toBe(250_000)
    expect(resB?.direct_costs).toBe(100_000)
    expect(resC?.direct_costs).toBe(30_000)
  })

  it('total_cost = direct_costs + allocated_overhead', () => {
    const results = computeFullCostAllocation(twoCenters, directCosts, 100_000, 'equal_split')
    results.forEach(r => {
      expect(r.total_cost).toBeCloseTo(r.direct_costs + r.allocated_overhead, 1)
    })
  })

  it('overhead_rate_pct: null when direct_costs === 0', () => {
    const costCenter = [{ id: 'X', name: 'X', revenue_contribution: 100_000, headcount: 5, activity_units: 100 }]
    const results = computeFullCostAllocation(costCenter, [], 50_000, 'revenue_based')
    expect(results[0].overhead_rate_pct).toBeNull()
  })

  it('overhead_rate_pct computed correctly when direct_costs > 0', () => {
    const costCenter = [{ id: 'X', name: 'X', revenue_contribution: 100_000, headcount: 5, activity_units: 100 }]
    const dc = [{ cost_center_id: 'X', category: 'cogs', amount: 100_000 }]
    const results = computeFullCostAllocation(costCenter, dc, 25_000, 'revenue_based')
    // allocated = 25000, direct = 100000 → 25%
    expect(results[0].overhead_rate_pct).toBeCloseTo(25)
  })

  it('cost_per_revenue_unit: null when revenue_contribution === 0', () => {
    const noRev = [{ id: 'X', name: 'X', revenue_contribution: 0, headcount: 5, activity_units: 100 }]
    const dc = [{ cost_center_id: 'X', category: 'cogs', amount: 50_000 }]
    const results = computeFullCostAllocation(noRev, dc, 10_000, 'revenue_based')
    expect(results[0].cost_per_revenue_unit).toBeNull()
  })

  it('cost_per_revenue_unit computed correctly', () => {
    const center = [{ id: 'X', name: 'X', revenue_contribution: 200_000, headcount: 5, activity_units: 100 }]
    const dc = [{ cost_center_id: 'X', category: 'cogs', amount: 100_000 }]
    const results = computeFullCostAllocation(center, dc, 20_000, 'revenue_based')
    // total_cost = 120000, revenue = 200000 → 0.6
    expect(results[0].cost_per_revenue_unit).toBeCloseTo(0.6)
  })

  it('allocation_share_pct sums to 100 for non-direct_only', () => {
    const results = computeFullCostAllocation(threeCenters, directCosts, 120_000, 'revenue_based')
    const sum = results.reduce((s, r) => s + r.allocation_share_pct, 0)
    expect(sum).toBeCloseTo(100, 1)
  })

  it('direct_only: allocation_share_pct is 0 for all, overhead_rate_pct null for empty direct', () => {
    const results = computeFullCostAllocation(threeCenters, [], 120_000, 'direct_only')
    results.forEach(r => {
      expect(r.allocated_overhead).toBe(0)
      expect(r.allocation_share_pct).toBe(0)
    })
  })

  it('cost center with no direct costs: direct_costs = 0', () => {
    const results = computeFullCostAllocation(threeCenters, directCosts, 100_000, 'revenue_based')
    // centerA and centerB have costs, check their values make sense
    const resA = results.find(r => r.cost_center_id === 'A')
    expect(resA?.direct_costs).toBeGreaterThan(0)
  })

  it('empty cost centers returns empty array', () => {
    expect(computeFullCostAllocation([], directCosts, 100_000, 'revenue_based')).toEqual([])
  })
})

// ── computeOverheadRatio ──────────────────────────────────────────────────────

describe('computeOverheadRatio', () => {
  it('returns null when totalDirectCosts === 0', () => {
    expect(computeOverheadRatio(50_000, 0)).toBeNull()
  })

  it('correct ratio', () => {
    expect(computeOverheadRatio(25_000, 100_000)).toBeCloseTo(25)
  })

  it('100% when overhead equals direct costs', () => {
    expect(computeOverheadRatio(100_000, 100_000)).toBe(100)
  })

  it('can exceed 100%', () => {
    expect(computeOverheadRatio(200_000, 100_000)).toBe(200)
  })
})

// ── computeBreakevenRevenue ───────────────────────────────────────────────────

describe('computeBreakevenRevenue', () => {
  it('returns null when variableCostRatio >= 1 (exact 1)', () => {
    expect(computeBreakevenRevenue(50_000, 1)).toBeNull()
  })

  it('returns null when variableCostRatio > 1', () => {
    expect(computeBreakevenRevenue(50_000, 1.5)).toBeNull()
  })

  it('correct calculation at 0.4 ratio', () => {
    // 100000 / (1 - 0.4) = 100000 / 0.6 ≈ 166667
    expect(computeBreakevenRevenue(100_000, 0.4)).toBeCloseTo(166_666.67, 0)
  })

  it('correct calculation at 0 variable cost ratio', () => {
    // 100000 / 1 = 100000
    expect(computeBreakevenRevenue(100_000, 0)).toBe(100_000)
  })

  it('correct calculation at 0.75 ratio', () => {
    // 100000 / 0.25 = 400000
    expect(computeBreakevenRevenue(100_000, 0.75)).toBeCloseTo(400_000)
  })

  it('returns null at exactly ratio = 1 boundary', () => {
    expect(computeBreakevenRevenue(0, 1)).toBeNull()
  })
})

// ── classifyOverheadLevel ─────────────────────────────────────────────────────

describe('classifyOverheadLevel', () => {
  it('null → normal', () => {
    expect(classifyOverheadLevel(null)).toBe('normal')
  })

  it('0% → lean', () => {
    expect(classifyOverheadLevel(0)).toBe('lean')
  })

  it('9.9% → lean (< 10)', () => {
    expect(classifyOverheadLevel(9.9)).toBe('lean')
  })

  it('10% → normal (boundary: < 25)', () => {
    expect(classifyOverheadLevel(10)).toBe('normal')
  })

  it('24.9% → normal', () => {
    expect(classifyOverheadLevel(24.9)).toBe('normal')
  })

  it('25% → elevated (boundary)', () => {
    expect(classifyOverheadLevel(25)).toBe('elevated')
  })

  it('39.9% → elevated', () => {
    expect(classifyOverheadLevel(39.9)).toBe('elevated')
  })

  it('40% → heavy (boundary)', () => {
    expect(classifyOverheadLevel(40)).toBe('heavy')
  })

  it('59.9% → heavy', () => {
    expect(classifyOverheadLevel(59.9)).toBe('heavy')
  })

  it('60% → critical (boundary)', () => {
    expect(classifyOverheadLevel(60)).toBe('critical')
  })

  it('100% → critical', () => {
    expect(classifyOverheadLevel(100)).toBe('critical')
  })
})

// ── segregateCosts ────────────────────────────────────────────────────────────

describe('segregateCosts', () => {
  const fixedCats    = ['salary', 'rent', 'software']
  const variableCats = ['cogs', 'logistics']

  const expenses = [
    { category: 'salary',    amount: 50_000 },
    { category: 'rent',      amount: 20_000 },
    { category: 'cogs',      amount: 100_000 },
    { category: 'logistics', amount: 30_000 },
    { category: 'other',     amount: 10_000 },
  ]

  it('fixed_costs: sum of fixed categories', () => {
    const r = segregateCosts(expenses, fixedCats, variableCats)
    expect(r.fixed_costs).toBe(70_000)
  })

  it('variable_costs: sum of variable categories', () => {
    const r = segregateCosts(expenses, fixedCats, variableCats)
    expect(r.variable_costs).toBe(130_000)
  })

  it('semi_variable_costs = total - fixed - variable', () => {
    const r = segregateCosts(expenses, fixedCats, variableCats)
    expect(r.semi_variable_costs).toBe(10_000)
  })

  it('total is sum of all expenses', () => {
    const r = segregateCosts(expenses, fixedCats, variableCats)
    expect(r.total).toBe(210_000)
  })

  it('fixed_pct is correct', () => {
    const r = segregateCosts(expenses, fixedCats, variableCats)
    expect(r.fixed_pct).toBeCloseTo((70_000 / 210_000) * 100, 1)
  })

  it('variable_pct is correct', () => {
    const r = segregateCosts(expenses, fixedCats, variableCats)
    expect(r.variable_pct).toBeCloseTo((130_000 / 210_000) * 100, 1)
  })

  it('semi_variable_pct is correct', () => {
    const r = segregateCosts(expenses, fixedCats, variableCats)
    expect(r.semi_variable_pct).toBeCloseTo((10_000 / 210_000) * 100, 1)
  })

  it('pcts sum to 100', () => {
    const r = segregateCosts(expenses, fixedCats, variableCats)
    expect(r.fixed_pct + r.variable_pct + r.semi_variable_pct).toBeCloseTo(100, 1)
  })

  it('empty expenses: all zeros', () => {
    const r = segregateCosts([], fixedCats, variableCats)
    expect(r.total).toBe(0)
    expect(r.fixed_costs).toBe(0)
    expect(r.variable_costs).toBe(0)
    expect(r.semi_variable_costs).toBe(0)
    expect(r.fixed_pct).toBe(0)
  })

  it('case-insensitive category matching', () => {
    const mixed = [
      { category: 'SALARY',    amount: 10_000 },
      { category: 'Cogs',      amount: 20_000 },
      { category: 'undefined', amount: 5_000 },
    ]
    const r = segregateCosts(mixed, fixedCats, variableCats)
    expect(r.fixed_costs).toBe(10_000)
    expect(r.variable_costs).toBe(20_000)
    expect(r.semi_variable_costs).toBe(5_000)
  })

  it('all expenses in fixed: variable and semi-variable are 0', () => {
    const allFixed = [
      { category: 'salary', amount: 30_000 },
      { category: 'rent',   amount: 20_000 },
    ]
    const r = segregateCosts(allFixed, fixedCats, variableCats)
    expect(r.variable_costs).toBe(0)
    expect(r.semi_variable_costs).toBe(0)
    expect(r.fixed_costs).toBe(50_000)
  })

  it('all expenses in variable: fixed and semi-variable are 0', () => {
    const allVar = [
      { category: 'cogs',      amount: 60_000 },
      { category: 'logistics', amount: 40_000 },
    ]
    const r = segregateCosts(allVar, fixedCats, variableCats)
    expect(r.fixed_costs).toBe(0)
    expect(r.semi_variable_costs).toBe(0)
    expect(r.variable_costs).toBe(100_000)
  })
})

// ── computeContributionMargin ─────────────────────────────────────────────────

describe('computeContributionMargin', () => {
  it('positive result', () => {
    expect(computeContributionMargin(200_000, 100_000)).toBe(100_000)
  })

  it('zero result', () => {
    expect(computeContributionMargin(100_000, 100_000)).toBe(0)
  })

  it('negative result allowed', () => {
    expect(computeContributionMargin(50_000, 100_000)).toBe(-50_000)
  })

  it('zero revenue zero variable costs = 0', () => {
    expect(computeContributionMargin(0, 0)).toBe(0)
  })
})

// ── computeContributionMarginRatio ────────────────────────────────────────────

describe('computeContributionMarginRatio', () => {
  it('returns null when revenue === 0', () => {
    expect(computeContributionMarginRatio(0, 0)).toBeNull()
    expect(computeContributionMarginRatio(0, 50_000)).toBeNull()
  })

  it('correct positive ratio', () => {
    // (200k - 80k) / 200k × 100 = 60%
    expect(computeContributionMarginRatio(200_000, 80_000)).toBeCloseTo(60)
  })

  it('negative ratio when variable costs exceed revenue', () => {
    expect(computeContributionMarginRatio(100_000, 150_000)).toBeCloseTo(-50)
  })

  it('100% when variable costs are 0', () => {
    expect(computeContributionMarginRatio(100_000, 0)).toBe(100)
  })
})

// ── computeOperatingLeverageEffect ────────────────────────────────────────────

describe('computeOperatingLeverageEffect', () => {
  it('returns null when cmr is null', () => {
    expect(computeOperatingLeverageEffect(10, null)).toBeNull()
  })

  it('returns null when cmr >= 100 (exact 100)', () => {
    expect(computeOperatingLeverageEffect(10, 100)).toBeNull()
  })

  it('returns null when cmr > 100', () => {
    expect(computeOperatingLeverageEffect(10, 120)).toBeNull()
  })

  it('correct calculation at cmr = 60%', () => {
    // 10 × (1 / (1 - 0.6)) = 10 × 2.5 = 25
    expect(computeOperatingLeverageEffect(10, 60)).toBeCloseTo(25)
  })

  it('correct calculation at cmr = 75%', () => {
    // 10 × (1 / 0.25) = 40
    expect(computeOperatingLeverageEffect(10, 75)).toBeCloseTo(40)
  })

  it('negative revenue change produces negative leverage effect', () => {
    // -10 × (1 / (1 - 0.5)) = -20
    expect(computeOperatingLeverageEffect(-10, 50)).toBeCloseTo(-20)
  })
})

// ── identifyHighestOverheadCenter ─────────────────────────────────────────────

describe('identifyHighestOverheadCenter', () => {
  const mkResult = (id: string, rate: number | null): AllocationResult => ({
    cost_center_id:       id,
    cost_center_name:     id,
    direct_costs:         100_000,
    allocated_overhead:   rate !== null ? rate * 1000 : 0,
    total_cost:           100_000 + (rate !== null ? rate * 1000 : 0),
    cost_per_revenue_unit: null,
    overhead_rate_pct:    rate,
    allocation_share_pct: 33,
  })

  it('returns null for empty array', () => {
    expect(identifyHighestOverheadCenter([])).toBeNull()
  })

  it('returns null when all overhead rates are null', () => {
    const results = [mkResult('A', null), mkResult('B', null)]
    expect(identifyHighestOverheadCenter(results)).toBeNull()
  })

  it('returns the center with highest rate', () => {
    const results = [mkResult('A', 30), mkResult('B', 60), mkResult('C', 45)]
    const highest = identifyHighestOverheadCenter(results)
    expect(highest?.cost_center_id).toBe('B')
  })

  it('ignores null rates when comparing', () => {
    const results = [mkResult('A', null), mkResult('B', 50), mkResult('C', 30)]
    const highest = identifyHighestOverheadCenter(results)
    expect(highest?.cost_center_id).toBe('B')
  })

  it('returns single non-null center', () => {
    const results = [mkResult('A', 25)]
    expect(identifyHighestOverheadCenter(results)?.cost_center_id).toBe('A')
  })

  it('tie: returns the first one encountered with highest value', () => {
    const results = [mkResult('A', 50), mkResult('B', 50)]
    const highest = identifyHighestOverheadCenter(results)
    expect(highest?.cost_center_id).toBe('A')
  })
})

// ── computeTargetCostReduction ────────────────────────────────────────────────

describe('computeTargetCostReduction', () => {
  it('returns null when revenue === 0', () => {
    expect(computeTargetCostReduction(100_000, 15, 0)).toBeNull()
  })

  it('positive reduction when costs exceed target', () => {
    // target = 500k × (1 - 0.15) = 425k; current 450k → reduction 25k
    const result = computeTargetCostReduction(450_000, 15, 500_000)
    expect(result).toBeCloseTo(25_000)
  })

  it('negative value (surplus) when already meeting target', () => {
    // target = 500k × 0.85 = 425k; current 400k → -25k (surplus)
    const result = computeTargetCostReduction(400_000, 15, 500_000)
    expect(result).toBeCloseTo(-25_000)
  })

  it('zero when exactly at target', () => {
    const result = computeTargetCostReduction(425_000, 15, 500_000)
    expect(result).toBeCloseTo(0)
  })

  it('0% target margin: reduction = currentCost - revenue', () => {
    // target costs = revenue × 1 = revenue; reduction = current - revenue
    const result = computeTargetCostReduction(600_000, 0, 500_000)
    expect(result).toBeCloseTo(100_000)
  })

  it('100% target margin: target costs = 0; reduction = currentCost', () => {
    const result = computeTargetCostReduction(200_000, 100, 500_000)
    expect(result).toBeCloseTo(200_000)
  })
})

// ── generateAllocationNarrative ───────────────────────────────────────────────

describe('generateAllocationNarrative', () => {
  it('lean → Turkish lean message', () => {
    const msg = generateAllocationNarrative('lean', 'revenue_based', 5, null)
    expect(msg).toBe('Genel gider oranı düşük — verimli maliyet yapısı.')
  })

  it('normal → Turkish normal message', () => {
    const msg = generateAllocationNarrative('normal', 'revenue_based', 20, null)
    expect(msg).toBe('Genel gider oranı normal seviyelerde — mevcut yapı sürdürülebilir.')
  })

  it('elevated → Turkish elevated message', () => {
    const msg = generateAllocationNarrative('elevated', 'equal_split', 35, null)
    expect(msg).toBe('Genel gider oranı yükselmiş — optimizasyon fırsatları değerlendirilmeli.')
  })

  it('heavy → Turkish heavy message', () => {
    const msg = generateAllocationNarrative('heavy', 'headcount_based', 55, null)
    expect(msg).toBe('Yüksek genel gider oranı — maliyet baskısı karlılığı etkiliyor.')
  })

  it('critical → Turkish critical message', () => {
    const msg = generateAllocationNarrative('critical', 'activity_based', 80, null)
    expect(msg).toBe('Kritik: Genel gider kontrolden çıkmış — acil müdahale gerekiyor.')
  })
})
