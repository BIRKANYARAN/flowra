/**
 * Tests for lib/services/finance/expense-intelligence.service.ts
 *
 * All pure-function tests run without any DB calls.
 * Integration tests use a mock Supabase client.
 *
 * Run with: npx vitest run tests/expense-intelligence.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  computeExpenseRevenueRatio,
  computeExpenseGrowthRate,
  computeExpenseRunRate,
  computeCostPerRevenueUnit,
  classifyExpenseNature,
  computeFixedCostRatio,
  classifyOperatingLeverage,
  computeCategoryConcentration,
  detectCategoryDrift,
  computeSavingsOpportunity,
  computeExpenseVelocity,
  classifyExpenseVelocityTrend,
  computeExpenseEfficiencyScore,
  classifyExpenseEfficiency,
  generateExpenseIntelligenceNarrative,
  ExpenseIntelligenceService,
} from '../lib/services/finance/expense-intelligence.service'
import type { SupabaseClient } from '@supabase/supabase-js'

// ── Mock Supabase ─────────────────────────────────────────────────────────────

interface MockRow {
  amount?: number | null
  expense_type?: string | null
  expense_date?: string | null
}

function makeMockSupabase(dataSets: MockRow[][]) {
  let callCount = 0
  return {
    from(_table: string) {
      const idx  = callCount++
      const rows = dataSets[idx] ?? []
      const q = {
        _rows: rows,
        select(_: string) { return this },
        eq(_: string, __: unknown) { return this },
        is(_: string, __: unknown) { return this },
        gte(_: string, __: unknown) { return this },
        lte(_: string, __: unknown) { return this },
        then(resolve: (v: { data: MockRow[]; error: null }) => unknown) {
          return Promise.resolve({ data: this._rows, error: null }).then(resolve)
        },
      }
      return q
    },
  } as unknown as SupabaseClient
}

// ── computeExpenseRevenueRatio ────────────────────────────────────────────────

describe('computeExpenseRevenueRatio', () => {
  it('returns ratio when both positive', () => {
    expect(computeExpenseRevenueRatio(500, 1000)).toBeCloseTo(0.5)
  })

  it('returns null when revenue is 0', () => {
    expect(computeExpenseRevenueRatio(500, 0)).toBeNull()
  })

  it('returns 0 when expense is 0 and revenue is positive', () => {
    expect(computeExpenseRevenueRatio(0, 1000)).toBe(0)
  })

  it('returns 1 when expense equals revenue', () => {
    expect(computeExpenseRevenueRatio(1000, 1000)).toBe(1)
  })

  it('returns > 1 when expense exceeds revenue', () => {
    expect(computeExpenseRevenueRatio(1500, 1000)).toBeCloseTo(1.5)
  })

  it('handles large numbers correctly', () => {
    expect(computeExpenseRevenueRatio(1_000_000, 5_000_000)).toBeCloseTo(0.2)
  })
})

// ── computeExpenseGrowthRate ──────────────────────────────────────────────────

describe('computeExpenseGrowthRate', () => {
  it('positive growth', () => {
    expect(computeExpenseGrowthRate(120, 100)).toBeCloseTo(20)
  })

  it('negative growth (decrease)', () => {
    expect(computeExpenseGrowthRate(80, 100)).toBeCloseTo(-20)
  })

  it('zero growth', () => {
    expect(computeExpenseGrowthRate(100, 100)).toBe(0)
  })

  it('returns null when priorAmount is 0', () => {
    expect(computeExpenseGrowthRate(100, 0)).toBeNull()
  })

  it('returns null when both are 0', () => {
    expect(computeExpenseGrowthRate(0, 0)).toBeNull()
  })

  it('returns 0 when current is 0 and prior is positive', () => {
    // (0 - 100) / 100 * 100 = -100%
    expect(computeExpenseGrowthRate(0, 100)).toBeCloseTo(-100)
  })

  it('100% growth on doubling', () => {
    expect(computeExpenseGrowthRate(200, 100)).toBeCloseTo(100)
  })
})

// ── computeExpenseRunRate ─────────────────────────────────────────────────────

describe('computeExpenseRunRate', () => {
  it('annualizes 1-month amount correctly', () => {
    expect(computeExpenseRunRate(10_000, 1)).toBeCloseTo(120_000)
  })

  it('annualizes 3-month amount correctly', () => {
    expect(computeExpenseRunRate(30_000, 3)).toBeCloseTo(120_000)
  })

  it('annualizes 6-month amount correctly', () => {
    expect(computeExpenseRunRate(60_000, 6)).toBeCloseTo(120_000)
  })

  it('annualizes 12-month amount — returns same amount', () => {
    expect(computeExpenseRunRate(120_000, 12)).toBeCloseTo(120_000)
  })

  it('returns null when periodMonths is 0', () => {
    expect(computeExpenseRunRate(10_000, 0)).toBeNull()
  })

  it('returns 0 when amount is 0', () => {
    expect(computeExpenseRunRate(0, 3)).toBe(0)
  })
})

// ── computeCostPerRevenueUnit ─────────────────────────────────────────────────

describe('computeCostPerRevenueUnit', () => {
  it('returns ratio when both positive', () => {
    expect(computeCostPerRevenueUnit(600, 1000)).toBeCloseTo(0.6)
  })

  it('returns null when totalRevenue is 0', () => {
    expect(computeCostPerRevenueUnit(600, 0)).toBeNull()
  })

  it('returns 0 when totalExpenses is 0', () => {
    expect(computeCostPerRevenueUnit(0, 1000)).toBe(0)
  })

  it('returns 1 when expenses equal revenue', () => {
    expect(computeCostPerRevenueUnit(1000, 1000)).toBe(1)
  })

  it('returns > 1 when expenses exceed revenue (loss)', () => {
    expect(computeCostPerRevenueUnit(1500, 1000)).toBeCloseTo(1.5)
  })
})

// ── classifyExpenseNature ─────────────────────────────────────────────────────

describe('classifyExpenseNature — fixed categories', () => {
  it('rent → fixed', () => expect(classifyExpenseNature('rent')).toBe('fixed'))
  it('salary → fixed', () => expect(classifyExpenseNature('salary')).toBe('fixed'))
  it('insurance → fixed', () => expect(classifyExpenseNature('insurance')).toBe('fixed'))
  it('subscription → fixed', () => expect(classifyExpenseNature('subscription')).toBe('fixed'))
  it('software → fixed', () => expect(classifyExpenseNature('software')).toBe('fixed'))
  it('lease → fixed', () => expect(classifyExpenseNature('lease')).toBe('fixed'))
})

describe('classifyExpenseNature — variable categories', () => {
  it('logistics → variable', () => expect(classifyExpenseNature('logistics')).toBe('variable'))
  it('shipping → variable', () => expect(classifyExpenseNature('shipping')).toBe('variable'))
  it('marketing → variable', () => expect(classifyExpenseNature('marketing')).toBe('variable'))
  it('sales → variable', () => expect(classifyExpenseNature('sales')).toBe('variable'))
  it('cogs → variable', () => expect(classifyExpenseNature('cogs')).toBe('variable'))
  it('materials → variable', () => expect(classifyExpenseNature('materials')).toBe('variable'))
})

describe('classifyExpenseNature — semi_variable categories', () => {
  it('utilities → semi_variable', () => expect(classifyExpenseNature('utilities')).toBe('semi_variable'))
  it('office → semi_variable', () => expect(classifyExpenseNature('office')).toBe('semi_variable'))
  it('maintenance → semi_variable', () => expect(classifyExpenseNature('maintenance')).toBe('semi_variable'))
  it('travel → semi_variable', () => expect(classifyExpenseNature('travel')).toBe('semi_variable'))
  it('null → semi_variable', () => expect(classifyExpenseNature(null)).toBe('semi_variable'))
  it('unknown type → semi_variable', () => expect(classifyExpenseNature('xyz_unknown')).toBe('semi_variable'))
  it('other → semi_variable', () => expect(classifyExpenseNature('other')).toBe('semi_variable'))
})

// ── computeFixedCostRatio ─────────────────────────────────────────────────────

describe('computeFixedCostRatio', () => {
  it('60% fixed ratio', () => {
    expect(computeFixedCostRatio(600, 1000)).toBeCloseTo(60)
  })

  it('0% when no fixed costs', () => {
    expect(computeFixedCostRatio(0, 1000)).toBe(0)
  })

  it('100% when all costs are fixed', () => {
    expect(computeFixedCostRatio(1000, 1000)).toBeCloseTo(100)
  })

  it('returns null when totalCosts is 0', () => {
    expect(computeFixedCostRatio(0, 0)).toBeNull()
  })

  it('returns null when fixed is 0 and total is 0', () => {
    expect(computeFixedCostRatio(0, 0)).toBeNull()
  })

  it('30% fixed ratio', () => {
    expect(computeFixedCostRatio(300, 1000)).toBeCloseTo(30)
  })
})

// ── classifyOperatingLeverage ─────────────────────────────────────────────────

describe('classifyOperatingLeverage', () => {
  it('returns insufficient_data for null input', () => {
    expect(classifyOperatingLeverage(null)).toBe('insufficient_data')
  })

  it('very_high at exactly 70%', () => {
    expect(classifyOperatingLeverage(70)).toBe('very_high')
  })

  it('very_high above 70%', () => {
    expect(classifyOperatingLeverage(85)).toBe('very_high')
  })

  it('high at exactly 50%', () => {
    expect(classifyOperatingLeverage(50)).toBe('high')
  })

  it('high between 50% and 70%', () => {
    expect(classifyOperatingLeverage(60)).toBe('high')
  })

  it('high just below 70% boundary', () => {
    expect(classifyOperatingLeverage(69.9)).toBe('high')
  })

  it('moderate at exactly 30%', () => {
    expect(classifyOperatingLeverage(30)).toBe('moderate')
  })

  it('moderate between 30% and 50%', () => {
    expect(classifyOperatingLeverage(40)).toBe('moderate')
  })

  it('moderate just below 50% boundary', () => {
    expect(classifyOperatingLeverage(49.9)).toBe('moderate')
  })

  it('low below 30%', () => {
    expect(classifyOperatingLeverage(20)).toBe('low')
  })

  it('low at 0%', () => {
    expect(classifyOperatingLeverage(0)).toBe('low')
  })

  it('low just below 30% boundary', () => {
    expect(classifyOperatingLeverage(29.9)).toBe('low')
  })
})

// ── computeCategoryConcentration ──────────────────────────────────────────────

describe('computeCategoryConcentration', () => {
  it('single category → 100%', () => {
    expect(computeCategoryConcentration([{ amount: 500 }])).toBeCloseTo(100)
  })

  it('two equal categories → 50%', () => {
    expect(computeCategoryConcentration([{ amount: 500 }, { amount: 500 }])).toBeCloseTo(50)
  })

  it('three categories with dominant one', () => {
    // 800/1000 = 80%
    expect(computeCategoryConcentration([
      { amount: 800 },
      { amount: 100 },
      { amount: 100 },
    ])).toBeCloseTo(80)
  })

  it('returns null for empty array', () => {
    expect(computeCategoryConcentration([])).toBeNull()
  })

  it('returns null when all amounts are 0', () => {
    expect(computeCategoryConcentration([{ amount: 0 }, { amount: 0 }])).toBeNull()
  })

  it('five equal categories → 20%', () => {
    const cats = Array.from({ length: 5 }, () => ({ amount: 200 }))
    expect(computeCategoryConcentration(cats)).toBeCloseTo(20)
  })
})

// ── detectCategoryDrift ───────────────────────────────────────────────────────

describe('detectCategoryDrift', () => {
  it('returns empty array when no drift exceeds threshold', () => {
    const prior   = [{ category: 'rent', amount: 1000 }]
    const current = [{ category: 'rent', amount: 1050 }] // 5% — under 20% threshold
    expect(detectCategoryDrift(prior, current)).toHaveLength(0)
  })

  it('detects increased category', () => {
    const prior   = [{ category: 'marketing', amount: 1000 }]
    const current = [{ category: 'marketing', amount: 1500 }] // +50%
    const drifts = detectCategoryDrift(prior, current)
    expect(drifts).toHaveLength(1)
    expect(drifts[0].category).toBe('marketing')
    expect(drifts[0].direction).toBe('increased')
    expect(drifts[0].change_pct).toBeCloseTo(50)
  })

  it('detects decreased category', () => {
    const prior   = [{ category: 'logistics', amount: 1000 }]
    const current = [{ category: 'logistics', amount: 500 }] // -50%
    const drifts = detectCategoryDrift(prior, current)
    expect(drifts).toHaveLength(1)
    expect(drifts[0].direction).toBe('decreased')
    expect(drifts[0].change_pct).toBeCloseTo(-50)
  })

  it('uses custom threshold', () => {
    const prior   = [{ category: 'rent', amount: 1000 }]
    const current = [{ category: 'rent', amount: 1150 }] // 15% — under default 20 but over custom 10
    const drifts = detectCategoryDrift(prior, current, 10)
    expect(drifts).toHaveLength(1)
  })

  it('does not include new categories (prior = 0) in drift', () => {
    const prior   = [] as Array<{ category: string; amount: number }>
    const current = [{ category: 'new_cat', amount: 500 }]
    const drifts = detectCategoryDrift(prior, current)
    expect(drifts).toHaveLength(0)
  })

  it('includes removed categories as 100% decrease', () => {
    const prior   = [{ category: 'software', amount: 1000 }]
    const current = [] as Array<{ category: string; amount: number }>
    const drifts = detectCategoryDrift(prior, current)
    expect(drifts).toHaveLength(1)
    expect(drifts[0].change_pct).toBeCloseTo(-100)
    expect(drifts[0].direction).toBe('decreased')
  })

  it('returns correct prior_amount and current_amount', () => {
    const prior   = [{ category: 'rent', amount: 1000 }]
    const current = [{ category: 'rent', amount: 1300 }] // +30%
    const [drift] = detectCategoryDrift(prior, current)
    expect(drift.prior_amount).toBe(1000)
    expect(drift.current_amount).toBe(1300)
  })

  it('handles multiple categories with mixed drift', () => {
    const prior   = [
      { category: 'salary', amount: 5000 },
      { category: 'rent',   amount: 2000 },
      { category: 'cogs',   amount: 1000 },
    ]
    const current = [
      { category: 'salary', amount: 5050 },   // 1% — stable
      { category: 'rent',   amount: 2500 },   // 25% — drift
      { category: 'cogs',   amount: 600 },    // -40% — drift
    ]
    const drifts = detectCategoryDrift(prior, current)
    expect(drifts).toHaveLength(2)
    const categories = drifts.map(d => d.category)
    expect(categories).toContain('rent')
    expect(categories).toContain('cogs')
  })

  it('exact 20% boundary is NOT included (> not >=)', () => {
    const prior   = [{ category: 'rent', amount: 1000 }]
    const current = [{ category: 'rent', amount: 1200 }] // exactly 20%
    expect(detectCategoryDrift(prior, current)).toHaveLength(0)
  })

  it('just above 20% boundary IS included', () => {
    const prior   = [{ category: 'rent', amount: 1000 }]
    const current = [{ category: 'rent', amount: 1201 }] // 20.1%
    expect(detectCategoryDrift(prior, current)).toHaveLength(1)
  })
})

// ── computeSavingsOpportunity ─────────────────────────────────────────────────

describe('computeSavingsOpportunity', () => {
  it('returns annual savings when above benchmark', () => {
    // marketing is 15% of 100k revenue = 15k actual, benchmark is 5% = 5k
    // excess = 10k / month, annualized = 120k
    expect(computeSavingsOpportunity(15_000, 100_000, 5)).toBeCloseTo(120_000)
  })

  it('returns 0 when at benchmark', () => {
    // 5% of 100k = 5k, actual is also 5k
    expect(computeSavingsOpportunity(5_000, 100_000, 5)).toBe(0)
  })

  it('returns 0 when below benchmark', () => {
    // 3% of 100k = 3k actual, benchmark is 5% = 5k
    expect(computeSavingsOpportunity(3_000, 100_000, 5)).toBe(0)
  })

  it('returns 0 when revenue is 0', () => {
    expect(computeSavingsOpportunity(5_000, 0, 5)).toBe(0)
  })

  it('returns 0 when both amount and revenue are 0', () => {
    expect(computeSavingsOpportunity(0, 0, 10)).toBe(0)
  })

  it('larger benchmark → smaller or no savings', () => {
    // actual = 10k, benchmark = 10% of 100k = 10k → 0 savings
    expect(computeSavingsOpportunity(10_000, 100_000, 10)).toBe(0)
  })
})

// ── computeExpenseVelocity ────────────────────────────────────────────────────

describe('computeExpenseVelocity', () => {
  it('returns daily velocity for 30 days', () => {
    expect(computeExpenseVelocity(30_000, 30)).toBeCloseTo(1000)
  })

  it('returns null when periodDays is 0', () => {
    expect(computeExpenseVelocity(30_000, 0)).toBeNull()
  })

  it('returns 0 when expenses are 0', () => {
    expect(computeExpenseVelocity(0, 30)).toBe(0)
  })

  it('handles 1-day period', () => {
    expect(computeExpenseVelocity(5000, 1)).toBe(5000)
  })

  it('handles 365-day period', () => {
    expect(computeExpenseVelocity(365_000, 365)).toBeCloseTo(1000)
  })
})

// ── classifyExpenseVelocityTrend ──────────────────────────────────────────────

describe('classifyExpenseVelocityTrend', () => {
  it('returns no_prior_data when priorVelocity is null', () => {
    expect(classifyExpenseVelocityTrend(1000, null)).toBe('no_prior_data')
  })

  it('accelerating when current > prior * 1.15', () => {
    expect(classifyExpenseVelocityTrend(1160, 1000)).toBe('accelerating')
  })

  it('stable when current exactly equals prior * 1.15 (boundary — not accelerating)', () => {
    // current === prior * 1.15 is NOT > prior * 1.15
    expect(classifyExpenseVelocityTrend(1150, 1000)).toBe('stable')
  })

  it('stable when current is within ±15% of prior', () => {
    expect(classifyExpenseVelocityTrend(1000, 1000)).toBe('stable')
  })

  it('stable when current equals prior * 0.85 exactly (boundary)', () => {
    // current === prior * 0.85 is NOT < prior * 0.85
    expect(classifyExpenseVelocityTrend(850, 1000)).toBe('stable')
  })

  it('decelerating when current < prior * 0.85', () => {
    expect(classifyExpenseVelocityTrend(840, 1000)).toBe('decelerating')
  })

  it('decelerating when spending dropped significantly', () => {
    expect(classifyExpenseVelocityTrend(500, 1000)).toBe('decelerating')
  })

  it('accelerating on large increase', () => {
    expect(classifyExpenseVelocityTrend(2000, 1000)).toBe('accelerating')
  })
})

// ── computeExpenseEfficiencyScore ─────────────────────────────────────────────

describe('computeExpenseEfficiencyScore', () => {
  it('returns null when all inputs are null', () => {
    expect(computeExpenseEfficiencyScore(null, null, null)).toBeNull()
  })

  it('cost < 0.60 contributes 40pts', () => {
    const score = computeExpenseEfficiencyScore(0.55, null, null)
    expect(score).toBe(40)
  })

  it('cost < 0.75 contributes 30pts', () => {
    const score = computeExpenseEfficiencyScore(0.70, null, null)
    expect(score).toBe(30)
  })

  it('cost < 0.85 contributes 20pts', () => {
    const score = computeExpenseEfficiencyScore(0.80, null, null)
    expect(score).toBe(20)
  })

  it('cost >= 0.85 contributes 10pts', () => {
    const score = computeExpenseEfficiencyScore(0.90, null, null)
    expect(score).toBe(10)
  })

  it('fixed ratio < 30% contributes 30pts', () => {
    const score = computeExpenseEfficiencyScore(null, 25, null)
    expect(score).toBe(30)
  })

  it('fixed ratio < 50% contributes 20pts', () => {
    const score = computeExpenseEfficiencyScore(null, 40, null)
    expect(score).toBe(20)
  })

  it('fixed ratio < 70% contributes 10pts', () => {
    const score = computeExpenseEfficiencyScore(null, 60, null)
    expect(score).toBe(10)
  })

  it('fixed ratio >= 70% contributes 5pts', () => {
    const score = computeExpenseEfficiencyScore(null, 75, null)
    expect(score).toBe(5)
  })

  it('concentration < 30% contributes 30pts', () => {
    const score = computeExpenseEfficiencyScore(null, null, 25)
    expect(score).toBe(30)
  })

  it('concentration < 50% contributes 20pts', () => {
    const score = computeExpenseEfficiencyScore(null, null, 40)
    expect(score).toBe(20)
  })

  it('concentration < 70% contributes 10pts', () => {
    const score = computeExpenseEfficiencyScore(null, null, 60)
    expect(score).toBe(10)
  })

  it('concentration >= 70% contributes 5pts', () => {
    const score = computeExpenseEfficiencyScore(null, null, 75)
    expect(score).toBe(5)
  })

  it('all three excellent inputs → 100pts', () => {
    const score = computeExpenseEfficiencyScore(0.50, 20, 20)
    expect(score).toBe(100)
  })

  it('all three poor inputs → 20pts', () => {
    const score = computeExpenseEfficiencyScore(0.90, 80, 80)
    expect(score).toBe(20)
  })

  it('two of three provided, third null', () => {
    const score = computeExpenseEfficiencyScore(0.55, 25, null)
    expect(score).toBe(70) // 40 + 30
  })

  it('returns score even when only one is provided', () => {
    expect(computeExpenseEfficiencyScore(0.55, null, null)).not.toBeNull()
  })
})

// ── classifyExpenseEfficiency ─────────────────────────────────────────────────

describe('classifyExpenseEfficiency', () => {
  it('returns insufficient_data for null', () => {
    expect(classifyExpenseEfficiency(null)).toBe('insufficient_data')
  })

  it('excellent at exactly 80', () => {
    expect(classifyExpenseEfficiency(80)).toBe('excellent')
  })

  it('excellent above 80', () => {
    expect(classifyExpenseEfficiency(95)).toBe('excellent')
  })

  it('excellent at 100', () => {
    expect(classifyExpenseEfficiency(100)).toBe('excellent')
  })

  it('good at exactly 60', () => {
    expect(classifyExpenseEfficiency(60)).toBe('good')
  })

  it('good between 60 and 80', () => {
    expect(classifyExpenseEfficiency(70)).toBe('good')
  })

  it('good just below 80 boundary', () => {
    expect(classifyExpenseEfficiency(79)).toBe('good')
  })

  it('moderate at exactly 40', () => {
    expect(classifyExpenseEfficiency(40)).toBe('moderate')
  })

  it('moderate between 40 and 60', () => {
    expect(classifyExpenseEfficiency(50)).toBe('moderate')
  })

  it('moderate just below 60 boundary', () => {
    expect(classifyExpenseEfficiency(59)).toBe('moderate')
  })

  it('poor below 40', () => {
    expect(classifyExpenseEfficiency(30)).toBe('poor')
  })

  it('poor at 0', () => {
    expect(classifyExpenseEfficiency(0)).toBe('poor')
  })

  it('poor just below 40 boundary', () => {
    expect(classifyExpenseEfficiency(39)).toBe('poor')
  })
})

// ── generateExpenseIntelligenceNarrative ──────────────────────────────────────

describe('generateExpenseIntelligenceNarrative', () => {
  it('insufficient_data narrative when no data', () => {
    const narrative = generateExpenseIntelligenceNarrative('insufficient_data', null, null, null)
    expect(narrative).toContain('hesaplanamadı')
  })

  it('excellent narrative mentions mükemmel', () => {
    const narrative = generateExpenseIntelligenceNarrative('excellent', null, null, null)
    expect(narrative).toContain('mükemmel')
  })

  it('good narrative mentions iyi', () => {
    const narrative = generateExpenseIntelligenceNarrative('good', null, null, null)
    expect(narrative).toContain('iyi')
  })

  it('moderate narrative mentions orta', () => {
    const narrative = generateExpenseIntelligenceNarrative('moderate', null, null, null)
    expect(narrative).toContain('orta')
  })

  it('poor narrative mentions düşük or acil', () => {
    const narrative = generateExpenseIntelligenceNarrative('poor', null, null, null)
    expect(narrative.toLowerCase()).toMatch(/düşük|acil/)
  })

  it('includes top category name when provided', () => {
    const narrative = generateExpenseIntelligenceNarrative('excellent', 'salary', 40, null)
    expect(narrative).toContain('salary')
  })

  it('includes fixed cost ratio when provided', () => {
    const narrative = generateExpenseIntelligenceNarrative('good', null, null, 45.5)
    expect(narrative).toContain('45.5')
  })

  it('includes both top category and fixed cost ratio', () => {
    const narrative = generateExpenseIntelligenceNarrative('good', 'rent', 30, 55.0)
    expect(narrative).toContain('rent')
    expect(narrative).toContain('55.0')
  })

  it('returns a non-empty string for all efficiency levels', () => {
    const levels = ['excellent', 'good', 'moderate', 'poor', 'insufficient_data'] as const
    for (const level of levels) {
      const n = generateExpenseIntelligenceNarrative(level, null, null, null)
      expect(n.length).toBeGreaterThan(0)
    }
  })
})

// ── Integration tests ─────────────────────────────────────────────────────────

describe('ExpenseIntelligenceService.getReport — integration', () => {
  it('returns report with zero values when no data', async () => {
    // 4 queries: period expenses, current month, prior month, sales
    const supabase = makeMockSupabase([[], [], [], []])
    const service  = new ExpenseIntelligenceService(supabase)
    const report   = await service.getReport('company-1')

    expect(report.total_expenses).toBe(0)
    expect(report.total_revenue).toBe(0)
    expect(report.categories).toHaveLength(0)
    expect(report.cost_per_revenue_unit).toBeNull()
    expect(report.top_category).toBeNull()
  })

  it('computes total_expenses from period data', async () => {
    const expenses = [
      { amount: 1000, expense_type: 'rent',      expense_date: '2026-04-01' },
      { amount: 2000, expense_type: 'salary',    expense_date: '2026-04-15' },
      { amount:  500, expense_type: 'marketing', expense_date: '2026-04-20' },
    ]
    const supabase = makeMockSupabase([expenses, [], [], []])
    const service  = new ExpenseIntelligenceService(supabase)
    const report   = await service.getReport('company-1')

    expect(report.total_expenses).toBe(3500)
  })

  it('computes total_revenue from sales data', async () => {
    const sales = [
      { amount: 10_000 },
      { amount: 15_000 },
    ]
    const supabase = makeMockSupabase([[], [], [], sales])
    const service  = new ExpenseIntelligenceService(supabase)
    const report   = await service.getReport('company-1')

    expect(report.total_revenue).toBe(25_000)
  })

  it('correctly classifies fixed/variable/semi expenses', async () => {
    const expenses = [
      { amount: 5000, expense_type: 'salary',    expense_date: '2026-04-01' }, // fixed
      { amount: 3000, expense_type: 'marketing', expense_date: '2026-04-01' }, // variable
      { amount: 1000, expense_type: 'utilities', expense_date: '2026-04-01' }, // semi
    ]
    const supabase = makeMockSupabase([expenses, [], [], []])
    const service  = new ExpenseIntelligenceService(supabase)
    const report   = await service.getReport('company-1')

    expect(report.fixed_costs).toBe(5000)
    expect(report.variable_costs).toBe(3000)
    expect(report.semi_variable_costs).toBe(1000)
  })

  it('identifies top_category correctly', async () => {
    const expenses = [
      { amount: 2000, expense_type: 'software',  expense_date: '2026-04-01' },
      { amount: 8000, expense_type: 'salary',    expense_date: '2026-04-01' },
      { amount: 1000, expense_type: 'marketing', expense_date: '2026-04-01' },
    ]
    const supabase = makeMockSupabase([expenses, [], [], []])
    const service  = new ExpenseIntelligenceService(supabase)
    const report   = await service.getReport('company-1')

    expect(report.top_category).toBe('salary')
    expect(report.top_category_amount).toBe(8000)
  })

  it('categories are sorted by amount descending', async () => {
    const expenses = [
      { amount: 100,  expense_type: 'software',  expense_date: '2026-04-01' },
      { amount: 5000, expense_type: 'salary',    expense_date: '2026-04-01' },
      { amount: 2000, expense_type: 'marketing', expense_date: '2026-04-01' },
    ]
    const supabase = makeMockSupabase([expenses, [], [], []])
    const service  = new ExpenseIntelligenceService(supabase)
    const report   = await service.getReport('company-1')

    expect(report.categories[0].category).toBe('salary')
    expect(report.categories[1].category).toBe('marketing')
    expect(report.categories[2].category).toBe('software')
  })

  it('computes cost_per_revenue_unit correctly', async () => {
    const expenses = [{ amount: 6000, expense_type: 'salary', expense_date: '2026-04-01' }]
    const sales    = [{ amount: 10_000 }]
    const supabase = makeMockSupabase([expenses, [], [], sales])
    const service  = new ExpenseIntelligenceService(supabase)
    const report   = await service.getReport('company-1')

    expect(report.cost_per_revenue_unit).toBeCloseTo(0.6)
  })

  it('computes run_rate_annual correctly', async () => {
    const expenses = [{ amount: 30_000, expense_type: 'salary', expense_date: '2026-04-01' }]
    const supabase = makeMockSupabase([expenses, [], [], []])
    const service  = new ExpenseIntelligenceService(supabase)
    // 3-month period: 30k / 3 * 12 = 120k
    const report   = await service.getReport('company-1', 3)

    expect(report.run_rate_annual).toBeCloseTo(120_000)
  })

  it('narrative is a non-empty string', async () => {
    const supabase = makeMockSupabase([[], [], [], []])
    const service  = new ExpenseIntelligenceService(supabase)
    const report   = await service.getReport('company-1')

    expect(typeof report.narrative).toBe('string')
    expect(report.narrative.length).toBeGreaterThan(0)
  })

  it('as_of_date is a valid YYYY-MM-DD string', async () => {
    const supabase = makeMockSupabase([[], [], [], []])
    const service  = new ExpenseIntelligenceService(supabase)
    const report   = await service.getReport('company-1')

    expect(report.as_of_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('uses specified periodMonths in report', async () => {
    const supabase = makeMockSupabase([[], [], [], []])
    const service  = new ExpenseIntelligenceService(supabase)
    const report   = await service.getReport('company-1', 6)

    expect(report.period_months).toBe(6)
  })
})
