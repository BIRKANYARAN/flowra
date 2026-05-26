/**
 * Tests for lib/services/tax/tax-reserve.service.ts
 *
 * Tests the pure helper functions only (no DB required):
 *   computeKdvReserve(outputKdv, inputKdv)
 *   computeCoverageStatus(coveragePct)
 *   assignTaxStatus(daysUntilDue, amount)
 *   computeGeciVergiDueDate(year, month)
 *
 * Run with: npx vitest run tests/tax-reserve.test.ts
 */

import { describe, it, expect } from 'vitest'
import {
  computeKdvReserve,
  computeCoverageStatus,
  assignTaxStatus,
  computeGeciVergiDueDate,
} from '../lib/services/tax/tax-reserve.service'

// ── computeKdvReserve ─────────────────────────────────────────────────────────

describe('computeKdvReserve', () => {
  it('returns net KDV × 1.1 when output > input', () => {
    const result = computeKdvReserve(10_000, 3_000)
    // net = 7000, reserved = 7000 × 1.1 = 7700
    expect(result).toBeCloseTo(7_700, 2)
  })

  it('returns 0 when input KDV is zero', () => {
    const result = computeKdvReserve(0, 0)
    expect(result).toBe(0)
  })

  it('returns outputKdv × 1.1 when inputKdv is zero', () => {
    const result = computeKdvReserve(5_000, 0)
    expect(result).toBeCloseTo(5_500, 2)
  })

  it('returns 0 when output KDV < input KDV (no net liability)', () => {
    const result = computeKdvReserve(2_000, 8_000)
    // output - input = -6000 → clamped to 0 → reserved = 0
    expect(result).toBe(0)
  })

  it('returns 0 when output KDV equals input KDV', () => {
    const result = computeKdvReserve(4_000, 4_000)
    expect(result).toBe(0)
  })
})

// ── computeCoverageStatus ─────────────────────────────────────────────────────

describe('computeCoverageStatus', () => {
  it('returns "unknown" when coverage is null', () => {
    expect(computeCoverageStatus(null)).toBe('unknown')
  })

  it('returns "adequate" when coverage >= 120%', () => {
    expect(computeCoverageStatus(120)).toBe('adequate')
    expect(computeCoverageStatus(150)).toBe('adequate')
    expect(computeCoverageStatus(200)).toBe('adequate')
  })

  it('returns "tight" when coverage is between 80% and 119.9%', () => {
    expect(computeCoverageStatus(80)).toBe('tight')
    expect(computeCoverageStatus(100)).toBe('tight')
    expect(computeCoverageStatus(119.9)).toBe('tight')
  })

  it('returns "insufficient" when coverage < 80%', () => {
    expect(computeCoverageStatus(79.9)).toBe('insufficient')
    expect(computeCoverageStatus(50)).toBe('insufficient')
    expect(computeCoverageStatus(0)).toBe('insufficient')
  })

  it('handles exact boundary at 120%', () => {
    expect(computeCoverageStatus(120)).toBe('adequate')
  })

  it('handles exact boundary at 80%', () => {
    expect(computeCoverageStatus(80)).toBe('tight')
  })
})

// ── assignTaxStatus ───────────────────────────────────────────────────────────

describe('assignTaxStatus', () => {
  it('returns "paid" when amount is 0 regardless of days', () => {
    expect(assignTaxStatus(-5, 0)).toBe('paid')
    expect(assignTaxStatus(7,  0)).toBe('paid')
    expect(assignTaxStatus(30, 0)).toBe('paid')
  })

  it('returns "paid" when amount is negative', () => {
    expect(assignTaxStatus(10, -1)).toBe('paid')
  })

  it('returns "overdue" when days is negative and amount > 0', () => {
    expect(assignTaxStatus(-1, 5_000)).toBe('overdue')
    expect(assignTaxStatus(-30, 5_000)).toBe('overdue')
  })

  it('returns "due_soon" when 0 <= days <= 14 and amount > 0', () => {
    expect(assignTaxStatus(0,  5_000)).toBe('due_soon')
    expect(assignTaxStatus(7,  5_000)).toBe('due_soon')
    expect(assignTaxStatus(14, 5_000)).toBe('due_soon')
  })

  it('returns "upcoming" when days > 14 and amount > 0', () => {
    expect(assignTaxStatus(15, 5_000)).toBe('upcoming')
    expect(assignTaxStatus(30, 5_000)).toBe('upcoming')
    expect(assignTaxStatus(90, 5_000)).toBe('upcoming')
  })

  it('boundary: 14 days is due_soon', () => {
    expect(assignTaxStatus(14, 1)).toBe('due_soon')
  })

  it('boundary: 15 days is upcoming', () => {
    expect(assignTaxStatus(15, 1)).toBe('upcoming')
  })
})

// ── computeGeciVergiDueDate ───────────────────────────────────────────────────

describe('computeGeciVergiDueDate', () => {
  it('Q1 months (Jan, Feb, Mar) → May 17', () => {
    expect(computeGeciVergiDueDate(2026, 1)).toBe('2026-05-17')
    expect(computeGeciVergiDueDate(2026, 2)).toBe('2026-05-17')
    expect(computeGeciVergiDueDate(2026, 3)).toBe('2026-05-17')
  })

  it('Q2 months (Apr, May, Jun) → Aug 17', () => {
    expect(computeGeciVergiDueDate(2026, 4)).toBe('2026-08-17')
    expect(computeGeciVergiDueDate(2026, 5)).toBe('2026-08-17')
    expect(computeGeciVergiDueDate(2026, 6)).toBe('2026-08-17')
  })

  it('Q3 months (Jul, Aug, Sep) → Nov 17', () => {
    expect(computeGeciVergiDueDate(2026, 7)).toBe('2026-11-17')
    expect(computeGeciVergiDueDate(2026, 8)).toBe('2026-11-17')
    expect(computeGeciVergiDueDate(2026, 9)).toBe('2026-11-17')
  })

  it('Q4 months (Oct, Nov, Dec) → null (covered by annual KV)', () => {
    expect(computeGeciVergiDueDate(2026, 10)).toBeNull()
    expect(computeGeciVergiDueDate(2026, 11)).toBeNull()
    expect(computeGeciVergiDueDate(2026, 12)).toBeNull()
  })

  it('respects the year parameter', () => {
    expect(computeGeciVergiDueDate(2027, 1)).toBe('2027-05-17')
    expect(computeGeciVergiDueDate(2025, 6)).toBe('2025-08-17')
  })
})
