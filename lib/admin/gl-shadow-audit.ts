// ─────────────────────────────────────────────────────────────────────────────
// lib/admin/gl-shadow-audit.ts
//
// Faz 9-C: Shadow Validation Audit — pure comparison layer.
//
// Compares operational-table-derived financials (BalanceSheetService /
// FinanceService) against GL-account-derived financials (GLIncomeStatementService
// / GLBalanceSheetService). No DB calls — the route layer provides both
// snapshots. Safe to unit test in isolation.
// ─────────────────────────────────────────────────────────────────────────────

import { round2 } from '@/lib/calc'

// ── Input snapshots ───────────────────────────────────────────────────────────

/** Operational-table summary (from FinanceService.getFinancialSummary) */
export interface OperationalSummary {
  revenue_try:            number
  cost_try:               number          // COGS
  gross_profit_try:       number
  deductible_expenses_try: number
  non_deductible_expenses_try: number
  sales_vat_try:          number          // output VAT
  purchase_vat_try:       number          // purchase VAT (from sales VAT calc)
  expense_vat_try:        number          // expense VAT
  net_vat_try:            number
  matrah_try:             number
  corporate_tax_try:      number
  net_after_tax_try:      number
}

/** GL-account-derived income statement (from GLIncomeStatementService) */
export interface GLSummary {
  gross_revenue_try:   number             // acct 600
  cogs_try:            number             // acct 620
  gross_profit_try:    number
  total_opex_try:      number             // acct 760+770+771+772+773
  ebt_try:             number
  net_income_try:      number
}

/** GL-account-derived balance sheet (from GLBalanceSheetService) */
export interface GLBalanceSheetSummary {
  cash_try:                number          // 100+102
  trade_receivables_try:   number          // 120
  inventory_try:           number          // 153
  deductible_vat_try:      number          // 191
  output_vat_try:          number          // 391
  trade_payables_try:      number          // 320
  is_balanced:             boolean
  imbalance_try:           number
}

/** Operational balance sheet proxy (from BalanceSheetService) */
export interface OperationalBalanceSheetSummary {
  trade_receivables_try: number
  inventory_try:         number
  total_assets_try:      number
  total_liabilities_try: number
  total_equity_try:      number
  is_balanced:           boolean
}

// ── Output types ──────────────────────────────────────────────────────────────

export type DivergenceSeverity = 'ok' | 'warn' | 'critical'

export interface FieldDelta {
  field:              string
  operational_try:    number
  gl_try:             number
  delta_try:          number
  delta_pct:          number
  severity:           DivergenceSeverity
}

export interface ShadowAuditResult {
  /** ISO timestamp of audit computation */
  audited_at:          string
  /** Array of field-level comparisons */
  deltas:              FieldDelta[]
  /** Maximum delta percentage across all fields */
  max_delta_pct:       number
  /** Overall readiness based on thresholds */
  overall_severity:    DivergenceSeverity
  /** Human-readable summary */
  summary:             string
  /** Counts by severity */
  counts:              { ok: number; warn: number; critical: number }
}

// ── Thresholds ────────────────────────────────────────────────────────────────

/** Divergence below this % → ok */
const WARN_THRESHOLD_PCT  = 1.0
/** Divergence above this % → critical */
const CRIT_THRESHOLD_PCT  = 5.0
/** Absolute delta below this TRY → ok regardless of %. Handles tiny amounts. */
const ABS_EPSILON_TRY     = 1.0

// ── Pure helpers ──────────────────────────────────────────────────────────────

function computeSeverity(deltaPct: number, deltaAbsTRY: number): DivergenceSeverity {
  if (Math.abs(deltaAbsTRY) <= ABS_EPSILON_TRY) return 'ok'
  const absPct = Math.abs(deltaPct)
  if (absPct >= CRIT_THRESHOLD_PCT) return 'critical'
  if (absPct >= WARN_THRESHOLD_PCT) return 'warn'
  return 'ok'
}

function makeDelta(
  field:           string,
  operationalTry:  number,
  glTry:           number,
): FieldDelta {
  const delta    = round2(operationalTry - glTry)
  const base     = Math.abs(operationalTry) || Math.abs(glTry) || 1
  const deltaPct = round2((delta / base) * 100)
  return {
    field,
    operational_try: round2(operationalTry),
    gl_try:          round2(glTry),
    delta_try:       delta,
    delta_pct:       deltaPct,
    severity:        computeSeverity(deltaPct, delta),
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Compare operational-derived financials against GL-derived financials.
 * Returns a structured audit result with per-field deltas and severity grades.
 *
 * Pure function — no side effects, no DB calls.
 */
export function computeShadowAudit(
  operational:    OperationalSummary,
  gl:             GLSummary,
  glBS:           GLBalanceSheetSummary,
  operationalBS:  OperationalBalanceSheetSummary,
): ShadowAuditResult {
  const deltas: FieldDelta[] = [
    // ── Income Statement comparisons ──────────────────────────────────────────
    makeDelta('revenue',        operational.revenue_try,  gl.gross_revenue_try),
    makeDelta('cogs',           operational.cost_try,     gl.cogs_try),
    makeDelta('gross_profit',   operational.gross_profit_try, gl.gross_profit_try),
    makeDelta('total_opex',
      operational.deductible_expenses_try + operational.non_deductible_expenses_try,
      gl.total_opex_try,
    ),
    makeDelta('net_income',     operational.net_after_tax_try, gl.net_income_try),

    // ── VAT comparisons ───────────────────────────────────────────────────────
    makeDelta('output_vat',     operational.sales_vat_try,   glBS.output_vat_try),
    makeDelta('input_vat_ded',  operational.expense_vat_try, glBS.deductible_vat_try),

    // ── Balance Sheet comparisons ─────────────────────────────────────────────
    makeDelta('trade_receivables', operationalBS.trade_receivables_try, glBS.trade_receivables_try),
    makeDelta('inventory',         operationalBS.inventory_try,         glBS.inventory_try),
  ]

  const counts = { ok: 0, warn: 0, critical: 0 }
  for (const d of deltas) counts[d.severity]++

  const maxDeltaPct = deltas.reduce(
    (max, d) => Math.max(max, Math.abs(d.delta_pct)), 0,
  )

  let overallSeverity: DivergenceSeverity = 'ok'
  if (counts.critical > 0)      overallSeverity = 'critical'
  else if (counts.warn > 0)     overallSeverity = 'warn'

  const summary = overallSeverity === 'ok'
    ? `All ${deltas.length} fields within tolerance (max divergence ${maxDeltaPct.toFixed(2)}%)`
    : overallSeverity === 'warn'
    ? `${counts.warn} field(s) diverging ${WARN_THRESHOLD_PCT}–${CRIT_THRESHOLD_PCT}% (max ${maxDeltaPct.toFixed(2)}%). Review before cutover.`
    : `${counts.critical} field(s) diverging >${CRIT_THRESHOLD_PCT}% (max ${maxDeltaPct.toFixed(2)}%). BACKFILL REQUIRED before cutover.`

  return {
    audited_at:       new Date().toISOString(),
    deltas,
    max_delta_pct:    maxDeltaPct,
    overall_severity: overallSeverity,
    summary,
    counts,
  }
}

// ── Threshold constants re-exported for test assertions ──────────────────────
export const SHADOW_AUDIT_THRESHOLDS = {
  WARN_THRESHOLD_PCT,
  CRIT_THRESHOLD_PCT,
  ABS_EPSILON_TRY,
} as const
