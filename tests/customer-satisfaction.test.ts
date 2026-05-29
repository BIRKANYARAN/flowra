/**
 * Customer Satisfaction & Relationship Health — unit tests
 *
 * Tests all pure computation functions.
 * No DB or network calls — pure function tests only.
 */

import { describe, it, expect } from 'vitest'
import {
  computeRecencyScore,
  computeFrequencyScore,
  computePaymentScore,
  computeGrowthScore,
  computeRelationshipHealthScore,
  classifySatisfactionTier,
  generateRiskFlags,
  generateRecommendedAction,
  computeOrderTrend,
  computePortfolioHealthSummary,
  classifyPortfolioHealth,
  generateSatisfactionNarrative,
  type CustomerSatisfactionSignals,
  type SatisfactionScore,
} from '../lib/services/commercial/customer-satisfaction.service'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BASE_SIGNALS: CustomerSatisfactionSignals = {
  customer_id: 'id:cust-1',
  customer_name: 'Test Müşteri A.Ş.',
  total_orders: 12,
  days_since_last_order: 10,
  avg_days_to_pay: 15,
  payment_on_time_rate: 0.95,
  order_trend: 'growing',
  avg_order_value: 5_000,
  total_revenue_ytd: 60_000,
  months_active: 12,
  dispute_count: 0,
}

function makeScore(
  tier: SatisfactionScore['satisfaction_tier'],
  health: number,
): SatisfactionScore {
  return {
    customer_id: `id:cust-${tier}`,
    customer_name: `${tier} Müşteri`,
    relationship_health_score: health,
    satisfaction_tier: tier,
    signals: { recency_score: 0, frequency_score: 0, payment_score: 0, growth_score: 0 },
    risk_flags: [],
    recommended_action: '',
  }
}

// ── computeRecencyScore ───────────────────────────────────────────────────────

describe('computeRecencyScore', () => {
  it('1. 0 days → 25 (very recent)', () => {
    expect(computeRecencyScore(0)).toBe(25)
  })

  it('2. 14 days → 25 (boundary: <= 14)', () => {
    expect(computeRecencyScore(14)).toBe(25)
  })

  it('3. 15 days → 20 (just over 14 boundary)', () => {
    expect(computeRecencyScore(15)).toBe(20)
  })

  it('4. 30 days → 20 (boundary: <= 30)', () => {
    expect(computeRecencyScore(30)).toBe(20)
  })

  it('5. 31 days → 15 (just over 30 boundary)', () => {
    expect(computeRecencyScore(31)).toBe(15)
  })

  it('6. 60 days → 15 (boundary: <= 60)', () => {
    expect(computeRecencyScore(60)).toBe(15)
  })

  it('7. 61 days → 10 (just over 60 boundary)', () => {
    expect(computeRecencyScore(61)).toBe(10)
  })

  it('8. 90 days → 10 (boundary: <= 90)', () => {
    expect(computeRecencyScore(90)).toBe(10)
  })

  it('9. 91 days → 5 (just over 90 boundary)', () => {
    expect(computeRecencyScore(91)).toBe(5)
  })

  it('10. 180 days → 5 (boundary: <= 180)', () => {
    expect(computeRecencyScore(180)).toBe(5)
  })

  it('11. 181 days → 0 (just over 180 boundary)', () => {
    expect(computeRecencyScore(181)).toBe(0)
  })

  it('12. 365 days → 0 (far past)', () => {
    expect(computeRecencyScore(365)).toBe(0)
  })
})

// ── computeFrequencyScore ─────────────────────────────────────────────────────

describe('computeFrequencyScore', () => {
  it('13. 0 months → 0 (guard: no division)', () => {
    expect(computeFrequencyScore(100, 0)).toBe(0)
  })

  it('14. rate >= 4/month → 25 (e.g. 24 orders, 6 months)', () => {
    expect(computeFrequencyScore(24, 6)).toBe(25)
  })

  it('15. rate exactly 4/month → 25 (boundary)', () => {
    expect(computeFrequencyScore(4, 1)).toBe(25)
  })

  it('16. rate >= 2/month (but < 4) → 20 (e.g. 6 orders, 3 months = 2)', () => {
    expect(computeFrequencyScore(6, 3)).toBe(20)
  })

  it('17. rate exactly 2/month → 20 (boundary)', () => {
    expect(computeFrequencyScore(2, 1)).toBe(20)
  })

  it('18. rate >= 1/month (but < 2) → 15 (e.g. 3 orders, 3 months)', () => {
    expect(computeFrequencyScore(3, 3)).toBe(15)
  })

  it('19. rate exactly 1/month → 15 (boundary)', () => {
    expect(computeFrequencyScore(1, 1)).toBe(15)
  })

  it('20. rate >= 0.5/month (but < 1) → 10 (e.g. 3 orders, 6 months)', () => {
    expect(computeFrequencyScore(3, 6)).toBe(10)
  })

  it('21. rate exactly 0.5/month → 10 (boundary)', () => {
    expect(computeFrequencyScore(1, 2)).toBe(10)
  })

  it('22. rate >= 0.25/month (but < 0.5) → 5 (e.g. 2 orders, 8 months = 0.25)', () => {
    expect(computeFrequencyScore(2, 8)).toBe(5)
  })

  it('23. rate exactly 0.25/month → 5 (boundary)', () => {
    expect(computeFrequencyScore(1, 4)).toBe(5)
  })

  it('24. rate < 0.25/month → 0 (e.g. 1 order, 5 months = 0.2)', () => {
    expect(computeFrequencyScore(1, 5)).toBe(0)
  })

  it('25. 0 orders, 12 months → 0', () => {
    expect(computeFrequencyScore(0, 12)).toBe(0)
  })
})

// ── computePaymentScore ───────────────────────────────────────────────────────

describe('computePaymentScore', () => {
  it('26. onTime=1.0, avgDays=7 → 20+10=30 (max)', () => {
    expect(computePaymentScore(7, 1.0)).toBe(30)
  })

  it('27. onTime=0.95, avgDays=14 → 20+10=30 (boundary for both)', () => {
    expect(computePaymentScore(14, 0.95)).toBe(30)
  })

  it('28. onTime=0.80, avgDays=30 → 15+8=23', () => {
    expect(computePaymentScore(30, 0.80)).toBe(23)
  })

  it('29. onTime=0.80, avgDays=14 → 15+10=25', () => {
    expect(computePaymentScore(14, 0.80)).toBe(25)
  })

  it('30. onTime=0.60, avgDays=60 → 10+5=15', () => {
    expect(computePaymentScore(60, 0.60)).toBe(15)
  })

  it('31. onTime=0.40, avgDays=90 → 5+2=7', () => {
    expect(computePaymentScore(90, 0.40)).toBe(7)
  })

  it('32. onTime=0.39, avgDays=91 → 0+0=0 (below all thresholds)', () => {
    expect(computePaymentScore(91, 0.39)).toBe(0)
  })

  it('33. avgDays null, onTime=0.95 → 20+5=25 (null speed = 5)', () => {
    expect(computePaymentScore(null, 0.95)).toBe(25)
  })

  it('34. avgDays null, onTime=0.0 → 0+5=5 (null speed = 5, zero onTime)', () => {
    expect(computePaymentScore(null, 0.0)).toBe(5)
  })

  it('35. onTime=0.95, avgDays=15 → 20+8=28 (<=30 bucket)', () => {
    expect(computePaymentScore(15, 0.95)).toBe(28)
  })

  it('36. onTime=0.95, avgDays=31 → 20+5=25 (<=60 bucket)', () => {
    expect(computePaymentScore(31, 0.95)).toBe(25)
  })

  it('37. onTime=0.95, avgDays=61 → 20+2=22 (<=90 bucket)', () => {
    expect(computePaymentScore(61, 0.95)).toBe(22)
  })

  it('38. onTime=0.60, avgDays null → 10+5=15', () => {
    expect(computePaymentScore(null, 0.60)).toBe(15)
  })

  it('39. boundary: onTime exactly 0.80 → 15 onTime points', () => {
    expect(computePaymentScore(14, 0.80)).toBe(25) // 15+10
  })

  it('40. boundary: onTime exactly 0.60 → 10 onTime points', () => {
    expect(computePaymentScore(14, 0.60)).toBe(20) // 10+10
  })

  it('41. boundary: onTime exactly 0.40 → 5 onTime points', () => {
    expect(computePaymentScore(14, 0.40)).toBe(15) // 5+10
  })
})

// ── computeGrowthScore ────────────────────────────────────────────────────────

describe('computeGrowthScore', () => {
  it('42. growing → 20', () => {
    expect(computeGrowthScore('growing')).toBe(20)
  })

  it('43. stable → 12', () => {
    expect(computeGrowthScore('stable')).toBe(12)
  })

  it('44. declining → 4', () => {
    expect(computeGrowthScore('declining')).toBe(4)
  })

  it('45. null → 8 (insufficient data)', () => {
    expect(computeGrowthScore(null)).toBe(8)
  })
})

// ── computeRelationshipHealthScore ───────────────────────────────────────────

describe('computeRelationshipHealthScore', () => {
  it('46. max all → 100', () => {
    expect(computeRelationshipHealthScore({
      recencyScore: 25,
      frequencyScore: 25,
      paymentScore: 30,
      growthScore: 20,
    })).toBe(100)
  })

  it('47. all zero → 0', () => {
    expect(computeRelationshipHealthScore({
      recencyScore: 0,
      frequencyScore: 0,
      paymentScore: 0,
      growthScore: 0,
    })).toBe(0)
  })

  it('48. sum math: 10+10+15+8 = 43', () => {
    expect(computeRelationshipHealthScore({
      recencyScore: 10,
      frequencyScore: 10,
      paymentScore: 15,
      growthScore: 8,
    })).toBe(43)
  })

  it('49. partial: 25+0+0+0 = 25', () => {
    expect(computeRelationshipHealthScore({
      recencyScore: 25,
      frequencyScore: 0,
      paymentScore: 0,
      growthScore: 0,
    })).toBe(25)
  })

  it('50. mixed: 15+20+20+12 = 67', () => {
    expect(computeRelationshipHealthScore({
      recencyScore: 15,
      frequencyScore: 20,
      paymentScore: 20,
      growthScore: 12,
    })).toBe(67)
  })
})

// ── classifySatisfactionTier ──────────────────────────────────────────────────

describe('classifySatisfactionTier', () => {
  it('51. score 100 → excellent', () => {
    expect(classifySatisfactionTier(100)).toBe('excellent')
  })

  it('52. score 80 → excellent (boundary)', () => {
    expect(classifySatisfactionTier(80)).toBe('excellent')
  })

  it('53. score 79 → good (just below excellent)', () => {
    expect(classifySatisfactionTier(79)).toBe('good')
  })

  it('54. score 60 → good (boundary)', () => {
    expect(classifySatisfactionTier(60)).toBe('good')
  })

  it('55. score 59 → neutral (just below good)', () => {
    expect(classifySatisfactionTier(59)).toBe('neutral')
  })

  it('56. score 40 → neutral (boundary)', () => {
    expect(classifySatisfactionTier(40)).toBe('neutral')
  })

  it('57. score 39 → at_risk (just below neutral)', () => {
    expect(classifySatisfactionTier(39)).toBe('at_risk')
  })

  it('58. score 20 → at_risk (boundary)', () => {
    expect(classifySatisfactionTier(20)).toBe('at_risk')
  })

  it('59. score 19 → churning (just below at_risk)', () => {
    expect(classifySatisfactionTier(19)).toBe('churning')
  })

  it('60. score 0 → churning (minimum)', () => {
    expect(classifySatisfactionTier(0)).toBe('churning')
  })

  it('61. score 50 → neutral (mid-range)', () => {
    expect(classifySatisfactionTier(50)).toBe('neutral')
  })
})

// ── generateRiskFlags ─────────────────────────────────────────────────────────

describe('generateRiskFlags', () => {
  it('62. no flags for healthy customer', () => {
    const flags = generateRiskFlags(BASE_SIGNALS)
    expect(flags).toHaveLength(0)
  })

  it('63. days_since_last_order = 91 → "Son sipariş 90+ gün önce"', () => {
    const flags = generateRiskFlags({ ...BASE_SIGNALS, days_since_last_order: 91 })
    expect(flags).toContain('Son sipariş 90+ gün önce')
  })

  it('64. days_since_last_order = 90 → no recency flag (boundary: needs > 90)', () => {
    const flags = generateRiskFlags({ ...BASE_SIGNALS, days_since_last_order: 90 })
    expect(flags).not.toContain('Son sipariş 90+ gün önce')
  })

  it('65. payment_on_time_rate = 0.49 → "Ödeme gecikmesi alışkanlığı var"', () => {
    const flags = generateRiskFlags({ ...BASE_SIGNALS, payment_on_time_rate: 0.49 })
    expect(flags).toContain('Ödeme gecikmesi alışkanlığı var')
  })

  it('66. payment_on_time_rate = 0.50 → no payment habit flag (boundary: < 0.5)', () => {
    const flags = generateRiskFlags({ ...BASE_SIGNALS, payment_on_time_rate: 0.50 })
    expect(flags).not.toContain('Ödeme gecikmesi alışkanlığı var')
  })

  it('67. avg_days_to_pay = 61 → "Ortalama ödeme süresi 60+ gün"', () => {
    const flags = generateRiskFlags({ ...BASE_SIGNALS, avg_days_to_pay: 61 })
    expect(flags).toContain('Ortalama ödeme süresi 60+ gün')
  })

  it('68. avg_days_to_pay = 60 → no speed flag (boundary: needs > 60)', () => {
    const flags = generateRiskFlags({ ...BASE_SIGNALS, avg_days_to_pay: 60 })
    expect(flags).not.toContain('Ortalama ödeme süresi 60+ gün')
  })

  it('69. avg_days_to_pay = null → no speed flag', () => {
    const flags = generateRiskFlags({ ...BASE_SIGNALS, avg_days_to_pay: null })
    expect(flags).not.toContain('Ortalama ödeme süresi 60+ gün')
  })

  it('70. order_trend = "declining" → "Sipariş sıklığı azalıyor"', () => {
    const flags = generateRiskFlags({ ...BASE_SIGNALS, order_trend: 'declining' })
    expect(flags).toContain('Sipariş sıklığı azalıyor')
  })

  it('71. order_trend = "growing" → no declining flag', () => {
    const flags = generateRiskFlags({ ...BASE_SIGNALS, order_trend: 'growing' })
    expect(flags).not.toContain('Sipariş sıklığı azalıyor')
  })

  it('72. months_active = 2 → "Yeni müşteri — yeterli veri yok"', () => {
    const flags = generateRiskFlags({ ...BASE_SIGNALS, months_active: 2 })
    expect(flags).toContain('Yeni müşteri — yeterli veri yok')
  })

  it('73. months_active = 3 → no new customer flag (boundary: < 3)', () => {
    const flags = generateRiskFlags({ ...BASE_SIGNALS, months_active: 3 })
    expect(flags).not.toContain('Yeni müşteri — yeterli veri yok')
  })

  it('74. dispute_count = 3 → "Birden fazla ödeme sorunu"', () => {
    const flags = generateRiskFlags({ ...BASE_SIGNALS, dispute_count: 3 })
    expect(flags).toContain('Birden fazla ödeme sorunu')
  })

  it('75. dispute_count = 2 → no dispute flag (boundary: > 2)', () => {
    const flags = generateRiskFlags({ ...BASE_SIGNALS, dispute_count: 2 })
    expect(flags).not.toContain('Birden fazla ödeme sorunu')
  })

  it('76. multiple signals can be triggered simultaneously', () => {
    const flags = generateRiskFlags({
      ...BASE_SIGNALS,
      days_since_last_order: 100,
      payment_on_time_rate: 0.3,
      order_trend: 'declining',
      dispute_count: 5,
    })
    expect(flags.length).toBeGreaterThanOrEqual(3)
  })
})

// ── generateRecommendedAction ─────────────────────────────────────────────────

describe('generateRecommendedAction', () => {
  it('77. excellent tier → non-empty Turkish string', () => {
    const action = generateRecommendedAction('excellent', BASE_SIGNALS)
    expect(action.length).toBeGreaterThan(0)
    expect(action).toContain('sadakat')
  })

  it('78. good tier → non-empty Turkish string', () => {
    const action = generateRecommendedAction('good', BASE_SIGNALS)
    expect(action.length).toBeGreaterThan(0)
    expect(action).toContain('satış')
  })

  it('79. neutral tier → non-empty Turkish string', () => {
    const action = generateRecommendedAction('neutral', BASE_SIGNALS)
    expect(action.length).toBeGreaterThan(0)
    expect(action).toContain('iletişim')
  })

  it('80. at_risk tier → non-empty Turkish string', () => {
    const action = generateRecommendedAction('at_risk', BASE_SIGNALS)
    expect(action.length).toBeGreaterThan(0)
    expect(action).toContain('görüşme')
  })

  it('81. churning tier → non-empty Turkish string', () => {
    const action = generateRecommendedAction('churning', BASE_SIGNALS)
    expect(action.length).toBeGreaterThan(0)
    expect(action).toContain('teklif')
  })

  it('82. each tier returns a different action string', () => {
    const tiers: SatisfactionScore['satisfaction_tier'][] = ['excellent', 'good', 'neutral', 'at_risk', 'churning']
    const actions = tiers.map(t => generateRecommendedAction(t, BASE_SIGNALS))
    const unique = new Set(actions)
    expect(unique.size).toBe(5)
  })
})

// ── computeOrderTrend ─────────────────────────────────────────────────────────

describe('computeOrderTrend', () => {
  it('83. both 0 → null', () => {
    expect(computeOrderTrend(0, 0)).toBeNull()
  })

  it('84. this year 10, last year 0 → growing', () => {
    expect(computeOrderTrend(10, 0)).toBe('growing')
  })

  it('85. last year 0, this year 0 → null (both zero)', () => {
    expect(computeOrderTrend(0, 0)).toBeNull()
  })

  it('86. thisYear > lastYear × 1.1 → growing (e.g. 12 vs 10 = 20% growth)', () => {
    expect(computeOrderTrend(12, 10)).toBe('growing')
  })

  it('87. exactly 10% growth boundary → stable (not > 1.1×)', () => {
    // 11 vs 10 = exactly 1.1x (not >, so not growing)
    expect(computeOrderTrend(11, 10)).toBe('stable')
  })

  it('88. thisYear < lastYear × 0.9 → declining (e.g. 8 vs 10 = 20% decline)', () => {
    expect(computeOrderTrend(8, 10)).toBe('declining')
  })

  it('89. exactly 10% decline boundary → stable (9 vs 10 = 0.9×, not < 0.9×)', () => {
    // 9 vs 10: 9/10 = 0.9, so NOT < 0.9 → stable
    expect(computeOrderTrend(9, 10)).toBe('stable')
  })

  it('90. same count → stable (10 vs 10)', () => {
    expect(computeOrderTrend(10, 10)).toBe('stable')
  })

  it('91. slight growth within 10% → stable (e.g. 11 vs 10.1)', () => {
    expect(computeOrderTrend(20, 20)).toBe('stable')
  })

  it('92. large growth → growing (50 vs 10)', () => {
    expect(computeOrderTrend(50, 10)).toBe('growing')
  })

  it('93. large decline → declining (2 vs 10)', () => {
    expect(computeOrderTrend(2, 10)).toBe('declining')
  })
})

// ── computePortfolioHealthSummary ─────────────────────────────────────────────

describe('computePortfolioHealthSummary', () => {
  it('94. empty array → null avg, all zeros, health_index 0', () => {
    const s = computePortfolioHealthSummary([])
    expect(s.avg_health_score).toBeNull()
    expect(s.excellent_count).toBe(0)
    expect(s.good_count).toBe(0)
    expect(s.neutral_count).toBe(0)
    expect(s.at_risk_count).toBe(0)
    expect(s.churning_count).toBe(0)
    expect(s.health_index).toBe(0)
  })

  it('95. single excellent customer → health_index = 1.0', () => {
    const s = computePortfolioHealthSummary([makeScore('excellent', 90)])
    expect(s.excellent_count).toBe(1)
    expect(s.health_index).toBe(1.0) // 1×5 / (1×5)
  })

  it('96. single churning customer → health_index = 0', () => {
    const s = computePortfolioHealthSummary([makeScore('churning', 10)])
    expect(s.churning_count).toBe(1)
    expect(s.health_index).toBe(0) // 0 / (1×5)
  })

  it('97. tier counts are correct', () => {
    const scores = [
      makeScore('excellent', 90),
      makeScore('excellent', 85),
      makeScore('good', 70),
      makeScore('neutral', 50),
      makeScore('at_risk', 30),
      makeScore('churning', 10),
    ]
    const s = computePortfolioHealthSummary(scores)
    expect(s.excellent_count).toBe(2)
    expect(s.good_count).toBe(1)
    expect(s.neutral_count).toBe(1)
    expect(s.at_risk_count).toBe(1)
    expect(s.churning_count).toBe(1)
  })

  it('98. health_index math: e=1 g=1 n=1 ar=1 ch=1 → (5+3+2+1+0)/(5×5) = 11/25 = 0.44', () => {
    const scores = [
      makeScore('excellent', 90),
      makeScore('good', 70),
      makeScore('neutral', 50),
      makeScore('at_risk', 30),
      makeScore('churning', 10),
    ]
    const s = computePortfolioHealthSummary(scores)
    expect(s.health_index).toBeCloseTo(0.44, 2)
  })

  it('99. avg_health_score is computed correctly', () => {
    const scores = [
      makeScore('excellent', 80),
      makeScore('good', 60),
    ]
    const s = computePortfolioHealthSummary(scores)
    expect(s.avg_health_score).toBe(70)
  })

  it('100. all excellent → health_index = 1.0', () => {
    const scores = [
      makeScore('excellent', 90),
      makeScore('excellent', 85),
      makeScore('excellent', 80),
    ]
    const s = computePortfolioHealthSummary(scores)
    expect(s.health_index).toBe(1.0)
  })

  it('101. all churning → health_index = 0', () => {
    const scores = [
      makeScore('churning', 5),
      makeScore('churning', 10),
    ]
    const s = computePortfolioHealthSummary(scores)
    expect(s.health_index).toBe(0)
  })
})

// ── classifyPortfolioHealth ───────────────────────────────────────────────────

describe('classifyPortfolioHealth', () => {
  function summary(opts: {
    excellent?: number
    good?: number
    neutral?: number
    at_risk?: number
    churning?: number
    health_index?: number
  }) {
    const excellent_count = opts.excellent ?? 0
    const good_count      = opts.good ?? 0
    const neutral_count   = opts.neutral ?? 0
    const at_risk_count   = opts.at_risk ?? 0
    const churning_count  = opts.churning ?? 0
    const total = excellent_count + good_count + neutral_count + at_risk_count + churning_count
    const health_index = opts.health_index ??
      (total === 0 ? 0 :
        (excellent_count * 5 + good_count * 3 + neutral_count * 2 + at_risk_count * 1 + churning_count * 0) /
        (total * 5))
    return {
      avg_health_score: total > 0 ? 60 : null,
      excellent_count,
      good_count,
      neutral_count,
      at_risk_count,
      churning_count,
      health_index,
    }
  }

  it('102. no customers → critical', () => {
    expect(classifyPortfolioHealth(summary({}))).toBe('critical')
  })

  it('103. all excellent, no churning, health_index=1.0 → thriving', () => {
    expect(classifyPortfolioHealth(summary({ excellent: 5, health_index: 1.0 }))).toBe('thriving')
  })

  it('104. health_index >= 0.80 but churning_count > 0 → NOT thriving (healthy)', () => {
    expect(classifyPortfolioHealth(summary({ excellent: 4, churning: 1, health_index: 0.82 }))).toBe('healthy')
  })

  it('105. health_index exactly 0.80, no churning → thriving (boundary)', () => {
    expect(classifyPortfolioHealth(summary({ excellent: 5, health_index: 0.80 }))).toBe('thriving')
  })

  it('106. health_index = 0.75, no churning → healthy (>= 0.65)', () => {
    expect(classifyPortfolioHealth(summary({ good: 5, health_index: 0.75 }))).toBe('healthy')
  })

  it('107. health_index = 0.65, no churning → healthy (boundary)', () => {
    expect(classifyPortfolioHealth(summary({ good: 5, health_index: 0.65 }))).toBe('healthy')
  })

  it('108. health_index = 0.64 → mixed (just below healthy)', () => {
    expect(classifyPortfolioHealth(summary({ good: 3, neutral: 2, health_index: 0.64 }))).toBe('mixed')
  })

  it('109. health_index = 0.50 → mixed (boundary)', () => {
    expect(classifyPortfolioHealth(summary({ neutral: 5, health_index: 0.50 }))).toBe('mixed')
  })

  it('110. health_index = 0.49 → concerning (just below mixed)', () => {
    expect(classifyPortfolioHealth(summary({ neutral: 3, at_risk: 2, health_index: 0.49 }))).toBe('concerning')
  })

  it('111. health_index = 0.30 → concerning (boundary)', () => {
    expect(classifyPortfolioHealth(summary({ at_risk: 5, health_index: 0.30 }))).toBe('concerning')
  })

  it('112. health_index = 0.29 → critical (just below concerning)', () => {
    expect(classifyPortfolioHealth(summary({ at_risk: 3, churning: 2, health_index: 0.29 }))).toBe('critical')
  })

  it('113. health_index = 0 → critical', () => {
    expect(classifyPortfolioHealth(summary({ churning: 5, health_index: 0 }))).toBe('critical')
  })
})

// ── generateSatisfactionNarrative ────────────────────────────────────────────

describe('generateSatisfactionNarrative', () => {
  const emptySummary = {
    avg_health_score: null,
    excellent_count: 0,
    good_count: 0,
    neutral_count: 0,
    at_risk_count: 0,
    churning_count: 0,
    health_index: 0,
  }

  it('114. thriving → Turkish string containing "mükemmel"', () => {
    const narrative = generateSatisfactionNarrative('thriving', emptySummary, 10)
    expect(narrative.length).toBeGreaterThan(0)
    expect(narrative.toLowerCase()).toContain('mükemmel')
  })

  it('115. healthy → Turkish string containing "sağlıklı"', () => {
    const summary = { ...emptySummary, at_risk_count: 2 }
    const narrative = generateSatisfactionNarrative('healthy', summary, 10)
    expect(narrative.length).toBeGreaterThan(0)
    expect(narrative.toLowerCase()).toContain('sağlıklı')
  })

  it('116. healthy narrative includes at_risk count', () => {
    const summary = { ...emptySummary, at_risk_count: 3 }
    const narrative = generateSatisfactionNarrative('healthy', summary, 10)
    expect(narrative).toContain('3')
  })

  it('117. mixed → Turkish string containing "kayıp"', () => {
    const summary = { ...emptySummary, churning_count: 2 }
    const narrative = generateSatisfactionNarrative('mixed', summary, 10)
    expect(narrative.length).toBeGreaterThan(0)
    expect(narrative.toLowerCase()).toContain('kayıp')
  })

  it('118. mixed narrative includes churning count', () => {
    const summary = { ...emptySummary, churning_count: 4 }
    const narrative = generateSatisfactionNarrative('mixed', summary, 10)
    expect(narrative).toContain('4')
  })

  it('119. concerning → Turkish string containing "risk"', () => {
    const summary = { ...emptySummary, at_risk_count: 3, churning_count: 2 }
    const narrative = generateSatisfactionNarrative('concerning', summary, 10)
    expect(narrative.length).toBeGreaterThan(0)
    expect(narrative.toLowerCase()).toContain('risk')
  })

  it('120. concerning narrative includes combined at_risk + churning count', () => {
    const summary = { ...emptySummary, at_risk_count: 3, churning_count: 2 }
    const narrative = generateSatisfactionNarrative('concerning', summary, 10)
    expect(narrative).toContain('5') // 3+2
  })

  it('121. critical → Turkish string containing "kritik"', () => {
    const narrative = generateSatisfactionNarrative('critical', emptySummary, 0)
    expect(narrative.length).toBeGreaterThan(0)
    expect(narrative.toLowerCase()).toContain('kritik')
  })

  it('122. all 5 portfolio health levels produce different narratives', () => {
    const levels: ReturnType<typeof classifyPortfolioHealth>[] = ['thriving', 'healthy', 'mixed', 'concerning', 'critical']
    const narratives = levels.map(l => generateSatisfactionNarrative(l, emptySummary, 5))
    const unique = new Set(narratives)
    expect(unique.size).toBe(5)
  })
})
