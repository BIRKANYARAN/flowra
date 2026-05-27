// tests/scenario-comparison.test.ts
// Unit tests for lib/services/planning/scenario-comparison.service.ts

import { describe, it, expect } from 'vitest'
import {
  findBestScenario,
  computeBaselineDelta,
  computeImpliedCagr,
  buildRecommendationReason,
  extractMetricsFromSummary,
  buildComparisonReport,
  type ScenarioSnapshot,
} from '@/lib/services/planning/scenario-comparison.service'

// ── findBestScenario ──────────────────────────────────────────────────────────

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

  it('returns scenario with lowest value when higher_is_better=false (lower is better)', () => {
    expect(findBestScenario(['a', 'b'], { a: 100, b: 200 }, false)).toBe('a')
  })

  it('returns null when all values are null', () => {
    expect(findBestScenario(['a', 'b'], { a: null, b: null }, true)).toBeNull()
  })

  it('handles single scenario', () => {
    expect(findBestScenario(['a'], { a: 50 }, true)).toBe('a')
  })

  it('handles tie by returning the first encountered winner', () => {
    const result = findBestScenario(['a', 'b'], { a: 100, b: 100 }, true)
    // First one wins on tie (strict >)
    expect(result).toBe('a')
  })
})

// ── computeBaselineDelta ──────────────────────────────────────────────────────

describe('computeBaselineDelta', () => {
  it('returns 10 for value=110, baseline=100 (10% improvement)', () => {
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

  it('returns 0 for identical values', () => {
    expect(computeBaselineDelta(100, 100)).toBeCloseTo(0, 5)
  })

  it('handles negative baseline correctly', () => {
    // value=-90, baseline=-100: delta = (-90 - (-100)) / |-100| × 100 = 10/100 × 100 = 10
    expect(computeBaselineDelta(-90, -100)).toBeCloseTo(10, 5)
  })
})

// ── computeImpliedCagr ────────────────────────────────────────────────────────

describe('computeImpliedCagr', () => {
  it('returns ~21 for month1=100, month12=121 (21% annual growth)', () => {
    // 12 months = 1 year, CAGR = (121/100)^1 - 1 = 0.21 = 21%
    expect(computeImpliedCagr(100, 121)).toBeCloseTo(21, 1)
  })

  it('returns null when month1Revenue is null', () => {
    expect(computeImpliedCagr(null, 121)).toBeNull()
  })

  it('returns null when month12Revenue is null', () => {
    expect(computeImpliedCagr(100, null)).toBeNull()
  })

  it('returns null when month1Revenue is 0 (avoid div-by-zero)', () => {
    expect(computeImpliedCagr(0, 121)).toBeNull()
  })

  it('returns 0 for flat revenue (month1 == month12)', () => {
    expect(computeImpliedCagr(100, 100)).toBeCloseTo(0, 5)
  })

  it('returns negative for declining revenue', () => {
    expect(computeImpliedCagr(100, 80)).toBeCloseTo(-20, 1)
  })
})

// ── extractMetricsFromSummary ─────────────────────────────────────────────────

describe('extractMetricsFromSummary', () => {
  it('returns empty object without throwing for null input', () => {
    expect(() => extractMetricsFromSummary(null)).not.toThrow()
    expect(extractMetricsFromSummary(null)).toEqual({})
  })

  it('extracts total_revenue from summary', () => {
    const result = extractMetricsFromSummary({ total_revenue: 500_000 })
    expect(result.projected_revenue_12m).toBe(500_000)
  })

  it('falls back to projected_revenue_12m key', () => {
    const result = extractMetricsFromSummary({ projected_revenue_12m: 300_000 })
    expect(result.projected_revenue_12m).toBe(300_000)
  })

  it('extracts net_income from summary', () => {
    const result = extractMetricsFromSummary({ net_income: 120_000 })
    expect(result.projected_net_income).toBe(120_000)
  })

  it('extracts runway_months from summary', () => {
    const result = extractMetricsFromSummary({ runway_months: 8 })
    expect(result.runway_months).toBe(8)
  })

  it('extracts peak_dsr from summary', () => {
    const result = extractMetricsFromSummary({ peak_dsr: 0.45 })
    expect(result.peak_dsr).toBeCloseTo(0.45)
  })

  it('computes implied_cagr_pct from monthly_revenues array', () => {
    const monthlyRevenues = Array.from({ length: 12 }, (_, i) => 100 + i * 2)
    // month1=100, month12=122 → CAGR ~ 22%
    const result = extractMetricsFromSummary({ monthly_revenues: monthlyRevenues })
    expect(result.implied_cagr_pct).toBeCloseTo(22, 0)
  })

  it('handles non-finite numbers gracefully', () => {
    const result = extractMetricsFromSummary({ total_revenue: 'invalid' })
    expect(result.projected_revenue_12m).toBeNull()
  })
})

// ── buildRecommendationReason ─────────────────────────────────────────────────

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
    expect(typeof reason).toBe('string')
    expect(reason.length).toBeGreaterThan(0)
  })

  it('mentions "senaryo" or "Senaryo" in the output', () => {
    const reason = buildRecommendationReason(null, [])
    expect(reason.toLowerCase()).toMatch(/senaryo/)
  })
})

// ── buildComparisonReport (integration) ──────────────────────────────────────

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
    const netIncomeRow = report.comparison_rows.find(r => r.metric_key === 'projected_net_income')
    expect(netIncomeRow).toBeDefined()
    expect(netIncomeRow?.values['a']).toBe(100_000)
  })

  it('returns empty baseline_deltas when no baseline exists', () => {
    const snapshots = [
      makeSnapshot({ id: 'a', name: 'A', projected_net_income: 100_000 }),
      makeSnapshot({ id: 'b', name: 'B', projected_net_income: 150_000 }),
    ]
    const report = buildComparisonReport('company-1', snapshots)
    const row = report.comparison_rows.find(r => r.metric_key === 'projected_net_income')
    expect(Object.keys(row?.baseline_deltas ?? {})).toHaveLength(0)
  })
})
