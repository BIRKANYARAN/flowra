// ─────────────────────────────────────────────────────────────────────────────
// lib/services/finance/income-statement.service.ts
//
// Formal Income Statement (Gelir Tablosu) — Turkish MSUGT-aligned multi-period
// P&L with comparison periods.
//
// Structure (Revenue → COGS → Gross Profit → OpEx → EBITDA → Net Income):
//   Net Satışlar (Revenue)
//   − Satılan Malın Maliyeti (COGS)
//   = Brüt Kâr (Gross Profit)
//   − Faaliyet Giderleri (Operating Expenses)
//   = FVÖK / EBITDA
//   − Finansman Giderleri (Interest Expense)
//   = Vergi Öncesi Kâr (EBT)
//   − Vergi Karşılığı (Tax Provision)
//   = Net Dönem Kârı (Net Income)
//
// Pure functions exported for testing:
//   computeEbitda            — gross_profit - operating_expenses
//   computeOperatingMargin   — ebitda / revenue × 100 (0 if zero revenue)
//   computeEffectiveTaxRate  — tax / ebt × 100 (0 if ebt ≤ 0)
//   buildIncomeStatementLine — single line with variance
//   classifyVariance         — favorable | unfavorable | neutral
//
// Class: IncomeStatementService
//   getStatement(companyId, periodKey, includePrior?)
//   getAnnualStatement(companyId, year, includePriorYear?)
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { computeCogsFromAllocations, cogsTruncationWarning } from '@/lib/finance/cogs'
import { CORPORATE_TAX_RATE_TR } from '@/lib/services/finance-rules'
import { computeCorporateTax, computeNetIncome } from '@/lib/services/tax.service'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Types ─────────────────────────────────────────────────────────────────────

export interface IncomeStatementLine {
  label:               string
  current_try:         number
  prior_try:           number | null
  change_try:          number | null    // current - prior (null if no prior)
  change_pct:          number | null    // (change / |prior|) × 100; null if prior = 0 or no prior
  variance_direction:  'favorable' | 'unfavorable' | 'neutral'
  is_subtotal:         boolean          // true for Gross Profit, EBITDA, Net Income
  indent_level:        number           // 0 = top level, 1 = indented
}

export interface IncomeStatement {
  period_label:          string        // "Ocak 2025" or "2025 Yılı"
  prior_period_label:    string | null
  revenue:               IncomeStatementLine
  cogs:                  IncomeStatementLine
  gross_profit:          IncomeStatementLine
  operating_expenses:    IncomeStatementLine
  ebitda:                IncomeStatementLine
  interest_expense:      IncomeStatementLine
  ebt:                   IncomeStatementLine
  tax_provision:         IncomeStatementLine
  net_income:            IncomeStatementLine
  gross_margin_pct:      number
  operating_margin_pct:  number
  net_margin_pct:        number
  effective_tax_rate:    number
  // Non-null when a COGS source hit its row cap → figures may understate cost. UI shows a banner.
  data_completeness_warning: string | null
}

// ── Turkish month names ───────────────────────────────────────────────────────

const MONTH_NAMES: Record<string, string> = {
  '01': 'Ocak',    '02': 'Şubat', '03': 'Mart',
  '04': 'Nisan',   '05': 'Mayıs', '06': 'Haziran',
  '07': 'Temmuz',  '08': 'Ağustos', '09': 'Eylül',
  '10': 'Ekim',    '11': 'Kasım',   '12': 'Aralık',
}

// ── Helper ────────────────────────────────────────────────────────────────────

/**
 * Return { start: 'YYYY-MM-01', end: 'YYYY-MM-DD' } for a given periodKey.
 */
export function periodKeyToDateRange(periodKey: string): { start: string; end: string } {
  const [y, m] = periodKey.split('-').map(Number)
  const lastDay = new Date(y, m, 0).getDate()
  return {
    start: `${periodKey}-01`,
    end:   `${periodKey}-${String(lastDay).padStart(2, '0')}`,
  }
}

/** Subtract one month from a periodKey ("2025-01" → "2024-12"). */
function priorMonth(periodKey: string): string {
  const [y, m] = periodKey.split('-').map(Number)
  if (m === 1) return `${y - 1}-12`
  return `${y}-${String(m - 1).padStart(2, '0')}`
}

/** Format a monthly periodKey to a Turkish label ("2025-01" → "Ocak 2025"). */
function periodLabel(periodKey: string): string {
  const [year, month] = periodKey.split('-')
  return `${MONTH_NAMES[month] ?? month} ${year}`
}

// ── Financing expense types to EXCLUDE from operating expenses ────────────────
const FINANCING_TYPES = new Set([
  'partner_financing',
  'loan_repayment',
  'dividend',
  'internal_transfer',
])

// ── Pure exported functions ───────────────────────────────────────────────────

/**
 * Compute EBITDA = gross_profit − operating_expenses.
 */
export function computeEbitda(grossProfit: number, opex: number): number {
  return grossProfit - opex
}

/**
 * Compute operating margin = ebitda / revenue × 100.
 * Returns 0 when revenue = 0 to avoid division-by-zero.
 */
export function computeOperatingMargin(ebitda: number, revenue: number): number {
  if (revenue === 0) return 0
  return (ebitda / revenue) * 100
}

/**
 * Compute effective tax rate = tax / ebt × 100.
 * Returns 0 when ebt ≤ 0 (no tax on losses).
 */
export function computeEffectiveTaxRate(tax: number, ebt: number): number {
  if (ebt <= 0) return 0
  return (tax / ebt) * 100
}

/**
 * Corporate tax provision on EBT: the system-wide rate × EBT when positive,
 * else 0 (no tax on losses). Uses CORPORATE_TAX_RATE_TR (25%) — previously this
 * was hardcoded to 20% inline, understating the formal P&L's tax by 5pp of EBT.
 */
export function computeTaxProvision(ebt: number): number {
  // P&L operational tax provision: base = EBT (the formal income statement view).
  // Rate + loss floor + rounding flow through the single kernel (computeCorporateTax).
  // The Vergi/Kurumlar tab's statutory KV uses the canonical real-COGS matrah; this
  // EBT-based provision is the operational estimate. (DP-1: single kernel.)
  return computeCorporateTax({
    revenue_try:             ebt,
    cost_try:                0,
    deductible_expenses_try: 0,
    rate_percent:            CORPORATE_TAX_RATE_TR,
  }).tax_try
}

/**
 * Classify variance direction.
 *
 * Revenue lines (revenue, gross_profit, ebitda, net_income):
 *   increase (change > 0) → favorable
 *   decrease (change < 0) → unfavorable
 *
 * Cost lines (cogs, opex, tax):
 *   increase (change > 0) → unfavorable
 *   decrease (change < 0) → favorable
 *
 * change = 0 → neutral
 */
export function classifyVariance(
  change: number,
  isRevenueLine: boolean,
): 'favorable' | 'unfavorable' | 'neutral' {
  if (change === 0) return 'neutral'
  if (isRevenueLine) {
    return change > 0 ? 'favorable' : 'unfavorable'
  } else {
    return change > 0 ? 'unfavorable' : 'favorable'
  }
}

/**
 * Build a single income statement line with variance computations.
 *
 * - change_try:  current - prior (null when no prior)
 * - change_pct:  (change / |prior|) × 100; null when prior = 0 or no prior
 * - variance_direction: derived via classifyVariance
 */
export function buildIncomeStatementLine(
  label: string,
  currentPeriod: number,
  priorPeriod: number | null,
  isRevenueLine = true,
  isSubtotal = false,
  indentLevel = 0,
): IncomeStatementLine {
  const change_try = priorPeriod !== null ? currentPeriod - priorPeriod : null
  const change_pct =
    change_try !== null && priorPeriod !== null && priorPeriod !== 0
      ? (change_try / Math.abs(priorPeriod)) * 100
      : null

  const variance_direction =
    change_try !== null
      ? classifyVariance(change_try, isRevenueLine)
      : 'neutral'

  return {
    label,
    current_try:        currentPeriod,
    prior_try:          priorPeriod,
    change_try,
    change_pct,
    variance_direction,
    is_subtotal:        isSubtotal,
    indent_level:       indentLevel,
  }
}

// ── Aggregated raw data from DB ───────────────────────────────────────────────

interface PeriodData {
  revenue:           number
  cogs:              number
  operating_expenses: number
  interest_expense:  number
  data_completeness_warning: string | null
}

// ── Main service class ────────────────────────────────────────────────────────

export class IncomeStatementService {
  private supabase: AnyClient

  constructor(supabase: AnyClient) {
    this.supabase = supabase
  }

  /**
   * Fetch and aggregate raw P&L data for a date range.
   */
  private async fetchPeriodData(
    companyId: string,
    fromDate: string,
    toDate: string,
  ): Promise<PeriodData> {
    // ── 1. Revenue: sum sales.total_try in period ─────────────────────────
    const salesQ = this.supabase
      .from('sales')
      .select('total_try')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gte('sale_date', fromDate)
      .lte('sale_date', toDate)
      .not('payment_status', 'eq', 'cancelled')

    // ── 2. COGS: via sale_item_allocations ────────────────────────────────
    const saleIdsQ = this.supabase
      .from('sales')
      .select('id')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gte('sale_date', fromDate)
      .lte('sale_date', toDate)
      .not('payment_status', 'eq', 'cancelled')
      .limit(5000)

    // ── 3. Expenses: all expense types in period ──────────────────────────
    const expQ = this.supabase
      .from('expenses')
      .select('amount_try, expense_type')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gte('expense_date', fromDate)
      .lte('expense_date', toDate)

    const [salesRes, saleIdsRes, expRes] = await Promise.all([salesQ, saleIdsQ, expQ])

    // Revenue
    const revenue = (salesRes.data ?? []).reduce(
      (s: number, r: { total_try: number }) => s + Number(r.total_try ?? 0),
      0,
    )

    // COGS via sale_item_allocations
    let cogs = 0
    const saleIds = (saleIdsRes.data ?? []).map((r: { id: string }) => r.id)
    let saleItemCount = 0
    let allocCount = 0
    if (saleIds.length > 0) {
      const saleItemsRes = await this.supabase
        .from('sale_items')
        .select('id, sale_id')
        .eq('company_id', companyId)
        .in('sale_id', saleIds)
        .limit(10000)

      const saleItemIds = (saleItemsRes.data ?? []).map((si: { id: string }) => si.id)
      saleItemCount = saleItemIds.length
      if (saleItemIds.length > 0) {
        const allocRes = await this.supabase
          .from('sale_item_allocations')
          .select('qty_allocated, cost_price_try, stock_lots(cost_price_try)')
          .eq('company_id', companyId)
          .in('sale_item_id', saleItemIds)
          .limit(20000)

        allocCount = (allocRes.data ?? []).length
        // Same COGS cost-fallback as getCfoMetrics — uses the shared tested kernel.
        cogs = computeCogsFromAllocations(allocRes.data ?? [])
      }
    }

    // No-silent-truncation: warn (don't fail) if any COGS step hit its row cap.
    const truncWarn = cogsTruncationWarning('income-statement', [
      { name: 'sales',       count: saleIds.length, cap: 5000 },
      { name: 'sale_items',  count: saleItemCount,  cap: 10000 },
      { name: 'allocations', count: allocCount,     cap: 20000 },
    ])
    if (truncWarn) console.warn(truncWarn)
    // Surface the truncation to the UI (additive; null in the normal, non-capped path)
    // so COGS understatement → profit/tax overstatement is never silent on screen.

    // Expenses: split into operating vs interest
    let operatingExpenses = 0
    let interestExpense   = 0

    for (const row of (expRes.data ?? [])) {
      const t      = String(row.expense_type ?? '')
      const amount = Number(row.amount_try ?? 0)
      if (FINANCING_TYPES.has(t)) continue
      if (t === 'partner_loan_interest') {
        interestExpense += amount
      } else {
        operatingExpenses += amount
      }
    }

    return { revenue, cogs, operating_expenses: operatingExpenses, interest_expense: interestExpense, data_completeness_warning: truncWarn ?? null }
  }

  /**
   * Build an IncomeStatement from current and optional prior PeriodData.
   */
  private buildStatement(
    periodLbl: string,
    priorPeriodLbl: string | null,
    cur: PeriodData,
    pri: PeriodData | null,
  ): IncomeStatement {
    const rev   = cur.revenue
    const cogs  = cur.cogs
    const gp    = rev - cogs
    const opex  = cur.operating_expenses
    const ebitda = computeEbitda(gp, opex)
    const intEx  = cur.interest_expense
    // DP-2: net income via the single kernel. The formal P&L's tax provision is the
    // OPERATIONAL estimate (tax on EBT), so deductible = opex + interest makes
    // matrah == EBT — numerically identical to the prior EBT-based provision. (The
    // statutory matrah-based KV lives on the Vergi tab; unifying this provision to
    // matrah is DP-2b.) Net income subtracts all operating expenses + interest.
    const ni = computeNetIncome({
      revenue_try:             rev,
      cogs_try:                cogs,
      operating_expenses_try:  opex,
      interest_expense_try:    intEx,
      deductible_expenses_try: opex + intEx,
      rate_percent:            CORPORATE_TAX_RATE_TR,
    })
    const ebt       = ni.ebt_try
    const taxProv   = ni.corporate_tax_try
    const netIncome = ni.net_income_try

    // Prior values (null when no prior)
    const pRev    = pri?.revenue             ?? null
    const pCogs   = pri?.cogs                ?? null
    const pGp     = pri !== null ? (pri.revenue - pri.cogs) : null
    const pOpex   = pri?.operating_expenses  ?? null
    const pEbitda = pri !== null && pGp !== null && pOpex !== null
      ? computeEbitda(pGp, pOpex)
      : null
    const pIntEx  = pri?.interest_expense    ?? null
    // Prior period net income via the same single kernel (EBT-based provision).
    const pNi     = pri !== null
      ? computeNetIncome({
          revenue_try:             pri.revenue,
          cogs_try:                pri.cogs,
          operating_expenses_try:  pri.operating_expenses,
          interest_expense_try:    pri.interest_expense,
          deductible_expenses_try: pri.operating_expenses + pri.interest_expense,
          rate_percent:            CORPORATE_TAX_RATE_TR,
        })
      : null
    const pEbt    = pNi?.ebt_try           ?? null
    const pTax    = pNi?.corporate_tax_try ?? null
    const pNet    = pNi?.net_income_try    ?? null

    // Margins
    const grossMarginPct     = rev > 0 ? (gp / rev) * 100 : 0
    const operatingMarginPct = computeOperatingMargin(ebitda, rev)
    const netMarginPct       = rev > 0 ? (netIncome / rev) * 100 : 0
    const effectiveTaxRate   = computeEffectiveTaxRate(taxProv, ebt)

    return {
      period_label:       periodLbl,
      prior_period_label: priorPeriodLbl,

      revenue:            buildIncomeStatementLine('Brüt Satış (KDV dâhil)',          rev,      pRev,    true,  false, 0),
      cogs:               buildIncomeStatementLine('Satılan Malın Maliyeti (COGS)',   cogs,     pCogs,   false, false, 1),
      gross_profit:       buildIncomeStatementLine('Brüt Kâr',                       gp,       pGp,     true,  true,  0),
      operating_expenses: buildIncomeStatementLine('Faaliyet Giderleri',             opex,     pOpex,   false, false, 1),
      ebitda:             buildIncomeStatementLine('FVÖK (EBITDA)',                  ebitda,   pEbitda, true,  true,  0),
      interest_expense:   buildIncomeStatementLine('Finansman Giderleri',            intEx,    pIntEx,  false, false, 1),
      ebt:                buildIncomeStatementLine('Vergi Öncesi Kâr',               ebt,      pEbt,    true,  false, 0),
      tax_provision:      buildIncomeStatementLine('Vergi Karşılığı',                taxProv,  pTax,    false, false, 1),
      net_income:         buildIncomeStatementLine('Net Dönem Kârı',                 netIncome, pNet,   true,  true,  0),

      gross_margin_pct:     grossMarginPct,
      operating_margin_pct: operatingMarginPct,
      net_margin_pct:       netMarginPct,
      effective_tax_rate:   effectiveTaxRate,
      data_completeness_warning: cur.data_completeness_warning ?? null,
    }
  }

  /**
   * Get income statement for a single month.
   * periodKey: "YYYY-MM" format.
   * If includePrior = true, also fetches the prior month for comparison.
   */
  async getStatement(
    companyId: string,
    periodKey: string,
    includePrior = false,
  ): Promise<IncomeStatement> {
    const { start, end } = periodKeyToDateRange(periodKey)
    const lbl = periodLabel(periodKey)

    let priorLbl: string | null = null
    let priorData: PeriodData | null = null

    if (includePrior) {
      const priorKey = priorMonth(periodKey)
      const { start: pStart, end: pEnd } = periodKeyToDateRange(priorKey)
      priorLbl = periodLabel(priorKey)
      const [curData, priData] = await Promise.all([
        this.fetchPeriodData(companyId, start, end),
        this.fetchPeriodData(companyId, pStart, pEnd),
      ])
      return this.buildStatement(lbl, priorLbl, curData, priData)
    }

    const curData = await this.fetchPeriodData(companyId, start, end)
    return this.buildStatement(lbl, priorLbl, curData, priorData)
  }

  /**
   * Get annual income statement by aggregating all months in the year.
   * If includePriorYear = true, also aggregates the prior year.
   */
  async getAnnualStatement(
    companyId: string,
    year: number,
    includePriorYear = false,
  ): Promise<IncomeStatement> {
    const yearStart = `${year}-01-01`
    const yearEnd   = `${year}-12-31`
    const lbl       = `${year} Yılı`

    let priorLbl: string | null = null
    let priorData: PeriodData | null = null

    if (includePriorYear) {
      const priorYearStart = `${year - 1}-01-01`
      const priorYearEnd   = `${year - 1}-12-31`
      priorLbl = `${year - 1} Yılı`
      const [curData, priData] = await Promise.all([
        this.fetchPeriodData(companyId, yearStart, yearEnd),
        this.fetchPeriodData(companyId, priorYearStart, priorYearEnd),
      ])
      return this.buildStatement(lbl, priorLbl, curData, priData)
    }

    const curData = await this.fetchPeriodData(companyId, yearStart, yearEnd)
    return this.buildStatement(lbl, priorLbl, curData, priorData)
  }
}
