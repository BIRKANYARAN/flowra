// ═══════════════════════════════════════════════════════════════════════════════
// Product adapter — backward-compatible catalog accessors
//
// Purpose:
//   During the catalog normalization migration, a product row may have either
//     • new canonical fields  (default_sale_price / default_sale_currency / …)
//     • legacy fields         (catalog_price / cost_currency / …)
//     • or both.
//
//   These helpers centralize the fallback chain so UI/service code never has
//   to know about the transition. Once all writers have been migrated, the
//   legacy branches become dead and can be deleted safely.
//
// Safety rules:
//   1. Never throw. Always return a deterministic value.
//   2. Never return `undefined` — callers get `null` when data is absent.
//   3. Prefer canonical field over legacy field.
//   4. Treat 0 as "absent" for price — we want real prices, not accidental 0s.
//   5. Legacy fields are only honored when they pass an explicit validity check.
//      No blind fallback to "TRY" or other defaults at the adapter level.
// ═══════════════════════════════════════════════════════════════════════════════

import type { Product } from '@/types'

/** Subset of Product we actually read here. Keeps helpers usable with partial selects. */
type ProductLike = Partial<
  Pick<
    Product,
    | 'default_sale_price'
    | 'default_sale_currency'
    | 'default_sale_vat_rate'
    | 'catalog_price'
    | 'cost_currency'
    | 'unit_cost'
    | 'is_active'
  >
>

// ── Constants ───────────────────────────────────────────────────────────────

/**
 * Default VAT rate for Turkish jurisdictions (standard KDV = 20 %).
 * Used only as a last-resort fallback when a product has no configured VAT.
 * If Flowra ever supports multiple jurisdictions, replace with a per-user /
 * per-org config lookup.
 */
export const DEFAULT_VAT_RATE_TR = 20

/** ISO-4217-style currency code pattern — 3 uppercase ASCII letters. */
const CURRENCY_CODE_RE = /^[A-Z]{3}$/

// ── Validators ──────────────────────────────────────────────────────────────

function isValidCurrencyCode(v: unknown): v is string {
  return typeof v === 'string' && CURRENCY_CODE_RE.test(v)
}

function isPositiveFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0
}

// ── Accessors ───────────────────────────────────────────────────────────────

/**
 * Canonical sale price.
 * Priority: default_sale_price → legacy catalog_price → null.
 * Zero is treated as "absent" (not a real price).
 */
export function getSalePrice(p: ProductLike | null | undefined): number | null {
  if (!p) return null
  if (isPositiveFiniteNumber(p.default_sale_price)) return p.default_sale_price
  if (isPositiveFiniteNumber(p.catalog_price))      return p.catalog_price
  return null
}

/**
 * Canonical sale currency.
 * Priority:
 *   1. default_sale_currency (if valid 3-letter code)
 *   2. legacy cost_currency  (ONLY if explicitly valid 3-letter code)
 *   3. null   — caller decides the fallback (e.g. user settings default)
 *
 * Never defaults to "TRY" silently — blind defaults have historically masked
 * data bugs. Callers should use `?? 'TRY'` only when TRY is explicitly
 * appropriate in that context (display of pure-Turkish companies, etc.).
 */
export function getSaleCurrency(p: ProductLike | null | undefined): string | null {
  if (!p) return null
  if (isValidCurrencyCode(p.default_sale_currency)) return p.default_sale_currency
  if (isValidCurrencyCode(p.cost_currency))         return p.cost_currency
  return null
}

/**
 * Canonical sale VAT rate.
 * Priority: default_sale_vat_rate → DEFAULT_VAT_RATE_TR.
 * Always returns a number — UI/tax calculations require one; returning null
 * here would force every caller to duplicate the fallback constant.
 */
export function getSaleVatRate(p: ProductLike | null | undefined): number {
  if (p && typeof p.default_sale_vat_rate === 'number' &&
      Number.isFinite(p.default_sale_vat_rate) && p.default_sale_vat_rate >= 0) {
    return p.default_sale_vat_rate
  }
  return DEFAULT_VAT_RATE_TR
}

/**
 * Is the product listable to end users?
 * `is_active` is a new column; legacy rows may have it set via DB default `true`
 * or occasionally be null in transit → treat any non-false value as active.
 */
export function isProductActive(p: ProductLike | null | undefined): boolean {
  if (!p) return false
  if (p.is_active === false) return false
  return true
}

/**
 * DEPRECATED — product-level unit cost.
 * This exists only to centralize remaining direct reads during migration.
 * The real source of truth for cost is `stock_lots.unit_cost` (FIFO).
 * Returns null when the legacy field is absent or zero.
 *
 * Do NOT use for financial calculations. Use lot-based cost instead.
 */
export function getLegacyProductCost(p: ProductLike | null | undefined): number | null {
  if (!p) return null
  if (isPositiveFiniteNumber(p.unit_cost)) return p.unit_cost
  return null
}
