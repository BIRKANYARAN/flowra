/**
 * FAZ 16 — Yeni Ortak Formu: business-logic unit tests
 *
 * Tests the pure validation and parsing functions in partners/new/NewPartnerClient.tsx:
 *   1. validatePartnerForm()  — returns error string or null
 *   2. parseShareRatio()      — converts "50" → 0.5 (stored as 0–1 decimal)
 *   3. parseCapital()         — parses optional capital input, returns 0 for invalid/empty
 *
 * All functions are pure (no DB, no side effects).
 * Run with: npx vitest run tests/partner-validation.test.ts
 */

import { describe, it, expect } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// Mirror of pure functions from partners/new/NewPartnerClient.tsx
// ─────────────────────────────────────────────────────────────────────────────

function validatePartnerForm(
  name:           string,
  shareRatioPct:  string,
  initialCapital: string,
): string | null {
  if (!name.trim()) return 'İsim zorunludur.'

  const ratePct = parseFloat(shareRatioPct)
  if (!Number.isFinite(ratePct) || ratePct <= 0 || ratePct > 100) {
    return 'Pay oranı 1 ile 100 arasında olmalıdır (örn: 50 → %50).'
  }

  const capital = parseFloat(initialCapital) || 0
  if (capital < 0) return 'Başlangıç sermayesi negatif olamaz.'

  return null
}

function parseShareRatio(pct: string): number {
  return parseFloat(pct) / 100
}

function parseCapital(input: string): number {
  const n = parseFloat(input)
  return Number.isFinite(n) && n > 0 ? n : 0
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. validatePartnerForm
// ─────────────────────────────────────────────────────────────────────────────

describe('validatePartnerForm()', () => {
  it('returns null for valid inputs', () => {
    expect(validatePartnerForm('Ahmet', '50', '10000')).toBeNull()
  })

  it('returns null when initial capital is omitted (empty string)', () => {
    expect(validatePartnerForm('Mehmet', '33.33', '')).toBeNull()
  })

  it('returns error when name is empty', () => {
    expect(validatePartnerForm('', '50', '')).toBe('İsim zorunludur.')
  })

  it('returns error when name is whitespace only', () => {
    expect(validatePartnerForm('   ', '50', '')).toBe('İsim zorunludur.')
  })

  it('returns error when share ratio is 0', () => {
    const err = validatePartnerForm('Ali', '0', '')
    expect(err).toContain('Pay oranı')
  })

  it('returns error when share ratio exceeds 100', () => {
    const err = validatePartnerForm('Ali', '101', '')
    expect(err).toContain('Pay oranı')
  })

  it('returns error when share ratio is negative', () => {
    const err = validatePartnerForm('Ali', '-5', '')
    expect(err).toContain('Pay oranı')
  })

  it('returns error when share ratio is non-numeric', () => {
    const err = validatePartnerForm('Ali', 'abc', '')
    expect(err).toContain('Pay oranı')
  })

  it('accepts share ratio of exactly 100', () => {
    expect(validatePartnerForm('Ali', '100', '')).toBeNull()
  })

  it('accepts fractional share ratio', () => {
    expect(validatePartnerForm('Ali', '33.33', '')).toBeNull()
  })

  it('returns error when initial capital is negative', () => {
    const err = validatePartnerForm('Ali', '50', '-1000')
    expect(err).toBe('Başlangıç sermayesi negatif olamaz.')
  })

  it('returns null when initial capital is zero (treated as omitted)', () => {
    // parseFloat('0') = 0, capital = 0, 0 < 0 is false → no error
    expect(validatePartnerForm('Ali', '50', '0')).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. parseShareRatio
// ─────────────────────────────────────────────────────────────────────────────

describe('parseShareRatio()', () => {
  it('converts 50 to 0.5', () => {
    expect(parseShareRatio('50')).toBe(0.5)
  })

  it('converts 100 to 1', () => {
    expect(parseShareRatio('100')).toBe(1)
  })

  it('converts 33.33 to ~0.3333', () => {
    expect(parseShareRatio('33.33')).toBeCloseTo(0.3333, 4)
  })

  it('converts 25 to 0.25', () => {
    expect(parseShareRatio('25')).toBe(0.25)
  })

  it('converts 0.01 to 0.0001', () => {
    expect(parseShareRatio('0.01')).toBeCloseTo(0.0001, 6)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. parseCapital
// ─────────────────────────────────────────────────────────────────────────────

describe('parseCapital()', () => {
  it('returns 0 for empty string', () => {
    expect(parseCapital('')).toBe(0)
  })

  it('returns 0 for non-numeric input', () => {
    expect(parseCapital('abc')).toBe(0)
  })

  it('returns 0 for zero', () => {
    expect(parseCapital('0')).toBe(0)
  })

  it('returns 0 for negative input', () => {
    // Negative values fail the n > 0 guard — caller should validate separately
    expect(parseCapital('-500')).toBe(0)
  })

  it('parses a positive integer', () => {
    expect(parseCapital('10000')).toBe(10000)
  })

  it('parses a positive decimal', () => {
    expect(parseCapital('5500.50')).toBeCloseTo(5500.5, 2)
  })

  it('returns the numeric value for small positive input', () => {
    expect(parseCapital('0.01')).toBeCloseTo(0.01, 4)
  })
})
