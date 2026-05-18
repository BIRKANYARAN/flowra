// ─────────────────────────────────────────────────────────────────────────────
// lib/db/schema.ts
//
// CONTRACT INTEGRITY — Single source of truth for DB column names.
//
// Problem this solves:
//   The DB schema and application layer evolved separately. This created a class
//   of silent bugs where code reads/writes wrong column names. The most critical
//   example found in production:
//
//     DB table: sales
//       paid_amount   (ACTIVE — written by payment routes)
//       amount_paid   (STALE  — legacy column, reads always 0 for new rows)
//
//   Code that reads `.select('amount_paid')` was silently getting 0 for all
//   partial payments instead of the real paid amount. This corrupted cash flow
//   statements and receivables calculations.
//
// Usage:
//   import { COLS, sel } from '@/lib/db/schema'
//
//   supabase.from('sales').select(sel.sales.RECEIVABLES)
//   // → "id, total_try:total, amount_paid:paid_amount, payment_status, due_date"
//
//   supabase.from('sales').select(sel.sales.LIST)
//   // → full list select
// ─────────────────────────────────────────────────────────────────────────────

// ─── Table: sales ─────────────────────────────────────────────────────────────
//
// DUAL-COLUMN WARNING:
//   sales.total       — canonical numeric total in native currency
//   sales.total_try   — canonical numeric total in TRY (separate column, not alias)
//   sales.paid_amount — ACTIVE: written by /api/collections and /api/sales/[id]
//   sales.amount_paid — STALE: legacy column, do NOT select without alias
//
// Always alias: paid_amount → amount_paid   (downstream code uses .amount_paid)
//               total       → total_try     (when querying the native total)
//               (total_try is a real column too — alias only when selecting `total`)

export const COLS = {
  sales: {
    /** Active paid-amount column (what payment routes write) */
    PAID_AMOUNT:   'paid_amount',
    /** PostgREST alias: reads paid_amount but returns it as amount_paid in JS */
    PAID_AMOUNT_AS_AMOUNT_PAID: 'amount_paid:paid_amount',
    /** Native-currency total */
    TOTAL:         'total',
    /** PostgREST alias: reads `total` but returns it as total_try in JS */
    TOTAL_AS_TRY:  'total_try:total',
    /** TRY total — separate column for multi-currency conversions */
    TOTAL_TRY:     'total_try',
  },

  // ─── Table: proforma_items ───────────────────────────────────────────────
  //
  // DB canonical names  ←→  JS/DTO field names (historical aliases preserved)
  //   product_name      ←→  name
  //   unit_price        ←→  price
  //   qty               ←→  quantity
  //   discount_pct      ←→  discount_percent
  //   kdv_rate          ←→  kdv
  //   company_id        ← NOT NULL — must always be set on insert
  //
  // The ProformaService.update() method was silently failing inserts because
  // it was using JS field names instead of DB column names.

  proforma_items: {
    PRODUCT_NAME: 'product_name',
    UNIT_PRICE:   'unit_price',
    QTY:          'qty',
    DISCOUNT_PCT: 'discount_pct',
    KDV_RATE:     'kdv_rate',
  },

  // ─── Table: sale_items ────────────────────────────────────────────────────
  // Same naming convention as proforma_items

  sale_items: {
    PRODUCT_NAME: 'product_name',
    UNIT_PRICE:   'unit_price',
    QTY:          'qty',
    DISCOUNT_PCT: 'discount_pct',
    KDV_RATE:     'kdv_rate',
  },

  // ─── Table: stock_lots ───────────────────────────────────────────────────
  //
  // DUAL-NAME WARNING:
  //   cost_price      — canonical unit cost
  //   cost_price_try  — canonical TRY cost
  //   cost_fx_rate    — canonical FX rate at lot creation
  //   entry_cost_try  — alias column (reads same data, kept for compat)
  //   fx_rate_at_entry— alias column (reads same data, kept for compat)
  //   unit_cost       — alias column (reads same data, kept for compat)
  //
  // IMMUTABILITY RULE: cost_price_try is set once at lot creation and
  // must NEVER be updated (FIFO cost invariant). The application layer
  // MUST guard this via guards.assertFifoCostImmutable().

  stock_lots: {
    COST_PRICE:     'cost_price',
    COST_PRICE_TRY: 'cost_price_try',
    COST_FX_RATE:   'cost_fx_rate',
  },

  // ─── Table: partner_loan_tranches ────────────────────────────────────────
  //
  // DUAL-NAME WARNING:
  //   interest_rate_annual_pct — canonical interest rate column
  //   annual_interest_rate     — legacy alias column
  //
  // Always use interest_rate_annual_pct for new code.

  partner_loan_tranches: {
    INTEREST_RATE: 'interest_rate_annual_pct',
  },

  // ─── Table: expenses ─────────────────────────────────────────────────────
  //   amount       — native-currency amount
  //   amount_try   — TRY-converted amount

  expenses: {
    AMOUNT:     'amount',
    AMOUNT_TRY: 'amount_try',
  },
} as const

// ─── Pre-built select strings ─────────────────────────────────────────────────
//
// Use these in supabase.from(table).select(sel.TABLE.NAME) to guarantee
// the correct columns are fetched with the correct PostgREST aliases.

export const sel = {
  sales: {
    /** Minimal fields for receivable calculations */
    RECEIVABLES: 'id, total_try:total, amount_paid:paid_amount, payment_status, due_date, sale_date',

    /** Alert generation — includes customer context */
    ALERTS: 'id, customer_name, total_try:total, amount_paid:paid_amount, payment_status, sale_date, due_date',

    /** CFO metrics and overdue calculations */
    CFO_METRICS: 'total_try:total, sale_date, due_date, amount_paid:paid_amount',

    /** Collections list — full row for the collections table */
    COLLECTIONS: 'id, customer_name, currency, total_try:total, sale_date, created_at, due_date, amount_paid:paid_amount, proforma_id, payment_status, paid_at, proformas(proforma_no)',

    /** Dashboard sales list */
    DASHBOARD: 'id, total_try:total, amount_paid:paid_amount, payment_status, customer_name, sale_date, due_date',

    /** Partial payments for cashflow (only amount_paid needed) */
    CASHFLOW_PARTIAL: 'amount_paid:paid_amount',

    /** Governance view */
    GOVERNANCE: 'total_try, amount_paid:paid_amount, due_date, payment_status',
  },

  proforma_items: {
    /** Full item read — all DB canonical names */
    ALL: 'id, proforma_id, product_id, product_name, unit, unit_price, qty, discount_pct, kdv_rate, line_total, currency, sort_order, company_id',
  },
} as const

// ─── DB Table names (avoid string typos) ─────────────────────────────────────

export const TABLES = {
  SALES:                    'sales',
  SALE_ITEMS:               'sale_items',
  PROFORMAS:                'proformas',
  PROFORMA_ITEMS:           'proforma_items',
  EXPENSES:                 'expenses',
  PURCHASES:                'purchases',
  PURCHASE_ITEMS:           'purchase_items',
  STOCK_LOTS:               'stock_lots',
  PARTNERS:                 'partners',
  PARTNER_LOAN_TRANCHES:    'partner_loan_tranches',
  PARTNER_TRANSACTIONS:     'partner_transactions',
  PARTNER_FINANCE_EVENTS:   'partner_finance_events',
  CUSTOMERS:                'customers',
  PRODUCTS:                 'products',
  COMPANY_BANKS:            'company_banks',
  USER_SETTINGS:            'user_settings',
  ACCOUNTING_PERIODS:       'accounting_periods',
  JOURNAL_ENTRIES:          'journal_entries',
  JOURNAL_ENTRY_LINES:      'journal_entry_lines',
  AUDIT_LOGS:               'audit_logs',
  ALERTS:                   'alerts',
  SIMULATION_SCENARIOS:     'simulation_scenarios',
  WORKFLOW_INSTANCES:       'workflow_instances',
} as const

export type TableName = typeof TABLES[keyof typeof TABLES]
