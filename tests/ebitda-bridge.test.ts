// ─────────────────────────────────────────────────────────────────────────────
// tests/ebitda-bridge.test.ts
//
// Unit tests for all pure functions in ebitda-bridge.service.ts:
//   - computeEbitda                    (3 tests)
//   - computeVolumeEffect              (5 tests)
//   - computeMarginEffect              (4 tests)
//   - computeOpexEffect                (4 tests)
//   - computeCogsEffect                (4 tests)
//   - buildEbitdaBridge                (9 tests)
//   - computeOperatingLeverage         (5 tests)
//   - classifyOperatingLeverageHealth  (8 tests)
//   Total: 42 tests
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest'
import {
  computeEbitda,
  computeVolumeEffect,
  computeMarginEffect,
  computeOpexEffect,
  computeCogsEffect,
  buildEbitdaBridge,
  computeOperatingLeverage,
  classifyOperatingLeverageHealth,
} from '../lib/services/finance/ebitda-bridge.service'

// ── computeEbitda ──────────────────────────────────────────────────────────────

describe('computeEbitda', () => {
  it('normal: revenue - cogs - opex', () => {
    // 200_000 - 80_000 - 40_000 = 80_000
    expect(computeEbitda(200_000, 80_000, 40_000)).toBe(80_000)
  })

  it('zero components → 0', () => {
    expect(computeEbitda(0, 0, 0)).toBe(0)
  })

  it('negative EBITDA when costs exceed revenue', () => {
    // 50_000 - 60_000 - 20_000 = -30_000
    expect(computeEbitda(50_000, 60_000, 20_000)).toBe(-30_000)
  })
})

// ── computeVolumeEffect ───────────────────────────────────────────────────────

describe('computeVolumeEffect', () => {
  it('revenue increase with positive prior margin → positive effect', () => {
    // (150_000 - 100_000) × (20 / 100) = 10_000
    expect(computeVolumeEffect(100_000, 150_000, 20)).toBeCloseTo(10_000)
  })

  it('revenue decline with positive prior margin → negative effect', () => {
    // (80_000 - 100_000) × (25 / 100) = -5_000
    expect(computeVolumeEffect(100_000, 80_000, 25)).toBeCloseTo(-5_000)
  })

  it('zero prior margin → zero volume effect regardless of revenue change', () => {
    expect(computeVolumeEffect(100_000, 200_000, 0)).toBe(0)
  })

  it('negative prior margin + revenue growth → negative effect', () => {
    // (120_000 - 100_000) × (-10 / 100) = -2_000
    expect(computeVolumeEffect(100_000, 120_000, -10)).toBeCloseTo(-2_000)
  })

  it('same revenue prior and current → zero volume effect', () => {
    expect(computeVolumeEffect(100_000, 100_000, 30)).toBe(0)
  })
})

// ── computeMarginEffect ────────────────────────────────────────────────────────

describe('computeMarginEffect', () => {
  it('margin improvement → positive effect', () => {
    // 200_000 × (25 - 20) / 100 = 10_000
    expect(computeMarginEffect(200_000, 25, 20)).toBeCloseTo(10_000)
  })

  it('margin decline → negative effect', () => {
    // 200_000 × (15 - 20) / 100 = -10_000
    expect(computeMarginEffect(200_000, 15, 20)).toBeCloseTo(-10_000)
  })

  it('zero revenue → zero effect regardless of margin change', () => {
    expect(computeMarginEffect(0, 30, 10)).toBe(0)
  })

  it('same margins → zero effect', () => {
    expect(computeMarginEffect(150_000, 22, 22)).toBe(0)
  })
})

// ── computeOpexEffect ──────────────────────────────────────────────────────────

describe('computeOpexEffect', () => {
  it('cost reduction → positive effect (favorable)', () => {
    // prior=50_000, current=40_000 → -(40_000 - 50_000) = 10_000
    expect(computeOpexEffect(50_000, 40_000)).toBe(10_000)
  })

  it('cost increase → negative effect (unfavorable)', () => {
    // prior=50_000, current=65_000 → -(65_000 - 50_000) = -15_000
    expect(computeOpexEffect(50_000, 65_000)).toBe(-15_000)
  })

  it('no change → zero effect', () => {
    expect(computeOpexEffect(30_000, 30_000)).toBeCloseTo(0)
  })

  it('zero prior opex, positive current → negative effect', () => {
    // -(20_000 - 0) = -20_000
    expect(computeOpexEffect(0, 20_000)).toBe(-20_000)
  })
})

// ── computeCogsEffect ──────────────────────────────────────────────────────────

describe('computeCogsEffect', () => {
  it('COGS ratio improvement → positive effect (favorable)', () => {
    // currentRevenue=200_000, prior ratio=0.60, current ratio=0.55
    // = 200_000 × (0.60 - 0.55) = 10_000
    expect(computeCogsEffect(180_000, 200_000, 0.60, 0.55)).toBeCloseTo(10_000)
  })

  it('COGS ratio worsening → negative effect (unfavorable)', () => {
    // currentRevenue=200_000, prior ratio=0.55, current ratio=0.65
    // = 200_000 × (0.55 - 0.65) = -20_000
    expect(computeCogsEffect(180_000, 200_000, 0.55, 0.65)).toBeCloseTo(-20_000)
  })

  it('same COGS ratio → zero effect', () => {
    expect(computeCogsEffect(100_000, 150_000, 0.50, 0.50)).toBe(0)
  })

  it('zero current revenue → zero effect', () => {
    expect(computeCogsEffect(100_000, 0, 0.60, 0.70)).toBeCloseTo(0)
  })
})

// ── buildEbitdaBridge ─────────────────────────────────────────────────────────

describe('buildEbitdaBridge', () => {
  const prior   = { revenue: 100_000, cogs: 55_000, opex: 25_000 }
  const current = { revenue: 120_000, cogs: 60_000, opex: 22_000 }

  it('prior_ebitda = revenue - cogs - opex (prior)', () => {
    const bridge = buildEbitdaBridge(prior, current)
    expect(bridge.prior_ebitda).toBe(100_000 - 55_000 - 25_000)  // 20_000
  })

  it('current_ebitda = revenue - cogs - opex (current)', () => {
    const bridge = buildEbitdaBridge(prior, current)
    expect(bridge.current_ebitda).toBe(120_000 - 60_000 - 22_000)  // 38_000
  })

  it('reconciliation_error is approximately 0', () => {
    const bridge = buildEbitdaBridge(prior, current)
    expect(Math.abs(bridge.reconciliation_error)).toBeLessThan(0.01)
  })

  it('prior + sum of effects ≈ current EBITDA', () => {
    const bridge = buildEbitdaBridge(prior, current)
    const computed = bridge.prior_ebitda
      + bridge.volume_effect
      + bridge.cogs_effect
      + bridge.margin_effect
      + bridge.opex_effect
    expect(Math.abs(computed - bridge.current_ebitda)).toBeLessThan(0.01)
  })

  it('components array has 4 items', () => {
    const bridge = buildEbitdaBridge(prior, current)
    expect(bridge.components).toHaveLength(4)
  })

  it('component labels are Turkish', () => {
    const bridge = buildEbitdaBridge(prior, current)
    const labels = bridge.components.map(c => c.label)
    expect(labels).toContain('Hacim Etkisi')
    expect(labels).toContain('SMM Verimliliği')
    expect(labels).toContain('Marj Etkisi')
    expect(labels).toContain('Opex Etkisi')
  })

  it('is_favorable=true when component value > 0', () => {
    const bridge = buildEbitdaBridge(prior, current)
    for (const c of bridge.components) {
      if (c.value > 0)  expect(c.is_favorable).toBe(true)
      if (c.value <= 0) expect(c.is_favorable).toBe(false)
    }
  })

  it('pct_of_prior is null when prior_ebitda = 0', () => {
    const zeroPrior = { revenue: 50_000, cogs: 30_000, opex: 20_000 } // ebitda = 0
    const bridge = buildEbitdaBridge(zeroPrior, current)
    expect(bridge.prior_ebitda).toBe(0)
    for (const c of bridge.components) {
      expect(c.pct_of_prior).toBeNull()
    }
  })

  it('handles identical periods → all effects near 0', () => {
    const same = { revenue: 100_000, cogs: 55_000, opex: 25_000 }
    const bridge = buildEbitdaBridge(same, same)
    expect(Math.abs(bridge.volume_effect)).toBeLessThan(0.01)
    expect(Math.abs(bridge.cogs_effect)).toBeLessThan(0.01)
    expect(Math.abs(bridge.opex_effect)).toBeLessThan(0.01)
    expect(Math.abs(bridge.reconciliation_error)).toBeLessThan(0.01)
  })
})

// ── computeOperatingLeverage ──────────────────────────────────────────────────

describe('computeOperatingLeverage', () => {
  it('OL > 1 when EBITDA grows faster than revenue', () => {
    // EBITDA +30%, revenue +10% → OL = 3.0
    const ol = computeOperatingLeverage(10, 30)
    expect(ol).toBeCloseTo(3.0)
  })

  it('OL < 1 when EBITDA grows slower than revenue', () => {
    // EBITDA +5%, revenue +10% → OL = 0.5
    const ol = computeOperatingLeverage(10, 5)
    expect(ol).toBeCloseTo(0.5)
  })

  it('zero revenue change → null', () => {
    expect(computeOperatingLeverage(0, 20)).toBeNull()
  })

  it('negative OL when EBITDA declines while revenue grows', () => {
    // EBITDA -10%, revenue +10% → OL = -1.0
    const ol = computeOperatingLeverage(10, -10)
    expect(ol).toBeCloseTo(-1.0)
  })

  it('OL = 1.0 when EBITDA and revenue grow equally', () => {
    expect(computeOperatingLeverage(15, 15)).toBeCloseTo(1.0)
  })
})

// ── classifyOperatingLeverageHealth ──────────────────────────────────────────

describe('classifyOperatingLeverageHealth', () => {
  it('both null → insufficient_data', () => {
    expect(classifyOperatingLeverageHealth(null, null)).toBe('insufficient_data')
  })

  it('OL null with revenue growth → insufficient_data', () => {
    expect(classifyOperatingLeverageHealth(null, 10)).toBe('insufficient_data')
  })

  it('high_leverage_positive: OL > 2 and revenue growing', () => {
    expect(classifyOperatingLeverageHealth(3.5, 10)).toBe('high_leverage_positive')
  })

  it('not high_leverage_positive when OL > 2 but revenue declining', () => {
    // OL > 2 but revenue < 0 → should not return high_leverage_positive
    const result = classifyOperatingLeverageHealth(3.5, -5)
    expect(result).not.toBe('high_leverage_positive')
  })

  it('high_leverage_negative: OL < -1', () => {
    expect(classifyOperatingLeverageHealth(-2, 5)).toBe('high_leverage_negative')
  })

  it('improving: OL between 1 and 2', () => {
    expect(classifyOperatingLeverageHealth(1.5, 10)).toBe('improving')
  })

  it('low_leverage: OL between 0 and 1', () => {
    expect(classifyOperatingLeverageHealth(0.5, 10)).toBe('low_leverage')
  })

  it('declining: OL between -1 and 0', () => {
    expect(classifyOperatingLeverageHealth(-0.5, 5)).toBe('declining')
  })
})
