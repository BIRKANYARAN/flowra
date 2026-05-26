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
})
