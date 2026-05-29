/**
 * Supplier Scorecard Service — unit tests
 *
 * Covers all pure exported helpers:
 *   computeVolumeScore, computeRelationshipScore, computePaymentReliabilityScore,
 *   computePriceStabilityScore, computeDependencyRiskScore,
 *   computeSupplierCompositeScore, classifySupplierTier, classifyDependencyLevel,
 *   buildSupplierScore, computeSupplierHhi, computeSupplierPortfolioSummary,
 *   classifySupplierDiversification
 *
 * No DB or network calls — all in-memory.
 */

import { describe, it, expect } from 'vitest'
import {
  computeVolumeScore,
  computeRelationshipScore,
  computePaymentReliabilityScore,
  computePriceStabilityScore,
  computeDependencyRiskScore,
  computeSupplierCompositeScore,
  classifySupplierTier,
  classifyDependencyLevel,
  buildSupplierScore,
  computeSupplierHhi,
  computeSupplierPortfolioSummary,
  classifySupplierDiversification,
  type SupplierMetrics,
  type SupplierScore,
} from '../lib/services/commercial/supplier-scorecard.service'

// ── Helper ────────────────────────────────────────────────────────────────────

function makeMetrics(overrides: Partial<SupplierMetrics> = {}): SupplierMetrics {
  return {
    supplier_key: 'acme',
    supplier_name: 'Acme Ltd',
    total_purchases_try: 10_000,
    purchase_count: 5,
    avg_order_value: 2_000,
    months_active: 12,
    first_purchase_month: '2024-01',
    last_purchase_month: '2024-12',
    avg_payment_delay_days: 5,
    on_time_payment_rate: 95,
    price_variance_pct: 10,
    purchase_concentration_pct: 20,
    ...overrides,
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. computeVolumeScore
// ══════════════════════════════════════════════════════════════════════════════

describe('computeVolumeScore — concentration tiers', () => {

  // T1: > 30% → 50
  it('1.1  concentration = 35 → 50', () => {
    expect(computeVolumeScore(35)).toBe(50)
  })

  // T2: exactly at boundary > 30
  it('1.2  concentration = 30.1 → 50', () => {
    expect(computeVolumeScore(30.1)).toBe(50)
  })

  // T3: exactly 30 → next tier (> 15)
  it('1.3  concentration = 30 → 75 (not > 30)', () => {
    expect(computeVolumeScore(30)).toBe(75)
  })

  // T4: 16–30% → 75
  it('1.4  concentration = 20 → 75', () => {
    expect(computeVolumeScore(20)).toBe(75)
  })

  // T5: exactly 15.01 → 75
  it('1.5  concentration = 15.1 → 75', () => {
    expect(computeVolumeScore(15.1)).toBe(75)
  })

  // T6: exactly 15 → next tier
  it('1.6  concentration = 15 → 90', () => {
    expect(computeVolumeScore(15)).toBe(90)
  })

  // T7: 5–15% → 90
  it('1.7  concentration = 10 → 90', () => {
    expect(computeVolumeScore(10)).toBe(90)
  })

  // T8: exactly 5.01 → 90
  it('1.8  concentration = 5.1 → 90', () => {
    expect(computeVolumeScore(5.1)).toBe(90)
  })

  // T9: exactly 5 → 100
  it('1.9  concentration = 5 → 100', () => {
    expect(computeVolumeScore(5)).toBe(100)
  })

  // T10: 0% → 100
  it('1.10 concentration = 0 → 100', () => {
    expect(computeVolumeScore(0)).toBe(100)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 2. computeRelationshipScore
// ══════════════════════════════════════════════════════════════════════════════

describe('computeRelationshipScore — tenure tiers', () => {

  it('2.1  24 months → 100', () => {
    expect(computeRelationshipScore(24)).toBe(100)
  })

  it('2.2  36 months → 100', () => {
    expect(computeRelationshipScore(36)).toBe(100)
  })

  it('2.3  12 months → 80', () => {
    expect(computeRelationshipScore(12)).toBe(80)
  })

  it('2.4  23 months → 80 (< 24)', () => {
    expect(computeRelationshipScore(23)).toBe(80)
  })

  it('2.5  6 months → 60', () => {
    expect(computeRelationshipScore(6)).toBe(60)
  })

  it('2.6  11 months → 60 (≥6 but <12)', () => {
    expect(computeRelationshipScore(11)).toBe(60)
  })

  it('2.7  7 months → 60', () => {
    expect(computeRelationshipScore(7)).toBe(60)
  })

  it('2.8  3 months → 40', () => {
    expect(computeRelationshipScore(3)).toBe(40)
  })

  it('2.9  5 months → 40 (≥3 but <6)', () => {
    expect(computeRelationshipScore(5)).toBe(40)
  })

  it('2.10 2 months → 20', () => {
    expect(computeRelationshipScore(2)).toBe(20)
  })

  it('2.11 0 months → 20', () => {
    expect(computeRelationshipScore(0)).toBe(20)
  })

  it('2.12 1 month → 20', () => {
    expect(computeRelationshipScore(1)).toBe(20)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 3. computePaymentReliabilityScore
// ══════════════════════════════════════════════════════════════════════════════

describe('computePaymentReliabilityScore — on-time rate tiers', () => {

  it('3.1  100% on time → 100', () => {
    expect(computePaymentReliabilityScore(100)).toBe(100)
  })

  it('3.2  > 100 (edge) → 100', () => {
    expect(computePaymentReliabilityScore(105)).toBe(100)
  })

  it('3.3  90% → 85', () => {
    expect(computePaymentReliabilityScore(90)).toBe(85)
  })

  it('3.4  95% → 85', () => {
    expect(computePaymentReliabilityScore(95)).toBe(85)
  })

  it('3.5  75% → 65', () => {
    expect(computePaymentReliabilityScore(75)).toBe(65)
  })

  it('3.6  80% → 65', () => {
    expect(computePaymentReliabilityScore(80)).toBe(65)
  })

  it('3.7  50% → 40', () => {
    expect(computePaymentReliabilityScore(50)).toBe(40)
  })

  it('3.8  60% → 40', () => {
    expect(computePaymentReliabilityScore(60)).toBe(40)
  })

  it('3.9  49% → 20', () => {
    expect(computePaymentReliabilityScore(49)).toBe(20)
  })

  it('3.10 0% → 20', () => {
    expect(computePaymentReliabilityScore(0)).toBe(20)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 4. computePriceStabilityScore
// ══════════════════════════════════════════════════════════════════════════════

describe('computePriceStabilityScore — CV to stability score', () => {

  it('4.1  CV=0 → 100', () => {
    expect(computePriceStabilityScore(0)).toBe(100)
  })

  it('4.2  CV=10 → 80', () => {
    expect(computePriceStabilityScore(10)).toBe(80)
  })

  it('4.3  CV=25 → 50', () => {
    expect(computePriceStabilityScore(25)).toBe(50)
  })

  it('4.4  CV=50 → 0 (boundary)', () => {
    expect(computePriceStabilityScore(50)).toBe(0)
  })

  it('4.5  CV=75 → 0 (clamped)', () => {
    expect(computePriceStabilityScore(75)).toBe(0)
  })

  it('4.6  CV=100 → 0 (clamped)', () => {
    expect(computePriceStabilityScore(100)).toBe(0)
  })

  it('4.7  CV=5 → 90', () => {
    expect(computePriceStabilityScore(5)).toBe(90)
  })

  it('4.8  CV=49.9 → 0.2 (just above 0)', () => {
    expect(computePriceStabilityScore(49.9)).toBeCloseTo(0.2, 5)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 5. computeDependencyRiskScore
// ══════════════════════════════════════════════════════════════════════════════

describe('computeDependencyRiskScore — concentration tiers', () => {

  it('5.1  > 50% → 10 (critical)', () => {
    expect(computeDependencyRiskScore(55)).toBe(10)
  })

  it('5.2  exactly 50 → 30 (not > 50)', () => {
    expect(computeDependencyRiskScore(50)).toBe(30)
  })

  it('5.3  > 30% → 30 (high)', () => {
    expect(computeDependencyRiskScore(40)).toBe(30)
  })

  it('5.4  exactly 30 → 60', () => {
    expect(computeDependencyRiskScore(30)).toBe(60)
  })

  it('5.5  > 15% → 60 (moderate)', () => {
    expect(computeDependencyRiskScore(20)).toBe(60)
  })

  it('5.6  exactly 15 → 80', () => {
    expect(computeDependencyRiskScore(15)).toBe(80)
  })

  it('5.7  > 5% → 80 (low)', () => {
    expect(computeDependencyRiskScore(10)).toBe(80)
  })

  it('5.8  exactly 5 → 100', () => {
    expect(computeDependencyRiskScore(5)).toBe(100)
  })

  it('5.9  0% → 100 (minimal)', () => {
    expect(computeDependencyRiskScore(0)).toBe(100)
  })

  it('5.10 100% → 10 (critical, max)', () => {
    expect(computeDependencyRiskScore(100)).toBe(10)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 6. computeSupplierCompositeScore
// ══════════════════════════════════════════════════════════════════════════════

describe('computeSupplierCompositeScore — weights sum correctly', () => {

  it('6.1  all 100s → 100', () => {
    expect(computeSupplierCompositeScore(100, 100, 100, 100, 100)).toBe(100)
  })

  it('6.2  all 0s → 0', () => {
    expect(computeSupplierCompositeScore(0, 0, 0, 0, 0)).toBe(0)
  })

  it('6.3  manual: 80×.20 + 60×.25 + 70×.25 + 50×.20 + 90×.10 = 68', () => {
    // 80×.20=16, 60×.25=15, 70×.25=17.5, 50×.20=10, 90×.10=9 → 67.5
    expect(computeSupplierCompositeScore(80, 60, 70, 50, 90)).toBeCloseTo(67.5, 1)
  })

  it('6.4  weights sum: only volume=100 rest 0 → 20', () => {
    expect(computeSupplierCompositeScore(100, 0, 0, 0, 0)).toBeCloseTo(20, 5)
  })

  it('6.5  weights sum: only relationship=100 rest 0 → 25', () => {
    expect(computeSupplierCompositeScore(0, 100, 0, 0, 0)).toBeCloseTo(25, 5)
  })

  it('6.6  weights sum: only payment=100 rest 0 → 25', () => {
    expect(computeSupplierCompositeScore(0, 0, 100, 0, 0)).toBeCloseTo(25, 5)
  })

  it('6.7  weights sum: only price=100 rest 0 → 20', () => {
    expect(computeSupplierCompositeScore(0, 0, 0, 100, 0)).toBeCloseTo(20, 5)
  })

  it('6.8  weights sum: only dependency=100 rest 0 → 10', () => {
    expect(computeSupplierCompositeScore(0, 0, 0, 0, 100)).toBeCloseTo(10, 5)
  })

  it('6.9  all weights sum to 100 (20+25+25+20+10=100)', () => {
    const sum = 0.20 + 0.25 + 0.25 + 0.20 + 0.10
    expect(sum).toBeCloseTo(1.0, 5)
  })

  it('6.10 symmetric: uniform input mid-range → 50', () => {
    expect(computeSupplierCompositeScore(50, 50, 50, 50, 50)).toBe(50)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 7. classifySupplierTier
// ══════════════════════════════════════════════════════════════════════════════

describe('classifySupplierTier — all 5 tiers', () => {

  it('7.1  composite≥80 AND concentration>15 → strategic', () => {
    expect(classifySupplierTier(80, 20, 24, 85)).toBe('strategic')
  })

  it('7.2  composite=85 AND concentration=50 → strategic', () => {
    expect(classifySupplierTier(85, 50, 36, 90)).toBe('strategic')
  })

  it('7.3  composite=80 but concentration=15 (not >15) → preferred', () => {
    expect(classifySupplierTier(80, 15, 12, 85)).toBe('preferred')
  })

  it('7.4  composite≥65 → preferred', () => {
    expect(classifySupplierTier(70, 10, 12, 85)).toBe('preferred')
  })

  it('7.5  composite=65, concentration≤15 → preferred', () => {
    expect(classifySupplierTier(65, 5, 18, 85)).toBe('preferred')
  })

  it('7.6  composite=55, months≥6 → standard', () => {
    expect(classifySupplierTier(55, 5, 8, 65)).toBe('standard')
  })

  it('7.7  composite=45 → standard (months≥6)', () => {
    expect(classifySupplierTier(45, 3, 6, 65)).toBe('standard')
  })

  it('7.8  composite=55, months<6 → occasional', () => {
    expect(classifySupplierTier(55, 3, 4, 65)).toBe('occasional')
  })

  it('7.9  composite<45 → at_risk', () => {
    expect(classifySupplierTier(40, 5, 10, 65)).toBe('at_risk')
  })

  it('7.10 payment_reliability<40 → at_risk regardless of composite', () => {
    expect(classifySupplierTier(75, 10, 12, 39)).toBe('at_risk')
  })

  it('7.11 composite=0 → at_risk', () => {
    expect(classifySupplierTier(0, 0, 0, 20)).toBe('at_risk')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 8. classifyDependencyLevel
// ══════════════════════════════════════════════════════════════════════════════

describe('classifyDependencyLevel — 4 levels', () => {

  it('8.1  > 50% → critical', () => {
    expect(classifyDependencyLevel(51)).toBe('critical')
  })

  it('8.2  exactly 50 → high (not > 50)', () => {
    expect(classifyDependencyLevel(50)).toBe('high')
  })

  it('8.3  > 30% → high', () => {
    expect(classifyDependencyLevel(40)).toBe('high')
  })

  it('8.4  exactly 30 → moderate', () => {
    expect(classifyDependencyLevel(30)).toBe('moderate')
  })

  it('8.5  > 15% → moderate', () => {
    expect(classifyDependencyLevel(20)).toBe('moderate')
  })

  it('8.6  exactly 15 → low', () => {
    expect(classifyDependencyLevel(15)).toBe('low')
  })

  it('8.7  5% → low', () => {
    expect(classifyDependencyLevel(5)).toBe('low')
  })

  it('8.8  0% → low', () => {
    expect(classifyDependencyLevel(0)).toBe('low')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 9. buildSupplierScore — integration
// ══════════════════════════════════════════════════════════════════════════════

describe('buildSupplierScore — integration of all dimensions', () => {

  it('9.1  returns correct supplier_key and supplier_name', () => {
    const metrics = makeMetrics({ supplier_key: 'test_co', supplier_name: 'Test Co' })
    const score   = buildSupplierScore(metrics)
    expect(score.supplier_key).toBe('test_co')
    expect(score.supplier_name).toBe('Test Co')
  })

  it('9.2  scores are in [0, 100]', () => {
    const score = buildSupplierScore(makeMetrics())
    expect(score.volume_score).toBeGreaterThanOrEqual(0)
    expect(score.volume_score).toBeLessThanOrEqual(100)
    expect(score.relationship_score).toBeGreaterThanOrEqual(0)
    expect(score.relationship_score).toBeLessThanOrEqual(100)
    expect(score.payment_reliability_score).toBeGreaterThanOrEqual(0)
    expect(score.payment_reliability_score).toBeLessThanOrEqual(100)
    expect(score.price_stability_score).toBeGreaterThanOrEqual(0)
    expect(score.price_stability_score).toBeLessThanOrEqual(100)
    expect(score.dependency_risk_score).toBeGreaterThanOrEqual(0)
    expect(score.dependency_risk_score).toBeLessThanOrEqual(100)
  })

  it('9.3  composite_score equals manual calculation', () => {
    const metrics = makeMetrics({
      purchase_concentration_pct: 10, // volume=90, dep=80
      months_active: 12,               // relationship=80
      on_time_payment_rate: 95,        // payment=85
      price_variance_pct: 5,           // price=90
    })
    const score    = buildSupplierScore(metrics)
    const expected = computeSupplierCompositeScore(90, 80, 85, 90, 80)
    expect(score.composite_score).toBeCloseTo(expected, 3)
  })

  it('9.4  dependency_level derives from concentration', () => {
    const metrics = makeMetrics({ purchase_concentration_pct: 60 })
    const score   = buildSupplierScore(metrics)
    expect(score.dependency_level).toBe('critical')
  })

  it('9.5  low concentration → diversified dependency', () => {
    const metrics = makeMetrics({ purchase_concentration_pct: 3 })
    const score   = buildSupplierScore(metrics)
    expect(score.dependency_level).toBe('low')
  })

  it('9.6  poor payment → at_risk tier', () => {
    const metrics = makeMetrics({
      on_time_payment_rate: 30,
      purchase_concentration_pct: 5,
      months_active: 24,
    })
    const score = buildSupplierScore(metrics)
    expect(score.supplier_tier).toBe('at_risk')
  })

  it('9.7  long tenure + good payment + low concentration → preferred or strategic', () => {
    const metrics = makeMetrics({
      months_active: 36,
      on_time_payment_rate: 100,
      price_variance_pct: 0,
      purchase_concentration_pct: 20, // volume=75, dep=60
    })
    const score = buildSupplierScore(metrics)
    expect(['strategic', 'preferred']).toContain(score.supplier_tier)
  })

  it('9.8  price_variance_pct=0 → price_stability_score=100', () => {
    const score = buildSupplierScore(makeMetrics({ price_variance_pct: 0 }))
    expect(score.price_stability_score).toBe(100)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 10. computeSupplierHhi
// ══════════════════════════════════════════════════════════════════════════════

describe('computeSupplierHhi — diversification index', () => {

  it('10.1 single supplier at 100% → 1.0', () => {
    expect(computeSupplierHhi([100])).toBe(1)
  })

  it('10.2 two equal suppliers at 50% each → 0.5', () => {
    expect(computeSupplierHhi([50, 50])).toBeCloseTo(0.5, 4)
  })

  it('10.3 four equal suppliers at 25% each → 0.25', () => {
    expect(computeSupplierHhi([25, 25, 25, 25])).toBeCloseTo(0.25, 4)
  })

  it('10.4 ten equal suppliers at 10% each → 0.10', () => {
    expect(computeSupplierHhi([10, 10, 10, 10, 10, 10, 10, 10, 10, 10])).toBeCloseTo(0.10, 3)
  })

  it('10.5 empty array → 0', () => {
    expect(computeSupplierHhi([])).toBe(0)
  })

  it('10.6 unequal distribution is between bounds', () => {
    const hhi = computeSupplierHhi([60, 30, 10])
    expect(hhi).toBeGreaterThan(0)
    expect(hhi).toBeLessThanOrEqual(1)
  })

  it('10.7 one dominant supplier → closer to 1', () => {
    const hhi = computeSupplierHhi([80, 10, 5, 5])
    expect(hhi).toBeGreaterThan(0.5)
  })

  it('10.8 very spread → closer to 0', () => {
    const arr  = Array(20).fill(5) // 20 × 5% = 100%
    const hhi  = computeSupplierHhi(arr)
    expect(hhi).toBeCloseTo(0.05, 3)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 11. computeSupplierPortfolioSummary
// ══════════════════════════════════════════════════════════════════════════════

function makeScore(
  tier: SupplierScore['supplier_tier'],
  dependency: SupplierScore['dependency_level'],
  key: string,
): SupplierScore {
  return {
    supplier_key: key,
    supplier_name: key,
    volume_score: 75,
    relationship_score: 80,
    payment_reliability_score: 85,
    price_stability_score: 90,
    dependency_risk_score: 80,
    composite_score: 82,
    supplier_tier: tier,
    dependency_level: dependency,
  }
}

describe('computeSupplierPortfolioSummary — tier counts', () => {

  it('11.1 empty → all zeros, nulls', () => {
    const s = computeSupplierPortfolioSummary([])
    expect(s.total_suppliers).toBe(0)
    expect(s.strategic_count).toBe(0)
    expect(s.top_supplier_name).toBeNull()
  })

  it('11.2 correctly counts strategic', () => {
    const scores = [
      makeScore('strategic', 'high', 'a'),
      makeScore('strategic', 'moderate', 'b'),
      makeScore('preferred', 'low', 'c'),
    ]
    expect(computeSupplierPortfolioSummary(scores).strategic_count).toBe(2)
  })

  it('11.3 correctly counts preferred', () => {
    const scores = [makeScore('preferred', 'low', 'a'), makeScore('preferred', 'low', 'b')]
    expect(computeSupplierPortfolioSummary(scores).preferred_count).toBe(2)
  })

  it('11.4 correctly counts standard', () => {
    const scores = [makeScore('standard', 'low', 'x')]
    expect(computeSupplierPortfolioSummary(scores).standard_count).toBe(1)
  })

  it('11.5 correctly counts occasional', () => {
    const scores = [makeScore('occasional', 'low', 'y'), makeScore('occasional', 'low', 'z')]
    expect(computeSupplierPortfolioSummary(scores).occasional_count).toBe(2)
  })

  it('11.6 correctly counts at_risk', () => {
    const scores = [makeScore('at_risk', 'high', 'r')]
    expect(computeSupplierPortfolioSummary(scores).at_risk_count).toBe(1)
  })

  it('11.7 correctly counts critical_dependency_count', () => {
    const scores = [
      makeScore('strategic', 'critical', 'a'),
      makeScore('preferred', 'critical', 'b'),
      makeScore('standard', 'low', 'c'),
    ]
    expect(computeSupplierPortfolioSummary(scores).critical_dependency_count).toBe(2)
  })

  it('11.8 total_suppliers = sum of all tier counts', () => {
    const scores = [
      makeScore('strategic', 'high', 'a'),
      makeScore('preferred', 'low', 'b'),
      makeScore('standard', 'low', 'c'),
      makeScore('at_risk', 'critical', 'd'),
    ]
    const s = computeSupplierPortfolioSummary(scores)
    expect(s.total_suppliers).toBe(4)
    expect(
      s.strategic_count + s.preferred_count + s.standard_count + s.occasional_count + s.at_risk_count,
    ).toBe(4)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 12. classifySupplierDiversification
// ══════════════════════════════════════════════════════════════════════════════

describe('classifySupplierDiversification — 3 levels', () => {

  it('12.1 HHI > 0.5 → concentrated', () => {
    expect(classifySupplierDiversification(0.6)).toBe('concentrated')
  })

  it('12.2 HHI = 0.5 → moderate (not > 0.5)', () => {
    expect(classifySupplierDiversification(0.5)).toBe('moderate')
  })

  it('12.3 HHI = 1.0 → concentrated', () => {
    expect(classifySupplierDiversification(1.0)).toBe('concentrated')
  })

  it('12.4 HHI > 0.25 → moderate', () => {
    expect(classifySupplierDiversification(0.4)).toBe('moderate')
  })

  it('12.5 HHI = 0.25 → diversified (not > 0.25)', () => {
    expect(classifySupplierDiversification(0.25)).toBe('diversified')
  })

  it('12.6 HHI ≤ 0.25 → diversified', () => {
    expect(classifySupplierDiversification(0.1)).toBe('diversified')
  })

  it('12.7 HHI = 0 → diversified', () => {
    expect(classifySupplierDiversification(0)).toBe('diversified')
  })

  it('12.8 single supplier HHI=1 → concentrated', () => {
    expect(classifySupplierDiversification(computeSupplierHhi([100]))).toBe('concentrated')
  })

  it('12.9 four equal suppliers HHI=0.25 → diversified', () => {
    expect(classifySupplierDiversification(computeSupplierHhi([25, 25, 25, 25]))).toBe('diversified')
  })

  it('12.10 two equal suppliers HHI=0.5 → moderate (boundary)', () => {
    expect(classifySupplierDiversification(computeSupplierHhi([50, 50]))).toBe('moderate')
  })
})
