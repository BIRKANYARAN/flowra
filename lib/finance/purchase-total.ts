// Purchase totals are NOT stored on the `purchases` table — there is no
// total / total_try / total_cost_try / total_amount column. The amount is
// computed from the line items: fx_rate × Σ(quantity × unit_price).
//
// purchase_items columns: quantity, unit_price (no line_total). The unit_price
// is in the purchase's currency, so multiply the line sum by the purchase
// fx_rate to get TRY (fx_rate = 1 for TRY purchases).

export interface PurchaseItemRow {
  quantity?:   number | null
  unit_price?: number | null
}

export interface PurchaseWithItems {
  fx_rate?:        number | null
  purchase_items?: PurchaseItemRow[] | null
}

/** Sum of line items in the purchase's own currency (Σ quantity × unit_price). */
export function purchaseLineSum(items: PurchaseItemRow[] | null | undefined): number {
  return (items ?? []).reduce(
    (acc, it) => acc + Number(it.quantity ?? 0) * Number(it.unit_price ?? 0),
    0,
  )
}

/** TRY total for a purchase row that embeds its purchase_items: fx_rate × Σ(qty × price). */
export function purchaseTotalTry(row: PurchaseWithItems): number {
  const fx = Number(row.fx_rate ?? 1) || 1
  return fx * purchaseLineSum(row.purchase_items)
}
