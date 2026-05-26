/**
 * Tests for lib/services/commercial/sales-funnel.service.ts
 *
 * Pure helper tests only — no DB calls.
 * Run with: npx vitest run tests/sales-funnel.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  computeConversionRate,
  computeDropOff,
  findBottleneckStage,
  buildBottleneckLabel,
  type FunnelStage,
} from '../lib/services/commercial/sales-funnel.service'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeStage(overrides: Partial<FunnelStage> = {}): FunnelStage {
  return {
    stage: overrides.stage ?? 'proforma_created',
    label: overrides.label ?? 'Test Aşaması',
    count: overrides.count ?? 10,
    total_value_try: overrides.total_value_try ?? 0,
    conversion_rate_pct: overrides.conversion_rate_pct !== undefined ? overrides.conversion_rate_pct : null,
    avg_days_in_stage: overrides.avg_days_in_stage !== undefined ? overrides.avg_days_in_stage : null,
    drop_off_pct: overrides.drop_off_pct !== undefined ? overrides.drop_off_pct : null,
  }
}

// ── computeConversionRate ─────────────────────────────────────────────────────

describe('computeConversionRate', () => {
  it('normal case: 60 / 100 = 60%', () => {
    expect(computeConversionRate(60, 100)).toBe(60)
  })

  it('zero previous → returns null (cannot divide)', () => {
    expect(computeConversionRate(10, 0)).toBeNull()
  })

  it('both zero → returns null (previous is 0)', () => {
    expect(computeConversionRate(0, 0)).toBeNull()
  })

  it('100% case: all converted', () => {
    expect(computeConversionRate(50, 50)).toBe(100)
  })

  it('current > previous → over 100% rounded correctly', () => {
    // Edge: 150/100 = 150%
    expect(computeConversionRate(150, 100)).toBe(150)
  })

  it('fractional result is rounded to 1 decimal', () => {
    // 1/3 ≈ 33.3%
    const result = computeConversionRate(1, 3)
    expect(result).toBeCloseTo(33.3, 1)
  })
})

// ── computeDropOff ────────────────────────────────────────────────────────────

describe('computeDropOff', () => {
  it('null input → returns null', () => {
    expect(computeDropOff(null)).toBeNull()
  })

  it('60% conversion → 40% drop-off', () => {
    expect(computeDropOff(60)).toBe(40)
  })

  it('100% conversion → 0% drop-off', () => {
    expect(computeDropOff(100)).toBe(0)
  })

  it('0% conversion → 100% drop-off', () => {
    expect(computeDropOff(0)).toBe(100)
  })

  it('75.5% conversion → 24.5% drop-off (1 decimal precision)', () => {
    expect(computeDropOff(75.5)).toBeCloseTo(24.5, 1)
  })
})

// ── findBottleneckStage ───────────────────────────────────────────────────────

describe('findBottleneckStage', () => {
  it('empty array → returns null', () => {
    expect(findBottleneckStage([])).toBeNull()
  })

  it('single stage → returns null (first stage excluded)', () => {
    const stages = [makeStage({ stage: 'proforma_created', conversion_rate_pct: null })]
    expect(findBottleneckStage(stages)).toBeNull()
  })

  it('finds the stage with the worst (lowest) conversion rate', () => {
    const stages: FunnelStage[] = [
      makeStage({ stage: 'proforma_created', label: 'Oluşturuldu', conversion_rate_pct: null }),
      makeStage({ stage: 'proforma_sent',    label: 'Gönderildi',  conversion_rate_pct: 80 }),
      makeStage({ stage: 'proforma_approved', label: 'Onaylandı', conversion_rate_pct: 40 }),
      makeStage({ stage: 'sale_confirmed',   label: 'Onaylandı',  conversion_rate_pct: 60 }),
    ]
    const result = findBottleneckStage(stages)
    expect(result?.stage).toBe('proforma_approved')
    expect(result?.conversion_rate_pct).toBe(40)
  })

  it('all stages with null conversion except one → returns that one', () => {
    const stages: FunnelStage[] = [
      makeStage({ stage: 'proforma_created',  conversion_rate_pct: null }),
      makeStage({ stage: 'proforma_sent',     conversion_rate_pct: null }),
      makeStage({ stage: 'sale_confirmed',    conversion_rate_pct: 55 }),
    ]
    const result = findBottleneckStage(stages)
    expect(result?.conversion_rate_pct).toBe(55)
  })

  it('all stages with null conversion (excluding first) → returns null', () => {
    const stages: FunnelStage[] = [
      makeStage({ stage: 'proforma_created', conversion_rate_pct: null }),
      makeStage({ stage: 'proforma_sent',    conversion_rate_pct: null }),
    ]
    expect(findBottleneckStage(stages)).toBeNull()
  })
})

// ── buildBottleneckLabel ──────────────────────────────────────────────────────

describe('buildBottleneckLabel', () => {
  it('null input → returns null', () => {
    expect(buildBottleneckLabel(null)).toBeNull()
  })

  it('normal stage → produces Turkish string with label and %', () => {
    const stage = makeStage({
      stage: 'proforma_approved',
      label: 'Proforma Onaylandı',
      conversion_rate_pct: 42,
    })
    const result = buildBottleneckLabel(stage)
    expect(result).toBeTruthy()
    expect(result).toContain('Proforma Onaylandı')
    expect(result).toContain('%42')
    expect(result).toContain('En büyük kayıp')
  })

  it('null conversion_rate_pct → falls back to %? in label', () => {
    const stage = makeStage({
      label: 'Satış Onaylandı',
      conversion_rate_pct: null,
    })
    const result = buildBottleneckLabel(stage)
    expect(result).toContain('%?')
  })
})
