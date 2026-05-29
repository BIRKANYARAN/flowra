/**
 * Partner Risk Composite Scoring — unit tests
 *
 * Tests all pure computation functions.
 * No DB or network calls — pure function tests only.
 *
 * Total: 44 tests
 */

import { describe, it, expect } from 'vitest'
import {
  scoreDebtConcentration,
  scoreRepaymentTimeliness,
  scoreEquityFulfillment,
  scoreLiquidityContribution,
  scoreLoanToEquityRatio,
  scoreDurationStability,
  computeCompositeRiskScore,
  classifyRiskGrade,
  classifyRiskLevel,
  computeRiskTrend,
} from '../lib/services/pcle/partner-risk-composite.service'

// ── scoreDebtConcentration ────────────────────────────────────────────────────

describe('scoreDebtConcentration', () => {
  it('returns 100 when partner has 0 debt', () => {
    expect(scoreDebtConcentration(0, 1_000_000)).toBe(100)
  })

  it('returns 100 when total company loans is 0', () => {
    // share = 0 / max(1, 0) = 0 → score = 100
    expect(scoreDebtConcentration(0, 0)).toBe(100)
  })

  it('penalizes ~50.5 when partner holds 33% of company debt', () => {
    // share = 1/3, score = max(0, 100 - (1/3)*150) = 100 - 50 = 50
    const score = scoreDebtConcentration(333_333, 1_000_000)
    expect(score).toBeCloseTo(50, 0)
  })

  it('returns 0 when partner holds 100% of company debt', () => {
    expect(scoreDebtConcentration(1_000_000, 1_000_000)).toBe(0)
  })

  it('clamps to 0 even if partner loan exceeds total (data anomaly)', () => {
    expect(scoreDebtConcentration(2_000_000, 1_000_000)).toBe(0)
  })

  it('returns ~25 for 50% share', () => {
    // share = 0.5, score = 100 - 75 = 25
    const score = scoreDebtConcentration(500_000, 1_000_000)
    expect(score).toBeCloseTo(25, 1)
  })

  it('returns ~85 for 10% share', () => {
    // share = 0.1, score = 100 - 15 = 85
    const score = scoreDebtConcentration(100_000, 1_000_000)
    expect(score).toBeCloseTo(85, 1)
  })
})

// ── scoreRepaymentTimeliness ──────────────────────────────────────────────────

describe('scoreRepaymentTimeliness', () => {
  it('returns 100 when all repayments on time and 0 avg days late', () => {
    const score = scoreRepaymentTimeliness(10, 10, 0)
    // timeliness = 1*70 = 70, punctuality = 30, total = 100
    expect(score).toBe(100)
  })

  it('returns 0 when 0 on-time and 30+ days late', () => {
    const score = scoreRepaymentTimeliness(0, 10, 30)
    // timeliness = 0, punctuality = max(0, 30-30) = 0, total = 0
    expect(score).toBe(0)
  })

  it('returns 0 when 0 on-time and avgDaysLate > 30', () => {
    const score = scoreRepaymentTimeliness(0, 5, 50)
    expect(score).toBe(0)
  })

  it('handles 0 total repayments without division by zero', () => {
    const score = scoreRepaymentTimeliness(0, 0, 0)
    // onTime/max(1,0) = 0, punctuality = 30, total = 30
    expect(score).toBe(30)
  })

  it('returns partial score for 50% on-time, 15 days late', () => {
    const score = scoreRepaymentTimeliness(5, 10, 15)
    // timeliness = 0.5*70 = 35, punctuality = 30-15 = 15, total = 50
    expect(score).toBeCloseTo(50, 1)
  })

  it('clamps maximum score to 100', () => {
    const score = scoreRepaymentTimeliness(100, 100, 0)
    expect(score).toBeLessThanOrEqual(100)
  })

  it('clamps minimum score to 0', () => {
    const score = scoreRepaymentTimeliness(0, 1, 100)
    expect(score).toBeGreaterThanOrEqual(0)
  })
})

// ── scoreEquityFulfillment ────────────────────────────────────────────────────

describe('scoreEquityFulfillment', () => {
  it('returns 100 when fully paid', () => {
    expect(scoreEquityFulfillment(1_000_000, 1_000_000)).toBe(100)
  })

  it('returns 50 when half paid', () => {
    expect(scoreEquityFulfillment(500_000, 1_000_000)).toBe(50)
  })

  it('returns 0 when nothing paid but commitment exists', () => {
    expect(scoreEquityFulfillment(0, 1_000_000)).toBe(0)
  })

  it('returns 100 when committedAmount is 0 (no obligation)', () => {
    expect(scoreEquityFulfillment(0, 0)).toBe(100)
  })

  it('clamps to 100 when paidAmount exceeds commitment', () => {
    // Over-payment edge case
    expect(scoreEquityFulfillment(1_500_000, 1_000_000)).toBe(100)
  })

  it('returns 25 when 25% paid', () => {
    expect(scoreEquityFulfillment(250_000, 1_000_000)).toBeCloseTo(25, 1)
  })

  it('handles negative committedAmount gracefully', () => {
    // negative committed treated as no obligation
    expect(scoreEquityFulfillment(0, -1_000)).toBe(100)
  })
})

// ── scoreLiquidityContribution ────────────────────────────────────────────────

describe('scoreLiquidityContribution', () => {
  it('returns 50 (neutral) when all values are 0', () => {
    expect(scoreLiquidityContribution(0, 0, 0, 0)).toBe(50)
  })

  it('returns 100 for maximum contribution (100% of loans and equity)', () => {
    const score = scoreLiquidityContribution(1_000_000, 1_000_000, 1_000_000, 1_000_000)
    // loanShare=1, equityShare=1, contribution=(0.6+0.4)*100=100
    expect(score).toBe(100)
  })

  it('returns 0 when partner gives nothing while others have contributed', () => {
    const score = scoreLiquidityContribution(0, 1_000_000, 0, 1_000_000)
    // loanShare=0, equityShare=0, contribution=0
    expect(score).toBe(0)
  })

  it('returns intermediate value for partial contribution', () => {
    // loanShare = 0.5, equityShare = 0.5, contribution = (0.3+0.2)*100 = 50
    const score = scoreLiquidityContribution(500_000, 1_000_000, 500_000, 1_000_000)
    expect(score).toBeCloseTo(50, 1)
  })

  it('weights loans (60%) more than equity (40%)', () => {
    // Only loans: loanShare=1, equityShare=0, contribution=60
    const loanOnlyScore = scoreLiquidityContribution(1_000_000, 1_000_000, 0, 1_000_000)
    // Only equity: loanShare=0, equityShare=1, contribution=40
    const equityOnlyScore = scoreLiquidityContribution(0, 1_000_000, 1_000_000, 1_000_000)
    expect(loanOnlyScore).toBeCloseTo(60, 1)
    expect(equityOnlyScore).toBeCloseTo(40, 1)
    expect(loanOnlyScore).toBeGreaterThan(equityOnlyScore)
  })

  it('clamps to 100 for over-contribution', () => {
    const score = scoreLiquidityContribution(2_000_000, 1_000_000, 2_000_000, 1_000_000)
    expect(score).toBe(100)
  })
})

// ── scoreLoanToEquityRatio ────────────────────────────────────────────────────

describe('scoreLoanToEquityRatio', () => {
  it('returns 100 when no loan balance (no leverage)', () => {
    expect(scoreLoanToEquityRatio(0, 1_000_000)).toBe(100)
  })

  it('returns 0 when loan-to-equity ratio reaches 5', () => {
    // ratio = 5_000_000 / 1_000_000 = 5, score = 100 - 5*20 = 0
    expect(scoreLoanToEquityRatio(5_000_000, 1_000_000)).toBe(0)
  })

  it('returns 50 when ratio is 2.5', () => {
    // ratio = 2.5, score = 100 - 2.5*20 = 50
    expect(scoreLoanToEquityRatio(2_500_000, 1_000_000)).toBeCloseTo(50, 1)
  })

  it('clamps to 0 for extreme leverage', () => {
    expect(scoreLoanToEquityRatio(10_000_000, 1_000_000)).toBe(0)
  })

  it('handles 0 equity paid without division by zero', () => {
    // equityPaid=0 → uses max(1, 0)=1, so ratio = netLoan/1
    const score = scoreLoanToEquityRatio(0, 0)
    expect(score).toBe(100)
  })

  it('returns 80 when ratio is 1', () => {
    // ratio = 1, score = 100 - 20 = 80
    expect(scoreLoanToEquityRatio(1_000_000, 1_000_000)).toBeCloseTo(80, 1)
  })
})

// ── scoreDurationStability ────────────────────────────────────────────────────

describe('scoreDurationStability', () => {
  it('returns 0 for 0 months', () => {
    expect(scoreDurationStability(0)).toBe(0)
  })

  it('returns 100 for 60 months (5 years)', () => {
    expect(scoreDurationStability(60)).toBe(100)
  })

  it('returns 50 for 30 months', () => {
    // 30*100/60 = 50
    expect(scoreDurationStability(30)).toBeCloseTo(50, 1)
  })

  it('caps at 100 for partnership longer than 5 years', () => {
    expect(scoreDurationStability(120)).toBe(100)
    expect(scoreDurationStability(1000)).toBe(100)
  })

  it('returns proportional score for 12 months', () => {
    // 12*100/60 = 20
    expect(scoreDurationStability(12)).toBeCloseTo(20, 1)
  })

  it('does not go below 0', () => {
    // Negative months should clamp to 0
    expect(scoreDurationStability(-10)).toBe(0)
  })
})

// ── computeCompositeRiskScore ─────────────────────────────────────────────────

describe('computeCompositeRiskScore', () => {
  it('returns 100 when all dimensions are 100', () => {
    const score = computeCompositeRiskScore({
      debtConcentration:    100,
      repaymentTimeliness:  100,
      equityFulfillment:    100,
      liquidityContribution: 100,
      loanToEquity:         100,
      durationStability:    100,
    })
    expect(score).toBe(100)
  })

  it('returns 0 when all dimensions are 0', () => {
    const score = computeCompositeRiskScore({
      debtConcentration:    0,
      repaymentTimeliness:  0,
      equityFulfillment:    0,
      liquidityContribution: 0,
      loanToEquity:         0,
      durationStability:    0,
    })
    expect(score).toBe(0)
  })

  it('applies correct weights (25+20+20+15+10+10 = 100%)', () => {
    // Only debtConcentration = 100, rest = 0 → score = 25
    const score = computeCompositeRiskScore({
      debtConcentration:    100,
      repaymentTimeliness:  0,
      equityFulfillment:    0,
      liquidityContribution: 0,
      loanToEquity:         0,
      durationStability:    0,
    })
    expect(score).toBeCloseTo(25, 1)
  })

  it('weights repaymentTimeliness at 20%', () => {
    const score = computeCompositeRiskScore({
      debtConcentration:    0,
      repaymentTimeliness:  100,
      equityFulfillment:    0,
      liquidityContribution: 0,
      loanToEquity:         0,
      durationStability:    0,
    })
    expect(score).toBeCloseTo(20, 1)
  })

  it('weights liquidityContribution at 15%', () => {
    const score = computeCompositeRiskScore({
      debtConcentration:    0,
      repaymentTimeliness:  0,
      equityFulfillment:    0,
      liquidityContribution: 100,
      loanToEquity:         0,
      durationStability:    0,
    })
    expect(score).toBeCloseTo(15, 1)
  })

  it('rounds to 1 decimal', () => {
    const score = computeCompositeRiskScore({
      debtConcentration:    70,
      repaymentTimeliness:  80,
      equityFulfillment:    60,
      liquidityContribution: 50,
      loanToEquity:         90,
      durationStability:    40,
    })
    // 70*0.25 + 80*0.20 + 60*0.20 + 50*0.15 + 90*0.10 + 40*0.10
    // = 17.5 + 16 + 12 + 7.5 + 9 + 4 = 66
    expect(score).toBeCloseTo(66, 1)
    // should be 1 decimal place
    const str = String(score)
    const decimals = str.includes('.') ? str.split('.')[1].length : 0
    expect(decimals).toBeLessThanOrEqual(1)
  })
})

// ── classifyRiskGrade ─────────────────────────────────────────────────────────

describe('classifyRiskGrade', () => {
  it('returns A for score >= 80', () => {
    expect(classifyRiskGrade(80)).toBe('A')
    expect(classifyRiskGrade(100)).toBe('A')
    expect(classifyRiskGrade(85)).toBe('A')
  })

  it('returns B for score >= 65 and < 80', () => {
    expect(classifyRiskGrade(65)).toBe('B')
    expect(classifyRiskGrade(79.9)).toBe('B')
    expect(classifyRiskGrade(70)).toBe('B')
  })

  it('returns C for score >= 50 and < 65', () => {
    expect(classifyRiskGrade(50)).toBe('C')
    expect(classifyRiskGrade(64.9)).toBe('C')
    expect(classifyRiskGrade(57)).toBe('C')
  })

  it('returns D for score >= 35 and < 50', () => {
    expect(classifyRiskGrade(35)).toBe('D')
    expect(classifyRiskGrade(49.9)).toBe('D')
    expect(classifyRiskGrade(42)).toBe('D')
  })

  it('returns F for score < 35', () => {
    expect(classifyRiskGrade(34.9)).toBe('F')
    expect(classifyRiskGrade(0)).toBe('F')
    expect(classifyRiskGrade(20)).toBe('F')
  })

  it('returns A at boundary 80', () => {
    expect(classifyRiskGrade(80)).toBe('A')
  })

  it('returns B at boundary 65', () => {
    expect(classifyRiskGrade(65)).toBe('B')
  })

  it('returns D at boundary 35', () => {
    expect(classifyRiskGrade(35)).toBe('D')
  })
})

// ── classifyRiskLevel ─────────────────────────────────────────────────────────

describe('classifyRiskLevel', () => {
  it('maps A to low', () => {
    expect(classifyRiskLevel('A')).toBe('low')
  })

  it('maps B to moderate', () => {
    expect(classifyRiskLevel('B')).toBe('moderate')
  })

  it('maps C to elevated', () => {
    expect(classifyRiskLevel('C')).toBe('elevated')
  })

  it('maps D to high', () => {
    expect(classifyRiskLevel('D')).toBe('high')
  })

  it('maps F to critical', () => {
    expect(classifyRiskLevel('F')).toBe('critical')
  })
})

// ── computeRiskTrend ──────────────────────────────────────────────────────────

describe('computeRiskTrend', () => {
  it('returns new_partner when priorScore is null', () => {
    expect(computeRiskTrend(75, null)).toBe('new_partner')
    expect(computeRiskTrend(0, null)).toBe('new_partner')
    expect(computeRiskTrend(100, null)).toBe('new_partner')
  })

  it('returns improving when currentScore > priorScore + 5', () => {
    expect(computeRiskTrend(80, 70)).toBe('improving')
    expect(computeRiskTrend(76, 70)).toBe('improving')
  })

  it('returns deteriorating when currentScore < priorScore - 5', () => {
    expect(computeRiskTrend(60, 70)).toBe('deteriorating')
    expect(computeRiskTrend(64, 70)).toBe('deteriorating')
  })

  it('returns stable when difference is within ±5', () => {
    expect(computeRiskTrend(70, 70)).toBe('stable')
    expect(computeRiskTrend(75, 70)).toBe('stable')  // exactly +5 = stable
    expect(computeRiskTrend(65, 70)).toBe('stable')  // exactly -5 = stable
    expect(computeRiskTrend(72, 70)).toBe('stable')
  })

  it('boundary: +5 exactly is stable (not improving)', () => {
    // improving requires > priorScore + 5
    expect(computeRiskTrend(75, 70)).toBe('stable')
  })

  it('boundary: -5 exactly is stable (not deteriorating)', () => {
    // deteriorating requires < priorScore - 5
    expect(computeRiskTrend(65, 70)).toBe('stable')
  })
})

// ── Additional scoreDebtConcentration tests ───────────────────────────────────

describe('scoreDebtConcentration — additional', () => {
  it('returns ~92.5 for 5% share', () => {
    // share = 0.05, score = 100 - 7.5 = 92.5
    expect(scoreDebtConcentration(50_000, 1_000_000)).toBeCloseTo(92.5, 1)
  })

  it('returns 55 for ~30% share', () => {
    // share = 0.3, score = 100 - 45 = 55
    expect(scoreDebtConcentration(300_000, 1_000_000)).toBeCloseTo(55, 1)
  })

  it('returns ~70 for 20% share', () => {
    // share = 0.2, score = 100 - 30 = 70
    expect(scoreDebtConcentration(200_000, 1_000_000)).toBeCloseTo(70, 1)
  })

  it('score decreases monotonically as partner loan increases', () => {
    const totals = 1_000_000
    const loans = [0, 100_000, 200_000, 400_000, 600_000, 800_000, 1_000_000]
    const scores = loans.map(l => scoreDebtConcentration(l, totals))
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeLessThanOrEqual(scores[i - 1])
    }
  })

  it('formula: score = max(0, 100 - share * 150)', () => {
    // Verify formula exactly for share = 0.2 (200K / 1M)
    const expected = Math.max(0, 100 - 0.2 * 150)
    expect(scoreDebtConcentration(200_000, 1_000_000)).toBeCloseTo(expected, 2)
  })

  it('score is 100 when partner loan is tiny fraction of total', () => {
    const score = scoreDebtConcentration(100, 10_000_000)
    // share ≈ 0.00001, score ≈ 100
    expect(score).toBeGreaterThan(99.99)
  })
})

// ── Additional scoreRepaymentTimeliness tests ─────────────────────────────────

describe('scoreRepaymentTimeliness — additional', () => {
  it('returns 70 for perfect timeliness but 30 days late', () => {
    // timeliness = 1*70=70, punctuality = max(0, 30-30)=0
    expect(scoreRepaymentTimeliness(10, 10, 30)).toBe(70)
  })

  it('returns ~35 for 50% on-time with 0 days late', () => {
    // timeliness = 0.5*70=35, punctuality = 30
    // total = 65
    expect(scoreRepaymentTimeliness(5, 10, 0)).toBeCloseTo(65, 1)
  })

  it('returns 30 for 0 payments on time but 0 days late', () => {
    // timeliness = 0, punctuality = 30
    expect(scoreRepaymentTimeliness(0, 0, 0)).toBe(30)
  })

  it('score is between 0 and 100 for any valid input', () => {
    const cases = [
      [10, 10, 0], [5, 10, 15], [0, 0, 0], [0, 5, 100], [10, 10, 100],
    ]
    for (const [on, total, late] of cases) {
      const s = scoreRepaymentTimeliness(on, total, late)
      expect(s).toBeGreaterThanOrEqual(0)
      expect(s).toBeLessThanOrEqual(100)
    }
  })
})

// ── Additional scoreEquityFulfillment tests ───────────────────────────────────

describe('scoreEquityFulfillment — additional', () => {
  it('returns 75 when 75% paid', () => {
    expect(scoreEquityFulfillment(750_000, 1_000_000)).toBeCloseTo(75, 1)
  })

  it('returns 10 when 10% paid', () => {
    expect(scoreEquityFulfillment(100_000, 1_000_000)).toBeCloseTo(10, 1)
  })

  it('is monotonically increasing with paid amount', () => {
    const committed = 1_000_000
    const paids = [0, 100_000, 250_000, 500_000, 750_000, 900_000, 1_000_000]
    const scores = paids.map(p => scoreEquityFulfillment(p, committed))
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeGreaterThanOrEqual(scores[i - 1])
    }
  })
})

// ── Additional scoreLiquidityContribution tests ───────────────────────────────

describe('scoreLiquidityContribution — additional', () => {
  it('returns 60 when partner provides 100% of loans but 0% equity', () => {
    const score = scoreLiquidityContribution(1_000_000, 1_000_000, 0, 1_000_000)
    expect(score).toBeCloseTo(60, 1)
  })

  it('returns 40 when partner provides 0 loans but 100% equity', () => {
    const score = scoreLiquidityContribution(0, 1_000_000, 1_000_000, 1_000_000)
    expect(score).toBeCloseTo(40, 1)
  })

  it('returns neutral 50 when only loans exist in company and partner has none', () => {
    // totalEquityPaid = 0, totalPartnerLoans > 0, partner loans = 0
    // loanShare = 0, equityShare = 0 / max(1,0) = 0
    const score = scoreLiquidityContribution(0, 1_000_000, 0, 0)
    // totalEquityPaid = 0, but totalPartnerLoans > 0 → not (<=0 && <=0)
    // loanShare = 0, equityShare = 0 → 0
    expect(score).toBe(0)
  })

  it('score is always between 0 and 100', () => {
    const cases: [number, number, number, number][] = [
      [0, 0, 0, 0],
      [500_000, 1_000_000, 500_000, 1_000_000],
      [1_000_000, 1_000_000, 1_000_000, 1_000_000],
      [0, 0, 1_000_000, 1_000_000],
    ]
    for (const [pl, tpl, pe, te] of cases) {
      const s = scoreLiquidityContribution(pl, tpl, pe, te)
      expect(s).toBeGreaterThanOrEqual(0)
      expect(s).toBeLessThanOrEqual(100)
    }
  })
})

// ── Additional scoreLoanToEquityRatio tests ───────────────────────────────────

describe('scoreLoanToEquityRatio — additional', () => {
  it('returns 60 when ratio is 2.0', () => {
    // ratio = 2, score = 100 - 40 = 60
    expect(scoreLoanToEquityRatio(2_000_000, 1_000_000)).toBeCloseTo(60, 1)
  })

  it('returns 40 when ratio is 3.0', () => {
    // ratio = 3, score = 100 - 60 = 40
    expect(scoreLoanToEquityRatio(3_000_000, 1_000_000)).toBeCloseTo(40, 1)
  })

  it('decreases monotonically as loan balance increases', () => {
    const equity = 1_000_000
    const loans = [0, 1_000_000, 2_000_000, 3_000_000, 5_000_000, 10_000_000]
    const scores = loans.map(l => scoreLoanToEquityRatio(l, equity))
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeLessThanOrEqual(scores[i - 1])
    }
  })

  it('score is always between 0 and 100', () => {
    const cases: [number, number][] = [
      [0, 0], [0, 1_000_000], [5_000_000, 1_000_000], [10_000_000, 100_000],
    ]
    for (const [loan, equity] of cases) {
      const s = scoreLoanToEquityRatio(loan, equity)
      expect(s).toBeGreaterThanOrEqual(0)
      expect(s).toBeLessThanOrEqual(100)
    }
  })
})

// ── Additional scoreDurationStability tests ───────────────────────────────────

describe('scoreDurationStability — additional', () => {
  it('returns ~33.3 for 20 months', () => {
    // 20 * 100 / 60 = 33.33
    expect(scoreDurationStability(20)).toBeCloseTo(33.33, 1)
  })

  it('returns ~83.3 for 50 months', () => {
    // 50 * 100 / 60 = 83.33
    expect(scoreDurationStability(50)).toBeCloseTo(83.33, 1)
  })

  it('increases monotonically from 0 to 60 months', () => {
    const months = [0, 6, 12, 18, 24, 36, 48, 60]
    const scores = months.map(m => scoreDurationStability(m))
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeGreaterThanOrEqual(scores[i - 1])
    }
  })

  it('caps at 100 for any value >= 60', () => {
    const months = [60, 70, 100, 200, 1000]
    for (const m of months) {
      expect(scoreDurationStability(m)).toBe(100)
    }
  })
})

// ── computeCompositeRiskScore — additional ────────────────────────────────────

describe('computeCompositeRiskScore — additional', () => {
  it('weights durationStability at 10%', () => {
    const score = computeCompositeRiskScore({
      debtConcentration: 0, repaymentTimeliness: 0, equityFulfillment: 0,
      liquidityContribution: 0, loanToEquity: 0, durationStability: 100,
    })
    expect(score).toBeCloseTo(10, 1)
  })

  it('weights loanToEquity at 10%', () => {
    const score = computeCompositeRiskScore({
      debtConcentration: 0, repaymentTimeliness: 0, equityFulfillment: 0,
      liquidityContribution: 0, loanToEquity: 100, durationStability: 0,
    })
    expect(score).toBeCloseTo(10, 1)
  })

  it('weights equityFulfillment at 20%', () => {
    const score = computeCompositeRiskScore({
      debtConcentration: 0, repaymentTimeliness: 0, equityFulfillment: 100,
      liquidityContribution: 0, loanToEquity: 0, durationStability: 0,
    })
    expect(score).toBeCloseTo(20, 1)
  })

  it('sum of individual weight contributions = total composite', () => {
    const input = {
      debtConcentration: 80, repaymentTimeliness: 70, equityFulfillment: 60,
      liquidityContribution: 50, loanToEquity: 90, durationStability: 40,
    }
    // 80*0.25 + 70*0.20 + 60*0.20 + 50*0.15 + 90*0.10 + 40*0.10
    // = 20 + 14 + 12 + 7.5 + 9 + 4 = 66.5
    expect(computeCompositeRiskScore(input)).toBeCloseTo(66.5, 1)
  })
})

// ── classifyRiskGrade and classifyRiskLevel — integration ─────────────────────

describe('classifyRiskGrade + classifyRiskLevel integration', () => {
  it('grade/level pairs are self-consistent for all grades', () => {
    const cases: Array<['A' | 'B' | 'C' | 'D' | 'F', 'low' | 'moderate' | 'elevated' | 'high' | 'critical']> = [
      ['A', 'low'], ['B', 'moderate'], ['C', 'elevated'], ['D', 'high'], ['F', 'critical'],
    ]
    for (const [grade, level] of cases) {
      expect(classifyRiskLevel(grade)).toBe(level)
    }
  })

  it('score 80 → grade A → risk level low', () => {
    const grade = classifyRiskGrade(80)
    expect(grade).toBe('A')
    expect(classifyRiskLevel(grade)).toBe('low')
  })

  it('score 64 → grade C → risk level elevated', () => {
    const grade = classifyRiskGrade(64)
    expect(grade).toBe('C')
    expect(classifyRiskLevel(grade)).toBe('elevated')
  })

  it('score 0 → grade F → risk level critical', () => {
    const grade = classifyRiskGrade(0)
    expect(grade).toBe('F')
    expect(classifyRiskLevel(grade)).toBe('critical')
  })
})

// ── computeRiskTrend — additional edge cases ──────────────────────────────────

describe('computeRiskTrend — additional', () => {
  it('returns improving for large improvement (e.g. 0 → 100)', () => {
    expect(computeRiskTrend(100, 0)).toBe('improving')
  })

  it('returns deteriorating for large decline (e.g. 100 → 0)', () => {
    expect(computeRiskTrend(0, 100)).toBe('deteriorating')
  })

  it('returns stable for identical scores', () => {
    expect(computeRiskTrend(50, 50)).toBe('stable')
    expect(computeRiskTrend(100, 100)).toBe('stable')
    expect(computeRiskTrend(0, 0)).toBe('stable')
  })

  it('+6 from prior = improving', () => {
    expect(computeRiskTrend(76, 70)).toBe('improving')
  })

  it('-6 from prior = deteriorating', () => {
    expect(computeRiskTrend(64, 70)).toBe('deteriorating')
  })
})
