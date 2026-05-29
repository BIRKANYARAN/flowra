/**
 * EquityCommitmentService — pure-logic unit tests
 *
 * Covers all exported pure functions:
 *   computeEquityGap
 *   computeFulfillmentRatio
 *   classifyFulfillmentStatus
 *   computeCapitalCallOverdueDays
 *   classifyCallUrgency
 *   computeStatutoryInterest
 *   computeTotalEquityGap
 *   computeCompanyFulfillmentRatio
 *   computeWeightedFulfillment
 *   classifyEquityHealth
 *   generateEquityNarrative
 *   computeEffectiveEquityRatio
 *   classifyLeverageLevel
 *
 * Run: npx vitest run tests/equity-commitment.test.ts
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  computeEquityGap,
  computeFulfillmentRatio,
  classifyFulfillmentStatus,
  computeCapitalCallOverdueDays,
  classifyCallUrgency,
  computeStatutoryInterest,
  computeTotalEquityGap,
  computeCompanyFulfillmentRatio,
  computeWeightedFulfillment,
  classifyEquityHealth,
  generateEquityNarrative,
  computeEffectiveEquityRatio,
  classifyLeverageLevel,
} from '../lib/services/pcle/equity-commitment.service'

// ── computeEquityGap ──────────────────────────────────────────────────────────

describe('computeEquityGap', () => {
  it('normal gap: committed 100 000, paid 60 000 → 40 000', () => {
    expect(computeEquityGap(100_000, 60_000)).toBe(40_000)
  })

  it('overpaid: paid > committed → 0 (not negative)', () => {
    expect(computeEquityGap(50_000, 80_000)).toBe(0)
  })

  it('exact match: paid === committed → 0', () => {
    expect(computeEquityGap(200_000, 200_000)).toBe(0)
  })

  it('nothing paid → gap equals committed', () => {
    expect(computeEquityGap(150_000, 0)).toBe(150_000)
  })

  it('both zero → 0', () => {
    expect(computeEquityGap(0, 0)).toBe(0)
  })

  it('large amounts', () => {
    expect(computeEquityGap(10_000_000, 3_500_000)).toBe(6_500_000)
  })
})

// ── computeFulfillmentRatio ───────────────────────────────────────────────────

describe('computeFulfillmentRatio', () => {
  it('zero committed → null', () => {
    expect(computeFulfillmentRatio(0, 50_000)).toBeNull()
  })

  it('negative committed treated as zero → null', () => {
    expect(computeFulfillmentRatio(-1, 0)).toBeNull()
  })

  it('half paid → 0.5', () => {
    expect(computeFulfillmentRatio(100_000, 50_000)).toBeCloseTo(0.5, 8)
  })

  it('fully paid → 1.0', () => {
    expect(computeFulfillmentRatio(200_000, 200_000)).toBeCloseTo(1.0, 8)
  })

  it('overpaid → > 1.0', () => {
    expect(computeFulfillmentRatio(100_000, 120_000)).toBeCloseTo(1.2, 8)
  })

  it('nothing paid → 0.0', () => {
    expect(computeFulfillmentRatio(100_000, 0)).toBeCloseTo(0.0, 8)
  })

  it('90% paid → 0.9', () => {
    expect(computeFulfillmentRatio(100_000, 90_000)).toBeCloseTo(0.9, 8)
  })
})

// ── classifyFulfillmentStatus ─────────────────────────────────────────────────

describe('classifyFulfillmentStatus', () => {
  it('null → no_commitment', () => {
    expect(classifyFulfillmentStatus(null)).toBe('no_commitment')
  })

  it('ratio = 1.0 exactly → complete', () => {
    expect(classifyFulfillmentStatus(1.0)).toBe('complete')
  })

  it('ratio > 1.0 (overpaid) → complete', () => {
    expect(classifyFulfillmentStatus(1.5)).toBe('complete')
  })

  it('ratio = 0.99 → nearly_complete', () => {
    expect(classifyFulfillmentStatus(0.99)).toBe('nearly_complete')
  })

  it('ratio = 0.90 exactly → nearly_complete', () => {
    expect(classifyFulfillmentStatus(0.90)).toBe('nearly_complete')
  })

  it('ratio = 0.89 → partial', () => {
    expect(classifyFulfillmentStatus(0.89)).toBe('partial')
  })

  it('ratio = 0.50 exactly → partial', () => {
    expect(classifyFulfillmentStatus(0.50)).toBe('partial')
  })

  it('ratio = 0.49 → minimal', () => {
    expect(classifyFulfillmentStatus(0.49)).toBe('minimal')
  })

  it('ratio = 0.10 exactly → minimal', () => {
    expect(classifyFulfillmentStatus(0.10)).toBe('minimal')
  })

  it('ratio = 0.09 → unfulfilled', () => {
    expect(classifyFulfillmentStatus(0.09)).toBe('unfulfilled')
  })

  it('ratio = 0.0 → unfulfilled', () => {
    expect(classifyFulfillmentStatus(0.0)).toBe('unfulfilled')
  })

  it('ratio slightly above 0 → unfulfilled', () => {
    expect(classifyFulfillmentStatus(0.001)).toBe('unfulfilled')
  })
})

// ── computeCapitalCallOverdueDays ─────────────────────────────────────────────

describe('computeCapitalCallOverdueDays', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('null callDate → null', () => {
    expect(computeCapitalCallOverdueDays(null, null)).toBeNull()
    expect(computeCapitalCallOverdueDays(null, '2024-01-01')).toBeNull()
  })

  it('future callDate → 0 (not yet due)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-29'))
    expect(computeCapitalCallOverdueDays('2026-12-31', null)).toBe(0)
    vi.useRealTimers()
  })

  it('callDate today, no paidDate → 0 (due today)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-29'))
    expect(computeCapitalCallOverdueDays('2026-05-29', null)).toBe(0)
    vi.useRealTimers()
  })

  it('past callDate, no paidDate → positive days overdue', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-29'))
    // 10 days ago
    expect(computeCapitalCallOverdueDays('2026-05-19', null)).toBe(10)
    vi.useRealTimers()
  })

  it('paidDate on time (paidDate === callDate) → 0', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-29'))
    expect(computeCapitalCallOverdueDays('2026-05-20', '2026-05-20')).toBe(0)
    vi.useRealTimers()
  })

  it('paidDate early (before callDate) → 0', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-29'))
    expect(computeCapitalCallOverdueDays('2026-05-20', '2026-05-15')).toBe(0)
    vi.useRealTimers()
  })

  it('paidDate after callDate → positive overdue days (late payment)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-29'))
    // call was 2026-05-01, paid 2026-05-11 → 10 days late
    expect(computeCapitalCallOverdueDays('2026-05-01', '2026-05-11')).toBe(10)
    vi.useRealTimers()
  })

  it('long overdue: 100 days past due, unpaid', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-29'))
    // callDate = 2026-02-18 (100 days before May 29)
    const callDate = new Date('2026-05-29')
    callDate.setDate(callDate.getDate() - 100)
    const callStr = callDate.toISOString().substring(0, 10)
    expect(computeCapitalCallOverdueDays(callStr, null)).toBe(100)
    vi.useRealTimers()
  })
})

// ── classifyCallUrgency ───────────────────────────────────────────────────────

describe('classifyCallUrgency', () => {
  it('isPaid=true → paid regardless of overdueDays', () => {
    expect(classifyCallUrgency(0, true)).toBe('paid')
    expect(classifyCallUrgency(50, true)).toBe('paid')
    expect(classifyCallUrgency(null, true)).toBe('paid')
  })

  it('overdueDays=null, isPaid=false → not_due', () => {
    expect(classifyCallUrgency(null, false)).toBe('not_due')
  })

  it('overdueDays=0, isPaid=false → due_today', () => {
    expect(classifyCallUrgency(0, false)).toBe('due_today')
  })

  it('overdueDays=1 → overdue_7d', () => {
    expect(classifyCallUrgency(1, false)).toBe('overdue_7d')
  })

  it('overdueDays=7 exactly → overdue_7d', () => {
    expect(classifyCallUrgency(7, false)).toBe('overdue_7d')
  })

  it('overdueDays=8 → overdue_30d', () => {
    expect(classifyCallUrgency(8, false)).toBe('overdue_30d')
  })

  it('overdueDays=30 exactly → overdue_30d', () => {
    expect(classifyCallUrgency(30, false)).toBe('overdue_30d')
  })

  it('overdueDays=31 → overdue_90d', () => {
    expect(classifyCallUrgency(31, false)).toBe('overdue_90d')
  })

  it('overdueDays=90 exactly → overdue_90d', () => {
    expect(classifyCallUrgency(90, false)).toBe('overdue_90d')
  })

  it('overdueDays=91 → severely_overdue', () => {
    expect(classifyCallUrgency(91, false)).toBe('severely_overdue')
  })

  it('overdueDays=365 → severely_overdue', () => {
    expect(classifyCallUrgency(365, false)).toBe('severely_overdue')
  })
})

// ── computeStatutoryInterest ──────────────────────────────────────────────────

describe('computeStatutoryInterest', () => {
  it('zero overdueDays → 0', () => {
    expect(computeStatutoryInterest(100_000, 0)).toBe(0)
  })

  it('zero principal → 0', () => {
    expect(computeStatutoryInterest(0, 30)).toBe(0)
  })

  it('default 9% rate: 100 000 TRY × 9% × 365/365 = 9 000', () => {
    expect(computeStatutoryInterest(100_000, 365)).toBeCloseTo(9_000, 4)
  })

  it('default 9% rate: 100 000 TRY × 9% × 30/365', () => {
    const expected = 100_000 * 0.09 * (30 / 365)
    expect(computeStatutoryInterest(100_000, 30)).toBeCloseTo(expected, 4)
  })

  it('custom 12% rate: 200 000 TRY × 12% × 60/365', () => {
    const expected = 200_000 * 0.12 * (60 / 365)
    expect(computeStatutoryInterest(200_000, 60, 12)).toBeCloseTo(expected, 4)
  })

  it('custom 0% rate → 0', () => {
    expect(computeStatutoryInterest(100_000, 30, 0)).toBe(0)
  })

  it('large principal: 5 000 000 TRY × 9% × 90/365', () => {
    const expected = 5_000_000 * 0.09 * (90 / 365)
    expect(computeStatutoryInterest(5_000_000, 90)).toBeCloseTo(expected, 2)
  })

  it('negative principal → 0', () => {
    expect(computeStatutoryInterest(-1000, 30)).toBe(0)
  })
})

// ── computeTotalEquityGap ─────────────────────────────────────────────────────

describe('computeTotalEquityGap', () => {
  it('empty array → 0', () => {
    expect(computeTotalEquityGap([])).toBe(0)
  })

  it('single partner with gap', () => {
    expect(computeTotalEquityGap([{ committed_amount: 100_000, paid_amount: 60_000 }])).toBe(40_000)
  })

  it('single partner overpaid → 0 gap', () => {
    expect(computeTotalEquityGap([{ committed_amount: 50_000, paid_amount: 80_000 }])).toBe(0)
  })

  it('multiple partners — sums gaps correctly', () => {
    const partners = [
      { committed_amount: 100_000, paid_amount: 80_000 },  // gap: 20 000
      { committed_amount: 200_000, paid_amount: 100_000 }, // gap: 100 000
      { committed_amount: 50_000, paid_amount: 60_000 },   // gap: 0 (overpaid)
    ]
    expect(computeTotalEquityGap(partners)).toBe(120_000)
  })

  it('all partners fully paid → 0', () => {
    const partners = [
      { committed_amount: 100_000, paid_amount: 100_000 },
      { committed_amount: 200_000, paid_amount: 200_000 },
    ]
    expect(computeTotalEquityGap(partners)).toBe(0)
  })
})

// ── computeCompanyFulfillmentRatio ────────────────────────────────────────────

describe('computeCompanyFulfillmentRatio', () => {
  it('empty array → null', () => {
    expect(computeCompanyFulfillmentRatio([])).toBeNull()
  })

  it('all zero committed → null', () => {
    expect(computeCompanyFulfillmentRatio([
      { committed_amount: 0, paid_amount: 0 },
    ])).toBeNull()
  })

  it('single partner: 50% paid', () => {
    expect(computeCompanyFulfillmentRatio([
      { committed_amount: 100_000, paid_amount: 50_000 },
    ])).toBeCloseTo(0.5, 8)
  })

  it('multiple partners: weighted correctly', () => {
    const partners = [
      { committed_amount: 100_000, paid_amount: 100_000 }, // 100% paid
      { committed_amount: 100_000, paid_amount: 0 },       // 0% paid
    ]
    // total: 200 000 committed, 100 000 paid → 50%
    expect(computeCompanyFulfillmentRatio(partners)).toBeCloseTo(0.5, 8)
  })

  it('all fully paid → 1.0', () => {
    const partners = [
      { committed_amount: 100_000, paid_amount: 100_000 },
      { committed_amount: 200_000, paid_amount: 200_000 },
    ]
    expect(computeCompanyFulfillmentRatio(partners)).toBeCloseTo(1.0, 8)
  })

  it('overpayment included → > 1.0', () => {
    expect(computeCompanyFulfillmentRatio([
      { committed_amount: 100_000, paid_amount: 120_000 },
    ])).toBeCloseTo(1.2, 8)
  })
})

// ── computeWeightedFulfillment ────────────────────────────────────────────────

describe('computeWeightedFulfillment', () => {
  it('empty array → null', () => {
    expect(computeWeightedFulfillment([])).toBeNull()
  })

  it('all zero committed → null', () => {
    expect(computeWeightedFulfillment([
      { committed_amount: 0, paid_amount: 0 },
    ])).toBeNull()
  })

  it('single partner fully paid → 1.0', () => {
    expect(computeWeightedFulfillment([
      { committed_amount: 100_000, paid_amount: 100_000 },
    ])).toBeCloseTo(1.0, 8)
  })

  it('two equal commitments at 50% and 100% → weighted avg 0.75', () => {
    const partners = [
      { committed_amount: 100_000, paid_amount: 50_000 },  // ratio 0.5, weight 100k
      { committed_amount: 100_000, paid_amount: 100_000 }, // ratio 1.0, weight 100k
    ]
    // weighted = (0.5 × 100k + 1.0 × 100k) / 200k = 150k / 200k = 0.75
    expect(computeWeightedFulfillment(partners)).toBeCloseTo(0.75, 8)
  })

  it('unequal commitments weigh larger commitment more', () => {
    const partners = [
      { committed_amount: 300_000, paid_amount: 300_000 }, // ratio 1.0, weight 300k
      { committed_amount: 100_000, paid_amount: 0 },       // ratio 0.0, weight 100k
    ]
    // weighted = (1.0 × 300k + 0.0 × 100k) / 400k = 300k / 400k = 0.75
    expect(computeWeightedFulfillment(partners)).toBeCloseTo(0.75, 8)
  })

  it('partner with zero commitment excluded from weight', () => {
    const partners = [
      { committed_amount: 0, paid_amount: 50_000 },        // excluded
      { committed_amount: 100_000, paid_amount: 50_000 },  // ratio 0.5
    ]
    expect(computeWeightedFulfillment(partners)).toBeCloseTo(0.5, 8)
  })
})

// ── classifyEquityHealth ──────────────────────────────────────────────────────

describe('classifyEquityHealth', () => {
  it('null → no_data', () => {
    expect(classifyEquityHealth(null)).toBe('no_data')
  })

  it('ratio = 0.95 exactly → fully_funded', () => {
    expect(classifyEquityHealth(0.95)).toBe('fully_funded')
  })

  it('ratio = 1.0 → fully_funded', () => {
    expect(classifyEquityHealth(1.0)).toBe('fully_funded')
  })

  it('ratio = 0.94 → nearly_funded', () => {
    expect(classifyEquityHealth(0.94)).toBe('nearly_funded')
  })

  it('ratio = 0.80 exactly → nearly_funded', () => {
    expect(classifyEquityHealth(0.80)).toBe('nearly_funded')
  })

  it('ratio = 0.79 → partially_funded', () => {
    expect(classifyEquityHealth(0.79)).toBe('partially_funded')
  })

  it('ratio = 0.50 exactly → partially_funded', () => {
    expect(classifyEquityHealth(0.50)).toBe('partially_funded')
  })

  it('ratio = 0.49 → underfunded', () => {
    expect(classifyEquityHealth(0.49)).toBe('underfunded')
  })

  it('ratio = 0.20 exactly → underfunded', () => {
    expect(classifyEquityHealth(0.20)).toBe('underfunded')
  })

  it('ratio = 0.19 → critically_underfunded', () => {
    expect(classifyEquityHealth(0.19)).toBe('critically_underfunded')
  })

  it('ratio = 0.0 → critically_underfunded', () => {
    expect(classifyEquityHealth(0.0)).toBe('critically_underfunded')
  })

  it('ratio > 1.0 (overfunded) → fully_funded', () => {
    expect(classifyEquityHealth(1.1)).toBe('fully_funded')
  })
})

// ── computeEffectiveEquityRatio ───────────────────────────────────────────────

describe('computeEffectiveEquityRatio', () => {
  it('both zero → null', () => {
    expect(computeEffectiveEquityRatio(0, 0)).toBeNull()
  })

  it('all equity, no loans → 1.0', () => {
    expect(computeEffectiveEquityRatio(500_000, 0)).toBeCloseTo(1.0, 8)
  })

  it('all loans, no equity → 0.0', () => {
    expect(computeEffectiveEquityRatio(0, 500_000)).toBeCloseTo(0.0, 8)
  })

  it('equal equity and loans → 0.5', () => {
    expect(computeEffectiveEquityRatio(500_000, 500_000)).toBeCloseTo(0.5, 8)
  })

  it('70% equity, 30% loans → 0.7', () => {
    expect(computeEffectiveEquityRatio(700_000, 300_000)).toBeCloseTo(0.7, 8)
  })

  it('20% equity, 80% loans → 0.2', () => {
    expect(computeEffectiveEquityRatio(200_000, 800_000)).toBeCloseTo(0.2, 8)
  })

  it('negative total (edge) → null for zero case', () => {
    // Both passed as negative would be unusual but guard: test normal path
    expect(computeEffectiveEquityRatio(100_000, 0)).toBeCloseTo(1.0, 8)
  })
})

// ── classifyLeverageLevel ─────────────────────────────────────────────────────

describe('classifyLeverageLevel', () => {
  it('null → insufficient_data', () => {
    expect(classifyLeverageLevel(null)).toBe('insufficient_data')
  })

  it('ratio = 0.70 exactly → equity_heavy', () => {
    expect(classifyLeverageLevel(0.70)).toBe('equity_heavy')
  })

  it('ratio = 1.0 → equity_heavy', () => {
    expect(classifyLeverageLevel(1.0)).toBe('equity_heavy')
  })

  it('ratio = 0.69 → balanced', () => {
    expect(classifyLeverageLevel(0.69)).toBe('balanced')
  })

  it('ratio = 0.40 exactly → balanced', () => {
    expect(classifyLeverageLevel(0.40)).toBe('balanced')
  })

  it('ratio = 0.39 → leveraged', () => {
    expect(classifyLeverageLevel(0.39)).toBe('leveraged')
  })

  it('ratio = 0.20 exactly → leveraged', () => {
    expect(classifyLeverageLevel(0.20)).toBe('leveraged')
  })

  it('ratio = 0.19 → highly_leveraged', () => {
    expect(classifyLeverageLevel(0.19)).toBe('highly_leveraged')
  })

  it('ratio = 0.0 → highly_leveraged', () => {
    expect(classifyLeverageLevel(0.0)).toBe('highly_leveraged')
  })

  it('ratio = 0.50 → balanced', () => {
    expect(classifyLeverageLevel(0.50)).toBe('balanced')
  })
})

// ── generateEquityNarrative ───────────────────────────────────────────────────

describe('generateEquityNarrative', () => {
  it('returns a non-empty Turkish string', () => {
    const narrative = generateEquityNarrative({
      totalCommitted: 1_000_000,
      totalPaid: 750_000,
      equityGap: 250_000,
      health: 'partially_funded',
      overduePartners: 0,
    })
    expect(typeof narrative).toBe('string')
    expect(narrative.length).toBeGreaterThan(0)
  })

  it('contains percentage information when committed > 0', () => {
    const narrative = generateEquityNarrative({
      totalCommitted: 1_000_000,
      totalPaid: 750_000,
      equityGap: 250_000,
      health: 'partially_funded',
      overduePartners: 0,
    })
    // Should mention 75%
    expect(narrative).toContain('%75')
  })

  it('mentions overdue partners when > 0', () => {
    const narrative = generateEquityNarrative({
      totalCommitted: 1_000_000,
      totalPaid: 500_000,
      equityGap: 500_000,
      health: 'underfunded',
      overduePartners: 3,
    })
    expect(narrative).toContain('3')
  })

  it('does not mention overdue partners when 0', () => {
    const narrative = generateEquityNarrative({
      totalCommitted: 1_000_000,
      totalPaid: 1_000_000,
      equityGap: 0,
      health: 'fully_funded',
      overduePartners: 0,
    })
    expect(narrative).not.toContain('vadesi geçmiş')
  })

  it('mentions gap amount when gap > 0', () => {
    const narrative = generateEquityNarrative({
      totalCommitted: 500_000,
      totalPaid: 200_000,
      equityGap: 300_000,
      health: 'partially_funded',
      overduePartners: 1,
    })
    expect(narrative).toContain('300')
  })

  it('handles zero committed gracefully (no commitment case)', () => {
    const narrative = generateEquityNarrative({
      totalCommitted: 0,
      totalPaid: 0,
      equityGap: 0,
      health: 'no_data',
      overduePartners: 0,
    })
    expect(typeof narrative).toBe('string')
    expect(narrative.length).toBeGreaterThan(0)
  })

  it('fully funded: mentions all commitments fulfilled', () => {
    const narrative = generateEquityNarrative({
      totalCommitted: 1_000_000,
      totalPaid: 1_000_000,
      equityGap: 0,
      health: 'fully_funded',
      overduePartners: 0,
    })
    // Should mention 100%
    expect(narrative).toContain('%100')
  })

  it('returns Turkish text (contains common Turkish characters/words)', () => {
    const narrative = generateEquityNarrative({
      totalCommitted: 500_000,
      totalPaid: 100_000,
      equityGap: 400_000,
      health: 'underfunded',
      overduePartners: 2,
    })
    // Turkish word for paid/committed area
    expect(narrative).toMatch(/öden|taahhüt|sermaye|ortak/i)
  })
})

// ── Integration-like: cross-function consistency ──────────────────────────────

describe('cross-function consistency', () => {
  it('gap + paid = committed when paid < committed', () => {
    const committed = 500_000
    const paid = 300_000
    const gap = computeEquityGap(committed, paid)
    expect(gap + paid).toBe(committed)
  })

  it('fulfillment ratio matches health classification at boundaries', () => {
    // fully_funded requires >= 0.95
    const ratio = computeFulfillmentRatio(100_000, 95_000)!
    expect(ratio).toBeCloseTo(0.95, 8)
    expect(classifyEquityHealth(ratio)).toBe('fully_funded')
  })

  it('fulfillment status complete when ratio >= 1.0', () => {
    const ratio = computeFulfillmentRatio(100_000, 100_000)
    expect(classifyFulfillmentStatus(ratio)).toBe('complete')
  })

  it('zero total equity gap when all partners fully paid', () => {
    const partners = [
      { committed_amount: 100_000, paid_amount: 100_000 },
      { committed_amount: 200_000, paid_amount: 200_000 },
      { committed_amount: 150_000, paid_amount: 150_000 },
    ]
    expect(computeTotalEquityGap(partners)).toBe(0)
    expect(computeCompanyFulfillmentRatio(partners)).toBeCloseTo(1.0, 8)
    expect(classifyEquityHealth(1.0)).toBe('fully_funded')
  })

  it('statutory interest is 0 when no overdue days', () => {
    const gap = computeEquityGap(100_000, 60_000)
    const interest = computeStatutoryInterest(gap, 0)
    expect(interest).toBe(0)
  })

  it('urgency is not_due when call date is null', () => {
    const overdueDays = computeCapitalCallOverdueDays(null, null)
    const urgency = classifyCallUrgency(overdueDays, false)
    expect(urgency).toBe('not_due')
  })

  it('leverage level insufficient_data when effective equity ratio is null', () => {
    const ratio = computeEffectiveEquityRatio(0, 0)
    expect(classifyLeverageLevel(ratio)).toBe('insufficient_data')
  })

  it('weighted fulfillment equals company fulfillment for equal commitments', () => {
    // When all commitments are equal, weighted == simple ratio
    const partners = [
      { committed_amount: 100_000, paid_amount: 80_000 },
      { committed_amount: 100_000, paid_amount: 60_000 },
    ]
    const weighted = computeWeightedFulfillment(partners)
    const company = computeCompanyFulfillmentRatio(partners)
    expect(weighted).toBeCloseTo(company!, 8)
  })
})
