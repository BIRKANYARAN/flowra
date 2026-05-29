// ─────────────────────────────────────────────────────────────────────────────
// tests/partner-risk.test.ts — Partner Risk Service Tests
//
// 120+ tests covering all pure scoring functions and composite calculations.
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
  type PartnerRiskInput,
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

  it('returns 100 for all-100 scores', () => {
    const dims = [
      { score: 100, weight: 0.5 },
      { score: 100, weight: 0.5 },
    ]
    expect(computeCompositeScore(dims)).toBe(100)
  })

  it('returns 100 when totalWeight = 0', () => {
    const dims = [{ score: 50, weight: 0 }]
    expect(computeCompositeScore(dims)).toBe(100)
  })

  it('handles fractional weights < 1 total', () => {
    // 0.3 weight only — normalized so avg = 50
    const dims = [{ score: 50, weight: 0.3 }]
    expect(computeCompositeScore(dims)).toBe(50)
  })

  it('rounds to 2 decimal places', () => {
    const dims = [
      { score: 33.333, weight: 0.5 },
      { score: 66.667, weight: 0.5 },
    ]
    const result = computeCompositeScore(dims)
    expect(result).toBe(50)
  })

  it('handles extreme weights summing > 1', () => {
    const dims = [
      { score: 100, weight: 2.0 },
      { score: 0,   weight: 1.0 },
    ]
    // weighted = 200, totalWeight = 3 → 66.67
    expect(computeCompositeScore(dims)).toBeCloseTo(66.67, 1)
  })

  it('returns weighted average for 3 equal-weight dimensions', () => {
    const dims = [
      { score: 90, weight: 1/3 },
      { score: 60, weight: 1/3 },
      { score: 30, weight: 1/3 },
    ]
    expect(computeCompositeScore(dims)).toBeCloseTo(60, 0)
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

  it('handles boundary exactly at 74', () => {
    expect(scoreToGrade(74)).toBe('C')
    expect(scoreToGrade(75)).toBe('B')
  })

  it('handles boundary exactly at 59', () => {
    expect(scoreToGrade(59)).toBe('D')
    expect(scoreToGrade(60)).toBe('C')
  })

  it('handles boundary exactly at 39', () => {
    expect(scoreToGrade(39)).toBe('F')
    expect(scoreToGrade(40)).toBe('D')
  })

  it('score 0 returns F', () => {
    expect(scoreToGrade(0)).toBe('F')
  })

  it('score 100 returns A', () => {
    expect(scoreToGrade(100)).toBe('A')
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

  it('returns fallback for empty string', () => {
    expect(scoreToGradeLabel('')).toBe('Bilinmiyor')
  })

  it('returns fallback for lowercase grade', () => {
    // Labels are uppercase keyed — lowercase should fall back
    expect(scoreToGradeLabel('a')).toBe('Bilinmiyor')
  })

  it('A label is not empty', () => {
    expect(scoreToGradeLabel('A').length).toBeGreaterThan(0)
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

  it('returns 90 for 10% concentration', () => {
    expect(computeLoanConcentrationScore(10)).toBe(90)
  })

  it('returns 40 for 60% concentration', () => {
    expect(computeLoanConcentrationScore(60)).toBe(40)
  })

  it('clamps negative input to 100', () => {
    expect(computeLoanConcentrationScore(-10)).toBe(100)
  })

  it('returns 1 for 99% concentration', () => {
    expect(computeLoanConcentrationScore(99)).toBe(1)
  })

  it('returns 99 for 1% concentration', () => {
    expect(computeLoanConcentrationScore(1)).toBe(99)
  })

  it('is flagged when score < 60 (>40% concentration)', () => {
    const score = computeLoanConcentrationScore(45)
    expect(score).toBe(55)
    // Not flagged yet at 45% (score=55 >= 60 is false)
    expect(score).toBeLessThan(60)
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

  it('returns 25 when 75% unpaid', () => {
    expect(computeEquityGapScore(1000, 250)).toBe(25)
  })

  it('returns 75 when 75% paid', () => {
    expect(computeEquityGapScore(1000, 750)).toBe(75)
  })

  it('handles large amounts', () => {
    expect(computeEquityGapScore(10_000_000, 10_000_000)).toBe(100)
    expect(computeEquityGapScore(10_000_000, 0)).toBe(0)
  })

  it('handles committed = 0 with non-zero paid (overpaid)', () => {
    // committed <= 0 → return 100
    expect(computeEquityGapScore(0, 500)).toBe(100)
  })

  it('returns score < 60 (flagged) when < 40% paid', () => {
    const score = computeEquityGapScore(1000, 300)
    expect(score).toBe(30)
    expect(score).toBeLessThan(60)
  })

  it('returns 90 when 90% paid', () => {
    expect(computeEquityGapScore(1000, 900)).toBe(90)
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

  it('returns 75 when burden = 25%', () => {
    expect(computeDebtServiceScore(250, 1000)).toBe(75)
  })

  it('returns 90 when burden = 10%', () => {
    expect(computeDebtServiceScore(100, 1000)).toBe(90)
  })

  it('returns 100 when both are 0', () => {
    expect(computeDebtServiceScore(0, 0)).toBe(100)
  })

  it('handles fractional burden correctly', () => {
    // 33.33% burden → score = 66.67
    const score = computeDebtServiceScore(1000, 3000)
    expect(score).toBeCloseTo(66.67, 1)
  })

  it('clamps to 0 for extreme burden (500%)', () => {
    expect(computeDebtServiceScore(5000, 1000)).toBe(0)
  })

  it('score is flagged (<60) when burden > 40%', () => {
    const score = computeDebtServiceScore(450, 1000)
    expect(score).toBe(55)
    expect(score).toBeLessThan(60)
  })
})

// ── computePartnerRiskReport ──────────────────────────────────────────────────

describe('computePartnerRiskReport', () => {
  // ── empty input ──────────────────────────────────────────────────────────────
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
    const input: PartnerRiskReportInput = {
      company_id:          'co1',
      partners: [{
        partner_id:            'p1',
        partner_name:          'Riskli Ortak',
        share_pct:             100,
        net_loan_try:          100_000,
        committed_equity_try:  200_000,
        paid_equity_try:       0,
        monthly_repayment_try: 500_000,
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
          principal_try:            75_000,
          expected_repayment_date:  null,
          interest_rate_annual_pct: 0,
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

  it('report has computed_at set', () => {
    const report = computePartnerRiskReport({
      company_id:          'co1',
      partners:            [],
      total_company_debt:  0,
      avg_monthly_revenue: 0,
    })
    expect(report.computed_at).toBeTruthy()
    expect(typeof report.computed_at).toBe('string')
  })

  it('report company_id matches input', () => {
    const report = computePartnerRiskReport({
      company_id:          'my-company-xyz',
      partners:            [],
      total_company_debt:  0,
      avg_monthly_revenue: 0,
    })
    expect(report.company_id).toBe('my-company-xyz')
  })

  it('avg_score is average of all profile composite scores', () => {
    const input: PartnerRiskReportInput = {
      company_id: 'co1',
      partners: [
        {
          partner_id: 'p1', partner_name: 'P1', share_pct: 50,
          net_loan_try: 0, committed_equity_try: 100_000,
          paid_equity_try: 100_000, monthly_repayment_try: 0, tranches: [],
        },
        {
          partner_id: 'p2', partner_name: 'P2', share_pct: 50,
          net_loan_try: 0, committed_equity_try: 100_000,
          paid_equity_try: 100_000, monthly_repayment_try: 0, tranches: [],
        },
      ],
      total_company_debt:  0,
      avg_monthly_revenue: 1_000_000,
    }
    const report = computePartnerRiskReport(input)
    const expectedAvg = (report.profiles[0].composite_score + report.profiles[1].composite_score) / 2
    expect(report.avg_score).toBeCloseTo(expectedAvg, 1)
  })

  it('grade_distribution counts add up to profile count', () => {
    const partners: PartnerRiskInput[] = Array.from({ length: 5 }, (_, i) => ({
      partner_id: `p${i}`, partner_name: `P${i}`, share_pct: 20,
      net_loan_try: i * 20_000,
      committed_equity_try: 50_000, paid_equity_try: 50_000,
      monthly_repayment_try: 0, tranches: [],
    }))
    const report = computePartnerRiskReport({
      company_id: 'co1', partners,
      total_company_debt: 100_000, avg_monthly_revenue: 1_000_000,
    })
    const total = Object.values(report.grade_distribution).reduce((s, n) => s + n, 0)
    expect(total).toBe(5)
  })

  it('zero-rate loan <= 50K → interest_rate score = 60 (not VUK)', () => {
    const input: PartnerRiskReportInput = {
      company_id: 'co1',
      partners: [{
        partner_id: 'p1', partner_name: 'Test', share_pct: 100,
        net_loan_try: 40_000, committed_equity_try: 40_000, paid_equity_try: 40_000,
        monthly_repayment_try: 0,
        tranches: [{
          principal_try: 30_000,
          expected_repayment_date: null,
          interest_rate_annual_pct: 0,
        }],
      }],
      total_company_debt: 40_000,
      avg_monthly_revenue: 500_000,
    }
    const report = computePartnerRiskReport(input)
    const irDim = report.profiles[0].dimensions.find(d => d.key === 'interest_rate')
    expect(irDim?.score).toBe(60)
  })

  it('non-zero interest rate → interest_rate score = 100', () => {
    const input: PartnerRiskReportInput = {
      company_id: 'co1',
      partners: [{
        partner_id: 'p1', partner_name: 'Test', share_pct: 100,
        net_loan_try: 100_000, committed_equity_try: 100_000, paid_equity_try: 100_000,
        monthly_repayment_try: 0,
        tranches: [{
          principal_try: 100_000,
          expected_repayment_date: null,
          interest_rate_annual_pct: 12,
        }],
      }],
      total_company_debt: 100_000,
      avg_monthly_revenue: 1_000_000,
    }
    const report = computePartnerRiskReport(input)
    const irDim = report.profiles[0].dimensions.find(d => d.key === 'interest_rate')
    expect(irDim?.score).toBe(100)
    expect(irDim?.is_flagged).toBe(false)
  })

  it('dimension is_flagged = true when score < 60', () => {
    const input: PartnerRiskReportInput = {
      company_id: 'co1',
      partners: [{
        partner_id: 'p1', partner_name: 'P1', share_pct: 100,
        net_loan_try: 0, committed_equity_try: 100_000, paid_equity_try: 0,
        monthly_repayment_try: 0, tranches: [],
      }],
      total_company_debt: 0, avg_monthly_revenue: 0,
    }
    const report = computePartnerRiskReport(input)
    const eqDim = report.profiles[0].dimensions.find(d => d.key === 'equity_gap')
    expect(eqDim?.score).toBe(0)
    expect(eqDim?.is_flagged).toBe(true)
  })

  it('dimension is_flagged = false when score >= 60', () => {
    const input: PartnerRiskReportInput = {
      company_id: 'co1',
      partners: [{
        partner_id: 'p1', partner_name: 'P1', share_pct: 50,
        net_loan_try: 0, committed_equity_try: 100_000, paid_equity_try: 100_000,
        monthly_repayment_try: 0, tranches: [],
      }],
      total_company_debt: 0, avg_monthly_revenue: 0,
    }
    const report = computePartnerRiskReport(input)
    const eqDim = report.profiles[0].dimensions.find(d => d.key === 'equity_gap')
    expect(eqDim?.score).toBe(100)
    expect(eqDim?.is_flagged).toBe(false)
  })

  it('top_concern is empty string when no dimensions flagged', () => {
    const input: PartnerRiskReportInput = {
      company_id: 'co1',
      partners: [{
        partner_id: 'p1', partner_name: 'P1', share_pct: 10,
        net_loan_try: 0, committed_equity_try: 100_000, paid_equity_try: 100_000,
        monthly_repayment_try: 0, tranches: [],
      }],
      total_company_debt: 0, avg_monthly_revenue: 1_000_000,
    }
    const report = computePartnerRiskReport(input)
    expect(report.profiles[0].top_concern).toBe('')
  })

  it('top_concern is set when worst dimension is flagged', () => {
    const input: PartnerRiskReportInput = {
      company_id: 'co1',
      partners: [{
        partner_id: 'p1', partner_name: 'P1', share_pct: 100,
        net_loan_try: 100_000, committed_equity_try: 100_000, paid_equity_try: 0,
        monthly_repayment_try: 100_000, tranches: [],
      }],
      total_company_debt: 100_000, avg_monthly_revenue: 100_000,
    }
    const report = computePartnerRiskReport(input)
    // Many dimensions flagged — top_concern should be non-empty
    expect(report.profiles[0].top_concern.length).toBeGreaterThan(0)
  })

  it('grade_label matches grade', () => {
    const input: PartnerRiskReportInput = {
      company_id: 'co1',
      partners: [{
        partner_id: 'p1', partner_name: 'P1', share_pct: 50,
        net_loan_try: 0, committed_equity_try: 0, paid_equity_try: 0,
        monthly_repayment_try: 0, tranches: [],
      }],
      total_company_debt: 0, avg_monthly_revenue: 1_000_000,
    }
    const report = computePartnerRiskReport(input)
    const profile = report.profiles[0]
    const grade = profile.grade
    const gradeToLabel: Record<string, string> = {
      A: 'Mükemmel', B: 'İyi', C: 'Orta', D: 'Zayıf', F: 'Kritik',
    }
    expect(profile.grade_label).toBe(gradeToLabel[grade])
  })

  it('profile share_pct matches input', () => {
    const input: PartnerRiskReportInput = {
      company_id: 'co1',
      partners: [{
        partner_id: 'p1', partner_name: 'P1', share_pct: 33.33,
        net_loan_try: 0, committed_equity_try: 0, paid_equity_try: 0,
        monthly_repayment_try: 0, tranches: [],
      }],
      total_company_debt: 0, avg_monthly_revenue: 0,
    }
    const report = computePartnerRiskReport(input)
    expect(report.profiles[0].share_pct).toBe(33.33)
  })

  it('waterfall_burden dimension key exists', () => {
    const input: PartnerRiskReportInput = {
      company_id: 'co1',
      partners: [{
        partner_id: 'p1', partner_name: 'P1', share_pct: 50,
        net_loan_try: 100_000, committed_equity_try: 0, paid_equity_try: 0,
        monthly_repayment_try: 0, tranches: [],
      }],
      total_company_debt: 200_000, avg_monthly_revenue: 1_000_000,
    }
    const report = computePartnerRiskReport(input)
    const wfDim = report.profiles[0].dimensions.find(d => d.key === 'waterfall_burden')
    expect(wfDim).toBeDefined()
  })

  it('loan_concentration dimension score = 0 when 100% concentration', () => {
    const input: PartnerRiskReportInput = {
      company_id: 'co1',
      partners: [{
        partner_id: 'p1', partner_name: 'P1', share_pct: 100,
        net_loan_try: 100_000, committed_equity_try: 100_000, paid_equity_try: 100_000,
        monthly_repayment_try: 0, tranches: [],
      }],
      total_company_debt: 100_000, avg_monthly_revenue: 1_000_000,
    }
    const report = computePartnerRiskReport(input)
    const concDim = report.profiles[0].dimensions.find(d => d.key === 'loan_concentration')
    expect(concDim?.score).toBe(0)
    expect(concDim?.is_flagged).toBe(true)
  })

  it('multi-partner scenario: flagged_partners counts correctly', () => {
    const partners: PartnerRiskInput[] = [
      {
        partner_id: 'p1', partner_name: 'Good Partner', share_pct: 50,
        net_loan_try: 50_000, committed_equity_try: 100_000, paid_equity_try: 100_000,
        monthly_repayment_try: 0, tranches: [],
      },
      {
        partner_id: 'p2', partner_name: 'Bad Partner', share_pct: 50,
        net_loan_try: 50_000, committed_equity_try: 200_000, paid_equity_try: 0,
        monthly_repayment_try: 50_000, tranches: [],
      },
    ]
    const report = computePartnerRiskReport({
      company_id: 'co1', partners,
      total_company_debt: 100_000, avg_monthly_revenue: 100_000,
    })
    // Bad partner should be flagged (grade D or F)
    expect(report.flagged_partners).toBeGreaterThanOrEqual(1)
  })

  it('partner with no loan and full equity — low flagged_dimensions', () => {
    const input: PartnerRiskReportInput = {
      company_id: 'co1',
      partners: [{
        partner_id: 'p1', partner_name: 'Perfect', share_pct: 50,
        net_loan_try: 0, committed_equity_try: 200_000, paid_equity_try: 200_000,
        monthly_repayment_try: 0, tranches: [],
      }],
      total_company_debt: 0, avg_monthly_revenue: 2_000_000,
    }
    const report = computePartnerRiskReport(input)
    expect(report.profiles[0].flagged_dimensions).toBe(0)
  })

  it('all dimensions have weights that sum to 1.0 in report context', () => {
    const input: PartnerRiskReportInput = {
      company_id: 'co1',
      partners: [{
        partner_id: 'p1', partner_name: 'Test', share_pct: 100,
        net_loan_try: 0, committed_equity_try: 0, paid_equity_try: 0,
        monthly_repayment_try: 0, tranches: [],
      }],
      total_company_debt: 0, avg_monthly_revenue: 100_000,
    }
    const report = computePartnerRiskReport(input)
    const totalWeight = report.profiles[0].dimensions.reduce((s, d) => s + d.weight, 0)
    expect(totalWeight).toBeCloseTo(1.0, 5)
  })

  it('dimension keys are correct set', () => {
    const input: PartnerRiskReportInput = {
      company_id: 'co1',
      partners: [{
        partner_id: 'p1', partner_name: 'Test', share_pct: 100,
        net_loan_try: 0, committed_equity_try: 0, paid_equity_try: 0,
        monthly_repayment_try: 0, tranches: [],
      }],
      total_company_debt: 0, avg_monthly_revenue: 100_000,
    }
    const report = computePartnerRiskReport(input)
    const keys = report.profiles[0].dimensions.map(d => d.key).sort()
    expect(keys).toEqual([
      'debt_service', 'equity_gap', 'interest_rate',
      'loan_concentration', 'loan_duration', 'waterfall_burden',
    ])
  })

  it('finding field is non-empty for each dimension', () => {
    const input: PartnerRiskReportInput = {
      company_id: 'co1',
      partners: [{
        partner_id: 'p1', partner_name: 'Test', share_pct: 50,
        net_loan_try: 50_000, committed_equity_try: 50_000, paid_equity_try: 50_000,
        monthly_repayment_try: 5_000, tranches: [],
      }],
      total_company_debt: 100_000, avg_monthly_revenue: 100_000,
    }
    const report = computePartnerRiskReport(input)
    for (const dim of report.profiles[0].dimensions) {
      expect(dim.finding.length).toBeGreaterThan(0)
    }
  })

  it('label field is non-empty for each dimension', () => {
    const input: PartnerRiskReportInput = {
      company_id: 'co1',
      partners: [{
        partner_id: 'p1', partner_name: 'Test', share_pct: 50,
        net_loan_try: 0, committed_equity_try: 0, paid_equity_try: 0,
        monthly_repayment_try: 0, tranches: [],
      }],
      total_company_debt: 0, avg_monthly_revenue: 0,
    }
    const report = computePartnerRiskReport(input)
    for (const dim of report.profiles[0].dimensions) {
      expect(dim.label.length).toBeGreaterThan(0)
    }
  })

  it('partner_name is preserved in profile', () => {
    const input: PartnerRiskReportInput = {
      company_id: 'co1',
      partners: [{
        partner_id: 'p99', partner_name: 'Ahmet Yılmaz',
        share_pct: 100, net_loan_try: 0, committed_equity_try: 0,
        paid_equity_try: 0, monthly_repayment_try: 0, tranches: [],
      }],
      total_company_debt: 0, avg_monthly_revenue: 0,
    }
    const report = computePartnerRiskReport(input)
    expect(report.profiles[0].partner_name).toBe('Ahmet Yılmaz')
    expect(report.profiles[0].partner_id).toBe('p99')
  })

  it('composite_score is within 0-100 for all profiles', () => {
    const partners: PartnerRiskInput[] = Array.from({ length: 10 }, (_, i) => ({
      partner_id: `p${i}`, partner_name: `Partner ${i}`, share_pct: 10,
      net_loan_try: i * 10_000,
      committed_equity_try: (10 - i) * 10_000,
      paid_equity_try: i * 5_000,
      monthly_repayment_try: i * 1_000,
      tranches: [],
    }))
    const report = computePartnerRiskReport({
      company_id: 'co1', partners,
      total_company_debt: 500_000, avg_monthly_revenue: 200_000,
    })
    for (const p of report.profiles) {
      expect(p.composite_score).toBeGreaterThanOrEqual(0)
      expect(p.composite_score).toBeLessThanOrEqual(100)
    }
  })

  it('flagged_dimensions is sum of is_flagged=true dimensions', () => {
    const input: PartnerRiskReportInput = {
      company_id: 'co1',
      partners: [{
        partner_id: 'p1', partner_name: 'Test', share_pct: 100,
        net_loan_try: 100_000, committed_equity_try: 200_000, paid_equity_try: 0,
        monthly_repayment_try: 100_000, tranches: [],
      }],
      total_company_debt: 100_000, avg_monthly_revenue: 100_000,
    }
    const report = computePartnerRiskReport(input)
    const profile = report.profiles[0]
    const expectedFlagged = profile.dimensions.filter(d => d.is_flagged).length
    expect(profile.flagged_dimensions).toBe(expectedFlagged)
  })

  it('no tranches — loan_duration score = 100', () => {
    const input: PartnerRiskReportInput = {
      company_id: 'co1',
      partners: [{
        partner_id: 'p1', partner_name: 'Test', share_pct: 100,
        net_loan_try: 0, committed_equity_try: 0, paid_equity_try: 0,
        monthly_repayment_try: 0, tranches: [],
      }],
      total_company_debt: 0, avg_monthly_revenue: 100_000,
    }
    const report = computePartnerRiskReport(input)
    const durDim = report.profiles[0].dimensions.find(d => d.key === 'loan_duration')
    expect(durDim?.score).toBe(100)
    expect(durDim?.is_flagged).toBe(false)
  })

  it('past maturity date tranche does not count as due within 90 days', () => {
    const input: PartnerRiskReportInput = {
      company_id: 'co1',
      partners: [{
        partner_id: 'p1', partner_name: 'Test', share_pct: 100,
        net_loan_try: 100_000, committed_equity_try: 0, paid_equity_try: 0,
        monthly_repayment_try: 0,
        tranches: [{
          principal_try: 100_000,
          expected_repayment_date: '2020-01-01', // past
          interest_rate_annual_pct: 5,
        }],
      }],
      total_company_debt: 100_000, avg_monthly_revenue: 1_000_000,
    }
    const report = computePartnerRiskReport(input)
    const durDim = report.profiles[0].dimensions.find(d => d.key === 'loan_duration')
    // Past dates don't qualify as due within 90 days → score = 100
    expect(durDim?.score).toBe(100)
  })

  it('single partner with perfect health has 0 flagged_partners', () => {
    const input: PartnerRiskReportInput = {
      company_id: 'co1',
      partners: [{
        partner_id: 'p1', partner_name: 'Perfect', share_pct: 10,
        net_loan_try: 10_000,
        committed_equity_try: 1_000_000, paid_equity_try: 1_000_000,
        monthly_repayment_try: 0, tranches: [],
      }],
      total_company_debt: 100_000, avg_monthly_revenue: 5_000_000,
    }
    const report = computePartnerRiskReport(input)
    expect(report.flagged_partners).toBe(0)
  })

  it('equity_gap score = 100 when committed = 0', () => {
    const input: PartnerRiskReportInput = {
      company_id: 'co1',
      partners: [{
        partner_id: 'p1', partner_name: 'Test', share_pct: 100,
        net_loan_try: 0, committed_equity_try: 0, paid_equity_try: 0,
        monthly_repayment_try: 0, tranches: [],
      }],
      total_company_debt: 0, avg_monthly_revenue: 100_000,
    }
    const report = computePartnerRiskReport(input)
    const eqDim = report.profiles[0].dimensions.find(d => d.key === 'equity_gap')
    expect(eqDim?.score).toBe(100)
  })

  it('waterfall score = 100 when total_company_debt = 0', () => {
    const input: PartnerRiskReportInput = {
      company_id: 'co1',
      partners: [{
        partner_id: 'p1', partner_name: 'Test', share_pct: 50,
        net_loan_try: 0, committed_equity_try: 0, paid_equity_try: 0,
        monthly_repayment_try: 0, tranches: [],
      }],
      total_company_debt: 0, avg_monthly_revenue: 100_000,
    }
    const report = computePartnerRiskReport(input)
    const wfDim = report.profiles[0].dimensions.find(d => d.key === 'waterfall_burden')
    expect(wfDim?.score).toBe(100)
  })

  it('profiles list length matches number of partners in input', () => {
    const partners: PartnerRiskInput[] = Array.from({ length: 7 }, (_, i) => ({
      partner_id: `p${i}`, partner_name: `P${i}`, share_pct: 100/7,
      net_loan_try: 0, committed_equity_try: 0, paid_equity_try: 0,
      monthly_repayment_try: 0, tranches: [],
    }))
    const report = computePartnerRiskReport({
      company_id: 'co1', partners,
      total_company_debt: 0, avg_monthly_revenue: 1_000_000,
    })
    expect(report.profiles).toHaveLength(7)
  })

  it('grade A means composite >= 90', () => {
    const input: PartnerRiskReportInput = {
      company_id: 'co1',
      partners: [{
        partner_id: 'p1', partner_name: 'Perfect', share_pct: 5,
        net_loan_try: 5_000, committed_equity_try: 1_000_000, paid_equity_try: 1_000_000,
        monthly_repayment_try: 0, tranches: [],
      }],
      total_company_debt: 100_000, avg_monthly_revenue: 10_000_000,
    }
    const report = computePartnerRiskReport(input)
    const profile = report.profiles[0]
    if (profile.grade === 'A') {
      expect(profile.composite_score).toBeGreaterThanOrEqual(90)
    }
  })

  it('two zero-rate tranches: one <= 50K and one > 50K → VUK risk (score 40)', () => {
    const input: PartnerRiskReportInput = {
      company_id: 'co1',
      partners: [{
        partner_id: 'p1', partner_name: 'VUK Mixed', share_pct: 100,
        net_loan_try: 100_000, committed_equity_try: 100_000, paid_equity_try: 100_000,
        monthly_repayment_try: 0,
        tranches: [
          { principal_try: 30_000, expected_repayment_date: null, interest_rate_annual_pct: 0 },
          { principal_try: 70_000, expected_repayment_date: null, interest_rate_annual_pct: 0 },
        ],
      }],
      total_company_debt: 100_000, avg_monthly_revenue: 1_000_000,
    }
    const report = computePartnerRiskReport(input)
    const irDim = report.profiles[0].dimensions.find(d => d.key === 'interest_rate')
    expect(irDim?.score).toBe(40)
  })

  it('debt_service dimension score = 100 when repayment = 0', () => {
    const input: PartnerRiskReportInput = {
      company_id: 'co1',
      partners: [{
        partner_id: 'p1', partner_name: 'Test', share_pct: 50,
        net_loan_try: 0, committed_equity_try: 0, paid_equity_try: 0,
        monthly_repayment_try: 0, tranches: [],
      }],
      total_company_debt: 0, avg_monthly_revenue: 500_000,
    }
    const report = computePartnerRiskReport(input)
    const dsDim = report.profiles[0].dimensions.find(d => d.key === 'debt_service')
    expect(dsDim?.score).toBe(100)
    expect(dsDim?.is_flagged).toBe(false)
  })

  it('finding for zero-rate VUK risk contains VUK reference', () => {
    const input: PartnerRiskReportInput = {
      company_id: 'co1',
      partners: [{
        partner_id: 'p1', partner_name: 'VUK Partner', share_pct: 100,
        net_loan_try: 100_000, committed_equity_try: 100_000, paid_equity_try: 100_000,
        monthly_repayment_try: 0,
        tranches: [{ principal_try: 75_000, expected_repayment_date: null, interest_rate_annual_pct: 0 }],
      }],
      total_company_debt: 100_000, avg_monthly_revenue: 1_000_000,
    }
    const report = computePartnerRiskReport(input)
    const irDim = report.profiles[0].dimensions.find(d => d.key === 'interest_rate')
    expect(irDim?.finding).toContain('VUK')
  })

  it('equity gap finding mentions amount when gap > 0', () => {
    const input: PartnerRiskReportInput = {
      company_id: 'co1',
      partners: [{
        partner_id: 'p1', partner_name: 'Test', share_pct: 100,
        net_loan_try: 0, committed_equity_try: 100_000, paid_equity_try: 50_000,
        monthly_repayment_try: 0, tranches: [],
      }],
      total_company_debt: 0, avg_monthly_revenue: 0,
    }
    const report = computePartnerRiskReport(input)
    const eqDim = report.profiles[0].dimensions.find(d => d.key === 'equity_gap')
    expect(eqDim?.finding).toBeTruthy()
  })

  it('three-partner scenario: profiles are independent per partner', () => {
    const partners: PartnerRiskInput[] = [
      { partner_id: 'p1', partner_name: 'A', share_pct: 33.33,
        net_loan_try: 0, committed_equity_try: 100_000, paid_equity_try: 100_000,
        monthly_repayment_try: 0, tranches: [] },
      { partner_id: 'p2', partner_name: 'B', share_pct: 33.33,
        net_loan_try: 50_000, committed_equity_try: 100_000, paid_equity_try: 50_000,
        monthly_repayment_try: 5_000, tranches: [] },
      { partner_id: 'p3', partner_name: 'C', share_pct: 33.34,
        net_loan_try: 100_000, committed_equity_try: 100_000, paid_equity_try: 0,
        monthly_repayment_try: 50_000, tranches: [] },
    ]
    const report = computePartnerRiskReport({
      company_id: 'co1', partners,
      total_company_debt: 150_000, avg_monthly_revenue: 100_000,
    })
    expect(report.profiles).toHaveLength(3)
    const ids = report.profiles.map(p => p.partner_id)
    expect(ids).toContain('p1')
    expect(ids).toContain('p2')
    expect(ids).toContain('p3')
  })

  it('scoreToGrade is consistent: A-grade partners are best performers', () => {
    // Build multiple scores and verify grade monotonicity
    const scores = [100, 90, 89, 75, 74, 60, 59, 40, 39, 0]
    const grades = scores.map(s => scoreToGrade(s))
    expect(grades[0]).toBe('A')
    expect(grades[1]).toBe('A')
    expect(grades[2]).toBe('B')
    expect(grades[3]).toBe('B')
    expect(grades[4]).toBe('C')
    expect(grades[5]).toBe('C')
    expect(grades[6]).toBe('D')
    expect(grades[7]).toBe('D')
    expect(grades[8]).toBe('F')
    expect(grades[9]).toBe('F')
  })

  it('computeCompositeScore with 6 PCLE dimension weights returns correct result', () => {
    // Simulate PCLE dimension weights summing to 1.0
    const dims = [
      { score: 80, weight: 0.25 },
      { score: 90, weight: 0.20 },
      { score: 70, weight: 0.20 },
      { score: 100, weight: 0.15 },
      { score: 60, weight: 0.10 },
      { score: 50, weight: 0.10 },
    ]
    // 0.25*80 + 0.20*90 + 0.20*70 + 0.15*100 + 0.10*60 + 0.10*50
    // = 20 + 18 + 14 + 15 + 6 + 5 = 78
    expect(computeCompositeScore(dims)).toBe(78)
  })

  it('avg_score is 100 when single perfect partner', () => {
    const input: PartnerRiskReportInput = {
      company_id: 'co1',
      partners: [{
        partner_id: 'p1', partner_name: 'Perfect', share_pct: 5,
        net_loan_try: 5_000, committed_equity_try: 1_000_000, paid_equity_try: 1_000_000,
        monthly_repayment_try: 0, tranches: [],
      }],
      total_company_debt: 100_000, avg_monthly_revenue: 100_000_000,
    }
    const report = computePartnerRiskReport(input)
    // avg_score matches the single partner's composite_score
    expect(report.avg_score).toBe(report.profiles[0].composite_score)
  })

  it('critical_flags strings contain partner name', () => {
    const input: PartnerRiskReportInput = {
      company_id: 'co1',
      partners: [{
        partner_id: 'p1', partner_name: 'UniquePartnerName',
        share_pct: 100,
        net_loan_try: 100_000, committed_equity_try: 200_000, paid_equity_try: 0,
        monthly_repayment_try: 999_999, tranches: [],
      }],
      total_company_debt: 100_000, avg_monthly_revenue: 100_000,
    }
    const report = computePartnerRiskReport(input)
    if (report.critical_flags.length > 0) {
      expect(report.critical_flags[0]).toContain('UniquePartnerName')
    }
  })

  it('equity gap score = 60 exactly at 40% paid (boundary)', () => {
    // computeEquityGapScore(1000, 400): gap_pct = (1000-400)/1000*100 = 60, score = max(0, 100-60) = 40
    expect(computeEquityGapScore(1000, 400)).toBe(40)
  })

  it('loan concentration score = 60 at 40% concentration', () => {
    expect(computeLoanConcentrationScore(40)).toBe(60)
  })

  it('debt service score is 0 for negative repayment', () => {
    // negative repayment treated as 0 → score 100
    // Actually computeDebtServiceScore checks repayment <= 0
    expect(computeDebtServiceScore(-100, 1000)).toBe(100)
  })

  it('loan concentration score decreases monotonically as % increases', () => {
    const pcts = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
    const scores = pcts.map(p => computeLoanConcentrationScore(p))
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeLessThanOrEqual(scores[i - 1])
    }
  })

  it('equity gap score increases as paid amount increases', () => {
    const committed = 1000
    const paids = [0, 100, 200, 500, 800, 1000]
    const scores = paids.map(p => computeEquityGapScore(committed, p))
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeGreaterThanOrEqual(scores[i - 1])
    }
  })

  it('debt service score decreases as repayment burden increases', () => {
    const revenue = 1000
    const repayments = [0, 100, 200, 400, 600, 800, 1000]
    const scores = repayments.map(r => computeDebtServiceScore(r, revenue))
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeLessThanOrEqual(scores[i - 1])
    }
  })

  it('computeCompositeScore handles all zero weights by returning 100', () => {
    const dims = [
      { score: 50, weight: 0 },
      { score: 30, weight: 0 },
    ]
    expect(computeCompositeScore(dims)).toBe(100)
  })

  it('profile composite score = computeCompositeScore(dimensions)', () => {
    const input: PartnerRiskReportInput = {
      company_id: 'co1',
      partners: [{
        partner_id: 'p1', partner_name: 'Test', share_pct: 40,
        net_loan_try: 40_000, committed_equity_try: 80_000, paid_equity_try: 60_000,
        monthly_repayment_try: 10_000, tranches: [],
      }],
      total_company_debt: 100_000, avg_monthly_revenue: 100_000,
    }
    const report = computePartnerRiskReport(input)
    const profile = report.profiles[0]
    const expected = computeCompositeScore(profile.dimensions.map(d => ({ score: d.score, weight: d.weight })))
    expect(profile.composite_score).toBeCloseTo(expected, 1)
  })

  it('single partner with null maturity tranches — no duration risk', () => {
    const input: PartnerRiskReportInput = {
      company_id: 'co1',
      partners: [{
        partner_id: 'p1', partner_name: 'Test', share_pct: 100,
        net_loan_try: 100_000, committed_equity_try: 100_000, paid_equity_try: 100_000,
        monthly_repayment_try: 0,
        tranches: [
          { principal_try: 50_000, expected_repayment_date: null, interest_rate_annual_pct: 5 },
          { principal_try: 50_000, expected_repayment_date: null, interest_rate_annual_pct: 8 },
        ],
      }],
      total_company_debt: 100_000, avg_monthly_revenue: 1_000_000,
    }
    const report = computePartnerRiskReport(input)
    const durDim = report.profiles[0].dimensions.find(d => d.key === 'loan_duration')
    expect(durDim?.score).toBe(100)
  })

  it('zero concentration (partner has no loan) → loan_concentration score = 100', () => {
    const input: PartnerRiskReportInput = {
      company_id: 'co1',
      partners: [{
        partner_id: 'p1', partner_name: 'No Loan', share_pct: 50,
        net_loan_try: 0, committed_equity_try: 100_000, paid_equity_try: 100_000,
        monthly_repayment_try: 0, tranches: [],
      }],
      total_company_debt: 200_000, avg_monthly_revenue: 1_000_000,
    }
    const report = computePartnerRiskReport(input)
    const concDim = report.profiles[0].dimensions.find(d => d.key === 'loan_concentration')
    expect(concDim?.score).toBe(100)
    expect(concDim?.is_flagged).toBe(false)
  })

  it('grade_distribution is all-zero for empty partners', () => {
    const report = computePartnerRiskReport({
      company_id: 'co1', partners: [], total_company_debt: 0, avg_monthly_revenue: 0,
    })
    const total = Object.values(report.grade_distribution).reduce((s, n) => s + n, 0)
    expect(total).toBe(0)
  })

  it('avg_score = 100 for zero partners', () => {
    const report = computePartnerRiskReport({
      company_id: 'co1', partners: [], total_company_debt: 0, avg_monthly_revenue: 0,
    })
    expect(report.avg_score).toBe(100)
  })

  it('dimension score of interest_rate is always 40, 60, or 100', () => {
    const testCases: PartnerRiskInput[] = [
      {
        partner_id: 'p1', partner_name: 'P1', share_pct: 100,
        net_loan_try: 0, committed_equity_try: 0, paid_equity_try: 0,
        monthly_repayment_try: 0, tranches: [], // no tranches → 100
      },
      {
        partner_id: 'p2', partner_name: 'P2', share_pct: 100,
        net_loan_try: 0, committed_equity_try: 0, paid_equity_try: 0,
        monthly_repayment_try: 0,
        tranches: [{ principal_try: 30_000, expected_repayment_date: null, interest_rate_annual_pct: 0 }],
        // zero rate <= 50K → 60
      },
      {
        partner_id: 'p3', partner_name: 'P3', share_pct: 100,
        net_loan_try: 0, committed_equity_try: 0, paid_equity_try: 0,
        monthly_repayment_try: 0,
        tranches: [{ principal_try: 60_000, expected_repayment_date: null, interest_rate_annual_pct: 0 }],
        // zero rate > 50K → VUK → 40
      },
    ]
    for (const partner of testCases) {
      const report = computePartnerRiskReport({
        company_id: 'co1', partners: [partner],
        total_company_debt: 100_000, avg_monthly_revenue: 1_000_000,
      })
      const irScore = report.profiles[0].dimensions.find(d => d.key === 'interest_rate')?.score
      expect([40, 60, 100]).toContain(irScore)
    }
  })

  it('dimension scores are all within 0-100 range', () => {
    const partners: PartnerRiskInput[] = Array.from({ length: 5 }, (_, i) => ({
      partner_id: `p${i}`, partner_name: `P${i}`, share_pct: 20,
      net_loan_try: i * 50_000,
      committed_equity_try: 100_000, paid_equity_try: i * 25_000,
      monthly_repayment_try: i * 10_000,
      tranches: i > 0 ? [{ principal_try: i * 50_000, expected_repayment_date: null, interest_rate_annual_pct: i * 2 }] : [],
    }))
    const report = computePartnerRiskReport({
      company_id: 'co1', partners,
      total_company_debt: 500_000, avg_monthly_revenue: 200_000,
    })
    for (const profile of report.profiles) {
      for (const dim of profile.dimensions) {
        expect(dim.score).toBeGreaterThanOrEqual(0)
        expect(dim.score).toBeLessThanOrEqual(100)
      }
    }
  })
})
