/**
 * Tests for lib/services/pcle/dividend-ledger.service.ts
 *
 * Pure function tests — no DB required.
 * Tests cover:
 *   - computePerPartnerAmount: 50/50, unequal 3-way, zero gross
 *   - computeWithholding:      normal, zero, large amount
 *   - sumByPartner:            no entries, single entry, multi-entry aggregation
 */

import { describe, it, expect } from 'vitest'
import {
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

// ── computePerPartnerAmount ───────────────────────────────────────────────────

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

// ── computeWithholding ────────────────────────────────────────────────────────

describe('computeWithholding', () => {
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
    // 3333.33 * 0.10 = 333.333 → rounds to 333.33
    expect(computeWithholding(3333.33)).toBe(333.33)
  })
})

// ── sumByPartner ──────────────────────────────────────────────────────────────

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
