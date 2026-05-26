/**
 * Period-over-Period Comparison — unit tests
 *
 * Tests pure helper functions: computeChangePct, computeDirection,
 * buildSummaryLine, computeMarginPct.
 * No DB or network calls — all pure function tests.
 */

import { describe, it, expect } from 'vitest'
import {
  computeChangePct,
  computeDirection,
  computeMarginPct,
  buildSummaryLine,
} from '../lib/services/finance/period-comparison.service'
import type { MetricComparison } from '../lib/services/finance/period-comparison.service'

// ── computeChangePct ──────────────────────────────────────────────────────────

describe('computeChangePct — pure', () => {

  it('1. normal positive growth', () => {
    // (115 - 100) / 100 * 100 = 15
    expect(computeChangePct(115, 100)).toBeCloseTo(15)
  })

  it('2. prior = 0 → null', () => {
    expect(computeChangePct(500, 0)).toBeNull()
  })

  it('3. both zero → null (prior = 0)', () => {
    expect(computeChangePct(0, 0)).toBeNull()
  })

  it('4. negative current (loss scenario)', () => {
    // (-20 - 100) / 100 * 100 = -120
    expect(computeChangePct(-20, 100)).toBeCloseTo(-120)
  })

  it('5. decline: current < prior', () => {
    // (80 - 100) / 100 * 100 = -20
    expect(computeChangePct(80, 100)).toBeCloseTo(-20)
  })

  it('6. negative prior (absolute value used)', () => {
    // (0 - (-50)) / 50 * 100 = 100
    expect(computeChangePct(0, -50)).toBeCloseTo(100)
  })

  it('7. exact same values → 0%', () => {
    expect(computeChangePct(1000, 1000)).toBeCloseTo(0)
  })
})

// ── computeDirection ─────────────────────────────────────────────────────────

describe('computeDirection — pure', () => {

  it('8. null changePct → flat', () => {
    expect(computeDirection(null)).toBe('flat')
  })

  it('9. changePct = 1.5% → up', () => {
    expect(computeDirection(1.5)).toBe('up')
  })

  it('10. changePct = -1.5% → down', () => {
    expect(computeDirection(-1.5)).toBe('down')
  })

  it('11. changePct = 0.5% → flat (within ±1%)', () => {
    expect(computeDirection(0.5)).toBe('flat')
  })

  it('12. changePct = -0.5% → flat (within ±1%)', () => {
    expect(computeDirection(-0.5)).toBe('flat')
  })

  it('13. changePct exactly 1% → flat (boundary: NOT > 1, so flat)', () => {
    expect(computeDirection(1)).toBe('flat')
  })

  it('14. changePct exactly -1% → flat (boundary: NOT < -1, so flat)', () => {
    expect(computeDirection(-1)).toBe('flat')
  })

  it('15. large positive → up', () => {
    expect(computeDirection(50)).toBe('up')
  })
})

// ── computeMarginPct ─────────────────────────────────────────────────────────

describe('computeMarginPct — pure', () => {

  it('16. normal margin: 30k / 100k = 30%', () => {
    expect(computeMarginPct(30_000, 100_000)).toBeCloseTo(30)
  })

  it('17. zero denominator → null', () => {
    expect(computeMarginPct(5_000, 0)).toBeNull()
  })

  it('18. zero numerator → 0%', () => {
    expect(computeMarginPct(0, 100_000)).toBeCloseTo(0)
  })

  it('19. negative numerator (loss) → negative pct', () => {
    expect(computeMarginPct(-10_000, 100_000)).toBeCloseTo(-10)
  })

  it('20. 100% margin', () => {
    expect(computeMarginPct(100_000, 100_000)).toBeCloseTo(100)
  })
})

// ── buildSummaryLine ─────────────────────────────────────────────────────────

describe('buildSummaryLine — pure', () => {

  function makeComparison(
    metric: string,
    label: string,
    cur: number,
    prr: number,
    isPositiveWhenUp: boolean,
  ): MetricComparison {
    const change_try = cur - prr
    const change_pct = prr !== 0 ? ((cur - prr) / Math.abs(prr)) * 100 : null
    const direction: MetricComparison['direction'] =
      change_pct === null ? 'flat'
      : change_pct > 1 ? 'up'
      : change_pct < -1 ? 'down'
      : 'flat'
    return {
      metric,
      label,
      current_value: cur,
      prior_value: prr,
      change_try,
      change_pct,
      direction,
      is_positive: isPositiveWhenUp ? direction === 'up' : direction === 'down',
    }
  }

  it('21. revenue up + net income down → contains arttı and geriledi', () => {
    const comps: MetricComparison[] = [
      makeComparison('revenue',    'Ciro',     115_000, 100_000, true),
      makeComparison('net_income', 'Net Gelir', 9_200,  10_000, true),
    ]
    const line = buildSummaryLine(comps, 'yoy')
    expect(line).toContain('arttı')
    expect(line).toContain('geriledi')
  })

  it('22. all up → contains arttı twice (or yükseldi)', () => {
    const comps: MetricComparison[] = [
      makeComparison('revenue',    'Ciro',     120_000, 100_000, true),
      makeComparison('net_income', 'Net Gelir', 12_000,  10_000, true),
    ]
    const line = buildSummaryLine(comps, 'yoy')
    // Revenue uses 'arttı', net income uses 'yükseldi'
    expect(line).toContain('arttı')
    expect(line).toContain('yükseldi')
  })

  it('23. revenue prior = 0 → karşılaştırılamadı', () => {
    const comps: MetricComparison[] = [
      makeComparison('revenue',    'Ciro',     50_000, 0, true),
      makeComparison('net_income', 'Net Gelir', 5_000, 0, true),
    ]
    const line = buildSummaryLine(comps, 'yoy')
    expect(line).toContain('karşılaştırılamadı')
  })

  it('24. mom type → geçen aya kıyasla', () => {
    const comps: MetricComparison[] = [
      makeComparison('revenue', 'Ciro', 110_000, 100_000, true),
    ]
    const line = buildSummaryLine(comps, 'mom')
    expect(line).toContain('geçen aya kıyasla')
  })

  it('25. yoy type → geçen yıla kıyasla', () => {
    const comps: MetricComparison[] = [
      makeComparison('revenue', 'Ciro', 110_000, 100_000, true),
    ]
    const line = buildSummaryLine(comps, 'yoy')
    expect(line).toContain('geçen yıla kıyasla')
  })

  it('26. flat revenue → yatay seyretti', () => {
    const comps: MetricComparison[] = [
      makeComparison('revenue', 'Ciro', 100_005, 100_000, true),
    ]
    const line = buildSummaryLine(comps, 'yoy')
    expect(line).toContain('yatay seyretti')
  })

  it('27. empty comparisons → yeterli veri yok', () => {
    const line = buildSummaryLine([], 'yoy')
    expect(line).toContain('yeterli veri yok')
  })
})
