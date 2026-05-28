// ─────────────────────────────────────────────────────────────────────────────
// tests/margin-bridge.test.ts
//
// Unit tests for all 5 pure functions in margin-bridge.service.ts:
//   - computePriceEffect
//   - computeVolumeEffect
//   - computeMixEffect
//   - classifyBridgeComponent
//   - computeGrossProfitChangePct
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest'
import {
  computePriceEffect,
  computeVolumeEffect,
  computeMixEffect,
  classifyBridgeComponent,
  computeGrossProfitChangePct,
} from '../lib/services/finance/margin-bridge.service'

// ── computePriceEffect ────────────────────────────────────────────────────────

describe('computePriceEffect', () => {
  it('price increase → positive effect', () => {
    // avg price rose from 100 to 120, prior qty = 500
    // effect = (120 - 100) * 500 = 10_000
    expect(computePriceEffect(120, 100, 500)).toBe(10_000)
  })

  it('price decrease → negative effect', () => {
    // avg price fell from 100 to 80, prior qty = 200
    // effect = (80 - 100) * 200 = -4_000
    expect(computePriceEffect(80, 100, 200)).toBe(-4_000)
  })

  it('no price change → zero effect', () => {
    expect(computePriceEffect(150, 150, 300)).toBe(0)
  })

  it('zero prior qty → zero effect regardless of price change', () => {
    expect(computePriceEffect(200, 100, 0)).toBe(0)
  })

  it('large price jump with high volume', () => {
    // (500 - 350) * 1000 = 150_000
    expect(computePriceEffect(500, 350, 1000)).toBe(150_000)
  })
})

// ── computeVolumeEffect ───────────────────────────────────────────────────────

describe('computeVolumeEffect', () => {
  it('volume increase → positive effect', () => {
    // prior margin/unit = 40, qty went 100 → 150
    // effect = 40 * (150 - 100) = 2_000
    expect(computeVolumeEffect(40, 150, 100)).toBe(2_000)
  })

  it('volume decrease → negative effect', () => {
    // prior margin/unit = 50, qty went 200 → 120
    // effect = 50 * (120 - 200) = -4_000
    expect(computeVolumeEffect(50, 120, 200)).toBe(-4_000)
  })

  it('no volume change → zero effect', () => {
    expect(computeVolumeEffect(30, 100, 100)).toBe(0)
  })

  it('zero prior margin per unit → zero effect even with volume change', () => {
    expect(computeVolumeEffect(0, 300, 100)).toBe(0)
  })

  it('negative prior margin per unit (loss item) + volume increase → negative', () => {
    // margin/unit = -10, qty went 50 → 100
    // effect = -10 * (100 - 50) = -500
    expect(computeVolumeEffect(-10, 100, 50)).toBe(-500)
  })
})

// ── computeMixEffect ──────────────────────────────────────────────────────────

describe('computeMixEffect', () => {
  it('residual = total change minus price minus volume effects', () => {
    // total GP change = 20_000, price = 8_000, volume = 7_000
    // mix = 20_000 - 8_000 - 7_000 = 5_000
    expect(computeMixEffect(20_000, 8_000, 7_000)).toBe(5_000)
  })

  it('zero mix when price + volume explain everything', () => {
    // total = 10_000, price = 6_000, volume = 4_000 → mix = 0
    expect(computeMixEffect(10_000, 6_000, 4_000)).toBe(0)
  })

  it('negative mix effect', () => {
    // total = 5_000, price = 8_000, volume = 3_000
    // mix = 5_000 - 8_000 - 3_000 = -6_000
    expect(computeMixEffect(5_000, 8_000, 3_000)).toBe(-6_000)
  })

  it('all zeros → zero mix', () => {
    expect(computeMixEffect(0, 0, 0)).toBe(0)
  })

  it('large negative residual', () => {
    // total = -100_000, price = 20_000, volume = -50_000
    // mix = -100_000 - 20_000 - (-50_000) = -70_000
    expect(computeMixEffect(-100_000, 20_000, -50_000)).toBe(-70_000)
  })
})

// ── classifyBridgeComponent ───────────────────────────────────────────────────

describe('classifyBridgeComponent', () => {
  it('positive effect above 1% threshold → favorable', () => {
    // effect = 5_000, revenue = 100_000 → 5% → favorable
    expect(classifyBridgeComponent(5_000, 100_000)).toBe('favorable')
  })

  it('negative effect above 1% threshold → unfavorable', () => {
    // effect = -3_000, revenue = 100_000 → 3% → unfavorable
    expect(classifyBridgeComponent(-3_000, 100_000)).toBe('unfavorable')
  })

  it('small positive within ±1% → neutral', () => {
    // effect = 500, revenue = 100_000 → 0.5% → neutral
    expect(classifyBridgeComponent(500, 100_000)).toBe('neutral')
  })

  it('small negative within ±1% → neutral', () => {
    // effect = -800, revenue = 100_000 → 0.8% → neutral
    expect(classifyBridgeComponent(-800, 100_000)).toBe('neutral')
  })

  it('exactly at ±1% boundary → neutral', () => {
    // effect = 1_000, revenue = 100_000 → exactly 1% → neutral (≤ 1%)
    expect(classifyBridgeComponent(1_000, 100_000)).toBe('neutral')
  })

  it('zero effect → neutral', () => {
    expect(classifyBridgeComponent(0, 100_000)).toBe('neutral')
  })

  it('zero revenue + positive effect → favorable', () => {
    expect(classifyBridgeComponent(5_000, 0)).toBe('favorable')
  })

  it('zero revenue + negative effect → unfavorable', () => {
    expect(classifyBridgeComponent(-5_000, 0)).toBe('unfavorable')
  })

  it('large favorable effect', () => {
    // effect = 50_000, revenue = 200_000 → 25% → favorable
    expect(classifyBridgeComponent(50_000, 200_000)).toBe('favorable')
  })
})

// ── computeGrossProfitChangePct ───────────────────────────────────────────────

describe('computeGrossProfitChangePct', () => {
  it('GP increased → positive percentage', () => {
    // current = 15_000, prior = 10_000 → +50%
    expect(computeGrossProfitChangePct(15_000, 10_000)).toBeCloseTo(50)
  })

  it('GP decreased → negative percentage', () => {
    // current = 8_000, prior = 10_000 → -20%
    expect(computeGrossProfitChangePct(8_000, 10_000)).toBeCloseTo(-20)
  })

  it('no GP change → 0%', () => {
    expect(computeGrossProfitChangePct(10_000, 10_000)).toBe(0)
  })

  it('zero prior → returns null', () => {
    expect(computeGrossProfitChangePct(5_000, 0)).toBeNull()
  })

  it('both zero → returns null', () => {
    expect(computeGrossProfitChangePct(0, 0)).toBeNull()
  })

  it('negative prior → uses absolute value in denominator', () => {
    // current = 5_000, prior = -10_000
    // pct = (5_000 - (-10_000)) / |-10_000| × 100 = 15_000/10_000 × 100 = 150%
    expect(computeGrossProfitChangePct(5_000, -10_000)).toBeCloseTo(150)
  })

  it('large GP swing → correct magnitude', () => {
    // current = 1_000_000, prior = 500_000 → +100%
    expect(computeGrossProfitChangePct(1_000_000, 500_000)).toBeCloseTo(100)
  })
})
