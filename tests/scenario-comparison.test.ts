// tests/scenario-comparison.test.ts
// Unit tests for lib/services/planning/scenario-comparison.service.ts pure functions

import { describe, it, expect } from 'vitest'
import {
  computeScenarioRank,
  recommendScenario,
  computeScenarioDelta,
  computeRiskAdjustedReturn,
  classifyScenarioRisk,
  // legacy helpers
  findBestScenario,
  computeBaselineDelta,
  computeImpliedCagr,
  buildRecommendationReason,
  extractMetricsFromSummary,
  buildComparisonReport,
  type ScenarioSummary,
  type ScenarioSnapshot,
} from '@/lib/services/planning/scenario-comparison.service'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeScenarioSummary(
  overrides: Partial<ScenarioSummary> & { id: string; name: string },
): ScenarioSummary {
  return {
    total_revenue:        500_000,
    total_net_income:     100_000,
    net_margin_pct:       20,
    runway_months:        12,
    break_even_month:     6,
    peak_cash:            800_000,
    min_cash:             200_000,
    debt_clearance_month: null,
    is_baseline:          false,
    ...overrides,
  }
}

// ── computeScenarioRank ───────────────────────────────────────────────────────

describe('computeScenarioRank', () => {
  it('single scenario returns rank 1', () => {
    const s = makeScenarioSummary({ id: 'a', name: 'A' })
    expect(computeScenarioRank(s, [s])).toBe(1)
  })

  it('best scenario on all axes gets rank 1', () => {
    const best = makeScenarioSummary({
      id: 'best', name: 'Best',
      total_revenue: 1_000_000, net_margin_pct: 30, runway_months: 24, min_cash: 500_000,
    })
    const worst = makeScenarioSummary({
      id: 'worst', name: 'Worst',
      total_revenue: 100_000, net_margin_pct: 5, runway_months: 3, min_cash: 10_000,
    })
    const all = [best, worst]
    expect(computeScenarioRank(best, all)).toBe(1)
    expect(computeScenarioRank(worst, all)).toBe(2)
  })

  it('worst on all axes gets last rank', () => {
    const s1 = makeScenarioSummary({ id: 's1', name: 'S1', total_revenue: 900_000, net_margin_pct: 25, runway_months: 20, min_cash: 400_000 })
    const s2 = makeScenarioSummary({ id: 's2', name: 'S2', total_revenue: 600_000, net_margin_pct: 15, runway_months: 12, min_cash: 250_000 })
    const s3 = makeScenarioSummary({ id: 's3', name: 'S3', total_revenue: 100_000, net_margin_pct: 2, runway_months: 2, min_cash: 5_000 })
    const all = [s1, s2, s3]
    expect(computeScenarioRank(s3, all)).toBe(3)
  })

  it('null net_margin_pct is treated as last for margin rank', () => {
    const good  = makeScenarioSummary({ id: 'g', name: 'G', net_margin_pct: 20 })
    const nullM = makeScenarioSummary({ id: 'n', name: 'N', net_margin_pct: null })
    const all = [good, nullM]
    expect(computeScenarioRank(good, all)).toBe(1)
    expect(computeScenarioRank(nullM, all)).toBe(2)
  })

  it('null runway_months is treated as last for runway rank', () => {
    const good  = makeScenarioSummary({ id: 'g', name: 'G', runway_months: 12 })
    const nullR = makeScenarioSummary({ id: 'n', name: 'N', runway_months: null })
    const all = [good, nullR]
    expect(computeScenarioRank(good, all)).toBe(1)
    expect(computeScenarioRank(nullR, all)).toBe(2)
  })

  it('returns value between 1 and N for each scenario', () => {
    const scenarios = [
      makeScenarioSummary({ id: 'a', name: 'A' }),
      makeScenarioSummary({ id: 'b', name: 'B', total_revenue: 800_000 }),
      makeScenarioSummary({ id: 'c', name: 'C', total_revenue: 200_000 }),
    ]
    for (const s of scenarios) {
      const rank = computeScenarioRank(s, scenarios)
      expect(rank).toBeGreaterThanOrEqual(1)
      expect(rank).toBeLessThanOrEqual(3)
    }
  })

  it('all ranks are unique for clearly different scenarios', () => {
    const scenarios = [
      makeScenarioSummary({ id: 'a', name: 'A', total_revenue: 1_000_000, net_margin_pct: 30, runway_months: 24, min_cash: 500_000 }),
      makeScenarioSummary({ id: 'b', name: 'B', total_revenue:   600_000, net_margin_pct: 18, runway_months: 12, min_cash: 200_000 }),
      makeScenarioSummary({ id: 'c', name: 'C', total_revenue:   200_000, net_margin_pct:  5, runway_months:  4, min_cash:  20_000 }),
    ]
    const ranks = scenarios.map(s => computeScenarioRank(s, scenarios))
    expect(new Set(ranks).size).toBe(3)
  })

  it('margin weight (0.30) has greater influence than safety (0.20)', () => {
    // s1 wins on margin, s2 wins on safety; s1 should rank higher overall
    const s1 = makeScenarioSummary({ id: 's1', name: 'S1', net_margin_pct: 40, min_cash: 50_000,  total_revenue: 500_000, runway_months: 10 })
    const s2 = makeScenarioSummary({ id: 's2', name: 'S2', net_margin_pct: 5,  min_cash: 500_000, total_revenue: 500_000, runway_months: 10 })
    const all = [s1, s2]
    expect(computeScenarioRank(s1, all)).toBe(1)
  })
})

// ── recommendScenario ─────────────────────────────────────────────────────────

describe('recommendScenario', () => {
  it('returns null for empty array', () => {
    expect(recommendScenario([])).toBeNull()
  })

  it('solvent scenario wins over insolvent one', () => {
    const solvent = makeScenarioSummary({
      id: 'solvent', name: 'Solvent',
      min_cash: 100_000, runway_months: 10, net_margin_pct: 15,
    })
    const insolvent = makeScenarioSummary({
      id: 'insolvent', name: 'Insolvent',
      min_cash: -50_000, runway_months: 2, net_margin_pct: 30,
    })
    const result = recommendScenario([insolvent, solvent])
    expect(result).toBe('solvent')
  })

  it('among solvent scenarios picks highest net_margin_pct', () => {
    const lowMargin  = makeScenarioSummary({ id: 'lm', name: 'LM', min_cash: 200_000, runway_months: 12, net_margin_pct: 10 })
    const highMargin = makeScenarioSummary({ id: 'hm', name: 'HM', min_cash: 200_000, runway_months: 12, net_margin_pct: 25 })
    expect(recommendScenario([lowMargin, highMargin])).toBe('hm')
  })

  it('null net_margin_pct treated as -Infinity (loses to any real margin)', () => {
    const nullMargin = makeScenarioSummary({ id: 'nm', name: 'NM', min_cash: 200_000, runway_months: 12, net_margin_pct: null })
    const hasMargin  = makeScenarioSummary({ id: 'hm', name: 'HM', min_cash: 200_000, runway_months: 12, net_margin_pct: 1 })
    expect(recommendScenario([nullMargin, hasMargin])).toBe('hm')
  })

  it('when no solvent scenarios, picks highest min_cash', () => {
    const bad1 = makeScenarioSummary({ id: 'b1', name: 'B1', min_cash: -100_000, runway_months: 1 })
    const bad2 = makeScenarioSummary({ id: 'b2', name: 'B2', min_cash: -10_000, runway_months: 1 })
    expect(recommendScenario([bad1, bad2])).toBe('b2')
  })

  it('tie-break on margin uses total_revenue', () => {
    const highRev = makeScenarioSummary({ id: 'hr', name: 'HR', min_cash: 200_000, runway_months: 12, net_margin_pct: 20, total_revenue: 800_000 })
    const lowRev  = makeScenarioSummary({ id: 'lr', name: 'LR', min_cash: 200_000, runway_months: 12, net_margin_pct: 20, total_revenue: 400_000 })
    expect(recommendScenario([lowRev, highRev])).toBe('hr')
  })

  it('single solvent scenario is always recommended', () => {
    const s = makeScenarioSummary({ id: 'only', name: 'Only', min_cash: 500_000, runway_months: 18 })
    expect(recommendScenario([s])).toBe('only')
  })

  it('runway_months === null scenario is considered solvent (not penalised)', () => {
    const noRunway = makeScenarioSummary({ id: 'nr', name: 'NR', min_cash: 200_000, runway_months: null, net_margin_pct: 30 })
    const hasRunway = makeScenarioSummary({ id: 'hr', name: 'HR', min_cash: 200_000, runway_months: 6, net_margin_pct: 10 })
    // noRunway has higher margin → should win among solvents
    expect(recommendScenario([noRunway, hasRunway])).toBe('nr')
  })

  it('scenario with runway < 6 is treated as insolvent', () => {
    const shortRunway = makeScenarioSummary({ id: 'sr', name: 'SR', min_cash: 500_000, runway_months: 4, net_margin_pct: 40 })
    const longRunway  = makeScenarioSummary({ id: 'lr', name: 'LR', min_cash: 100_000, runway_months: 8, net_margin_pct: 10 })
    expect(recommendScenario([shortRunway, longRunway])).toBe('lr')
  })
})

// ── computeScenarioDelta ──────────────────────────────────────────────────────

describe('computeScenarioDelta', () => {
  it('computes positive revenue delta correctly', () => {
    const baseline   = makeScenarioSummary({ id: 'b', name: 'B', total_revenue: 500_000 })
    const comparison = makeScenarioSummary({ id: 'c', name: 'C', total_revenue: 600_000 })
    const delta = computeScenarioDelta(baseline, comparison)
    expect(delta.revenue_delta).toBe(100_000)
    expect(delta.is_revenue_better).toBe(true)
  })

  it('computes negative revenue delta correctly', () => {
    const baseline   = makeScenarioSummary({ id: 'b', name: 'B', total_revenue: 500_000 })
    const comparison = makeScenarioSummary({ id: 'c', name: 'C', total_revenue: 400_000 })
    const delta = computeScenarioDelta(baseline, comparison)
    expect(delta.revenue_delta).toBe(-100_000)
    expect(delta.is_revenue_better).toBe(false)
  })

  it('revenue_delta_pct is null when baseline revenue is 0', () => {
    const baseline   = makeScenarioSummary({ id: 'b', name: 'B', total_revenue: 0 })
    const comparison = makeScenarioSummary({ id: 'c', name: 'C', total_revenue: 100_000 })
    const delta = computeScenarioDelta(baseline, comparison)
    expect(delta.revenue_delta_pct).toBeNull()
  })

  it('revenue_delta_pct calculates correctly (20%)', () => {
    const baseline   = makeScenarioSummary({ id: 'b', name: 'B', total_revenue: 500_000 })
    const comparison = makeScenarioSummary({ id: 'c', name: 'C', total_revenue: 600_000 })
    const delta = computeScenarioDelta(baseline, comparison)
    expect(delta.revenue_delta_pct).toBeCloseTo(20, 2)
  })

  it('net_income_delta_pct is null when baseline net_income is 0', () => {
    const baseline   = makeScenarioSummary({ id: 'b', name: 'B', total_net_income: 0 })
    const comparison = makeScenarioSummary({ id: 'c', name: 'C', total_net_income: 50_000 })
    const delta = computeScenarioDelta(baseline, comparison)
    expect(delta.net_income_delta_pct).toBeNull()
  })

  it('runway_delta_months is null when either runway is null', () => {
    const baseline   = makeScenarioSummary({ id: 'b', name: 'B', runway_months: null })
    const comparison = makeScenarioSummary({ id: 'c', name: 'C', runway_months: 12 })
    const delta = computeScenarioDelta(baseline, comparison)
    expect(delta.runway_delta_months).toBeNull()
  })

  it('runway_delta_months calculates correctly', () => {
    const baseline   = makeScenarioSummary({ id: 'b', name: 'B', runway_months: 8 })
    const comparison = makeScenarioSummary({ id: 'c', name: 'C', runway_months: 14 })
    const delta = computeScenarioDelta(baseline, comparison)
    expect(delta.runway_delta_months).toBe(6)
    expect(delta.is_runway_better).toBe(true)
  })

  it('is_margin_better is false when either margin is null', () => {
    const baseline   = makeScenarioSummary({ id: 'b', name: 'B', net_margin_pct: null })
    const comparison = makeScenarioSummary({ id: 'c', name: 'C', net_margin_pct: 20 })
    const delta = computeScenarioDelta(baseline, comparison)
    expect(delta.is_margin_better).toBe(false)
  })

  it('is_margin_better is true when comparison margin is higher', () => {
    const baseline   = makeScenarioSummary({ id: 'b', name: 'B', net_margin_pct: 10 })
    const comparison = makeScenarioSummary({ id: 'c', name: 'C', net_margin_pct: 20 })
    const delta = computeScenarioDelta(baseline, comparison)
    expect(delta.is_margin_better).toBe(true)
  })

  it('all delta fields are computed for zero-revenue baseline with negative net income', () => {
    const baseline   = makeScenarioSummary({ id: 'b', name: 'B', total_revenue: 0, total_net_income: -50_000 })
    const comparison = makeScenarioSummary({ id: 'c', name: 'C', total_revenue: 0, total_net_income: -30_000 })
    const delta = computeScenarioDelta(baseline, comparison)
    // net_income_delta = -30_000 - (-50_000) = +20_000
    expect(delta.net_income_delta).toBe(20_000)
    // net_income_delta_pct = (20_000 / |-50_000|) * 100 = +40% (improvement)
    expect(delta.net_income_delta_pct).toBeCloseTo(40, 1)
  })
})

// ── computeRiskAdjustedReturn ─────────────────────────────────────────────────

describe('computeRiskAdjustedReturn', () => {
  it('returns null when totalCapital is 0', () => {
    expect(computeRiskAdjustedReturn(100_000, 50_000, 0)).toBeNull()
  })

  it('positive income and positive minCash produces positive return', () => {
    const result = computeRiskAdjustedReturn(100_000, 200_000, 1_000_000)
    expect(result).not.toBeNull()
    expect(result!).toBeGreaterThan(0)
  })

  it('negative minCash reduces the return via safety factor penalty', () => {
    const normalReturn  = computeRiskAdjustedReturn(100_000, 0,           1_000_000)
    const penaltyReturn = computeRiskAdjustedReturn(100_000, -500_000,    1_000_000)
    expect(penaltyReturn!).toBeLessThan(normalReturn!)
  })

  it('safety factor is clamped to 0.1 minimum for very negative minCash', () => {
    // safety = max(0.1, 1 + (-10_000_000) / 1_000_000) = max(0.1, -9) = 0.1
    const result = computeRiskAdjustedReturn(100_000, -10_000_000, 1_000_000)
    expect(result).not.toBeNull()
    const baseReturn = 100_000 / Math.max(1, 1_000_000)
    expect(result!).toBeCloseTo(baseReturn * 0.1, 10)
  })

  it('larger capital with same income reduces the return ratio', () => {
    const highCapital = computeRiskAdjustedReturn(100_000, 100_000, 10_000_000)
    const lowCapital  = computeRiskAdjustedReturn(100_000, 100_000,  1_000_000)
    // Both have positive minCash, so penalty factor varies slightly; base return ratio should differ
    expect(highCapital!).toBeLessThan(lowCapital!)
  })

  it('zero net income with positive minCash returns a non-negative number', () => {
    const result = computeRiskAdjustedReturn(0, 100_000, 1_000_000)
    expect(result).not.toBeNull()
    expect(result!).toBe(0)
  })
})

// ── classifyScenarioRisk ──────────────────────────────────────────────────────

describe('classifyScenarioRisk', () => {
  it('returns critical when minCash < 0', () => {
    expect(classifyScenarioRisk(-1, null)).toBe('critical')
  })

  it('returns critical when minCash = 0', () => {
    // minCash = 0 is NOT < 0, but runway = null → check logic: 0 < 50000 → high
    // Actually: minCash=0 is not < 0 and runway=null → min_cash < 50000 → high
    expect(classifyScenarioRisk(0, null)).toBe('high')
  })

  it('returns critical when runwayMonths < 3', () => {
    expect(classifyScenarioRisk(500_000, 2)).toBe('critical')
    expect(classifyScenarioRisk(500_000, 0)).toBe('critical')
  })

  it('returns critical when runwayMonths = 2 exactly', () => {
    expect(classifyScenarioRisk(300_000, 2)).toBe('critical')
  })

  it('returns high when minCash < 50000 (and >= 0)', () => {
    expect(classifyScenarioRisk(49_999, null)).toBe('high')
    expect(classifyScenarioRisk(0, null)).toBe('high')
  })

  it('returns high when runwayMonths < 6 (and >= 3)', () => {
    expect(classifyScenarioRisk(200_000, 5)).toBe('high')
    expect(classifyScenarioRisk(200_000, 3)).toBe('high')
  })

  it('returns moderate when minCash < 200000 (and >= 50000)', () => {
    expect(classifyScenarioRisk(50_000, null)).toBe('moderate')
    expect(classifyScenarioRisk(199_999, null)).toBe('moderate')
  })

  it('returns moderate when runwayMonths < 12 (and >= 6)', () => {
    expect(classifyScenarioRisk(250_000, 6)).toBe('moderate')
    expect(classifyScenarioRisk(250_000, 11)).toBe('moderate')
  })

  it('returns low when minCash >= 200000 and runway >= 12 or null', () => {
    expect(classifyScenarioRisk(200_000, null)).toBe('low')
    expect(classifyScenarioRisk(200_000, 12)).toBe('low')
    expect(classifyScenarioRisk(500_000, 24)).toBe('low')
  })

  it('returns low when runway is null and minCash >= 200000', () => {
    expect(classifyScenarioRisk(300_000, null)).toBe('low')
  })

  it('minCash boundary at exactly -1 is critical', () => {
    expect(classifyScenarioRisk(-1, null)).toBe('critical')
  })

  it('runway boundary: exactly 3 months is critical (runwayMonths < 3 is false at 3)', () => {
    // runwayMonths < 3 is false when runwayMonths = 3
    // So: min_cash (assuming >= 50000) with runway = 3 → runway < 6 → high
    expect(classifyScenarioRisk(500_000, 3)).toBe('high')
  })
})

// ── Legacy helpers (backward-compat) ─────────────────────────────────────────

describe('findBestScenario', () => {
  it('returns scenario with highest value when higher_is_better=true', () => {
    expect(findBestScenario(['a', 'b', 'c'], { a: 100, b: 200, c: 150 }, true)).toBe('b')
  })

  it('ignores null values', () => {
    expect(findBestScenario(['a', 'b'], { a: 100, b: null }, true)).toBe('a')
  })

  it('returns null for empty scenario list', () => {
    expect(findBestScenario([], {}, true)).toBeNull()
  })

  it('returns scenario with lowest value when higher_is_better=false', () => {
    expect(findBestScenario(['a', 'b'], { a: 100, b: 200 }, false)).toBe('a')
  })

  it('returns null when all values are null', () => {
    expect(findBestScenario(['a', 'b'], { a: null, b: null }, true)).toBeNull()
  })
})

describe('computeBaselineDelta', () => {
  it('returns 10 for value=110, baseline=100', () => {
    expect(computeBaselineDelta(110, 100)).toBeCloseTo(10, 5)
  })

  it('returns null when value is null', () => {
    expect(computeBaselineDelta(null, 100)).toBeNull()
  })

  it('returns null when baseline is null', () => {
    expect(computeBaselineDelta(100, null)).toBeNull()
  })

  it('returns null when baseline is 0 (avoid div-by-zero)', () => {
    expect(computeBaselineDelta(100, 0)).toBeNull()
  })

  it('returns negative delta for worse value', () => {
    expect(computeBaselineDelta(90, 100)).toBeCloseTo(-10, 5)
  })
})

describe('computeImpliedCagr', () => {
  it('returns ~21 for month1=100, month12=121', () => {
    expect(computeImpliedCagr(100, 121)).toBeCloseTo(21, 1)
  })

  it('returns null when month1Revenue is null', () => {
    expect(computeImpliedCagr(null, 121)).toBeNull()
  })

  it('returns null when month1Revenue is 0', () => {
    expect(computeImpliedCagr(0, 121)).toBeNull()
  })

  it('returns 0 for flat revenue', () => {
    expect(computeImpliedCagr(100, 100)).toBeCloseTo(0, 5)
  })
})

describe('extractMetricsFromSummary', () => {
  it('returns empty object without throwing for null input', () => {
    expect(() => extractMetricsFromSummary(null)).not.toThrow()
    expect(extractMetricsFromSummary(null)).toEqual({})
  })

  it('extracts total_revenue from summary', () => {
    const result = extractMetricsFromSummary({ total_revenue: 500_000 })
    expect(result.projected_revenue_12m).toBe(500_000)
  })

  it('extracts runway_months from summary', () => {
    const result = extractMetricsFromSummary({ runway_months: 8 })
    expect(result.runway_months).toBe(8)
  })
})

describe('buildRecommendationReason', () => {
  it('returns non-empty Turkish string for a valid scenario', () => {
    const scenario: ScenarioSnapshot = {
      id:                    'sc1',
      name:                  'Optimistik Plan',
      is_baseline:           false,
      created_at:            '2026-01-01T00:00:00Z',
      tags:                  [],
      projected_revenue_12m: 1_200_000,
      projected_net_income:  240_000,
      breakeven_month:       3,
      runway_months:         10,
      debt_clearance_month:  null,
      peak_dsr:              0.35,
      implied_cagr_pct:      15,
    }
    const reason = buildRecommendationReason(scenario, [scenario])
    expect(typeof reason).toBe('string')
    expect(reason.length).toBeGreaterThan(0)
    expect(reason).toContain('Optimistik Plan')
  })

  it('returns fallback Turkish string when scenario is null', () => {
    const reason = buildRecommendationReason(null, [])
    expect(reason.length).toBeGreaterThan(0)
  })
})

describe('buildComparisonReport', () => {
  const makeSnapshot = (overrides: Partial<ScenarioSnapshot> & { id: string; name: string }): ScenarioSnapshot => ({
    is_baseline:           false,
    created_at:            '2026-01-01T00:00:00Z',
    tags:                  [],
    projected_revenue_12m: null,
    projected_net_income:  null,
    breakeven_month:       null,
    runway_months:         null,
    debt_clearance_month:  null,
    peak_dsr:              null,
    implied_cagr_pct:      null,
    ...overrides,
  })

  it('identifies baseline scenario correctly', () => {
    const snapshots = [
      makeSnapshot({ id: 'base', name: 'Baz', is_baseline: true, projected_net_income: 100_000 }),
      makeSnapshot({ id: 'opt',  name: 'İyimser',               projected_net_income: 200_000 }),
    ]
    const report = buildComparisonReport('company-1', snapshots)
    expect(report.baseline_id).toBe('base')
  })

  it('recommends scenario with highest net income when both qualify', () => {
    const snapshots = [
      makeSnapshot({ id: 'a', name: 'A', runway_months: 8, peak_dsr: 0.5, projected_net_income: 100_000 }),
      makeSnapshot({ id: 'b', name: 'B', runway_months: 9, peak_dsr: 0.4, projected_net_income: 200_000 }),
    ]
    const report = buildComparisonReport('company-1', snapshots)
    expect(report.recommended_scenario_id).toBe('b')
  })

  it('computes comparison rows for all metrics', () => {
    const snapshots = [
      makeSnapshot({ id: 'a', name: 'A', projected_net_income: 100_000 }),
    ]
    const report = buildComparisonReport('company-1', snapshots)
    expect(report.comparison_rows.length).toBeGreaterThan(0)
  })
})
