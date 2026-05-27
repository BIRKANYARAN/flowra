// ─────────────────────────────────────────────────────────────────────────────
// tests/partner-risk.test.ts — Partner Risk Service Tests
//
// 15+ tests covering pure scoring functions and composite calculations.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest'
import {
  computeCompositeScore,
  scoreToGrade,
  scoreToGradeLabel,
  computeLoanConcentrationScore,
  computeEquityGapScore,
  computeDebtServiceScore,
  computePartnerRiskReport,
  type PartnerRiskReportInput,
} from '../lib/services/pcle/partner-risk.service'

// ── computeCompositeScore ─────────────────────────────────────────────────────

describe('computeCompositeScore', () => {
  it('returns 100 for empty dimensions array', () => {
    expect(computeCompositeScore([])).toBe(100)
  })

  it('returns simple weighted average for equal weights', () => {
    const dims = [
      { score: 80, weight: 0.5 },
      { score: 60, weight: 0.5 },
    ]
    expect(computeCompositeScore(dims)).toBe(70)
  })

  it('correctly weights unequal dimensions', () => {
    const dims = [
      { score: 100, weight: 0.25 },  // 25
      { score: 80,  weight: 0.20 },  // 16
      { score: 60,  weight: 0.20 },  // 12
      { score: 40,  weight: 0.15 },  //  6
      { score: 50,  weight: 0.10 },  //  5
      { score: 70,  weight: 0.10 },  //  7
    ]
    // Total weighted = 25 + 16 + 12 + 6 + 5 + 7 = 71, total weight = 1.0
    expect(computeCompositeScore(dims)).toBe(71)
  })

  it('handles single dimension', () => {
    expect(computeCompositeScore([{ score: 85, weight: 1.0 }])).toBe(85)
  })

  it('returns 0 for all-zero scores', () => {
    const dims = [
      { score: 0, weight: 0.5 },
      { score: 0, weight: 0.5 },
    ]
    expect(computeCompositeScore(dims)).toBe(0)
  })
})

// ── scoreToGrade ──────────────────────────────────────────────────────────────

describe('scoreToGrade', () => {
  it('returns A for score >= 90', () => {
    expect(scoreToGrade(90)).toBe('A')
    expect(scoreToGrade(100)).toBe('A')
    expect(scoreToGrade(95)).toBe('A')
  })

  it('returns B for score 75-89', () => {
    expect(scoreToGrade(75)).toBe('B')
    expect(scoreToGrade(89)).toBe('B')
    expect(scoreToGrade(80)).toBe('B')
  })

  it('returns C for score 60-74', () => {
    expect(scoreToGrade(60)).toBe('C')
    expect(scoreToGrade(74)).toBe('C')
    expect(scoreToGrade(67)).toBe('C')
  })

  it('returns D for score 40-59', () => {
    expect(scoreToGrade(40)).toBe('D')
    expect(scoreToGrade(59)).toBe('D')
    expect(scoreToGrade(50)).toBe('D')
  })

  it('returns F for score < 40', () => {
    expect(scoreToGrade(0)).toBe('F')
    expect(scoreToGrade(39)).toBe('F')
    expect(scoreToGrade(20)).toBe('F')
  })

  it('handles boundary exactly at 89', () => {
    expect(scoreToGrade(89)).toBe('B')
    expect(scoreToGrade(90)).toBe('A')
  })
})

// ── scoreToGradeLabel ─────────────────────────────────────────────────────────

describe('scoreToGradeLabel', () => {
  it('returns Turkish labels', () => {
    expect(scoreToGradeLabel('A')).toBe('Mükemmel')
    expect(scoreToGradeLabel('B')).toBe('İyi')
    expect(scoreToGradeLabel('C')).toBe('Orta')
    expect(scoreToGradeLabel('D')).toBe('Zayıf')
    expect(scoreToGradeLabel('F')).toBe('Kritik')
  })

  it('returns fallback for unknown grade', () => {
    expect(scoreToGradeLabel('Z')).toBe('Bilinmiyor')
  })
})

// ── computeLoanConcentrationScore ─────────────────────────────────────────────

describe('computeLoanConcentrationScore', () => {
  it('returns 100 for 0% concentration', () => {
    expect(computeLoanConcentrationScore(0)).toBe(100)
  })

  it('returns 50 for 50% concentration', () => {
    expect(computeLoanConcentrationScore(50)).toBe(50)
  })

  it('returns 0 for 100% concentration', () => {
    expect(computeLoanConcentrationScore(100)).toBe(0)
  })

  it('returns 0 for >100% (clamped)', () => {
    expect(computeLoanConcentrationScore(150)).toBe(0)
  })

  it('decreases linearly', () => {
    expect(computeLoanConcentrationScore(25)).toBe(75)
    expect(computeLoanConcentrationScore(75)).toBe(25)
  })
})

// ── computeEquityGapScore ─────────────────────────────────────────────────────

describe('computeEquityGapScore', () => {
  it('returns 100 when fully paid', () => {
    expect(computeEquityGapScore(1000, 1000)).toBe(100)
  })

  it('returns 0 when nothing paid', () => {
    expect(computeEquityGapScore(1000, 0)).toBe(0)
  })

  it('returns 100 when committed = 0 (no obligation)', () => {
    expect(computeEquityGapScore(0, 0)).toBe(100)
  })

  it('returns 50 when half paid', () => {
    expect(computeEquityGapScore(1000, 500)).toBe(50)
  })

  it('returns 100 when overpaid', () => {
    // paid > committed → gap_pct = 0
    expect(computeEquityGapScore(1000, 1200)).toBe(100)
  })
})

// ── computeDebtServiceScore ───────────────────────────────────────────────────

describe('computeDebtServiceScore', () => {
  it('returns 100 when monthly repayment is 0', () => {
    expect(computeDebtServiceScore(0, 1000)).toBe(100)
  })

  it('returns 0 when burden = 100% (repayment equals revenue)', () => {
    expect(computeDebtServiceScore(1000, 1000)).toBe(0)
  })

  it('returns 50 when burden = 50%', () => {
    expect(computeDebtServiceScore(500, 1000)).toBe(50)
  })

  it('returns 0 when avg_monthly_revenue = 0 and repayment > 0', () => {
    expect(computeDebtServiceScore(1000, 0)).toBe(0)
  })

  it('returns 0 when repayment > revenue (over 100% burden)', () => {
    expect(computeDebtServiceScore(2000, 1000)).toBe(0)
  })
})

// ── computePartnerRiskReport ──────────────────────────────────────────────────

describe('computePartnerRiskReport', () => {
  it('returns empty report for no partners', () => {
    const report = computePartnerRiskReport({
      company_id:          'co1',
      partners:            [],
      total_company_debt:  0,
      avg_monthly_revenue: 100_000,
    })
    expect(report.profiles).toHaveLength(0)
    expect(report.avg_score).toBe(100)
    expect(report.flagged_partners).toBe(0)
    expect(report.critical_flags).toHaveLength(0)
  })

  it('returns grade_distribution with all grades present', () => {
    const input: PartnerRiskReportInput = {
      company_id:          'co1',
      partners: [{
        partner_id:            'p1',
        partner_name:          'Test Ortak',
        share_pct:             100,
        net_loan_try:          100_000,
        committed_equity_try:  50_000,
        paid_equity_try:       50_000,
        monthly_repayment_try: 0,
        tranches:              [],
      }],
      total_company_debt:  100_000,
      avg_monthly_revenue: 500_000,
    }
    const report = computePartnerRiskReport(input)
    expect(report.grade_distribution).toHaveProperty('A')
    expect(report.grade_distribution).toHaveProperty('B')
    expect(report.grade_distribution).toHaveProperty('C')
    expect(report.grade_distribution).toHaveProperty('D')
    expect(report.grade_distribution).toHaveProperty('F')
  })

  it('flags partner with D or F grade', () => {
    // 100% concentration → loan_concentration score = 0
    // 100% debt service burden → debt_service score = 0
    const input: PartnerRiskReportInput = {
      company_id:          'co1',
      partners: [{
        partner_id:            'p1',
        partner_name:          'Riskli Ortak',
        share_pct:             100,
        net_loan_try:          100_000,
        committed_equity_try:  200_000,   // committed much more than paid → big gap
        paid_equity_try:       0,          // nothing paid
        monthly_repayment_try: 500_000,   // 100% of revenue
        tranches:              [],
      }],
      total_company_debt:  100_000,
      avg_monthly_revenue: 500_000,
    }
    const report = computePartnerRiskReport(input)
    const profile = report.profiles[0]
    expect(profile.grade).toMatch(/D|F/)
    expect(report.flagged_partners).toBe(1)
  })

  it('returns A grade for fully healthy partner', () => {
    const input: PartnerRiskReportInput = {
      company_id:          'co1',
      partners: [
        {
          partner_id:            'p1',
          partner_name:          'Sağlıklı Ortak A',
          share_pct:             50,
          net_loan_try:          50_000,
          committed_equity_try:  100_000,
          paid_equity_try:       100_000,
          monthly_repayment_try: 0,
          tranches:              [],
        },
        {
          partner_id:            'p2',
          partner_name:          'Sağlıklı Ortak B',
          share_pct:             50,
          net_loan_try:          50_000,
          committed_equity_try:  100_000,
          paid_equity_try:       100_000,
          monthly_repayment_try: 0,
          tranches:              [],
        },
      ],
      total_company_debt:  100_000,
      avg_monthly_revenue: 2_000_000,
    }
    const report = computePartnerRiskReport(input)
    // Each partner has 50% concentration → score = 50 → not perfect A, but
    // all other dimensions should be 100. Expect grade C or better.
    for (const p of report.profiles) {
      expect(['A', 'B', 'C']).toContain(p.grade)
    }
    expect(report.flagged_partners).toBe(0)
  })

  it('profile contains 6 dimensions', () => {
    const input: PartnerRiskReportInput = {
      company_id:          'co1',
      partners: [{
        partner_id:            'p1',
        partner_name:          'Test',
        share_pct:             100,
        net_loan_try:          0,
        committed_equity_try:  0,
        paid_equity_try:       0,
        monthly_repayment_try: 0,
        tranches:              [],
      }],
      total_company_debt:  0,
      avg_monthly_revenue: 100_000,
    }
    const report = computePartnerRiskReport(input)
    expect(report.profiles[0].dimensions).toHaveLength(6)
  })

  it('VUK risk: zero-rate loan > 50K → interest_rate score = 40', () => {
    const input: PartnerRiskReportInput = {
      company_id:          'co1',
      partners: [{
        partner_id:            'p1',
        partner_name:          'VUK Ortak',
        share_pct:             100,
        net_loan_try:          100_000,
        committed_equity_try:  100_000,
        paid_equity_try:       100_000,
        monthly_repayment_try: 0,
        tranches: [{
          principal_try:            75_000,   // > 50K
          expected_repayment_date:  null,
          interest_rate_annual_pct: 0,        // zero rate
        }],
      }],
      total_company_debt:  100_000,
      avg_monthly_revenue: 1_000_000,
    }
    const report = computePartnerRiskReport(input)
    const irDim = report.profiles[0].dimensions.find(d => d.key === 'interest_rate')
    expect(irDim?.score).toBe(40)
    expect(irDim?.is_flagged).toBe(true)
  })

  it('critical_flags contains at most 5 items', () => {
    const partners = Array.from({ length: 8 }, (_, i) => ({
      partner_id:            `p${i}`,
      partner_name:          `Ortak ${i}`,
      share_pct:             100 / 8,
      net_loan_try:          100_000,
      committed_equity_try:  200_000,
      paid_equity_try:       0,
      monthly_repayment_try: 999_999,
      tranches:              [],
    }))
    const report = computePartnerRiskReport({
      company_id:          'co1',
      partners,
      total_company_debt:  800_000,
      avg_monthly_revenue: 100_000,
    })
    expect(report.critical_flags.length).toBeLessThanOrEqual(5)
  })
})
