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
