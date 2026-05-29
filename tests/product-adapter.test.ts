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

// ── getSalePrice — null/undefined and fallback priority ──────────────────────

describe('getSalePrice — null/undefined input and fallbacks', () => {
  it('null product returns null', () => {
    expect(getSalePrice(null)).toBeNull()
  })

  it('undefined product returns null', () => {
    expect(getSalePrice(undefined)).toBeNull()
  })

  it('empty object returns null (no price fields)', () => {
    expect(getSalePrice({})).toBeNull()
  })

  it('default_sale_price=0 falls through to catalog_price', () => {
    expect(getSalePrice({ default_sale_price: 0, catalog_price: 100 })).toBe(100)
  })

  it('default_sale_price=0 with no catalog_price → null', () => {
    expect(getSalePrice({ default_sale_price: 0 })).toBeNull()
  })

  it('catalog_price=0 returns null (0 is absent)', () => {
    expect(getSalePrice({ catalog_price: 0 })).toBeNull()
  })

  it('negative default_sale_price with positive catalog_price returns catalog_price', () => {
    expect(getSalePrice({ default_sale_price: -1, catalog_price: 55 })).toBe(55)
  })

  it('Infinity default_sale_price falls to catalog_price', () => {
    expect(getSalePrice({ default_sale_price: Infinity, catalog_price: 75 })).toBe(75)
  })

  it('NaN default_sale_price falls to catalog_price', () => {
    expect(getSalePrice({ default_sale_price: NaN, catalog_price: 30 })).toBe(30)
  })

  it('both prices present: returns default_sale_price (canonical priority)', () => {
    expect(getSalePrice({ default_sale_price: 99, catalog_price: 150 })).toBe(99)
  })

  it('very small positive default_sale_price is valid', () => {
    expect(getSalePrice({ default_sale_price: 0.001 })).toBe(0.001)
  })
})

// ── getSaleCurrency — default fallback and validity checks ───────────────────

describe('getSaleCurrency — TRY default and validity', () => {
  it('returns null for null input (no TRY default at adapter level)', () => {
    expect(getSaleCurrency(null)).toBeNull()
  })

  it('returns null for undefined input', () => {
    expect(getSaleCurrency(undefined)).toBeNull()
  })

  it('returns TRY when explicitly set as default_sale_currency', () => {
    expect(getSaleCurrency({ default_sale_currency: 'TRY' })).toBe('TRY')
  })

  it('TRY as cost_currency fallback is accepted', () => {
    expect(getSaleCurrency({ cost_currency: 'TRY' })).toBe('TRY')
  })

  it('invalid default_sale_currency falls to valid cost_currency', () => {
    expect(getSaleCurrency({ default_sale_currency: 'XX' as string, cost_currency: 'TRY' })).toBe('TRY')
  })

  it('both fields null → returns null', () => {
    expect(getSaleCurrency({ default_sale_currency: undefined, cost_currency: undefined })).toBeNull()
  })

  it('4-letter code rejected as default, valid cost_currency returned', () => {
    expect(getSaleCurrency({ default_sale_currency: 'EURO' as string, cost_currency: 'EUR' })).toBe('EUR')
  })

  it('USD is a valid 3-letter code', () => {
    expect(getSaleCurrency({ default_sale_currency: 'USD' })).toBe('USD')
  })
})

// ── getSaleVatRate — DEFAULT_VAT_RATE_TR and edge cases ──────────────────────

describe('getSaleVatRate — default fallback and edge values', () => {
  it('DEFAULT_VAT_RATE_TR is exactly 20', () => {
    expect(DEFAULT_VAT_RATE_TR).toBe(20)
  })

  it('DEFAULT_VAT_RATE_TR is a number (not string)', () => {
    expect(typeof DEFAULT_VAT_RATE_TR).toBe('number')
  })

  it('DEFAULT_VAT_RATE_TR is between 0 and 100', () => {
    expect(DEFAULT_VAT_RATE_TR).toBeGreaterThan(0)
    expect(DEFAULT_VAT_RATE_TR).toBeLessThan(100)
  })

  it('explicit 0 rate is returned (zero-rated)', () => {
    expect(getSaleVatRate({ default_sale_vat_rate: 0 })).toBe(0)
  })

  it('explicit 10 rate is returned', () => {
    expect(getSaleVatRate({ default_sale_vat_rate: 10 })).toBe(10)
  })

  it('explicit 20 rate is returned (same as default)', () => {
    expect(getSaleVatRate({ default_sale_vat_rate: 20 })).toBe(20)
  })

  it('null product → DEFAULT_VAT_RATE_TR', () => {
    expect(getSaleVatRate(null)).toBe(DEFAULT_VAT_RATE_TR)
  })

  it('undefined product → DEFAULT_VAT_RATE_TR', () => {
    expect(getSaleVatRate(undefined)).toBe(DEFAULT_VAT_RATE_TR)
  })

  it('missing vat rate field → DEFAULT_VAT_RATE_TR', () => {
    expect(getSaleVatRate({})).toBe(DEFAULT_VAT_RATE_TR)
  })

  it('negative vat rate → DEFAULT_VAT_RATE_TR (fails >= 0 check)', () => {
    expect(getSaleVatRate({ default_sale_vat_rate: -1 })).toBe(DEFAULT_VAT_RATE_TR)
  })

  it('NaN vat rate → DEFAULT_VAT_RATE_TR', () => {
    expect(getSaleVatRate({ default_sale_vat_rate: NaN })).toBe(DEFAULT_VAT_RATE_TR)
  })

  it('Infinity vat rate → DEFAULT_VAT_RATE_TR (fails isFinite)', () => {
    expect(getSaleVatRate({ default_sale_vat_rate: Infinity })).toBe(DEFAULT_VAT_RATE_TR)
  })
})

// ── isProductActive — various is_active values ────────────────────────────────

describe('isProductActive — is_active value matrix', () => {
  it('is_active=true → active', () => {
    expect(isProductActive({ is_active: true })).toBe(true)
  })

  it('is_active=false → inactive', () => {
    expect(isProductActive({ is_active: false })).toBe(false)
  })

  it('is_active=null → active (null is not false, treated as legacy active)', () => {
    expect(isProductActive({ is_active: null as unknown as boolean })).toBe(true)
  })

  it('is_active=undefined → active (missing field = legacy = active)', () => {
    expect(isProductActive({ is_active: undefined })).toBe(true)
  })

  it('null product → false (no product = not active)', () => {
    expect(isProductActive(null)).toBe(false)
  })

  it('undefined product → false', () => {
    expect(isProductActive(undefined)).toBe(false)
  })

  it('empty object → active (legacy row with no is_active)', () => {
    expect(isProductActive({})).toBe(true)
  })

  it('is_active=false even with all other positive fields → inactive', () => {
    expect(isProductActive({
      is_active: false,
      default_sale_price: 500,
      default_sale_currency: 'TRY',
      unit_cost: 100,
    })).toBe(false)
  })
})

// ── getLegacyProductCost — fallback priority ─────────────────────────────────

describe('getLegacyProductCost — priority and edge values', () => {
  it('null product → null', () => {
    expect(getLegacyProductCost(null)).toBeNull()
  })

  it('undefined product → null', () => {
    expect(getLegacyProductCost(undefined)).toBeNull()
  })

  it('empty object → null (no unit_cost)', () => {
    expect(getLegacyProductCost({})).toBeNull()
  })

  it('unit_cost=0 → null (treated as absent)', () => {
    expect(getLegacyProductCost({ unit_cost: 0 })).toBeNull()
  })

  it('unit_cost=negative → null (not a valid cost)', () => {
    expect(getLegacyProductCost({ unit_cost: -100 })).toBeNull()
  })

  it('unit_cost=positive number → returned as-is', () => {
    expect(getLegacyProductCost({ unit_cost: 42 })).toBe(42)
  })

  it('unit_cost=0.001 (tiny positive) → returned', () => {
    expect(getLegacyProductCost({ unit_cost: 0.001 })).toBe(0.001)
  })

  it('unit_cost=Infinity → null (not finite)', () => {
    expect(getLegacyProductCost({ unit_cost: Infinity })).toBeNull()
  })

  it('unit_cost=NaN → null (not a number)', () => {
    expect(getLegacyProductCost({ unit_cost: NaN })).toBeNull()
  })

  it('unit_cost=1_000_000 (large value) → returned', () => {
    expect(getLegacyProductCost({ unit_cost: 1_000_000 })).toBe(1_000_000)
  })
})
