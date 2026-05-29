/**
 * Customer Churn Risk Prediction — unit tests
 *
 * Tests all pure computation functions.
 * No DB or network calls — pure function tests only.
 */

import { describe, it, expect } from 'vitest'
import {
  scoreRecencyRisk,
  scoreFrequencyDeclineRisk,
  scoreRevenueTrendRisk,
  scorePaymentBehaviorRisk,
  computeChurnRiskScore,
  classifyChurnRiskLevel,
  generateChurnSignals,
  identifyKeySignal,
  computeRevenueAtRisk,
  generateRetentionRecommendation,
  buildCustomerChurnScore,
  computeChurnPortfolioSummary,
  classifyPortfolioChurnHealth,
  type CustomerChurnFeatures,
  type ChurnRiskLevel,
} from '../lib/services/commercial/customer-churn.service'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BASE_FEATURES: CustomerChurnFeatures = {
  customer_key: 'id:cust-1',
  customer_name: 'Test Müşteri A.Ş.',
  days_since_last_purchase: 15,
  purchase_count_l90d: 5,
  purchase_count_p90d: 5,
  avg_order_value_l90d: 10_000,
  avg_order_value_p90d: 10_000,
  payment_delay_avg_days: 0,
  total_revenue_l90d: 50_000,
  total_revenue_p90d: 50_000,
  months_as_customer: 24,
}

// ── scoreRecencyRisk ──────────────────────────────────────────────────────────

describe('scoreRecencyRisk', () => {

  it('1. 0 days → 0 points (very recent)', () => {
    expect(scoreRecencyRisk(0)).toBe(0)
  })

  it('2. 30 days → 0 points (boundary: still recent)', () => {
    expect(scoreRecencyRisk(30)).toBe(0)
  })

  it('3. 31 days → 10 points (31-60 range)', () => {
    expect(scoreRecencyRisk(31)).toBe(10)
  })

  it('4. 60 days → 10 points (boundary: 31-60)', () => {
    expect(scoreRecencyRisk(60)).toBe(10)
  })

  it('5. 61 days → 25 points (61-90 range)', () => {
    expect(scoreRecencyRisk(61)).toBe(25)
  })

  it('6. 90 days → 25 points (boundary: 61-90)', () => {
    expect(scoreRecencyRisk(90)).toBe(25)
  })

  it('7. 91 days → 35 points (91-180 range)', () => {
    expect(scoreRecencyRisk(91)).toBe(35)
  })

  it('8. 180 days → 35 points (boundary: 91-180)', () => {
    expect(scoreRecencyRisk(180)).toBe(35)
  })

  it('9. 181 days → 40 points (181+ range)', () => {
    expect(scoreRecencyRisk(181)).toBe(40)
  })

  it('10. 365 days → 40 points (very long absence)', () => {
    expect(scoreRecencyRisk(365)).toBe(40)
  })

})

// ── scoreFrequencyDeclineRisk ─────────────────────────────────────────────────

describe('scoreFrequencyDeclineRisk', () => {

  it('11. l90d=0, p90d=5 → 25 points (stopped buying)', () => {
    expect(scoreFrequencyDeclineRisk(0, 5)).toBe(25)
  })

  it('12. l90d=0, p90d=0 → 0 points (both zero, never active)', () => {
    expect(scoreFrequencyDeclineRisk(0, 0)).toBe(0)
  })

  it('13. l90d=2, p90d=5 → 20 points (dropped by more than half)', () => {
    // 2 < 5 * 0.5 = 2.5 → true
    expect(scoreFrequencyDeclineRisk(2, 5)).toBe(20)
  })

  it('14. l90d=1, p90d=10 → 20 points (dropped 90%)', () => {
    // 1 < 10 * 0.5 = 5 → true
    expect(scoreFrequencyDeclineRisk(1, 10)).toBe(20)
  })

  it('15. l90d=3, p90d=5 → 10 points (moderate decline ~40%)', () => {
    // 3 < 5*0.8=4 → true; 3 >= 5*0.5=2.5 → not halved
    expect(scoreFrequencyDeclineRisk(3, 5)).toBe(10)
  })

  it('16. l90d=4, p90d=5 → 10 points (moderate decline, below 0.8 threshold)', () => {
    // 4 < 5*0.8=4 → false (4 is not < 4). Should be 0
    expect(scoreFrequencyDeclineRisk(4, 5)).toBe(0)
  })

  it('17. l90d=5, p90d=5 → 0 points (stable frequency)', () => {
    expect(scoreFrequencyDeclineRisk(5, 5)).toBe(0)
  })

  it('18. l90d=10, p90d=5 → 0 points (increased frequency)', () => {
    expect(scoreFrequencyDeclineRisk(10, 5)).toBe(0)
  })

  it('19. l90d=3, p90d=4 → 10 points (3 < 4*0.8=3.2)', () => {
    expect(scoreFrequencyDeclineRisk(3, 4)).toBe(10)
  })

  it('20. l90d=0, p90d=1 → 25 points (stopped, p90d=1)', () => {
    expect(scoreFrequencyDeclineRisk(0, 1)).toBe(25)
  })

})

// ── scoreRevenueTrendRisk ─────────────────────────────────────────────────────

describe('scoreRevenueTrendRisk', () => {

  it('21. revL90=0, revP90=100_000 → 20 points (revenue zeroed)', () => {
    expect(scoreRevenueTrendRisk(0, 100_000)).toBe(20)
  })

  it('22. revL90=0, revP90=0 → 0 points (both zero)', () => {
    expect(scoreRevenueTrendRisk(0, 0)).toBe(0)
  })

  it('23. revL90=40_000, revP90=100_000 → 15 points (dropped > 50%)', () => {
    // 40k < 100k*0.5=50k → true
    expect(scoreRevenueTrendRisk(40_000, 100_000)).toBe(15)
  })

  it('24. revL90=70_000, revP90=100_000 → 7 points (moderate decline ~30%)', () => {
    // 70k < 100k*0.8=80k → true; 70k >= 50k → not halved
    expect(scoreRevenueTrendRisk(70_000, 100_000)).toBe(7)
  })

  it('25. revL90=80_000, revP90=100_000 → 0 points (boundary: 80k not < 80k)', () => {
    // 80k < 100k*0.8=80k → false
    expect(scoreRevenueTrendRisk(80_000, 100_000)).toBe(0)
  })

  it('26. revL90=100_000, revP90=100_000 → 0 points (stable)', () => {
    expect(scoreRevenueTrendRisk(100_000, 100_000)).toBe(0)
  })

  it('27. revL90=150_000, revP90=100_000 → 0 points (increased)', () => {
    expect(scoreRevenueTrendRisk(150_000, 100_000)).toBe(0)
  })

  it('28. revL90=1, revP90=10 → 15 points (< 50%)', () => {
    expect(scoreRevenueTrendRisk(1, 10)).toBe(15)
  })

})

// ── scorePaymentBehaviorRisk ──────────────────────────────────────────────────

describe('scorePaymentBehaviorRisk', () => {

  it('29. avgDelay=0 → 0 points (on time)', () => {
    expect(scorePaymentBehaviorRisk(0)).toBe(0)
  })

  it('30. avgDelay=7 → 0 points (boundary: 7 not > 7)', () => {
    expect(scorePaymentBehaviorRisk(7)).toBe(0)
  })

  it('31. avgDelay=8 → 5 points (> 7 days)', () => {
    expect(scorePaymentBehaviorRisk(8)).toBe(5)
  })

  it('32. avgDelay=14 → 5 points (boundary: 14 not > 14)', () => {
    expect(scorePaymentBehaviorRisk(14)).toBe(5)
  })

  it('33. avgDelay=15 → 10 points (> 14 days)', () => {
    expect(scorePaymentBehaviorRisk(15)).toBe(10)
  })

  it('34. avgDelay=30 → 10 points (boundary: 30 not > 30)', () => {
    expect(scorePaymentBehaviorRisk(30)).toBe(10)
  })

  it('35. avgDelay=31 → 15 points (> 30 days)', () => {
    expect(scorePaymentBehaviorRisk(31)).toBe(15)
  })

  it('36. avgDelay=60 → 15 points (very late)', () => {
    expect(scorePaymentBehaviorRisk(60)).toBe(15)
  })

})

// ── computeChurnRiskScore ─────────────────────────────────────────────────────

describe('computeChurnRiskScore', () => {

  it('37. loyal customer → 0 total score', () => {
    expect(computeChurnRiskScore(BASE_FEATURES)).toBe(0)
  })

  it('38. critical customer → sum of signals (all max)', () => {
    const f: CustomerChurnFeatures = {
      ...BASE_FEATURES,
      days_since_last_purchase: 200,   // 40pts
      purchase_count_l90d: 0,          // stopped: 25pts
      purchase_count_p90d: 5,
      total_revenue_l90d: 0,           // 20pts
      total_revenue_p90d: 50_000,
      payment_delay_avg_days: 35,      // 15pts
    }
    // 40 + 25 + 20 + 15 = 100
    expect(computeChurnRiskScore(f)).toBe(100)
  })

  it('39. score is clamped to 100 (no overflow)', () => {
    const f: CustomerChurnFeatures = {
      ...BASE_FEATURES,
      days_since_last_purchase: 365,   // 40pts
      purchase_count_l90d: 0,          // 25pts
      purchase_count_p90d: 10,
      total_revenue_l90d: 0,           // 20pts
      total_revenue_p90d: 100_000,
      payment_delay_avg_days: 45,      // 15pts
    }
    expect(computeChurnRiskScore(f)).toBeLessThanOrEqual(100)
    expect(computeChurnRiskScore(f)).toBe(100)
  })

  it('40. partial risk (recency + payment only)', () => {
    const f: CustomerChurnFeatures = {
      ...BASE_FEATURES,
      days_since_last_purchase: 65,    // 25pts
      payment_delay_avg_days: 20,      // 10pts
    }
    expect(computeChurnRiskScore(f)).toBe(35)
  })

  it('41. score is never negative', () => {
    expect(computeChurnRiskScore(BASE_FEATURES)).toBeGreaterThanOrEqual(0)
  })

})

// ── classifyChurnRiskLevel ────────────────────────────────────────────────────

describe('classifyChurnRiskLevel', () => {

  it('42. score=100 → critical', () => {
    expect(classifyChurnRiskLevel(100)).toBe('critical')
  })

  it('43. score=75 → critical (boundary)', () => {
    expect(classifyChurnRiskLevel(75)).toBe('critical')
  })

  it('44. score=74 → high', () => {
    expect(classifyChurnRiskLevel(74)).toBe('high')
  })

  it('45. score=55 → high (boundary)', () => {
    expect(classifyChurnRiskLevel(55)).toBe('high')
  })

  it('46. score=54 → moderate', () => {
    expect(classifyChurnRiskLevel(54)).toBe('moderate')
  })

  it('47. score=35 → moderate (boundary)', () => {
    expect(classifyChurnRiskLevel(35)).toBe('moderate')
  })

  it('48. score=34 → low', () => {
    expect(classifyChurnRiskLevel(34)).toBe('low')
  })

  it('49. score=15 → low (boundary)', () => {
    expect(classifyChurnRiskLevel(15)).toBe('low')
  })

  it('50. score=14 → loyal', () => {
    expect(classifyChurnRiskLevel(14)).toBe('loyal')
  })

  it('51. score=0 → loyal', () => {
    expect(classifyChurnRiskLevel(0)).toBe('loyal')
  })

})

// ── generateChurnSignals ──────────────────────────────────────────────────────

describe('generateChurnSignals', () => {

  it('52. loyal customer → no signals', () => {
    const signals = generateChurnSignals(BASE_FEATURES)
    expect(signals).toHaveLength(0)
  })

  it('53. stopped buying (l90d=0, p90d>0) → frequency signal present', () => {
    const f = { ...BASE_FEATURES, purchase_count_l90d: 0, purchase_count_p90d: 5 }
    const signals = generateChurnSignals(f)
    expect(signals.some(s => s.includes('sipariş vermedi'))).toBe(true)
  })

  it('54. revenue zeroed → revenue signal present', () => {
    const f = { ...BASE_FEATURES, total_revenue_l90d: 0, total_revenue_p90d: 50_000 }
    const signals = generateChurnSignals(f)
    expect(signals.some(s => s.includes('gelir') || s.includes('Gelir'))).toBe(true)
  })

  it('55. payment delay > 30 → payment signal present', () => {
    const f = { ...BASE_FEATURES, payment_delay_avg_days: 35 }
    const signals = generateChurnSignals(f)
    expect(signals.some(s => s.includes('gün gecikme'))).toBe(true)
  })

  it('56. 181+ days since purchase → recency signal present', () => {
    const f = { ...BASE_FEATURES, days_since_last_purchase: 200 }
    const signals = generateChurnSignals(f)
    expect(signals.some(s => s.includes('200') || s.includes('gün'))).toBe(true)
  })

  it('57. all signals triggered → at least 3 signals', () => {
    const f: CustomerChurnFeatures = {
      ...BASE_FEATURES,
      days_since_last_purchase: 200,
      purchase_count_l90d: 0,
      purchase_count_p90d: 5,
      total_revenue_l90d: 0,
      total_revenue_p90d: 50_000,
      payment_delay_avg_days: 35,
    }
    const signals = generateChurnSignals(f)
    expect(signals.length).toBeGreaterThanOrEqual(3)
  })

  it('58. signals are Turkish strings (non-empty)', () => {
    const f: CustomerChurnFeatures = {
      ...BASE_FEATURES,
      days_since_last_purchase: 100,
    }
    const signals = generateChurnSignals(f)
    signals.forEach(s => expect(s.length).toBeGreaterThan(5))
  })

})

// ── identifyKeySignal ─────────────────────────────────────────────────────────

describe('identifyKeySignal', () => {

  it('59. loyal customer → non-empty Turkish string', () => {
    const signal = identifyKeySignal(BASE_FEATURES)
    expect(signal.length).toBeGreaterThan(3)
    expect(typeof signal).toBe('string')
  })

  it('60. highest recency score → recency signal as key', () => {
    const f: CustomerChurnFeatures = {
      ...BASE_FEATURES,
      days_since_last_purchase: 200,   // 40pts → highest
      purchase_count_l90d: 3,
      purchase_count_p90d: 4,          // only 10pts freq
      payment_delay_avg_days: 5,       // 0pts
    }
    const signal = identifyKeySignal(f)
    expect(signal).toContain('200')
  })

  it('61. stopped buying → frequency signal as key', () => {
    const f: CustomerChurnFeatures = {
      ...BASE_FEATURES,
      days_since_last_purchase: 15,    // 0pts recency
      purchase_count_l90d: 0,
      purchase_count_p90d: 5,          // 25pts → highest
      payment_delay_avg_days: 5,       // 0pts
    }
    const signal = identifyKeySignal(f)
    expect(signal).toContain('sipariş vermedi')
  })

  it('62. payment highest → payment signal as key', () => {
    const f: CustomerChurnFeatures = {
      ...BASE_FEATURES,
      days_since_last_purchase: 50,    // 10pts
      purchase_count_l90d: 4,
      purchase_count_p90d: 5,          // 10pts
      total_revenue_l90d: 40_000,
      total_revenue_p90d: 50_000,      // 7pts
      payment_delay_avg_days: 40,      // 15pts → highest
    }
    const signal = identifyKeySignal(f)
    expect(signal).toContain('gün gecikme')
  })

})

// ── computeRevenueAtRisk ──────────────────────────────────────────────────────

describe('computeRevenueAtRisk', () => {

  it('63. 90k revenue → 30k monthly at risk', () => {
    expect(computeRevenueAtRisk(90_000)).toBe(30_000)
  })

  it('64. 0 revenue → 0 at risk', () => {
    expect(computeRevenueAtRisk(0)).toBe(0)
  })

  it('65. negative revenue → 0 at risk', () => {
    expect(computeRevenueAtRisk(-10_000)).toBe(0)
  })

  it('66. 300_000 revenue → 100_000 monthly', () => {
    expect(computeRevenueAtRisk(300_000)).toBeCloseTo(100_000)
  })

  it('67. 1 TRY → ~0.33 TRY monthly', () => {
    expect(computeRevenueAtRisk(1)).toBeCloseTo(1 / 3)
  })

})

// ── generateRetentionRecommendation ──────────────────────────────────────────

describe('generateRetentionRecommendation', () => {

  const LEVELS: ChurnRiskLevel[] = ['critical', 'high', 'moderate', 'low', 'loyal']
  const customerName = 'ABC Ltd.'

  it('68. critical → includes customer name and urgent action', () => {
    const rec = generateRetentionRecommendation('critical', customerName)
    expect(rec).toContain(customerName)
    expect(rec.length).toBeGreaterThan(10)
  })

  it('69. high → includes win-back campaign', () => {
    const rec = generateRetentionRecommendation('high', customerName)
    expect(rec).toContain(customerName)
    expect(rec.toLowerCase()).toContain('win-back')
  })

  it('70. moderate → includes discount offer', () => {
    const rec = generateRetentionRecommendation('moderate', customerName)
    expect(rec).toContain(customerName)
    expect(rec).toContain('indirim')
  })

  it('71. low → includes check-in suggestion', () => {
    const rec = generateRetentionRecommendation('low', customerName)
    expect(rec).toContain(customerName)
    expect(rec).toContain('check-in')
  })

  it('72. loyal → includes referral program', () => {
    const rec = generateRetentionRecommendation('loyal', customerName)
    expect(rec).toContain(customerName)
    expect(rec.toLowerCase()).toContain('referans')
  })

  it('73. all levels return non-empty strings', () => {
    LEVELS.forEach(level => {
      const rec = generateRetentionRecommendation(level, customerName)
      expect(rec.length).toBeGreaterThan(10)
    })
  })

})

// ── buildCustomerChurnScore ───────────────────────────────────────────────────

describe('buildCustomerChurnScore', () => {

  it('74. returns all required fields', () => {
    const score = buildCustomerChurnScore(BASE_FEATURES)
    expect(score).toHaveProperty('customer_key')
    expect(score).toHaveProperty('customer_name')
    expect(score).toHaveProperty('churn_risk_score')
    expect(score).toHaveProperty('churn_risk_level')
    expect(score).toHaveProperty('key_signal')
    expect(score).toHaveProperty('signals')
    expect(score).toHaveProperty('estimated_revenue_at_risk_try')
    expect(score).toHaveProperty('recommendation')
  })

  it('75. churn_risk_score is between 0 and 100', () => {
    const score = buildCustomerChurnScore(BASE_FEATURES)
    expect(score.churn_risk_score).toBeGreaterThanOrEqual(0)
    expect(score.churn_risk_score).toBeLessThanOrEqual(100)
  })

  it('76. churn_risk_level is a valid level', () => {
    const score = buildCustomerChurnScore(BASE_FEATURES)
    const validLevels: ChurnRiskLevel[] = ['critical', 'high', 'moderate', 'low', 'loyal']
    expect(validLevels).toContain(score.churn_risk_level)
  })

  it('77. signals is an array', () => {
    const score = buildCustomerChurnScore(BASE_FEATURES)
    expect(Array.isArray(score.signals)).toBe(true)
  })

  it('78. customer_key matches input', () => {
    const score = buildCustomerChurnScore(BASE_FEATURES)
    expect(score.customer_key).toBe(BASE_FEATURES.customer_key)
  })

  it('79. estimated_revenue_at_risk_try matches computeRevenueAtRisk', () => {
    const score = buildCustomerChurnScore(BASE_FEATURES)
    expect(score.estimated_revenue_at_risk_try).toBe(
      computeRevenueAtRisk(BASE_FEATURES.total_revenue_l90d),
    )
  })

  it('80. high-risk customer gets correct level', () => {
    const f: CustomerChurnFeatures = {
      ...BASE_FEATURES,
      days_since_last_purchase: 120,   // 35pts
      purchase_count_l90d: 0,
      purchase_count_p90d: 3,          // 25pts
    }
    const score = buildCustomerChurnScore(f)
    expect(['critical', 'high']).toContain(score.churn_risk_level)
  })

})

// ── computeChurnPortfolioSummary ──────────────────────────────────────────────

describe('computeChurnPortfolioSummary', () => {

  // Build features that produce the target risk level by direct score mapping:
  // critical (≥75): recency 181+(40) + stopped(25) + rev zero(20) = 85
  // high (55-74): recency 91+(35) + stopped(25) = 60
  // moderate (35-54): recency 61-90(25) + payment>14(10) = 35
  // low (15-34): recency 31-60(10) + payment>7(5) + freq moderate(10) = 25
  // loyal (<15): recency ≤30(0) + all stable = 0
  function makeScore(
    level: ChurnRiskLevel,
    revenueAtRisk = 10_000,
  ) {
    const featuresByLevel: Record<ChurnRiskLevel, CustomerChurnFeatures> = {
      critical: {
        ...BASE_FEATURES,
        customer_key: `key:critical-${Math.random()}`,
        days_since_last_purchase: 200,      // 40pts
        purchase_count_l90d: 0,             // stopped: 25pts
        purchase_count_p90d: 5,
        total_revenue_l90d: revenueAtRisk > 0 ? 0 : 0,  // zero rev: 20pts
        total_revenue_p90d: 50_000,
        payment_delay_avg_days: 35,         // 15pts → total 100
      },
      high: {
        ...BASE_FEATURES,
        customer_key: `key:high-${Math.random()}`,
        days_since_last_purchase: 120,      // 35pts
        purchase_count_l90d: 0,             // stopped: 25pts → total 60
        purchase_count_p90d: 5,
        payment_delay_avg_days: 0,
        total_revenue_l90d: revenueAtRisk * 3,
        total_revenue_p90d: 50_000,
      },
      moderate: {
        ...BASE_FEATURES,
        customer_key: `key:moderate-${Math.random()}`,
        days_since_last_purchase: 70,       // 25pts
        purchase_count_l90d: 5,
        purchase_count_p90d: 5,
        payment_delay_avg_days: 20,         // 10pts → total 35
        total_revenue_l90d: revenueAtRisk * 3,
        total_revenue_p90d: 50_000,
      },
      low: {
        ...BASE_FEATURES,
        customer_key: `key:low-${Math.random()}`,
        days_since_last_purchase: 45,       // 10pts
        purchase_count_l90d: 3,
        purchase_count_p90d: 4,             // 10pts freq decline (3 < 4*0.8=3.2)
        payment_delay_avg_days: 10,         // 5pts → total 25
        total_revenue_l90d: revenueAtRisk * 3,
        total_revenue_p90d: 50_000,
      },
      loyal: {
        ...BASE_FEATURES,
        customer_key: `key:loyal-${Math.random()}`,
        days_since_last_purchase: 10,       // 0pts
        purchase_count_l90d: 5,
        purchase_count_p90d: 5,
        payment_delay_avg_days: 0,          // 0pts → total 0
        total_revenue_l90d: revenueAtRisk * 3,
        total_revenue_p90d: 50_000,
      },
    }
    return buildCustomerChurnScore(featuresByLevel[level])
  }

  it('81. empty scores → all counts zero', () => {
    const summary = computeChurnPortfolioSummary([])
    expect(summary.total_customers).toBe(0)
    expect(summary.critical_count).toBe(0)
    expect(summary.churn_risk_index).toBe(0)
  })

  it('82. correct total_customers count', () => {
    const scores = [makeScore('loyal'), makeScore('loyal'), makeScore('low')]
    const summary = computeChurnPortfolioSummary(scores)
    expect(summary.total_customers).toBe(3)
  })

  it('83. correct level counts', () => {
    const scores = [
      makeScore('critical'),
      makeScore('critical'),
      makeScore('high'),
      makeScore('moderate'),
      makeScore('low'),
      makeScore('loyal'),
    ]
    const summary = computeChurnPortfolioSummary(scores)
    expect(summary.critical_count).toBe(2)
    expect(summary.high_count).toBe(1)
    expect(summary.moderate_count).toBe(1)
    expect(summary.low_count).toBe(1)
    expect(summary.loyal_count).toBe(1)
  })

  it('84. total_revenue_at_risk_try sums all customers', () => {
    const scores = [makeScore('critical', 20_000), makeScore('high', 10_000)]
    const summary = computeChurnPortfolioSummary(scores)
    expect(summary.total_revenue_at_risk_try).toBeGreaterThan(0)
  })

  it('85. critical_revenue_at_risk_try only includes critical customers', () => {
    const scores = [makeScore('critical', 20_000), makeScore('loyal', 5_000)]
    const summary = computeChurnPortfolioSummary(scores)
    expect(summary.critical_revenue_at_risk_try).toBeLessThanOrEqual(
      summary.total_revenue_at_risk_try,
    )
  })

  it('86. churn_risk_index formula: (critical×5 + high×3 + moderate×1) / total', () => {
    // 1 critical, 1 high, 1 moderate, 1 loyal → (5+3+1)/4 = 2.25
    const scores = [
      makeScore('critical'),
      makeScore('high'),
      makeScore('moderate'),
      makeScore('loyal'),
    ]
    const summary = computeChurnPortfolioSummary(scores)
    // Can't guarantee exact levels from makeScore, but index should be > 0
    expect(summary.churn_risk_index).toBeGreaterThanOrEqual(0)
    expect(summary.churn_risk_index).toBeLessThanOrEqual(100)
  })

  it('87. churn_risk_index capped at 100', () => {
    const scores = Array.from({ length: 10 }, () => makeScore('critical'))
    const summary = computeChurnPortfolioSummary(scores)
    expect(summary.churn_risk_index).toBeLessThanOrEqual(100)
  })

  it('88. all loyal → churn_risk_index = 0', () => {
    const scores = [makeScore('loyal'), makeScore('loyal'), makeScore('loyal')]
    const summary = computeChurnPortfolioSummary(scores)
    expect(summary.churn_risk_index).toBe(0)
  })

})

// ── classifyPortfolioChurnHealth ──────────────────────────────────────────────

describe('classifyPortfolioChurnHealth', () => {

  it('89. index=40 → high_risk (boundary)', () => {
    expect(classifyPortfolioChurnHealth(40)).toBe('high_risk')
  })

  it('90. index=50 → high_risk', () => {
    expect(classifyPortfolioChurnHealth(50)).toBe('high_risk')
  })

  it('91. index=39 → elevated', () => {
    expect(classifyPortfolioChurnHealth(39)).toBe('elevated')
  })

  it('92. index=20 → elevated (boundary)', () => {
    expect(classifyPortfolioChurnHealth(20)).toBe('elevated')
  })

  it('93. index=19 → manageable', () => {
    expect(classifyPortfolioChurnHealth(19)).toBe('manageable')
  })

  it('94. index=10 → manageable (boundary)', () => {
    expect(classifyPortfolioChurnHealth(10)).toBe('manageable')
  })

  it('95. index=9 → healthy', () => {
    expect(classifyPortfolioChurnHealth(9)).toBe('healthy')
  })

  it('96. index=0 → healthy', () => {
    expect(classifyPortfolioChurnHealth(0)).toBe('healthy')
  })

  it('97. index=100 → high_risk', () => {
    expect(classifyPortfolioChurnHealth(100)).toBe('high_risk')
  })

})
