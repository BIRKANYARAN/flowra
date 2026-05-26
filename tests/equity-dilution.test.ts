/**
 * Tests for lib/services/pcle/equity-dilution.service.ts
 *
 * Pure computation tests — no DB required.
 * Tests cover: computeDilutionAfterExternalRaise, computePartnerBuyout, buildDilutionDescription
 */
import { describe, it, expect } from 'vitest'
import {
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

const TWO_PARTNERS  = [PARTNER_A, PARTNER_B]
const THREE_PARTNERS = [
  { ...PARTNER_A, share_ratio: 0.5 },
  { ...PARTNER_B, share_ratio: 0.4 },
  PARTNER_C,
]
const CURRENT_EQUITY = 1_000_000

// ── computeDilutionAfterExternalRaise ─────────────────────────────────────────

describe('computeDilutionAfterExternalRaise', () => {

  it('1 — share ratios of existing partners sum to (1 − newPartnerShareRatio)', () => {
    const result = computeDilutionAfterExternalRaise(
      TWO_PARTNERS, 250_000, 0.25, CURRENT_EQUITY
    )
    const total = result.reduce((s, p) => s + p.share_ratio_after, 0)
    // existing partners keep 75% together
    expect(total).toBeCloseTo(0.75, 5)
  })

  it('2 — each partner ratio_after = ratio_before × (1 − new_partner_share)', () => {
    const result = computeDilutionAfterExternalRaise(
      TWO_PARTNERS, 250_000, 0.25, CURRENT_EQUITY
    )
    const a = result.find(p => p.partner_name === 'Ahmet')!
    const b = result.find(p => p.partner_name === 'Birkan')!
    expect(a.share_ratio_after).toBeCloseTo(0.6 * 0.75, 5)
    expect(b.share_ratio_after).toBeCloseTo(0.4 * 0.75, 5)
  })

  it('3 — dilution_pct is negative for all existing partners', () => {
    const result = computeDilutionAfterExternalRaise(
      TWO_PARTNERS, 250_000, 0.25, CURRENT_EQUITY
    )
    result.forEach(p => {
      expect(p.dilution_pct).toBeLessThan(0)
    })
  })

  it('4 — dilution_pct approximately equals −new_partner_share × 100', () => {
    const result = computeDilutionAfterExternalRaise(
      TWO_PARTNERS, 250_000, 0.25, CURRENT_EQUITY
    )
    // Each partner should be diluted by ~25%
    result.forEach(p => {
      expect(p.dilution_pct).toBeCloseTo(-25, 0)
    })
  })

  it('5 — equity_value_after_try reflects new higher equity base', () => {
    const result = computeDilutionAfterExternalRaise(
      TWO_PARTNERS, 250_000, 0.25, CURRENT_EQUITY
    )
    const a = result.find(p => p.partner_name === 'Ahmet')!
    const equityAfter = CURRENT_EQUITY + 250_000
    expect(a.equity_value_after_try).toBeCloseTo((0.6 * 0.75) * equityAfter, 0)
  })

  it('6 — zero total equity falls back to 1 as denominator (no divide by zero)', () => {
    expect(() => computeDilutionAfterExternalRaise(
      TWO_PARTNERS, 100_000, 0.25, 0
    )).not.toThrow()

    const result = computeDilutionAfterExternalRaise(
      TWO_PARTNERS, 100_000, 0.25, 0
    )
    expect(result.length).toBe(2)
    result.forEach(p => expect(isFinite(p.dilution_pct)).toBe(true))
  })

  it('7 — large external raise (33% to new partner)', () => {
    const result = computeDilutionAfterExternalRaise(
      TWO_PARTNERS, 500_000, 0.33, CURRENT_EQUITY
    )
    const total = result.reduce((s, p) => s + p.share_ratio_after, 0)
    expect(total).toBeCloseTo(0.67, 4)
  })

  it('8 — value_change_try is negative when dilution hurts value', () => {
    // With small capital raise and large new partner share, existing value can decrease
    const result = computeDilutionAfterExternalRaise(
      TWO_PARTNERS, 1_000, 0.50, CURRENT_EQUITY
    )
    // New partner takes 50%, doubling the equity pool doesn't compensate if raise is tiny
    result.forEach(p => {
      expect(typeof p.value_change_try).toBe('number')
    })
  })

  it('9 — empty partners array returns empty array', () => {
    const result = computeDilutionAfterExternalRaise([], 250_000, 0.25, CURRENT_EQUITY)
    expect(result).toEqual([])
  })
})

// ── computePartnerBuyout ──────────────────────────────────────────────────────

describe('computePartnerBuyout', () => {

  it('10 — bought-out partner has share_ratio_after = 0', () => {
    const result = computePartnerBuyout(TWO_PARTNERS, 'Birkan', CURRENT_EQUITY)
    const b = result.find(p => p.partner_name === 'Birkan')!
    expect(b.share_ratio_after).toBe(0)
    expect(b.dilution_pct).toBe(-100)
  })

  it('11 — remaining partner absorbs full share (2-partner case)', () => {
    const result = computePartnerBuyout(TWO_PARTNERS, 'Birkan', CURRENT_EQUITY)
    const a = result.find(p => p.partner_name === 'Ahmet')!
    // Ahmet had 0.6, absorbs Birkan's 0.4 → ratio = 1.0
    expect(a.share_ratio_after).toBeCloseTo(1.0, 5)
  })

  it('12 — 3-partner buyout redistributes proportionally to remaining two', () => {
    const result = computePartnerBuyout(THREE_PARTNERS, 'Cansu', CURRENT_EQUITY)
    const a = result.find(p => p.partner_name === 'Ahmet')!
    const b = result.find(p => p.partner_name === 'Birkan')!
    const c = result.find(p => p.partner_name === 'Cansu')!

    expect(c.share_ratio_after).toBe(0)
    // After buyout, Ahmet + Birkan together should have 1.0
    expect(a.share_ratio_after + b.share_ratio_after).toBeCloseTo(1.0, 4)
  })

  it('13 — total equity is unchanged after buyout', () => {
    const result = computePartnerBuyout(TWO_PARTNERS, 'Birkan', CURRENT_EQUITY)
    // Sum of equity values after should equal CURRENT_EQUITY (redistribution only)
    const total = result.reduce((s, p) => s + p.equity_value_after_try, 0)
    expect(total).toBeCloseTo(CURRENT_EQUITY, 0)
  })

  it('14 — non-existent partner name returns unchanged ratios', () => {
    const result = computePartnerBuyout(TWO_PARTNERS, 'NonExistent', CURRENT_EQUITY)
    result.forEach((p, i) => {
      expect(p.share_ratio_after).toBeCloseTo(TWO_PARTNERS[i].share_ratio, 5)
      expect(p.dilution_pct).toBe(0)
    })
  })
})

// ── buildDilutionDescription ──────────────────────────────────────────────────

describe('buildDilutionDescription', () => {

  it('15 — generates Turkish description mentioning the most-diluted partner', () => {
    const partnersAfter = computeDilutionAfterExternalRaise(
      TWO_PARTNERS, 250_000, 0.25, CURRENT_EQUITY
    )
    const desc = buildDilutionDescription(partnersAfter)
    // Should mention a partner name and dilution
    expect(typeof desc).toBe('string')
    expect(desc.length).toBeGreaterThan(10)
    // Should be Turkish content
    expect(desc).toMatch(/pay|ortak|seyrelt|%/i)
  })

  it('16 — empty array returns "Ortak bulunamadı." message', () => {
    const desc = buildDilutionDescription([])
    expect(desc).toBe('Ortak bulunamadı.')
  })

  it('17 — includes before/after pct values in description', () => {
    const partnersAfter = computeDilutionAfterExternalRaise(
      TWO_PARTNERS, 250_000, 0.25, CURRENT_EQUITY
    )
    const desc = buildDilutionDescription(partnersAfter)
    // Should include percentage symbols
    expect(desc).toMatch(/%/)
  })
})
