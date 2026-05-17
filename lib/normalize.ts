// ── Data normalization layer ──────────────────────────────────────────────────
// Every server component must pass raw Supabase data through these normalizers
// before rendering. This eliminates the entire class of crashes caused by:
//   - PostgreSQL numeric(14,4) arriving as strings via PostgREST
//   - jsonb_agg() returning NULL instead of [] on empty sets
//   - Supabase joins returning null / object / array inconsistently
//   - Missing or deleted relations
//   - Undefined fields on partial rows

// ── Primitives ───────────────────────────────────────────────────────────────

/** Coerce any value to a finite number. Never returns NaN/Infinity. */
export function safeNum(v: unknown, fallback = 0): number {
  if (v === null || v === undefined) return fallback
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

/** Coerce any value to a non-empty string. */
export function safeStr(v: unknown, fallback = ''): string {
  if (typeof v === 'string' && v.length > 0) return v
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  return fallback
}

/** Coerce any value to an array. Handles jsonb_agg NULL. */
export function safeArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? v : []
}

// ── PnlResult normalizer ────────────────────────────────────────────────────

export interface NormalizedPnl {
  total_revenue_try:  number
  total_cost:         number
  nominal_profit:     number
  real_profit:        number
  total_expenses_try: number
  net_profit:         number
  sale_count:         number
  expense_count:      number
}

const EMPTY_PNL: NormalizedPnl = {
  total_revenue_try: 0, total_cost: 0, nominal_profit: 0,
  real_profit: 0, total_expenses_try: 0, net_profit: 0,
  sale_count: 0, expense_count: 0,
}

export function normalizePnl(raw: unknown): NormalizedPnl {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_PNL }
  const r = raw as Record<string, unknown>
  return {
    total_revenue_try:  safeNum(r.total_revenue_try),
    total_cost:         safeNum(r.total_cost),
    nominal_profit:     safeNum(r.nominal_profit),
    real_profit:        safeNum(r.real_profit),
    total_expenses_try: safeNum(r.total_expenses_try),
    net_profit:         safeNum(r.net_profit),
    sale_count:         safeNum(r.sale_count),
    expense_count:      safeNum(r.expense_count),
  }
}

// ── Analytics normalizer ─────────────────────────────────────────────────────

export interface NormalizedMonthlySale {
  month:       string
  count:       number
  revenue_try: number
  profit:      number
}

export interface NormalizedAnalytics {
  total_proformas:     number
  converted_proformas: number
  total_sales:         number
  total_revenue_try:   number
  total_cost:          number
  nominal_profit:      number
  real_profit:         number
  monthly_sales:       NormalizedMonthlySale[]
}

export function normalizeAnalytics(raw: unknown): NormalizedAnalytics {
  if (!raw || typeof raw !== 'object') {
    return {
      total_proformas: 0, converted_proformas: 0, total_sales: 0,
      total_revenue_try: 0, total_cost: 0, nominal_profit: 0, real_profit: 0,
      monthly_sales: [],
    }
  }
  const r = raw as Record<string, unknown>
  // CRITICAL: jsonb_agg returns NULL on empty sets — r.monthly_sales may be null
  // even though it's defined. safeArray handles this.
  const rawMonthly = safeArray<Record<string, unknown>>(r.monthly_sales)
  return {
    total_proformas:     safeNum(r.total_proformas),
    converted_proformas: safeNum(r.converted_proformas),
    total_sales:         safeNum(r.total_sales),
    total_revenue_try:   safeNum(r.total_revenue_try),
    total_cost:          safeNum(r.total_cost),
    nominal_profit:      safeNum(r.nominal_profit),
    real_profit:         safeNum(r.real_profit),
    monthly_sales: rawMonthly.map(m => ({
      month:       safeStr(m.month, '—'),
      count:       safeNum(m.count),
      revenue_try: safeNum(m.revenue_try),
      profit:      safeNum(m.profit),
    })),
  }
}

// ── Sale row normalizer (list page) ──────────────────────────────────────────

export interface NormalizedSaleRow {
  id:              string
  customer_name:   string
  currency:        string
  total:           number
  total_try:       number
  cogs:            number
  holding_cost:    number
  nominal_profit:  number
  paid_amount:     number
  /** Business invoice date (YYYY-MM-DD) — use for period attribution and display */
  sale_date:       string
  /** DB insertion timestamp — kept for backward compat; prefer sale_date for display */
  created_at:      string
  proforma_id:     string | null
  proforma_no:     string | null
  proforma_deleted: boolean
  payment_status:  string
  shipment_status: string | null
}

export function normalizeSaleRow(raw: unknown): NormalizedSaleRow | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const id = safeStr(r.id)
  if (!id) return null

  // Normalize the proformas join — can be null, object, or array
  let proformaNo: string | null = null
  let proformaDeleted = false
  const joinVal = r.proformas
  if (joinVal && typeof joinVal === 'object' && !Array.isArray(joinVal)) {
    const j = joinVal as Record<string, unknown>
    proformaNo = typeof j.proforma_no === 'string' ? j.proforma_no : null
    proformaDeleted = j.deleted_at !== null && j.deleted_at !== undefined
  }

  return {
    id,
    customer_name:   safeStr(r.customer_name, '—'),
    currency:        safeStr(r.currency, 'TRY'),
    total:           safeNum(r.total),
    total_try:       safeNum(r.total_try),
    cogs:            safeNum(r.cogs),
    holding_cost:    safeNum(r.holding_cost),
    nominal_profit:  safeNum(r.nominal_profit),
    paid_amount:     safeNum(r.paid_amount),
    sale_date:       safeStr(r.sale_date).slice(0, 10) || safeStr(r.created_at).slice(0, 10),
    created_at:      safeStr(r.created_at),
    proforma_id:     typeof r.proforma_id === 'string' ? r.proforma_id : null,
    proforma_no:     proformaNo,
    proforma_deleted: proformaDeleted,
    payment_status:  safeStr(r.payment_status, 'pending'),
    shipment_status: typeof r.shipment_status === 'string' ? r.shipment_status : null,
  }
}

// ── Sale detail normalizer ───────────────────────────────────────────────────

export interface NormalizedSaleDetail {
  id:              string
  customer_name:   string
  currency:        string
  subtotal:        number
  kdv_total:       number
  total:           number
  total_try:       number
  total_cost:      number
  cogs:            number
  holding_cost:    number
  nominal_profit:  number
  real_profit:     number
  interest_rate:   number
  interest_days:   number
  fx_rate_source:  string | null
  /** Business invoice date (YYYY-MM-DD) — preferred for display */
  sale_date:       string
  created_at:      string
  proforma_id:     string | null
  proforma_no:     string | null
  proforma_exists: boolean
}

export function normalizeSaleDetail(raw: unknown): NormalizedSaleDetail | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const id = safeStr(r.id)
  if (!id) return null

  // Normalize proformas join
  let proformaNo: string | null = null
  let proformaExists = false
  const joinVal = r.proformas
  if (joinVal && typeof joinVal === 'object' && !Array.isArray(joinVal)) {
    const j = joinVal as Record<string, unknown>
    proformaNo = typeof j.proforma_no === 'string' ? j.proforma_no : null
    proformaExists = j.deleted_at === null
  }

  return {
    id,
    customer_name:   safeStr(r.customer_name, '—'),
    currency:        safeStr(r.currency, 'TRY'),
    subtotal:        safeNum(r.subtotal),
    kdv_total:       safeNum(r.kdv_total),
    total:           safeNum(r.total),
    total_try:       safeNum(r.total_try),
    total_cost:      safeNum(r.total_cost),
    cogs:            safeNum(r.cogs),
    holding_cost:    safeNum(r.holding_cost),
    nominal_profit:  safeNum(r.nominal_profit),
    real_profit:     safeNum(r.real_profit),
    interest_rate:   safeNum(r.interest_rate),
    interest_days:   safeNum(r.interest_days),
    fx_rate_source:  typeof r.fx_rate_source === 'string' ? r.fx_rate_source : null,
    sale_date:       safeStr(r.sale_date).slice(0, 10) || safeStr(r.created_at).slice(0, 10),
    created_at:      safeStr(r.created_at),
    proforma_id:     typeof r.proforma_id === 'string' ? r.proforma_id : null,
    proforma_no:     proformaNo,
    proforma_exists: proformaExists,
  }
}

// ── Sale item normalizer ─────────────────────────────────────────────────────

export interface NormalizedSaleItem {
  id:               string
  product_name:     string
  unit:             string
  price:            number
  quantity:         number
  discount_percent: number
  kdv:              number
  unit_cost:        number
  sort_order:       number
}

export function normalizeSaleItem(raw: unknown): NormalizedSaleItem | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  return {
    id:               safeStr(r.id),
    product_name:     safeStr(r.product_name) || safeStr(r.name, '—'),
    unit:             safeStr(r.unit, 'adet'),
    price:            safeNum(r.price),
    quantity:         safeNum(r.quantity, 1) || 1,
    discount_percent: safeNum(r.discount_percent),
    kdv:              safeNum(r.kdv),
    unit_cost:        safeNum(r.unit_cost),
    sort_order:       safeNum(r.sort_order),
  }
}

// ── Proforma row normalizer (list page) ──────────────────────────────────────

export interface NormalizedProformaRow {
  id:            string
  proforma_no:   string
  customer_name: string
  total:         number
  currency:      string
  status:        string
  revision_no:   number
  created_at:    string
}

export function normalizeProformaRow(raw: unknown): NormalizedProformaRow | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const id = safeStr(r.id)
  if (!id) return null
  // total may come as grand_total, total, or as a string from numeric(14,4)
  const total = safeNum(r.grand_total ?? r.total)
  return {
    id,
    proforma_no:   safeStr(r.proforma_no) || ('PRF-' + id.slice(-8).toUpperCase()),
    customer_name: safeStr(r.customer_name, '—'),
    total,
    currency:      safeStr(r.currency, 'TRY'),
    status:        safeStr(r.status, 'draft'),
    revision_no:   safeNum(r.revision_no, 1) || 1,
    created_at:    safeStr(r.created_at),
  }
}
