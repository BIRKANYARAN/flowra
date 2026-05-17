// ── Flowra shared types ───────────────────────────────────────────────────────

export type ProformaStatus = 'draft' | 'sent' | 'accepted' | 'approved' | 'rejected' | 'converted'

export type ReferenceType = 'purchase' | 'sale' | 'adjustment' | 'return' | 'write_off'

export const CURRENCIES = ['TRY', 'USD', 'EUR'] as const
export type Currency = typeof CURRENCIES[number]

export const CURRENCIES_EXTENDED = ['TRY', 'USD', 'EUR', 'GBP', 'CHF'] as const
export type CurrencyExtended = typeof CURRENCIES_EXTENDED[number]

export const CURRENCY_LABELS: Record<Currency, string> = {
  TRY: '₺ Türk Lirası',
  USD: '$ Amerikan Doları',
  EUR: '€ Euro',
}

/** Type guard — safely narrow a string to Currency */
export function isCurrency(v: string): v is Currency {
  return (CURRENCIES as readonly string[]).includes(v)
}

// ── Database row shapes ────────────────────────────────────────────────────────

export interface UserSettings {
  id:           string
  user_id:      string
  company_name: string | null
  address:      string | null
  phone:        string | null
  website:      string | null
  tax_number:   string | null
  tax_office:   string | null
  logo_url:     string | null
  currency:     string
  mersis_no:    string | null
  created_at:   string
  updated_at:   string
  deleted_at:   string | null
}

export interface Customer {
  id:         string
  user_id:    string
  name:       string
  address:    string | null
  tax_number: string | null
  tax_office: string | null
  email:      string | null
  phone:      string | null
  website:    string | null
  notes:      string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

/**
 * Product — pure catalog entity.
 *
 * New canonical fields (use these for new code):
 *   - category, default_sale_price, default_sale_currency,
 *     default_sale_vat_rate, is_active
 *
 * Legacy fields (kept for backward compatibility, DO NOT use in new code):
 *   - unit_cost, cost_currency, stock_qty, stock_alert_qty  → superseded by
 *     stock_lots / stock_movements (real source of truth)
 *   - catalog_price                                         → superseded by
 *     default_sale_price + default_sale_currency
 *
 * Use `lib/product-adapter.ts` helpers to read sale-related values safely.
 */
export interface Product {
  id:              string
  user_id:         string
  name:            string
  sku:             string | null
  unit:            string

  // ── New canonical catalog fields (optional — may be null on legacy rows) ──
  category?:              string | null
  default_sale_price?:    number | null
  default_sale_currency?: string | null
  default_sale_vat_rate?: number | null
  is_active?:             boolean

  // ── DEPRECATED — legacy fields. Do not rely on these in new code. ────────
  /** @deprecated Cost source of truth is `stock_lots.unit_cost`. */
  unit_cost:       number
  /** @deprecated Superseded by `default_sale_price`. */
  catalog_price:   number
  /** @deprecated Superseded by `default_sale_currency`. */
  cost_currency:   string
  /** @deprecated Stock source of truth is `stock_lots` / `stock_movements`. */
  stock_qty:       number
  /** @deprecated Stock source of truth is `stock_lots` / `stock_movements`. */
  stock_alert_qty: number

  description:     string | null
  created_at:      string
  updated_at:      string
  deleted_at:      string | null
}

export interface CompanyBank {
  id:          string
  user_id:     string
  bank_name:   string
  branch_name: string | null
  iban:        string
  is_default:  boolean
  created_at:  string
  deleted_at:  string | null
}

export interface Proforma {
  id:             string
  user_id:        string
  customer_id:    string | null
  bank_id:        string | null
  customer_name:  string
  proforma_no:    string | null
  total:          number
  currency:       string
  fx_rate_try:    number | null
  // FX snapshot at creation time — immutable, never recalculated from fx_rates
  fx_usd:         number | null   // USD → TRY rate when proforma was created
  fx_eur:         number | null   // EUR → TRY rate when proforma was created
  fx_try:         number          // always 1
  fx_source:          string | null   // 'tcmb_today' | 'tcmb_last_business_day' | 'db' | 'fallback'
  fx_rate_date:       string | null   // YYYY-MM-DD — date the FX rate applies to
  company_snapshot:   Record<string, unknown> | null   // frozen company info at creation
  customer_snapshot:  Record<string, unknown> | null   // frozen customer info at creation
  status:             ProformaStatus
  revision_no:    number
  parent_id:      string | null
  validity_days:  number
  notes:          string | null
  internal_notes: string | null
  sent_at:        string | null
  approved_at:    string | null
  rejected_at:    string | null
  converted_at:   string | null
  created_at:     string
  updated_at:     string
  deleted_at:     string | null
}

export interface ProformaItem {
  id:               string
  proforma_id:      string
  product_id:       string | null
  name:             string
  unit:             string
  unit_cost:        number
  price:            number
  quantity:         number
  discount_percent: number
  kdv:              number
  currency:         string
  sort_order:       number
}

export type PaymentStatus  = 'pending' | 'paid' | 'partial' | 'overdue' | 'cancelled'
export type ShipmentStatus = 'pending' | 'shipped' | 'delivered'

export interface Sale {
  id:               string
  user_id:          string
  proforma_id:      string | null
  customer_name:    string
  currency:         string
  fx_rate_try:      number | null
  fx_rate_source:   string | null
  subtotal:         number
  kdv_total:        number
  total:            number
  total_try:        number
  total_cost:       number
  cogs:             number
  holding_cost:     number
  nominal_profit:   number
  interest_rate:    number | null
  interest_days:    number | null
  real_profit:      number | null
  payment_status:   PaymentStatus
  paid_at:          string | null
  shipment_status:  ShipmentStatus | null
  notes:            string | null
  created_at:       string
  updated_at:       string
  deleted_at:       string | null
}

export interface SaleItem {
  id:               string
  sale_id:          string
  product_id:       string | null
  product_name:     string
  unit:             string
  unit_cost:        number
  price:            number
  quantity:         number
  discount_percent: number
  kdv:              number
  currency:         string
  line_total:       number
  line_total_try:   number
  sort_order:       number
}

/**
 * Movement direction — canonical classification used by the movement-derived
 * stock system (Phase 2). Independent of `reference_type` (purchase/sale/…),
 * which is the *business source*. `movement_type` is the *stock effect*:
 *   - "in"         → stock increases (qty_change > 0 expected)
 *   - "out"        → stock decreases (qty_change < 0 expected)
 *   - "adjustment" → neutral correction; sign taken from qty_change
 */
export type MovementType = 'in' | 'out' | 'adjustment'

/** @deprecated Use `MovementType`. Kept as alias to avoid breaking old imports. */
export type MovementDirection = MovementType

export interface StockMovement {
  id:              string
  user_id:         string
  product_id:      string
  reference_type:  ReferenceType
  /** Nullable only on legacy rows created before the movement_type backfill ran. */
  movement_type:   MovementType | null
  reference_id:    string | null
  qty_change:      number
  qty_before:      number
  qty_after:       number
  unit_cost:       number
  notes:           string | null
  entry_date:      string | null
  created_at:      string
}

export type StockLotSourceType = 'purchase' | 'manual' | 'adjustment' | 'return'

export interface StockLot {
  id:               string
  user_id:          string
  product_id:       string
  qty_initial:      number
  qty_remaining:    number
  unit_cost:        number
  cost_currency:    string
  fx_rate_at_entry: number
  entry_date:       string
  source_type:      StockLotSourceType
  source_id:        string | null
  created_at:       string
  deleted_at:       string | null
}

export interface SaleItemAllocation {
  id:             string
  sale_id:        string
  sale_item_id:   string
  stock_lot_id:   string
  qty:            number
  unit_cost:      number
  holding_days:   number
  interest_cost:  number
  created_at:     string
}

export interface FxRate {
  id:         string
  rate_date:  string
  currency:   string
  buying:     number
  selling:    number
  source:     string
  fetched_at: string
}

export interface InterestRate {
  id:          string
  user_id:     string
  rate_date:   string
  annual_rate: number
  source:      string
  created_at:  string
}

// ── API / UI shapes ────────────────────────────────────────────────────────────

export interface ProformaLineInput {
  product_id:       string | null
  name:             string
  unit:             string
  unit_cost:        number
  price:            number
  quantity:         number
  discount_percent: number
  kdv:              number
  currency:         string
  sort_order:       number
}

export interface ConvertInput {
  proforma_id:    string
  item_ids:       string[]
  quantities:     number[]
  interest_days:  number
}

export interface FxSnapshot {
  rate:    number
  source:  string
  date:    string
}

export interface SalesAnalytics {
  total_proformas:       number
  converted_proformas:   number
  total_sales:           number
  total_revenue_try:     number
  total_cost:            number
  nominal_profit:        number
  real_profit:           number
  monthly_sales: Array<{
    month:       string
    count:       number
    revenue_try: number
    profit:      number
  }>
}

export interface Expense {
  id:           string
  user_id:      string
  amount:       number
  currency:     string
  amount_try:   number
  fx_rate:      number
  fx_source:    string
  description:  string
  category:     string
  payment_status: PaymentStatus
  expense_type: ExpenseType | null
  expense_date: string
  created_at:   string
  updated_at:   string
  deleted_at:   string | null
}

export interface PnlResult {
  total_revenue_try:  number
  total_cost:         number
  nominal_profit:     number
  real_profit:        number
  total_expenses_try: number
  net_profit:         number
  sale_count:         number
  expense_count:      number
}

export const EXPENSE_CATEGORIES = [
  'general',
  'rent',
  'salary',
  'utilities',
  'marketing',
  'logistics',
  'software',
  'equipment',
  'tax',
  // Phase 4 — financial / partner categories with explicit deductibility rules
  'interest',         // loan interest — DEDUCTIBLE
  'board_fee',        // partner board fee / service compensation — DEDUCTIBLE
  'principal',        // loan principal — NOT DEDUCTIBLE (balance sheet)
  'dividend',         // profit distribution — NOT DEDUCTIBLE
  /** @deprecated Partner financing belongs in partner_transactions (capital_in / loan_to_company). */
  'partner_loan',     // kept for backward compat — not deductible, not a P&L item
  'other',
] as const

export type ExpenseCategory = typeof EXPENSE_CATEGORIES[number]

/**
 * High-level expense classification — derived from category, exposed in API
 * responses so callers can group/filter without re-implementing the mapping.
 *
 *   operational       — day-to-day operating costs
 *   fixed / variable  — explicit cash-burn buckets
 *   capital           — capitalizable assets
 *   financial         — financing-related non-burn costs
 *   tax               — tax payments
 *   loan_repayment    — loan principal repayment
 *   partner_financing — partner financing flow
 *   dividend          — profit distribution
 *   internal_transfer — internal cash movement
 *   other             — intentionally uncategorized/non-burn
 */
export type ExpenseType =
  | 'operational'
  | 'fixed'
  | 'variable'
  | 'capital'
  | 'financial'
  | 'tax'
  | 'loan_repayment'
  | 'partner_financing'
  | 'dividend'
  | 'internal_transfer'
  | 'other'

// ── Movement-derived stock (Phase 2 read side) ────────────────────────────────

/** Current stock, derived from `stock_movements` — independent of `product.stock_qty`. */
export interface StockSnapshot {
  product_id:       string
  qty:              number   // sum of qty_change across all movements
  total_in:         number   // total qty moved in
  total_out:        number   // total absolute qty moved out
  movement_count:   number
  last_movement_at: string | null
}

/** One entry in the movement history timeline. */
export interface StockHistoryEntry {
  id:             string
  product_id:     string
  movement_type:  MovementType | null
  reference_type: ReferenceType
  source_id:      string | null   // alias of reference_id for the read-side API
  quantity:       number          // alias of qty_change — positive = in, negative = out
  qty_before:     number
  qty_after:      number
  unit_cost:      number
  notes:          string | null
  entry_date:     string | null
  created_at:     string
}

/**
 * Stock valuation.
 *
 * method:
 *   'lot_based'        — Σ(qty_remaining × per_unit_TRY) across active lots.
 *                        Currency-correct (uses frozen entry_cost_try per lot).
 *                        Preferred when lots exist.
 *   'weighted_average' — Σ(qty_in × unit_cost) / Σ(qty_in) from movements.
 *                        Fallback when no active lots exist. NOT currency-safe
 *                        if the product has mixed-currency stock-ins.
 *   'no_stock'         — qty_on_hand ≤ 0 or no cost-bearing data.
 */
export interface StockValuation {
  product_id:         string
  qty_on_hand:        number
  weighted_unit_cost: number
  total_value:        number
  method:             'lot_based' | 'weighted_average' | 'no_stock'
  currency_note:      string   // 'lot_try' | 'lot_try_mixed(USD,EUR)' | 'movement_unit_cost' | 'n/a'
}

/** Result of comparing movement-derived qty to the legacy product.stock_qty. */
export interface StockConsistencyReport {
  product_id:      string
  computed_qty:    number   // SUM(qty_change) from movements
  legacy_qty:      number   // product.stock_qty
  drift:           number   // computed_qty - legacy_qty
  is_consistent:   boolean  // |drift| < 0.0001
  warning:         string | null
}

// ── Event outbox ──────────────────────────────────────────────────────────────

export interface EventOutbox {
  id:            string
  user_id:       string
  event_type:    string
  payload:       Record<string, unknown>
  status:        'pending' | 'processing' | 'done' | 'failed'
  retry_count:   number
  max_retries:   number
  error_message: string | null
  created_at:    string
  processed_at:  string | null
}

// ── Monthly metrics ───────────────────────────────────────────────────────────

export interface MonthlyMetrics {
  id:           string
  user_id:      string
  month:        string
  revenue:      number
  cogs:         number
  holding_cost: number
  expenses:     number
  real_profit:  number
  sale_count:   number
  updated_at:   string
}

// ── Product cost entries ──────────────────────────────────────────────────────

export type CostEntryType = 'purchase' | 'customs' | 'tax' | 'shipping' | 'other'

export interface ProductCostEntry {
  id:          string
  user_id:     string
  product_id:  string
  entry_type:  CostEntryType
  description: string | null
  amount:      number
  currency:    string
  fx_rate:     number
  amount_try:  number
  entry_date:  string
  created_at:  string
  updated_at:  string
  deleted_at:  string | null
}

// ── Real cost result ──────────────────────────────────────────────────────────

export interface RealCostResult {
  real_cost:           number
  total_qty:           number
  total_weighted_cost: number
  interest_rate:       number
}

// ── Phase 3: Cost Engine ──────────────────────────────────────────────────────
//
// Three-row model for shipments:
//   purchases       — header with currency + fx_rate snapshot at purchase date
//   purchase_items  — quantity-bearing lines (one per product)
//   purchase_costs  — overheads bound to the shipment (shipping, customs, …)
//
// Allocation method governs HOW the overheads are split across the lines.
// Unit cost is recomputed at finalization time, frozen onto stock_lots, and
// NEVER recalculated thereafter (historical correctness rule).

export type PurchaseStatus = 'draft' | 'finalized' | 'cancelled'

/** Overhead categories that can be allocated across purchase lines. */
export type PurchaseCostType = 'shipping' | 'customs' | 'tax' | 'insurance' | 'other'

/**
 * by_quantity → split equally per unit of quantity
 *   alloc_per_unit = total_overhead_try / Σ qty
 *
 * by_value    → split proportional to (qty × unit_price × fx_rate_at_purchase)
 *   alloc_for_line = total_overhead_try × (line_value_try / Σ line_value_try)
 *
 * Choose by_value when overhead correlates with line value (insurance, tax).
 * Choose by_quantity when overhead correlates with bulk (shipping by piece).
 */
export type CostAllocationMethod = 'by_quantity' | 'by_value'

export interface Purchase {
  id:            string
  user_id:       string
  supplier_name: string
  purchase_date: string                    // YYYY-MM-DD
  currency:      string                    // line prices live in this currency
  fx_rate:       number                    // currency → TRY at purchase_date
  status:        PurchaseStatus
  notes:         string | null
  finalized_at:  string | null
  created_at:    string
  updated_at:    string
  deleted_at:    string | null
}

export interface PurchaseItem {
  id:          string
  purchase_id: string
  product_id:  string
  quantity:    number
  unit_price:  number   // in purchase.currency
  sort_order:  number
  created_at:  string
}

export interface PurchaseCost {
  id:                string
  purchase_id:       string
  cost_type:         PurchaseCostType
  description:       string | null
  amount:            number    // in cost.currency
  currency:          string
  fx_rate:           number    // cost.currency → TRY
  amount_try:        number    // = amount × fx_rate (snapshot, NEVER recomputed)
  allocation_method: CostAllocationMethod
  created_at:        string
}

/**
 * Per-line allocation result, computed by CostService.allocateCosts().
 * `final_unit_cost_try` is the value that lands in stock_lots.unit_cost
 * (after dividing by qty), and `allocated_cost_try` is the per-line landed
 * cost contribution snapshot.
 */
export interface PurchaseLineAllocation {
  purchase_item_id:    string
  product_id:          string
  quantity:            number
  base_unit_price:     number    // unit_price in purchase.currency
  base_total_try:      number    // qty × unit_price × purchase.fx_rate
  allocated_cost_try:  number    // sum of overheads allocated to this line
  final_total_try:     number    // base_total_try + allocated_cost_try
  final_unit_cost_try: number    // final_total_try / qty (rounded to 4dp)
}

export interface PurchaseAllocationResult {
  purchase_id:        string
  currency:           string
  purchase_fx_rate:   number
  total_base_try:     number    // Σ base_total_try
  total_overhead_try: number    // Σ purchase_costs.amount_try
  grand_total_try:    number    // total_base_try + total_overhead_try
  lines:              PurchaseLineAllocation[]
}

/**
 * Cost breakdown for a single product, derived from finalized purchases.
 * Used for the "where did this cost come from?" UI.
 */
export interface ProductCostBreakdownEntry {
  purchase_id:         string
  purchase_item_id:    string
  purchase_date:       string
  supplier_name:       string
  quantity:            number
  base_unit_price:     number
  base_currency:       string
  base_unit_cost_try:  number   // base_unit_price × purchase.fx_rate
  allocated_cost_try:  number   // landed-cost contribution to this line
  final_unit_cost_try: number   // value that landed in stock_lots.unit_cost
}

// ── Phase 5: Simulation Engine ───────────────────────────────────────────────
//
// All simulation types are READ-ONLY projections. Nothing is written to DB.

/** Valid simulation period lengths (months). */
export type SimulationPeriodMonths = 1 | 3 | 6 | 9 | 12

/**
 * Input for a single-product simulation scenario.
 * `sale_price` is NET (ex-VAT). `discount_rate` is a % 0–99.
 */
export interface SimulationInput {
  product_id:     string
  quantity:       number              // total units sold across the period
  sale_price:     number              // per-unit net price in TRY
  discount_rate:  number              // % 0–99; 0 = no discount
  period_months:  SimulationPeriodMonths
  // Optional overrides
  tax_rate?:      number              // corporate tax %; defaults to 25
  kdv_rate?:      number              // VAT rate on the sale; defaults to 20
  start_month?:   string              // YYYY-MM; defaults to next calendar month
}

/** Per-month projected row inside a simulation result. */
export interface SimulationMonthBreakdown {
  month:                string        // YYYY-MM
  quantity:             number
  revenue:              number
  cost:                 number
  gross_profit:         number
  expenses:             number        // all expenses (deductible + non-deductible)
  deductible_expenses:  number
  kdv_sales_vat:        number        // output VAT collected this month
  tax:                  number        // approximate monthly corporate tax
  net:                  number        // revenue − cost − expenses − tax
}

/** Aggregate + monthly simulation result returned by SimulationService. */
export interface SimulationResult {
  // Aggregates (period totals)
  revenue:              number
  cost:                 number
  gross_profit:         number
  expenses_projection:  number
  deductible_expenses:  number
  non_deductible_expenses: number
  tax:                  number
  net_profit:           number        // revenue − cost − all_expenses − tax

  // VAT view
  kdv_effect: {
    sales_vat:    number              // output VAT on simulated revenue
    purchase_vat: number              // 0 — no new purchases assumed
    expense_vat:  number              // input VAT on projected expenses
    net_vat:      number              // sales_vat − expense_vat
    status:       'payable' | 'carry_forward'
  }

  // Monthly drill-down
  monthly_breakdown: SimulationMonthBreakdown[]

  // Transparency / audit trail
  simulation_meta: {
    product_id:          string
    unit_cost_try:       number       // WAC from current stock (0 if no stock)
    effective_unit_price: number      // sale_price × (1 − discount_rate/100)
    original_sale_price:  number
    discount_rate:        number
    total_quantity:       number
    stock_qty_available:  number      // total qty_remaining at simulation time
    period_months:        number
    start_month:          string      // first month of projection
    end_month:            string      // last month
    tax_rate:             number
    kdv_rate:             number
    assumptions:          string[]    // plain-English notes about simplifications
  }
}

/**
 * Pre-aggregated per-month expense data used inside the pure kernel.
 * Keys are YYYY-MM strings.
 */
export type MonthlyExpenseMap = Map<string, {
  total:        number
  deductible:   number
  expense_vat:  number
}>

// ── Phase 4: Financial + Tax Core ────────────────────────────────────────────
//
// All values are DERIVED at read time. Nothing here is stored as a summary
// column — see /lib/services/finance.service.ts and tax.service.ts for the
// computation paths.

export type RecurrenceFrequency = 'monthly' | 'quarterly' | 'yearly'

export interface RecurringExpense {
  id:            string
  user_id:       string
  description:   string
  category:      ExpenseCategory
  amount:        number               // in `currency`
  currency:      string
  fx_rate:       number               // currency → TRY snapshot
  frequency:     RecurrenceFrequency
  start_date:    string               // YYYY-MM-DD
  end_date:      string | null        // open-ended when null
  is_active:     boolean
  is_deductible: boolean | null       // null = derive from category
  kdv:           number                // VAT rate %, 0 = none
  notes:         string | null
  created_at:    string
  updated_at:    string
  deleted_at:    string | null
}

/** Inclusive date range used by every finance/tax query. */
export interface Period {
  from: string   // YYYY-MM-DD inclusive
  to:   string   // YYYY-MM-DD inclusive
}

/**
 * One materialized expense event (real or recurring-occurrence). The
 * superset of fields the report layer needs to bucket by category, type,
 * deductibility, and to compute VAT.
 */
export interface ExpenseLineComputed {
  source:          'expense' | 'recurring'
  source_id:       string
  occurrence_date: string              // YYYY-MM-DD
  category:        ExpenseCategory
  expense_type:    ExpenseType
  is_deductible:   boolean
  amount_try:      number              // net amount (excludes VAT)
  kdv:             number              // VAT rate %
  vat_try:         number              // amount_try × kdv / 100 (input VAT)
}

export interface RevenueResult {
  total_try:     number
  sale_count:    number
  sales_vat_try: number                // output VAT for the period
}

export interface CostResult {
  cogs_try:              number        // FIFO consumption × frozen entry_cost_try
  allocation_count:      number        // # of sale_item_allocation rows summed
  fallback_legacy_count: number        // # of sales without allocations (used sales.total_cost)
}

export interface OperatingExpenseResult {
  total_try:          number
  deductible_try:     number
  non_deductible_try: number
  lines:              ExpenseLineComputed[]
}

export interface KdvResult {
  sales_vat_try:    number
  purchase_vat_try: number
  expense_vat_try:  number
  net_vat_try:      number             // > 0 = owed; < 0 = recoverable
}

export interface CorporateTaxResult {
  matrah_try:        number            // taxable base; clamped at 0 for tax calc
  rate_percent:      number
  tax_try:           number            // matrah_try × rate (0 when matrah ≤ 0)
  net_after_tax_try: number            // matrah_try - tax_try (can be negative for losses)
}

/**
 * Full snapshot returned by FinanceService.getFinancialSummary().
 * Every field is computed for `period` from the underlying tables —
 * nothing is read from a stored aggregate.
 */
export interface FinancialSummary {
  period:                       Period
  // P&L
  revenue_try:                  number
  cost_try:                     number
  gross_profit_try:             number
  expenses_total_try:           number
  deductible_expenses_try:      number
  non_deductible_expenses_try:  number
  // Tax base
  matrah_try:                   number
  corporate_tax_rate:           number
  corporate_tax_try:            number
  net_after_tax_try:            number
  // VAT
  sales_vat_try:                number
  purchase_vat_try:             number
  expense_vat_try:              number
  net_vat_try:                  number
}

// ── Phase 6: Partner System ───────────────────────────────────────────────────
//
// All balances/totals are DERIVED at read time by PartnerService.
// Nothing is stored as a summary column.

/**
 * Partner transaction types — Phase 4 canonical model.
 *
 * Financing flows (these belong in partner_transactions):
 *   capital_in       — partner contributes equity; no repayment obligation
 *   loan_to_company  — partner lends money to company; creates a balance-sheet liability
 *   loan_repayment   — company repays partner loan; reduces liability
 *   dividend         — profit distribution to partner
 *
 * Operating payments are NOT partner transactions — enter them directly as
 * expenses with the appropriate category (e.g. category='salary').
 *
 * Legacy types below are accepted for backward compatibility with existing rows;
 * do NOT use them in new code.
 *
 * Balance semantics (net_loan_try):
 *   net_loan_try > 0  → company owes partner that amount in loans
 *   net_loan_try ≤ 0  → fully settled (or over-repaid)
 */
export type PartnerTxType =
  // ── Phase 4 canonical types ──────────────────────────────────────────────
  | 'capital_in'       // equity contribution — not a liability; no repayment expected
  | 'loan_to_company'  // debt financing from partner — creates loan liability
  | 'loan_repayment'   // company repays partner loan — reduces loan liability
  | 'dividend'         // distribution of after-tax profit
  // ── Legacy types — kept for backward compat; deprecated for new entries ──
  /** @deprecated use capital_in or loan_to_company */
  | 'loan_in'
  /** @deprecated use loan_repayment */
  | 'loan_out'
  /** @deprecated record as expenses (category='salary') for proper P&L treatment */
  | 'salary'
  /** @deprecated record as expenses (category='board_fee') for proper P&L treatment */
  | 'board_fee'

export interface Partner {
  id:          string
  user_id:     string
  name:        string
  /** Ownership proportion 0 < share_ratio ≤ 1. All active partners should sum to 1.0 */
  share_ratio: number
  is_active:   boolean
  notes:       string | null
  created_at:  string
  updated_at:  string
  deleted_at:  string | null
}

export interface PartnerTransaction {
  id:         string
  partner_id: string
  user_id:    string
  tx_type:    PartnerTxType
  amount:     number         // in `currency`
  currency:   string
  fx_rate:    number         // currency → TRY at transaction time
  amount_try: number         // frozen TRY snapshot (amount × fx_rate)
  tx_date:    string         // YYYY-MM-DD
  notes:      string | null
  created_at: string
  deleted_at: string | null
}

/**
 * Aggregated balance for one partner — computed from partner_transactions.
 * All values in TRY.
 *
 * Phase 4 model separates equity contributions from debt financing:
 *   total_capital_try — sum of capital_in (equity; no repayment obligation)
 *   total_loaned_try  — sum of loan_in (legacy) + loan_to_company (debt to partner)
 *   total_repaid_try  — sum of loan_out (legacy) + loan_repayment
 *   net_loan_try      — total_loaned − total_repaid
 *                       > 0 = company still owes partner this amount in LOANS
 *                       ≤ 0 = loans fully repaid (or over-repaid)
 *
 * total_contributed_try = total_capital_try + total_loaned_try
 *   → total investment (equity + debt) by this partner; used for equalization baseline
 */
export interface PartnerBalance {
  partner_id:        string
  partner_name:      string
  share_ratio:       number
  is_active:         boolean
  // Equity contributions (Phase 4 — capital_in)
  total_capital_try:    number   // sum of capital_in; equity, no repayment obligation
  // Debt financing
  total_loaned_try:     number   // sum of loan_in (legacy) + loan_to_company
  total_repaid_try:     number   // sum of loan_out (legacy) + loan_repayment
  net_loan_try:         number   // total_loaned − total_repaid (>0 = company owes partner)
  // Operating distributions (legacy tx types; prefer expenses table for new entries)
  total_salary_try:     number
  total_board_fee_try:  number
  total_dividend_try:   number
  total_distributed_try: number  // salary + board_fee + dividend
  // Total partner investment — equity + loans; used for equalization baseline
  total_contributed_try: number  // total_capital_try + total_loaned_try
  // Net balance: what company owes partner (positive = company owes partner)
  // Formula: capital_in + loan_to_company − loan_repayment − dividend
  partner_balance_try:   number
}

/**
 * DB row from partner_loan_tranches table.
 *
 * Each tranche represents one discrete loan event from a partner to the company
 * (e.g. a specific bank transfer or agreed loan tranche).
 *
 *   status lifecycle: active → partially_repaid → repaid | overdue
 *   outstanding_try: starts at amount_try, decremented by loan_repayment transactions
 *   annual_interest_rate: decimal (0.15 = 15%); NULL = interest-free
 *   due_date: expected repayment date; NULL = open-ended
 */
export interface PartnerLoanTranche {
  id:                    string
  company_id:            string
  partner_id:            string
  amount_try:            number          // original tranche size (frozen at creation)
  outstanding_try:       number          // remaining principal (decremented on repayment)
  status:                'active' | 'partially_repaid' | 'repaid' | 'overdue'
  annual_interest_rate:  number | null   // decimal; null = interest-free
  due_date:              string | null   // YYYY-MM-DD; null = open-ended
  disbursement_date:     string | null   // YYYY-MM-DD; date the loan was received
  notes:                 string | null
  created_at:            string
  updated_at:            string
  deleted_at:            string | null
}

/**
 * Loan summary for a single partner — subset of PartnerBalance.
 */
export interface LoanStatus {
  partner_id:       string
  partner_name:     string
  total_loaned_try: number
  total_repaid_try: number
  net_loan_try:     number      // positive = still owed to partner
  is_settled:       boolean     // net_loan_try <= 0
}

/**
 * Per-partner equalization output.
 *
 * Equalization brings all partners up to the highest per-unit contribution level
 * before splitting any remaining distributable pro-rata.
 *
 *   per_unit_i     = total_contributed_try_i / share_ratio_i
 *   baseline       = MAX(per_unit_i)   ← highest contributor sets the target
 *   eq_needed_i    = max(0, baseline × share_ratio_i − total_contributed_try_i)
 *     → under-funded partners (per_unit < baseline) get equalization first
 *     → the at-baseline partner gets equalization_amount = 0; only pro-rata share
 *
 * Spec example: A=100k, B=400k (50/50 shares)
 *   per_unit_A=200k, per_unit_B=800k  →  baseline=800k
 *   eq_A = (800k − 200k) × 0.5 = 300k   (A is under-funded; receives 300k first)
 *   eq_B = (800k − 800k) × 0.5 = 0      (B is at baseline; only pro-rata remainder)
 *
 * `equalization_amount` is the actual payout from the equalization step
 * (may be less than eq_needed if distributable is insufficient — then it is
 * allocated proportionally among under-funded partners with no pro-rata split).
 */
export interface PartnerEqualizationEntry {
  partner_id:            string
  partner_name:          string
  share_ratio:           number
  total_contributed_try: number   // equity (capital_in) + loans (loan_to_company / loan_in)
  per_unit_contribution: number   // total_contributed / share_ratio
  equalization_amount:   number   // actual equalization payout this partner receives (≥ 0)
  pro_rata_share:        number   // share of remaining distributable after equalization
  total_payout:          number   // equalization_amount + pro_rata_share  (Σ = distributable)
}

export interface EqualizationResult {
  baseline_per_unit:     number   // MAX(per_unit_contribution) — the target all partners aim for
  total_equalization:    number   // total equalization NEEDED (Σ eq_needed_i); informational
  distributable:         number   // input distributable amount (0 if not provided)
  remaining_after_eq:    number   // distributable − actual_equalization_paid (≥ 0; split pro-rata)
  entries:               PartnerEqualizationEntry[]
}

// ── Phase 7: Audit & Alert System ────────────────────────────────────────────

export type AuditAction     = 'create' | 'update' | 'delete'
export type AlertSeverity   = 'info' | 'warning' | 'critical'
export type AuditEntityType =
  // ── Core transactional entities ──────────────────────────────────────────
  | 'stock_movement'
  | 'purchase'
  | 'sale'
  | 'expense'
  | 'recurring_expense'
  | 'partner_transaction'
  | 'partner'
  // ── Additional entities logged by write_audit_log / logAudit ────────────
  | 'proforma'            // proforma CRUD events
  | 'customer'            // customer CRUD events
  | 'task'                // task create / status change events
  | 'user_settings'       // company profile / logo updates
  | 'company_bank'        // bank account CRUD events
  | 'product'             // product CRUD events

/** Immutable audit trail row — never updated after insert. */
export interface AuditLog {
  id:          string
  user_id:     string
  /** Company that owns this audit row. Populated by write_audit_log (8-param version).
   *  Null only on rows written before the company_id migration was applied. */
  company_id:  string | null
  entity_type: AuditEntityType
  entity_id:   string
  action:      AuditAction
  old_data:    Record<string, unknown> | null
  new_data:    Record<string, unknown> | null
  ip_address:  string | null
  created_at:  string
}

/** User-visible alert / notification. */
export interface Alert {
  id:             string
  actor_user_id:  string
  entity_type:    AuditEntityType
  entity_id:      string
  message:        string
  severity:       AlertSeverity
  is_read:        boolean
  created_at:     string
}

// ── Phase 8: Users / Roles / Admin System ─────────────────────────────────────
//
// Role hierarchy: admin > manager > viewer
//   admin   — full company access; can manage members, view all audit logs
//   manager — "sales rep"; creates and owns their own customers/sales
//   viewer  — read-only; cannot create or modify records
//
// company_members.role CHECK: ('admin', 'manager', 'viewer')
// accepted_at NULL  = invitation pending (not yet activated)
// accepted_at !NULL = active member

export type MemberRole = 'admin' | 'manager' | 'viewer'

/** company_members row as returned by the admin members API. */
export interface CompanyMember {
  id:          string
  company_id:  string
  user_id:     string
  role:        MemberRole
  invited_by:  string | null
  accepted_at: string | null   // null = invite pending
  created_at:  string
  deleted_at:  string | null
  /** Email from auth.users — joined server-side, not a DB column. */
  email:       string | null
  /** Display name from auth.users.user_metadata. */
  display_name: string | null
}

// ── Phase 4: Automation + Financial Intelligence ──────────────────────────────

export type TaskStatus = 'open' | 'done' | 'cancelled'

export interface Task {
  id:                   string
  user_id:              string
  company_id:           string
  title:                string
  due_date:             string | null   // YYYY-MM-DD
  status:               TaskStatus
  related_customer_id:  string | null
  related_sale_id:      string | null
  notes:                string | null
  created_at:           string
  updated_at:           string
  deleted_at:           string | null
  // Joined from customers — not a DB column
  customer_name?:       string | null
}

/** One month in a recurring expense projection. */
export interface RecurringProjectionMonth {
  month:      string   // YYYY-MM
  amount_try: number   // sum of all recurring expense amounts_try for this month
  items: Array<{
    id:          string
    description: string
    category:    string
    amount_try:  number
    frequency:   string
  }>
}

/**
 * One month in a cashflow projection.
 *
 * Cash-flow model — strict payment basis:
 *   inflow  = collected only  (sales WHERE payment_status='paid', grouped by paid_at)
 *   outflow = paid expenses   (expenses.payment_status='paid', grouped by expense_date)
 *             + recurring projections for future months only (no double-counting actuals)
 *   net     = collected − expenses          ← CASH basis, never invoiced basis
 *
 * invoiced  = sales total_try grouped by created_at  — context only, NOT part of net
 * receivable = invoiced this month still unpaid/partial/overdue — outstanding balance
 *
 * Partial payments: tracked as full receivable (no amount_paid column in schema).
 * When a partial becomes paid, it moves from receivable→collected in the paid_at month.
 */
export interface CashflowMonth {
  month:        string   // YYYY-MM
  invoiced:     number   // sales total_try created this month (NOT cash — context only)
  collected:    number   // cash received this month (paid_at, payment_status='paid')
  receivable:   number   // still-outstanding invoices created this month
  expenses:     number   // cash out: paid expenses + recurring projections (future only)
  net:          number   // collected − expenses  (strict cash basis)
  cumulative:   number   // running sum of net from month[0]
  is_projected: boolean  // true = future month (no actual inflow data yet)
}

/** Response from GET /api/analytics/kpi */
export interface KpiResult {
  // ── Period-scoped (filtered by from/to) ──────────────────────────────────
  total_revenue:           number   // invoiced: sum sales.total_try created in period
  total_collected:         number   // cash: sum paid sales.total_try where paid_at in period
  total_expenses:          number   // sum expenses.amount_try in period
  net_profit:              number   // (revenue − cogs) − expenses (accrual approximation)

  // ── All-time receivables ──────────────────────────────────────────────────
  outstanding_receivables: number   // all-time unpaid/partial/overdue total_try
  overdue_receivables:     number   // outstanding AND created_at > 30 days ago

  // ── Balance sheet proxies ─────────────────────────────────────────────────
  stock_value:             number   // FIFO: Σ(qty_remaining × entry_cost_try) from stock_lots
  stock_coverage_ratio:    number | null  // stock_value / total_partner_capital; null if no capital

  // ── Cash position & runway ────────────────────────────────────────────────
  //
  //   cash_position       = all_time_collected_paid_sales − all_time_paid_expenses
  //                         excluding partner transactions and loan/internal/dividend flows
  //
  //   monthly_burn_rate   = last_3_months_paid_expenses where
  //                         expense_type in ('operational','fixed','variable') / 3
  //
  //   adjusted_burn_rate  = max(monthly_burn_rate, recurring_monthly_commitment)
  //                         recurring_monthly_commitment = Σ active recurring expenses
  //                           converted to monthly TRY equiv (monthly×1, quarterly×1/3, yearly×1/12)
  //                         Purpose: prevents underestimating burn when recurring liabilities
  //                           aren't yet in the expense ledger (e.g. invoices not yet recorded).
  //
  //   runway_months       = cash_position / adjusted_burn_rate
  //                         null when adjusted_burn_rate ≤ 0 (no meaningful burn)
  //
  cash_position:           number
  monthly_burn_rate:       number
  adjusted_burn_rate:      number
  runway_months:           number | null

  period_from:             string
  period_to:               string
}

/**
 * Receivable aging buckets — response from GET /api/analytics/receivable-aging.
 *
 * Age is measured from invoice creation date (created_at) to today.
 * Partial payments are treated as full receivable (no amount_paid column).
 * Each bucket: count = number of sales, total_try = sum of total_try.
 */
export interface ReceivableAging {
  current:      { count: number; total_try: number }   // 0–30 days old
  aged_30_60:   { count: number; total_try: number }   // 31–60 days old
  aged_60_plus: { count: number; total_try: number }   // 61+ days old
  total:        { count: number; total_try: number }   // all outstanding
  computed_at:  string                                  // ISO timestamp
}
