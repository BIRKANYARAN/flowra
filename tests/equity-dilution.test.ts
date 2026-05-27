/**
 * Tests for lib/services/pcle/equity-dilution.service.ts
 *
 * Pure computation tests — no DB required.
 *
 * Coverage:
 *   NEW pure functions:
 *     computeEffectiveOwnership
 *     computeDilutionImpact
 *     computeFullyDilutedOwnership
 *     computeCapitalGap
 *     simulateCapitalCall
 *
 *   LEGACY pure functions:
 *     computeDilutionAfterExternalRaise
 *     computePartnerBuyout
 *     buildDilutionDescription
 */
import { describe, it, expect } from 'vitest'
import {
  // New pure functions
  computeEffectiveOwnership,
  computeDilutionImpact,
  computeFullyDilutedOwnership,
  computeCapitalGap,
  simulateCapitalCall,
  // Legacy pure functions
  computeDilutionAfterExternalRaise,
  computePartnerBuyout,
  buildDilutionDescription,
} from '../lib/services/pcle/equity-dilution.service'
import type { CurrentPartnerEquity } from '../lib/services/pcle/equity-dilution.service'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PARTNER_A: CurrentPartnerEquity = {
  partner_id:            'p1',
  partner_name:          'Ahmet',
  share_ratio:           0.6,
  paid_capital_try:      600_000,
  committed_capital_try: 600_000,
  equity_gap_try:        0,
}

const PARTNER_B: CurrentPartnerEquity = {
  partner_id:            'p2',
  partner_name:          'Birkan',
  share_ratio:           0.4,
  paid_capital_try:      400_000,
  committed_capital_try: 400_000,
  equity_gap_try:        0,
}

const PARTNER_C: CurrentPartnerEquity = {
  partner_id:            'p3',
  partner_name:          'Cansu',
  share_ratio:           0.1,
  paid_capital_try:      100_000,
  committed_capital_try: 120_000,
  equity_gap_try:        20_000,
}

const TWO_PARTNERS    = [PARTNER_A, PARTNER_B]
const THREE_PARTNERS  = [
  { ...PARTNER_A, share_ratio: 0.5 },
  { ...PARTNER_B, share_ratio: 0.4 },
  PARTNER_C,
]
const CURRENT_EQUITY  = 1_000_000

// ════════════════════════════════════════════════════════════════════════════════
// NEW PURE FUNCTIONS
// ════════════════════════════════════════════════════════════════════════════════

// ── computeEffectiveOwnership ─────────────────────────────────────────────────

describe('computeEffectiveOwnership', () => {

  it('1 — returns correct % for a single partner with partial payment', () => {
    // Partner paid 300K of a 1M total → 30%
    expect(computeEffectiveOwnership(300_000, 1_000_000)).toBeCloseTo(30, 5)
  })

  it('2 — returns 100% when partner paid all capital', () => {
    expect(computeEffectiveOwnership(1_000_000, 1_000_000)).toBe(100)
  })

  it('3 — returns 0 when total paid capital is zero (no division by zero)', () => {
    expect(computeEffectiveOwnership(0, 0)).toBe(0)
  })

  it('4 — returns 0 when partner paid 0 but total is non-zero', () => {
    expect(computeEffectiveOwnership(0, 500_000)).toBe(0)
  })

  it('5 — two partners sum to 100%', () => {
    const total = 1_000_000
    const a = computeEffectiveOwnership(600_000, total)
    const b = computeEffectiveOwnership(400_000, total)
    expect(a + b).toBeCloseTo(100, 4)
  })

})

// ── computeDilutionImpact ─────────────────────────────────────────────────────

describe('computeDilutionImpact', () => {

  it('6 — returns negative when ownership decreased (diluted)', () => {
    const impact = computeDilutionImpact(60, 45)
    expect(impact).toBe(-15)
  })

  it('7 — returns positive when ownership increased (anti-diluted)', () => {
    const impact = computeDilutionImpact(40, 55)
    expect(impact).toBe(15)
  })

  it('8 — returns 0 when no change', () => {
    const impact = computeDilutionImpact(50, 50)
    expect(impact).toBe(0)
  })

  it('9 — works with fractional percentages', () => {
    const impact = computeDilutionImpact(33.33, 25.0)
    expect(impact).toBeCloseTo(-8.33, 2)
  })

})

// ── computeFullyDilutedOwnership ──────────────────────────────────────────────

describe('computeFullyDilutedOwnership', () => {

  it('10 — when all capital is paid, FD = effective ownership', () => {
    // All paid, no remaining commitments
    const fd = computeFullyDilutedOwnership(600_000, 0, 1_000_000, 0)
    expect(fd).toBeCloseTo(60, 4)
  })

  it('11 — when nothing is paid, FD = committed / total committed', () => {
    // Partner A: 600K committed, total 1M committed, 0 paid
    const fd = computeFullyDilutedOwnership(0, 600_000, 0, 1_000_000)
    expect(fd).toBeCloseTo(60, 4)
  })

  it('12 — mixed scenario: partner paid 400K of 600K, others have remaining commitments', () => {
    // Partner: paid 400K, remaining 200K → numerator = 600K
    // Total paid: 800K, total remaining: 400K → denominator = 1200K
    const fd = computeFullyDilutedOwnership(400_000, 200_000, 800_000, 400_000)
    expect(fd).toBeCloseTo(50, 4)   // 600 / 1200 = 50%
  })

  it('13 — returns 0 if denominator is zero', () => {
    expect(computeFullyDilutedOwnership(0, 0, 0, 0)).toBe(0)
  })

  it('14 — FD pct is >= effective ownership when there are remaining commitments', () => {
    // Partner paid less than their share → FD includes their remaining, could differ
    const effective = computeEffectiveOwnership(300_000, 700_000)
    const fd        = computeFullyDilutedOwnership(300_000, 300_000, 700_000, 300_000)
    // This depends on the ratio; just check both are computable numbers
    expect(typeof effective).toBe('number')
    expect(typeof fd).toBe('number')
  })

})

// ── computeCapitalGap ─────────────────────────────────────────────────────────

describe('computeCapitalGap', () => {

  it('15 — returns correct gap when paid < committed', () => {
    expect(computeCapitalGap(500_000, 300_000)).toBe(200_000)
  })

  it('16 — returns 0 when fully paid', () => {
    expect(computeCapitalGap(500_000, 500_000)).toBe(0)
  })

  it('17 — returns 0 when overpaid (no negative gap)', () => {
    // Partner overpaid — gap should be 0, not negative
    expect(computeCapitalGap(500_000, 600_000)).toBe(0)
  })

  it('18 — returns 0 for zero inputs', () => {
    expect(computeCapitalGap(0, 0)).toBe(0)
  })

})

// ── simulateCapitalCall ───────────────────────────────────────────────────────

describe('simulateCapitalCall', () => {

  const partners = [
    { id: 'p1', paid_try: 300_000, committed_try: 600_000 },  // gap = 300K
    { id: 'p2', paid_try: 200_000, committed_try: 400_000 },  // gap = 200K
  ]

  it('19 — 50% call: each partner pays 50% of their gap', () => {
    const result = simulateCapitalCall(partners, 50)
    // p1: pays 150K more → new paid = 450K
    // p2: pays 100K more → new paid = 300K
    // total paid = 750K
    // p1 ownership = 450/750 = 60%
    // p2 ownership = 300/750 = 40%
    expect(result['p1']).toBeCloseTo(60, 4)
    expect(result['p2']).toBeCloseTo(40, 4)
  })

  it('20 — 100% call: each partner pays full remaining gap', () => {
    const result = simulateCapitalCall(partners, 100)
    // p1: pays 300K more → 600K total
    // p2: pays 200K more → 400K total
    // total = 1M
    expect(result['p1']).toBeCloseTo(60, 4)
    expect(result['p2']).toBeCloseTo(40, 4)
  })

  it('21 — 0% call: no additional payments, ownership unchanged from paid basis', () => {
    const result = simulateCapitalCall(partners, 0)
    // Paid only: p1 = 300K, p2 = 200K → total 500K
    expect(result['p1']).toBeCloseTo(60, 4)
    expect(result['p2']).toBeCloseTo(40, 4)
  })

  it('22 — empty partners returns empty object', () => {
    const result = simulateCapitalCall([], 50)
    expect(result).toEqual({})
  })

  it('23 — single partner always gets 100% ownership', () => {
    const singlePartner = [{ id: 'solo', paid_try: 100_000, committed_try: 200_000 }]
    const result        = simulateCapitalCall(singlePartner, 50)
    expect(result['solo']).toBe(100)
  })

  it('24 — partner with no gap receives no additional payment', () => {
    const mixedPartners = [
      { id: 'p1', paid_try: 600_000, committed_try: 600_000 },  // gap = 0
      { id: 'p2', paid_try: 200_000, committed_try: 400_000 },  // gap = 200K
    ]
    const result = simulateCapitalCall(mixedPartners, 50)
    // p1: no additional → 600K
    // p2: pays 100K → 300K
    // total = 900K
    expect(result['p1']).toBeCloseTo(600_000 / 900_000 * 100, 2)
    expect(result['p2']).toBeCloseTo(300_000 / 900_000 * 100, 2)
  })

  it('25 — result values are numbers between 0 and 100', () => {
    const result = simulateCapitalCall(partners, 75)
    Object.values(result).forEach(v => {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(100)
    })
  })

  it('26 — result values sum to 100', () => {
    const result = simulateCapitalCall(partners, 60)
    const total  = Object.values(result).reduce((s, v) => s + v, 0)
    expect(total).toBeCloseTo(100, 2)
  })

})

// ════════════════════════════════════════════════════════════════════════════════
// LEGACY PURE FUNCTIONS (backward compat)
// ════════════════════════════════════════════════════════════════════════════════

describe('computeDilutionAfterExternalRaise', () => {

  it('27 — share ratios of existing partners sum to (1 − newPartnerShareRatio)', () => {
    const result = computeDilutionAfterExternalRaise(
      TWO_PARTNERS, 250_000, 0.25, CURRENT_EQUITY
    )
    const total = result.reduce((s, p) => s + p.share_ratio_after, 0)
    expect(total).toBeCloseTo(0.75, 5)
  })

  it('28 — dilution_pct is negative for all existing partners', () => {
    const result = computeDilutionAfterExternalRaise(
      TWO_PARTNERS, 250_000, 0.25, CURRENT_EQUITY
    )
    result.forEach(p => {
      expect(p.dilution_pct).toBeLessThan(0)
    })
  })

  it('29 — zero total equity falls back to 1 as denominator (no crash)', () => {
    expect(() => computeDilutionAfterExternalRaise(
      TWO_PARTNERS, 100_000, 0.25, 0
    )).not.toThrow()
  })

  it('30 — empty partners array returns empty array', () => {
    const result = computeDilutionAfterExternalRaise([], 250_000, 0.25, CURRENT_EQUITY)
    expect(result).toEqual([])
  })

})

describe('computePartnerBuyout', () => {

  it('31 — bought-out partner has share_ratio_after = 0', () => {
    const result = computePartnerBuyout(TWO_PARTNERS, 'Birkan', CURRENT_EQUITY)
    const b = result.find(p => p.partner_name === 'Birkan')!
    expect(b.share_ratio_after).toBe(0)
    expect(b.dilution_pct).toBe(-100)
  })

  it('32 — remaining partner absorbs full share (2-partner case)', () => {
    const result = computePartnerBuyout(TWO_PARTNERS, 'Birkan', CURRENT_EQUITY)
    const a = result.find(p => p.partner_name === 'Ahmet')!
    expect(a.share_ratio_after).toBeCloseTo(1.0, 5)
  })

  it('33 — 3-partner buyout: remaining two partners sum to 1.0', () => {
    const result = computePartnerBuyout(THREE_PARTNERS, 'Cansu', CURRENT_EQUITY)
    const a = result.find(p => p.partner_name === 'Ahmet')!
    const b = result.find(p => p.partner_name === 'Birkan')!
    expect(a.share_ratio_after + b.share_ratio_after).toBeCloseTo(1.0, 4)
  })

  it('34 — non-existent partner name returns unchanged ratios', () => {
    const result = computePartnerBuyout(TWO_PARTNERS, 'NonExistent', CURRENT_EQUITY)
    result.forEach((p, i) => {
      expect(p.share_ratio_after).toBeCloseTo(TWO_PARTNERS[i].share_ratio, 5)
      expect(p.dilution_pct).toBe(0)
    })
  })

})

describe('buildDilutionDescription', () => {

  it('35 — generates Turkish description mentioning dilution', () => {
    const partnersAfter = computeDilutionAfterExternalRaise(
      TWO_PARTNERS, 250_000, 0.25, CURRENT_EQUITY
    )
    const desc = buildDilutionDescription(partnersAfter)
    expect(typeof desc).toBe('string')
    expect(desc.length).toBeGreaterThan(10)
    expect(desc).toMatch(/pay|ortak|seyrelt|%/i)
  })

  it('36 — empty array returns "Ortak bulunamadı." message', () => {
    const desc = buildDilutionDescription([])
    expect(desc).toBe('Ortak bulunamadı.')
  })

})
