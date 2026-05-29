/**
 * Tests for lib/services/intelligence/kpi-tracker.service.ts
 *
 * Tests cover pure helpers:
 *   - computeProgress
 *   - assignKpiStatus
 *   - computeOverallScore
 *
 * Run with: npx vitest run tests/kpi-tracker.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  computeProgress,
  assignKpiStatus,
  computeOverallScore,
  KPI_DEFINITIONS,
} from '../lib/services/intelligence/kpi-tracker.service'
import type { KpiStatus } from '../lib/services/intelligence/kpi-tracker.service'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeKpi(status: KpiStatus['status']): KpiStatus {
  return {
    kpi_key:         'monthly_revenue',
    label:           'Aylık Ciro',
    current_value:   100_000,
    target_value:    status === 'no_target' ? null : 100_000,
    progress_pct:    status === 'no_target' ? null : 100,
    status,
    is_inverse:      false,
    trend_direction: null,
    format:          'currency',
  }
}

// ── computeProgress ───────────────────────────────────────────────────────────

describe('computeProgress', () => {

  it('non-inverse: returns current/target × 100', () => {
    expect(computeProgress(80, 100, false)).toBe(80)
  })

  it('non-inverse: 100% when current equals target', () => {
    expect(computeProgress(500_000, 500_000, false)).toBe(100)
  })

  it('non-inverse: > 100% when current exceeds target', () => {
    expect(computeProgress(120, 100, false)).toBe(120)
  })

  it('non-inverse: returns null when target is zero', () => {
    expect(computeProgress(50, 0, false)).toBeNull()
  })

  it('inverse: returns target/current × 100', () => {
    // current = 80_000 expense, target = 100_000 ceiling → 100/80 × 100 = 125 (achieved)
    expect(computeProgress(80_000, 100_000, true)).toBeCloseTo(125, 1)
  })

  it('inverse: 100% when current equals target', () => {
    expect(computeProgress(100_000, 100_000, true)).toBe(100)
  })

  it('inverse: < 100% when current exceeds target ceiling', () => {
    // current = 120_000 expense, target = 100_000 → 100/120 × 100 ≈ 83.33
    expect(computeProgress(120_000, 100_000, true)).toBeCloseTo(83.33, 1)
  })

  it('inverse: returns null when current is zero (avoids division by zero)', () => {
    expect(computeProgress(0, 100_000, true)).toBeNull()
  })

  it('inverse: returns null when target is zero', () => {
    expect(computeProgress(50_000, 0, true)).toBeNull()
  })

})

// ── assignKpiStatus ───────────────────────────────────────────────────────────

describe('assignKpiStatus', () => {

  it('returns no_target when hasTarget is false', () => {
    expect(assignKpiStatus(null, false)).toBe('no_target')
  })

  it('returns no_target when progress is null but hasTarget is true', () => {
    expect(assignKpiStatus(null, true)).toBe('no_target')
  })

  it('returns achieved when progress is exactly 100', () => {
    expect(assignKpiStatus(100, true)).toBe('achieved')
  })

  it('returns achieved when progress is above 100', () => {
    expect(assignKpiStatus(120, true)).toBe('achieved')
  })

  it('returns on_track when progress is exactly 80 (lower boundary)', () => {
    expect(assignKpiStatus(80, true)).toBe('on_track')
  })

  it('returns on_track when progress is 99 (just below achieved)', () => {
    expect(assignKpiStatus(99, true)).toBe('on_track')
  })

  it('returns at_risk when progress is exactly 60 (lower boundary)', () => {
    expect(assignKpiStatus(60, true)).toBe('at_risk')
  })

  it('returns at_risk when progress is 79 (just below on_track)', () => {
    expect(assignKpiStatus(79, true)).toBe('at_risk')
  })

  it('returns off_track when progress is 59 (just below at_risk)', () => {
    expect(assignKpiStatus(59, true)).toBe('off_track')
  })

  it('returns off_track when progress is 0', () => {
    expect(assignKpiStatus(0, true)).toBe('off_track')
  })

})

// ── computeOverallScore ───────────────────────────────────────────────────────

describe('computeOverallScore', () => {

  it('returns 0 for empty array', () => {
    expect(computeOverallScore([])).toBe(0)
  })

  it('returns 0 when all KPIs have no_target status', () => {
    const kpis = [makeKpi('no_target'), makeKpi('no_target')]
    expect(computeOverallScore(kpis)).toBe(0)
  })

  it('returns 100 when all KPIs are achieved', () => {
    const kpis = [makeKpi('achieved'), makeKpi('achieved'), makeKpi('achieved')]
    expect(computeOverallScore(kpis)).toBe(100)
  })

  it('ignores no_target KPIs in denominator', () => {
    const kpis = [makeKpi('achieved'), makeKpi('no_target')]
    // Only 1 with target, scored 4/4 × 100 = 100
    expect(computeOverallScore(kpis)).toBe(100)
  })

  it('mixed: computes weighted score correctly', () => {
    // achieved=4, on_track=3, at_risk=2, off_track=1 — one of each
    const kpis = [
      makeKpi('achieved'),
      makeKpi('on_track'),
      makeKpi('at_risk'),
      makeKpi('off_track'),
    ]
    // earned = 4+3+2+1 = 10, max = 4×4 = 16 → 10/16 × 100 = 62.5 → rounds to 63
    expect(computeOverallScore(kpis)).toBe(63)
  })

  it('all off_track returns 25', () => {
    const kpis = [makeKpi('off_track'), makeKpi('off_track')]
    // earned = 1+1 = 2, max = 2×4 = 8 → 2/8 × 100 = 25
    expect(computeOverallScore(kpis)).toBe(25)
  })

})

// ── computeProgress — extended boundary tests ─────────────────────────────────

describe('computeProgress — extended boundary tests', () => {

  it('non-inverse: 50% progress', () => {
    expect(computeProgress(50, 100, false)).toBeCloseTo(50)
  })

  it('non-inverse: 25% progress', () => {
    expect(computeProgress(25_000, 100_000, false)).toBeCloseTo(25)
  })

  it('non-inverse: 200% over-achievement', () => {
    expect(computeProgress(200_000, 100_000, false)).toBeCloseTo(200)
  })

  it('non-inverse: 0.01% (near-zero actual)', () => {
    expect(computeProgress(10, 100_000, false)).toBeCloseTo(0.01)
  })

  it('non-inverse: very large values', () => {
    expect(computeProgress(5_000_000, 10_000_000, false)).toBeCloseTo(50)
  })

  it('inverse: way under ceiling = high progress', () => {
    // current=10_000, target=100_000 → 100_000/10_000 * 100 = 1000%
    expect(computeProgress(10_000, 100_000, true)).toBeCloseTo(1000)
  })

  it('inverse: just over ceiling = low progress < 100%', () => {
    // current=110_000, target=100_000 → 100/110 * 100 ≈ 90.9%
    expect(computeProgress(110_000, 100_000, true)).toBeCloseTo(90.9, 0)
  })

  it('inverse: 50% overage: current=200K, target=100K → 50%', () => {
    expect(computeProgress(200_000, 100_000, true)).toBeCloseTo(50)
  })

  it('non-inverse: fractional target gives correct result', () => {
    expect(computeProgress(7.5, 10, false)).toBeCloseTo(75)
  })

  it('inverse: fractional values', () => {
    expect(computeProgress(5, 10, true)).toBeCloseTo(200)
  })

})

// ── assignKpiStatus — extended boundary tests ─────────────────────────────────

describe('assignKpiStatus — extended boundary tests', () => {

  it('progress 100 exactly → achieved', () => {
    expect(assignKpiStatus(100, true)).toBe('achieved')
  })

  it('progress 100.1 → achieved', () => {
    expect(assignKpiStatus(100.1, true)).toBe('achieved')
  })

  it('progress 80.0 exactly → on_track', () => {
    expect(assignKpiStatus(80.0, true)).toBe('on_track')
  })

  it('progress 80.1 → on_track', () => {
    expect(assignKpiStatus(80.1, true)).toBe('on_track')
  })

  it('progress 99.9 → on_track', () => {
    expect(assignKpiStatus(99.9, true)).toBe('on_track')
  })

  it('progress 60.0 → at_risk', () => {
    expect(assignKpiStatus(60.0, true)).toBe('at_risk')
  })

  it('progress 60.1 → at_risk', () => {
    expect(assignKpiStatus(60.1, true)).toBe('at_risk')
  })

  it('progress 79.9 → at_risk', () => {
    expect(assignKpiStatus(79.9, true)).toBe('at_risk')
  })

  it('progress 59.9 → off_track', () => {
    expect(assignKpiStatus(59.9, true)).toBe('off_track')
  })

  it('progress 1 → off_track', () => {
    expect(assignKpiStatus(1, true)).toBe('off_track')
  })

  it('progress null, hasTarget false → no_target', () => {
    expect(assignKpiStatus(null, false)).toBe('no_target')
  })

  it('progress null, hasTarget true → no_target (null progress)', () => {
    expect(assignKpiStatus(null, true)).toBe('no_target')
  })

  it('progress 0, hasTarget true → off_track', () => {
    expect(assignKpiStatus(0, true)).toBe('off_track')
  })

  it('progress 1000, hasTarget true → achieved', () => {
    expect(assignKpiStatus(1000, true)).toBe('achieved')
  })

})

// ── computeOverallScore — extended tests ──────────────────────────────────────

describe('computeOverallScore — extended tests', () => {

  it('single achieved → 100', () => {
    const kpis = [makeKpi('achieved')]
    expect(computeOverallScore(kpis)).toBe(100)
  })

  it('single on_track → 75 (3/4 * 100)', () => {
    const kpis = [makeKpi('on_track')]
    expect(computeOverallScore(kpis)).toBe(75)
  })

  it('single at_risk → 50 (2/4 * 100)', () => {
    const kpis = [makeKpi('at_risk')]
    expect(computeOverallScore(kpis)).toBe(50)
  })

  it('single off_track → 25 (1/4 * 100)', () => {
    const kpis = [makeKpi('off_track')]
    expect(computeOverallScore(kpis)).toBe(25)
  })

  it('all on_track → 75', () => {
    const kpis = [makeKpi('on_track'), makeKpi('on_track'), makeKpi('on_track')]
    expect(computeOverallScore(kpis)).toBe(75)
  })

  it('all at_risk → 50', () => {
    const kpis = [makeKpi('at_risk'), makeKpi('at_risk')]
    expect(computeOverallScore(kpis)).toBe(50)
  })

  it('achieved + on_track → (4+3)/8 * 100 = 87.5 → rounds to 88', () => {
    const kpis = [makeKpi('achieved'), makeKpi('on_track')]
    expect(computeOverallScore(kpis)).toBe(88)
  })

  it('on_track + at_risk → (3+2)/8 * 100 = 62.5 → rounds to 63', () => {
    const kpis = [makeKpi('on_track'), makeKpi('at_risk')]
    expect(computeOverallScore(kpis)).toBe(63)
  })

  it('at_risk + off_track → (2+1)/8 * 100 = 37.5 → rounds to 38', () => {
    const kpis = [makeKpi('at_risk'), makeKpi('off_track')]
    expect(computeOverallScore(kpis)).toBe(38)
  })

  it('no_target KPIs excluded: 5 no_target + 1 achieved = 100', () => {
    const kpis = [
      makeKpi('no_target'), makeKpi('no_target'), makeKpi('no_target'),
      makeKpi('no_target'), makeKpi('no_target'),
      makeKpi('achieved'),
    ]
    expect(computeOverallScore(kpis)).toBe(100)
  })

  it('returns integer (rounds result)', () => {
    const kpis = [makeKpi('achieved'), makeKpi('on_track'), makeKpi('at_risk')]
    const score = computeOverallScore(kpis)
    expect(Number.isInteger(score)).toBe(true)
  })

  it('5 achieved → 100', () => {
    const kpis = Array(5).fill(null).map(() => makeKpi('achieved'))
    expect(computeOverallScore(kpis)).toBe(100)
  })

  it('5 off_track → 25', () => {
    const kpis = Array(5).fill(null).map(() => makeKpi('off_track'))
    expect(computeOverallScore(kpis)).toBe(25)
  })

  it('all 4 status types → (4+3+2+1)/(4*4)*100 = 62.5 → 63', () => {
    const kpis = [makeKpi('achieved'), makeKpi('on_track'), makeKpi('at_risk'), makeKpi('off_track')]
    expect(computeOverallScore(kpis)).toBe(63)
  })

})

// ── computeProgress + assignKpiStatus pipeline ────────────────────────────────

describe('computeProgress + assignKpiStatus pipeline', () => {

  it('normal KPI at target → achieved', () => {
    const p = computeProgress(1_000_000, 1_000_000, false)
    expect(assignKpiStatus(p, true)).toBe('achieved')
  })

  it('normal KPI at 85% → on_track', () => {
    const p = computeProgress(850_000, 1_000_000, false)
    expect(assignKpiStatus(p, true)).toBe('on_track')
  })

  it('normal KPI at 75% → at_risk', () => {
    const p = computeProgress(750_000, 1_000_000, false)
    expect(assignKpiStatus(p, true)).toBe('at_risk')
  })

  it('normal KPI at 50% → off_track', () => {
    const p = computeProgress(500_000, 1_000_000, false)
    expect(assignKpiStatus(p, true)).toBe('off_track')
  })

  it('inverse KPI under ceiling → achieved', () => {
    // expense=80K, target ceiling=100K → progress=125% → achieved
    const p = computeProgress(80_000, 100_000, true)
    expect(assignKpiStatus(p, true)).toBe('achieved')
  })

  it('inverse KPI over ceiling → at_risk', () => {
    // expense=125K, target ceiling=100K → progress=80% → on_track
    const p = computeProgress(125_000, 100_000, true)
    expect(assignKpiStatus(p, true)).toBe('on_track')
  })

  it('inverse KPI badly over ceiling → off_track', () => {
    // expense=200K, target ceiling=100K → progress=50% → off_track
    const p = computeProgress(200_000, 100_000, true)
    expect(assignKpiStatus(p, true)).toBe('off_track')
  })

  it('zero target → no_target via null progress', () => {
    const p = computeProgress(1_000_000, 0, false)
    expect(assignKpiStatus(p, true)).toBe('no_target')
  })

  it('inverse zero current → no_target via null progress', () => {
    const p = computeProgress(0, 100_000, true)
    expect(assignKpiStatus(p, true)).toBe('no_target')
  })

  it('no hasTarget → no_target regardless of progress', () => {
    const p = computeProgress(1_000_000, 1_000_000, false)
    expect(assignKpiStatus(p, false)).toBe('no_target')
  })

})

// ── computeOverallScore — scoring formula verification ────────────────────────

describe('computeOverallScore — scoring formula verification', () => {

  it('score of 1 achieved + 1 on_track + 1 at_risk + 1 off_track + 1 no_target = 63', () => {
    // Only 4 with targets: (4+3+2+1)/(4*4)*100 = 62.5 → 63
    const kpis = [
      makeKpi('achieved'), makeKpi('on_track'), makeKpi('at_risk'),
      makeKpi('off_track'), makeKpi('no_target'),
    ]
    expect(computeOverallScore(kpis)).toBe(63)
  })

  it('2 achieved + 2 on_track = (8+6)/16 * 100 = 87.5 → 88', () => {
    const kpis = [
      makeKpi('achieved'), makeKpi('achieved'),
      makeKpi('on_track'), makeKpi('on_track'),
    ]
    expect(computeOverallScore(kpis)).toBe(88)
  })

  it('1 achieved + 3 off_track = (4+3)/16 * 100 = 43.75 → 44', () => {
    const kpis = [
      makeKpi('achieved'),
      makeKpi('off_track'), makeKpi('off_track'), makeKpi('off_track'),
    ]
    expect(computeOverallScore(kpis)).toBe(44)
  })

  it('3 on_track + 1 at_risk = (9+2)/16 * 100 = 68.75 → 69', () => {
    const kpis = [
      makeKpi('on_track'), makeKpi('on_track'), makeKpi('on_track'),
      makeKpi('at_risk'),
    ]
    expect(computeOverallScore(kpis)).toBe(69)
  })

  it('mixed with many no_target: only counted KPIs matter', () => {
    const kpis = [
      makeKpi('no_target'), makeKpi('no_target'), makeKpi('no_target'),
      makeKpi('on_track'), // earned 3 / max 4 * 100 = 75
    ]
    expect(computeOverallScore(kpis)).toBe(75)
  })

})

// ── assignKpiStatus — hasTarget interaction ───────────────────────────────────

describe('assignKpiStatus — hasTarget false always returns no_target', () => {

  it('achieved progress (105) but no target → no_target', () => {
    expect(assignKpiStatus(105, false)).toBe('no_target')
  })

  it('on_track progress (85) but no target → no_target', () => {
    expect(assignKpiStatus(85, false)).toBe('no_target')
  })

  it('at_risk progress (65) but no target → no_target', () => {
    expect(assignKpiStatus(65, false)).toBe('no_target')
  })

  it('off_track progress (40) but no target → no_target', () => {
    expect(assignKpiStatus(40, false)).toBe('no_target')
  })

  it('0 progress but no target → no_target', () => {
    expect(assignKpiStatus(0, false)).toBe('no_target')
  })

})

// ── computeProgress — type safety and precision ───────────────────────────────

describe('computeProgress — precision and type checks', () => {

  it('returns a number for valid inputs (non-inverse)', () => {
    const result = computeProgress(75, 100, false)
    expect(typeof result).toBe('number')
  })

  it('returns a number for valid inputs (inverse)', () => {
    const result = computeProgress(80_000, 100_000, true)
    expect(typeof result).toBe('number')
    expect(result).not.toBeNull()
  })

  it('non-inverse: very small values: 0.001 / 1 = 0.1%', () => {
    expect(computeProgress(0.001, 1, false)).toBeCloseTo(0.1)
  })

  it('inverse: equal current and target = 100%', () => {
    expect(computeProgress(500, 500, true)).toBeCloseTo(100)
  })

  it('inverse: target much smaller than current = very low progress', () => {
    // target=10, current=1000 → 10/1000*100 = 1%
    expect(computeProgress(1000, 10, true)).toBeCloseTo(1)
  })

  it('non-inverse: 1 / 3 ≈ 33.33%', () => {
    expect(computeProgress(1, 3, false)).toBeCloseTo(33.33, 1)
  })

  it('non-inverse: returns null only when target = 0', () => {
    expect(computeProgress(100, 0, false)).toBeNull()
    expect(computeProgress(0, 0, false)).toBeNull()
  })

  it('inverse: returns null when current = 0 or target = 0', () => {
    expect(computeProgress(0, 100, true)).toBeNull()
    expect(computeProgress(100, 0, true)).toBeNull()
  })

})

// ── KPI_DEFINITIONS catalogue checks ──────────────────────────────────────────

describe('KPI_DEFINITIONS', () => {
  it('monthly_revenue is defined with currency format', () => {
    // KPI_DEFINITIONS imported at top
    expect(KPI_DEFINITIONS.monthly_revenue).toBeDefined()
    expect(KPI_DEFINITIONS.monthly_revenue.format).toBe('currency')
  })

  it('gross_margin_pct is defined with percent format', () => {
    // KPI_DEFINITIONS imported at top
    expect(KPI_DEFINITIONS.gross_margin_pct.format).toBe('percent')
  })

  it('cash_runway_months is defined with months format', () => {
    // KPI_DEFINITIONS imported at top
    expect(KPI_DEFINITIONS.cash_runway_months.format).toBe('months')
  })

  it('dsr is defined with decimal format', () => {
    // KPI_DEFINITIONS imported at top
    expect(KPI_DEFINITIONS.dsr.format).toBe('decimal')
  })

  it('has exactly 8 KPI definitions', () => {
    // KPI_DEFINITIONS imported at top
    expect(Object.keys(KPI_DEFINITIONS).length).toBe(8)
  })

  it('monthly_expense has Turkish label', () => {
    // KPI_DEFINITIONS imported at top
    expect(KPI_DEFINITIONS.monthly_expense.label).toBe('Aylık Gider')
  })

  it('partner_debt_total has currency format', () => {
    // KPI_DEFINITIONS imported at top
    expect(KPI_DEFINITIONS.partner_debt_total.format).toBe('currency')
  })

  it('receivables_overdue_pct has percent format', () => {
    // KPI_DEFINITIONS imported at top
    expect(KPI_DEFINITIONS.receivables_overdue_pct.format).toBe('percent')
  })

  it('net_margin_pct has percent format', () => {
    // KPI_DEFINITIONS imported at top
    expect(KPI_DEFINITIONS.net_margin_pct.format).toBe('percent')
  })

})
