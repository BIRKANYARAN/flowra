/**
 * Debt Maturity Ladder Service — pure-logic unit tests
 *
 * Covers all 10 exported pure functions with at least 60 cases.
 *
 * Run: npx vitest run tests/debt-maturity.test.ts
 */

import { describe, it, expect } from 'vitest'
import {
  computeDaysToMaturity,
  classifyMaturityBucket,
  computeDailyInterestRate,
  computeEstimatedInterestToMaturity,
  buildMaturityLadder,
  computeDebtServiceNextDays,
  computeDebtConcentrationByPartner,
  classifyRefinancingRisk,
  computeWeightedAverageMaturity,
  detectMaturityCliffs,
  type PartnerDebtSchedule,
  type MaturityBucket,
} from '../lib/services/pcle/debt-maturity.service'

// ── computeDaysToMaturity ─────────────────────────────────────────────────────

describe('computeDaysToMaturity', () => {
  it('future date returns positive days', () => {
    expect(computeDaysToMaturity('2026-05-01', '2026-06-01')).toBe(31)
  })

  it('past date returns negative days (overdue)', () => {
    expect(computeDaysToMaturity('2026-05-10', '2026-05-03')).toBe(-7)
  })

  it('null repayment date returns null', () => {
    expect(computeDaysToMaturity('2026-05-01', null)).toBeNull()
  })

  it('same date returns 0', () => {
    expect(computeDaysToMaturity('2026-05-01', '2026-05-01')).toBe(0)
  })

  it('exactly 30 days ahead', () => {
    expect(computeDaysToMaturity('2026-05-01', '2026-05-31')).toBe(30)
  })

  it('exactly 365 days ahead', () => {
    expect(computeDaysToMaturity('2026-05-01', '2027-05-01')).toBe(365)
  })

  it('one day in the future', () => {
    expect(computeDaysToMaturity('2026-05-01', '2026-05-02')).toBe(1)
  })

  it('one day in the past', () => {
    expect(computeDaysToMaturity('2026-05-02', '2026-05-01')).toBe(-1)
  })

  it('empty string repayment returns null', () => {
    expect(computeDaysToMaturity('2026-05-01', '')).toBeNull()
  })

  it('cross-year calculation', () => {
    // 2026-12-31 → 2027-01-01 = 1 day
    expect(computeDaysToMaturity('2026-12-31', '2027-01-01')).toBe(1)
  })
})

// ── classifyMaturityBucket ────────────────────────────────────────────────────

describe('classifyMaturityBucket', () => {
  it('null → over_1_year (no due date)', () => {
    expect(classifyMaturityBucket(null)).toBe('over_1_year')
  })

  it('negative days → overdue', () => {
    expect(classifyMaturityBucket(-1)).toBe('overdue')
  })

  it('large negative → overdue', () => {
    expect(classifyMaturityBucket(-365)).toBe('overdue')
  })

  it('0 days → days_0_30', () => {
    expect(classifyMaturityBucket(0)).toBe('days_0_30')
  })

  it('30 days → days_0_30 (boundary)', () => {
    expect(classifyMaturityBucket(30)).toBe('days_0_30')
  })

  it('31 days → days_31_90', () => {
    expect(classifyMaturityBucket(31)).toBe('days_31_90')
  })

  it('90 days → days_31_90 (boundary)', () => {
    expect(classifyMaturityBucket(90)).toBe('days_31_90')
  })

  it('91 days → days_91_180', () => {
    expect(classifyMaturityBucket(91)).toBe('days_91_180')
  })

  it('180 days → days_91_180 (boundary)', () => {
    expect(classifyMaturityBucket(180)).toBe('days_91_180')
  })

  it('181 days → days_181_365', () => {
    expect(classifyMaturityBucket(181)).toBe('days_181_365')
  })

  it('365 days → days_181_365 (boundary)', () => {
    expect(classifyMaturityBucket(365)).toBe('days_181_365')
  })

  it('366 days → over_1_year', () => {
    expect(classifyMaturityBucket(366)).toBe('over_1_year')
  })

  it('1000 days → over_1_year', () => {
    expect(classifyMaturityBucket(1000)).toBe('over_1_year')
  })
})

// ── computeDailyInterestRate ──────────────────────────────────────────────────

describe('computeDailyInterestRate', () => {
  it('12% annual = 0.12/365', () => {
    expect(computeDailyInterestRate(12)).toBeCloseTo(0.12 / 365, 10)
  })

  it('0% annual = 0', () => {
    expect(computeDailyInterestRate(0)).toBe(0)
  })

  it('24% annual = 0.24/365', () => {
    expect(computeDailyInterestRate(24)).toBeCloseTo(0.24 / 365, 10)
  })

  it('100% annual = 1/365', () => {
    expect(computeDailyInterestRate(100)).toBeCloseTo(1 / 365, 10)
  })

  it('result is always positive for positive rate', () => {
    expect(computeDailyInterestRate(5)).toBeGreaterThan(0)
  })
})

// ── computeEstimatedInterestToMaturity ────────────────────────────────────────

describe('computeEstimatedInterestToMaturity', () => {
  it('positive days computes simple interest', () => {
    // principal=100000, rate=12%, 365 days → 100000 * 0.12/365 * 365 = 12000
    const result = computeEstimatedInterestToMaturity(100_000, 12, 365)
    expect(result).toBeCloseTo(12_000, 0)
  })

  it('null days → 0', () => {
    expect(computeEstimatedInterestToMaturity(100_000, 12, null)).toBe(0)
  })

  it('negative days → 0 (overdue)', () => {
    expect(computeEstimatedInterestToMaturity(100_000, 12, -10)).toBe(0)
  })

  it('0 days → 0', () => {
    expect(computeEstimatedInterestToMaturity(100_000, 12, 0)).toBe(0)
  })

  it('0% rate → 0 interest regardless of days', () => {
    expect(computeEstimatedInterestToMaturity(500_000, 0, 180)).toBe(0)
  })

  it('30 days at 12% annual', () => {
    const expected = 100_000 * (0.12 / 365) * 30
    expect(computeEstimatedInterestToMaturity(100_000, 12, 30)).toBeCloseTo(expected, 0)
  })

  it('result is always non-negative', () => {
    expect(computeEstimatedInterestToMaturity(50_000, 18, 90)).toBeGreaterThanOrEqual(0)
  })
})

// ── buildMaturityLadder ───────────────────────────────────────────────────────

describe('buildMaturityLadder', () => {
  it('returns exactly 6 buckets', () => {
    expect(buildMaturityLadder([])).toHaveLength(6)
  })

  it('empty input → all bucket totals are 0', () => {
    const buckets = buildMaturityLadder([])
    for (const b of buckets) {
      expect(b.principal_try).toBe(0)
      expect(b.interest_try).toBe(0)
      expect(b.total_try).toBe(0)
      expect(b.tranche_count).toBe(0)
    }
  })

  it('groups overdue tranche into overdue bucket', () => {
    const tranches = [{
      tranche_id: 't1',
      outstanding_try: 50_000,
      interest_rate_annual_pct: 12,
      expected_repayment_date: '2025-01-01',
      days_to_maturity: -100,
    }]
    const buckets = buildMaturityLadder(tranches)
    const overdue = buckets.find(b => b.bucket_key === 'overdue')!
    expect(overdue.principal_try).toBe(50_000)
    expect(overdue.tranche_count).toBe(1)
    expect(overdue.interest_try).toBe(0) // overdue = no future interest
  })

  it('groups 0-30d tranche correctly', () => {
    const tranches = [{
      tranche_id: 't1',
      outstanding_try: 100_000,
      interest_rate_annual_pct: 0,
      expected_repayment_date: '2026-05-15',
      days_to_maturity: 15,
    }]
    const buckets = buildMaturityLadder(tranches)
    const b = buckets.find(b => b.bucket_key === 'days_0_30')!
    expect(b.principal_try).toBe(100_000)
    expect(b.tranche_count).toBe(1)
  })

  it('multiple tranches in same bucket accumulate', () => {
    const tranches = [
      { tranche_id: 't1', outstanding_try: 100_000, interest_rate_annual_pct: 0, expected_repayment_date: null, days_to_maturity: 60 },
      { tranche_id: 't2', outstanding_try: 200_000, interest_rate_annual_pct: 0, expected_repayment_date: null, days_to_maturity: 75 },
    ]
    const buckets = buildMaturityLadder(tranches)
    const b = buckets.find(b => b.bucket_key === 'days_31_90')!
    expect(b.principal_try).toBe(300_000)
    expect(b.tranche_count).toBe(2)
  })

  it('null days_to_maturity goes into over_1_year bucket', () => {
    const tranches = [{
      tranche_id: 't1',
      outstanding_try: 75_000,
      interest_rate_annual_pct: 12,
      expected_repayment_date: null,
      days_to_maturity: null,
    }]
    const buckets = buildMaturityLadder(tranches)
    const b = buckets.find(b => b.bucket_key === 'over_1_year')!
    expect(b.principal_try).toBe(75_000)
    expect(b.interest_try).toBe(0) // null days → no future interest
  })

  it('total_try = principal_try + interest_try for each bucket', () => {
    const tranches = [{
      tranche_id: 't1',
      outstanding_try: 100_000,
      interest_rate_annual_pct: 12,
      expected_repayment_date: null,
      days_to_maturity: 180,
    }]
    const buckets = buildMaturityLadder(tranches)
    const b = buckets.find(b => b.bucket_key === 'days_91_180')!
    expect(b.total_try).toBeCloseTo(b.principal_try + b.interest_try, 1)
  })

  it('bucket labels are in Turkish', () => {
    const buckets = buildMaturityLadder([])
    const labels = buckets.map(b => b.label)
    expect(labels).toContain('Vadesi geçmiş')
    expect(labels).toContain('0-30 gün')
    expect(labels).toContain('1 yıldan uzun')
  })
})

// ── computeDebtServiceNextDays ────────────────────────────────────────────────

describe('computeDebtServiceNextDays', () => {
  it('includes tranche maturing exactly on day N', () => {
    const tranches = [{ outstanding_try: 100_000, interest_rate_annual_pct: 0, days_to_maturity: 30 }]
    expect(computeDebtServiceNextDays(tranches, 30)).toBe(100_000)
  })

  it('excludes tranche maturing after N days', () => {
    const tranches = [{ outstanding_try: 100_000, interest_rate_annual_pct: 0, days_to_maturity: 31 }]
    expect(computeDebtServiceNextDays(tranches, 30)).toBe(0)
  })

  it('excludes overdue tranches (negative days)', () => {
    const tranches = [{ outstanding_try: 100_000, interest_rate_annual_pct: 0, days_to_maturity: -5 }]
    expect(computeDebtServiceNextDays(tranches, 30)).toBe(0)
  })

  it('excludes null days tranches', () => {
    const tranches = [{ outstanding_try: 100_000, interest_rate_annual_pct: 0, days_to_maturity: null }]
    expect(computeDebtServiceNextDays(tranches, 90)).toBe(0)
  })

  it('sums multiple tranches within window', () => {
    const tranches = [
      { outstanding_try: 50_000,  interest_rate_annual_pct: 0, days_to_maturity: 10 },
      { outstanding_try: 75_000,  interest_rate_annual_pct: 0, days_to_maturity: 25 },
      { outstanding_try: 200_000, interest_rate_annual_pct: 0, days_to_maturity: 100 }, // outside 90d
    ]
    expect(computeDebtServiceNextDays(tranches, 90)).toBe(125_000)
  })

  it('empty tranches → 0', () => {
    expect(computeDebtServiceNextDays([], 90)).toBe(0)
  })

  it('includes estimated interest in service total', () => {
    // 100k at 12% for 30 days → interest > 0
    const tranches = [{ outstanding_try: 100_000, interest_rate_annual_pct: 12, days_to_maturity: 30 }]
    const service = computeDebtServiceNextDays(tranches, 30)
    expect(service).toBeGreaterThan(100_000)
  })
})

// ── classifyRefinancingRisk ───────────────────────────────────────────────────

describe('classifyRefinancingRisk', () => {
  it('zero total → no_debt', () => {
    expect(classifyRefinancingRisk(0, 0)).toBe('no_debt')
  })

  it('total > 0 but 0 due in 90d → low', () => {
    expect(classifyRefinancingRisk(1_000_000, 0)).toBe('low')
  })

  it('>50% due in 90d → critical', () => {
    expect(classifyRefinancingRisk(1_000_000, 600_000)).toBe('critical')
  })

  it('exactly 50% → critical (boundary: > 50 is critical)', () => {
    // 500k/1000k = 50% → NOT critical (need >50)
    expect(classifyRefinancingRisk(1_000_000, 500_000)).toBe('high')
  })

  it('51% due in 90d → critical', () => {
    expect(classifyRefinancingRisk(1_000_000, 510_000)).toBe('critical')
  })

  it('>30% but ≤50% → high', () => {
    expect(classifyRefinancingRisk(1_000_000, 400_000)).toBe('high')
  })

  it('>15% but ≤30% → moderate', () => {
    expect(classifyRefinancingRisk(1_000_000, 200_000)).toBe('moderate')
  })

  it('≤15% → low', () => {
    expect(classifyRefinancingRisk(1_000_000, 100_000)).toBe('low')
  })

  it('negative total → no_debt', () => {
    expect(classifyRefinancingRisk(-1, 0)).toBe('no_debt')
  })
})

// ── computeWeightedAverageMaturity ────────────────────────────────────────────

describe('computeWeightedAverageMaturity', () => {
  it('returns null when no tranches', () => {
    expect(computeWeightedAverageMaturity([])).toBeNull()
  })

  it('returns null when all tranches have null days', () => {
    const tranches = [
      { outstanding_try: 100_000, days_to_maturity: null },
      { outstanding_try: 200_000, days_to_maturity: null },
    ]
    expect(computeWeightedAverageMaturity(tranches)).toBeNull()
  })

  it('ignores overdue tranches (negative days)', () => {
    const tranches = [
      { outstanding_try: 100_000, days_to_maturity: -30 },
      { outstanding_try: 200_000, days_to_maturity: null },
    ]
    expect(computeWeightedAverageMaturity(tranches)).toBeNull()
  })

  it('single tranche WAM = days/30 months', () => {
    const tranches = [{ outstanding_try: 100_000, days_to_maturity: 90 }]
    // 90 / 30 = 3 months
    expect(computeWeightedAverageMaturity(tranches)).toBeCloseTo(3, 1)
  })

  it('equal principals → simple average of days in months', () => {
    const tranches = [
      { outstanding_try: 100_000, days_to_maturity: 30 },
      { outstanding_try: 100_000, days_to_maturity: 90 },
    ]
    // (30+90)/2 / 30 = 60/30 = 2 months
    expect(computeWeightedAverageMaturity(tranches)).toBeCloseTo(2, 1)
  })

  it('larger principal weights toward longer maturity', () => {
    const tranches = [
      { outstanding_try: 100_000, days_to_maturity: 30 },   // short
      { outstanding_try: 900_000, days_to_maturity: 360 },  // long
    ]
    // WAM days = (100k*30 + 900k*360) / 1000k = 3000+324000/1000 = 327 days = 10.9 months
    const result = computeWeightedAverageMaturity(tranches)!
    expect(result).toBeCloseTo(327 / 30, 1)
  })

  it('zero principal tranche has no weight', () => {
    const tranches = [
      { outstanding_try: 0,       days_to_maturity: 30 },
      { outstanding_try: 100_000, days_to_maturity: 180 },
    ]
    // Only the 100k tranche counts: 180/30 = 6 months
    expect(computeWeightedAverageMaturity(tranches)).toBeCloseTo(6, 1)
  })
})

// ── detectMaturityCliffs ──────────────────────────────────────────────────────

describe('detectMaturityCliffs', () => {
  it('returns empty when no tranches', () => {
    expect(detectMaturityCliffs([], 0)).toEqual([])
  })

  it('returns empty when total is 0', () => {
    const tranches = [{
      outstanding_try: 100_000,
      expected_repayment_date: '2026-12-31',
      partner_name: 'Ahmet',
    }]
    expect(detectMaturityCliffs(tranches, 0)).toEqual([])
  })

  it('detects cliff at 20% threshold', () => {
    const tranches = [{
      outstanding_try: 200_000,
      expected_repayment_date: '2026-12-31',
      partner_name: 'Ahmet',
    }]
    // 200k / 1000k = 20% → cliff
    const cliffs = detectMaturityCliffs(tranches, 1_000_000)
    expect(cliffs).toHaveLength(1)
    expect(cliffs[0].date).toBe('2026-12-31')
    expect(cliffs[0].amount_try).toBe(200_000)
  })

  it('no cliff when below threshold', () => {
    const tranches = [{
      outstanding_try: 100_000,
      expected_repayment_date: '2026-12-31',
      partner_name: 'Ahmet',
    }]
    // 100k / 1000k = 10% → no cliff (< 20%)
    const cliffs = detectMaturityCliffs(tranches, 1_000_000)
    expect(cliffs).toHaveLength(0)
  })

  it('groups multiple tranches on same date', () => {
    const tranches = [
      { outstanding_try: 100_000, expected_repayment_date: '2026-12-31', partner_name: 'Ahmet' },
      { outstanding_try: 150_000, expected_repayment_date: '2026-12-31', partner_name: 'Mehmet' },
    ]
    const cliffs = detectMaturityCliffs(tranches, 1_000_000)
    expect(cliffs).toHaveLength(1)
    expect(cliffs[0].amount_try).toBe(250_000)
    expect(cliffs[0].partner_names).toContain('Ahmet')
    expect(cliffs[0].partner_names).toContain('Mehmet')
  })

  it('ignores tranches with null repayment date', () => {
    const tranches = [
      { outstanding_try: 500_000, expected_repayment_date: null, partner_name: 'Ahmet' },
    ]
    const cliffs = detectMaturityCliffs(tranches, 1_000_000)
    expect(cliffs).toHaveLength(0)
  })

  it('respects custom threshold', () => {
    const tranches = [{
      outstanding_try: 150_000,
      expected_repayment_date: '2026-12-31',
      partner_name: 'Ahmet',
    }]
    // 150k/1000k = 15% → no cliff at default 20%, but cliff at 10% threshold
    expect(detectMaturityCliffs(tranches, 1_000_000, 0.1)).toHaveLength(1)
    expect(detectMaturityCliffs(tranches, 1_000_000, 0.2)).toHaveLength(0)
  })

  it('sorts cliffs by date ascending', () => {
    const tranches = [
      { outstanding_try: 300_000, expected_repayment_date: '2027-06-30', partner_name: 'A' },
      { outstanding_try: 300_000, expected_repayment_date: '2026-12-31', partner_name: 'B' },
    ]
    const cliffs = detectMaturityCliffs(tranches, 1_000_000)
    expect(cliffs[0].date).toBe('2026-12-31')
    expect(cliffs[1].date).toBe('2027-06-30')
  })

  it('pct_of_total is expressed as 0-100', () => {
    const tranches = [{
      outstanding_try: 250_000,
      expected_repayment_date: '2026-12-31',
      partner_name: 'Ahmet',
    }]
    const cliffs = detectMaturityCliffs(tranches, 1_000_000)
    expect(cliffs[0].pct_of_total).toBeCloseTo(25, 0)
  })
})

// ── computeDebtConcentrationByPartner ─────────────────────────────────────────

describe('computeDebtConcentrationByPartner', () => {
  it('returns empty map when no partners', () => {
    expect(computeDebtConcentrationByPartner([])).toEqual(new Map())
  })

  it('returns empty map when total outstanding is 0', () => {
    const schedules: PartnerDebtSchedule[] = [{
      partner_id: 'p1', partner_name: 'A',
      total_outstanding_try: 0, total_interest_try: 0,
      next_payment_date: null, next_payment_amount: 0, tranches: [],
    }]
    expect(computeDebtConcentrationByPartner(schedules)).toEqual(new Map())
  })

  it('single partner → 100%', () => {
    const schedules: PartnerDebtSchedule[] = [{
      partner_id: 'p1', partner_name: 'A',
      total_outstanding_try: 500_000, total_interest_try: 0,
      next_payment_date: null, next_payment_amount: 0, tranches: [],
    }]
    const result = computeDebtConcentrationByPartner(schedules)
    expect(result.get('p1')).toBe(100)
  })

  it('equal split between two partners → 50% each', () => {
    const schedules: PartnerDebtSchedule[] = [
      {
        partner_id: 'p1', partner_name: 'A',
        total_outstanding_try: 250_000, total_interest_try: 0,
        next_payment_date: null, next_payment_amount: 0, tranches: [],
      },
      {
        partner_id: 'p2', partner_name: 'B',
        total_outstanding_try: 250_000, total_interest_try: 0,
        next_payment_date: null, next_payment_amount: 0, tranches: [],
      },
    ]
    const result = computeDebtConcentrationByPartner(schedules)
    expect(result.get('p1')).toBe(50)
    expect(result.get('p2')).toBe(50)
  })

  it('unequal split: 75/25', () => {
    const schedules: PartnerDebtSchedule[] = [
      {
        partner_id: 'p1', partner_name: 'A',
        total_outstanding_try: 750_000, total_interest_try: 0,
        next_payment_date: null, next_payment_amount: 0, tranches: [],
      },
      {
        partner_id: 'p2', partner_name: 'B',
        total_outstanding_try: 250_000, total_interest_try: 0,
        next_payment_date: null, next_payment_amount: 0, tranches: [],
      },
    ]
    const result = computeDebtConcentrationByPartner(schedules)
    expect(result.get('p1')).toBe(75)
    expect(result.get('p2')).toBe(25)
  })

  it('all percentages sum to 100', () => {
    const schedules: PartnerDebtSchedule[] = [
      { partner_id: 'p1', partner_name: 'A', total_outstanding_try: 300_000, total_interest_try: 0, next_payment_date: null, next_payment_amount: 0, tranches: [] },
      { partner_id: 'p2', partner_name: 'B', total_outstanding_try: 400_000, total_interest_try: 0, next_payment_date: null, next_payment_amount: 0, tranches: [] },
      { partner_id: 'p3', partner_name: 'C', total_outstanding_try: 300_000, total_interest_try: 0, next_payment_date: null, next_payment_amount: 0, tranches: [] },
    ]
    const result = computeDebtConcentrationByPartner(schedules)
    const sum = [...result.values()].reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(100, 0)
  })
})

// ── computeDaysToMaturity: extended boundary tests ────────────────────────────

describe('computeDaysToMaturity — extended', () => {
  it('leap year day count: 2024-02-01 → 2024-03-01 = 29 days', () => {
    expect(computeDaysToMaturity('2024-02-01', '2024-03-01')).toBe(29)
  })

  it('non-leap year: 2025-02-01 → 2025-03-01 = 28 days', () => {
    expect(computeDaysToMaturity('2025-02-01', '2025-03-01')).toBe(28)
  })

  it('exactly 91 days ahead', () => {
    expect(computeDaysToMaturity('2026-05-01', '2026-07-31')).toBe(91)
  })

  it('exactly 181 days ahead', () => {
    expect(computeDaysToMaturity('2026-01-01', '2026-07-01')).toBe(181)
  })

  it('exactly 366 days ahead', () => {
    expect(computeDaysToMaturity('2026-01-01', '2027-01-02')).toBe(366)
  })

  it('repayment date with time component uses only date part', () => {
    // Should still work even with time component in string
    const result = computeDaysToMaturity('2026-05-01', '2026-06-01T10:00:00Z')
    expect(result).toBe(31)
  })
})

// ── classifyMaturityBucket: all boundary values ───────────────────────────────

describe('classifyMaturityBucket — all boundaries', () => {
  it('exactly -1 → overdue', () => {
    expect(classifyMaturityBucket(-1)).toBe('overdue')
  })

  it('exactly 0 → days_0_30', () => {
    expect(classifyMaturityBucket(0)).toBe('days_0_30')
  })

  it('exactly 30 → days_0_30', () => {
    expect(classifyMaturityBucket(30)).toBe('days_0_30')
  })

  it('exactly 31 → days_31_90', () => {
    expect(classifyMaturityBucket(31)).toBe('days_31_90')
  })

  it('exactly 90 → days_31_90', () => {
    expect(classifyMaturityBucket(90)).toBe('days_31_90')
  })

  it('exactly 91 → days_91_180', () => {
    expect(classifyMaturityBucket(91)).toBe('days_91_180')
  })

  it('exactly 180 → days_91_180', () => {
    expect(classifyMaturityBucket(180)).toBe('days_91_180')
  })

  it('exactly 181 → days_181_365', () => {
    expect(classifyMaturityBucket(181)).toBe('days_181_365')
  })

  it('exactly 365 → days_181_365', () => {
    expect(classifyMaturityBucket(365)).toBe('days_181_365')
  })

  it('exactly 366 → over_1_year', () => {
    expect(classifyMaturityBucket(366)).toBe('over_1_year')
  })
})

// ── computeEstimatedInterestToMaturity: extended ──────────────────────────────

describe('computeEstimatedInterestToMaturity — extended', () => {
  it('1 day at 36.5% annual = principal × 0.365 / 365 = principal × 0.001', () => {
    const result = computeEstimatedInterestToMaturity(100_000, 36.5, 1)
    expect(result).toBeCloseTo(100, 1)
  })

  it('very high Turkish rate (60% annual) over 180 days', () => {
    const result = computeEstimatedInterestToMaturity(500_000, 60, 180)
    const expected = 500_000 * (0.60 / 365) * 180
    expect(result).toBeCloseTo(expected, 0)
  })

  it('result rounds to 2 decimal places', () => {
    const result = computeEstimatedInterestToMaturity(100_000, 12, 45)
    const decimalPart = String(result).split('.')[1]
    expect(decimalPart?.length ?? 0).toBeLessThanOrEqual(2)
  })

  it('interest at 90 days = 3 × interest at 30 days (linear scaling)', () => {
    const i30  = computeEstimatedInterestToMaturity(100_000, 12, 30)
    const i90  = computeEstimatedInterestToMaturity(100_000, 12, 90)
    expect(i90).toBeCloseTo(i30 * 3, 0)
  })
})

// ── classifyRefinancingRisk: full boundary sweep ──────────────────────────────

describe('classifyRefinancingRisk — boundary sweep', () => {
  it('ratio 0.15 (15%) → low', () => {
    expect(classifyRefinancingRisk(1_000_000, 150_000)).toBe('low')
  })

  it('ratio just above 0.15 → moderate', () => {
    expect(classifyRefinancingRisk(1_000_000, 150_001)).toBe('moderate')
  })

  it('ratio 0.30 (30%) → moderate', () => {
    expect(classifyRefinancingRisk(1_000_000, 300_000)).toBe('moderate')
  })

  it('ratio just above 0.30 → high', () => {
    expect(classifyRefinancingRisk(1_000_000, 300_001)).toBe('high')
  })

  it('ratio 0.50 (50%) → high (boundary: NOT critical)', () => {
    expect(classifyRefinancingRisk(1_000_000, 500_000)).toBe('high')
  })

  it('ratio just above 0.50 → critical', () => {
    expect(classifyRefinancingRisk(1_000_000, 500_001)).toBe('critical')
  })

  it('100% due → critical', () => {
    expect(classifyRefinancingRisk(1_000_000, 1_000_000)).toBe('critical')
  })

  it('all 5 statuses reachable', () => {
    expect(classifyRefinancingRisk(0, 0)).toBe('no_debt')
    expect(classifyRefinancingRisk(1_000_000, 100_000)).toBe('low')
    expect(classifyRefinancingRisk(1_000_000, 200_000)).toBe('moderate')
    expect(classifyRefinancingRisk(1_000_000, 400_000)).toBe('high')
    expect(classifyRefinancingRisk(1_000_000, 600_000)).toBe('critical')
  })
})

// ── computeWeightedAverageMaturity: extended ──────────────────────────────────

describe('computeWeightedAverageMaturity — extended', () => {
  it('all tranches overdue → null', () => {
    const tranches = [
      { outstanding_try: 100_000, days_to_maturity: -30 },
      { outstanding_try: 200_000, days_to_maturity: -90 },
    ]
    expect(computeWeightedAverageMaturity(tranches)).toBeNull()
  })

  it('mix of overdue and future: overdue excluded', () => {
    const tranches = [
      { outstanding_try: 100_000, days_to_maturity: -30 }, // excluded
      { outstanding_try: 200_000, days_to_maturity: 60 },  // included
    ]
    // WAM = 60 days / 30 = 2 months
    const result = computeWeightedAverageMaturity(tranches)
    expect(result).toBeCloseTo(2, 1)
  })

  it('WAM rounds to 2 decimal places', () => {
    const tranches = [{ outstanding_try: 100_000, days_to_maturity: 100 }]
    const result = computeWeightedAverageMaturity(tranches)!
    const decimalPart = String(result).split('.')[1]
    expect(decimalPart?.length ?? 0).toBeLessThanOrEqual(2)
  })

  it('three tranches with equal weight: WAM = average maturity', () => {
    const tranches = [
      { outstanding_try: 100_000, days_to_maturity: 30 },
      { outstanding_try: 100_000, days_to_maturity: 60 },
      { outstanding_try: 100_000, days_to_maturity: 90 },
    ]
    // WAM = (30+60+90)/3 / 30 = 60/30 = 2 months
    expect(computeWeightedAverageMaturity(tranches)).toBeCloseTo(2, 1)
  })
})

// ── buildMaturityLadder: extended ─────────────────────────────────────────────

describe('buildMaturityLadder — extended', () => {
  it('bucket_key values are all 6 expected keys', () => {
    const buckets = buildMaturityLadder([])
    const keys = buckets.map(b => b.bucket_key)
    expect(keys).toContain('overdue')
    expect(keys).toContain('days_0_30')
    expect(keys).toContain('days_31_90')
    expect(keys).toContain('days_91_180')
    expect(keys).toContain('days_181_365')
    expect(keys).toContain('over_1_year')
  })

  it('tranches in boundary day positions are classified correctly', () => {
    const tranches = [
      { tranche_id: 't1', outstanding_try: 100_000, interest_rate_annual_pct: 0, expected_repayment_date: null, days_to_maturity: 30 },   // days_0_30
      { tranche_id: 't2', outstanding_try: 100_000, interest_rate_annual_pct: 0, expected_repayment_date: null, days_to_maturity: 31 },   // days_31_90
      { tranche_id: 't3', outstanding_try: 100_000, interest_rate_annual_pct: 0, expected_repayment_date: null, days_to_maturity: 90 },   // days_31_90
      { tranche_id: 't4', outstanding_try: 100_000, interest_rate_annual_pct: 0, expected_repayment_date: null, days_to_maturity: 180 },  // days_91_180
      { tranche_id: 't5', outstanding_try: 100_000, interest_rate_annual_pct: 0, expected_repayment_date: null, days_to_maturity: 365 },  // days_181_365
      { tranche_id: 't6', outstanding_try: 100_000, interest_rate_annual_pct: 0, expected_repayment_date: null, days_to_maturity: 366 },  // over_1_year
    ]
    const buckets = buildMaturityLadder(tranches)
    expect(buckets.find(b => b.bucket_key === 'days_0_30')!.tranche_count).toBe(1)
    expect(buckets.find(b => b.bucket_key === 'days_31_90')!.tranche_count).toBe(2)
    expect(buckets.find(b => b.bucket_key === 'days_91_180')!.tranche_count).toBe(1)
    expect(buckets.find(b => b.bucket_key === 'days_181_365')!.tranche_count).toBe(1)
    expect(buckets.find(b => b.bucket_key === 'over_1_year')!.tranche_count).toBe(1)
  })

  it('tranche with interest rate accumulates interest in bucket', () => {
    const tranches = [{
      tranche_id: 't1',
      outstanding_try: 100_000,
      interest_rate_annual_pct: 12,
      expected_repayment_date: null,
      days_to_maturity: 90,
    }]
    const buckets = buildMaturityLadder(tranches)
    const b = buckets.find(b => b.bucket_key === 'days_31_90')!
    expect(b.interest_try).toBeGreaterThan(0)
    expect(b.total_try).toBeGreaterThan(b.principal_try)
  })
})

// ── computeDebtServiceNextDays: extended ─────────────────────────────────────

describe('computeDebtServiceNextDays — extended', () => {
  it('day 0 tranche is included in the window', () => {
    const tranches = [{ outstanding_try: 50_000, interest_rate_annual_pct: 0, days_to_maturity: 0 }]
    expect(computeDebtServiceNextDays(tranches, 30)).toBe(50_000)
  })

  it('day 30 tranche included in 30-day window', () => {
    const tranches = [{ outstanding_try: 100_000, interest_rate_annual_pct: 0, days_to_maturity: 30 }]
    expect(computeDebtServiceNextDays(tranches, 30)).toBe(100_000)
  })

  it('day 31 tranche excluded from 30-day window', () => {
    const tranches = [{ outstanding_try: 100_000, interest_rate_annual_pct: 0, days_to_maturity: 31 }]
    expect(computeDebtServiceNextDays(tranches, 30)).toBe(0)
  })

  it('window = 0: includes only day-0 tranches', () => {
    const tranches = [
      { outstanding_try: 100_000, interest_rate_annual_pct: 0, days_to_maturity: 0 },
      { outstanding_try: 50_000,  interest_rate_annual_pct: 0, days_to_maturity: 1 },
    ]
    expect(computeDebtServiceNextDays(tranches, 0)).toBe(100_000)
  })

  it('result is non-negative for all valid inputs', () => {
    const tranches = [
      { outstanding_try: 100_000, interest_rate_annual_pct: 12, days_to_maturity: 30 },
      { outstanding_try: 50_000,  interest_rate_annual_pct: 0,  days_to_maturity: null },
      { outstanding_try: 75_000,  interest_rate_annual_pct: 8,  days_to_maturity: -10 },
    ]
    const result = computeDebtServiceNextDays(tranches, 90)
    expect(result).toBeGreaterThanOrEqual(0)
  })
})
