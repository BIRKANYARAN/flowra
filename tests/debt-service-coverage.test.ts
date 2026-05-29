/**
 * DebtServiceCoverageService — pure-logic unit tests
 *
 * Covers all exported pure functions:
 *   computeMonthlyInterest
 *   computeMonthlyDebtService
 *   computeDscr
 *   classifyDscrHealth
 *   computeInterestCoverageRatio
 *   classifyInterestCoverage
 *   computeDebtBurdenRatio
 *   classifyDebtBurden
 *   computeLoanToEquityRatio
 *   estimateLoanRunoffDate
 *   computeDebtConcentration
 *   computeMonthlyDebtServiceRatio
 *   classifyMonthlyDebtServiceRatio
 *   computeWeightedAvgInterestRate
 *   computeMaturityProfile
 *   generateDebtServiceNarrative
 *
 * Run: npx vitest run tests/debt-service-coverage.test.ts
 */

import { describe, it, expect } from 'vitest'
import {
  computeMonthlyInterest,
  computeMonthlyDebtService,
  computeDscr,
  classifyDscrHealth,
  computeInterestCoverageRatio,
  classifyInterestCoverage,
  computeDebtBurdenRatio,
  classifyDebtBurden,
  computeLoanToEquityRatio,
  estimateLoanRunoffDate,
  computeDebtConcentration,
  computeMonthlyDebtServiceRatio,
  classifyMonthlyDebtServiceRatio,
  computeWeightedAvgInterestRate,
  computeMaturityProfile,
  generateDebtServiceNarrative,
} from '../lib/services/pcle/debt-service-coverage.service'

// ── computeMonthlyInterest ────────────────────────────────────────────────────

describe('computeMonthlyInterest', () => {
  it('basic: 120,000 TRY at 24% annual → 2,400 TRY monthly', () => {
    // 120000 × 24 / 100 / 12 = 2400
    expect(computeMonthlyInterest(120_000, 24)).toBeCloseTo(2400, 4)
  })

  it('12% annual on 60,000 → 600 monthly', () => {
    expect(computeMonthlyInterest(60_000, 12)).toBeCloseTo(600, 4)
  })

  it('zero rate → 0', () => {
    expect(computeMonthlyInterest(100_000, 0)).toBe(0)
  })

  it('zero principal → 0', () => {
    expect(computeMonthlyInterest(0, 24)).toBe(0)
  })

  it('negative principal → 0', () => {
    expect(computeMonthlyInterest(-50_000, 20)).toBe(0)
  })

  it('negative rate → 0', () => {
    expect(computeMonthlyInterest(100_000, -5)).toBe(0)
  })

  it('large principal: 10M TRY at 36% → 300,000 monthly', () => {
    expect(computeMonthlyInterest(10_000_000, 36)).toBeCloseTo(300_000, 2)
  })

  it('fractional rate: 15.5% on 100,000 → ~1291.67 monthly', () => {
    expect(computeMonthlyInterest(100_000, 15.5)).toBeCloseTo(1291.67, 1)
  })
})

// ── computeMonthlyDebtService ─────────────────────────────────────────────────

describe('computeMonthlyDebtService', () => {
  it('sums interest + principal repayment', () => {
    expect(computeMonthlyDebtService(2400, 5000)).toBe(7400)
  })

  it('zero principal repayment → equals interest only', () => {
    expect(computeMonthlyDebtService(2400, 0)).toBe(2400)
  })

  it('zero interest + zero principal → 0', () => {
    expect(computeMonthlyDebtService(0, 0)).toBe(0)
  })

  it('large values sum correctly', () => {
    expect(computeMonthlyDebtService(50_000, 200_000)).toBe(250_000)
  })
})

// ── computeDscr ───────────────────────────────────────────────────────────────

describe('computeDscr', () => {
  it('zero annualDebtService → null', () => {
    expect(computeDscr(500_000, 0)).toBeNull()
  })

  it('negative annualDebtService → null', () => {
    expect(computeDscr(500_000, -10_000)).toBeNull()
  })

  it('EBITDA 2x annual debt service → 2.0', () => {
    expect(computeDscr(200_000, 100_000)).toBeCloseTo(2.0, 4)
  })

  it('EBITDA < annual debt service → < 1.0 (distressed)', () => {
    const dscr = computeDscr(80_000, 100_000)
    expect(dscr).not.toBeNull()
    expect(dscr!).toBeCloseTo(0.8, 4)
  })

  it('EBITDA = annual debt service → exactly 1.0', () => {
    expect(computeDscr(100_000, 100_000)).toBeCloseTo(1.0, 4)
  })

  it('negative EBITDA → negative DSCR (distressed)', () => {
    const dscr = computeDscr(-50_000, 100_000)
    expect(dscr).not.toBeNull()
    expect(dscr!).toBeLessThan(0)
  })

  it('high DSCR (healthy company)', () => {
    const dscr = computeDscr(1_000_000, 100_000)
    expect(dscr!).toBeCloseTo(10.0, 4)
  })
})

// ── classifyDscrHealth ────────────────────────────────────────────────────────

describe('classifyDscrHealth', () => {
  it('null → insufficient_data', () => {
    expect(classifyDscrHealth(null)).toBe('insufficient_data')
  })

  it('exactly 2.0 → strong', () => {
    expect(classifyDscrHealth(2.0)).toBe('strong')
  })

  it('above 2.0 → strong', () => {
    expect(classifyDscrHealth(3.5)).toBe('strong')
  })

  it('1.99 → adequate', () => {
    expect(classifyDscrHealth(1.99)).toBe('adequate')
  })

  it('exactly 1.5 → adequate', () => {
    expect(classifyDscrHealth(1.5)).toBe('adequate')
  })

  it('1.49 → tight', () => {
    expect(classifyDscrHealth(1.49)).toBe('tight')
  })

  it('exactly 1.25 → tight', () => {
    expect(classifyDscrHealth(1.25)).toBe('tight')
  })

  it('1.24 → stressed', () => {
    expect(classifyDscrHealth(1.24)).toBe('stressed')
  })

  it('exactly 1.0 → stressed', () => {
    expect(classifyDscrHealth(1.0)).toBe('stressed')
  })

  it('0.99 → distressed', () => {
    expect(classifyDscrHealth(0.99)).toBe('distressed')
  })

  it('0.0 → distressed', () => {
    expect(classifyDscrHealth(0.0)).toBe('distressed')
  })

  it('negative → distressed', () => {
    expect(classifyDscrHealth(-1.0)).toBe('distressed')
  })
})

// ── computeInterestCoverageRatio ──────────────────────────────────────────────

describe('computeInterestCoverageRatio', () => {
  it('zero interest expense → null', () => {
    expect(computeInterestCoverageRatio(500_000, 0)).toBeNull()
  })

  it('negative interest expense → null', () => {
    expect(computeInterestCoverageRatio(500_000, -5_000)).toBeNull()
  })

  it('EBIT 3x annual interest → 3.0', () => {
    expect(computeInterestCoverageRatio(300_000, 100_000)).toBeCloseTo(3.0, 4)
  })

  it('negative EBIT → negative ICR', () => {
    const icr = computeInterestCoverageRatio(-50_000, 100_000)
    expect(icr).not.toBeNull()
    expect(icr!).toBeLessThan(0)
  })

  it('EBIT = interest → 1.0', () => {
    expect(computeInterestCoverageRatio(100_000, 100_000)).toBeCloseTo(1.0, 4)
  })

  it('high ICR (excellent scenario)', () => {
    const icr = computeInterestCoverageRatio(1_000_000, 50_000)
    expect(icr!).toBeCloseTo(20.0, 4)
  })

  it('EBIT < interest → < 1.0 (critical)', () => {
    const icr = computeInterestCoverageRatio(80_000, 100_000)
    expect(icr!).toBeCloseTo(0.8, 4)
  })
})

// ── classifyInterestCoverage ──────────────────────────────────────────────────

describe('classifyInterestCoverage', () => {
  it('null → insufficient_data', () => {
    expect(classifyInterestCoverage(null)).toBe('insufficient_data')
  })

  it('exactly 5.0 → excellent', () => {
    expect(classifyInterestCoverage(5.0)).toBe('excellent')
  })

  it('above 5.0 → excellent', () => {
    expect(classifyInterestCoverage(10.0)).toBe('excellent')
  })

  it('4.99 → good', () => {
    expect(classifyInterestCoverage(4.99)).toBe('good')
  })

  it('exactly 3.0 → good', () => {
    expect(classifyInterestCoverage(3.0)).toBe('good')
  })

  it('2.99 → adequate', () => {
    expect(classifyInterestCoverage(2.99)).toBe('adequate')
  })

  it('exactly 2.0 → adequate', () => {
    expect(classifyInterestCoverage(2.0)).toBe('adequate')
  })

  it('1.99 → weak', () => {
    expect(classifyInterestCoverage(1.99)).toBe('weak')
  })

  it('exactly 1.0 → weak', () => {
    expect(classifyInterestCoverage(1.0)).toBe('weak')
  })

  it('0.99 → critical', () => {
    expect(classifyInterestCoverage(0.99)).toBe('critical')
  })

  it('0.0 → critical', () => {
    expect(classifyInterestCoverage(0.0)).toBe('critical')
  })

  it('negative → critical', () => {
    expect(classifyInterestCoverage(-5.0)).toBe('critical')
  })
})

// ── computeDebtBurdenRatio ────────────────────────────────────────────────────

describe('computeDebtBurdenRatio', () => {
  it('zero revenue → null', () => {
    expect(computeDebtBurdenRatio(500_000, 0)).toBeNull()
  })

  it('negative revenue → null', () => {
    expect(computeDebtBurdenRatio(500_000, -100_000)).toBeNull()
  })

  it('debt = 50% of revenue → 0.5', () => {
    expect(computeDebtBurdenRatio(500_000, 1_000_000)).toBeCloseTo(0.5, 4)
  })

  it('zero debt → 0.0', () => {
    expect(computeDebtBurdenRatio(0, 1_000_000)).toBeCloseTo(0.0, 4)
  })

  it('debt = revenue → 1.0', () => {
    expect(computeDebtBurdenRatio(1_000_000, 1_000_000)).toBeCloseTo(1.0, 4)
  })

  it('debt > revenue → > 1.0 (critical)', () => {
    const ratio = computeDebtBurdenRatio(1_500_000, 1_000_000)
    expect(ratio!).toBeCloseTo(1.5, 4)
  })
})

// ── classifyDebtBurden ────────────────────────────────────────────────────────

describe('classifyDebtBurden', () => {
  it('null → insufficient_data', () => {
    expect(classifyDebtBurden(null)).toBe('insufficient_data')
  })

  it('0.05 → minimal', () => {
    expect(classifyDebtBurden(0.05)).toBe('minimal')
  })

  it('exactly 0.10 boundary — 0.099 → minimal', () => {
    expect(classifyDebtBurden(0.099)).toBe('minimal')
  })

  it('exactly 0.10 → manageable', () => {
    expect(classifyDebtBurden(0.10)).toBe('manageable')
  })

  it('0.20 → manageable', () => {
    expect(classifyDebtBurden(0.20)).toBe('manageable')
  })

  it('0.249 → manageable', () => {
    expect(classifyDebtBurden(0.249)).toBe('manageable')
  })

  it('exactly 0.25 → moderate', () => {
    expect(classifyDebtBurden(0.25)).toBe('moderate')
  })

  it('0.40 → moderate', () => {
    expect(classifyDebtBurden(0.40)).toBe('moderate')
  })

  it('0.499 → moderate', () => {
    expect(classifyDebtBurden(0.499)).toBe('moderate')
  })

  it('exactly 0.50 → heavy', () => {
    expect(classifyDebtBurden(0.50)).toBe('heavy')
  })

  it('0.80 → heavy', () => {
    expect(classifyDebtBurden(0.80)).toBe('heavy')
  })

  it('0.999 → heavy', () => {
    expect(classifyDebtBurden(0.999)).toBe('heavy')
  })

  it('exactly 1.0 → critical', () => {
    expect(classifyDebtBurden(1.0)).toBe('critical')
  })

  it('above 1.0 → critical', () => {
    expect(classifyDebtBurden(2.5)).toBe('critical')
  })
})

// ── computeLoanToEquityRatio ──────────────────────────────────────────────────

describe('computeLoanToEquityRatio', () => {
  it('zero equity → null', () => {
    expect(computeLoanToEquityRatio(500_000, 0)).toBeNull()
  })

  it('negative equity → null', () => {
    expect(computeLoanToEquityRatio(500_000, -100_000)).toBeNull()
  })

  it('loans = equity → 1.0', () => {
    expect(computeLoanToEquityRatio(500_000, 500_000)).toBeCloseTo(1.0, 4)
  })

  it('zero loans → 0.0', () => {
    expect(computeLoanToEquityRatio(0, 500_000)).toBeCloseTo(0.0, 4)
  })

  it('loans 2x equity → 2.0', () => {
    expect(computeLoanToEquityRatio(1_000_000, 500_000)).toBeCloseTo(2.0, 4)
  })

  it('loans < equity → < 1.0', () => {
    const ratio = computeLoanToEquityRatio(200_000, 500_000)
    expect(ratio!).toBeCloseTo(0.4, 4)
  })
})

// ── estimateLoanRunoffDate ────────────────────────────────────────────────────

describe('estimateLoanRunoffDate', () => {
  it('zero debt → null', () => {
    expect(estimateLoanRunoffDate(0, 10_000)).toBeNull()
  })

  it('negative debt → null', () => {
    expect(estimateLoanRunoffDate(-5_000, 10_000)).toBeNull()
  })

  it('zero pace → null', () => {
    expect(estimateLoanRunoffDate(100_000, 0)).toBeNull()
  })

  it('negative pace → null', () => {
    expect(estimateLoanRunoffDate(100_000, -5_000)).toBeNull()
  })

  it('normal: 120k debt at 10k/month → 12 months', () => {
    const result = estimateLoanRunoffDate(120_000, 10_000)
    expect(result).not.toBeNull()
    expect(result!.months).toBe(12)
  })

  it('ceil rounding: 121k debt at 10k/month → 13 months', () => {
    const result = estimateLoanRunoffDate(121_000, 10_000)
    expect(result).not.toBeNull()
    expect(result!.months).toBe(13)
  })

  it('ceil rounding: exact division 100k at 50k/month → 2 months', () => {
    const result = estimateLoanRunoffDate(100_000, 50_000)
    expect(result).not.toBeNull()
    expect(result!.months).toBe(2)
  })

  it('returns estimated_date as YYYY-MM-DD string', () => {
    const result = estimateLoanRunoffDate(120_000, 10_000)
    expect(result).not.toBeNull()
    expect(result!.estimated_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('estimated_date day is always 01 (first of month)', () => {
    const result = estimateLoanRunoffDate(120_000, 10_000)
    expect(result).not.toBeNull()
    expect(result!.estimated_date).toMatch(/-01$/)
  })

  it('fractional pace: 100k at 33k/month → 4 months (ceil(3.03))', () => {
    const result = estimateLoanRunoffDate(100_000, 33_000)
    expect(result).not.toBeNull()
    expect(result!.months).toBe(4) // ceil(100000/33000) = ceil(3.03) = 4
  })
})

// ── computeDebtConcentration ──────────────────────────────────────────────────

describe('computeDebtConcentration', () => {
  it('empty array → null', () => {
    expect(computeDebtConcentration([])).toBeNull()
  })

  it('all zero balances → null', () => {
    expect(computeDebtConcentration([
      { partner_id: 'p1', net_loan_try: 0 },
      { partner_id: 'p2', net_loan_try: 0 },
    ])).toBeNull()
  })

  it('single partner → 100%', () => {
    expect(computeDebtConcentration([
      { partner_id: 'p1', net_loan_try: 500_000 },
    ])).toBeCloseTo(100, 4)
  })

  it('two equal partners → 50%', () => {
    expect(computeDebtConcentration([
      { partner_id: 'p1', net_loan_try: 250_000 },
      { partner_id: 'p2', net_loan_try: 250_000 },
    ])).toBeCloseTo(50, 4)
  })

  it('3 partners with 60/30/10 split → top partner 60%', () => {
    const result = computeDebtConcentration([
      { partner_id: 'p1', net_loan_try: 600_000 },
      { partner_id: 'p2', net_loan_try: 300_000 },
      { partner_id: 'p3', net_loan_try: 100_000 },
    ])
    expect(result!).toBeCloseTo(60, 4)
  })

  it('dominant partner with 80% → returns ~80%', () => {
    const result = computeDebtConcentration([
      { partner_id: 'p1', net_loan_try: 800_000 },
      { partner_id: 'p2', net_loan_try: 200_000 },
    ])
    expect(result!).toBeCloseTo(80, 4)
  })
})

// ── computeMonthlyDebtServiceRatio ────────────────────────────────────────────

describe('computeMonthlyDebtServiceRatio', () => {
  it('zero revenue → null', () => {
    expect(computeMonthlyDebtServiceRatio(10_000, 0)).toBeNull()
  })

  it('negative revenue → null', () => {
    expect(computeMonthlyDebtServiceRatio(10_000, -50_000)).toBeNull()
  })

  it('10k service on 100k revenue → 10%', () => {
    expect(computeMonthlyDebtServiceRatio(10_000, 100_000)).toBeCloseTo(10, 4)
  })

  it('zero service → 0%', () => {
    expect(computeMonthlyDebtServiceRatio(0, 100_000)).toBeCloseTo(0, 4)
  })

  it('service = revenue → 100%', () => {
    expect(computeMonthlyDebtServiceRatio(100_000, 100_000)).toBeCloseTo(100, 4)
  })

  it('service > revenue → > 100%', () => {
    const ratio = computeMonthlyDebtServiceRatio(150_000, 100_000)
    expect(ratio!).toBeCloseTo(150, 4)
  })
})

// ── classifyMonthlyDebtServiceRatio ──────────────────────────────────────────

describe('classifyMonthlyDebtServiceRatio', () => {
  it('null → insufficient_data', () => {
    expect(classifyMonthlyDebtServiceRatio(null)).toBe('insufficient_data')
  })

  it('5% → healthy', () => {
    expect(classifyMonthlyDebtServiceRatio(5)).toBe('healthy')
  })

  it('0% → healthy', () => {
    expect(classifyMonthlyDebtServiceRatio(0)).toBe('healthy')
  })

  it('9.99% → healthy', () => {
    expect(classifyMonthlyDebtServiceRatio(9.99)).toBe('healthy')
  })

  it('exactly 10% → manageable', () => {
    expect(classifyMonthlyDebtServiceRatio(10)).toBe('manageable')
  })

  it('15% → manageable', () => {
    expect(classifyMonthlyDebtServiceRatio(15)).toBe('manageable')
  })

  it('19.99% → manageable', () => {
    expect(classifyMonthlyDebtServiceRatio(19.99)).toBe('manageable')
  })

  it('exactly 20% → elevated', () => {
    expect(classifyMonthlyDebtServiceRatio(20)).toBe('elevated')
  })

  it('25% → elevated', () => {
    expect(classifyMonthlyDebtServiceRatio(25)).toBe('elevated')
  })

  it('34.99% → elevated', () => {
    expect(classifyMonthlyDebtServiceRatio(34.99)).toBe('elevated')
  })

  it('exactly 35% → high', () => {
    expect(classifyMonthlyDebtServiceRatio(35)).toBe('high')
  })

  it('45% → high', () => {
    expect(classifyMonthlyDebtServiceRatio(45)).toBe('high')
  })

  it('49.99% → high', () => {
    expect(classifyMonthlyDebtServiceRatio(49.99)).toBe('high')
  })

  it('exactly 50% → critical', () => {
    expect(classifyMonthlyDebtServiceRatio(50)).toBe('critical')
  })

  it('75% → critical', () => {
    expect(classifyMonthlyDebtServiceRatio(75)).toBe('critical')
  })

  it('above 100% → critical', () => {
    expect(classifyMonthlyDebtServiceRatio(120)).toBe('critical')
  })
})

// ── computeWeightedAvgInterestRate ────────────────────────────────────────────

describe('computeWeightedAvgInterestRate', () => {
  it('empty array → null', () => {
    expect(computeWeightedAvgInterestRate([])).toBeNull()
  })

  it('all zero principals → null', () => {
    expect(computeWeightedAvgInterestRate([
      { principal: 0, annual_rate_pct: 20 },
      { principal: 0, annual_rate_pct: 30 },
    ])).toBeNull()
  })

  it('single tranche → returns its rate', () => {
    expect(computeWeightedAvgInterestRate([
      { principal: 100_000, annual_rate_pct: 25 },
    ])).toBeCloseTo(25, 4)
  })

  it('two equal tranches with same rate → that rate', () => {
    expect(computeWeightedAvgInterestRate([
      { principal: 100_000, annual_rate_pct: 20 },
      { principal: 100_000, annual_rate_pct: 20 },
    ])).toBeCloseTo(20, 4)
  })

  it('two equal tranches with different rates → average of both', () => {
    expect(computeWeightedAvgInterestRate([
      { principal: 100_000, annual_rate_pct: 10 },
      { principal: 100_000, annual_rate_pct: 30 },
    ])).toBeCloseTo(20, 4)
  })

  it('weighted correctly: 200k@10% + 100k@40% → weighted avg = 20%', () => {
    // (200k×10 + 100k×40) / 300k = (2000 + 4000) / 300k = 6000/300k = 20%
    expect(computeWeightedAvgInterestRate([
      { principal: 200_000, annual_rate_pct: 10 },
      { principal: 100_000, annual_rate_pct: 40 },
    ])).toBeCloseTo(20, 4)
  })

  it('three tranches weighted correctly', () => {
    // 500k@12% + 300k@24% + 200k@36%
    // = (500*12 + 300*24 + 200*36) / 1000k
    // = (6000 + 7200 + 7200) / 1000000
    // = 20400 / 1000000 = 20.4%
    expect(computeWeightedAvgInterestRate([
      { principal: 500_000, annual_rate_pct: 12 },
      { principal: 300_000, annual_rate_pct: 24 },
      { principal: 200_000, annual_rate_pct: 36 },
    ])).toBeCloseTo(20.4, 4)
  })
})

// ── computeMaturityProfile ────────────────────────────────────────────────────

describe('computeMaturityProfile', () => {
  const today = new Date()

  function addDays(date: Date, days: number): string {
    const d = new Date(date)
    d.setDate(d.getDate() + days)
    return d.toISOString().substring(0, 10)
  }

  function subtractDays(date: Date, days: number): string {
    return addDays(date, -days)
  }

  it('empty array → all empty buckets', () => {
    const result = computeMaturityProfile([])
    expect(result.due_within_90_days).toHaveLength(0)
    expect(result.due_within_1_year).toHaveLength(0)
    expect(result.due_beyond_1_year).toHaveLength(0)
    expect(result.no_due_date).toHaveLength(0)
  })

  it('null expected_repayment_date → no_due_date bucket', () => {
    const result = computeMaturityProfile([
      { tranche_id: 't1', partner_name: 'Partner A', principal: 100_000, expected_repayment_date: null },
    ])
    expect(result.no_due_date).toHaveLength(1)
    expect(result.no_due_date[0].tranche_id).toBe('t1')
    expect(result.due_within_90_days).toHaveLength(0)
    expect(result.due_within_1_year).toHaveLength(0)
    expect(result.due_beyond_1_year).toHaveLength(0)
  })

  it('past date (overdue) → due_within_90_days with days_to_maturity = 0', () => {
    const pastDate = subtractDays(today, 30)
    const result = computeMaturityProfile([
      { tranche_id: 't1', partner_name: 'Partner A', principal: 200_000, expected_repayment_date: pastDate },
    ])
    expect(result.due_within_90_days).toHaveLength(1)
    expect(result.due_within_90_days[0].days_to_maturity).toBe(0)
    expect(result.due_within_1_year).toHaveLength(0)
  })

  it('due in 30 days → due_within_90_days', () => {
    const date30 = addDays(today, 30)
    const result = computeMaturityProfile([
      { tranche_id: 't1', partner_name: 'P1', principal: 100_000, expected_repayment_date: date30 },
    ])
    expect(result.due_within_90_days).toHaveLength(1)
    expect(result.due_within_90_days[0].days_to_maturity).toBeGreaterThanOrEqual(29)
    expect(result.due_within_90_days[0].days_to_maturity).toBeLessThanOrEqual(31)
  })

  it('due in 180 days → due_within_1_year (not in 90-day bucket)', () => {
    const date180 = addDays(today, 180)
    const result = computeMaturityProfile([
      { tranche_id: 't1', partner_name: 'P1', principal: 100_000, expected_repayment_date: date180 },
    ])
    expect(result.due_within_1_year).toHaveLength(1)
    expect(result.due_within_90_days).toHaveLength(0)
  })

  it('due in 400 days → due_beyond_1_year', () => {
    const date400 = addDays(today, 400)
    const result = computeMaturityProfile([
      { tranche_id: 't1', partner_name: 'P1', principal: 100_000, expected_repayment_date: date400 },
    ])
    expect(result.due_beyond_1_year).toHaveLength(1)
    expect(result.due_within_90_days).toHaveLength(0)
    expect(result.due_within_1_year).toHaveLength(0)
  })

  it('no duplicates between 90-day and 1-year buckets', () => {
    const date30  = addDays(today, 30)
    const date180 = addDays(today, 180)
    const result = computeMaturityProfile([
      { tranche_id: 't1', partner_name: 'P1', principal: 100_000, expected_repayment_date: date30 },
      { tranche_id: 't2', partner_name: 'P2', principal: 200_000, expected_repayment_date: date180 },
    ])
    const allIds = [
      ...result.due_within_90_days.map(t => t.tranche_id),
      ...result.due_within_1_year.map(t => t.tranche_id),
      ...result.due_beyond_1_year.map(t => t.tranche_id),
      ...result.no_due_date.map(t => t.tranche_id),
    ]
    const uniqueIds = new Set(allIds)
    expect(uniqueIds.size).toBe(allIds.length) // no duplicates
  })

  it('3-bucket separation with 4 tranches across all buckets', () => {
    const pastDate  = subtractDays(today, 10)
    const date60    = addDays(today, 60)
    const date200   = addDays(today, 200)
    const date500   = addDays(today, 500)

    const result = computeMaturityProfile([
      { tranche_id: 't1', partner_name: 'P1', principal: 50_000,  expected_repayment_date: pastDate },
      { tranche_id: 't2', partner_name: 'P2', principal: 100_000, expected_repayment_date: date60 },
      { tranche_id: 't3', partner_name: 'P3', principal: 200_000, expected_repayment_date: date200 },
      { tranche_id: 't4', partner_name: 'P4', principal: 300_000, expected_repayment_date: date500 },
    ])
    expect(result.due_within_90_days).toHaveLength(2) // past + 60-day
    expect(result.due_within_1_year).toHaveLength(1)  // 200-day
    expect(result.due_beyond_1_year).toHaveLength(1)  // 500-day
    expect(result.no_due_date).toHaveLength(0)
  })

  it('mixed: some null + some due dates', () => {
    const date30 = addDays(today, 30)
    const result = computeMaturityProfile([
      { tranche_id: 't1', partner_name: 'P1', principal: 100_000, expected_repayment_date: null },
      { tranche_id: 't2', partner_name: 'P2', principal: 200_000, expected_repayment_date: date30 },
    ])
    expect(result.no_due_date).toHaveLength(1)
    expect(result.due_within_90_days).toHaveLength(1)
  })

  it('preserves tranche data: partner_name and principal in correct bucket', () => {
    const date30 = addDays(today, 30)
    const result = computeMaturityProfile([
      { tranche_id: 'abc-123', partner_name: 'Ahmet Bey', principal: 750_000, expected_repayment_date: date30 },
    ])
    const entry = result.due_within_90_days[0]
    expect(entry.partner_name).toBe('Ahmet Bey')
    expect(entry.principal).toBe(750_000)
    expect(entry.tranche_id).toBe('abc-123')
  })
})

// ── generateDebtServiceNarrative ─────────────────────────────────────────────

describe('generateDebtServiceNarrative', () => {
  it('returns a non-empty string', () => {
    const result = generateDebtServiceNarrative({
      dscr: 1.8,
      dscrHealth: 'adequate',
      totalDebt: 500_000,
      monthlyDebtService: 20_000,
      runoffMonths: 25,
    })
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('contains DSCR value when provided', () => {
    const result = generateDebtServiceNarrative({
      dscr: 2.5,
      dscrHealth: 'strong',
      totalDebt: 300_000,
      monthlyDebtService: 10_000,
      runoffMonths: 30,
    })
    expect(result).toContain('2.50')
  })

  it('contains Turkish text when DSCR is null', () => {
    const result = generateDebtServiceNarrative({
      dscr: null,
      dscrHealth: 'insufficient_data',
      totalDebt: 100_000,
      monthlyDebtService: 5_000,
      runoffMonths: null,
    })
    expect(result).toContain('hesaplanamadı')
  })

  it('mentions runoff months when available', () => {
    const result = generateDebtServiceNarrative({
      dscr: 1.2,
      dscrHealth: 'tight',
      totalDebt: 240_000,
      monthlyDebtService: 10_000,
      runoffMonths: 24,
    })
    expect(result).toContain('24')
  })

  it('handles zero debt gracefully (Turkish text for no debt)', () => {
    const result = generateDebtServiceNarrative({
      dscr: null,
      dscrHealth: 'insufficient_data',
      totalDebt: 0,
      monthlyDebtService: 0,
      runoffMonths: null,
    })
    expect(result.length).toBeGreaterThan(0)
    // Should mention no active debt
    expect(result).toContain('bulunmamaktadır')
  })

  it('stressed health label reflected in output', () => {
    const result = generateDebtServiceNarrative({
      dscr: 1.0,
      dscrHealth: 'stressed',
      totalDebt: 500_000,
      monthlyDebtService: 20_000,
      runoffMonths: 25,
    })
    expect(result).toContain('stresli')
  })

  it('distressed health label reflected in output', () => {
    const result = generateDebtServiceNarrative({
      dscr: 0.7,
      dscrHealth: 'distressed',
      totalDebt: 1_000_000,
      monthlyDebtService: 50_000,
      runoffMonths: 20,
    })
    expect(result).toContain('kritik')
  })
})
