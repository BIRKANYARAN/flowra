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

  // ── Additional: threshold boundaries ─────────────────────────────────────

  it('applies 10% buffer correctly on large amounts (1M TRY net KDV)', () => {
    // Standard Turkish KDV %18 scenario on large B2B transaction
    const result = computeKdvReserve(1_000_000, 0)
    expect(result).toBeCloseTo(1_100_000, 2)
  })

  it('returns exact 1.1 multiplier on a round number', () => {
    const result = computeKdvReserve(100, 0)
    expect(result).toBeCloseTo(110, 5)
  })

  it('handles Turkish KDV %1 scenario (food items) — small margin', () => {
    // output 1010, input 1000 → net 10, reserved 11
    const result = computeKdvReserve(1_010, 1_000)
    expect(result).toBeCloseTo(11, 2)
  })

  it('handles Turkish KDV %8 scenario (basic goods) — medium margin', () => {
    // output 1080, input 200 → net 880, reserved 968
    const result = computeKdvReserve(1_080, 200)
    expect(result).toBeCloseTo(968, 2)
  })

  it('handles Turkish KDV %18 scenario (standard rate) — large output', () => {
    // output 18000, input 3600 → net 14400, reserved 15840
    const result = computeKdvReserve(18_000, 3_600)
    expect(result).toBeCloseTo(15_840, 2)
  })

  it('handles negative inputKdv (rare data error) — treats as extra output', () => {
    // outputKdv=5000, inputKdv=-500 → net = max(0, 5000-(-500)) = 5500, reserved = 6050
    const result = computeKdvReserve(5_000, -500)
    expect(result).toBeCloseTo(6_050, 2)
  })

  it('produces zero reserve when both are zero', () => {
    expect(computeKdvReserve(0, 0)).toBe(0)
  })

  it('rounding accuracy: 1 TRY net KDV → 1.1 TRY reserved', () => {
    expect(computeKdvReserve(1, 0)).toBeCloseTo(1.1, 5)
  })

  it('clamps correctly at boundary: output exactly equals input', () => {
    // net = 0 → reserve = 0
    expect(computeKdvReserve(99_999, 99_999)).toBe(0)
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

  // ── Additional: boundary precision ───────────────────────────────────────

  it('returns "tight" at 119.99999 (just below adequate boundary)', () => {
    expect(computeCoverageStatus(119.99999)).toBe('tight')
  })

  it('returns "adequate" at 120.00001 (just above adequate boundary)', () => {
    expect(computeCoverageStatus(120.00001)).toBe('adequate')
  })

  it('returns "insufficient" at 79.99 (just below tight boundary)', () => {
    expect(computeCoverageStatus(79.99)).toBe('insufficient')
  })

  it('returns "tight" at 80.01 (just above insufficient boundary)', () => {
    expect(computeCoverageStatus(80.01)).toBe('tight')
  })

  it('returns "inadequate" for very low coverage (1%)', () => {
    expect(computeCoverageStatus(1)).toBe('insufficient')
  })

  it('returns "adequate" for very high coverage (1000%)', () => {
    expect(computeCoverageStatus(1000)).toBe('adequate')
  })

  it('returns "insufficient" for zero coverage', () => {
    expect(computeCoverageStatus(0)).toBe('insufficient')
  })

  it('returns "insufficient" for negative coverage (impossible but defensive)', () => {
    expect(computeCoverageStatus(-10)).toBe('insufficient')
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

  // ── Additional: edge cases ────────────────────────────────────────────────

  it('returns "overdue" for very large negative days (e.g. old KDV debt)', () => {
    expect(assignTaxStatus(-365, 50_000)).toBe('overdue')
  })

  it('returns "upcoming" for very far-future date (e.g. KV due in 330 days)', () => {
    expect(assignTaxStatus(330, 100_000)).toBe('upcoming')
  })

  it('returns "paid" for 0 amount and overdue days', () => {
    expect(assignTaxStatus(-10, 0)).toBe('paid')
  })

  it('returns "paid" for 0 amount and upcoming days', () => {
    expect(assignTaxStatus(100, 0)).toBe('paid')
  })

  it('returns "due_soon" on day 0 (today is due date) with positive amount', () => {
    expect(assignTaxStatus(0, 1)).toBe('due_soon')
  })

  it('handles very large amounts correctly (gecici vergi for big corp)', () => {
    expect(assignTaxStatus(5, 10_000_000)).toBe('due_soon')
    expect(assignTaxStatus(15, 10_000_000)).toBe('upcoming')
  })

  it('handles fractional amounts (small rounding artifact)', () => {
    expect(assignTaxStatus(10, 0.01)).toBe('due_soon')
    expect(assignTaxStatus(10, 0)).toBe('paid')
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

  // ── Additional: Turkish tax date accuracy ────────────────────────────────

  it('due date format is always ISO YYYY-MM-DD with zero-padded month and day', () => {
    const result = computeGeciVergiDueDate(2026, 1)
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('Q2 due date Aug 17 is zero-padded: 2026-08-17 not 2026-8-17', () => {
    expect(computeGeciVergiDueDate(2026, 5)).toBe('2026-08-17')
  })

  it('Q3 due date Nov 17 is zero-padded: 2026-11-17', () => {
    expect(computeGeciVergiDueDate(2026, 9)).toBe('2026-11-17')
  })

  it('returns null for month 10 (first Q4 month)', () => {
    expect(computeGeciVergiDueDate(2025, 10)).toBeNull()
  })

  it('returns null for month 12 (last Q4 month)', () => {
    expect(computeGeciVergiDueDate(2025, 12)).toBeNull()
  })

  it('works correctly for leap year (2028)', () => {
    expect(computeGeciVergiDueDate(2028, 2)).toBe('2028-05-17')
  })

  it('returns Q1 due date in different years consistently', () => {
    expect(computeGeciVergiDueDate(2024, 3)).toBe('2024-05-17')
    expect(computeGeciVergiDueDate(2025, 3)).toBe('2025-05-17')
    expect(computeGeciVergiDueDate(2026, 3)).toBe('2026-05-17')
  })

  it('due date is always the 17th of the month (GVK rule)', () => {
    const q1 = computeGeciVergiDueDate(2026, 1)!
    const q2 = computeGeciVergiDueDate(2026, 4)!
    const q3 = computeGeciVergiDueDate(2026, 7)!
    expect(q1.endsWith('-17')).toBe(true)
    expect(q2.endsWith('-17')).toBe(true)
    expect(q3.endsWith('-17')).toBe(true)
  })

  it('Q1 due month is always 05 (May)', () => {
    const result = computeGeciVergiDueDate(2026, 2)!
    expect(result.slice(5, 7)).toBe('05')
  })

  it('Q2 due month is always 08 (August)', () => {
    const result = computeGeciVergiDueDate(2026, 6)!
    expect(result.slice(5, 7)).toBe('08')
  })

  it('Q3 due month is always 11 (November)', () => {
    const result = computeGeciVergiDueDate(2026, 8)!
    expect(result.slice(5, 7)).toBe('11')
  })
})
