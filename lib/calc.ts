// ═══════════════════════════════════════════════════════════════════════════════
// Flowra — Central Calculation Engine (Single Source of Truth)
//
// ALL financial calculations MUST go through these functions.
// No inline math in components, PDF engine, or server pages.
//
// ROUNDING RULES:
//   1. Round ONCE at the final stage of each value — never round twice.
//   2. grand_total = sum(line_total), NOT subtotal + kdv_total.
//   3. subtotal = sum(line_subtotal), kdv_total = sum(line_vat).
//   4. No derived totals — always sum from per-line results.
//
// SAFETY:
//   - discount_percent clamped to [0, 100]
//   - null / undefined / NaN → 0
//   - negative totals are allowed (credit notes, refunds)
// ═══════════════════════════════════════════════════════════════════════════════

/** Round to 2 decimal places. */
export function round2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100
}

/** Coerce to finite number, default 0. */
export function n(v: unknown): number {
  if (v === null || v === undefined) return 0
  const r = Number(v)
  return Number.isFinite(r) ? r : 0
}

/** Clamp discount to [0, 100]. */
function clampDiscount(d: number): number {
  if (!Number.isFinite(d)) return 0
  return Math.min(100, Math.max(0, d))
}

// ── Per-line calculation ────────────────────────────────────────────────────

export interface LineInput {
  price:            unknown
  quantity:         unknown
  discount_percent: unknown
  kdv:              unknown
}

export interface LineResult {
  price:                 number
  quantity:              number
  discount_percent:      number
  kdv:                   number
  discounted_unit_price: number
  line_subtotal:         number
  line_vat:              number
  line_total:            number
}

/**
 * Calculate a single line item.
 *
 * Rounding order (each value rounded exactly once):
 *   discounted_unit_price = round2(price × (1 - discount/100))
 *   line_subtotal         = round2(price × (1 - discount/100) × quantity)  ← from raw, not from rounded unit price
 *   line_vat              = round2(line_subtotal × kdv/100)
 *   line_total            = round2(line_subtotal + line_vat)
 */
export function calculateLine(item: LineInput): LineResult {
  const price    = n(item.price)
  const quantity = n(item.quantity) || 1
  const discount = clampDiscount(n(item.discount_percent))
  const kdv      = n(item.kdv)

  // Display value — rounded independently for UI/PDF column
  const discounted_unit_price = round2(price * (1 - discount / 100))
  // Subtotal computed from RAW values, rounded once
  const line_subtotal         = round2(price * (1 - discount / 100) * quantity)
  const line_vat              = round2(line_subtotal * (kdv / 100))
  const line_total            = round2(line_subtotal + line_vat)

  return {
    price,
    quantity,
    discount_percent: discount,
    kdv,
    discounted_unit_price,
    line_subtotal,
    line_vat,
    line_total,
  }
}

// ── Aggregate totals ────────────────────────────────────────────────────────

export interface TotalsResult {
  subtotal:       number
  total_discount: number
  kdv_total:      number
  grand_total:    number
  kdv_breakdown:  Record<string, number>
  lines:          LineResult[]
}

/**
 * Calculate totals from an array of line items.
 *
 * CRITICAL INVARIANT:
 *   grand_total === sum(line_total)     — always
 *   subtotal    === sum(line_subtotal)  — always
 *   kdv_total   === sum(line_vat)       — always
 *
 * grand_total is NEVER derived from subtotal + kdv_total.
 */
export function calculateTotals(items: LineInput[]): TotalsResult {
  const lineResults: LineResult[] = []
  let subtotal      = 0
  let totalDiscount = 0
  let kdvTotal      = 0
  let grandTotal    = 0
  const kdvMap: Record<string, number> = {}

  for (const item of items) {
    const line = calculateLine(item)
    lineResults.push(line)

    const grossLine = round2(line.price * line.quantity)

    subtotal      += line.line_subtotal
    totalDiscount += round2(grossLine - line.line_subtotal)
    kdvTotal      += line.line_vat
    grandTotal    += line.line_total  // sum of per-line totals, NOT subtotal + kdv

    const key = String(line.kdv)
    kdvMap[key] = round2((kdvMap[key] || 0) + line.line_vat)
  }

  const result: TotalsResult = {
    subtotal:       round2(subtotal),
    total_discount: round2(totalDiscount),
    kdv_total:      round2(kdvTotal),
    grand_total:    round2(grandTotal),
    kdv_breakdown:  kdvMap,
    lines:          lineResults,
  }

  // ── DEV ASSERTION: verify invariant ───────────────────────────────────────
  if (process.env.NODE_ENV !== 'production') {
    const sumLineTotals = round2(lineResults.reduce((s, l) => s + l.line_total, 0))
    const sumLineSubs   = round2(lineResults.reduce((s, l) => s + l.line_subtotal, 0))
    const sumLineVats   = round2(lineResults.reduce((s, l) => s + l.line_vat, 0))

    if (result.grand_total !== sumLineTotals) {
      console.error(`[CALC MISMATCH] grand_total=${result.grand_total} !== sum(line_total)=${sumLineTotals}`)
    }
    if (result.subtotal !== sumLineSubs) {
      console.error(`[CALC MISMATCH] subtotal=${result.subtotal} !== sum(line_subtotal)=${sumLineSubs}`)
    }
    if (result.kdv_total !== sumLineVats) {
      console.error(`[CALC MISMATCH] kdv_total=${result.kdv_total} !== sum(line_vat)=${sumLineVats}`)
    }
  }

  return result
}
