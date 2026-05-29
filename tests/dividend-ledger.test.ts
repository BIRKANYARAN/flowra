/**
 * Tests for lib/services/pcle/dividend-ledger.service.ts
 *
 * Pure function tests — no DB required.
 *
 * Section 1 (new pure functions):
 *   - computePartnerGrossDividend: normal / zero share / zero distributable
 *   - computeWithholdingTax:       10% of various amounts
 *   - computeNetDividend:          gross - withholding
 *   - computeDividendYield:        normal / zero capital → null / over 100%
 *   - validateDividendDeclaration: valid / exceeds profit / exact equal
 *
 * Section 2 (legacy helpers — kept for backward compat):
 *   - computePerPartnerAmount
 *   - computeWithholding (alias)
 *   - sumByPartner
 */

import { describe, it, expect } from 'vitest'
import {
  computePartnerGrossDividend,
  computeWithholdingTax,
  computeNetDividend,
  computeDividendYield,
  validateDividendDeclaration,
  computePerPartnerAmount,
  computeWithholding,
  sumByPartner,
} from '../lib/services/pcle/dividend-ledger.service'
import type { DividendLedgerEntry } from '../lib/services/pcle/dividend-ledger.service'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeDeclaredEntry(
  id: string,
  perPartner: DividendLedgerEntry['per_partner'],
  grossAmount = 100_000,
): DividendLedgerEntry {
  const withholding = Math.round(grossAmount * 0.10 * 100) / 100
  return {
    id,
    event_type:        'declared',
    event_date:        '2026-01-15',
    period_label:      'Q1 2026',
    gross_amount_try:  grossAmount,
    withholding_try:   withholding,
    net_amount_try:    Math.round((grossAmount - withholding) * 100) / 100,
    per_partner:       perPartner,
    workflow_status:   'pending',
    declared_by:       null,
    notes:             null,
    ttk_509_compliant: true,
    ttk_519_compliant: true,
  }
}

function makePaidEntry(
  id: string,
  perPartner: DividendLedgerEntry['per_partner'],
  grossAmount = 50_000,
): DividendLedgerEntry {
  const withholding = Math.round(grossAmount * 0.10 * 100) / 100
  return {
    id,
    event_type:        'paid',
    event_date:        '2026-02-10',
    period_label:      'Q1 2026',
    gross_amount_try:  grossAmount,
    withholding_try:   withholding,
    net_amount_try:    Math.round((grossAmount - withholding) * 100) / 100,
    per_partner:       perPartner,
    workflow_status:   'approved',
    declared_by:       'user-abc',
    notes:             'Onaylı ödeme',
    ttk_509_compliant: true,
    ttk_519_compliant: true,
  }
}

// ── computePartnerGrossDividend ───────────────────────────────────────────────

describe('computePartnerGrossDividend', () => {
  it('computes gross for a 50% partner on ₺100,000 distributable', () => {
    expect(computePartnerGrossDividend(100_000, 50)).toBe(50_000)
  })

  it('computes gross for a 33.33% partner on ₺300,000 distributable', () => {
    expect(computePartnerGrossDividend(300_000, 33.33)).toBeCloseTo(99_990, 1)
  })

  it('returns 0 when share ratio is 0', () => {
    expect(computePartnerGrossDividend(100_000, 0)).toBe(0)
  })

  it('returns 0 when distributable amount is 0', () => {
    expect(computePartnerGrossDividend(0, 60)).toBe(0)
  })

  it('handles 100% single-partner company', () => {
    expect(computePartnerGrossDividend(250_000, 100)).toBe(250_000)
  })
})

// ── computeWithholdingTax ─────────────────────────────────────────────────────

describe('computeWithholdingTax', () => {
  it('computes 10% withholding on ₺100,000', () => {
    expect(computeWithholdingTax(100_000)).toBe(10_000)
  })

  it('computes 10% withholding on ₺50,000', () => {
    expect(computeWithholdingTax(50_000)).toBe(5_000)
  })

  it('returns 0 for zero gross amount', () => {
    expect(computeWithholdingTax(0)).toBe(0)
  })

  it('returns 0 for negative gross amount', () => {
    expect(computeWithholdingTax(-5_000)).toBe(0)
  })

  it('rounds to 2 decimal places (GVK 94 precision)', () => {
    // 3333.33 * 0.10 = 333.333 → rounds to 333.33
    expect(computeWithholdingTax(3333.33)).toBe(333.33)
  })

  it('handles large amount correctly', () => {
    expect(computeWithholdingTax(1_000_000)).toBe(100_000)
  })
})

// ── computeNetDividend ────────────────────────────────────────────────────────

describe('computeNetDividend', () => {
  it('returns gross - 10% withholding for ₺100,000', () => {
    expect(computeNetDividend(100_000)).toBe(90_000)
  })

  it('returns gross - 10% withholding for ₺50,000', () => {
    expect(computeNetDividend(50_000)).toBe(45_000)
  })

  it('returns 0 for zero gross', () => {
    expect(computeNetDividend(0)).toBe(0)
  })

  it('returns correct net for decimal amount', () => {
    // 1234.56 - 123.46 = 1111.10
    const gross = 1234.56
    const withholding = Math.round(gross * 0.10 * 100) / 100  // 123.46
    expect(computeNetDividend(gross)).toBe(Math.round((gross - withholding) * 100) / 100)
  })
})

// ── computeDividendYield ──────────────────────────────────────────────────────

describe('computeDividendYield', () => {
  it('computes yield as (dividends / capital) × 100', () => {
    // ₺20,000 net dividends on ₺100,000 capital = 20%
    expect(computeDividendYield(20_000, 100_000)).toBe(20)
  })

  it('returns null when paid-in capital is 0', () => {
    expect(computeDividendYield(10_000, 0)).toBeNull()
  })

  it('allows yield over 100% (not clamped)', () => {
    // ₺150,000 net on ₺100,000 capital = 150%
    expect(computeDividendYield(150_000, 100_000)).toBe(150)
  })

  it('returns 0 when dividends are 0 but capital is positive', () => {
    expect(computeDividendYield(0, 100_000)).toBe(0)
  })

  it('rounds yield to 2 decimal places', () => {
    // 10000 / 30000 × 100 = 33.333... → 33.33
    expect(computeDividendYield(10_000, 30_000)).toBe(33.33)
  })
})

// ── validateDividendDeclaration ───────────────────────────────────────────────

describe('validateDividendDeclaration', () => {
  it('returns valid when gross is less than distributable profit', () => {
    const result = validateDividendDeclaration(80_000, 100_000)
    expect(result.valid).toBe(true)
    expect(result.reason).toBeNull()
  })

  it('returns valid when gross exactly equals distributable profit', () => {
    const result = validateDividendDeclaration(100_000, 100_000)
    expect(result.valid).toBe(true)
    expect(result.reason).toBeNull()
  })

  it('returns invalid with Turkish reason when gross exceeds distributable profit', () => {
    const result = validateDividendDeclaration(150_000, 100_000)
    expect(result.valid).toBe(false)
    expect(result.reason).not.toBeNull()
    // Should reference TTK 509
    expect(result.reason).toContain('TTK 509')
  })

  it('invalid reason message mentions dağıtılabilir kâr', () => {
    const result = validateDividendDeclaration(200_000, 50_000)
    expect(result.valid).toBe(false)
    expect(result.reason).toContain('dağıtılabilir kâr')
  })

  it('returns valid when distributable profit is 0 and gross is 0', () => {
    const result = validateDividendDeclaration(0, 0)
    expect(result.valid).toBe(true)
    expect(result.reason).toBeNull()
  })
})

// ── Legacy: computePerPartnerAmount ──────────────────────────────────────────

describe('computePerPartnerAmount', () => {
  it('splits 50/50 correctly — two equal partners', () => {
    const partners = [
      { name: 'Ortak A', share_ratio: 0.5 },
      { name: 'Ortak B', share_ratio: 0.5 },
    ]
    const result = computePerPartnerAmount(100_000, partners)

    expect(result).toHaveLength(2)
    expect(result[0].partner_name).toBe('Ortak A')
    expect(result[0].gross_try).toBe(50_000)
    expect(result[0].withholding_try).toBe(5_000)
    expect(result[0].net_try).toBe(45_000)
    expect(result[0].share_ratio).toBeCloseTo(0.5, 4)

    expect(result[1].gross_try).toBe(50_000)
    expect(result[1].net_try).toBe(45_000)
  })

  it('splits 3-way unequal (60/30/10) correctly', () => {
    const partners = [
      { name: 'A', share_ratio: 0.6 },
      { name: 'B', share_ratio: 0.3 },
      { name: 'C', share_ratio: 0.1 },
    ]
    const result = computePerPartnerAmount(100_000, partners)

    expect(result).toHaveLength(3)
    expect(result[0].gross_try).toBe(60_000)
    expect(result[0].withholding_try).toBe(6_000)
    expect(result[0].net_try).toBe(54_000)

    expect(result[1].gross_try).toBe(30_000)
    expect(result[1].withholding_try).toBe(3_000)
    expect(result[1].net_try).toBe(27_000)

    expect(result[2].gross_try).toBe(10_000)
    expect(result[2].withholding_try).toBe(1_000)
    expect(result[2].net_try).toBe(9_000)
  })

  it('returns empty array when grossAmount is zero', () => {
    const partners = [
      { name: 'Ortak A', share_ratio: 0.5 },
      { name: 'Ortak B', share_ratio: 0.5 },
    ]
    const result = computePerPartnerAmount(0, partners)
    expect(result).toHaveLength(0)
  })

  it('returns empty array when partners list is empty', () => {
    const result = computePerPartnerAmount(100_000, [])
    expect(result).toHaveLength(0)
  })

  it('marks paid as false by default', () => {
    const partners = [{ name: 'X', share_ratio: 1.0 }]
    const result = computePerPartnerAmount(10_000, partners)
    expect(result[0].paid).toBe(false)
  })

  it('normalises share ratios that do not sum to 1', () => {
    // Ratios 2 + 2 = 4, normalised → 0.5 + 0.5
    const partners = [
      { name: 'A', share_ratio: 2 },
      { name: 'B', share_ratio: 2 },
    ]
    const result = computePerPartnerAmount(100_000, partners)
    expect(result[0].gross_try).toBe(50_000)
    expect(result[1].gross_try).toBe(50_000)
  })
})

// ── Legacy: computeWithholding ────────────────────────────────────────────────

describe('computeWithholding (legacy alias)', () => {
  it('computes 10% withholding on a normal amount', () => {
    expect(computeWithholding(100_000)).toBe(10_000)
  })

  it('returns 0 for zero gross amount', () => {
    expect(computeWithholding(0)).toBe(0)
  })

  it('returns 0 for negative gross amount', () => {
    expect(computeWithholding(-5_000)).toBe(0)
  })

  it('handles large amount correctly', () => {
    expect(computeWithholding(1_000_000)).toBe(100_000)
  })

  it('rounds to 2 decimal places', () => {
    expect(computeWithholding(3333.33)).toBe(333.33)
  })
})

// ── Legacy: sumByPartner ──────────────────────────────────────────────────────

describe('sumByPartner', () => {
  it('returns empty array for no entries', () => {
    expect(sumByPartner([])).toHaveLength(0)
  })

  it('returns empty for entries that are all cancelled', () => {
    const cancelledEntry: DividendLedgerEntry = {
      ...makeDeclaredEntry('e1', []),
      event_type: 'cancelled',
    }
    expect(sumByPartner([cancelledEntry])).toHaveLength(0)
  })

  it('aggregates a single declared entry correctly', () => {
    const perPartner = computePerPartnerAmount(100_000, [
      { name: 'Ortak A', share_ratio: 0.5 },
      { name: 'Ortak B', share_ratio: 0.5 },
    ])
    const entry = makeDeclaredEntry('e1', perPartner, 100_000)
    const totals = sumByPartner([entry])

    expect(totals).toHaveLength(2)
    const a = totals.find(t => t.partner_name === 'Ortak A')!
    expect(a.total_gross_try).toBe(50_000)
    expect(a.total_withholding_try).toBe(5_000)
    expect(a.total_net_try).toBe(45_000)
  })

  it('aggregates multiple entries across the same partner', () => {
    const perPartner1 = computePerPartnerAmount(100_000, [
      { name: 'Ortak A', share_ratio: 1 },
    ])
    const perPartner2 = computePerPartnerAmount(50_000, [
      { name: 'Ortak A', share_ratio: 1 },
    ])
    const e1 = makeDeclaredEntry('e1', perPartner1, 100_000)
    const e2 = makePaidEntry('e2', perPartner2, 50_000)

    const totals = sumByPartner([e1, e2])
    expect(totals).toHaveLength(1)

    const a = totals[0]
    expect(a.partner_name).toBe('Ortak A')
    expect(a.total_gross_try).toBe(150_000)
    expect(a.total_withholding_try).toBe(15_000)
    expect(a.total_net_try).toBe(135_000)
  })

  it('aggregates entries with different partners independently', () => {
    const perPartner = computePerPartnerAmount(100_000, [
      { name: 'A', share_ratio: 0.6 },
      { name: 'B', share_ratio: 0.4 },
    ])
    const entry = makeDeclaredEntry('e1', perPartner, 100_000)
    const totals = sumByPartner([entry])

    const a = totals.find(t => t.partner_name === 'A')!
    const b = totals.find(t => t.partner_name === 'B')!

    expect(a.total_gross_try).toBe(60_000)
    expect(b.total_gross_try).toBe(40_000)
    expect(a.total_gross_try + b.total_gross_try).toBe(100_000)
  })
})

// ── computePartnerGrossDividend — formula: profit × share/100 ────────────────

describe('computePartnerGrossDividend — formula correctness', () => {
  it('gross = distributableProfit × sharePct / 100 for 25% partner', () => {
    expect(computePartnerGrossDividend(200_000, 25)).toBe(50_000)
  })

  it('gross = distributableProfit × sharePct / 100 for 75% partner', () => {
    expect(computePartnerGrossDividend(200_000, 75)).toBe(150_000)
  })

  it('100% single-partner gets the full distributable amount', () => {
    expect(computePartnerGrossDividend(350_000, 100)).toBe(350_000)
  })

  it('0% partner receives nothing', () => {
    expect(computePartnerGrossDividend(1_000_000, 0)).toBe(0)
  })

  it('zero distributable → zero gross regardless of share', () => {
    expect(computePartnerGrossDividend(0, 50)).toBe(0)
  })

  it('rounds to 2 decimal places', () => {
    // 100_000 × 33.33 / 100 = 33330.00
    expect(computePartnerGrossDividend(100_000, 33.33)).toBeCloseTo(33_330, 1)
  })

  it('three partners sum to full amount (25+25+50 = 100%)', () => {
    const profit = 100_000
    const a = computePartnerGrossDividend(profit, 25)
    const b = computePartnerGrossDividend(profit, 25)
    const c = computePartnerGrossDividend(profit, 50)
    expect(a + b + c).toBe(100_000)
  })
})

// ── computeWithholdingTax — 10% rule (GVK 94) ────────────────────────────────

describe('computeWithholdingTax — 10% of gross (GVK 94)', () => {
  it('10% of 100_000 = 10_000', () => {
    expect(computeWithholdingTax(100_000)).toBe(10_000)
  })

  it('10% of 250_000 = 25_000', () => {
    expect(computeWithholdingTax(250_000)).toBe(25_000)
  })

  it('10% of 1234.56 rounds to 2 decimal places', () => {
    // 1234.56 × 0.10 = 123.456 → rounds to 123.46
    expect(computeWithholdingTax(1234.56)).toBe(123.46)
  })

  it('returns 0 for gross = 0', () => {
    expect(computeWithholdingTax(0)).toBe(0)
  })

  it('returns 0 for negative gross', () => {
    expect(computeWithholdingTax(-10_000)).toBe(0)
  })

  it('withholding is always 10% of gross for large amounts', () => {
    const gross = 5_000_000
    expect(computeWithholdingTax(gross)).toBe(500_000)
  })
})

// ── computeNetDividend — net = 90% of gross ───────────────────────────────────

describe('computeNetDividend — net = 90% of gross', () => {
  it('net = 90% of 100_000 → 90_000', () => {
    expect(computeNetDividend(100_000)).toBe(90_000)
  })

  it('net = 90% of 50_000 → 45_000', () => {
    expect(computeNetDividend(50_000)).toBe(45_000)
  })

  it('net = 90% of 1 → 0.9', () => {
    expect(computeNetDividend(1)).toBeCloseTo(0.9, 5)
  })

  it('net of 0 gross → 0', () => {
    expect(computeNetDividend(0)).toBe(0)
  })

  it('gross - withholding = net (consistency check)', () => {
    const gross = 75_000
    const withholding = computeWithholdingTax(gross)
    const net = computeNetDividend(gross)
    expect(net).toBeCloseTo(gross - withholding, 2)
  })

  it('net is always less than gross when gross > 0', () => {
    expect(computeNetDividend(200_000)).toBeLessThan(200_000)
  })

  it('for 250_000 gross, net = 225_000 (90%)', () => {
    expect(computeNetDividend(250_000)).toBe(225_000)
  })
})

// ── validateDividendDeclaration — TTK 509 compliance ─────────────────────────

describe('validateDividendDeclaration — TTK 509 rules', () => {
  it('returns valid when proposal equals profit (exact equality)', () => {
    const result = validateDividendDeclaration(100_000, 100_000)
    expect(result.valid).toBe(true)
    expect(result.reason).toBeNull()
  })

  it('returns valid when proposal is less than profit', () => {
    const result = validateDividendDeclaration(50_000, 100_000)
    expect(result.valid).toBe(true)
    expect(result.reason).toBeNull()
  })

  it('returns invalid when proposal exceeds profit by 1 TL', () => {
    const result = validateDividendDeclaration(100_001, 100_000)
    expect(result.valid).toBe(false)
    expect(result.reason).not.toBeNull()
  })

  it('invalid reason includes TTK 509 reference', () => {
    const result = validateDividendDeclaration(200_000, 100_000)
    expect(result.reason).toContain('TTK 509')
  })

  it('returns valid for 0 proposal and 0 profit', () => {
    const result = validateDividendDeclaration(0, 0)
    expect(result.valid).toBe(true)
  })

  it('returns invalid when profit is 0 but proposal > 0', () => {
    const result = validateDividendDeclaration(1, 0)
    expect(result.valid).toBe(false)
  })

  it('valid case has reason=null', () => {
    const result = validateDividendDeclaration(1, 100)
    expect(result.reason).toBeNull()
  })

  it('invalid case has reason as non-empty string', () => {
    const result = validateDividendDeclaration(100, 50)
    expect(typeof result.reason).toBe('string')
    expect((result.reason as string).length).toBeGreaterThan(0)
  })
})

// ── computePerPartnerAmount — sharePct=100 and zero distributions ─────────────

describe('computePerPartnerAmount — edge cases', () => {
  it('single partner with share_ratio=1.0 receives full gross', () => {
    const result = computePerPartnerAmount(100_000, [{ name: 'Solo', share_ratio: 1.0 }])
    expect(result).toHaveLength(1)
    expect(result[0].gross_try).toBe(100_000)
    expect(result[0].withholding_try).toBe(10_000)
    expect(result[0].net_try).toBe(90_000)
  })

  it('returns empty array for zero gross', () => {
    const result = computePerPartnerAmount(0, [{ name: 'A', share_ratio: 0.5 }])
    expect(result).toHaveLength(0)
  })

  it('returns empty array for empty partner list', () => {
    expect(computePerPartnerAmount(100_000, [])).toHaveLength(0)
  })

  it('paid is false by default for all partners', () => {
    const partners = [
      { name: 'A', share_ratio: 0.5 },
      { name: 'B', share_ratio: 0.5 },
    ]
    const result = computePerPartnerAmount(100_000, partners)
    for (const pp of result) {
      expect(pp.paid).toBe(false)
    }
  })
})

// ── sumByPartner — multiple partners and zero distributions ───────────────────

describe('sumByPartner — aggregation correctness', () => {
  it('returns empty for empty entries', () => {
    expect(sumByPartner([])).toHaveLength(0)
  })

  it('excludes cancelled entries from totals', () => {
    const cancelledEntry: DividendLedgerEntry = {
      ...makeDeclaredEntry('c1', [{ partner_name: 'A', share_ratio: 1, gross_try: 50_000, withholding_try: 5_000, net_try: 45_000, paid: false }]),
      event_type: 'cancelled',
    }
    const result = sumByPartner([cancelledEntry])
    expect(result).toHaveLength(0)
  })

  it('includes both declared and paid entries in totals', () => {
    const pp = [{ partner_name: 'X', share_ratio: 1, gross_try: 100_000, withholding_try: 10_000, net_try: 90_000, paid: false }]
    const declared = makeDeclaredEntry('d1', pp, 100_000)
    const pp2 = [{ partner_name: 'X', share_ratio: 1, gross_try: 50_000, withholding_try: 5_000, net_try: 45_000, paid: true }]
    const paid = makePaidEntry('p1', pp2, 50_000)
    const result = sumByPartner([declared, paid])
    const x = result.find(r => r.partner_name === 'X')!
    expect(x.total_gross_try).toBe(150_000)
    expect(x.total_net_try).toBe(135_000)
    expect(x.total_withholding_try).toBe(15_000)
  })

  it('aggregates 3 separate declared entries for same partner', () => {
    const makeEntry = (id: string, gross: number) => {
      const pp = [{ partner_name: 'Z', share_ratio: 1, gross_try: gross, withholding_try: gross * 0.1, net_try: gross * 0.9, paid: false }]
      return makeDeclaredEntry(id, pp, gross)
    }
    const result = sumByPartner([
      makeEntry('e1', 100_000),
      makeEntry('e2', 200_000),
      makeEntry('e3', 300_000),
    ])
    const z = result.find(r => r.partner_name === 'Z')!
    expect(z.total_gross_try).toBe(600_000)
    expect(z.total_withholding_try).toBe(60_000)
    expect(z.total_net_try).toBe(540_000)
  })
})
