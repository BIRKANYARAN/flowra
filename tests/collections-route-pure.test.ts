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

// ─────────────────────────────────────────────────────────────────────────────
// sanitizePaidAmount — stress & type coercion corner cases
// ─────────────────────────────────────────────────────────────────────────────

describe('sanitizePaidAmount — type coercion corner cases', () => {
  it('object input → NaN coercion → 0', () => {
    // Number({}) = NaN → 0
    expect(sanitizePaidAmount({} as unknown as number)).toBe(0)
  })

  it('array [] → Number([]) = 0 → 0', () => {
    expect(sanitizePaidAmount([] as unknown as number)).toBe(0)
  })

  it('array [5] → Number([5]) = 5 → 5', () => {
    expect(sanitizePaidAmount([5] as unknown as number)).toBe(5)
  })

  it('negative Infinity → 0 (clamped)', () => {
    expect(sanitizePaidAmount(-Infinity)).toBe(0)
  })

  it('returns null (not 0) for undefined input', () => {
    const result = sanitizePaidAmount(undefined)
    expect(result).toBeNull()
    expect(result).not.toBe(0)
  })

  it('returns null (not 0) for null input', () => {
    const result = sanitizePaidAmount(null)
    expect(result).toBeNull()
  })

  it('string "1e3" (scientific notation) → 1000', () => {
    expect(sanitizePaidAmount('1e3' as unknown as number)).toBe(1000)
  })

  it('string "0.5" → 0.5', () => {
    expect(sanitizePaidAmount('0.5' as unknown as number)).toBe(0.5)
  })

  it('large integer string → parsed correctly', () => {
    expect(sanitizePaidAmount('999999' as unknown as number)).toBe(999999)
  })

  it('output is never NaN', () => {
    const inputs: Array<number | string | null | undefined> = [
      null, undefined, NaN, '', 'abc', -5, 0, 100, '500', '3.14',
    ]
    for (const v of inputs) {
      const result = sanitizePaidAmount(v as number)
      if (result !== null) {
        expect(isNaN(result)).toBe(false)
      }
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeCollectionRiskScore — formula component isolation
// ─────────────────────────────────────────────────────────────────────────────

describe('computeCollectionRiskScore — formula component isolation', () => {
  it('time component weight is 0.6 per day', () => {
    // days = 1, amount = 0 → 1 × 0.6 = 0.6
    const score = computeCollectionRiskScore(
      { due_date: '2025-03-01', total_try: 0 },
      '2025-03-02',
    )
    expect(score).toBeCloseTo(0.6, 5)
  })

  it('amount component weight is 0.4 per 10k', () => {
    // days = 0, amount = 10_000 → (10000/10000) × 0.4 = 0.4
    const score = computeCollectionRiskScore(
      { due_date: '2025-03-01', total_try: 10_000 },
      '2025-03-01',
    )
    expect(score).toBeCloseTo(0.4, 5)
  })

  it('combined 5 days + ₺50k = 5×0.6 + 5×0.4 = 5', () => {
    const score = computeCollectionRiskScore(
      { due_date: '2025-01-01', total_try: 50_000 },
      '2025-01-06',
    )
    expect(score).toBeCloseTo(5.0, 5)
  })

  it('returns 0 for both empty dates and zero amount', () => {
    const score = computeCollectionRiskScore(
      { due_date: null, sale_date: null, total_try: 0 },
      '2025-01-01',
    )
    expect(score).toBe(0)
  })

  it('negative days clamped to 0 (future due date)', () => {
    // due_date is far in the future
    const score = computeCollectionRiskScore(
      { due_date: '2099-12-31', total_try: 0 },
      '2025-01-01',
    )
    expect(score).toBe(0)
  })

  it('score is finite for very large amounts', () => {
    const score = computeCollectionRiskScore(
      { due_date: '2025-01-01', total_try: 1_000_000_000 },
      '2025-01-01',
    )
    expect(isFinite(score)).toBe(true)
  })

  it('score is always non-negative', () => {
    const inputs = [
      { due_date: '2025-12-31', total_try: 0 },
      { due_date: null, sale_date: null, total_try: 0 },
      { due_date: '2099-01-01', total_try: 0 },
    ]
    for (const row of inputs) {
      expect(computeCollectionRiskScore(row, '2025-01-01')).toBeGreaterThanOrEqual(0)
    }
  })

  it('due_date takes precedence over sale_date', () => {
    // due_date is 10 days ago, sale_date is 30 days ago
    const score = computeCollectionRiskScore(
      { due_date: '2025-01-21', sale_date: '2025-01-01', total_try: 0 },
      '2025-01-31',
    )
    // uses due_date → days=10 → 10×0.6 = 6.0
    expect(score).toBeCloseTo(6.0, 5)
    // if sale_date was used: days=30 → 30×0.6 = 18.0 (different)
  })

  it('due_date empty string → refDate is empty string → days = 0 (sale_date NOT used)', () => {
    // due_date = '' — ?? picks '' (not null/undefined), refDate = ''
    // '' is falsy so the ternary gives days = 0
    const score = computeCollectionRiskScore(
      { due_date: '', sale_date: '2025-01-01', total_try: 0 },
      '2025-01-11',
    )
    // refDate = '' → falsy → days = 0 → score = 0
    expect(score).toBeCloseTo(0, 5)
  })

  it('amount 1 TRY → (1/10000) × 0.4 = 0.00004', () => {
    const score = computeCollectionRiskScore(
      { due_date: '2025-06-01', total_try: 1 },
      '2025-06-01',
    )
    expect(score).toBeCloseTo(0.00004, 6)
  })

  it('7-day overdue ₺0 → 7×0.6 = 4.2', () => {
    const score = computeCollectionRiskScore(
      { due_date: '2025-02-01', total_try: 0 },
      '2025-02-08',
    )
    expect(score).toBeCloseTo(4.2, 5)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Integration: sanitizePaidAmount + computeCollectionRiskScore together
// ─────────────────────────────────────────────────────────────────────────────

describe('collections pure utils — integration patterns', () => {
  it('sanitizePaidAmount output is safe to use in risk score numerics', () => {
    const paid = sanitizePaidAmount(NaN)  // → 0
    // Use in a hypothetical outstanding = total - paid scenario
    const outstanding = 10_000 - (paid ?? 0)
    expect(outstanding).toBe(10_000)
    expect(isNaN(outstanding)).toBe(false)
  })

  it('null paid amount (no update) does not corrupt a risk score computation', () => {
    const paid = sanitizePaidAmount(null)  // → null (no update)
    const totalTry = 5_000
    // When paid is null, use totalTry unchanged
    const effectiveTry = paid !== null ? totalTry - paid : totalTry
    const score = computeCollectionRiskScore(
      { due_date: '2025-01-01', total_try: effectiveTry },
      '2025-01-06',
    )
    // days=5, effectiveTry=5000 → 5×0.6 + 0.5×0.4 = 3.2
    expect(score).toBeCloseTo(3.2, 5)
  })

  it('partial payment reduces outstanding and lowers risk score', () => {
    const totalTry = 50_000
    const fullScore = computeCollectionRiskScore(
      { due_date: '2025-01-01', total_try: totalTry },
      '2025-01-11',
    )
    const paid = sanitizePaidAmount(30_000) ?? 0
    const remaining = totalTry - paid  // 20_000
    const partialScore = computeCollectionRiskScore(
      { due_date: '2025-01-01', total_try: remaining },
      '2025-01-11',
    )
    expect(partialScore).toBeLessThan(fullScore)
  })

  it('sanitizePaidAmount result type is compatible with risk score input', () => {
    const paid = sanitizePaidAmount(5_000)
    expect(typeof paid).toBe('number')
    const score = computeCollectionRiskScore(
      { due_date: '2025-01-01', total_try: paid! },
      '2025-01-01',
    )
    expect(isFinite(score)).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// sanitizePaidAmount — boundary probing
// ─────────────────────────────────────────────────────────────────────────────

describe('sanitizePaidAmount — boundary probing', () => {
  it('Number.EPSILON → tiny positive → returned as-is', () => {
    expect(sanitizePaidAmount(Number.EPSILON)).toBe(Number.EPSILON)
  })

  it('Number.MAX_SAFE_INTEGER → returned as-is', () => {
    expect(sanitizePaidAmount(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER)
  })

  it('Number.MIN_SAFE_INTEGER (negative) → 0', () => {
    expect(sanitizePaidAmount(Number.MIN_SAFE_INTEGER)).toBe(0)
  })

  it('-0 → treated as 0 (Math.max(0, -0) = 0)', () => {
    expect(sanitizePaidAmount(-0)).toBe(0)
  })

  it('string "NaN" → NaN → 0', () => {
    // Number('NaN') = NaN → 0
    expect(sanitizePaidAmount('NaN' as unknown as number)).toBe(0)
  })

  it('string "Infinity" → Infinity (valid JS number)', () => {
    expect(sanitizePaidAmount('Infinity' as unknown as number)).toBe(Infinity)
  })

  it('integer coercion: 1.9 → 1.9 (not rounded)', () => {
    expect(sanitizePaidAmount(1.9)).toBe(1.9)
  })

  it('0.0001 → 0.0001 (not rounded to 0)', () => {
    expect(sanitizePaidAmount(0.0001)).toBeCloseTo(0.0001, 6)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeCollectionRiskScore — date arithmetic precision
// ─────────────────────────────────────────────────────────────────────────────

describe('computeCollectionRiskScore — date arithmetic precision', () => {
  it('2 days → 2×0.6 = 1.2 time component', () => {
    const score = computeCollectionRiskScore(
      { due_date: '2025-05-01', total_try: 0 },
      '2025-05-03',
    )
    expect(score).toBeCloseTo(1.2, 5)
  })

  it('month boundary: Jan 31 to Feb 1 = 1 day', () => {
    const score = computeCollectionRiskScore(
      { due_date: '2025-01-31', total_try: 0 },
      '2025-02-01',
    )
    expect(score).toBeCloseTo(0.6, 5)
  })

  it('year boundary: Dec 31 to Jan 1 = 1 day', () => {
    const score = computeCollectionRiskScore(
      { due_date: '2024-12-31', total_try: 0 },
      '2025-01-01',
    )
    expect(score).toBeCloseTo(0.6, 5)
  })

  it('result is a number (not NaN) for valid inputs', () => {
    const score = computeCollectionRiskScore(
      { due_date: '2025-03-15', total_try: 10_000 },
      '2025-03-20',
    )
    expect(isNaN(score)).toBe(false)
  })

  it('result is finite for all valid inputs', () => {
    const score = computeCollectionRiskScore(
      { due_date: '2025-03-15', total_try: 100_000 },
      '2025-04-01',
    )
    expect(isFinite(score)).toBe(true)
  })
})

// ── sanitizePaidAmount — extended edge cases ──────────────────────────────────

describe('sanitizePaidAmount — extended edge cases', () => {
  it('string "0" returns 0', () => {
    expect(sanitizePaidAmount('0')).toBe(0)
  })

  it('string "100" returns 100', () => {
    expect(sanitizePaidAmount('100')).toBe(100)
  })

  it('string "1234.56" returns 1234.56', () => {
    expect(sanitizePaidAmount('1234.56')).toBeCloseTo(1234.56, 2)
  })

  it('string "-50" returns 0 (negative floor)', () => {
    expect(sanitizePaidAmount('-50')).toBe(0)
  })

  it('string "abc" returns 0 (non-numeric)', () => {
    expect(sanitizePaidAmount('abc')).toBe(0)
  })

  it('string "" returns 0 (empty string)', () => {
    expect(sanitizePaidAmount('')).toBe(0)
  })

  it('null returns null', () => {
    expect(sanitizePaidAmount(null)).toBeNull()
  })

  it('undefined returns null', () => {
    expect(sanitizePaidAmount(undefined)).toBeNull()
  })

  it('number 0 returns 0', () => {
    expect(sanitizePaidAmount(0)).toBe(0)
  })

  it('number 9999.99 returns 9999.99', () => {
    expect(sanitizePaidAmount(9999.99)).toBeCloseTo(9999.99, 2)
  })

  it('number -1 returns 0', () => {
    expect(sanitizePaidAmount(-1)).toBe(0)
  })

  it('very large number returns that number', () => {
    expect(sanitizePaidAmount(1_000_000)).toBe(1_000_000)
  })

  it('string "  " (whitespace) returns 0', () => {
    expect(sanitizePaidAmount('  ')).toBe(0)
  })

  it('returns number type (not null) for valid positive string', () => {
    const result = sanitizePaidAmount('500')
    expect(typeof result).toBe('number')
  })

  it('NaN coerced value returns 0', () => {
    expect(sanitizePaidAmount(NaN)).toBe(0)
  })
})

// ── computeCollectionRiskScore — extended cases ───────────────────────────────

describe('computeCollectionRiskScore — extended cases', () => {
  it('same day (due=today, days=0) → score based purely on amount', () => {
    const score = computeCollectionRiskScore(
      { due_date: '2025-06-01', total_try: 10_000 },
      '2025-06-01',
    )
    // days=0 → 0*0.6 + (10000/10000)*0.4 = 0.4
    expect(score).toBeCloseTo(0.4, 5)
  })

  it('30 days overdue, 50_000 TRY → expected score', () => {
    const score = computeCollectionRiskScore(
      { due_date: '2025-05-01', total_try: 50_000 },
      '2025-05-31',
    )
    // days=30, amt=50000 → 30*0.6 + (50000/10000)*0.4 = 18 + 2 = 20
    expect(score).toBeCloseTo(20, 1)
  })

  it('90 days overdue, 0 TRY → score = 54', () => {
    const score = computeCollectionRiskScore(
      { due_date: '2025-01-01', total_try: 0 },
      '2025-04-01',
    )
    // days=90 → 90*0.6 = 54
    expect(score).toBeCloseTo(54, 1)
  })

  it('uses sale_date when due_date is absent', () => {
    const score = computeCollectionRiskScore(
      { sale_date: '2025-05-01', total_try: 0 },
      '2025-05-11',
    )
    // days=10 → 10*0.6 = 6
    expect(score).toBeCloseTo(6, 1)
  })

  it('prefers due_date over sale_date', () => {
    const score = computeCollectionRiskScore(
      { due_date: '2025-05-20', sale_date: '2025-05-01', total_try: 0 },
      '2025-05-21',
    )
    // due_date=May20, today=May21 → days=1 → 0.6
    expect(score).toBeCloseTo(0.6, 5)
  })

  it('missing both dates → days=0, score depends on amount', () => {
    const score = computeCollectionRiskScore(
      { total_try: 20_000 },
      '2025-06-01',
    )
    // days=0, amt=20000 → 0 + 2*0.4 = 0.8
    expect(score).toBeCloseTo(0.8, 5)
  })

  it('null total_try treated as 0 → score only from days', () => {
    const score = computeCollectionRiskScore(
      { due_date: '2025-06-01', total_try: null },
      '2025-06-06',
    )
    // days=5 → 5*0.6 + 0 = 3
    expect(score).toBeCloseTo(3, 5)
  })

  it('future due_date → days clamped to 0', () => {
    const score = computeCollectionRiskScore(
      { due_date: '2025-12-31', total_try: 5_000 },
      '2025-06-01',
    )
    // days=0 (future, max(0,...)) → 0 + (5000/10000)*0.4 = 0.2
    expect(score).toBeCloseTo(0.2, 5)
  })

  it('large amount drives score up significantly', () => {
    const score = computeCollectionRiskScore(
      { due_date: '2025-06-01', total_try: 1_000_000 },
      '2025-06-01',
    )
    // days=0 → (1000000/10000)*0.4 = 40
    expect(score).toBeCloseTo(40, 1)
  })

  it('score is always non-negative', () => {
    const score = computeCollectionRiskScore(
      { due_date: '2099-01-01', total_try: 0 },
      '2025-06-01',
    )
    expect(score).toBeGreaterThanOrEqual(0)
  })

  it('score increases with more overdue days', () => {
    const s1 = computeCollectionRiskScore({ due_date: '2025-05-25', total_try: 0 }, '2025-06-01')
    const s2 = computeCollectionRiskScore({ due_date: '2025-05-01', total_try: 0 }, '2025-06-01')
    expect(s2).toBeGreaterThan(s1)
  })

  it('score increases with larger amounts', () => {
    const s1 = computeCollectionRiskScore({ due_date: '2025-05-01', total_try: 10_000 }, '2025-06-01')
    const s2 = computeCollectionRiskScore({ due_date: '2025-05-01', total_try: 100_000 }, '2025-06-01')
    expect(s2).toBeGreaterThan(s1)
  })
})
