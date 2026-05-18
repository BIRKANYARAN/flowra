// ─────────────────────────────────────────────────────────────────────────────
// lib/db/mappers.ts
//
// CONTRACT INTEGRITY — Canonical row-to-DTO mapping functions.
//
// Every Supabase row that enters the application should be mapped through
// these functions before use. This creates a single place where DB column
// name aliases are resolved, types are enforced, and defaults are applied.
//
// Design:
//   - All mappers are pure functions (no side effects, no DB calls)
//   - All mappers use safeNum/safeStr for coercion — never throw on bad data
//   - All mappers handle both DB canonical names AND legacy alias names
//     (so pre-migration rows and new rows both work correctly)
//   - Mappers return typed DTOs — downstream code never touches raw DB rows
//
// Usage:
//   import { mapSaleRow, mapProformaItemRow } from '@/lib/db/mappers'
//
//   const row = await supabase.from('sales').select(sel.sales.LIST).single()
//   const sale = mapSaleRow(row.data)   // typed SaleDTO
// ─────────────────────────────────────────────────────────────────────────────

import { safeNum, safeStr } from '@/lib/normalize'

// ─── Sale ─────────────────────────────────────────────────────────────────────

export interface SaleDTO {
  id:             string
  company_id:     string
  customer_id:    string | null
  customer_name:  string
  currency:       string
  /** TRY total — canonical field for all calculations */
  total_try:      number
  /** Amount already paid — reads `paid_amount` from DB (active column) */
  amount_paid:    number
  payment_status: string
  sale_date:      string
  due_date:       string | null
  paid_at:        string | null
  proforma_id:    string | null
  shipment_status:string
  notes:          string
  deleted_at:     string | null
}

export function mapSaleRow(r: Record<string, unknown>): SaleDTO {
  return {
    id:             safeStr(r.id),
    company_id:     safeStr(r.company_id),
    customer_id:    r.customer_id ? safeStr(r.customer_id) : null,
    customer_name:  safeStr(r.customer_name),
    currency:       safeStr(r.currency, 'TRY'),
    // total_try: may come as aliased `total_try:total` or direct `total_try`
    total_try:      safeNum(r.total_try ?? r.total),
    // amount_paid: PostgREST aliases paid_amount→amount_paid in most selects.
    // Accept both field names for safety (in case a call site reads paid_amount directly).
    amount_paid:    safeNum(r.amount_paid ?? r.paid_amount),
    payment_status: safeStr(r.payment_status, 'unpaid'),
    sale_date:      safeStr(r.sale_date),
    due_date:       r.due_date ? safeStr(r.due_date) : null,
    paid_at:        r.paid_at ? safeStr(r.paid_at) : null,
    proforma_id:    r.proforma_id ? safeStr(r.proforma_id) : null,
    shipment_status:safeStr(r.shipment_status, 'pending'),
    notes:          safeStr(r.notes),
    deleted_at:     r.deleted_at ? safeStr(r.deleted_at) : null,
  }
}

/** Outstanding balance: total_try minus amount already paid, minimum 0. */
export function saleOutstanding(sale: Pick<SaleDTO, 'total_try' | 'amount_paid'>): number {
  return Math.max(0, sale.total_try - sale.amount_paid)
}

// ─── ProformaItem ─────────────────────────────────────────────────────────────

export interface ProformaItemDTO {
  id:               string
  proforma_id:      string
  product_id:       string | null
  /** DB: product_name */
  name:             string
  /** DB: unit_price */
  price:            number
  /** DB: qty */
  quantity:         number
  unit:             string
  /** DB: discount_pct */
  discount_percent: number
  /** DB: kdv_rate */
  kdv:              number
  currency:         string
  sort_order:       number
}

export function mapProformaItemRow(r: Record<string, unknown>): ProformaItemDTO {
  return {
    id:               safeStr(r.id),
    proforma_id:      safeStr(r.proforma_id),
    product_id:       r.product_id ? safeStr(r.product_id) : null,
    // DB canonical: product_name. Legacy alias: name.
    name:             safeStr(r.product_name ?? r.name, '—'),
    // DB canonical: unit_price. Legacy alias: price.
    price:            safeNum(r.unit_price ?? r.price),
    // DB canonical: qty. Legacy alias: quantity.
    quantity:         safeNum(r.qty ?? r.quantity, 1) || 1,
    unit:             safeStr(r.unit, 'adet'),
    // DB canonical: discount_pct. Legacy alias: discount_percent.
    discount_percent: safeNum(r.discount_pct ?? r.discount_percent),
    // DB canonical: kdv_rate. Legacy alias: kdv.
    kdv:              safeNum(r.kdv_rate ?? r.kdv),
    currency:         safeStr(r.currency, 'TRY'),
    sort_order:       safeNum(r.sort_order),
  }
}

// ─── SaleItem ─────────────────────────────────────────────────────────────────

export interface SaleItemDTO {
  id:               string
  sale_id:          string
  product_id:       string | null
  name:             string
  price:            number
  quantity:         number
  unit:             string
  discount_percent: number
  kdv:              number
  currency:         string
  sort_order:       number
}

export function mapSaleItemRow(r: Record<string, unknown>): SaleItemDTO {
  return {
    id:               safeStr(r.id),
    sale_id:          safeStr(r.sale_id),
    product_id:       r.product_id ? safeStr(r.product_id) : null,
    name:             safeStr(r.product_name ?? r.name, '—'),
    price:            safeNum(r.unit_price ?? r.price),
    quantity:         safeNum(r.qty ?? r.quantity, 1) || 1,
    unit:             safeStr(r.unit, 'adet'),
    discount_percent: safeNum(r.discount_pct ?? r.discount_percent),
    kdv:              safeNum(r.kdv_rate ?? r.kdv),
    currency:         safeStr(r.currency, 'TRY'),
    sort_order:       safeNum(r.sort_order),
  }
}

// ─── Expense ──────────────────────────────────────────────────────────────────

export interface ExpenseDTO {
  id:              string
  company_id:      string
  expense_type:    string
  description:     string
  /** Native-currency amount */
  amount:          number
  /** TRY-converted amount */
  amount_try:      number
  currency:        string
  expense_date:    string
  payment_status:  string
  is_paid:         boolean
  vendor:          string
  deleted_at:      string | null
}

export function mapExpenseRow(r: Record<string, unknown>): ExpenseDTO {
  return {
    id:             safeStr(r.id),
    company_id:     safeStr(r.company_id),
    expense_type:   safeStr(r.expense_type, 'general'),
    description:    safeStr(r.description),
    amount:         safeNum(r.amount),
    amount_try:     safeNum(r.amount_try ?? r.amount),
    currency:       safeStr(r.currency, 'TRY'),
    expense_date:   safeStr(r.expense_date),
    payment_status: safeStr(r.payment_status, 'pending'),
    is_paid:        Boolean(r.is_paid),
    vendor:         safeStr(r.vendor),
    deleted_at:     r.deleted_at ? safeStr(r.deleted_at) : null,
  }
}

// ─── StockLot ─────────────────────────────────────────────────────────────────

export interface StockLotDTO {
  id:              string
  company_id:      string
  product_id:      string
  /** Quantity remaining in this lot */
  qty_remaining:   number
  /** Unit cost in native currency — IMMUTABLE after creation (FIFO) */
  cost_price:      number
  /** Unit cost in TRY — IMMUTABLE after creation (FIFO) */
  cost_price_try:  number
  /** FX rate at lot creation — IMMUTABLE */
  cost_fx_rate:    number
  currency:        string
  created_at:      string
}

export function mapStockLotRow(r: Record<string, unknown>): StockLotDTO {
  return {
    id:             safeStr(r.id),
    company_id:     safeStr(r.company_id),
    product_id:     safeStr(r.product_id),
    qty_remaining:  safeNum(r.qty_remaining),
    // DB canonical: cost_price. Accept legacy aliases for backward compat.
    cost_price:     safeNum(r.cost_price ?? r.unit_cost),
    cost_price_try: safeNum(r.cost_price_try ?? r.entry_cost_try),
    cost_fx_rate:   safeNum(r.cost_fx_rate ?? r.fx_rate_at_entry, 1),
    currency:       safeStr(r.currency, 'TRY'),
    created_at:     safeStr(r.created_at),
  }
}

// ─── PartnerLoanTranche ───────────────────────────────────────────────────────

export interface PartnerLoanTrancheDTO {
  id:                   string
  company_id:           string
  partner_id:           string
  amount_try:           number
  outstanding_try:      number
  /** DB canonical: interest_rate_annual_pct. Legacy: annual_interest_rate. */
  interest_rate_annual_pct: number
  status:               string
  disbursed_at:         string | null
  due_date:             string | null
}

export function mapPartnerLoanTrancheRow(r: Record<string, unknown>): PartnerLoanTrancheDTO {
  return {
    id:              safeStr(r.id),
    company_id:      safeStr(r.company_id),
    partner_id:      safeStr(r.partner_id),
    amount_try:      safeNum(r.amount_try),
    outstanding_try: safeNum(r.outstanding_try),
    // DB canonical: interest_rate_annual_pct. Legacy alias: annual_interest_rate.
    interest_rate_annual_pct: safeNum(r.interest_rate_annual_pct ?? r.annual_interest_rate),
    status:          safeStr(r.status, 'active'),
    disbursed_at:    r.disbursed_at ? safeStr(r.disbursed_at) : null,
    due_date:        r.due_date ? safeStr(r.due_date) : null,
  }
}

// ─── Proforma ─────────────────────────────────────────────────────────────────

export interface ProformaDTO {
  id:               string
  company_id:       string
  proforma_no:      string | null
  customer_id:      string | null
  customer_name:    string
  currency:         string
  validity_days:    number
  notes:            string
  status:           string
  total_try:        number
  created_at:       string
  deleted_at:       string | null
  company_snapshot: Record<string, unknown> | null
  customer_snapshot:Record<string, unknown> | null
}

export function mapProformaRow(r: Record<string, unknown>): ProformaDTO {
  return {
    id:               safeStr(r.id),
    company_id:       safeStr(r.company_id),
    proforma_no:      r.proforma_no ? safeStr(r.proforma_no) : null,
    customer_id:      r.customer_id ? safeStr(r.customer_id) : null,
    customer_name:    safeStr(r.customer_name),
    currency:         safeStr(r.currency, 'TRY'),
    validity_days:    safeNum(r.validity_days, 30) || 30,
    notes:            safeStr(r.notes),
    status:           safeStr(r.status, 'draft'),
    total_try:        safeNum(r.total_try),
    created_at:       safeStr(r.created_at),
    deleted_at:       r.deleted_at ? safeStr(r.deleted_at) : null,
    company_snapshot: (r.company_snapshot && typeof r.company_snapshot === 'object')
                        ? (r.company_snapshot as Record<string, unknown>)
                        : null,
    customer_snapshot:(r.customer_snapshot && typeof r.customer_snapshot === 'object')
                        ? (r.customer_snapshot as Record<string, unknown>)
                        : null,
  }
}
