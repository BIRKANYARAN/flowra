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
