// ─────────────────────────────────────────────────────────────────────────────
// tests/fx-exposure.test.ts
//
// Unit tests for all pure functions in fx-exposure.service.ts:
//   - computeFxImpact
//   - computeNetFxExposure
//   - computeFxRiskRatio
//   - classifyFxRisk
//   - computeCurrencyDiversification
//   - computeScenarioFxLoss
//   - classifyHedgeRecommendation
//
// Run with:  npx vitest run tests/fx-exposure.test.ts
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest'
import {
  computeFxImpact,
  computeNetFxExposure,
  computeFxRiskRatio,
  classifyFxRisk,
  computeCurrencyDiversification,
  computeScenarioFxLoss,
  classifyHedgeRecommendation,
} from '../lib/services/finance/fx-exposure.service'

// ── computeFxImpact ───────────────────────────────────────────────────────────

describe('computeFxImpact', () => {
  it('gain: rate increases (TRY depreciated) → positive impact', () => {
    // 1000 USD, original rate 32, current rate 38 → impact = 1000×6 = 6000
    expect(computeFxImpact(1000, 32, 38)).toBe(6000)
  })

  it('loss: rate decreases (TRY strengthened) → negative impact', () => {
    // 500 USD, original 38, current 32 → impact = 500×(-6) = -3000
    expect(computeFxImpact(500, 38, 32)).toBe(-3000)
  })

  it('zero impact when rate unchanged', () => {
    expect(computeFxImpact(1000, 35, 35)).toBe(0)
  })

  it('zero amount → zero impact regardless of rates', () => {
    expect(computeFxImpact(0, 30, 40)).toBe(0)
  })

  it('EUR: rate 35→42 on 200 units → gain 1400', () => {
    expect(computeFxImpact(200, 35, 42)).toBe(1400)
  })

  it('GBP: fractional rates compute correctly', () => {
    // 100 GBP, 45.5→47.25 → 100×1.75 = 175
    expect(computeFxImpact(100, 45.5, 47.25)).toBeCloseTo(175, 2)
  })
})

// ── computeNetFxExposure ──────────────────────────────────────────────────────

describe('computeNetFxExposure', () => {
  it('positive: more receivables than payables', () => {
    expect(computeNetFxExposure(80000, 20000)).toBe(60000)
  })

  it('negative: more payables than receivables', () => {
    expect(computeNetFxExposure(20000, 80000)).toBe(-60000)
  })

  it('zero when equal receivables and payables', () => {
    expect(computeNetFxExposure(50000, 50000)).toBe(0)
  })

  it('all receivables, no payables', () => {
    expect(computeNetFxExposure(45000, 0)).toBe(45000)
  })

  it('no receivables, only payables → negative', () => {
    expect(computeNetFxExposure(0, 30000)).toBe(-30000)
  })

  it('zero inputs → zero', () => {
    expect(computeNetFxExposure(0, 0)).toBe(0)
  })
})

// ── computeFxRiskRatio ────────────────────────────────────────────────────────

describe('computeFxRiskRatio', () => {
  it('normal case: |net| / revenue × 100', () => {
    // |30000| / 100000 × 100 = 30%
    expect(computeFxRiskRatio(30000, 100000)).toBeCloseTo(30)
  })

  it('negative net exposure uses absolute value', () => {
    // |-30000| / 100000 × 100 = 30%
    expect(computeFxRiskRatio(-30000, 100000)).toBeCloseTo(30)
  })

  it('zero revenue → null', () => {
    expect(computeFxRiskRatio(5000, 0)).toBeNull()
  })

  it('zero net exposure → 0%', () => {
    expect(computeFxRiskRatio(0, 100000)).toBe(0)
  })

  it('net > revenue → ratio > 100%', () => {
    expect(computeFxRiskRatio(150000, 100000)).toBeCloseTo(150)
  })

  it('small net exposure computes fractionally', () => {
    // 1 / 3 × 100 ≈ 33.33
    expect(computeFxRiskRatio(1, 3)).toBeCloseTo(33.33, 1)
  })
})

// ── classifyFxRisk ────────────────────────────────────────────────────────────

describe('classifyFxRisk', () => {
  it('null → insufficient_data', () => {
    expect(classifyFxRisk(null)).toBe('insufficient_data')
  })

  it('0% → minimal', () => {
    expect(classifyFxRisk(0)).toBe('minimal')
  })

  it('4.99% → minimal', () => {
    expect(classifyFxRisk(4.99)).toBe('minimal')
  })

  it('5% → low (boundary)', () => {
    expect(classifyFxRisk(5)).toBe('low')
  })

  it('10% → low', () => {
    expect(classifyFxRisk(10)).toBe('low')
  })

  it('14.99% → low', () => {
    expect(classifyFxRisk(14.99)).toBe('low')
  })

  it('15% → moderate (boundary)', () => {
    expect(classifyFxRisk(15)).toBe('moderate')
  })

  it('20% → moderate', () => {
    expect(classifyFxRisk(20)).toBe('moderate')
  })

  it('29.99% → moderate', () => {
    expect(classifyFxRisk(29.99)).toBe('moderate')
  })

  it('30% → significant (boundary)', () => {
    expect(classifyFxRisk(30)).toBe('significant')
  })

  it('45% → significant', () => {
    expect(classifyFxRisk(45)).toBe('significant')
  })

  it('49.99% → significant', () => {
    expect(classifyFxRisk(49.99)).toBe('significant')
  })

  it('50% → critical (boundary)', () => {
    expect(classifyFxRisk(50)).toBe('critical')
  })

  it('80% → critical', () => {
    expect(classifyFxRisk(80)).toBe('critical')
  })

  it('100% → critical', () => {
    expect(classifyFxRisk(100)).toBe('critical')
  })
})

// ── computeCurrencyDiversification ───────────────────────────────────────────

describe('computeCurrencyDiversification', () => {
  it('all TRY → 100% try_pct, 0% foreign_pct, no dominant_currency', () => {
    const result = computeCurrencyDiversification([
      { currency: 'TRY', amount_try: 100000 },
    ])
    expect(result.try_pct).toBeCloseTo(100)
    expect(result.foreign_pct).toBeCloseTo(0)
    expect(result.dominant_currency).toBeNull()
  })

  it('all USD → 0% try_pct, 100% foreign_pct, dominant=USD', () => {
    const result = computeCurrencyDiversification([
      { currency: 'USD', amount_try: 50000 },
    ])
    expect(result.try_pct).toBeCloseTo(0)
    expect(result.foreign_pct).toBeCloseTo(100)
    expect(result.dominant_currency).toBe('USD')
  })

  it('mixed TRY+USD → correct split', () => {
    const result = computeCurrencyDiversification([
      { currency: 'TRY', amount_try: 60000 },
      { currency: 'USD', amount_try: 40000 },
    ])
    expect(result.try_pct).toBeCloseTo(60)
    expect(result.foreign_pct).toBeCloseTo(40)
    expect(result.dominant_currency).toBe('USD')
  })

  it('dominant_currency is largest non-TRY by amount', () => {
    const result = computeCurrencyDiversification([
      { currency: 'TRY', amount_try: 50000 },
      { currency: 'USD', amount_try: 30000 },
      { currency: 'EUR', amount_try: 20000 },
    ])
    expect(result.dominant_currency).toBe('USD')
  })

  it('HHI is 1.0 when single currency', () => {
    const result = computeCurrencyDiversification([
      { currency: 'TRY', amount_try: 100000 },
    ])
    expect(result.hhi).toBeCloseTo(1)
  })

  it('HHI < 1.0 for multiple currencies', () => {
    const result = computeCurrencyDiversification([
      { currency: 'TRY', amount_try: 50000 },
      { currency: 'USD', amount_try: 50000 },
    ])
    expect(result.hhi).toBeCloseTo(0.5)
  })

  it('empty array → all zeros, no dominant', () => {
    const result = computeCurrencyDiversification([])
    expect(result.hhi).toBe(0)
    expect(result.dominant_currency).toBeNull()
    expect(result.try_pct).toBe(0)
    expect(result.foreign_pct).toBe(0)
  })

  it('total zero (zero amounts) → all zeros', () => {
    const result = computeCurrencyDiversification([
      { currency: 'USD', amount_try: 0 },
    ])
    expect(result.hhi).toBe(0)
    expect(result.try_pct).toBe(0)
    expect(result.foreign_pct).toBe(0)
  })

  it('try_pct + foreign_pct = 100 for mixed', () => {
    const result = computeCurrencyDiversification([
      { currency: 'TRY', amount_try: 70000 },
      { currency: 'EUR', amount_try: 30000 },
    ])
    expect(result.try_pct + result.foreign_pct).toBeCloseTo(100)
  })
})

// ── computeScenarioFxLoss ─────────────────────────────────────────────────────

describe('computeScenarioFxLoss', () => {
  it('net liability (negative exposure): depreciation causes loss (positive result)', () => {
    // net = -100000 (net liability), 20% depreciation
    // = -100000 × 20/100 × -1 = +20000 (loss)
    expect(computeScenarioFxLoss(-100000, 20)).toBeCloseTo(20000)
  })

  it('net asset (positive exposure): depreciation causes gain (negative result)', () => {
    // net = +100000 (net asset), 20% depreciation
    // = 100000 × 20/100 × -1 = -20000 (gain, i.e. negative loss)
    expect(computeScenarioFxLoss(100000, 20)).toBeCloseTo(-20000)
  })

  it('zero net exposure → zero loss', () => {
    expect(computeScenarioFxLoss(0, 20)).toBeCloseTo(0)
  })

  it('10% depreciation scenario', () => {
    // net = -500000, 10% → loss = 50000
    expect(computeScenarioFxLoss(-500000, 10)).toBeCloseTo(50000)
  })

  it('30% depreciation scenario', () => {
    // net = -200000, 30% → loss = 60000
    expect(computeScenarioFxLoss(-200000, 30)).toBeCloseTo(60000)
  })

  it('zero depreciation → zero loss', () => {
    expect(computeScenarioFxLoss(-100000, 0)).toBe(0)
  })
})

// ── classifyHedgeRecommendation ───────────────────────────────────────────────

describe('classifyHedgeRecommendation', () => {
  it('null ratio → no_action', () => {
    expect(classifyHedgeRecommendation(null, 50000)).toBe('no_action')
  })

  it('ratio = 0% → no_action', () => {
    expect(classifyHedgeRecommendation(0, 50000)).toBe('no_action')
  })

  it('ratio < 5% → no_action', () => {
    expect(classifyHedgeRecommendation(4.9, 50000)).toBe('no_action')
  })

  it('ratio = 5% → monitor (boundary)', () => {
    expect(classifyHedgeRecommendation(5, 50000)).toBe('monitor')
  })

  it('ratio 10% with real exposure → monitor', () => {
    expect(classifyHedgeRecommendation(10, 100000)).toBe('monitor')
  })

  it('ratio 14.9% → monitor', () => {
    expect(classifyHedgeRecommendation(14.9, 100000)).toBe('monitor')
  })

  it('net exposure near zero → natural_hedge even with significant ratio', () => {
    expect(classifyHedgeRecommendation(25, 0.5)).toBe('natural_hedge')
  })

  it('ratio 15% with real exposure → forward_contract (boundary)', () => {
    expect(classifyHedgeRecommendation(15, 100000)).toBe('forward_contract')
  })

  it('ratio 35% → forward_contract', () => {
    expect(classifyHedgeRecommendation(35, 200000)).toBe('forward_contract')
  })

  it('ratio 49.9% → forward_contract', () => {
    expect(classifyHedgeRecommendation(49.9, 300000)).toBe('forward_contract')
  })

  it('ratio 50% → urgent_hedge (boundary)', () => {
    expect(classifyHedgeRecommendation(50, 500000)).toBe('urgent_hedge')
  })

  it('ratio 80% → urgent_hedge', () => {
    expect(classifyHedgeRecommendation(80, 800000)).toBe('urgent_hedge')
  })
})

// ── computeFxImpact — extended ────────────────────────────────────────────────

describe('computeFxImpact — extended', () => {
  it('large position: 10_000 USD, rate 32→42 → 100_000 TRY gain', () => {
    expect(computeFxImpact(10_000, 32, 42)).toBe(100_000)
  })

  it('very small rate movement: 1_000_000 units, rate moves 0.01 → 10_000', () => {
    expect(computeFxImpact(1_000_000, 35.00, 35.01)).toBeCloseTo(10_000, 0)
  })

  it('symmetric: gain on long equals loss on short with same amounts', () => {
    const gain = computeFxImpact(1000, 30, 40)
    const loss = computeFxImpact(1000, 40, 30)
    expect(gain).toBe(-loss)
  })

  it('rate increase by 50% → proportional impact', () => {
    // 100 units, rate 20 → 30 (50% increase)
    expect(computeFxImpact(100, 20, 30)).toBe(1000)
  })

  it('negative foreignAmount treated mathematically', () => {
    // -100 USD, rate rises 30→35 → impact = -100 × 5 = -500
    expect(computeFxImpact(-100, 30, 35)).toBe(-500)
  })

  it('very large rate jump (e.g., crisis scenario)', () => {
    // 50_000 USD, rate 32→65 → 50k × 33 = 1_650_000
    expect(computeFxImpact(50_000, 32, 65)).toBe(1_650_000)
  })
})

// ── computeNetFxExposure — extended ──────────────────────────────────────────

describe('computeNetFxExposure — extended', () => {
  it('large asymmetric position', () => {
    expect(computeNetFxExposure(500_000, 10_000)).toBe(490_000)
  })

  it('equal large positions → zero', () => {
    expect(computeNetFxExposure(1_000_000, 1_000_000)).toBe(0)
  })

  it('fractional amounts', () => {
    expect(computeNetFxExposure(1000.50, 500.25)).toBeCloseTo(500.25, 2)
  })

  it('payables dominate: net liability position', () => {
    expect(computeNetFxExposure(10_000, 90_000)).toBe(-80_000)
  })

  it('tiny receivables vs zero payables', () => {
    expect(computeNetFxExposure(0.01, 0)).toBeCloseTo(0.01, 5)
  })
})

// ── computeFxRiskRatio — extended ─────────────────────────────────────────────

describe('computeFxRiskRatio — extended', () => {
  it('exactly 50% ratio (critical boundary)', () => {
    expect(computeFxRiskRatio(50_000, 100_000)).toBeCloseTo(50)
  })

  it('exactly 15% ratio (moderate boundary)', () => {
    expect(computeFxRiskRatio(15_000, 100_000)).toBeCloseTo(15)
  })

  it('very small exposure vs large revenue → near zero', () => {
    expect(computeFxRiskRatio(100, 1_000_000)).toBeCloseTo(0.01, 2)
  })

  it('exposure equals revenue → 100%', () => {
    expect(computeFxRiskRatio(100_000, 100_000)).toBeCloseTo(100)
  })

  it('negative net exposure uses absolute value correctly at 30% boundary', () => {
    expect(computeFxRiskRatio(-30_000, 100_000)).toBeCloseTo(30)
  })
})

// ── classifyFxRisk — extended ────────────────────────────────────────────────

describe('classifyFxRisk — extended', () => {
  it('exactly 0% → minimal', () => {
    expect(classifyFxRisk(0)).toBe('minimal')
  })

  it('negative ratio treated as below 5 → minimal', () => {
    expect(classifyFxRisk(-1)).toBe('minimal')
  })

  it('very large % → critical', () => {
    expect(classifyFxRisk(999)).toBe('critical')
  })

  it('29.999 → moderate (not significant)', () => {
    expect(classifyFxRisk(29.999)).toBe('moderate')
  })

  it('49.999 → significant (not critical)', () => {
    expect(classifyFxRisk(49.999)).toBe('significant')
  })
})

// ── computeCurrencyDiversification — extended ─────────────────────────────────

describe('computeCurrencyDiversification — extended', () => {
  it('three equal foreign currencies + TRY → correct split', () => {
    const result = computeCurrencyDiversification([
      { currency: 'TRY', amount_try: 25_000 },
      { currency: 'USD', amount_try: 25_000 },
      { currency: 'EUR', amount_try: 25_000 },
      { currency: 'GBP', amount_try: 25_000 },
    ])
    expect(result.try_pct).toBeCloseTo(25)
    expect(result.foreign_pct).toBeCloseTo(75)
  })

  it('HHI with three equal currencies is 1/3', () => {
    const result = computeCurrencyDiversification([
      { currency: 'TRY', amount_try: 33_333 },
      { currency: 'USD', amount_try: 33_333 },
      { currency: 'EUR', amount_try: 33_334 },
    ])
    expect(result.hhi).toBeCloseTo(0.333, 1)
  })

  it('negative amounts use absolute value for calculations', () => {
    const result = computeCurrencyDiversification([
      { currency: 'USD', amount_try: -50_000 },
      { currency: 'TRY', amount_try: 50_000 },
    ])
    expect(result.try_pct).toBeCloseTo(50)
    expect(result.foreign_pct).toBeCloseTo(50)
  })

  it('GBP as dominant currency when largest non-TRY', () => {
    const result = computeCurrencyDiversification([
      { currency: 'TRY', amount_try: 100_000 },
      { currency: 'USD', amount_try: 20_000 },
      { currency: 'EUR', amount_try: 30_000 },
      { currency: 'GBP', amount_try: 50_000 },
    ])
    expect(result.dominant_currency).toBe('GBP')
  })

  it('aggregates same currency entries before computing HHI', () => {
    // Two USD entries: 30_000 + 20_000 = 50_000, total = 100_000
    const result = computeCurrencyDiversification([
      { currency: 'USD', amount_try: 30_000 },
      { currency: 'USD', amount_try: 20_000 },
      { currency: 'EUR', amount_try: 50_000 },
    ])
    // USD = 50%, EUR = 50% → HHI = 0.25 + 0.25 = 0.5
    expect(result.hhi).toBeCloseTo(0.5)
  })

  it('custom currency code treated as foreign', () => {
    const result = computeCurrencyDiversification([
      { currency: 'XAU', amount_try: 80_000 },
      { currency: 'TRY', amount_try: 20_000 },
    ])
    expect(result.dominant_currency).toBe('XAU')
    expect(result.foreign_pct).toBeCloseTo(80)
  })
})

// ── computeScenarioFxLoss — extended ─────────────────────────────────────────

describe('computeScenarioFxLoss — extended', () => {
  it('very large net liability: 5M TRY @ 10% → 500_000 loss', () => {
    expect(computeScenarioFxLoss(-5_000_000, 10)).toBeCloseTo(500_000)
  })

  it('net asset position: depreciation benefits holder', () => {
    // net = +200_000, 25% depreciation → gain = -50_000
    expect(computeScenarioFxLoss(200_000, 25)).toBeCloseTo(-50_000)
  })

  it('100% depreciation scenario', () => {
    // net = -100_000 → loss = 100_000
    expect(computeScenarioFxLoss(-100_000, 100)).toBeCloseTo(100_000)
  })

  it('small depreciation 1%', () => {
    // net = -1_000_000 → loss = 10_000
    expect(computeScenarioFxLoss(-1_000_000, 1)).toBeCloseTo(10_000)
  })

  it('scenario loss is symmetric: same magnitude on gain vs loss', () => {
    const loss = computeScenarioFxLoss(-50_000, 20)
    const gain = computeScenarioFxLoss(50_000, 20)
    expect(loss).toBe(-gain)
  })
})

// ── classifyHedgeRecommendation — extended ────────────────────────────────────

describe('classifyHedgeRecommendation — extended', () => {
  it('natural_hedge with negative net exposure near zero (< 1 TRY)', () => {
    expect(classifyHedgeRecommendation(20, -0.5)).toBe('natural_hedge')
  })

  it('natural_hedge with exactly 0 net exposure', () => {
    expect(classifyHedgeRecommendation(25, 0)).toBe('natural_hedge')
  })

  it('natural_hedge check: |net| < 1, even at 50%+ risk ratio', () => {
    // natural_hedge check happens before urgent_hedge check
    expect(classifyHedgeRecommendation(75, 0.9)).toBe('natural_hedge')
  })

  it('ratio just below 15% (14.99) → monitor', () => {
    expect(classifyHedgeRecommendation(14.99, 100_000)).toBe('monitor')
  })

  it('ratio exactly 5% → monitor', () => {
    expect(classifyHedgeRecommendation(5, 100_000)).toBe('monitor')
  })

  it('ratio = 49.9% with real exposure → forward_contract', () => {
    expect(classifyHedgeRecommendation(49.9, 100_000)).toBe('forward_contract')
  })

  it('ratio exactly 50% with real exposure → urgent_hedge', () => {
    expect(classifyHedgeRecommendation(50, 100_000)).toBe('urgent_hedge')
  })

  it('very high ratio 200% → urgent_hedge', () => {
    expect(classifyHedgeRecommendation(200, 500_000)).toBe('urgent_hedge')
  })
})

// ── computeFxImpact — extended coverage ──────────────────────────────────────

describe('computeFxImpact — extended coverage', () => {
  it('no rate change → impact is 0', () => {
    expect(computeFxImpact(10_000, 32, 32)).toBe(0)
  })

  it('TRY depreciated: currentRate > originalRate → positive (gain on foreign asset)', () => {
    expect(computeFxImpact(1000, 30, 35)).toBe(5000)
  })

  it('TRY appreciated: currentRate < originalRate → negative', () => {
    expect(computeFxImpact(1000, 35, 30)).toBe(-5000)
  })

  it('zero foreign amount → impact is always 0', () => {
    expect(computeFxImpact(0, 10, 50)).toBe(0)
  })

  it('large position with small rate move', () => {
    // 500000 USD × (32.5 - 32.0) = 250000
    expect(computeFxImpact(500_000, 32.0, 32.5)).toBeCloseTo(250_000, 1)
  })

  it('fractional amounts', () => {
    expect(computeFxImpact(100.5, 10, 11)).toBeCloseTo(100.5, 1)
  })

  it('negative foreign amount (short position) × rate up → negative impact', () => {
    // short 1000 units, rate goes up → loss
    expect(computeFxImpact(-1000, 30, 35)).toBe(-5000)
  })
})

// ── computeNetFxExposure — extended ──────────────────────────────────────────

describe('computeNetFxExposure — extended', () => {
  it('zero receivables and payables → 0', () => {
    expect(computeNetFxExposure(0, 0)).toBe(0)
  })

  it('receivables > payables → positive net', () => {
    expect(computeNetFxExposure(500_000, 200_000)).toBe(300_000)
  })

  it('payables > receivables → negative net', () => {
    expect(computeNetFxExposure(100_000, 300_000)).toBe(-200_000)
  })

  it('equal receivables and payables → 0', () => {
    expect(computeNetFxExposure(250_000, 250_000)).toBe(0)
  })

  it('large numbers do not overflow', () => {
    expect(computeNetFxExposure(1e9, 1e8)).toBeCloseTo(9e8, 0)
  })
})

// ── computeFxRiskRatio — extended ────────────────────────────────────────────

describe('computeFxRiskRatio — extended', () => {
  it('null when revenue is exactly 0', () => {
    expect(computeFxRiskRatio(100_000, 0)).toBeNull()
  })

  it('100% ratio when |exposure| equals revenue', () => {
    expect(computeFxRiskRatio(500_000, 500_000)).toBeCloseTo(100, 1)
  })

  it('ratio uses absolute value: negative exposure gives same ratio as positive', () => {
    const pos = computeFxRiskRatio(100_000, 500_000)
    const neg = computeFxRiskRatio(-100_000, 500_000)
    expect(pos).toBeCloseTo(neg!, 5)
  })

  it('very small exposure → near-zero ratio', () => {
    expect(computeFxRiskRatio(100, 1_000_000)).toBeCloseTo(0.01, 3)
  })

  it('50% ratio when exposure is half of revenue', () => {
    expect(computeFxRiskRatio(250_000, 500_000)).toBeCloseTo(50, 1)
  })
})

// ── classifyFxRisk — all boundary values ─────────────────────────────────────

describe('classifyFxRisk — all boundary values', () => {
  it('null → insufficient_data', () => {
    expect(classifyFxRisk(null)).toBe('insufficient_data')
  })

  it('0% → minimal', () => {
    expect(classifyFxRisk(0)).toBe('minimal')
  })

  it('4.99% → minimal', () => {
    expect(classifyFxRisk(4.99)).toBe('minimal')
  })

  it('5% → low', () => {
    expect(classifyFxRisk(5)).toBe('low')
  })

  it('14.9% → low', () => {
    expect(classifyFxRisk(14.9)).toBe('low')
  })

  it('15% → moderate', () => {
    expect(classifyFxRisk(15)).toBe('moderate')
  })

  it('29.9% → moderate', () => {
    expect(classifyFxRisk(29.9)).toBe('moderate')
  })

  it('30% → significant', () => {
    expect(classifyFxRisk(30)).toBe('significant')
  })

  it('49.9% → significant', () => {
    expect(classifyFxRisk(49.9)).toBe('significant')
  })

  it('50% → critical', () => {
    expect(classifyFxRisk(50)).toBe('critical')
  })

  it('999% → critical', () => {
    expect(classifyFxRisk(999)).toBe('critical')
  })
})

// ── computeCurrencyDiversification — edge cases ───────────────────────────────

describe('computeCurrencyDiversification — edge cases', () => {
  it('empty array → hhi=0, dominant=null, try_pct=0, foreign_pct=0', () => {
    const result = computeCurrencyDiversification([])
    expect(result.hhi).toBe(0)
    expect(result.dominant_currency).toBeNull()
    expect(result.try_pct).toBe(0)
    expect(result.foreign_pct).toBe(0)
  })

  it('single TRY entry → hhi=1, try_pct=100, foreign_pct=0, dominant=null', () => {
    const result = computeCurrencyDiversification([{ currency: 'TRY', amount_try: 100_000 }])
    expect(result.hhi).toBeCloseTo(1, 5)
    expect(result.try_pct).toBeCloseTo(100, 1)
    expect(result.foreign_pct).toBeCloseTo(0, 1)
    expect(result.dominant_currency).toBeNull()
  })

  it('single USD entry → hhi=1, try_pct=0, foreign_pct=100, dominant=USD', () => {
    const result = computeCurrencyDiversification([{ currency: 'USD', amount_try: 50_000 }])
    expect(result.hhi).toBeCloseTo(1, 5)
    expect(result.try_pct).toBeCloseTo(0, 1)
    expect(result.foreign_pct).toBeCloseTo(100, 1)
    expect(result.dominant_currency).toBe('USD')
  })

  it('equal TRY and USD → hhi = 0.5, try_pct = 50, foreign_pct = 50', () => {
    const result = computeCurrencyDiversification([
      { currency: 'TRY', amount_try: 50_000 },
      { currency: 'USD', amount_try: 50_000 },
    ])
    expect(result.hhi).toBeCloseTo(0.5, 3)
    expect(result.try_pct).toBeCloseTo(50, 1)
    expect(result.foreign_pct).toBeCloseTo(50, 1)
  })

  it('try_pct + foreign_pct = 100 for mixed portfolio', () => {
    const result = computeCurrencyDiversification([
      { currency: 'TRY', amount_try: 30_000 },
      { currency: 'USD', amount_try: 40_000 },
      { currency: 'EUR', amount_try: 30_000 },
    ])
    expect(result.try_pct + result.foreign_pct).toBeCloseTo(100, 1)
  })

  it('dominant_currency is the largest non-TRY currency', () => {
    const result = computeCurrencyDiversification([
      { currency: 'TRY', amount_try: 100_000 },
      { currency: 'USD', amount_try: 80_000 },
      { currency: 'EUR', amount_try: 20_000 },
    ])
    expect(result.dominant_currency).toBe('USD')
  })

  it('negative amounts treated as absolute values for HHI calc', () => {
    const result = computeCurrencyDiversification([
      { currency: 'USD', amount_try: -50_000 },
      { currency: 'EUR', amount_try: 50_000 },
    ])
    expect(result.hhi).toBeCloseTo(0.5, 3)
  })
})

// ── computeScenarioFxLoss — sign semantics ────────────────────────────────────

describe('computeScenarioFxLoss — sign semantics', () => {
  it('net liability (negative TRY exposure) + depreciation → positive loss', () => {
    // netForeignExposureTry = -100_000 (owe foreign currency)
    // depreciation 10% → loss = -100_000 * 0.1 * -1 = +10_000
    expect(computeScenarioFxLoss(-100_000, 10)).toBeCloseTo(10_000, 1)
  })

  it('net asset (positive TRY exposure) + depreciation → negative (gain)', () => {
    expect(computeScenarioFxLoss(100_000, 10)).toBeCloseTo(-10_000, 1)
  })

  it('0% depreciation → 0 loss regardless of exposure', () => {
    expect(Math.abs(computeScenarioFxLoss(500_000, 0))).toBe(0)
  })

  it('30% depreciation on 200_000 TRY net liability → 60_000 loss', () => {
    expect(computeScenarioFxLoss(-200_000, 30)).toBeCloseTo(60_000, 1)
  })

  it('loss scales linearly with depreciation pct', () => {
    const base = computeScenarioFxLoss(-100_000, 10)
    const double = computeScenarioFxLoss(-100_000, 20)
    expect(double).toBeCloseTo(base * 2, 3)
  })
})
