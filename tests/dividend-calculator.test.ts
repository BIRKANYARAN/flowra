/**
 * dividend-calculator.test.ts — Dividend Calculator unit tests
 *
 * Tests cover:
 *   - computeLegalReserveDeduction (profit/capital/reserve combos, capping, <=0 profit)
 *   - computeDistributableProfit (with/without board retained; negative → 0)
 *   - computeWithholdingTax (10% default, custom rate)
 *   - computeNetDividend (gross - tax)
 *   - distributeGrossDividend (equal/unequal splits, 3 partners rounding, single, empty)
 *   - computeYtdDividendsPaid (multiple events, filtering, non-DIVIDEND_PAID excluded)
 *   - checkTtk509Guard (allowed, blocked, exact boundary, zero distributable)
 *   - checkEquityGapWarning (gap=0→no warning, gap>0→Turkish warning text)
 *   - computeOptimalDistribution (default 0.3 retention, custom, zero profit)
 *   - classifyDistributionReadiness (all 4 states)
 *   - generateDistributionNarrative (all 4 readiness states)
 *   - computeDividendYield (normal, zero capital → null)
 *   - computePayoutRatio (normal, capped at 100, zero/negative profit → null)
 *
 * Run: npx vitest run tests/dividend-calculator.test.ts
 */

import { describe, it, expect } from 'vitest'
import {
  computeLegalReserveDeduction,
  computeDistributableProfit,
  computeWithholdingTax,
  computeNetDividend,
  distributeGrossDividend,
  computeYtdDividendsPaid,
  checkTtk509Guard,
  checkEquityGapWarning,
  computeOptimalDistribution,
  classifyDistributionReadiness,
  generateDistributionNarrative,
  computeDividendYield,
  computePayoutRatio,
} from '../lib/services/pcle/dividend-calculator.service'

// ── computeLegalReserveDeduction ─────────────────────────────────────────────

describe('computeLegalReserveDeduction', () => {
  it('returns 0 when periodProfit is 0', () => {
    expect(computeLegalReserveDeduction(0, 500_000, 0)).toBe(0)
  })

  it('returns 0 when periodProfit is negative', () => {
    expect(computeLegalReserveDeduction(-100_000, 500_000, 0)).toBe(0)
  })

  it('returns 5% of profit when cap is not limiting', () => {
    // 5% of 1_000_000 = 50_000; cap = 500_000 * 0.20 - 0 = 100_000 → min(50_000, 100_000) = 50_000
    expect(computeLegalReserveDeduction(1_000_000, 500_000, 0)).toBe(50_000)
  })

  it('returns cap when 5% of profit exceeds remaining reserve space', () => {
    // 5% of 2_000_000 = 100_000; cap = 500_000 * 0.20 - 90_000 = 10_000 → min(100_000, 10_000) = 10_000
    expect(computeLegalReserveDeduction(2_000_000, 500_000, 90_000)).toBe(10_000)
  })

  it('returns 0 when existing reserves already exceed 20% of paid-in capital', () => {
    // cap = 500_000 * 0.20 - 150_000 = -50_000 → max(0, -50_000) = 0
    expect(computeLegalReserveDeduction(1_000_000, 500_000, 150_000)).toBe(0)
  })

  it('returns 0 when existing reserves exactly equal 20% of paid-in capital', () => {
    // cap = 500_000 * 0.20 - 100_000 = 0
    expect(computeLegalReserveDeduction(1_000_000, 500_000, 100_000)).toBe(0)
  })

  it('handles zero paid-in capital: cap = max(0, 0 - 0) = 0 → returns 0', () => {
    expect(computeLegalReserveDeduction(500_000, 0, 0)).toBe(0)
  })

  it('handles small profit amounts correctly', () => {
    // 5% of 100 = 5; cap = 10_000 * 0.20 - 0 = 2_000 → min(5, 2_000) = 5
    expect(computeLegalReserveDeduction(100, 10_000, 0)).toBe(5)
  })

  it('handles profits with fractional values', () => {
    // 5% of 333.33 = 16.67
    const result = computeLegalReserveDeduction(333.33, 1_000_000, 0)
    expect(result).toBeCloseTo(16.67, 1)
  })

  it('large existing reserves scenario — returns 0', () => {
    expect(computeLegalReserveDeduction(5_000_000, 1_000_000, 300_000)).toBe(0)
  })
})

// ── computeDistributableProfit ────────────────────────────────────────────────

describe('computeDistributableProfit', () => {
  it('subtracts legal reserve from period profit', () => {
    expect(computeDistributableProfit(1_000_000, 50_000)).toBe(950_000)
  })

  it('subtracts board retained amount as well', () => {
    expect(computeDistributableProfit(1_000_000, 50_000, 100_000)).toBe(850_000)
  })

  it('returns 0 when deductions exceed profit', () => {
    expect(computeDistributableProfit(50_000, 60_000)).toBe(0)
  })

  it('returns 0 for zero profit with zero deductions', () => {
    expect(computeDistributableProfit(0, 0)).toBe(0)
  })

  it('returns 0 for negative profit', () => {
    expect(computeDistributableProfit(-500_000, 0)).toBe(0)
  })

  it('defaults boardRetainedAmount to 0 when not provided', () => {
    expect(computeDistributableProfit(500_000, 25_000)).toBe(475_000)
  })

  it('handles exact deduction equals profit — returns 0', () => {
    expect(computeDistributableProfit(100_000, 100_000)).toBe(0)
  })

  it('large board retention scenario', () => {
    // profit 2_000_000, reserve 100_000, board 1_500_000 → 400_000
    expect(computeDistributableProfit(2_000_000, 100_000, 1_500_000)).toBe(400_000)
  })
})

// ── computeWithholdingTax ─────────────────────────────────────────────────────

describe('computeWithholdingTax', () => {
  it('applies default 10% withholding rate', () => {
    expect(computeWithholdingTax(100_000)).toBe(10_000)
  })

  it('applies custom withholding rate', () => {
    expect(computeWithholdingTax(100_000, 0.15)).toBe(15_000)
  })

  it('returns 0 for zero gross dividend', () => {
    expect(computeWithholdingTax(0)).toBe(0)
  })

  it('handles fractional results correctly (rounds to 2 decimal places)', () => {
    // 333.33 * 0.10 = 33.33 (rounded)
    expect(computeWithholdingTax(333.33)).toBeCloseTo(33.33, 2)
  })

  it('applies 0% withholding rate (exempt)', () => {
    expect(computeWithholdingTax(500_000, 0)).toBe(0)
  })

  it('handles large dividends', () => {
    expect(computeWithholdingTax(10_000_000)).toBe(1_000_000)
  })
})

// ── computeNetDividend ────────────────────────────────────────────────────────

describe('computeNetDividend', () => {
  it('subtracts withholding tax from gross dividend', () => {
    expect(computeNetDividend(100_000, 10_000)).toBe(90_000)
  })

  it('returns 0 for zero gross with zero tax', () => {
    expect(computeNetDividend(0, 0)).toBe(0)
  })

  it('handles full withholding (exotic 100% rate scenario)', () => {
    expect(computeNetDividend(50_000, 50_000)).toBe(0)
  })

  it('rounds to 2 decimal places', () => {
    expect(computeNetDividend(100.01, 10.01)).toBeCloseTo(90.00, 2)
  })
})

// ── distributeGrossDividend ───────────────────────────────────────────────────

describe('distributeGrossDividend', () => {
  it('returns empty array when no partners', () => {
    expect(distributeGrossDividend(500_000, [])).toEqual([])
  })

  it('allocates 100% to single partner', () => {
    const result = distributeGrossDividend(100_000, [{ partner_id: 'p1', share_pct: 100 }])
    expect(result).toHaveLength(1)
    expect(result[0].gross_dividend).toBe(100_000)
    expect(result[0].withholding_tax).toBe(10_000)
    expect(result[0].net_dividend).toBe(90_000)
    expect(result[0].partner_id).toBe('p1')
    expect(result[0].share_pct).toBe(100)
  })

  it('splits equally between 2 partners (50/50)', () => {
    const result = distributeGrossDividend(200_000, [
      { partner_id: 'p1', share_pct: 50 },
      { partner_id: 'p2', share_pct: 50 },
    ])
    expect(result[0].gross_dividend).toBe(100_000)
    expect(result[1].gross_dividend).toBe(100_000)
  })

  it('handles unequal shares (60/40)', () => {
    const result = distributeGrossDividend(100_000, [
      { partner_id: 'p1', share_pct: 60 },
      { partner_id: 'p2', share_pct: 40 },
    ])
    expect(result[0].gross_dividend).toBe(60_000)
    expect(result[1].gross_dividend).toBe(40_000)
  })

  it('last partner absorbs rounding remainder with 3 partners', () => {
    // 100 split into 33.33/33.33/33.34
    const result = distributeGrossDividend(100, [
      { partner_id: 'p1', share_pct: 33.33 },
      { partner_id: 'p2', share_pct: 33.33 },
      { partner_id: 'p3', share_pct: 33.34 },
    ])
    const total = result.reduce((s, r) => s + r.gross_dividend, 0)
    expect(Math.abs(total - 100)).toBeLessThan(0.01)
  })

  it('applies custom withholding rate', () => {
    const result = distributeGrossDividend(
      100_000,
      [{ partner_id: 'p1', share_pct: 100 }],
      0.15,
    )
    expect(result[0].withholding_tax).toBe(15_000)
    expect(result[0].net_dividend).toBe(85_000)
  })

  it('gross = withholding + net for each partner', () => {
    const result = distributeGrossDividend(300_000, [
      { partner_id: 'p1', share_pct: 60 },
      { partner_id: 'p2', share_pct: 40 },
    ])
    for (const r of result) {
      expect(Math.abs(r.gross_dividend - r.withholding_tax - r.net_dividend)).toBeLessThan(0.01)
    }
  })

  it('handles zero total gross dividend', () => {
    const result = distributeGrossDividend(0, [
      { partner_id: 'p1', share_pct: 60 },
      { partner_id: 'p2', share_pct: 40 },
    ])
    for (const r of result) {
      expect(r.gross_dividend).toBe(0)
      expect(r.withholding_tax).toBe(0)
      expect(r.net_dividend).toBe(0)
    }
  })

  it('preserves partner_id correctly', () => {
    const result = distributeGrossDividend(50_000, [
      { partner_id: 'uuid-aaa', share_pct: 70 },
      { partner_id: 'uuid-bbb', share_pct: 30 },
    ])
    expect(result[0].partner_id).toBe('uuid-aaa')
    expect(result[1].partner_id).toBe('uuid-bbb')
  })

  it('handles 3 equal partners with large amount', () => {
    const result = distributeGrossDividend(3_000_000, [
      { partner_id: 'p1', share_pct: 33.33 },
      { partner_id: 'p2', share_pct: 33.33 },
      { partner_id: 'p3', share_pct: 33.34 },
    ])
    const grossTotal = result.reduce((s, r) => s + r.gross_dividend, 0)
    expect(Math.abs(grossTotal - 3_000_000)).toBeLessThan(0.01)
  })
})

// ── computeYtdDividendsPaid ───────────────────────────────────────────────────

describe('computeYtdDividendsPaid', () => {
  it('returns 0 for empty events array', () => {
    expect(computeYtdDividendsPaid([], 'p1')).toBe(0)
  })

  it('sums DIVIDEND_PAID events', () => {
    const events = [
      { event_type: 'DIVIDEND_PAID', amount_try: 50_000 },
      { event_type: 'DIVIDEND_PAID', amount_try: 30_000 },
    ]
    expect(computeYtdDividendsPaid(events, 'p1')).toBe(80_000)
  })

  it('excludes non-DIVIDEND_PAID events', () => {
    const events = [
      { event_type: 'DIVIDEND_PAID', amount_try: 50_000 },
      { event_type: 'COMPENSATION_PAYMENT', amount_try: 20_000 },
      { event_type: 'CAPITAL_CONTRIBUTION', amount_try: 100_000 },
    ]
    expect(computeYtdDividendsPaid(events, 'p1')).toBe(50_000)
  })

  it('returns 0 when only non-DIVIDEND_PAID events exist', () => {
    const events = [
      { event_type: 'COMPENSATION_PAYMENT', amount_try: 20_000 },
      { event_type: 'LOAN_REPAYMENT', amount_try: 10_000 },
    ]
    expect(computeYtdDividendsPaid(events, 'p1')).toBe(0)
  })

  it('sums multiple DIVIDEND_PAID events for single partner', () => {
    const events = [
      { event_type: 'DIVIDEND_PAID', amount_try: 10_000 },
      { event_type: 'DIVIDEND_PAID', amount_try: 15_000 },
      { event_type: 'DIVIDEND_PAID', amount_try: 25_000 },
    ]
    expect(computeYtdDividendsPaid(events, 'p2')).toBe(50_000)
  })

  it('handles fractional amounts', () => {
    const events = [
      { event_type: 'DIVIDEND_PAID', amount_try: 100.50 },
      { event_type: 'DIVIDEND_PAID', amount_try: 200.25 },
    ]
    expect(computeYtdDividendsPaid(events, 'p1')).toBeCloseTo(300.75, 2)
  })
})

// ── checkTtk509Guard ──────────────────────────────────────────────────────────

describe('checkTtk509Guard', () => {
  it('allows distribution within distributable profit', () => {
    const result = checkTtk509Guard(700_000, 1_000_000)
    expect(result.allowed).toBe(true)
    expect(result.reason).toBeNull()
  })

  it('blocks distribution exceeding distributable profit', () => {
    const result = checkTtk509Guard(1_200_000, 1_000_000)
    expect(result.allowed).toBe(false)
    expect(result.reason).not.toBeNull()
    expect(result.reason).toContain('TTK 509')
  })

  it('allows distribution exactly equal to distributable profit (boundary)', () => {
    const result = checkTtk509Guard(1_000_000, 1_000_000)
    expect(result.allowed).toBe(true)
    expect(result.reason).toBeNull()
  })

  it('blocks any distribution when distributable profit is zero', () => {
    const result = checkTtk509Guard(1, 0)
    expect(result.allowed).toBe(false)
    expect(result.reason).not.toBeNull()
  })

  it('allows zero distribution against zero profit', () => {
    const result = checkTtk509Guard(0, 0)
    expect(result.allowed).toBe(true)
  })

  it('reason string contains distributable profit amount when blocked', () => {
    const result = checkTtk509Guard(500_000, 100_000)
    expect(result.reason).toContain('100')
  })

  it('allows small distribution vs large profit', () => {
    const result = checkTtk509Guard(1, 10_000_000)
    expect(result.allowed).toBe(true)
  })
})

// ── checkEquityGapWarning ─────────────────────────────────────────────────────

describe('checkEquityGapWarning', () => {
  it('returns no warning when equity gap is 0', () => {
    const result = checkEquityGapWarning(0)
    expect(result.hasWarning).toBe(false)
    expect(result.warning).toBeNull()
  })

  it('returns no warning when equity gap is negative (over-paid)', () => {
    const result = checkEquityGapWarning(-1000)
    expect(result.hasWarning).toBe(false)
    expect(result.warning).toBeNull()
  })

  it('returns warning when equity gap is positive', () => {
    const result = checkEquityGapWarning(50_000)
    expect(result.hasWarning).toBe(true)
    expect(result.warning).not.toBeNull()
  })

  it('warning text contains TTK 588 reference', () => {
    const result = checkEquityGapWarning(100_000)
    expect(result.warning).toContain('TTK 588')
  })

  it('warning text mentions equity gap amount', () => {
    const result = checkEquityGapWarning(75_000)
    expect(result.warning).toContain('75')
  })

  it('warning is Turkish language', () => {
    const result = checkEquityGapWarning(100_000)
    // Should contain Turkish words like 'sermaye' or 'taahhüt'
    expect(result.warning).toMatch(/sermaye|taahhüt|temettü/i)
  })

  it('large equity gap still returns warning (not blocker)', () => {
    const result = checkEquityGapWarning(999_999_999)
    expect(result.hasWarning).toBe(true)
    // It's a warning, not a blocker — hasWarning is true but no 'blocked' concept here
  })
})

// ── computeOptimalDistribution ────────────────────────────────────────────────

describe('computeOptimalDistribution', () => {
  it('applies default 30% retention', () => {
    // 1_000_000 * (1 - 0.3) = 700_000
    expect(computeOptimalDistribution(1_000_000)).toBe(700_000)
  })

  it('applies custom retention ratio', () => {
    // 1_000_000 * (1 - 0.5) = 500_000
    expect(computeOptimalDistribution(1_000_000, 0.5)).toBe(500_000)
  })

  it('returns 0 for zero distributable profit', () => {
    expect(computeOptimalDistribution(0)).toBe(0)
  })

  it('returns 0 for negative distributable profit', () => {
    expect(computeOptimalDistribution(-100_000)).toBe(0)
  })

  it('with 0% retention returns full distributable profit', () => {
    expect(computeOptimalDistribution(500_000, 0)).toBe(500_000)
  })

  it('with 100% retention returns 0', () => {
    expect(computeOptimalDistribution(500_000, 1.0)).toBe(0)
  })

  it('caps result at distributable profit (cannot exceed it)', () => {
    // Even with negative retention (unusual), cap at distributableProfit
    const result = computeOptimalDistribution(500_000, 0)
    expect(result).toBeLessThanOrEqual(500_000)
  })

  it('handles small profit', () => {
    expect(computeOptimalDistribution(100, 0.3)).toBeCloseTo(70, 2)
  })
})

// ── classifyDistributionReadiness ─────────────────────────────────────────────

describe('classifyDistributionReadiness', () => {
  it("returns 'insufficient_profit' when distributableProfit is 0", () => {
    expect(classifyDistributionReadiness(0, 0, 0)).toBe('insufficient_profit')
  })

  it("returns 'insufficient_profit' when distributableProfit is negative", () => {
    expect(classifyDistributionReadiness(-1, 0, 0)).toBe('insufficient_profit')
  })

  it("returns 'blocked' when TTK 509 guard fails (proposed > distributable)", () => {
    expect(classifyDistributionReadiness(100_000, 200_000, 0)).toBe('blocked')
  })

  it("returns 'blocked' before 'ready_with_warning' when both blocked and equity gap exist", () => {
    // TTK 509 violation takes priority over equity gap
    expect(classifyDistributionReadiness(100_000, 150_000, 50_000)).toBe('blocked')
  })

  it("returns 'ready_with_warning' when profit ok but equity gap exists", () => {
    expect(classifyDistributionReadiness(1_000_000, 700_000, 50_000)).toBe('ready_with_warning')
  })

  it("returns 'ready' when all conditions clear", () => {
    expect(classifyDistributionReadiness(1_000_000, 700_000, 0)).toBe('ready')
  })

  it("returns 'ready' when proposed equals distributable profit exactly", () => {
    expect(classifyDistributionReadiness(500_000, 500_000, 0)).toBe('ready')
  })

  it("returns 'ready_with_warning' not 'ready' even with small equity gap", () => {
    expect(classifyDistributionReadiness(500_000, 300_000, 1)).toBe('ready_with_warning')
  })
})

// ── generateDistributionNarrative ─────────────────────────────────────────────

describe('generateDistributionNarrative', () => {
  it("generates Turkish narrative for 'ready' state", () => {
    const text = generateDistributionNarrative('ready', 1_000_000, 700_000, 3)
    expect(typeof text).toBe('string')
    expect(text.length).toBeGreaterThan(10)
    // Should mention partner count or readiness
    expect(text).toMatch(/hazır|ortak|dağıtıl/i)
  })

  it("generates Turkish narrative for 'ready_with_warning' state", () => {
    const text = generateDistributionNarrative('ready_with_warning', 1_000_000, 700_000, 2)
    expect(text).toMatch(/taahhüt|uyarı|sermaye/i)
  })

  it("generates Turkish narrative for 'insufficient_profit' state", () => {
    const text = generateDistributionNarrative('insufficient_profit', 0, 0, 2)
    expect(text).toMatch(/kâr|dağıtım|yapılamaz/i)
  })

  it("generates Turkish narrative for 'blocked' state", () => {
    const text = generateDistributionNarrative('blocked', 100_000, 200_000, 2)
    expect(text).toMatch(/TTK 509|engellen|ihlal/i)
  })

  it("'ready' narrative mentions proposed gross amount", () => {
    const text = generateDistributionNarrative('ready', 1_000_000, 700_000, 3)
    expect(text).toContain('700')
  })

  it("'insufficient_profit' narrative mentions inability to distribute", () => {
    const text = generateDistributionNarrative('insufficient_profit', 0, 0, 5)
    expect(text).toMatch(/yapılamaz|bulunmamaktadır/i)
  })

  it("'blocked' narrative mentions both proposed and distributable amounts", () => {
    const text = generateDistributionNarrative('blocked', 100_000, 200_000, 2)
    expect(text).toContain('100')
    expect(text).toContain('200')
  })

  it("narrative is a non-empty string for all 4 readiness states", () => {
    const states: Array<ReturnType<typeof classifyDistributionReadiness>> = [
      'ready', 'ready_with_warning', 'insufficient_profit', 'blocked',
    ]
    for (const state of states) {
      const text = generateDistributionNarrative(state, 500_000, 350_000, 2)
      expect(text.trim().length).toBeGreaterThan(0)
    }
  })
})

// ── computeDividendYield ──────────────────────────────────────────────────────

describe('computeDividendYield', () => {
  it('computes dividend yield correctly', () => {
    // 100_000 / 1_000_000 * 100 = 10%
    expect(computeDividendYield(100_000, 1_000_000)).toBe(10)
  })

  it('returns null when paidInCapital is 0', () => {
    expect(computeDividendYield(100_000, 0)).toBeNull()
  })

  it('handles zero dividend (0% yield)', () => {
    expect(computeDividendYield(0, 500_000)).toBe(0)
  })

  it('handles large yield correctly', () => {
    // 500_000 / 1_000_000 * 100 = 50%
    expect(computeDividendYield(500_000, 1_000_000)).toBe(50)
  })

  it('rounds to 2 decimal places', () => {
    // 1 / 3 * 100 = 33.33...
    const result = computeDividendYield(1, 3)
    expect(result).not.toBeNull()
    expect(String(result!).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(2)
  })
})

// ── computePayoutRatio ────────────────────────────────────────────────────────

describe('computePayoutRatio', () => {
  it('computes payout ratio correctly', () => {
    // 700_000 / 1_000_000 * 100 = 70%
    expect(computePayoutRatio(700_000, 1_000_000)).toBe(70)
  })

  it('returns null when periodProfit is 0', () => {
    expect(computePayoutRatio(100_000, 0)).toBeNull()
  })

  it('returns null when periodProfit is negative', () => {
    expect(computePayoutRatio(100_000, -500_000)).toBeNull()
  })

  it('caps ratio at 100% (TTK 509 — cannot pay more than profit)', () => {
    // 1_200_000 / 1_000_000 * 100 = 120 → capped to 100
    expect(computePayoutRatio(1_200_000, 1_000_000)).toBe(100)
  })

  it('returns 100 exactly when dividend equals profit', () => {
    expect(computePayoutRatio(1_000_000, 1_000_000)).toBe(100)
  })

  it('handles low payout ratio', () => {
    // 100_000 / 5_000_000 * 100 = 2%
    expect(computePayoutRatio(100_000, 5_000_000)).toBe(2)
  })

  it('handles zero dividend (0% payout)', () => {
    expect(computePayoutRatio(0, 1_000_000)).toBe(0)
  })

  it('rounds to 2 decimal places', () => {
    const result = computePayoutRatio(1, 3)
    expect(result).not.toBeNull()
    expect(String(result!).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(2)
  })
})
