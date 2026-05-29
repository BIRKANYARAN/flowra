/**
 * Partner Capital Statement Service — pure-logic unit tests
 *
 * Tests for all exported pure functions:
 *   computeUnpaidCapital, computeCapitalFulfillmentPct,
 *   computeNetEquityPosition, computeLoanToEquityRatio,
 *   classifyCapitalFulfillment, classifyLoanBurden,
 *   computePartnerCapitalLine, buildCapitalSummary,
 *   classifyCompanyCapitalHealth, generateCapitalNarrative,
 *   computeCapitalCallAmount, rankPartnersByLoanBurden
 *
 * Run: npx vitest run tests/partner-capital-statement.test.ts
 */

import { describe, it, expect } from 'vitest'
import {
  computeUnpaidCapital,
  computeCapitalFulfillmentPct,
  computeNetEquityPosition,
  computeLoanToEquityRatio,
  classifyCapitalFulfillment,
  classifyLoanBurden,
  computePartnerCapitalLine,
  buildCapitalSummary,
  classifyCompanyCapitalHealth,
  generateCapitalNarrative,
  computeCapitalCallAmount,
  rankPartnersByLoanBurden,
  type PartnerCapitalLine,
  type CapitalStatementSummary,
} from '../lib/services/pcle/partner-capital-statement.service'

// ── computeUnpaidCapital ──────────────────────────────────────────────────────

describe('computeUnpaidCapital', () => {
  it('normal: committed > paid returns the difference', () => {
    expect(computeUnpaidCapital(100_000, 60_000)).toBe(40_000)
  })

  it('fully paid: committed === paid returns 0', () => {
    expect(computeUnpaidCapital(100_000, 100_000)).toBe(0)
  })

  it('overpaid: paid > committed clamps to 0 (no negative unpaid)', () => {
    expect(computeUnpaidCapital(100_000, 120_000)).toBe(0)
  })

  it('zero committed, zero paid: returns 0', () => {
    expect(computeUnpaidCapital(0, 0)).toBe(0)
  })

  it('zero committed, positive paid: clamps to 0', () => {
    expect(computeUnpaidCapital(0, 50_000)).toBe(0)
  })

  it('large numbers: 5 000 000 - 3 750 000 = 1 250 000', () => {
    expect(computeUnpaidCapital(5_000_000, 3_750_000)).toBe(1_250_000)
  })

  it('fractional amounts are rounded to 2 decimals', () => {
    expect(computeUnpaidCapital(100.999, 50.333)).toBeCloseTo(50.67, 2)
  })

  it('zero paid: returns full committed amount', () => {
    expect(computeUnpaidCapital(200_000, 0)).toBe(200_000)
  })
})

// ── computeCapitalFulfillmentPct ──────────────────────────────────────────────

describe('computeCapitalFulfillmentPct', () => {
  it('zero committed: returns 100 (fully funded by convention)', () => {
    expect(computeCapitalFulfillmentPct(0, 0)).toBe(100)
  })

  it('zero committed, non-zero paid: returns 100', () => {
    expect(computeCapitalFulfillmentPct(50_000, 0)).toBe(100)
  })

  it('50% paid: returns 50', () => {
    expect(computeCapitalFulfillmentPct(50_000, 100_000)).toBe(50)
  })

  it('fully paid: returns 100', () => {
    expect(computeCapitalFulfillmentPct(100_000, 100_000)).toBe(100)
  })

  it('overpaid: clamps to 100 (cannot exceed 100)', () => {
    expect(computeCapitalFulfillmentPct(120_000, 100_000)).toBe(100)
  })

  it('25% paid: returns 25', () => {
    expect(computeCapitalFulfillmentPct(25_000, 100_000)).toBe(25)
  })

  it('90% paid: returns 90', () => {
    expect(computeCapitalFulfillmentPct(90_000, 100_000)).toBe(90)
  })

  it('zero paid: returns 0', () => {
    expect(computeCapitalFulfillmentPct(0, 100_000)).toBe(0)
  })

  it('small fraction: 1 000 / 300 000 ≈ 0.33%', () => {
    expect(computeCapitalFulfillmentPct(1_000, 300_000)).toBeCloseTo(0.33, 1)
  })
})

// ── computeNetEquityPosition ──────────────────────────────────────────────────

describe('computeNetEquityPosition', () => {
  it('positive position: paid > loans + unpaid', () => {
    expect(computeNetEquityPosition(500_000, 100_000, 50_000)).toBe(350_000)
  })

  it('zero loans and zero unpaid: returns paid capital', () => {
    expect(computeNetEquityPosition(300_000, 0, 0)).toBe(300_000)
  })

  it('negative position: loans exceed paid capital', () => {
    expect(computeNetEquityPosition(100_000, 200_000, 0)).toBe(-100_000)
  })

  it('negative with all three non-zero', () => {
    expect(computeNetEquityPosition(100_000, 60_000, 80_000)).toBe(-40_000)
  })

  it('all zeros: returns 0', () => {
    expect(computeNetEquityPosition(0, 0, 0)).toBe(0)
  })

  it('result is rounded to 2 decimals', () => {
    expect(computeNetEquityPosition(100.333, 50.111, 20.111)).toBeCloseTo(30.11, 2)
  })

  it('large numbers: 10M - 4M - 2M = 4M', () => {
    expect(computeNetEquityPosition(10_000_000, 4_000_000, 2_000_000)).toBe(4_000_000)
  })
})

// ── computeLoanToEquityRatio ──────────────────────────────────────────────────

describe('computeLoanToEquityRatio', () => {
  it('returns null when paid capital is zero', () => {
    expect(computeLoanToEquityRatio(100_000, 0)).toBeNull()
  })

  it('returns null when both are zero', () => {
    expect(computeLoanToEquityRatio(0, 0)).toBeNull()
  })

  it('no debt: returns 0 ratio', () => {
    expect(computeLoanToEquityRatio(0, 500_000)).toBe(0)
  })

  it('equal loan and equity: ratio = 1.0', () => {
    expect(computeLoanToEquityRatio(500_000, 500_000)).toBe(1)
  })

  it('loan > equity: ratio > 1', () => {
    expect(computeLoanToEquityRatio(1_000_000, 500_000)).toBe(2)
  })

  it('loan < equity: ratio < 1', () => {
    expect(computeLoanToEquityRatio(250_000, 500_000)).toBe(0.5)
  })

  it('fractional result is rounded to 2 decimals', () => {
    expect(computeLoanToEquityRatio(100_000, 300_000)).toBeCloseTo(0.33, 2)
  })

  it('large ratio: 10M loans / 1M equity = 10.0', () => {
    expect(computeLoanToEquityRatio(10_000_000, 1_000_000)).toBe(10)
  })
})

// ── classifyCapitalFulfillment ────────────────────────────────────────────────

describe('classifyCapitalFulfillment', () => {
  it('100%: complete', () => {
    expect(classifyCapitalFulfillment(100)).toBe('complete')
  })

  it('above 100%: complete (clamped tier)', () => {
    expect(classifyCapitalFulfillment(110)).toBe('complete')
  })

  it('exactly 90%: near_complete', () => {
    expect(classifyCapitalFulfillment(90)).toBe('near_complete')
  })

  it('95%: near_complete', () => {
    expect(classifyCapitalFulfillment(95)).toBe('near_complete')
  })

  it('99.9%: near_complete (just below 100)', () => {
    expect(classifyCapitalFulfillment(99.9)).toBe('near_complete')
  })

  it('exactly 50%: partial', () => {
    expect(classifyCapitalFulfillment(50)).toBe('partial')
  })

  it('75%: partial', () => {
    expect(classifyCapitalFulfillment(75)).toBe('partial')
  })

  it('89.9%: partial (just below near_complete threshold)', () => {
    expect(classifyCapitalFulfillment(89.9)).toBe('partial')
  })

  it('exactly 25%: low', () => {
    expect(classifyCapitalFulfillment(25)).toBe('low')
  })

  it('40%: low', () => {
    expect(classifyCapitalFulfillment(40)).toBe('low')
  })

  it('49.9%: low (just below partial)', () => {
    expect(classifyCapitalFulfillment(49.9)).toBe('low')
  })

  it('0%: critical', () => {
    expect(classifyCapitalFulfillment(0)).toBe('critical')
  })

  it('10%: critical', () => {
    expect(classifyCapitalFulfillment(10)).toBe('critical')
  })

  it('24.9%: critical (just below low)', () => {
    expect(classifyCapitalFulfillment(24.9)).toBe('critical')
  })
})

// ── classifyLoanBurden ────────────────────────────────────────────────────────

describe('classifyLoanBurden', () => {
  it('null ratio: no_debt', () => {
    expect(classifyLoanBurden(null)).toBe('no_debt')
  })

  it('zero ratio: no_debt', () => {
    expect(classifyLoanBurden(0)).toBe('no_debt')
  })

  it('exactly 0.5: low', () => {
    expect(classifyLoanBurden(0.5)).toBe('low')
  })

  it('0.1: low', () => {
    expect(classifyLoanBurden(0.1)).toBe('low')
  })

  it('0.25: low', () => {
    expect(classifyLoanBurden(0.25)).toBe('low')
  })

  it('exactly 1.0: moderate', () => {
    expect(classifyLoanBurden(1.0)).toBe('moderate')
  })

  it('0.75: moderate', () => {
    expect(classifyLoanBurden(0.75)).toBe('moderate')
  })

  it('0.51: moderate (just above low threshold)', () => {
    expect(classifyLoanBurden(0.51)).toBe('moderate')
  })

  it('exactly 2.0: high', () => {
    expect(classifyLoanBurden(2.0)).toBe('high')
  })

  it('1.5: high', () => {
    expect(classifyLoanBurden(1.5)).toBe('high')
  })

  it('1.01: high (just above moderate)', () => {
    expect(classifyLoanBurden(1.01)).toBe('high')
  })

  it('2.01: severe (just above high threshold)', () => {
    expect(classifyLoanBurden(2.01)).toBe('severe')
  })

  it('5.0: severe', () => {
    expect(classifyLoanBurden(5)).toBe('severe')
  })

  it('10.0: severe', () => {
    expect(classifyLoanBurden(10)).toBe('severe')
  })
})

// ── computePartnerCapitalLine ─────────────────────────────────────────────────

describe('computePartnerCapitalLine', () => {
  const PARTNER = { id: 'p1', name: 'Ali Veli', share_pct: 50 }

  it('builds a complete line with all computed fields', () => {
    const line = computePartnerCapitalLine(PARTNER, 500_000, 400_000, 100_000, 5_000, 50_000)
    expect(line.partner_id).toBe('p1')
    expect(line.partner_name).toBe('Ali Veli')
    expect(line.share_pct).toBe(50)
    expect(line.committed_capital_try).toBe(500_000)
    expect(line.paid_capital_try).toBe(400_000)
    expect(line.unpaid_capital_try).toBe(100_000)
    expect(line.outstanding_loans_try).toBe(100_000)
    expect(line.accrued_interest_try).toBe(5_000)
    expect(line.total_distributions_try).toBe(50_000)
    expect(line.net_equity_position_try).toBe(200_000) // 400k - 100k - 100k
    expect(line.capital_fulfillment_pct).toBe(80)
    expect(line.loan_to_equity_ratio).toBe(0.25)
  })

  it('zero committed: fulfillment is 100, unpaid is 0', () => {
    const line = computePartnerCapitalLine(PARTNER, 0, 0, 0, 0, 0)
    expect(line.capital_fulfillment_pct).toBe(100)
    expect(line.unpaid_capital_try).toBe(0)
    expect(line.loan_to_equity_ratio).toBeNull()
  })

  it('fully funded partner: fulfillment 100, unpaid 0', () => {
    const line = computePartnerCapitalLine(PARTNER, 200_000, 200_000, 0, 0, 0)
    expect(line.capital_fulfillment_pct).toBe(100)
    expect(line.unpaid_capital_try).toBe(0)
    expect(line.loan_to_equity_ratio).toBe(0)
  })

  it('negative net position when loans exceed paid capital', () => {
    const line = computePartnerCapitalLine(PARTNER, 100_000, 50_000, 200_000, 0, 0)
    expect(line.net_equity_position_try).toBe(-200_000) // 50k - 200k - 50k
  })

  it('loan_to_equity_ratio is null when paid capital is zero', () => {
    const line = computePartnerCapitalLine(PARTNER, 100_000, 0, 50_000, 0, 0)
    expect(line.loan_to_equity_ratio).toBeNull()
  })

  it('overpaid capital: fulfillment clamped at 100, unpaid = 0', () => {
    const line = computePartnerCapitalLine(PARTNER, 100_000, 150_000, 0, 0, 0)
    expect(line.capital_fulfillment_pct).toBe(100)
    expect(line.unpaid_capital_try).toBe(0)
  })
})

// ── buildCapitalSummary ───────────────────────────────────────────────────────

describe('buildCapitalSummary', () => {
  it('empty array: all zeros and weighted avg 0', () => {
    const summary = buildCapitalSummary([])
    expect(summary.total_paid_capital_try).toBe(0)
    expect(summary.total_committed_capital_try).toBe(0)
    expect(summary.total_outstanding_loans_try).toBe(0)
    expect(summary.total_distributions_try).toBe(0)
    expect(summary.company_equity_try).toBe(0)
    expect(summary.weighted_avg_fulfillment_pct).toBe(0)
  })

  it('single partner: sums equal partner values', () => {
    const line = computePartnerCapitalLine(
      { id: 'p1', name: 'A', share_pct: 100 },
      200_000, 180_000, 50_000, 0, 20_000,
    )
    const summary = buildCapitalSummary([line])
    expect(summary.total_paid_capital_try).toBe(180_000)
    expect(summary.total_committed_capital_try).toBe(200_000)
    expect(summary.total_outstanding_loans_try).toBe(50_000)
    expect(summary.total_distributions_try).toBe(20_000)
    expect(summary.company_equity_try).toBe(180_000)
    expect(summary.weighted_avg_fulfillment_pct).toBe(90)
  })

  it('two equal-share partners: weighted avg is arithmetic average', () => {
    const l1 = computePartnerCapitalLine({ id: 'p1', name: 'A', share_pct: 50 }, 100_000, 100_000, 0, 0, 0)
    const l2 = computePartnerCapitalLine({ id: 'p2', name: 'B', share_pct: 50 }, 100_000, 50_000, 0, 0, 0)
    const summary = buildCapitalSummary([l1, l2])
    // l1: 100%, l2: 50% — weighted avg = (100×50 + 50×50) / 100 = 75
    expect(summary.weighted_avg_fulfillment_pct).toBe(75)
    expect(summary.total_paid_capital_try).toBe(150_000)
    expect(summary.total_committed_capital_try).toBe(200_000)
  })

  it('two unequal-share partners: weighted avg reflects share weight', () => {
    // 70/30 split, both fully funded → 100%
    const l1 = computePartnerCapitalLine({ id: 'p1', name: 'A', share_pct: 70 }, 100_000, 100_000, 0, 0, 0)
    const l2 = computePartnerCapitalLine({ id: 'p2', name: 'B', share_pct: 30 }, 100_000, 100_000, 0, 0, 0)
    const summary = buildCapitalSummary([l1, l2])
    expect(summary.weighted_avg_fulfillment_pct).toBe(100)
  })

  it('unequal shares with different fulfillment levels', () => {
    // 70% share: 100% fulfillment, 30% share: 0% fulfillment
    // weighted avg = (100×70 + 0×30) / 100 = 70
    const l1 = computePartnerCapitalLine({ id: 'p1', name: 'A', share_pct: 70 }, 100_000, 100_000, 0, 0, 0)
    const l2 = computePartnerCapitalLine({ id: 'p2', name: 'B', share_pct: 30 }, 100_000, 0, 0, 0, 0)
    const summary = buildCapitalSummary([l1, l2])
    expect(summary.weighted_avg_fulfillment_pct).toBe(70)
  })

  it('company_equity_try equals sum of paid_capital_try', () => {
    const l1 = computePartnerCapitalLine({ id: 'p1', name: 'A', share_pct: 60 }, 300_000, 250_000, 0, 0, 0)
    const l2 = computePartnerCapitalLine({ id: 'p2', name: 'B', share_pct: 40 }, 200_000, 175_000, 0, 0, 0)
    const summary = buildCapitalSummary([l1, l2])
    expect(summary.company_equity_try).toBe(425_000)
    expect(summary.company_equity_try).toBe(summary.total_paid_capital_try)
  })

  it('aggregates distributions across all partners', () => {
    const l1 = computePartnerCapitalLine({ id: 'p1', name: 'A', share_pct: 50 }, 100_000, 100_000, 0, 0, 30_000)
    const l2 = computePartnerCapitalLine({ id: 'p2', name: 'B', share_pct: 50 }, 100_000, 100_000, 0, 0, 20_000)
    const summary = buildCapitalSummary([l1, l2])
    expect(summary.total_distributions_try).toBe(50_000)
  })
})

// ── classifyCompanyCapitalHealth ──────────────────────────────────────────────

describe('classifyCompanyCapitalHealth', () => {
  function makeSummary(
    fulfillment: number,
    loans: number = 0,
    equity: number = 1_000_000,
  ): CapitalStatementSummary {
    return {
      total_paid_capital_try:       equity,
      total_committed_capital_try:  equity,
      total_outstanding_loans_try:  loans,
      total_distributions_try:      0,
      company_equity_try:           equity,
      weighted_avg_fulfillment_pct: fulfillment,
    }
  }

  it('partnerCount 0: always critical', () => {
    expect(classifyCompanyCapitalHealth(makeSummary(100, 0), 0)).toBe('critical')
  })

  it('partnerCount 0 even with high fulfillment: critical', () => {
    expect(classifyCompanyCapitalHealth(makeSummary(100, 0, 5_000_000), 0)).toBe('critical')
  })

  it('excellent: fulfillment >=90% AND loan ratio <=0.5', () => {
    // 90% fulfillment, loans = 400k on 1M equity = 0.4 ratio
    expect(classifyCompanyCapitalHealth(makeSummary(90, 400_000), 2)).toBe('excellent')
  })

  it('excellent: 100% fulfillment, no debt', () => {
    expect(classifyCompanyCapitalHealth(makeSummary(100, 0), 3)).toBe('excellent')
  })

  it('good: 90%+ fulfillment but loan ratio >0.5 drops to good', () => {
    // 95% fulfillment, loans = 600k on 1M equity = 0.6 ratio
    expect(classifyCompanyCapitalHealth(makeSummary(95, 600_000), 2)).toBe('good')
  })

  it('good: 75% fulfillment, loan ratio <=1.0', () => {
    expect(classifyCompanyCapitalHealth(makeSummary(75, 900_000), 2)).toBe('good')
  })

  it('fair: 75%+ fulfillment but loan ratio >1 drops to fair', () => {
    // 80% fulfillment, loans = 1.2M on 1M equity = 1.2 ratio
    expect(classifyCompanyCapitalHealth(makeSummary(80, 1_200_000), 2)).toBe('fair')
  })

  it('fair: exactly 50% fulfillment', () => {
    expect(classifyCompanyCapitalHealth(makeSummary(50, 0), 2)).toBe('fair')
  })

  it('poor: exactly 25% fulfillment', () => {
    expect(classifyCompanyCapitalHealth(makeSummary(25, 0), 2)).toBe('poor')
  })

  it('poor: 40% fulfillment', () => {
    expect(classifyCompanyCapitalHealth(makeSummary(40, 0), 2)).toBe('poor')
  })

  it('critical: 0% fulfillment', () => {
    expect(classifyCompanyCapitalHealth(makeSummary(0, 0), 2)).toBe('critical')
  })

  it('critical: 24.9% fulfillment', () => {
    expect(classifyCompanyCapitalHealth(makeSummary(24.9, 0), 2)).toBe('critical')
  })

  it('uses 1 as denominator when equity is 0 (avoids div by zero)', () => {
    const summary: CapitalStatementSummary = {
      total_paid_capital_try:       0,
      total_committed_capital_try:  100_000,
      total_outstanding_loans_try:  0,
      total_distributions_try:      0,
      company_equity_try:           0,
      weighted_avg_fulfillment_pct: 95,
    }
    // 0 loans / max(0,1) equity = 0 ratio → excellent with 95% fulfillment
    expect(classifyCompanyCapitalHealth(summary, 2)).toBe('excellent')
  })
})

// ── generateCapitalNarrative ──────────────────────────────────────────────────

describe('generateCapitalNarrative', () => {
  const SUMMARY: CapitalStatementSummary = {
    total_paid_capital_try:       1_000_000,
    total_committed_capital_try:  1_000_000,
    total_outstanding_loans_try:  0,
    total_distributions_try:      0,
    company_equity_try:           1_000_000,
    weighted_avg_fulfillment_pct: 100,
  }

  it('excellent: returns Turkish excellent message', () => {
    const text = generateCapitalNarrative('excellent', SUMMARY, 2)
    expect(text).toContain('sağlıklı')
    expect(typeof text).toBe('string')
    expect(text.length).toBeGreaterThan(10)
  })

  it('good: returns Turkish good message', () => {
    const text = generateCapitalNarrative('good', SUMMARY, 2)
    expect(text).toContain('makul')
    expect(typeof text).toBe('string')
  })

  it('fair: returns Turkish fair message', () => {
    const text = generateCapitalNarrative('fair', SUMMARY, 2)
    expect(text).toContain('takip')
    expect(typeof text).toBe('string')
  })

  it('poor: returns Turkish poor message', () => {
    const text = generateCapitalNarrative('poor', SUMMARY, 2)
    expect(text).toContain('açığı')
    expect(typeof text).toBe('string')
  })

  it('critical: returns Turkish critical message', () => {
    const text = generateCapitalNarrative('critical', SUMMARY, 0)
    expect(text).toContain('Kritik')
    expect(typeof text).toBe('string')
  })

  it('all 5 levels produce distinct strings', () => {
    const messages = [
      generateCapitalNarrative('excellent', SUMMARY, 2),
      generateCapitalNarrative('good', SUMMARY, 2),
      generateCapitalNarrative('fair', SUMMARY, 2),
      generateCapitalNarrative('poor', SUMMARY, 2),
      generateCapitalNarrative('critical', SUMMARY, 0),
    ]
    const unique = new Set(messages)
    expect(unique.size).toBe(5)
  })

  it('all messages are non-empty strings', () => {
    const levels = ['excellent', 'good', 'fair', 'poor', 'critical'] as const
    for (const level of levels) {
      const msg = generateCapitalNarrative(level, SUMMARY, 2)
      expect(typeof msg).toBe('string')
      expect(msg.length).toBeGreaterThan(0)
    }
  })
})

// ── computeCapitalCallAmount ──────────────────────────────────────────────────

describe('computeCapitalCallAmount', () => {
  it('50% call on 100k unpaid: returns 50k', () => {
    expect(computeCapitalCallAmount(200_000, 100_000, 50)).toBe(50_000)
  })

  it('100% call on full unpaid amount', () => {
    expect(computeCapitalCallAmount(500_000, 300_000, 100)).toBe(200_000)
  })

  it('0% call: returns 0', () => {
    expect(computeCapitalCallAmount(500_000, 300_000, 0)).toBe(0)
  })

  it('fully paid: unpaid is 0, call returns 0', () => {
    expect(computeCapitalCallAmount(100_000, 100_000, 50)).toBe(0)
  })

  it('overpaid: unpaid clamped to 0, call returns 0', () => {
    expect(computeCapitalCallAmount(100_000, 150_000, 100)).toBe(0)
  })

  it('25% call on 400k unpaid: returns 100k', () => {
    expect(computeCapitalCallAmount(1_000_000, 600_000, 25)).toBe(100_000)
  })

  it('fractional callPct: 33.33% of 300k ≈ 99 999.xx', () => {
    expect(computeCapitalCallAmount(300_000, 0, 33.33)).toBeCloseTo(99_990, 0)
  })

  it('zero committed and zero paid: returns 0', () => {
    expect(computeCapitalCallAmount(0, 0, 100)).toBe(0)
  })

  it('callPct 10% on 1M unpaid: returns 100k', () => {
    expect(computeCapitalCallAmount(2_000_000, 1_000_000, 10)).toBe(100_000)
  })
})

// ── rankPartnersByLoanBurden ──────────────────────────────────────────────────

describe('rankPartnersByLoanBurden', () => {
  function makeSimpleLine(id: string, loans: number, paid: number = 500_000): PartnerCapitalLine {
    return computePartnerCapitalLine(
      { id, name: `Partner ${id}`, share_pct: 33.33 },
      paid, paid, loans, 0, 0,
    )
  }

  it('empty array: returns empty array', () => {
    expect(rankPartnersByLoanBurden([])).toEqual([])
  })

  it('single partner: returns array with same element', () => {
    const line = makeSimpleLine('p1', 100_000)
    const ranked = rankPartnersByLoanBurden([line])
    expect(ranked).toHaveLength(1)
    expect(ranked[0].partner_id).toBe('p1')
  })

  it('sorts by outstanding_loans DESC (highest loans first)', () => {
    const lines = [
      makeSimpleLine('p1', 100_000),
      makeSimpleLine('p2', 300_000),
      makeSimpleLine('p3', 50_000),
    ]
    const ranked = rankPartnersByLoanBurden(lines)
    expect(ranked[0].partner_id).toBe('p2')
    expect(ranked[1].partner_id).toBe('p1')
    expect(ranked[2].partner_id).toBe('p3')
  })

  it('partner with zero loans goes to end', () => {
    const lines = [
      makeSimpleLine('p1', 0),
      makeSimpleLine('p2', 500_000),
      makeSimpleLine('p3', 200_000),
    ]
    const ranked = rankPartnersByLoanBurden(lines)
    expect(ranked[0].partner_id).toBe('p2')
    expect(ranked[2].partner_id).toBe('p1')
  })

  it('does not mutate the original array', () => {
    const lines = [
      makeSimpleLine('p1', 100_000),
      makeSimpleLine('p2', 300_000),
    ]
    const originalFirst = lines[0].partner_id
    rankPartnersByLoanBurden(lines)
    expect(lines[0].partner_id).toBe(originalFirst)
  })

  it('equal loan amounts: preserves relative order or sorts stably', () => {
    const lines = [
      makeSimpleLine('p1', 100_000),
      makeSimpleLine('p2', 100_000),
    ]
    const ranked = rankPartnersByLoanBurden(lines)
    expect(ranked).toHaveLength(2)
    // Both have same loan — just ensure both are in result
    const ids = ranked.map(l => l.partner_id)
    expect(ids).toContain('p1')
    expect(ids).toContain('p2')
  })

  it('all zero loans: maintains stable array of same length', () => {
    const lines = [
      makeSimpleLine('p1', 0),
      makeSimpleLine('p2', 0),
      makeSimpleLine('p3', 0),
    ]
    expect(rankPartnersByLoanBurden(lines)).toHaveLength(3)
  })
})
