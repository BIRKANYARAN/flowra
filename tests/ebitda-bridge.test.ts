// ─────────────────────────────────────────────────────────────────────────────
// tests/ebitda-bridge.test.ts
//
// Unit tests for all pure functions in ebitda-bridge.service.ts:
//   - computeEbitda                    (5 tests)
//   - computeEbitdaMargin              (4 tests)
//   - computeVolumeEffect              (6 tests)
//   - computePriceMixEffect            (6 tests)
//   - computeCostEffect                (6 tests)
//   - computeResidualEffect            (7 tests)
//   - computeEbitdaChange              (4 tests)
//   - validateBridgeReconciliation     (6 tests)
//   - classifyEbitdaTrend              (16 tests)
//   - computeBridgeContributions       (7 tests)
//   - identifyPrimaryDriver            (10 tests)
//   - classifyEbitdaMarginHealth       (10 tests)
//   - generateBridgeNarrative          (14 tests)
//   Total: 101 inline + integration = 113 tests
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest'
import {
  computeEbitda,
  computeEbitdaMargin,
  computeVolumeEffect,
  computePriceMixEffect,
  computeCostEffect,
  computeResidualEffect,
  computeEbitdaChange,
  validateBridgeReconciliation,
  classifyEbitdaTrend,
  computeBridgeContributions,
  identifyPrimaryDriver,
  classifyEbitdaMarginHealth,
  generateBridgeNarrative,
} from '../lib/services/finance/ebitda-bridge.service'

// ── computeEbitda ──────────────────────────────────────────────────────────────

describe('computeEbitda', () => {
  it('normal: grossProfit - operatingExpenses', () => {
    // 120_000 - 40_000 = 80_000
    expect(computeEbitda(120_000, 40_000)).toBe(80_000)
  })

  it('zero components → 0', () => {
    expect(computeEbitda(0, 0)).toBe(0)
  })

  it('negative EBITDA when opex exceeds gross profit', () => {
    // 30_000 - 50_000 = -20_000
    expect(computeEbitda(30_000, 50_000)).toBe(-20_000)
  })

  it('gross profit = 0 but opex > 0 → negative EBITDA', () => {
    expect(computeEbitda(0, 15_000)).toBe(-15_000)
  })

  it('high gross profit, low opex → positive EBITDA', () => {
    expect(computeEbitda(500_000, 100_000)).toBe(400_000)
  })
})

// ── computeEbitdaMargin ───────────────────────────────────────────────────────

describe('computeEbitdaMargin', () => {
  it('normal: ebitda / revenue * 100', () => {
    // 80_000 / 400_000 * 100 = 20%
    expect(computeEbitdaMargin(80_000, 400_000)).toBeCloseTo(20)
  })

  it('zero revenue → null', () => {
    expect(computeEbitdaMargin(80_000, 0)).toBeNull()
  })

  it('negative ebitda → negative margin', () => {
    // -20_000 / 100_000 * 100 = -20%
    expect(computeEbitdaMargin(-20_000, 100_000)).toBeCloseTo(-20)
  })

  it('ebitda = revenue → 100% margin', () => {
    expect(computeEbitdaMargin(100_000, 100_000)).toBeCloseTo(100)
  })
})

// ── computeVolumeEffect ───────────────────────────────────────────────────────

describe('computeVolumeEffect', () => {
  it('revenue increase with positive prior margin → positive effect', () => {
    // (150_000 - 100_000) × (20/100) = 10_000
    expect(computeVolumeEffect(100_000, 150_000, 20)).toBeCloseTo(10_000)
  })

  it('revenue decline with positive prior margin → negative effect', () => {
    // (80_000 - 100_000) × (25/100) = -5_000
    expect(computeVolumeEffect(100_000, 80_000, 25)).toBeCloseTo(-5_000)
  })

  it('same revenue → zero volume effect', () => {
    expect(computeVolumeEffect(100_000, 100_000, 30)).toBe(0)
  })

  it('null prior margin → null', () => {
    expect(computeVolumeEffect(100_000, 150_000, null)).toBeNull()
  })

  it('negative prior margin + revenue growth → negative effect', () => {
    // (120_000 - 100_000) × (-10/100) = -2_000
    expect(computeVolumeEffect(100_000, 120_000, -10)).toBeCloseTo(-2_000)
  })

  it('zero prior margin → zero effect regardless of revenue change', () => {
    expect(computeVolumeEffect(100_000, 200_000, 0)).toBe(0)
  })
})

// ── computePriceMixEffect ─────────────────────────────────────────────────────

describe('computePriceMixEffect', () => {
  it('margin expansion → positive effect', () => {
    // 200_000 × (30 - 25) / 100 = 10_000
    expect(computePriceMixEffect(200_000, 25, 30)).toBeCloseTo(10_000)
  })

  it('margin compression → negative effect', () => {
    // 200_000 × (18 - 25) / 100 = -14_000
    expect(computePriceMixEffect(200_000, 25, 18)).toBeCloseTo(-14_000)
  })

  it('same margins → zero effect', () => {
    expect(computePriceMixEffect(150_000, 22, 22)).toBe(0)
  })

  it('null prior gross margin → null', () => {
    expect(computePriceMixEffect(200_000, null, 30)).toBeNull()
  })

  it('null current gross margin → null', () => {
    expect(computePriceMixEffect(200_000, 25, null)).toBeNull()
  })

  it('both margins null → null', () => {
    expect(computePriceMixEffect(200_000, null, null)).toBeNull()
  })
})

// ── computeCostEffect ─────────────────────────────────────────────────────────

describe('computeCostEffect', () => {
  it('cost reduction relative to revenue → positive effect (savings)', () => {
    // priorOpexRatio = 30_000/100_000 = 0.30
    // expectedOpex   = 120_000 × 0.30 = 36_000
    // costEffect     = -(25_000 - 36_000) = +11_000
    expect(computeCostEffect(100_000, 30_000, 120_000, 25_000)).toBeCloseTo(11_000)
  })

  it('cost overrun relative to revenue → negative effect', () => {
    // priorOpexRatio = 30_000/100_000 = 0.30
    // expectedOpex   = 120_000 × 0.30 = 36_000
    // costEffect     = -(50_000 - 36_000) = -14_000
    expect(computeCostEffect(100_000, 30_000, 120_000, 50_000)).toBeCloseTo(-14_000)
  })

  it('same opex ratio → zero effect', () => {
    // priorOpexRatio = 0.30; currentOpex = 120_000 × 0.30 = 36_000
    expect(computeCostEffect(100_000, 30_000, 120_000, 36_000)).toBeCloseTo(0)
  })

  it('zero prior revenue → null', () => {
    expect(computeCostEffect(0, 30_000, 120_000, 40_000)).toBeNull()
  })

  it('zero opex in both periods → zero effect', () => {
    expect(computeCostEffect(100_000, 0, 120_000, 0)).toBeCloseTo(0)
  })

  it('current revenue same as prior → simple opex comparison', () => {
    // priorOpexRatio = 0.25; expected = 0.25 × 100_000 = 25_000; actual = 20_000
    // costEffect = -(20_000 - 25_000) = +5_000
    expect(computeCostEffect(100_000, 25_000, 100_000, 20_000)).toBeCloseTo(5_000)
  })
})

// ── computeResidualEffect ─────────────────────────────────────────────────────

describe('computeResidualEffect', () => {
  it('all effects account for total change → residual ~0', () => {
    // totalChange = 18_000
    // vol=10_000, price=5_000, cost=3_000 → residual = 18_000 - 18_000 = 0
    expect(computeResidualEffect(20_000, 38_000, 10_000, 5_000, 3_000)).toBeCloseTo(0)
  })

  it('unexplained gap → non-zero residual', () => {
    // totalChange = 20_000; vol+price+cost = 15_000 → residual = 5_000
    expect(computeResidualEffect(10_000, 30_000, 8_000, 4_000, 3_000)).toBeCloseTo(5_000)
  })

  it('null volumeEffect → null', () => {
    expect(computeResidualEffect(20_000, 38_000, null, 5_000, 3_000)).toBeNull()
  })

  it('null priceMixEffect → null', () => {
    expect(computeResidualEffect(20_000, 38_000, 10_000, null, 3_000)).toBeNull()
  })

  it('null costEffect → null', () => {
    expect(computeResidualEffect(20_000, 38_000, 10_000, 5_000, null)).toBeNull()
  })

  it('all effects null → null', () => {
    expect(computeResidualEffect(20_000, 38_000, null, null, null)).toBeNull()
  })

  it('negative EBITDA change → negative residual when effects overcount', () => {
    // totalChange = -10_000; effects sum = -5_000; residual = -10_000 - (-5_000) = -5_000
    expect(computeResidualEffect(30_000, 20_000, -3_000, -1_000, -1_000)).toBeCloseTo(-5_000)
  })
})

// ── computeEbitdaChange ───────────────────────────────────────────────────────

describe('computeEbitdaChange', () => {
  it('positive change', () => {
    expect(computeEbitdaChange(20_000, 38_000)).toBe(18_000)
  })

  it('negative change', () => {
    expect(computeEbitdaChange(50_000, 30_000)).toBe(-20_000)
  })

  it('zero change', () => {
    expect(computeEbitdaChange(25_000, 25_000)).toBe(0)
  })

  it('from negative to positive', () => {
    expect(computeEbitdaChange(-10_000, 5_000)).toBe(15_000)
  })
})

// ── validateBridgeReconciliation ──────────────────────────────────────────────

describe('validateBridgeReconciliation', () => {
  it('consistent bridge → gap = 0', () => {
    // totalChange=18_000; sum=18_000
    expect(validateBridgeReconciliation(18_000, 10_000, 5_000, 3_000, 0)).toBeCloseTo(0)
  })

  it('gap when effects do not sum to total', () => {
    // totalChange=20_000; sum=18_000; gap=2_000
    expect(validateBridgeReconciliation(20_000, 10_000, 5_000, 2_000, 1_000)).toBeCloseTo(2_000)
  })

  it('null volumeEffect → null', () => {
    expect(validateBridgeReconciliation(18_000, null, 5_000, 3_000, 0)).toBeNull()
  })

  it('null priceMixEffect → null', () => {
    expect(validateBridgeReconciliation(18_000, 10_000, null, 3_000, 0)).toBeNull()
  })

  it('null costEffect → null', () => {
    expect(validateBridgeReconciliation(18_000, 10_000, 5_000, null, 0)).toBeNull()
  })

  it('null residualEffect → null', () => {
    expect(validateBridgeReconciliation(18_000, 10_000, 5_000, 3_000, null)).toBeNull()
  })
})

// ── classifyEbitdaTrend ───────────────────────────────────────────────────────

describe('classifyEbitdaTrend', () => {
  // Priority: turnaround > deterioration > others

  it('turnaround: priorEbitda < 0 AND currentEbitda > 0', () => {
    expect(classifyEbitdaTrend(-10_000, 5_000)).toBe('turnaround')
  })

  it('turnaround takes priority even when % change is large', () => {
    expect(classifyEbitdaTrend(-1, 1_000_000)).toBe('turnaround')
  })

  it('deterioration: priorEbitda > 0 AND currentEbitda < 0', () => {
    expect(classifyEbitdaTrend(20_000, -5_000)).toBe('deterioration')
  })

  it('deterioration takes priority over % calculation', () => {
    expect(classifyEbitdaTrend(1_000_000, -1)).toBe('deterioration')
  })

  it('insufficient_data: priorEbitda === 0', () => {
    expect(classifyEbitdaTrend(0, 10_000)).toBe('insufficient_data')
  })

  it('insufficient_data: priorEbitda === 0, currentEbitda = 0', () => {
    expect(classifyEbitdaTrend(0, 0)).toBe('insufficient_data')
  })

  it('strong_growth: change_pct >= +25%', () => {
    // 100_000 → 125_000: +25%
    expect(classifyEbitdaTrend(100_000, 125_000)).toBe('strong_growth')
  })

  it('strong_growth: change_pct well above 25%', () => {
    // 100_000 → 200_000: +100%
    expect(classifyEbitdaTrend(100_000, 200_000)).toBe('strong_growth')
  })

  it('growth: change_pct >= +10%', () => {
    // 100_000 → 115_000: +15%
    expect(classifyEbitdaTrend(100_000, 115_000)).toBe('growth')
  })

  it('growth: exact +10% boundary', () => {
    // 100_000 → 110_000: +10%
    expect(classifyEbitdaTrend(100_000, 110_000)).toBe('growth')
  })

  it('stable: change_pct between -10% and +10% (exclusive)', () => {
    // 100_000 → 105_000: +5%
    expect(classifyEbitdaTrend(100_000, 105_000)).toBe('stable')
  })

  it('stable: change_pct = 0', () => {
    expect(classifyEbitdaTrend(50_000, 50_000)).toBe('stable')
  })

  it('decline: change_pct between -10% and -25%', () => {
    // 100_000 → 85_000: -15%
    expect(classifyEbitdaTrend(100_000, 85_000)).toBe('decline')
  })

  it('decline: exact -25% boundary', () => {
    // 100_000 → 75_000: -25%
    expect(classifyEbitdaTrend(100_000, 75_000)).toBe('decline')
  })

  it('severe_decline: change_pct < -25%', () => {
    // 100_000 → 70_000: -30%
    expect(classifyEbitdaTrend(100_000, 70_000)).toBe('severe_decline')
  })

  it('severe_decline: near total wipeout', () => {
    // 100_000 → 1_000: -99%
    expect(classifyEbitdaTrend(100_000, 1_000)).toBe('severe_decline')
  })
})

// ── computeBridgeContributions ────────────────────────────────────────────────

describe('computeBridgeContributions', () => {
  it('normal case: contributions sum explains effects', () => {
    const result = computeBridgeContributions(20_000, 10_000, 6_000, 4_000)
    expect(result).not.toBeNull()
    expect(result!.volume_contribution_pct).toBeCloseTo(50)
    expect(result!.price_mix_contribution_pct).toBeCloseTo(30)
    expect(result!.cost_contribution_pct).toBeCloseTo(20)
  })

  it('zero totalChange → null', () => {
    expect(computeBridgeContributions(0, 10_000, 5_000, 3_000)).toBeNull()
  })

  it('null volumeEffect → volume_contribution_pct is null', () => {
    const result = computeBridgeContributions(20_000, null, 10_000, 5_000)
    expect(result).not.toBeNull()
    expect(result!.volume_contribution_pct).toBeNull()
    expect(result!.price_mix_contribution_pct).toBeCloseTo(50)
  })

  it('null priceMixEffect → price_mix_contribution_pct is null', () => {
    const result = computeBridgeContributions(20_000, 10_000, null, 5_000)
    expect(result).not.toBeNull()
    expect(result!.price_mix_contribution_pct).toBeNull()
  })

  it('null costEffect → cost_contribution_pct is null', () => {
    const result = computeBridgeContributions(20_000, 10_000, 5_000, null)
    expect(result).not.toBeNull()
    expect(result!.cost_contribution_pct).toBeNull()
  })

  it('negative effects → negative contribution pcts', () => {
    const result = computeBridgeContributions(10_000, 20_000, -5_000, -5_000)
    expect(result).not.toBeNull()
    expect(result!.volume_contribution_pct).toBeCloseTo(200)
    expect(result!.price_mix_contribution_pct).toBeCloseTo(-50)
    expect(result!.cost_contribution_pct).toBeCloseTo(-50)
  })

  it('negative totalChange with negative effects → positive contribution pcts', () => {
    const result = computeBridgeContributions(-10_000, -5_000, -3_000, -2_000)
    expect(result).not.toBeNull()
    expect(result!.volume_contribution_pct).toBeCloseTo(50)
    expect(result!.price_mix_contribution_pct).toBeCloseTo(30)
    expect(result!.cost_contribution_pct).toBeCloseTo(20)
  })
})

// ── identifyPrimaryDriver ─────────────────────────────────────────────────────

describe('identifyPrimaryDriver', () => {
  it('volume is clearly largest → volume', () => {
    expect(identifyPrimaryDriver(50_000, 5_000, 3_000)).toBe('volume')
  })

  it('price_mix is clearly largest → price_mix', () => {
    expect(identifyPrimaryDriver(5_000, 50_000, 3_000)).toBe('price_mix')
  })

  it('cost is clearly largest → cost', () => {
    expect(identifyPrimaryDriver(3_000, 5_000, 50_000)).toBe('cost')
  })

  it('all null → insufficient_data', () => {
    expect(identifyPrimaryDriver(null, null, null)).toBe('insufficient_data')
  })

  it('two are tied as largest → mixed', () => {
    // 50_000 and 50_000 both largest
    expect(identifyPrimaryDriver(50_000, 50_000, 3_000)).toBe('mixed')
  })

  it('all three equal → mixed', () => {
    expect(identifyPrimaryDriver(30_000, 30_000, 30_000)).toBe('mixed')
  })

  it('negative effects: largest absolute value wins', () => {
    // abs(-50_000) > abs(5_000) > abs(-3_000)
    expect(identifyPrimaryDriver(-50_000, 5_000, -3_000)).toBe('volume')
  })

  it('one null, others clear → identifies from non-null', () => {
    expect(identifyPrimaryDriver(null, 50_000, 3_000)).toBe('price_mix')
  })

  it('two null, one non-null → that one wins', () => {
    expect(identifyPrimaryDriver(null, null, 10_000)).toBe('cost')
  })

  it('all zero → mixed', () => {
    expect(identifyPrimaryDriver(0, 0, 0)).toBe('mixed')
  })
})

// ── classifyEbitdaMarginHealth ────────────────────────────────────────────────

describe('classifyEbitdaMarginHealth', () => {
  it('null → insufficient_data', () => {
    expect(classifyEbitdaMarginHealth(null)).toBe('insufficient_data')
  })

  it('exact 25% → excellent', () => {
    expect(classifyEbitdaMarginHealth(25)).toBe('excellent')
  })

  it('above 25% → excellent', () => {
    expect(classifyEbitdaMarginHealth(40)).toBe('excellent')
  })

  it('exact 15% → good', () => {
    expect(classifyEbitdaMarginHealth(15)).toBe('good')
  })

  it('between 15% and 25% → good', () => {
    expect(classifyEbitdaMarginHealth(20)).toBe('good')
  })

  it('exact 8% → moderate', () => {
    expect(classifyEbitdaMarginHealth(8)).toBe('moderate')
  })

  it('between 8% and 15% → moderate', () => {
    expect(classifyEbitdaMarginHealth(12)).toBe('moderate')
  })

  it('exact 3% → low', () => {
    expect(classifyEbitdaMarginHealth(3)).toBe('low')
  })

  it('between 3% and 8% → low', () => {
    expect(classifyEbitdaMarginHealth(5)).toBe('low')
  })

  it('below 3% → negative', () => {
    expect(classifyEbitdaMarginHealth(2)).toBe('negative')
  })

  it('0% → negative', () => {
    expect(classifyEbitdaMarginHealth(0)).toBe('negative')
  })

  it('negative margin → negative', () => {
    expect(classifyEbitdaMarginHealth(-5)).toBe('negative')
  })
})

// ── generateBridgeNarrative ───────────────────────────────────────────────────

describe('generateBridgeNarrative', () => {
  it('insufficient_data → explains missing data', () => {
    const result = generateBridgeNarrative('insufficient_data', 'volume', 0, null)
    expect(result).toContain('yeterli veri')
  })

  it('turnaround → positive transition message', () => {
    const result = generateBridgeNarrative('turnaround', 'cost', 30_000, 10)
    expect(result).toContain('negatif')
    expect(result).toContain('pozitif')
  })

  it('turnaround includes margin if available', () => {
    const result = generateBridgeNarrative('turnaround', 'volume', 15_000, 12.5)
    expect(result).toContain('12.5')
  })

  it('deterioration → urgent alert message', () => {
    const result = generateBridgeNarrative('deterioration', 'price_mix', -20_000, -5)
    expect(result).toContain('negatif')
  })

  it('strong_growth + volume driver', () => {
    const result = generateBridgeNarrative('strong_growth', 'volume', 50_000, 25)
    expect(result).toContain('hacim')
  })

  it('strong_growth + price_mix driver', () => {
    const result = generateBridgeNarrative('strong_growth', 'price_mix', 50_000, 30)
    expect(result).toContain('fiyat')
  })

  it('strong_growth + cost driver', () => {
    const result = generateBridgeNarrative('strong_growth', 'cost', 50_000, 28)
    expect(result).toContain('maliyet')
  })

  it('severe_decline mentions risk', () => {
    const result = generateBridgeNarrative('severe_decline', 'cost', -40_000, 2)
    expect(result).toContain('risk')
  })

  it('growth with mixed driver', () => {
    const result = generateBridgeNarrative('growth', 'mixed', 15_000, 18)
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(10)
  })

  it('stable → stable description', () => {
    const result = generateBridgeNarrative('stable', 'volume', 2_000, 20)
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(10)
  })

  it('decline with cost driver', () => {
    const result = generateBridgeNarrative('decline', 'cost', -15_000, 8)
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(10)
  })

  it('null margin omits margin from narrative', () => {
    const result = generateBridgeNarrative('growth', 'volume', 10_000, null)
    // Should not contain %null or undefined
    expect(result).not.toContain('null')
    expect(result).not.toContain('undefined')
  })

  it('returns non-empty string for all trend types', () => {
    const trends = ['strong_growth', 'growth', 'stable', 'decline', 'severe_decline', 'turnaround', 'deterioration', 'insufficient_data'] as const
    for (const trend of trends) {
      const result = generateBridgeNarrative(trend, 'volume', 1_000, 10)
      expect(result.length).toBeGreaterThan(0)
    }
  })

  it('all driver types produce valid narratives', () => {
    const drivers = ['volume', 'price_mix', 'cost', 'mixed', 'insufficient_data'] as const
    for (const driver of drivers) {
      const result = generateBridgeNarrative('growth', driver, 10_000, 15)
      expect(result.length).toBeGreaterThan(0)
      expect(result).not.toContain('undefined')
    }
  })
})

// ── Additional computeEbitda tests ────────────────────────────────────────────

describe('computeEbitda — additional', () => {
  it('large positive GP and zero opex → EBITDA = GP', () => {
    expect(computeEbitda(1_000_000, 0)).toBe(1_000_000)
  })

  it('both negative inputs → subtraction still works', () => {
    // -20_000 - (-5_000) = -15_000
    expect(computeEbitda(-20_000, -5_000)).toBe(-15_000)
  })

  it('floating point values handled correctly', () => {
    expect(computeEbitda(123_456.78, 45_678.9)).toBeCloseTo(77_777.88)
  })
})

// ── Additional computeEbitdaMargin tests ──────────────────────────────────────

describe('computeEbitdaMargin — additional', () => {
  it('small revenue large ebitda → margin > 100%', () => {
    // EBITDA > revenue is unusual but math should work
    expect(computeEbitdaMargin(120_000, 100_000)).toBeCloseTo(120)
  })

  it('negative ebitda and positive revenue → negative margin fraction', () => {
    expect(computeEbitdaMargin(-5_000, 200_000)).toBeCloseTo(-2.5)
  })

  it('very small revenue not zero → returns number not null', () => {
    const result = computeEbitdaMargin(1, 1)
    expect(result).not.toBeNull()
    expect(result).toBeCloseTo(100)
  })
})

// ── Additional computeVolumeEffect tests ──────────────────────────────────────

describe('computeVolumeEffect — additional', () => {
  it('very high prior margin → proportionally large volume effect', () => {
    // 50% EBITDA margin on revenue +50k
    expect(computeVolumeEffect(100_000, 150_000, 50)).toBeCloseTo(25_000)
  })

  it('prior margin at boundary 0 → always zero effect', () => {
    expect(computeVolumeEffect(200_000, 350_000, 0)).toBe(0)
  })

  it('large revenue decline with prior margin 30%', () => {
    // (50k - 200k) × 0.30 = -45_000
    expect(computeVolumeEffect(200_000, 50_000, 30)).toBeCloseTo(-45_000)
  })
})

// ── Additional computePriceMixEffect tests ────────────────────────────────────

describe('computePriceMixEffect — additional', () => {
  it('large revenue base amplifies small margin shift', () => {
    // 1M revenue × 0.5% margin shift
    expect(computePriceMixEffect(1_000_000, 30, 30.5)).toBeCloseTo(5_000)
  })

  it('zero current revenue → zero effect even with margin diff', () => {
    expect(computePriceMixEffect(0, 25, 30)).toBe(0)
  })

  it('prior null, current valid → null', () => {
    expect(computePriceMixEffect(100_000, null, 25)).toBeNull()
  })
})

// ── Additional computeCostEffect tests ────────────────────────────────────────

describe('computeCostEffect — additional', () => {
  it('opex grew faster than revenue → negative effect', () => {
    // priorRatio = 0.20; current expected = 200k×0.20 = 40k; actual = 60k → -(60k-40k) = -20k
    expect(computeCostEffect(100_000, 20_000, 200_000, 60_000)).toBeCloseTo(-20_000)
  })

  it('very high prior opex ratio reduces expected current cost baseline', () => {
    // priorRatio = 0.80; expected = 150k×0.80 = 120k; actual = 100k → -(100k-120k) = 20k
    expect(computeCostEffect(100_000, 80_000, 150_000, 100_000)).toBeCloseTo(20_000)
  })

  it('current revenue zero with prior revenue non-zero → valid calculation', () => {
    // priorRatio = 0.30; expected = 0×0.30 = 0; actual = 5k → -(5k-0) = -5k
    expect(computeCostEffect(100_000, 30_000, 0, 5_000)).toBeCloseTo(-5_000)
  })
})

// ── Additional computeResidualEffect tests ────────────────────────────────────

describe('computeResidualEffect — additional', () => {
  it('large positive total, negative effects → large positive residual', () => {
    // total=50k; vol=-5k, price=-10k, cost=-15k → residual = 50k - (-5k-10k-15k) = 80k
    expect(computeResidualEffect(0, 50_000, -5_000, -10_000, -15_000)).toBeCloseTo(80_000)
  })

  it('residual sign matches gap direction', () => {
    // total change = 10k; vol+price+cost = 12k → residual = -2k
    expect(computeResidualEffect(10_000, 20_000, 6_000, 4_000, 2_000)).toBeCloseTo(-2_000)
  })

  it('turnaround scenario: prior negative, effects all present', () => {
    const prior = -5_000
    const current = 15_000
    const vol = 8_000, price = 5_000, cost = 7_000
    const residual = computeResidualEffect(prior, current, vol, price, cost)
    expect(residual).toBeCloseTo(20_000 - (vol + price + cost))
  })
})

// ── Additional computeEbitdaChange tests ──────────────────────────────────────

describe('computeEbitdaChange — additional', () => {
  it('both negative, current less negative → positive change', () => {
    expect(computeEbitdaChange(-30_000, -10_000)).toBe(20_000)
  })

  it('both negative, current more negative → negative change', () => {
    expect(computeEbitdaChange(-10_000, -30_000)).toBe(-20_000)
  })

  it('large absolute values', () => {
    expect(computeEbitdaChange(1_000_000, 2_500_000)).toBe(1_500_000)
  })
})

// ── Additional validateBridgeReconciliation tests ─────────────────────────────

describe('validateBridgeReconciliation — additional', () => {
  it('all effects exactly sum → gap = 0', () => {
    // 5k + 3k + 2k + 0k = 10k total
    expect(validateBridgeReconciliation(10_000, 5_000, 3_000, 2_000, 0)).toBeCloseTo(0)
  })

  it('residual negative compensates positive effects → gap = 0', () => {
    // 10k total; vol=15k, price=5k, cost=2k, residual=-12k → sum=10k, gap=0
    expect(validateBridgeReconciliation(10_000, 15_000, 5_000, 2_000, -12_000)).toBeCloseTo(0)
  })

  it('all effects zero and total zero → gap = 0', () => {
    expect(validateBridgeReconciliation(0, 0, 0, 0, 0)).toBe(0)
  })
})

// ── Additional classifyEbitdaTrend tests ──────────────────────────────────────

describe('classifyEbitdaTrend — additional', () => {
  it('turnaround: both negative is NOT turnaround', () => {
    // both negative → neither turnaround condition met → use % change
    expect(classifyEbitdaTrend(-20_000, -10_000)).toBe('strong_growth') // +100% improvement
  })

  it('prior negative, current = 0 → insufficient_data on % calc but current not > 0 → stable case', () => {
    // prior < 0, current = 0 → not turnaround (current not > 0), not deterioration (current not < 0)
    // prior !== 0 so uses % change: (0 - (-10k)) / 10k * 100 = +100% → strong_growth
    expect(classifyEbitdaTrend(-10_000, 0)).toBe('strong_growth')
  })

  it('boundary: exactly +25% is strong_growth', () => {
    expect(classifyEbitdaTrend(80_000, 100_000)).toBe('strong_growth')
  })

  it('just below +25% (24.9%) is growth', () => {
    // 100_000 → 124_900 = +24.9%
    expect(classifyEbitdaTrend(100_000, 124_900)).toBe('growth')
  })

  it('exactly -10% is decline (not stable, uses > -10% for stable)', () => {
    // 100k → 90k = exactly -10% → changePct = -10 → not > -10 → not stable → decline
    expect(classifyEbitdaTrend(100_000, 90_000)).toBe('decline')
  })

  it('exactly -25% is decline boundary (>= -25)', () => {
    expect(classifyEbitdaTrend(100_000, 75_000)).toBe('decline')
  })

  it('negative prior, negative current, improving → strong_growth', () => {
    // -100k → -50k = +100% improvement
    expect(classifyEbitdaTrend(-100_000, -50_000)).toBe('strong_growth')
  })
})

// ── Additional computeBridgeContributions tests ────────────────────────────────

describe('computeBridgeContributions — additional', () => {
  it('all effects null → contributions object with all null values (not null itself)', () => {
    const result = computeBridgeContributions(10_000, null, null, null)
    expect(result).not.toBeNull()
    expect(result!.volume_contribution_pct).toBeNull()
    expect(result!.price_mix_contribution_pct).toBeNull()
    expect(result!.cost_contribution_pct).toBeNull()
  })

  it('single dominant effect → 100% contribution', () => {
    const result = computeBridgeContributions(50_000, 50_000, 0, 0)
    expect(result!.volume_contribution_pct).toBeCloseTo(100)
  })

  it('negative total change with positive volume → negative contribution %', () => {
    const result = computeBridgeContributions(-10_000, 5_000, null, null)
    expect(result!.volume_contribution_pct).toBeCloseTo(-50)
  })
})

// ── Additional identifyPrimaryDriver tests ────────────────────────────────────

describe('identifyPrimaryDriver — additional', () => {
  it('cost null with volume and price tied → mixed', () => {
    expect(identifyPrimaryDriver(10_000, 10_000, null)).toBe('mixed')
  })

  it('small gap between two leaders within 5% tolerance → mixed', () => {
    // 100 and 95 → 95 >= 100 × 0.95 → tied → mixed
    expect(identifyPrimaryDriver(100, 95, 10)).toBe('mixed')
  })

  it('volume clearly dominates over tied cost and price_mix', () => {
    // volume=1000, price=50, cost=50 → vol clearly >0.95×1000=950 alone → volume
    expect(identifyPrimaryDriver(1_000, 50, 50)).toBe('volume')
  })
})

// ── Additional classifyEbitdaMarginHealth tests ────────────────────────────────

describe('classifyEbitdaMarginHealth — additional', () => {
  it('boundary just above 25% → excellent', () => {
    expect(classifyEbitdaMarginHealth(25.1)).toBe('excellent')
  })

  it('boundary just below 15% → moderate', () => {
    expect(classifyEbitdaMarginHealth(14.9)).toBe('moderate')
  })

  it('boundary just below 8% → low', () => {
    expect(classifyEbitdaMarginHealth(7.9)).toBe('low')
  })

  it('boundary just below 3% → negative', () => {
    expect(classifyEbitdaMarginHealth(2.9)).toBe('negative')
  })

  it('very high margin → excellent', () => {
    expect(classifyEbitdaMarginHealth(80)).toBe('excellent')
  })
})

// ── Additional generateBridgeNarrative tests ──────────────────────────────────

describe('generateBridgeNarrative — additional', () => {
  it('deterioration with margin info omitted from message focus', () => {
    const result = generateBridgeNarrative('deterioration', 'volume', -25_000, -8)
    // Should focus on urgency
    expect(result).toContain('negatif')
  })

  it('turnaround without margin → no margin in narrative', () => {
    const result = generateBridgeNarrative('turnaround', 'cost', 20_000, null)
    expect(result).not.toContain('null')
    expect(result).toContain('negatif')
  })

  it('severe_decline narrative length is substantial', () => {
    const result = generateBridgeNarrative('severe_decline', 'volume', -100_000, 1)
    expect(result.length).toBeGreaterThan(30)
  })

  it('positive change amount formatted in narrative', () => {
    const result = generateBridgeNarrative('growth', 'cost', 25_000, 18)
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(10)
  })

  it('insufficient_data driver with valid trend returns non-empty string', () => {
    const result = generateBridgeNarrative('stable', 'insufficient_data', 500, 15)
    expect(result.length).toBeGreaterThan(0)
  })
})

// ── Integration: bridge reconciliation consistency ─────────────────────────────

describe('bridge reconciliation integration', () => {
  it('full bridge reconciles: residual = 0 when all effects computable', () => {
    const priorRevenue  = 100_000
    const currentRevenue = 120_000
    const priorCogs     = 60_000
    const currentCogs   = 70_000
    const priorOpex     = 20_000
    const currentOpex   = 18_000

    const priorGrossProfit   = priorRevenue   - priorCogs
    const currentGrossProfit = currentRevenue - currentCogs

    const priorGrossMarginPct   = (priorGrossProfit   / priorRevenue)   * 100
    const currentGrossMarginPct = (currentGrossProfit / currentRevenue) * 100

    const priorEbitda   = computeEbitda(priorGrossProfit,   priorOpex)
    const currentEbitda = computeEbitda(currentGrossProfit, currentOpex)

    const priorEbitdaMarginPct = computeEbitdaMargin(priorEbitda, priorRevenue)

    const totalChange  = computeEbitdaChange(priorEbitda, currentEbitda)
    const volumeEffect = computeVolumeEffect(priorRevenue, currentRevenue, priorEbitdaMarginPct)
    const priceMix     = computePriceMixEffect(currentRevenue, priorGrossMarginPct, currentGrossMarginPct)
    const costEffect   = computeCostEffect(priorRevenue, priorOpex, currentRevenue, currentOpex)
    const residual     = computeResidualEffect(priorEbitda, currentEbitda, volumeEffect, priceMix, costEffect)

    expect(residual).not.toBeNull()

    const gap = validateBridgeReconciliation(totalChange, volumeEffect, priceMix, costEffect, residual)
    expect(gap).not.toBeNull()
    expect(Math.abs(gap!)).toBeLessThan(0.01)
  })

  it('classifyEbitdaTrend and classifyEbitdaMarginHealth are consistent for strong scenarios', () => {
    const priorEbitda   = 50_000
    const currentEbitda = 80_000  // +60%
    const revenue       = 300_000

    const trend        = classifyEbitdaTrend(priorEbitda, currentEbitda)
    const marginHealth = classifyEbitdaMarginHealth(computeEbitdaMargin(currentEbitda, revenue))

    expect(trend).toBe('strong_growth')
    // 80_000/300_000 * 100 ≈ 26.7% → excellent
    expect(marginHealth).toBe('excellent')
  })

  it('contributions sum close to 100% when all effects are provided', () => {
    const totalChange  = 15_000
    const volumeEffect = 8_000
    const priceMix     = 4_000
    const costEffect   = 3_000

    const contributions = computeBridgeContributions(totalChange, volumeEffect, priceMix, costEffect)
    expect(contributions).not.toBeNull()

    const sum =
      (contributions!.volume_contribution_pct ?? 0) +
      (contributions!.price_mix_contribution_pct ?? 0) +
      (contributions!.cost_contribution_pct ?? 0)

    // sum should be close to 100% (may not be exact if residual exists)
    expect(sum).toBeCloseTo(100)
  })
})
