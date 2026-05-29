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

// ── Extended computePriceEffect ───────────────────────────────────────────────

describe('computePriceEffect — extended', () => {
  it('fractional price change yields correct effect', () => {
    // avg price rose from 99.5 to 100.5, prior qty = 200
    // effect = (100.5 - 99.5) * 200 = 200
    expect(computePriceEffect(100.5, 99.5, 200)).toBeCloseTo(200, 5)
  })

  it('negative current price (write-down scenario)', () => {
    // current = -10, prior = 50, qty = 100
    // effect = (-10 - 50) * 100 = -6_000
    expect(computePriceEffect(-10, 50, 100)).toBe(-6_000)
  })

  it('zero current price (full price drop)', () => {
    // effect = (0 - 100) * 50 = -5_000
    expect(computePriceEffect(0, 100, 50)).toBe(-5_000)
  })

  it('zero prior price (new product, no base)', () => {
    // effect = (120 - 0) * 80 = 9_600
    expect(computePriceEffect(120, 0, 80)).toBe(9_600)
  })

  it('identical prices → zero regardless of qty', () => {
    expect(computePriceEffect(250, 250, 1_000_000)).toBe(0)
  })

  it('large volume amplifies small price change', () => {
    // (100.01 - 100) * 1_000_000 = 10_000
    expect(computePriceEffect(100.01, 100, 1_000_000)).toBeCloseTo(10_000, 2)
  })

  it('negative prior qty (unusual, function is a pure formula)', () => {
    // (110 - 100) * (-50) = -500
    expect(computePriceEffect(110, 100, -50)).toBe(-500)
  })

  it('price effect is zero for any price direction when qty is 0', () => {
    // Only at qty=0 does it return 0 regardless of direction
    expect(computePriceEffect(200, 100, 0)).toBeCloseTo(0, 10)
    expect(computePriceEffect(100, 200, 0)).toBeCloseTo(0, 10)
  })

  it('large price drop with large qty', () => {
    // (50 - 200) * 5_000 = -750_000
    expect(computePriceEffect(50, 200, 5_000)).toBe(-750_000)
  })

  it('Turkish SME typical scenario: avg price 850 → 950, qty 200', () => {
    // effect = (950 - 850) * 200 = 20_000
    expect(computePriceEffect(950, 850, 200)).toBe(20_000)
  })

  it('effect scales linearly with prior qty', () => {
    const e1 = computePriceEffect(120, 100, 100)
    const e2 = computePriceEffect(120, 100, 200)
    expect(e2).toBeCloseTo(e1 * 2, 5)
  })

  it('effect scales linearly with price change', () => {
    const e1 = computePriceEffect(110, 100, 100)  // +10 * 100 = 1000
    const e2 = computePriceEffect(120, 100, 100)  // +20 * 100 = 2000
    expect(e2).toBeCloseTo(e1 * 2, 5)
  })
})

// ── Extended computeVolumeEffect ──────────────────────────────────────────────

describe('computeVolumeEffect — extended', () => {
  it('handles negative volume change (shrinkage)', () => {
    // margin/unit = 75, qty 300→200 → effect = 75 * (200-300) = -7_500
    expect(computeVolumeEffect(75, 200, 300)).toBe(-7_500)
  })

  it('handles fractional margin per unit', () => {
    // margin = 12.5/unit, qty 100→150 → effect = 12.5 * 50 = 625
    expect(computeVolumeEffect(12.5, 150, 100)).toBeCloseTo(625, 5)
  })

  it('negative prior qty (pass-through formula)', () => {
    // margin = 20, current=50, prior=-10 → 20 * (50-(-10)) = 1200
    expect(computeVolumeEffect(20, 50, -10)).toBe(1200)
  })

  it('large volume swing with positive margin → large positive effect', () => {
    // margin = 100/unit, qty 100→5_100 → 100 * 5000 = 500_000
    expect(computeVolumeEffect(100, 5_100, 100)).toBe(500_000)
  })

  it('exactly doubles volume with unit margin 50 → positive effect', () => {
    // qty 200→400 → effect = 50 * 200 = 10_000
    expect(computeVolumeEffect(50, 400, 200)).toBe(10_000)
  })

  it('effect is proportional to volume delta', () => {
    const e1 = computeVolumeEffect(50, 110, 100)  // delta=10 → 500
    const e2 = computeVolumeEffect(50, 120, 100)  // delta=20 → 1000
    expect(e2).toBeCloseTo(e1 * 2, 5)
  })

  it('effect is proportional to prior margin per unit', () => {
    const e1 = computeVolumeEffect(25, 150, 100)  // 25*50=1250
    const e2 = computeVolumeEffect(50, 150, 100)  // 50*50=2500
    expect(e2).toBeCloseTo(e1 * 2, 5)
  })

  it('handles zero prior qty with volume increase', () => {
    // margin = 40, prior=0, current=100 → 40 * 100 = 4_000
    expect(computeVolumeEffect(40, 100, 0)).toBe(4_000)
  })

  it('handles high-margin, low-volume niche product', () => {
    // margin = 5_000/unit, qty 5→6 → effect = 5_000
    expect(computeVolumeEffect(5_000, 6, 5)).toBe(5_000)
  })

  it('loss-item scenario: negative margin, volume increase is bad', () => {
    // margin = -20/unit, qty 100→200 → -20 * 100 = -2_000
    expect(computeVolumeEffect(-20, 200, 100)).toBe(-2_000)
  })
})

// ── Extended computeMixEffect ─────────────────────────────────────────────────

describe('computeMixEffect — extended', () => {
  it('positive price + volume exceeds total → negative mix', () => {
    // total=10_000, price=7_000, volume=8_000 → mix = -5_000
    expect(computeMixEffect(10_000, 7_000, 8_000)).toBe(-5_000)
  })

  it('negative total with zero effects → pure negative mix', () => {
    expect(computeMixEffect(-30_000, 0, 0)).toBe(-30_000)
  })

  it('positive total with zero effects → pure positive mix', () => {
    expect(computeMixEffect(50_000, 0, 0)).toBe(50_000)
  })

  it('mix effect is the residual — verifies additivity property', () => {
    const total = 100_000
    const price = 35_000
    const volume = 45_000
    const mix = computeMixEffect(total, price, volume)
    expect(mix + price + volume).toBeCloseTo(total, 5)
  })

  it('mix can absorb negative price and negative volume', () => {
    // total=0, price=-5_000, volume=-3_000 → mix = 0+5_000+3_000 = 8_000
    expect(computeMixEffect(0, -5_000, -3_000)).toBe(8_000)
  })

  it('large favorable mix shift (premium products sold)', () => {
    // total=500_000, price=100_000, volume=150_000 → mix=250_000
    expect(computeMixEffect(500_000, 100_000, 150_000)).toBe(250_000)
  })

  it('handles floating-point values correctly', () => {
    expect(computeMixEffect(10_000.5, 3_000.25, 4_000.25)).toBeCloseTo(3_000, 5)
  })

  it('symmetric test: shuffling components changes mix', () => {
    const m1 = computeMixEffect(10_000, 4_000, 3_000)
    const m2 = computeMixEffect(10_000, 3_000, 4_000)
    // Both should sum to 10_000 with their respective components
    expect(m1 + 4_000 + 3_000).toBe(10_000)
    expect(m2 + 3_000 + 4_000).toBe(10_000)
  })

  it('very small residual (near-zero mix)', () => {
    // total=10_000, price=4_999, volume=5_000 → mix=1
    expect(computeMixEffect(10_000, 4_999, 5_000)).toBe(1)
  })

  it('Turkish SME: total GP change 200K, price 80K, volume 60K → mix 60K', () => {
    expect(computeMixEffect(200_000, 80_000, 60_000)).toBe(60_000)
  })
})

// ── Extended classifyBridgeComponent ─────────────────────────────────────────

describe('classifyBridgeComponent — extended', () => {
  it('effect exactly at 1% of revenue → neutral', () => {
    // 1% of 50_000 = 500
    expect(classifyBridgeComponent(500, 50_000)).toBe('neutral')
  })

  it('effect at 1.01% → favorable', () => {
    // 1.01% of 100_000 = 1_010
    expect(classifyBridgeComponent(1_010, 100_000)).toBe('favorable')
  })

  it('negative effect at -1.01% → unfavorable', () => {
    expect(classifyBridgeComponent(-1_010, 100_000)).toBe('unfavorable')
  })

  it('zero revenue + zero effect → neutral', () => {
    expect(classifyBridgeComponent(0, 0)).toBe('neutral')
  })

  it('tiny positive effect (0.001% of revenue) → neutral', () => {
    // effect = 1, revenue = 1_000_000 → 0.0001% → neutral
    expect(classifyBridgeComponent(1, 1_000_000)).toBe('neutral')
  })

  it('very large unfavorable effect', () => {
    // -500_000 / 1_000_000 = 50% → unfavorable
    expect(classifyBridgeComponent(-500_000, 1_000_000)).toBe('unfavorable')
  })

  it('positive effect with small revenue baseline', () => {
    // effect = 100, revenue = 500 → 20% → favorable
    expect(classifyBridgeComponent(100, 500)).toBe('favorable')
  })

  it('negative effect with small revenue baseline', () => {
    // effect = -100, revenue = 500 → 20% → unfavorable
    expect(classifyBridgeComponent(-100, 500)).toBe('unfavorable')
  })

  it('effect at exactly 1% boundary — favorable or neutral?', () => {
    // pct = abs(1000/100_000)*100 = 1.0 → ≤1 → neutral
    expect(classifyBridgeComponent(1_000, 100_000)).toBe('neutral')
    expect(classifyBridgeComponent(-1_000, 100_000)).toBe('neutral')
  })

  it('classifies mix effect as neutral when small relative to revenue', () => {
    // mix = 200, revenue = 100_000 → 0.2% → neutral
    expect(classifyBridgeComponent(200, 100_000)).toBe('neutral')
  })

  it('classifies price effect as favorable when significant', () => {
    // price effect = 15_000, revenue = 100_000 → 15% → favorable
    expect(classifyBridgeComponent(15_000, 100_000)).toBe('favorable')
  })

  it('volume decrease larger than 1% → unfavorable', () => {
    // volume effect = -5_000, revenue = 50_000 → 10% → unfavorable
    expect(classifyBridgeComponent(-5_000, 50_000)).toBe('unfavorable')
  })
})

// ── Extended computeGrossProfitChangePct ──────────────────────────────────────

describe('computeGrossProfitChangePct — extended', () => {
  it('current = prior → 0%', () => {
    expect(computeGrossProfitChangePct(75_000, 75_000)).toBe(0)
  })

  it('GP improves by 200%', () => {
    // current=30_000, prior=10_000 → 200%
    expect(computeGrossProfitChangePct(30_000, 10_000)).toBeCloseTo(200, 5)
  })

  it('GP falls to zero from positive prior', () => {
    // current=0, prior=20_000 → -100%
    expect(computeGrossProfitChangePct(0, 20_000)).toBeCloseTo(-100, 5)
  })

  it('GP goes negative from positive prior', () => {
    // current=-5_000, prior=10_000 → -150%
    expect(computeGrossProfitChangePct(-5_000, 10_000)).toBeCloseTo(-150, 5)
  })

  it('both negative — prior more negative than current (improvement)', () => {
    // current=-5_000, prior=-10_000 → (-5_000-(-10_000))/10_000 * 100 = 50%
    expect(computeGrossProfitChangePct(-5_000, -10_000)).toBeCloseTo(50, 5)
  })

  it('both negative — current more negative (deterioration)', () => {
    // current=-15_000, prior=-10_000 → (-15_000+10_000)/10_000 * 100 = -50%
    expect(computeGrossProfitChangePct(-15_000, -10_000)).toBeCloseTo(-50, 5)
  })

  it('tiny change → tiny percentage', () => {
    // current = 100_001, prior = 100_000 → 0.001%
    expect(computeGrossProfitChangePct(100_001, 100_000)).toBeCloseTo(0.001, 5)
  })

  it('current is zero and prior is negative → returns 100% (improvement)', () => {
    // current=0, prior=-10_000 → (0-(-10_000))/10_000 * 100 = 100%
    expect(computeGrossProfitChangePct(0, -10_000)).toBeCloseTo(100, 5)
  })

  it('large Turkish SME scenario — scales correctly', () => {
    // current=3_500_000, prior=2_800_000 → 25%
    expect(computeGrossProfitChangePct(3_500_000, 2_800_000)).toBeCloseTo(25, 5)
  })

  it('current lower than prior → negative pct', () => {
    // current=40_000, prior=50_000 → -20%
    expect(computeGrossProfitChangePct(40_000, 50_000)).toBeCloseTo(-20, 5)
  })
})
