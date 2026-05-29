/**
 * Tests for lib/product-adapter.ts — backward-compatible catalog accessors
 *
 * Pure functions — no DB, no I/O.
 * Run with: npx vitest run tests/product-adapter.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  getSalePrice,
  getSaleCurrency,
  getSaleVatRate,
  isProductActive,
  getLegacyProductCost,
  DEFAULT_VAT_RATE_TR,
} from '../lib/product-adapter'

// ── getSalePrice ──────────────────────────────────────────────────────────

describe('getSalePrice', () => {
  it('returns default_sale_price when present and positive', () => {
    expect(getSalePrice({ default_sale_price: 250 })).toBe(250)
  })

  it('returns catalog_price as fallback when default_sale_price is absent', () => {
    expect(getSalePrice({ catalog_price: 199 })).toBe(199)
  })

  it('prefers default_sale_price over catalog_price', () => {
    expect(getSalePrice({ default_sale_price: 300, catalog_price: 100 })).toBe(300)
  })

  it('returns null when both fields absent', () => {
    expect(getSalePrice({})).toBeNull()
  })

  it('returns null for null input', () => {
    expect(getSalePrice(null)).toBeNull()
  })

  it('returns null for undefined input', () => {
    expect(getSalePrice(undefined)).toBeNull()
  })

  it('treats 0 as absent for default_sale_price (falls through to catalog_price)', () => {
    expect(getSalePrice({ default_sale_price: 0, catalog_price: 150 })).toBe(150)
  })

  it('treats 0 as absent for catalog_price too', () => {
    expect(getSalePrice({ catalog_price: 0 })).toBeNull()
  })

  it('treats negative value as absent (not a valid price)', () => {
    expect(getSalePrice({ default_sale_price: -10 })).toBeNull()
  })

  it('returns large price correctly', () => {
    expect(getSalePrice({ default_sale_price: 1_500_000 })).toBe(1_500_000)
  })

  it('returns decimal price without rounding', () => {
    expect(getSalePrice({ default_sale_price: 99.99 })).toBe(99.99)
  })

  it('negative catalog_price also treated as absent', () => {
    expect(getSalePrice({ catalog_price: -1 })).toBeNull()
  })

  it('both fields zero returns null', () => {
    expect(getSalePrice({ default_sale_price: 0, catalog_price: 0 })).toBeNull()
  })

  it('positive default_sale_price wins even when catalog_price is also positive', () => {
    expect(getSalePrice({ default_sale_price: 1, catalog_price: 9999 })).toBe(1)
  })

  it('returns small fractional price (e.g. 0.01)', () => {
    expect(getSalePrice({ default_sale_price: 0.01 })).toBe(0.01)
  })

  it('Infinity default_sale_price is not a valid price', () => {
    // isPositiveFiniteNumber requires Number.isFinite
    expect(getSalePrice({ default_sale_price: Infinity })).toBeNull()
  })

  it('NaN default_sale_price falls through to catalog_price', () => {
    expect(getSalePrice({ default_sale_price: NaN, catalog_price: 55 })).toBe(55)
  })

  it('catalog_price NaN also returns null', () => {
    expect(getSalePrice({ catalog_price: NaN })).toBeNull()
  })
})

// ── getSaleCurrency ───────────────────────────────────────────────────────

describe('getSaleCurrency', () => {
  it('returns default_sale_currency when valid 3-letter code', () => {
    expect(getSaleCurrency({ default_sale_currency: 'USD' })).toBe('USD')
  })

  it('returns cost_currency as fallback', () => {
    expect(getSaleCurrency({ cost_currency: 'EUR' })).toBe('EUR')
  })

  it('prefers default_sale_currency over cost_currency', () => {
    expect(getSaleCurrency({ default_sale_currency: 'GBP', cost_currency: 'USD' })).toBe('GBP')
  })

  it('returns null when both absent', () => {
    expect(getSaleCurrency({})).toBeNull()
  })

  it('returns null for null input', () => {
    expect(getSaleCurrency(null)).toBeNull()
  })

  it('returns TRY as a valid currency code', () => {
    expect(getSaleCurrency({ default_sale_currency: 'TRY' })).toBe('TRY')
  })

  it('rejects non-3-letter codes (e.g. "US")', () => {
    expect(getSaleCurrency({ default_sale_currency: 'US' })).toBeNull()
  })

  it('rejects 4-letter invalid code', () => {
    expect(getSaleCurrency({ default_sale_currency: 'USDD' })).toBeNull()
  })

  it('rejects numeric-looking strings', () => {
    expect(getSaleCurrency({ default_sale_currency: '123' as string })).toBeNull()
  })

  it('rejects lowercase code (must be uppercase 3 letters)', () => {
    // The regex is /^[A-Z]{3}$/ — lowercase should fail
    expect(getSaleCurrency({ default_sale_currency: 'usd' as string })).toBeNull()
  })

  it('returns JPY as a valid currency code', () => {
    expect(getSaleCurrency({ default_sale_currency: 'JPY' })).toBe('JPY')
  })

  it('invalid default falls through to valid cost_currency', () => {
    expect(getSaleCurrency({ default_sale_currency: 'bad' as string, cost_currency: 'EUR' })).toBe('EUR')
  })

  it('both invalid returns null', () => {
    expect(getSaleCurrency({ default_sale_currency: '!!' as string, cost_currency: '??' as string })).toBeNull()
  })

  it('empty string is not a valid currency code', () => {
    expect(getSaleCurrency({ default_sale_currency: '' as string })).toBeNull()
  })

  it('undefined input returns null', () => {
    expect(getSaleCurrency(undefined)).toBeNull()
  })

  it('CHF is accepted as valid currency code', () => {
    expect(getSaleCurrency({ cost_currency: 'CHF' })).toBe('CHF')
  })
})

// ── getSaleVatRate ────────────────────────────────────────────────────────

describe('getSaleVatRate', () => {
  it('returns configured rate when present', () => {
    expect(getSaleVatRate({ default_sale_vat_rate: 10 })).toBe(10)
  })

  it('returns 0 rate when explicitly set to 0 (zero-rated goods)', () => {
    expect(getSaleVatRate({ default_sale_vat_rate: 0 })).toBe(0)
  })

  it('returns DEFAULT_VAT_RATE_TR (20) when field absent', () => {
    expect(getSaleVatRate({})).toBe(DEFAULT_VAT_RATE_TR)
    expect(getSaleVatRate({})).toBe(20)
  })

  it('returns DEFAULT_VAT_RATE_TR for null input', () => {
    expect(getSaleVatRate(null)).toBe(DEFAULT_VAT_RATE_TR)
  })

  it('returns DEFAULT_VAT_RATE_TR for undefined input', () => {
    expect(getSaleVatRate(undefined)).toBe(DEFAULT_VAT_RATE_TR)
  })

  it('returns DEFAULT_VAT_RATE_TR when rate is NaN', () => {
    expect(getSaleVatRate({ default_sale_vat_rate: NaN })).toBe(DEFAULT_VAT_RATE_TR)
  })

  it('returns DEFAULT_VAT_RATE_TR when rate is Infinity', () => {
    expect(getSaleVatRate({ default_sale_vat_rate: Infinity })).toBe(DEFAULT_VAT_RATE_TR)
  })

  it('returns reduced rate 1 correctly (e.g. basic food)', () => {
    expect(getSaleVatRate({ default_sale_vat_rate: 1 })).toBe(1)
  })

  it('DEFAULT_VAT_RATE_TR constant is 20', () => {
    expect(DEFAULT_VAT_RATE_TR).toBe(20)
  })

  it('returns 8 for the reduced standard rate', () => {
    expect(getSaleVatRate({ default_sale_vat_rate: 8 })).toBe(8)
  })

  it('returns negative value as fallback (negative rate fails isFinite+>=0 check)', () => {
    expect(getSaleVatRate({ default_sale_vat_rate: -5 })).toBe(DEFAULT_VAT_RATE_TR)
  })

  it('returns DEFAULT_VAT_RATE_TR when rate is -Infinity', () => {
    expect(getSaleVatRate({ default_sale_vat_rate: -Infinity })).toBe(DEFAULT_VAT_RATE_TR)
  })

  it('fractional VAT rate is returned as-is', () => {
    expect(getSaleVatRate({ default_sale_vat_rate: 18.5 })).toBe(18.5)
  })

  it('DEFAULT_VAT_RATE_TR is a number constant', () => {
    expect(typeof DEFAULT_VAT_RATE_TR).toBe('number')
  })
})

// ── isProductActive ───────────────────────────────────────────────────────

describe('isProductActive', () => {
  it('returns true when is_active is true', () => {
    expect(isProductActive({ is_active: true })).toBe(true)
  })

  it('returns false when is_active is false', () => {
    expect(isProductActive({ is_active: false })).toBe(false)
  })

  it('returns true when is_active is undefined (legacy row — treat as active)', () => {
    expect(isProductActive({})).toBe(true)
  })

  it('returns false for null input', () => {
    expect(isProductActive(null)).toBe(false)
  })

  it('returns false for undefined input', () => {
    expect(isProductActive(undefined)).toBe(false)
  })

  it('returns true when all fields present and is_active is true', () => {
    expect(isProductActive({
      is_active: true,
      default_sale_price: 100,
      default_sale_currency: 'TRY',
    })).toBe(true)
  })

  it('returns false when is_active is false even with valid price', () => {
    expect(isProductActive({
      is_active: false,
      default_sale_price: 500,
    })).toBe(false)
  })

  it('returns true for a minimal object with no is_active key (legacy)', () => {
    const legacy = { default_sale_price: 100 }
    expect(isProductActive(legacy)).toBe(true)
  })

  it('treats null is_active as truthy (not explicitly false)', () => {
    // is_active: null is not === false → active
    expect(isProductActive({ is_active: null as unknown as boolean })).toBe(true)
  })
})

// ── getLegacyProductCost ──────────────────────────────────────────────────

describe('getLegacyProductCost', () => {
  it('returns unit_cost when present and positive', () => {
    expect(getLegacyProductCost({ unit_cost: 50 })).toBe(50)
  })

  it('returns null when unit_cost is 0 (treated as absent)', () => {
    expect(getLegacyProductCost({ unit_cost: 0 })).toBeNull()
  })

  it('returns null when unit_cost absent', () => {
    expect(getLegacyProductCost({})).toBeNull()
  })

  it('returns null for null input', () => {
    expect(getLegacyProductCost(null)).toBeNull()
  })

  it('returns null for negative cost', () => {
    expect(getLegacyProductCost({ unit_cost: -5 })).toBeNull()
  })

  it('returns fractional cost correctly', () => {
    expect(getLegacyProductCost({ unit_cost: 12.50 })).toBe(12.50)
  })

  it('returns null for Infinity', () => {
    expect(getLegacyProductCost({ unit_cost: Infinity })).toBeNull()
  })

  it('returns null for NaN', () => {
    expect(getLegacyProductCost({ unit_cost: NaN })).toBeNull()
  })

  it('returns large positive cost', () => {
    expect(getLegacyProductCost({ unit_cost: 999_999 })).toBe(999_999)
  })

  it('returns smallest positive fractional cost', () => {
    expect(getLegacyProductCost({ unit_cost: 0.01 })).toBe(0.01)
  })
})

// ── Combined fallback chain — real migration scenario ─────────────────────

describe('product-adapter — migration scenario', () => {
  it('fully migrated row: uses new canonical fields', () => {
    const row = {
      default_sale_price:    500,
      default_sale_currency: 'USD',
      default_sale_vat_rate: 10,
      is_active:             true,
      catalog_price:         400,    // legacy ignored
      cost_currency:         'EUR',  // legacy ignored
    }
    expect(getSalePrice(row)).toBe(500)
    expect(getSaleCurrency(row)).toBe('USD')
    expect(getSaleVatRate(row)).toBe(10)
  })

  it('legacy-only row: uses fallback fields', () => {
    const row = {
      catalog_price:  350,
      cost_currency:  'EUR',
      unit_cost:       80,
      is_active:       true,
    }
    expect(getSalePrice(row)).toBe(350)
    expect(getSaleCurrency(row)).toBe('EUR')
    expect(getSaleVatRate(row)).toBe(DEFAULT_VAT_RATE_TR)  // no VAT field → default
  })

  it('archived product: is_active=false → inactive regardless of prices', () => {
    const row = {
      is_active:          false,
      default_sale_price: 999,
    }
    expect(isProductActive(row)).toBe(false)
  })

  it('all fields missing: getSalePrice and getSaleCurrency return null, getSaleVatRate returns default', () => {
    const row = {}
    expect(getSalePrice(row)).toBeNull()
    expect(getSaleCurrency(row)).toBeNull()
    expect(getSaleVatRate(row)).toBe(DEFAULT_VAT_RATE_TR)
    expect(isProductActive(row)).toBe(true)  // legacy = active
    expect(getLegacyProductCost(row)).toBeNull()
  })

  it('canonical price overrides legacy even when legacy is larger', () => {
    const row = { default_sale_price: 1, catalog_price: 9999 }
    expect(getSalePrice(row)).toBe(1)
  })

  it('inactive product with zero cost: all fields return appropriate defaults/nulls', () => {
    const row = { is_active: false, unit_cost: 0, catalog_price: 0 }
    expect(isProductActive(row)).toBe(false)
    expect(getLegacyProductCost(row)).toBeNull()
    expect(getSalePrice(row)).toBeNull()
  })

  it('partially migrated row: canonical price but legacy currency', () => {
    const row = {
      default_sale_price:    250,
      cost_currency:         'TRY',  // legacy currency (no canonical yet)
    }
    expect(getSalePrice(row)).toBe(250)
    expect(getSaleCurrency(row)).toBe('TRY')
  })
})
