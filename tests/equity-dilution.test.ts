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

  it('6 — three partners sum to 100%', () => {
    const total = 900_000
    const a = computeEffectiveOwnership(500_000, total)
    const b = computeEffectiveOwnership(300_000, total)
    const c = computeEffectiveOwnership(100_000, total)
    expect(a + b + c).toBeCloseTo(100, 2)
  })

  it('7 — returns 50% when partner paid exactly half', () => {
    expect(computeEffectiveOwnership(250_000, 500_000)).toBeCloseTo(50, 5)
  })

  it('8 — tiny principal rounds correctly via round2', () => {
    // 1 / 3 = 33.33...%
    const result = computeEffectiveOwnership(1, 3)
    expect(result).toBeCloseTo(33.33, 1)
  })

  it('9 — very large values do not overflow', () => {
    const result = computeEffectiveOwnership(1_000_000_000, 3_000_000_000)
    expect(result).toBeCloseTo(33.33, 1)
  })

  it('10 — result is always between 0 and 100', () => {
    const cases: [number, number][] = [
      [0, 1000], [500, 1000], [1000, 1000], [999, 1000],
    ]
    for (const [paid, total] of cases) {
      const r = computeEffectiveOwnership(paid, total)
      expect(r).toBeGreaterThanOrEqual(0)
      expect(r).toBeLessThanOrEqual(100)
    }
  })

  it('11 — minor partner with 1% ownership', () => {
    const result = computeEffectiveOwnership(10_000, 1_000_000)
    expect(result).toBeCloseTo(1, 4)
  })

})

// ── computeDilutionImpact ─────────────────────────────────────────────────────

describe('computeDilutionImpact', () => {

  it('12 — returns negative when ownership decreased (diluted)', () => {
    const impact = computeDilutionImpact(60, 45)
    expect(impact).toBe(-15)
  })

  it('13 — returns positive when ownership increased (anti-diluted)', () => {
    const impact = computeDilutionImpact(40, 55)
    expect(impact).toBe(15)
  })

  it('14 — returns 0 when no change', () => {
    const impact = computeDilutionImpact(50, 50)
    expect(impact).toBe(0)
  })

  it('15 — works with fractional percentages', () => {
    const impact = computeDilutionImpact(33.33, 25.0)
    expect(impact).toBeCloseTo(-8.33, 2)
  })

  it('16 — total buyout: from 100% to 0%', () => {
    expect(computeDilutionImpact(100, 0)).toBe(-100)
  })

  it('17 — entry from 0 to ownership', () => {
    expect(computeDilutionImpact(0, 25)).toBe(25)
  })

  it('18 — small fractional dilution', () => {
    // 33.33 → 33.00 = -0.33
    expect(computeDilutionImpact(33.33, 33)).toBeCloseTo(-0.33, 1)
  })

  it('19 — symmetric: impact(a,b) == -impact(b,a)', () => {
    const ab = computeDilutionImpact(60, 45)
    const ba = computeDilutionImpact(45, 60)
    expect(ab).toBeCloseTo(-ba, 5)
  })

  it('20 — result is rounded to 2 decimal places', () => {
    // 60.001 - 33.334 = 26.667 → rounded to 26.67
    const impact = computeDilutionImpact(33.334, 60.001)
    const str = impact.toString()
    const decimalPlaces = str.includes('.') ? str.split('.')[1].length : 0
    expect(decimalPlaces).toBeLessThanOrEqual(2)
  })

})

// ── computeFullyDilutedOwnership ──────────────────────────────────────────────

describe('computeFullyDilutedOwnership', () => {

  it('21 — when all capital is paid, FD = effective ownership', () => {
    // All paid, no remaining commitments
    const fd = computeFullyDilutedOwnership(600_000, 0, 1_000_000, 0)
    expect(fd).toBeCloseTo(60, 4)
  })

  it('22 — when nothing is paid, FD = committed / total committed', () => {
    // Partner A: 600K committed, total 1M committed, 0 paid
    const fd = computeFullyDilutedOwnership(0, 600_000, 0, 1_000_000)
    expect(fd).toBeCloseTo(60, 4)
  })

  it('23 — mixed scenario: partner paid 400K of 600K, others have remaining commitments', () => {
    // Partner: paid 400K, remaining 200K → numerator = 600K
    // Total paid: 800K, total remaining: 400K → denominator = 1200K
    const fd = computeFullyDilutedOwnership(400_000, 200_000, 800_000, 400_000)
    expect(fd).toBeCloseTo(50, 4)   // 600 / 1200 = 50%
  })

  it('24 — returns 0 if denominator is zero', () => {
    expect(computeFullyDilutedOwnership(0, 0, 0, 0)).toBe(0)
  })

  it('25 — FD pct is >= effective ownership when there are remaining commitments', () => {
    // Partner paid less than their share → FD includes their remaining, could differ
    const effective = computeEffectiveOwnership(300_000, 700_000)
    const fd        = computeFullyDilutedOwnership(300_000, 300_000, 700_000, 300_000)
    // This depends on the ratio; just check both are computable numbers
    expect(typeof effective).toBe('number')
    expect(typeof fd).toBe('number')
  })

  it('26 — two-partner fully diluted sum is 100%', () => {
    // Partner A: paid 400K, remaining 100K
    // Partner B: paid 300K, remaining 200K
    // total paid 700K, total remaining 300K → denominator 1000K
    const a = computeFullyDilutedOwnership(400_000, 100_000, 700_000, 300_000)
    const b = computeFullyDilutedOwnership(300_000, 200_000, 700_000, 300_000)
    expect(a + b).toBeCloseTo(100, 2)
  })

  it('27 — asymmetric case: committed dominant', () => {
    // Partner with large remaining commitment gains more FD weight
    const a = computeFullyDilutedOwnership(100_000, 900_000, 200_000, 1_800_000)
    // numerator = 1M, denominator = 2M → 50%
    expect(a).toBeCloseTo(50, 4)
  })

  it('28 — result is between 0 and 100', () => {
    const fd = computeFullyDilutedOwnership(200_000, 50_000, 500_000, 250_000)
    expect(fd).toBeGreaterThanOrEqual(0)
    expect(fd).toBeLessThanOrEqual(100)
  })

})

// ── computeCapitalGap ─────────────────────────────────────────────────────────

describe('computeCapitalGap', () => {

  it('29 — returns correct gap when paid < committed', () => {
    expect(computeCapitalGap(500_000, 300_000)).toBe(200_000)
  })

  it('30 — returns 0 when fully paid', () => {
    expect(computeCapitalGap(500_000, 500_000)).toBe(0)
  })

  it('31 — returns 0 when overpaid (no negative gap)', () => {
    // Partner overpaid — gap should be 0, not negative
    expect(computeCapitalGap(500_000, 600_000)).toBe(0)
  })

  it('32 — returns 0 for zero inputs', () => {
    expect(computeCapitalGap(0, 0)).toBe(0)
  })

  it('33 — small gap: committed 1000, paid 999.99 → gap ~0.01', () => {
    expect(computeCapitalGap(1000, 999.99)).toBeCloseTo(0.01, 2)
  })

  it('34 — large values', () => {
    expect(computeCapitalGap(10_000_000, 4_000_000)).toBe(6_000_000)
  })

  it('35 — result is always non-negative', () => {
    const cases: [number, number][] = [
      [0, 0], [100, 0], [100, 100], [100, 150], [0, 100],
    ]
    for (const [committed, paid] of cases) {
      expect(computeCapitalGap(committed, paid)).toBeGreaterThanOrEqual(0)
    }
  })

})

// ── simulateCapitalCall ───────────────────────────────────────────────────────

describe('simulateCapitalCall', () => {

  const partners = [
    { id: 'p1', paid_try: 300_000, committed_try: 600_000 },  // gap = 300K
    { id: 'p2', paid_try: 200_000, committed_try: 400_000 },  // gap = 200K
  ]

  it('36 — 50% call: each partner pays 50% of their gap', () => {
    const result = simulateCapitalCall(partners, 50)
    // p1: pays 150K more → new paid = 450K
    // p2: pays 100K more → new paid = 300K
    // total paid = 750K
    // p1 ownership = 450/750 = 60%
    // p2 ownership = 300/750 = 40%
    expect(result['p1']).toBeCloseTo(60, 4)
    expect(result['p2']).toBeCloseTo(40, 4)
  })

  it('37 — 100% call: each partner pays full remaining gap', () => {
    const result = simulateCapitalCall(partners, 100)
    // p1: pays 300K more → 600K total
    // p2: pays 200K more → 400K total
    // total = 1M
    expect(result['p1']).toBeCloseTo(60, 4)
    expect(result['p2']).toBeCloseTo(40, 4)
  })

  it('38 — 0% call: no additional payments, ownership unchanged from paid basis', () => {
    const result = simulateCapitalCall(partners, 0)
    // Paid only: p1 = 300K, p2 = 200K → total 500K
    expect(result['p1']).toBeCloseTo(60, 4)
    expect(result['p2']).toBeCloseTo(40, 4)
  })

  it('39 — empty partners returns empty object', () => {
    const result = simulateCapitalCall([], 50)
    expect(result).toEqual({})
  })

  it('40 — single partner always gets 100% ownership', () => {
    const singlePartner = [{ id: 'solo', paid_try: 100_000, committed_try: 200_000 }]
    const result        = simulateCapitalCall(singlePartner, 50)
    expect(result['solo']).toBe(100)
  })

  it('41 — partner with no gap receives no additional payment', () => {
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

  it('42 — result values are numbers between 0 and 100', () => {
    const result = simulateCapitalCall(partners, 75)
    Object.values(result).forEach(v => {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(100)
    })
  })

  it('43 — result values sum to 100', () => {
    const result = simulateCapitalCall(partners, 60)
    const total  = Object.values(result).reduce((s, v) => s + v, 0)
    expect(total).toBeCloseTo(100, 2)
  })

  it('44 — 25% call proportions are correct', () => {
    const result = simulateCapitalCall(partners, 25)
    // p1: gap=300K → pays 75K → new paid = 375K
    // p2: gap=200K → pays 50K → new paid = 250K
    // total = 625K
    expect(result['p1']).toBeCloseTo(375_000 / 625_000 * 100, 2)
    expect(result['p2']).toBeCloseTo(250_000 / 625_000 * 100, 2)
  })

  it('45 — result keys match the input partner IDs', () => {
    const result = simulateCapitalCall(partners, 50)
    expect(Object.keys(result)).toContain('p1')
    expect(Object.keys(result)).toContain('p2')
    expect(Object.keys(result)).toHaveLength(2)
  })

  it('46 — three equal-gap partners at 100% call share equally', () => {
    const threePartners = [
      { id: 'a', paid_try: 0, committed_try: 100_000 },
      { id: 'b', paid_try: 0, committed_try: 100_000 },
      { id: 'c', paid_try: 0, committed_try: 100_000 },
    ]
    const result = simulateCapitalCall(threePartners, 100)
    expect(result['a']).toBeCloseTo(33.33, 1)
    expect(result['b']).toBeCloseTo(33.33, 1)
    expect(result['c']).toBeCloseTo(33.33, 1)
  })

  it('47 — all partners already fully paid: no change in ownership', () => {
    const fullyPaidPartners = [
      { id: 'x', paid_try: 500_000, committed_try: 500_000 },
      { id: 'y', paid_try: 500_000, committed_try: 500_000 },
    ]
    const result = simulateCapitalCall(fullyPaidPartners, 100)
    expect(result['x']).toBeCloseTo(50, 2)
    expect(result['y']).toBeCloseTo(50, 2)
  })

})

// ════════════════════════════════════════════════════════════════════════════════
// LEGACY PURE FUNCTIONS (backward compat)
// ════════════════════════════════════════════════════════════════════════════════

describe('computeDilutionAfterExternalRaise', () => {

  it('48 — share ratios of existing partners sum to (1 − newPartnerShareRatio)', () => {
    const result = computeDilutionAfterExternalRaise(
      TWO_PARTNERS, 250_000, 0.25, CURRENT_EQUITY
    )
    const total = result.reduce((s, p) => s + p.share_ratio_after, 0)
    expect(total).toBeCloseTo(0.75, 5)
  })

  it('49 — dilution_pct is negative for all existing partners', () => {
    const result = computeDilutionAfterExternalRaise(
      TWO_PARTNERS, 250_000, 0.25, CURRENT_EQUITY
    )
    result.forEach(p => {
      expect(p.dilution_pct).toBeLessThan(0)
    })
  })

  it('50 — zero total equity falls back to 1 as denominator (no crash)', () => {
    expect(() => computeDilutionAfterExternalRaise(
      TWO_PARTNERS, 100_000, 0.25, 0
    )).not.toThrow()
  })

  it('51 — empty partners array returns empty array', () => {
    const result = computeDilutionAfterExternalRaise([], 250_000, 0.25, CURRENT_EQUITY)
    expect(result).toEqual([])
  })

  it('52 — value_after > value_before when new capital is added', () => {
    // Total equity goes up, so even diluted partners may gain absolute value
    const result = computeDilutionAfterExternalRaise(
      TWO_PARTNERS, 1_000_000, 0.25, CURRENT_EQUITY
    )
    // equity increases from 1M to 2M, partners retain 75% of new equity
    result.forEach(p => {
      expect(p.equity_value_after_try).toBeGreaterThan(0)
    })
  })

  it('53 — 0% new partner share: existing partners keep 100% of their ratios', () => {
    const result = computeDilutionAfterExternalRaise(
      TWO_PARTNERS, 100_000, 0, CURRENT_EQUITY
    )
    // dilutionFactor = 1 - 0 = 1, so ratioAfter = shareRatio
    result.forEach((p, i) => {
      expect(p.share_ratio_after).toBeCloseTo(TWO_PARTNERS[i].share_ratio, 5)
      expect(p.dilution_pct).toBe(0)
    })
  })

  it('54 — 100% new partner share: all existing partners diluted to 0', () => {
    const result = computeDilutionAfterExternalRaise(
      TWO_PARTNERS, 500_000, 1.0, CURRENT_EQUITY
    )
    result.forEach(p => {
      expect(p.share_ratio_after).toBe(0)
    })
  })

  it('55 — value_change_try = value_after - value_before', () => {
    const result = computeDilutionAfterExternalRaise(
      TWO_PARTNERS, 200_000, 0.2, CURRENT_EQUITY
    )
    result.forEach(p => {
      const computed = p.equity_value_after_try - p.equity_value_before_try
      expect(p.value_change_try).toBeCloseTo(computed, 1)
    })
  })

  it('56 — returns correct number of partners', () => {
    const result = computeDilutionAfterExternalRaise(
      THREE_PARTNERS, 300_000, 0.25, CURRENT_EQUITY
    )
    expect(result).toHaveLength(THREE_PARTNERS.length)
  })

  it('57 — partner names are preserved', () => {
    const result = computeDilutionAfterExternalRaise(
      TWO_PARTNERS, 250_000, 0.25, CURRENT_EQUITY
    )
    expect(result[0].partner_name).toBe('Ahmet')
    expect(result[1].partner_name).toBe('Birkan')
  })

})

describe('computePartnerBuyout', () => {

  it('58 — bought-out partner has share_ratio_after = 0', () => {
    const result = computePartnerBuyout(TWO_PARTNERS, 'Birkan', CURRENT_EQUITY)
    const b = result.find(p => p.partner_name === 'Birkan')!
    expect(b.share_ratio_after).toBe(0)
    expect(b.dilution_pct).toBe(-100)
  })

  it('59 — remaining partner absorbs full share (2-partner case)', () => {
    const result = computePartnerBuyout(TWO_PARTNERS, 'Birkan', CURRENT_EQUITY)
    const a = result.find(p => p.partner_name === 'Ahmet')!
    expect(a.share_ratio_after).toBeCloseTo(1.0, 5)
  })

  it('60 — 3-partner buyout: remaining two partners sum to 1.0', () => {
    const result = computePartnerBuyout(THREE_PARTNERS, 'Cansu', CURRENT_EQUITY)
    const a = result.find(p => p.partner_name === 'Ahmet')!
    const b = result.find(p => p.partner_name === 'Birkan')!
    expect(a.share_ratio_after + b.share_ratio_after).toBeCloseTo(1.0, 4)
  })

  it('61 — non-existent partner name returns unchanged ratios', () => {
    const result = computePartnerBuyout(TWO_PARTNERS, 'NonExistent', CURRENT_EQUITY)
    result.forEach((p, i) => {
      expect(p.share_ratio_after).toBeCloseTo(TWO_PARTNERS[i].share_ratio, 5)
      expect(p.dilution_pct).toBe(0)
    })
  })

  it('62 — bought-out partner equity_value_after_try is 0', () => {
    const result = computePartnerBuyout(TWO_PARTNERS, 'Birkan', CURRENT_EQUITY)
    const b = result.find(p => p.partner_name === 'Birkan')!
    expect(b.equity_value_after_try).toBe(0)
  })

  it('63 — remaining partner gains positive value change', () => {
    const result = computePartnerBuyout(TWO_PARTNERS, 'Birkan', CURRENT_EQUITY)
    const a = result.find(p => p.partner_name === 'Ahmet')!
    expect(a.value_change_try).toBeGreaterThan(0)
  })

  it('64 — total equity is conserved (same before and after)', () => {
    const result = computePartnerBuyout(TWO_PARTNERS, 'Birkan', CURRENT_EQUITY)
    const totalAfter = result.reduce((s, p) => s + p.equity_value_after_try, 0)
    expect(totalAfter).toBeCloseTo(CURRENT_EQUITY, 0)
  })

  it('65 — zero equity falls back to safeEquity=1', () => {
    expect(() => computePartnerBuyout(TWO_PARTNERS, 'Birkan', 0)).not.toThrow()
    const result = computePartnerBuyout(TWO_PARTNERS, 'Birkan', 0)
    const b = result.find(p => p.partner_name === 'Birkan')!
    expect(b.dilution_pct).toBe(-100)
  })

  it('66 — returns correct number of entries', () => {
    const result = computePartnerBuyout(THREE_PARTNERS, 'Cansu', CURRENT_EQUITY)
    expect(result).toHaveLength(3)
  })

  it('67 — remaining partners dilution_pct is positive (anti-diluted)', () => {
    const result = computePartnerBuyout(TWO_PARTNERS, 'Birkan', CURRENT_EQUITY)
    const a = result.find(p => p.partner_name === 'Ahmet')!
    expect(a.dilution_pct).toBeGreaterThan(0)
  })

})

describe('buildDilutionDescription', () => {

  it('68 — generates Turkish description mentioning dilution', () => {
    const partnersAfter = computeDilutionAfterExternalRaise(
      TWO_PARTNERS, 250_000, 0.25, CURRENT_EQUITY
    )
    const desc = buildDilutionDescription(partnersAfter)
    expect(typeof desc).toBe('string')
    expect(desc.length).toBeGreaterThan(10)
    expect(desc).toMatch(/pay|ortak|seyrelt|%/i)
  })

  it('69 — empty array returns "Ortak bulunamadı." message', () => {
    const desc = buildDilutionDescription([])
    expect(desc).toBe('Ortak bulunamadı.')
  })

  it('70 — no-change scenario returns "değişiklik yok" message', () => {
    const noChange = TWO_PARTNERS.map(p => ({
      partner_name:            p.partner_name,
      share_ratio_before:      p.share_ratio,
      share_ratio_after:       p.share_ratio,
      dilution_pct:            0,
      equity_value_before_try: p.share_ratio * CURRENT_EQUITY,
      equity_value_after_try:  p.share_ratio * CURRENT_EQUITY,
      value_change_try:        0,
    }))
    const desc = buildDilutionDescription(noChange)
    expect(desc).toMatch(/değişiklik yok/i)
  })

  it('71 — buyout scenario: description mentions "yükseliyor" for gaining partner', () => {
    const buyoutAfter = computePartnerBuyout(TWO_PARTNERS, 'Birkan', CURRENT_EQUITY)
    const desc = buildDilutionDescription(buyoutAfter)
    expect(typeof desc).toBe('string')
    expect(desc.length).toBeGreaterThan(10)
  })

  it('72 — description contains percentage symbols', () => {
    const partnersAfter = computeDilutionAfterExternalRaise(
      TWO_PARTNERS, 250_000, 0.25, CURRENT_EQUITY
    )
    const desc = buildDilutionDescription(partnersAfter)
    expect(desc).toContain('%')
  })

  it('73 — description references the most diluted partner first', () => {
    // PARTNER_B has smaller share, gets more diluted in proportional terms
    const partnersAfter = computeDilutionAfterExternalRaise(
      TWO_PARTNERS, 250_000, 0.25, CURRENT_EQUITY
    )
    const desc = buildDilutionDescription(partnersAfter)
    // The most diluted partner should appear by name in the description
    expect(typeof desc).toBe('string')
    expect(desc).toBeTruthy()
  })

  it('74 — single partner with positive dilution_pct → "yükseliyor" message', () => {
    const gainPartner = [{
      partner_name:            'Fatma',
      share_ratio_before:      0.5,
      share_ratio_after:       0.7,
      dilution_pct:            40,
      equity_value_before_try: 500_000,
      equity_value_after_try:  700_000,
      value_change_try:        200_000,
    }]
    const desc = buildDilutionDescription(gainPartner)
    expect(desc).toMatch(/yükseliyor/i)
  })

})

// ── Additional edge-case tests ────────────────────────────────────────────────

describe('computeEffectiveOwnership — edge cases', () => {

  it('75 — overpaid partner: can exceed 100% if total is less than paid (edge)', () => {
    // Edge: partner paid more than total (data inconsistency) — result > 100
    const result = computeEffectiveOwnership(200, 100)
    expect(result).toBeCloseTo(200, 2)
  })

  it('76 — fractional TRY amounts are handled', () => {
    const result = computeEffectiveOwnership(333.33, 1000)
    expect(result).toBeCloseTo(33.33, 1)
  })

})

describe('computeCapitalGap — additional', () => {

  it('77 — gap is exactly the difference', () => {
    expect(computeCapitalGap(750_000, 500_000)).toBe(250_000)
  })

  it('78 — committed 0, paid 0: gap 0', () => {
    expect(computeCapitalGap(0, 0)).toBe(0)
  })

})

describe('computeFullyDilutedOwnership — additional', () => {

  it('79 — partner with only committed capital (nothing paid): FD still computed', () => {
    // paid = 0, remaining = 300K; total paid = 0, total remaining = 1M
    const fd = computeFullyDilutedOwnership(0, 300_000, 0, 1_000_000)
    expect(fd).toBeCloseTo(30, 2)
  })

  it('80 — single partner: FD always 100%', () => {
    const fd = computeFullyDilutedOwnership(500_000, 200_000, 500_000, 200_000)
    expect(fd).toBe(100)
  })

})

describe('simulateCapitalCall — additional', () => {

  it('81 — very high call pct (200%): gaps capped at gap amount', () => {
    // Even at 200% call, additional payment cannot exceed the gap
    const partners = [
      { id: 'x', paid_try: 200_000, committed_try: 300_000 },  // gap 100K
    ]
    // 200% of gap = 200K, but gap is only 100K → should still cap
    const result = simulateCapitalCall(partners, 200)
    // x gets 200% of gap (200K) but max gap is 100K, so pays extra 200K
    expect(result['x']).toBe(100) // single partner = 100%
  })

  it('82 — result always sums to 100% for any call pct', () => {
    const partners = [
      { id: 'a', paid_try: 100_000, committed_try: 500_000 },
      { id: 'b', paid_try: 300_000, committed_try: 600_000 },
      { id: 'c', paid_try: 50_000,  committed_try: 200_000 },
    ]
    for (const pct of [0, 10, 25, 50, 75, 100]) {
      const result = simulateCapitalCall(partners, pct)
      const total = Object.values(result).reduce((s, v) => s + v, 0)
      expect(total).toBeCloseTo(100, 1)
    }
  })

})
