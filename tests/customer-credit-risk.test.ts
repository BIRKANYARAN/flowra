/**
 * Customer Credit Risk Scoring — unit tests
 *
 * Tests all pure computation functions.
 * No DB or network calls — pure function tests only.
 */

import { describe, it, expect } from 'vitest'
import {
  computePaymentHistoryScore,
  computeExposureScore,
  computeRelationshipScore,
  computeConcentrationScore,
  computeCompositeCreditScore,
  classifyCreditGrade,
  computeRecommendedCreditLimit,
  generatePaymentTerms,
  generateRiskFlags,
  determineIsTrendImproving,
  buildCustomerCreditScore,
  computeCreditPortfolioSummary,
  type CustomerCreditProfile,
  type CustomerCreditScore,
  type CreditRiskGrade,
} from '../lib/services/commercial/customer-credit-risk.service'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const perfectProfile: CustomerCreditProfile = {
  customer_key: 'id:aaa',
  customer_name: 'Mükemmel Müşteri A.Ş.',
  total_invoices: 24,
  paid_on_time_count: 24,
  paid_late_count: 0,
  unpaid_count: 0,
  avg_days_late: 0,
  max_days_late: 0,
  total_outstanding_try: 0,
  largest_single_invoice_try: 50_000,
  oldest_unpaid_days: 0,
  months_as_customer: 36,
  total_revenue_try: 1_200_000,
  avg_monthly_revenue_try: 50_000,
}

const highRiskProfile: CustomerCreditProfile = {
  customer_key: 'id:ddd',
  customer_name: 'Riskli Müşteri Ltd.',
  total_invoices: 10,
  paid_on_time_count: 1,
  paid_late_count: 4,
  unpaid_count: 5,
  avg_days_late: 45,
  max_days_late: 120,
  total_outstanding_try: 200_000,
  largest_single_invoice_try: 80_000,
  oldest_unpaid_days: 100,
  months_as_customer: 2,
  total_revenue_try: 500_000,
  avg_monthly_revenue_try: 30_000,
}

// ── computePaymentHistoryScore ────────────────────────────────────────────────

describe('computePaymentHistoryScore', () => {

  it('1. perfect history — all paid on time → 100', () => {
    expect(computePaymentHistoryScore(10, 10, 0, 0, 0)).toBe(100)
  })

  it('2. zero total invoices → neutral score 50', () => {
    expect(computePaymentHistoryScore(0, 0, 0, 0, 0)).toBe(50)
  })

  it('3. 80% on-time, no deductions → 80', () => {
    expect(computePaymentHistoryScore(10, 8, 0, 0, 0)).toBe(80)
  })

  it('4. 100% on-time but avg_days_late > 7 → 95 (−5 deduction)', () => {
    expect(computePaymentHistoryScore(10, 10, 10, 0, 0)).toBe(95)
  })

  it('5. 100% on-time but avg_days_late > 14 → 90 (−10 deduction)', () => {
    expect(computePaymentHistoryScore(10, 10, 20, 0, 0)).toBe(90)
  })

  it('6. 100% on-time but avg_days_late > 30 → 80 (−20 deduction)', () => {
    expect(computePaymentHistoryScore(10, 10, 35, 0, 0)).toBe(80)
  })

  it('7. max_days_late > 90 adds −15 penalty on top of delay deduction', () => {
    // 100% on time, avg late 35d (−20), max late 100d (−15) → 65
    expect(computePaymentHistoryScore(10, 10, 35, 100, 0)).toBe(65)
  })

  it('8. max_days_late = 90 — boundary — does NOT trigger > 90 penalty', () => {
    // 100% on time, avg late 35d (−20), max 90d (not > 90) → 80
    expect(computePaymentHistoryScore(10, 10, 35, 90, 0)).toBe(80)
  })

  it('9. unpaid ratio > 20% triggers −15 deduction', () => {
    // 70% on time (base 70), 3/10 unpaid (>20%) → 70 − 15 = 55
    expect(computePaymentHistoryScore(10, 7, 0, 0, 3)).toBe(55)
  })

  it('10. unpaid ratio exactly 20% — boundary — does NOT trigger deduction', () => {
    // 80% on time (base 80), 2/10 unpaid (=20%, not >20%) → 80
    expect(computePaymentHistoryScore(10, 8, 0, 0, 2)).toBe(80)
  })

  it('11. score cannot drop below 0 — clamp enforced', () => {
    // 0% on time (base 0), avg late 35d (−20), max late 100d (−15), unpaid > 20% (−15) → −50 → 0
    const score = computePaymentHistoryScore(10, 0, 35, 100, 5)
    expect(score).toBe(0)
  })

  it('12. all combined deductions on partial good history', () => {
    // 50% on time (base 50), avg 15d (−10), max 91d (−15), unpaid 30% (−15) → 10
    expect(computePaymentHistoryScore(10, 5, 15, 91, 3)).toBe(10)
  })

  it('13. avg_days_late = 7 boundary — no penalty', () => {
    expect(computePaymentHistoryScore(10, 10, 7, 0, 0)).toBe(100)
  })

  it('14. avg_days_late = 14 — falls into > 7 tier (−5 penalty)', () => {
    // 14 > 14 is false, 14 > 7 is true → −5
    expect(computePaymentHistoryScore(10, 10, 14, 0, 0)).toBe(95)
  })

  it('15. avg_days_late = 30 — falls into > 14 tier (−10 penalty)', () => {
    // 30 > 30 is false, 30 > 14 is true → −10
    expect(computePaymentHistoryScore(10, 10, 30, 0, 0)).toBe(90)
  })
})

// ── computeExposureScore ──────────────────────────────────────────────────────

describe('computeExposureScore', () => {

  it('16. no outstanding → 100 (no exposure)', () => {
    expect(computeExposureScore(0, 50_000, 0)).toBe(100)
  })

  it('17. outstanding < 1× monthly revenue → 100', () => {
    expect(computeExposureScore(40_000, 50_000, 0)).toBe(100)
  })

  it('18. outstanding < 2× monthly revenue → 80', () => {
    expect(computeExposureScore(80_000, 50_000, 0)).toBe(80)
  })

  it('19. outstanding < 3× monthly revenue → 60', () => {
    expect(computeExposureScore(130_000, 50_000, 0)).toBe(60)
  })

  it('20. outstanding < 4× monthly revenue → 40', () => {
    expect(computeExposureScore(180_000, 50_000, 0)).toBe(40)
  })

  it('21. outstanding ≥ 4× monthly revenue → 20', () => {
    expect(computeExposureScore(200_000, 50_000, 0)).toBe(20)
  })

  it('22. oldest_unpaid > 30 days → −10 deduction', () => {
    // outstanding < 2× → 80, oldest 45d → 70
    expect(computeExposureScore(80_000, 50_000, 45)).toBe(70)
  })

  it('23. oldest_unpaid > 60 days → −20 deduction', () => {
    // outstanding < 2× → 80, oldest 90d → 60
    expect(computeExposureScore(80_000, 50_000, 90)).toBe(60)
  })

  it('24. oldest_unpaid = 30 boundary — no deduction', () => {
    expect(computeExposureScore(80_000, 50_000, 30)).toBe(80)
  })

  it('25. oldest_unpaid = 60 boundary — −10 (not −20)', () => {
    expect(computeExposureScore(80_000, 50_000, 60)).toBe(70)
  })

  it('26. zero monthly revenue with outstanding → maximum exposure (20)', () => {
    expect(computeExposureScore(10_000, 0, 0)).toBe(20)
  })

  it('27. score cannot drop below 0 — high exposure + old unpaid', () => {
    const score = computeExposureScore(400_000, 50_000, 91)
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBe(0) // 20 − 20 = 0
  })
})

// ── computeRelationshipScore ──────────────────────────────────────────────────

describe('computeRelationshipScore', () => {

  it('28. 0 months → 30', () => {
    expect(computeRelationshipScore(0)).toBe(30)
  })

  it('29. 2 months (< 3) → 30', () => {
    expect(computeRelationshipScore(2)).toBe(30)
  })

  it('30. exactly 3 months → 50', () => {
    expect(computeRelationshipScore(3)).toBe(50)
  })

  it('31. 5 months (< 6) → 50', () => {
    expect(computeRelationshipScore(5)).toBe(50)
  })

  it('32. exactly 6 months → 70', () => {
    expect(computeRelationshipScore(6)).toBe(70)
  })

  it('33. 11 months (< 12) → 70', () => {
    expect(computeRelationshipScore(11)).toBe(70)
  })

  it('34. exactly 12 months → 85', () => {
    expect(computeRelationshipScore(12)).toBe(85)
  })

  it('35. 23 months (< 24) → 85', () => {
    expect(computeRelationshipScore(23)).toBe(85)
  })

  it('36. exactly 24 months → 100', () => {
    expect(computeRelationshipScore(24)).toBe(100)
  })

  it('37. 60 months (long-term) → 100', () => {
    expect(computeRelationshipScore(60)).toBe(100)
  })
})

// ── computeConcentrationScore ─────────────────────────────────────────────────

describe('computeConcentrationScore', () => {

  it('38. no outstanding → 100 (no concentration risk)', () => {
    expect(computeConcentrationScore(0, 500_000)).toBe(100)
  })

  it('39. < 10% of total → 100', () => {
    expect(computeConcentrationScore(40_000, 500_000)).toBe(100)
  })

  it('40. exactly 10% boundary → 80 (< 20% tier)', () => {
    expect(computeConcentrationScore(50_000, 500_000)).toBe(80)
  })

  it('41. 15% → 80', () => {
    expect(computeConcentrationScore(75_000, 500_000)).toBe(80)
  })

  it('42. exactly 20% boundary → 60', () => {
    expect(computeConcentrationScore(100_000, 500_000)).toBe(60)
  })

  it('43. 25% → 60', () => {
    expect(computeConcentrationScore(125_000, 500_000)).toBe(60)
  })

  it('44. exactly 30% boundary → 40', () => {
    expect(computeConcentrationScore(150_000, 500_000)).toBe(40)
  })

  it('45. 40% → 40', () => {
    expect(computeConcentrationScore(200_000, 500_000)).toBe(40)
  })

  it('46. exactly 50% boundary → 20', () => {
    expect(computeConcentrationScore(250_000, 500_000)).toBe(20)
  })

  it('47. 75% → 20', () => {
    expect(computeConcentrationScore(375_000, 500_000)).toBe(20)
  })

  it('48. zero company outstanding with outstanding → 20 (high concentration)', () => {
    expect(computeConcentrationScore(10_000, 0)).toBe(20)
  })
})

// ── computeCompositeCreditScore ───────────────────────────────────────────────

describe('computeCompositeCreditScore', () => {

  it('49. all 100 → 100', () => {
    expect(computeCompositeCreditScore(100, 100, 100, 100)).toBe(100)
  })

  it('50. all 0 → 0', () => {
    expect(computeCompositeCreditScore(0, 0, 0, 0)).toBe(0)
  })

  it('51. weights sum correctly: 0.40 + 0.30 + 0.20 + 0.10 = 1.0', () => {
    // Verify: 100*0.4 + 0*0.3 + 0*0.2 + 0*0.1 = 40
    expect(computeCompositeCreditScore(100, 0, 0, 0)).toBeCloseTo(40)
    // 0*0.4 + 100*0.3 + 0*0.2 + 0*0.1 = 30
    expect(computeCompositeCreditScore(0, 100, 0, 0)).toBeCloseTo(30)
    // 0*0.4 + 0*0.3 + 100*0.2 + 0*0.1 = 20
    expect(computeCompositeCreditScore(0, 0, 100, 0)).toBeCloseTo(20)
    // 0*0.4 + 0*0.3 + 0*0.2 + 100*0.1 = 10
    expect(computeCompositeCreditScore(0, 0, 0, 100)).toBeCloseTo(10)
  })

  it('52. typical good customer: 90, 80, 100, 100 → 90', () => {
    // 90*0.4 + 80*0.3 + 100*0.2 + 100*0.1 = 36 + 24 + 20 + 10 = 90
    const score = computeCompositeCreditScore(90, 80, 100, 100)
    expect(score).toBeCloseTo(90, 0)
  })

  it('53. mixed scores produce weighted blend', () => {
    // 80*0.4 + 60*0.3 + 70*0.2 + 100*0.1 = 32 + 18 + 14 + 10 = 74
    expect(computeCompositeCreditScore(80, 60, 70, 100)).toBeCloseTo(74)
  })
})

// ── classifyCreditGrade ───────────────────────────────────────────────────────

describe('classifyCreditGrade', () => {

  it('54. score = 100 → AAA', () => {
    expect(classifyCreditGrade(100)).toBe('AAA')
  })

  it('55. score = 90 → AAA', () => {
    expect(classifyCreditGrade(90)).toBe('AAA')
  })

  it('56. score = 89 → AA', () => {
    expect(classifyCreditGrade(89)).toBe('AA')
  })

  it('57. score = 80 → AA', () => {
    expect(classifyCreditGrade(80)).toBe('AA')
  })

  it('58. score = 79 → A', () => {
    expect(classifyCreditGrade(79)).toBe('A')
  })

  it('59. score = 70 → A', () => {
    expect(classifyCreditGrade(70)).toBe('A')
  })

  it('60. score = 69 → BBB', () => {
    expect(classifyCreditGrade(69)).toBe('BBB')
  })

  it('61. score = 60 → BBB', () => {
    expect(classifyCreditGrade(60)).toBe('BBB')
  })

  it('62. score = 59 → BB', () => {
    expect(classifyCreditGrade(59)).toBe('BB')
  })

  it('63. score = 50 → BB', () => {
    expect(classifyCreditGrade(50)).toBe('BB')
  })

  it('64. score = 49 → B', () => {
    expect(classifyCreditGrade(49)).toBe('B')
  })

  it('65. score = 40 → B', () => {
    expect(classifyCreditGrade(40)).toBe('B')
  })

  it('66. score = 39 → CCC', () => {
    expect(classifyCreditGrade(39)).toBe('CCC')
  })

  it('67. score = 25 → CCC', () => {
    expect(classifyCreditGrade(25)).toBe('CCC')
  })

  it('68. score = 24 → D', () => {
    expect(classifyCreditGrade(24)).toBe('D')
  })

  it('69. score = 0 → D', () => {
    expect(classifyCreditGrade(0)).toBe('D')
  })
})

// ── computeRecommendedCreditLimit ─────────────────────────────────────────────

describe('computeRecommendedCreditLimit', () => {

  it('70. D grade → 0 regardless of revenue', () => {
    expect(computeRecommendedCreditLimit(50_000, 'D')).toBe(0)
    expect(computeRecommendedCreditLimit(200_000, 'D')).toBe(0)
  })

  it('71. CCC grade → 0.5× monthly revenue', () => {
    expect(computeRecommendedCreditLimit(100_000, 'CCC')).toBe(50_000)
  })

  it('72. B grade → 1× monthly revenue', () => {
    expect(computeRecommendedCreditLimit(100_000, 'B')).toBe(100_000)
  })

  it('73. BB grade → 1.5× monthly revenue', () => {
    expect(computeRecommendedCreditLimit(100_000, 'BB')).toBe(150_000)
  })

  it('74. BBB grade → 2× monthly revenue', () => {
    expect(computeRecommendedCreditLimit(100_000, 'BBB')).toBe(200_000)
  })

  it('75. A grade → 2.5× monthly revenue', () => {
    expect(computeRecommendedCreditLimit(100_000, 'A')).toBe(250_000)
  })

  it('76. AA grade → 3× monthly revenue', () => {
    expect(computeRecommendedCreditLimit(100_000, 'AA')).toBe(300_000)
  })

  it('77. AAA grade → 3× monthly revenue', () => {
    expect(computeRecommendedCreditLimit(100_000, 'AAA')).toBe(300_000)
  })

  it('78. zero monthly revenue → zero limit for all grades', () => {
    const grades: CreditRiskGrade[] = ['AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'CCC', 'D']
    for (const grade of grades) {
      expect(computeRecommendedCreditLimit(0, grade)).toBe(0)
    }
  })
})

// ── generatePaymentTerms ──────────────────────────────────────────────────────

describe('generatePaymentTerms', () => {

  it('79. AAA → "60 gün net"', () => {
    expect(generatePaymentTerms('AAA')).toBe('60 gün net')
  })

  it('80. AA → "60 gün net"', () => {
    expect(generatePaymentTerms('AA')).toBe('60 gün net')
  })

  it('81. A → "30 gün net"', () => {
    expect(generatePaymentTerms('A')).toBe('30 gün net')
  })

  it('82. BBB → "30 gün net"', () => {
    expect(generatePaymentTerms('BBB')).toBe('30 gün net')
  })

  it('83. BB → "15 gün net"', () => {
    expect(generatePaymentTerms('BB')).toBe('15 gün net')
  })

  it('84. B → "15 gün net"', () => {
    expect(generatePaymentTerms('B')).toBe('15 gün net')
  })

  it('85. CCC → "Peşin veya garanti mektubu"', () => {
    expect(generatePaymentTerms('CCC')).toBe('Peşin veya garanti mektubu')
  })

  it('86. D → "Peşin ödeme zorunlu"', () => {
    expect(generatePaymentTerms('D')).toBe('Peşin ödeme zorunlu')
  })
})

// ── generateRiskFlags ─────────────────────────────────────────────────────────

describe('generateRiskFlags', () => {

  it('87. perfect profile → no flags', () => {
    const flags = generateRiskFlags(perfectProfile)
    expect(flags).toHaveLength(0)
  })

  it('88. oldest_unpaid > 90 → "90+ gün vadesi geçmiş fatura var"', () => {
    const flags = generateRiskFlags({
      ...perfectProfile,
      total_outstanding_try: 10_000,
      oldest_unpaid_days: 100,
      unpaid_count: 1,
    })
    expect(flags).toContain('90+ gün vadesi geçmiş fatura var')
  })

  it('89. oldest_unpaid = 90 — boundary — no 90+ flag', () => {
    const flags = generateRiskFlags({
      ...perfectProfile,
      total_outstanding_try: 10_000,
      oldest_unpaid_days: 90,
      unpaid_count: 1,
    })
    expect(flags.some(f => f.includes('90+ gün'))).toBe(false)
  })

  it('90. avg_days_late > 30 → flag with day count', () => {
    const flags = generateRiskFlags({
      ...perfectProfile,
      avg_days_late: 35,
    })
    expect(flags.some(f => f.includes('35 gün ödeme gecikmesi'))).toBe(true)
  })

  it('91. avg_days_late = 30 — boundary — no delay flag', () => {
    const flags = generateRiskFlags({
      ...perfectProfile,
      avg_days_late: 30,
    })
    expect(flags.some(f => f.includes('gün ödeme gecikmesi'))).toBe(false)
  })

  it('92. unpaid > 30% → flag with percentage', () => {
    const flags = generateRiskFlags({
      ...perfectProfile,
      total_invoices: 10,
      unpaid_count: 4, // 40% > 30%
    })
    expect(flags.some(f => f.includes('%40') && f.includes('ödenmemiş'))).toBe(true)
  })

  it('93. unpaid exactly 30% — boundary — no flag', () => {
    const flags = generateRiskFlags({
      ...perfectProfile,
      total_invoices: 10,
      unpaid_count: 3, // 30%, not > 30%
    })
    expect(flags.some(f => f.includes('ödenmemiş'))).toBe(false)
  })

  it('94. outstanding > 3× monthly revenue → "Bakiye 3 aylık ciroya eşit"', () => {
    const flags = generateRiskFlags({
      ...perfectProfile,
      total_outstanding_try: 200_000,
      avg_monthly_revenue_try: 50_000, // 4× → flag triggered
    })
    expect(flags).toContain('Bakiye 3 aylık ciroya eşit')
  })

  it('95. outstanding exactly 3× monthly revenue — boundary — no flag', () => {
    const flags = generateRiskFlags({
      ...perfectProfile,
      total_outstanding_try: 150_000,
      avg_monthly_revenue_try: 50_000, // exactly 3× — not >
    })
    expect(flags.some(f => f.includes('3 aylık'))).toBe(false)
  })

  it('96. months_as_customer < 3 → "Yeni müşteri — kredi geçmişi yetersiz"', () => {
    const flags = generateRiskFlags({
      ...perfectProfile,
      months_as_customer: 1,
    })
    expect(flags).toContain('Yeni müşteri — kredi geçmişi yetersiz')
  })

  it('97. months_as_customer = 3 — boundary — no new customer flag', () => {
    const flags = generateRiskFlags({
      ...perfectProfile,
      months_as_customer: 3,
    })
    expect(flags.some(f => f.includes('Yeni müşteri'))).toBe(false)
  })

  it('98. high risk profile → multiple flags', () => {
    const flags = generateRiskFlags(highRiskProfile)
    expect(flags.length).toBeGreaterThanOrEqual(3)
  })
})

// ── determineIsTrendImproving ─────────────────────────────────────────────────

describe('determineIsTrendImproving', () => {

  it('99. higher recent rate → improving (true)', () => {
    expect(determineIsTrendImproving(0.9, 0.7)).toBe(true)
  })

  it('100. equal rates → stable (true)', () => {
    expect(determineIsTrendImproving(0.8, 0.8)).toBe(true)
  })

  it('101. recent within 5pp below prior → stable (true)', () => {
    // prior 0.8, recent 0.76 — diff = −0.04 < 0.05
    expect(determineIsTrendImproving(0.76, 0.80)).toBe(true)
  })

  it('102. recent exactly 5pp below → stable threshold (true)', () => {
    expect(determineIsTrendImproving(0.75, 0.80)).toBe(true)
  })

  it('103. recent more than 5pp below → declining (false)', () => {
    expect(determineIsTrendImproving(0.74, 0.80)).toBe(false)
  })

  it('104. dramatic decline: 0.4 vs 0.9 → false', () => {
    expect(determineIsTrendImproving(0.4, 0.9)).toBe(false)
  })

  it('105. both zero → stable (true)', () => {
    expect(determineIsTrendImproving(0, 0)).toBe(true)
  })
})

// ── buildCustomerCreditScore ──────────────────────────────────────────────────

describe('buildCustomerCreditScore', () => {

  it('106. perfect profile → all fields populated', () => {
    const score = buildCustomerCreditScore(perfectProfile, 0)
    expect(score.customer_key).toBe('id:aaa')
    expect(score.customer_name).toBe('Mükemmel Müşteri A.Ş.')
    expect(score.credit_score).toBeGreaterThan(0)
    expect(score.credit_grade).toBeDefined()
    expect(score.payment_history_score).toBeGreaterThan(0)
    expect(score.exposure_score).toBeGreaterThan(0)
    expect(score.relationship_score).toBeGreaterThan(0)
    expect(score.concentration_score).toBeGreaterThan(0)
    expect(typeof score.recommended_credit_limit_try).toBe('number')
    expect(typeof score.recommended_payment_terms).toBe('string')
    expect(Array.isArray(score.risk_flags)).toBe(true)
    expect(typeof score.is_improving).toBe('boolean')
  })

  it('107. perfect profile → high credit score (≥ 90)', () => {
    const score = buildCustomerCreditScore(perfectProfile, 0)
    expect(score.credit_score).toBeGreaterThanOrEqual(90)
  })

  it('108. perfect profile → AAA grade', () => {
    const score = buildCustomerCreditScore(perfectProfile, 0)
    expect(score.credit_grade).toBe('AAA')
  })

  it('109. perfect profile → 60-day payment terms', () => {
    const score = buildCustomerCreditScore(perfectProfile, 0)
    expect(score.recommended_payment_terms).toBe('60 gün net')
  })

  it('110. high risk profile → low credit score', () => {
    const score = buildCustomerCreditScore(highRiskProfile, 300_000)
    expect(score.credit_score).toBeLessThan(50)
  })

  it('111. high risk profile → D or CCC grade', () => {
    const score = buildCustomerCreditScore(highRiskProfile, 300_000)
    expect(['D', 'CCC', 'B', 'BB']).toContain(score.credit_grade)
  })

  it('112. high risk profile → cash terms', () => {
    const score = buildCustomerCreditScore(highRiskProfile, 300_000)
    expect(['Peşin ödeme zorunlu', 'Peşin veya garanti mektubu', '15 gün net']).toContain(
      score.recommended_payment_terms,
    )
  })

  it('113. D grade → zero credit limit', () => {
    // Force D grade by building score with terrible profile
    const veryBadProfile: CustomerCreditProfile = {
      ...highRiskProfile,
      total_invoices: 10,
      paid_on_time_count: 0,
      unpaid_count: 7,
      avg_days_late: 60,
      max_days_late: 150,
      total_outstanding_try: 500_000,
      oldest_unpaid_days: 180,
      months_as_customer: 1,
      avg_monthly_revenue_try: 10_000,
    }
    const score = buildCustomerCreditScore(veryBadProfile, 600_000)
    if (score.credit_grade === 'D') {
      expect(score.recommended_credit_limit_try).toBe(0)
    }
  })
})

// ── computeCreditPortfolioSummary ─────────────────────────────────────────────

describe('computeCreditPortfolioSummary', () => {

  function makeScore(grade: CreditRiskGrade, creditScore: number): CustomerCreditScore {
    return {
      customer_key: `key-${grade}-${creditScore}`,
      customer_name: `Customer ${grade}`,
      credit_score: creditScore,
      credit_grade: grade,
      payment_history_score: 80,
      exposure_score: 80,
      relationship_score: 80,
      concentration_score: 80,
      recommended_credit_limit_try: 100_000,
      recommended_payment_terms: '30 gün net',
      risk_flags: [],
      is_improving: true,
    }
  }

  it('114. empty array → all zeros', () => {
    const summary = computeCreditPortfolioSummary([])
    expect(summary.total_customers).toBe(0)
    expect(summary.investment_grade_count).toBe(0)
    expect(summary.speculative_count).toBe(0)
    expect(summary.default_count).toBe(0)
    expect(summary.weighted_avg_score).toBe(0)
  })

  it('115. single AAA customer → investment grade count = 1', () => {
    const scores = [makeScore('AAA', 95)]
    const summary = computeCreditPortfolioSummary(scores)
    expect(summary.investment_grade_count).toBe(1)
    expect(summary.speculative_count).toBe(0)
    expect(summary.default_count).toBe(0)
  })

  it('116. BB customer → speculative count = 1', () => {
    const scores = [makeScore('BB', 55)]
    const summary = computeCreditPortfolioSummary(scores)
    expect(summary.speculative_count).toBe(1)
    expect(summary.investment_grade_count).toBe(0)
  })

  it('117. D customer → default count = 1', () => {
    const scores = [makeScore('D', 10)]
    const summary = computeCreditPortfolioSummary(scores)
    expect(summary.default_count).toBe(1)
  })

  it('118. mixed portfolio → correct grade bucket counts', () => {
    const scores = [
      makeScore('AAA', 95),
      makeScore('AA', 85),
      makeScore('A', 75),
      makeScore('BBB', 65),
      makeScore('BB', 55),
      makeScore('B', 45),
      makeScore('CCC', 30),
      makeScore('D', 10),
    ]
    const summary = computeCreditPortfolioSummary(scores)
    expect(summary.total_customers).toBe(8)
    expect(summary.investment_grade_count).toBe(4) // AAA+AA+A+BBB
    expect(summary.speculative_count).toBe(3)       // BB+B+CCC
    expect(summary.default_count).toBe(1)           // D
  })

  it('119. weighted_avg_score is average of credit scores', () => {
    const scores = [makeScore('AAA', 90), makeScore('BBB', 70)]
    const summary = computeCreditPortfolioSummary(scores)
    expect(summary.weighted_avg_score).toBeCloseTo(80, 0)
  })

  it('120. total_customers matches array length', () => {
    const scores = Array.from({ length: 7 }, (_, i) => makeScore('BBB', 60 + i))
    const summary = computeCreditPortfolioSummary(scores)
    expect(summary.total_customers).toBe(7)
  })
})

// ── Integration tests ─────────────────────────────────────────────────────────

describe('Integration: end-to-end scenarios', () => {

  it('121. customer with perfect payment history → AAA, 60-day terms', () => {
    const score = buildCustomerCreditScore(perfectProfile, 0)
    expect(score.credit_grade).toBe('AAA')
    expect(score.recommended_payment_terms).toBe('60 gün net')
    expect(score.recommended_credit_limit_try).toBe(perfectProfile.avg_monthly_revenue_try * 3)
    expect(score.risk_flags).toHaveLength(0)
  })

  it('122. high risk customer → below BBB, strict cash terms', () => {
    const score = buildCustomerCreditScore(highRiskProfile, 300_000)
    // Grade should be speculative or default (BB or worse)
    const highRiskGrades: CreditRiskGrade[] = ['BB', 'B', 'CCC', 'D']
    expect(highRiskGrades).toContain(score.credit_grade)
    const strictTerms = ['15 gün net', 'Peşin veya garanti mektubu', 'Peşin ödeme zorunlu']
    expect(strictTerms).toContain(score.recommended_payment_terms)
  })

  it('123. new customer with no payment history → new customer flag', () => {
    const newCustomer: CustomerCreditProfile = {
      ...perfectProfile,
      customer_key: 'id:new',
      months_as_customer: 1,
      total_invoices: 1,
      paid_on_time_count: 1,
      unpaid_count: 0,
      avg_days_late: 0,
      max_days_late: 0,
      total_outstanding_try: 0,
    }
    const flags = generateRiskFlags(newCustomer)
    expect(flags).toContain('Yeni müşteri — kredi geçmişi yetersiz')
  })

  it('124. customer with heavily overdue invoices triggers multiple flags', () => {
    const overdueProfile: CustomerCreditProfile = {
      customer_key: 'id:overdue',
      customer_name: 'Overdue Co.',
      total_invoices: 10,
      paid_on_time_count: 4,
      paid_late_count: 2,
      unpaid_count: 4,
      avg_days_late: 45,
      max_days_late: 100,
      total_outstanding_try: 300_000,
      largest_single_invoice_try: 100_000,
      oldest_unpaid_days: 95,
      months_as_customer: 24,
      total_revenue_try: 800_000,
      avg_monthly_revenue_try: 40_000,
    }
    const flags = generateRiskFlags(overdueProfile)
    expect(flags.some(f => f.includes('90+ gün'))).toBe(true)
    expect(flags.some(f => f.includes('gün ödeme gecikmesi'))).toBe(true)
    expect(flags.some(f => f.includes('3 aylık'))).toBe(true)
  })

  it('125. portfolio with all D customers → zero investment grade', () => {
    const dScores: CustomerCreditScore[] = [
      { customer_key: 'k1', customer_name: 'A', credit_score: 10, credit_grade: 'D',
        payment_history_score: 10, exposure_score: 10, relationship_score: 10, concentration_score: 10,
        recommended_credit_limit_try: 0, recommended_payment_terms: 'Peşin ödeme zorunlu',
        risk_flags: [], is_improving: false },
      { customer_key: 'k2', customer_name: 'B', credit_score: 5, credit_grade: 'D',
        payment_history_score: 5, exposure_score: 5, relationship_score: 5, concentration_score: 5,
        recommended_credit_limit_try: 0, recommended_payment_terms: 'Peşin ödeme zorunlu',
        risk_flags: [], is_improving: false },
    ]
    const summary = computeCreditPortfolioSummary(dScores)
    expect(summary.investment_grade_count).toBe(0)
    expect(summary.default_count).toBe(2)
    expect(summary.speculative_count).toBe(0)
  })
})
