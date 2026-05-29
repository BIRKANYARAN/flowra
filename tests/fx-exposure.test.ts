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
