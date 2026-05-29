/**
 * Tests for pure helper functions extracted from app/api/collections/route.ts.
 *
 * Covers Faz 13-F: NaN guard for amount_paid + risk sort scoring.
 * No DB, no Supabase, no HTTP — pure math and input sanitization.
 *
 * Run with: npx vitest run tests/collections-route-pure.test.ts
 */
import { describe, it, expect } from 'vitest'
import { sanitizePaidAmount, computeCollectionRiskScore } from '../lib/utils/collections-pure'

// ─────────────────────────────────────────────────────────────────────────────
// Additional edge-case coverage for sanitizePaidAmount
// ─────────────────────────────────────────────────────────────────────────────

describe('sanitizePaidAmount — extended edge cases', () => {
  it('boolean true coerces to 1', () => {
    // Number(true) = 1 → Math.max(0, 1) = 1
    expect(sanitizePaidAmount(true as unknown as number)).toBe(1)
  })

  it('boolean false coerces to 0', () => {
    // Number(false) = 0 → Math.max(0, 0||0) = 0
    expect(sanitizePaidAmount(false as unknown as number)).toBe(0)
  })

  it('whitespace string " " → 0 (NaN guard)', () => {
    // Number(' ') = 0 in JS, 0||0 = 0
    expect(sanitizePaidAmount(' ' as unknown as number)).toBe(0)
  })

  it('string " 750.5 " with padding → 750.5', () => {
    // Number(' 750.5 ') = 750.5 in JS
    expect(sanitizePaidAmount(' 750.5 ' as unknown as number)).toBe(750.5)
  })

  it('integer 1 → 1 (boundary at minimum positive)', () => {
    expect(sanitizePaidAmount(1)).toBe(1)
  })

  it('very small positive float → returned as-is', () => {
    expect(sanitizePaidAmount(0.001)).toBe(0.001)
  })

  it('string "0" → 0', () => {
    expect(sanitizePaidAmount('0' as unknown as number)).toBe(0)
  })

  it('negative string "-100" → 0', () => {
    expect(sanitizePaidAmount('-100' as unknown as number)).toBe(0)
  })

  it('null-like value 0 is distinct from null — returns 0 not null', () => {
    const result = sanitizePaidAmount(0)
    expect(result).toBe(0)
    expect(result).not.toBeNull()
  })

  it('returns number type for numeric input', () => {
    expect(typeof sanitizePaidAmount(100)).toBe('number')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// sanitizePaidAmount — NaN guard (Faz 13-F)
// ─────────────────────────────────────────────────────────────────────────────

describe('sanitizePaidAmount', () => {
  it('null input → null (do not overwrite existing DB value)', () => {
    expect(sanitizePaidAmount(null)).toBeNull()
  })

  it('undefined input → null', () => {
    expect(sanitizePaidAmount(undefined)).toBeNull()
  })

  it('positive number → returns as-is', () => {
    expect(sanitizePaidAmount(5000)).toBe(5000)
  })

  it('zero → 0', () => {
    expect(sanitizePaidAmount(0)).toBe(0)
  })

  it('NaN as number → 0 (NaN guard)', () => {
    expect(sanitizePaidAmount(NaN)).toBe(0)
  })

  it('negative number → 0 (floor at 0)', () => {
    expect(sanitizePaidAmount(-100)).toBe(0)
    expect(sanitizePaidAmount(-0.01)).toBe(0)
  })

  it('numeric string "500" → 500', () => {
    expect(sanitizePaidAmount('500' as unknown as number)).toBe(500)
  })

  it('non-numeric string "abc" → 0 (NaN guard)', () => {
    expect(sanitizePaidAmount('abc' as unknown as number)).toBe(0)
  })

  it('empty string "" → 0', () => {
    expect(sanitizePaidAmount('' as unknown as number)).toBe(0)
  })

  it('Infinity → Infinity (not clipped — valid JS number)', () => {
    // Math.max(0, Infinity || 0) = Infinity — left as-is intentionally
    expect(sanitizePaidAmount(Infinity)).toBe(Infinity)
  })

  it('very large valid amount → returned as-is', () => {
    expect(sanitizePaidAmount(9_999_999.99)).toBe(9_999_999.99)
  })

  it('decimal string "1234.56" → 1234.56', () => {
    expect(sanitizePaidAmount('1234.56' as unknown as number)).toBe(1234.56)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeCollectionRiskScore — risk sort scoring (Faz 13-F)
//
// Formula: score = days_since_ref × 0.6 + (amount_try / 10_000) × 0.4
// ref = due_date if present, else sale_date, else '' (→ 0 days)
// ─────────────────────────────────────────────────────────────────────────────

describe('computeCollectionRiskScore', () => {
  it('overdue 10 days, ₺50k → 10×0.6 + 5×0.4 = 8.0', () => {
    const score = computeCollectionRiskScore(
      { due_date: '2025-01-01', total_try: 50_000 },
      '2025-01-11',  // 10 days after due
    )
    expect(score).toBeCloseTo(8.0, 5)
  })

  it('overdue 30 days, ₺100k → 30×0.6 + 10×0.4 = 22.0', () => {
    const score = computeCollectionRiskScore(
      { due_date: '2025-01-01', total_try: 100_000 },
      '2025-01-31',
    )
    expect(score).toBeCloseTo(22.0, 5)
  })

  it('not yet due (due_date in future) → days = 0, only amount contributes', () => {
    const score = computeCollectionRiskScore(
      { due_date: '2025-12-31', total_try: 100_000 },
      '2025-01-01',
    )
    // days = 0 → score = 0 + (100000/10000)×0.4 = 4.0
    expect(score).toBeCloseTo(4.0, 5)
  })

  it('falls back to sale_date when due_date is null', () => {
    const score = computeCollectionRiskScore(
      { due_date: null, sale_date: '2025-01-01', total_try: 0 },
      '2025-01-11',  // 10 days after sale_date
    )
    // days = 10 → score = 10×0.6 + 0 = 6.0
    expect(score).toBeCloseTo(6.0, 5)
  })

  it('no due_date, no sale_date → days = 0', () => {
    const score = computeCollectionRiskScore(
      { due_date: null, sale_date: null, total_try: 10_000 },
      '2025-01-01',
    )
    // days = 0 → score = 0 + (10000/10000)×0.4 = 0.4
    expect(score).toBeCloseTo(0.4, 5)
  })

  it('zero amount, overdue 100 days → pure time component', () => {
    const score = computeCollectionRiskScore(
      { due_date: '2025-01-01', total_try: 0 },
      '2025-04-11',  // 100 days after
    )
    // score = 100×0.6 + 0 = 60.0
    expect(score).toBeCloseTo(60.0, 5)
  })

  it('same-day due_date and today → days = 0', () => {
    const score = computeCollectionRiskScore(
      { due_date: '2025-06-15', total_try: 0 },
      '2025-06-15',
    )
    expect(score).toBe(0)
  })

  it('higher score wins risk sort (larger = more urgent)', () => {
    const overdue = computeCollectionRiskScore(
      { due_date: '2025-01-01', total_try: 200_000 },
      '2025-03-01',  // 59 days overdue
    )
    const recent = computeCollectionRiskScore(
      { due_date: '2025-02-25', total_try: 5_000 },
      '2025-03-01',  // 4 days overdue, small amount
    )
    expect(overdue).toBeGreaterThan(recent)
  })

  it('undefined total_try treated as 0 (no crash)', () => {
    const score = computeCollectionRiskScore(
      { due_date: '2025-01-01' },  // total_try missing
      '2025-01-11',
    )
    // days = 10 → score = 10×0.6 + 0 = 6.0
    expect(score).toBeCloseTo(6.0, 5)
  })

  it('null total_try treated as 0', () => {
    const score = computeCollectionRiskScore(
      { due_date: '2025-01-01', total_try: null },
      '2025-01-06',
    )
    // days = 5 → score = 5×0.6 + 0 = 3.0
    expect(score).toBeCloseTo(3.0, 5)
  })

  it('score is always non-negative (clipped at 0 for future dates)', () => {
    const score = computeCollectionRiskScore(
      { due_date: '2099-01-01', total_try: 0 },
      '2025-01-01',
    )
    expect(score).toBeGreaterThanOrEqual(0)
  })

  it('fractional days are rounded correctly', () => {
    // 2025-01-01 to 2025-01-02 = 1 day
    const score = computeCollectionRiskScore(
      { due_date: '2025-01-01', total_try: 10_000 },
      '2025-01-02',
    )
    // 1×0.6 + 1×0.4 = 1.0
    expect(score).toBeCloseTo(1.0, 5)
  })

  it('very large amount dominates when not overdue', () => {
    const score = computeCollectionRiskScore(
      { due_date: '2025-06-01', total_try: 10_000_000 },
      '2025-06-01',
    )
    // days = 0 → score = (10_000_000/10_000)×0.4 = 400
    expect(score).toBeCloseTo(400, 5)
  })

  it('sale_date fallback ignores due_date = undefined (not null)', () => {
    const score = computeCollectionRiskScore(
      { sale_date: '2025-01-01', total_try: 0 },
      '2025-01-11',
    )
    // due_date is undefined → falls to sale_date → days = 10 → 10×0.6 = 6.0
    expect(score).toBeCloseTo(6.0, 5)
  })

  it('exactly 365 days overdue, ₺20k (non-leap year span)', () => {
    // 2025-01-01 to 2026-01-01 = 365 days (2025 is not a leap year)
    const score = computeCollectionRiskScore(
      { due_date: '2025-01-01', total_try: 20_000 },
      '2026-01-01',
    )
    // days = 365 → 365×0.6 + 2×0.4 = 219.8
    expect(score).toBeCloseTo(219.8, 5)
  })

  it('amount component scales linearly', () => {
    const s1 = computeCollectionRiskScore({ due_date: '2025-06-01', total_try: 10_000 }, '2025-06-01')
    const s2 = computeCollectionRiskScore({ due_date: '2025-06-01', total_try: 20_000 }, '2025-06-01')
    // s2 should be exactly double s1 (same days=0)
    expect(s2).toBeCloseTo(s1 * 2, 5)
  })
})
