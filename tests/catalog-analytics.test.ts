/**
 * FAZ 20 — Katalog: business-logic unit tests
 *
 * Tests the pure analytics functions in catalog/CatalogClient.tsx:
 *   1. marginColor()        — CSS class based on margin threshold
 *   2. marginBg()           — background CSS class based on margin threshold
 *   3. currencySym()        — currency symbol (₺ / $ / €)
 *   4. computeMargin()      — (price - cost) / price × 100
 *   5. toDisplayCurrency()  — convert TRY amount to display currency via FX rate
 *
 * All functions are pure (no DB, no side effects).
 * Run with: npx vitest run tests/catalog-analytics.test.ts
 */

import { describe, it, expect } from 'vitest'
import {
  marginColor,
  marginBg,
  currencySym,
  computeMargin,
  toDisplayCurrency,
} from '../app/dashboard/catalog/CatalogClient'

// ─────────────────────────────────────────────────────────────────────────────
// 1. marginColor
// ─────────────────────────────────────────────────────────────────────────────

describe('marginColor()', () => {
  it('returns red for margin < 10', () => {
    expect(marginColor(5)).toBe('text-red-600')
    expect(marginColor(0)).toBe('text-red-600')
    expect(marginColor(-10)).toBe('text-red-600')
  })

  it('returns amber for margin 10–24', () => {
    expect(marginColor(10)).toBe('text-amber-600')
    expect(marginColor(20)).toBe('text-amber-600')
    expect(marginColor(24.9)).toBe('text-amber-600')
  })

  it('returns green for margin 25–49', () => {
    expect(marginColor(25)).toBe('text-green-600')
    expect(marginColor(40)).toBe('text-green-600')
    expect(marginColor(49.9)).toBe('text-green-600')
  })

  it('returns emerald for margin >= 50', () => {
    expect(marginColor(50)).toBe('text-emerald-700')
    expect(marginColor(75)).toBe('text-emerald-700')
    expect(marginColor(100)).toBe('text-emerald-700')
  })

  it('boundary: exactly 10 is amber (not red)', () => {
    expect(marginColor(10)).toBe('text-amber-600')
  })

  it('boundary: exactly 25 is green (not amber)', () => {
    expect(marginColor(25)).toBe('text-green-600')
  })

  it('boundary: exactly 50 is emerald (not green)', () => {
    expect(marginColor(50)).toBe('text-emerald-700')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. marginBg
// ─────────────────────────────────────────────────────────────────────────────

describe('marginBg()', () => {
  it('returns red background for margin < 10', () => {
    expect(marginBg(0)).toBe('bg-red-50')
    expect(marginBg(-5)).toBe('bg-red-50')
    expect(marginBg(9.9)).toBe('bg-red-50')
  })

  it('returns amber background for margin 10–24', () => {
    expect(marginBg(10)).toBe('bg-amber-50')
    expect(marginBg(15)).toBe('bg-amber-50')
  })

  it('returns green background for margin 25–49', () => {
    expect(marginBg(25)).toBe('bg-green-50')
    expect(marginBg(45)).toBe('bg-green-50')
  })

  it('returns emerald background for margin >= 50', () => {
    expect(marginBg(50)).toBe('bg-emerald-50')
    expect(marginBg(80)).toBe('bg-emerald-50')
  })

  it('matches marginColor thresholds (both use same breakpoints)', () => {
    const margins = [-5, 5, 10, 24, 25, 49, 50, 80]
    const colorRed    = margins.filter(m => marginColor(m) === 'text-red-600')
    const bgRed       = margins.filter(m => marginBg(m) === 'bg-red-50')
    expect(colorRed).toEqual(bgRed)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. currencySym
// ─────────────────────────────────────────────────────────────────────────────

describe('currencySym()', () => {
  it('returns ₺ for TRY', () => {
    expect(currencySym('TRY')).toBe('₺')
  })

  it('returns $ for USD', () => {
    expect(currencySym('USD')).toBe('$')
  })

  it('returns € for EUR', () => {
    expect(currencySym('EUR')).toBe('€')
  })

  it('returns ₺ for unknown currencies (default)', () => {
    expect(currencySym('GBP')).toBe('₺')
    expect(currencySym('')).toBe('₺')
    expect(currencySym('JPY')).toBe('₺')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. computeMargin
// ─────────────────────────────────────────────────────────────────────────────

describe('computeMargin()', () => {
  it('computes 50% margin', () => {
    expect(computeMargin(100, 50)).toBeCloseTo(50, 5)
  })

  it('computes 0% margin when price equals cost', () => {
    expect(computeMargin(100, 100)).toBeCloseTo(0, 5)
  })

  it('computes negative margin when cost exceeds price', () => {
    expect(computeMargin(100, 150)).toBeCloseTo(-50, 5)
  })

  it('computes 100% margin when cost is 0', () => {
    expect(computeMargin(100, 0)).toBeCloseTo(100, 5)
  })

  it('returns 0 when catalogPrice is 0', () => {
    expect(computeMargin(0, 50)).toBe(0)
  })

  it('returns 0 when both are 0', () => {
    expect(computeMargin(0, 0)).toBe(0)
  })

  it('computes 25% margin', () => {
    // price=200, cost=150 → margin = (200-150)/200 = 25%
    expect(computeMargin(200, 150)).toBeCloseTo(25, 5)
  })

  it('handles large numbers', () => {
    expect(computeMargin(1_000_000, 600_000)).toBeCloseTo(40, 5)
  })

  it('handles fractional amounts', () => {
    // price=33.33, cost=22.22 → (33.33-22.22)/33.33 ≈ 33.33%
    expect(computeMargin(33.33, 22.22)).toBeCloseTo(33.33, 1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. toDisplayCurrency
// ─────────────────────────────────────────────────────────────────────────────

const FX = { USD: 32.50, EUR: 35.00 }

describe('toDisplayCurrency()', () => {
  it('returns the same amount for TRY (no conversion)', () => {
    expect(toDisplayCurrency(1000, 'TRY', FX)).toBe(1000)
  })

  it('converts TRY to USD correctly', () => {
    // 1000 TRY / 32.50 TRY per USD ≈ 30.769 USD
    expect(toDisplayCurrency(1000, 'USD', FX)).toBeCloseTo(1000 / 32.50, 3)
  })

  it('converts TRY to EUR correctly', () => {
    expect(toDisplayCurrency(3500, 'EUR', FX)).toBeCloseTo(3500 / 35.00, 5)
  })

  it('returns 0 for USD when FX rate is 0', () => {
    expect(toDisplayCurrency(1000, 'USD', { USD: 0, EUR: 35 })).toBe(0)
  })

  it('returns 0 for EUR when FX rate is 0', () => {
    expect(toDisplayCurrency(1000, 'EUR', { USD: 32.5, EUR: 0 })).toBe(0)
  })

  it('returns 0 when amount is 0 (TRY)', () => {
    expect(toDisplayCurrency(0, 'TRY', FX)).toBe(0)
  })

  it('returns 0 when amount is 0 (USD)', () => {
    expect(toDisplayCurrency(0, 'USD', FX)).toBeCloseTo(0, 5)
  })

  it('handles unknown currency gracefully (falls back to EUR branch giving 0 if EUR=0)', () => {
    // Unknown currency → falls to EUR branch: fxRates.EUR
    const result = toDisplayCurrency(1000, 'GBP', { USD: 32.5, EUR: 40 })
    expect(result).toBeCloseTo(1000 / 40, 5) // uses EUR rate as fallback
  })
})
