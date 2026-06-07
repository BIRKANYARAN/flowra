// ─────────────────────────────────────────────────────────────────────────────
// lib/services/intelligence/financial-health-score.service.ts
//
// Financial Health Score — Altman Z"-Score Adapted for Turkish SMEs
//
// Implements the 4-factor Altman Z"-Score model for private companies:
//   Z" = 6.56*X1 + 3.26*X2 + 6.72*X3 + 1.05*X4
//
// Thresholds (private company):
//   Safe:     Z" ≥ 2.6
//   Grey:     1.1 ≤ Z" < 2.6
//   Distress: Z" < 1.1
//
// All pure functions are exported for testability.
// FinancialHealthScoreService class handles DB orchestration.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { BurnRateService }    from '@/lib/services/finance/burn-rate.service'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Pure Altman Component Functions ──────────────────────────────────────────

/**
 * X1 = Working Capital / Total Assets
 * Working Capital = Current Assets - Current Liabilities
 */
export function computeX1WorkingCapital(
  currentAssets: number,
  currentLiabilities: number,
  totalAssets: number,
): number | null {
  if (totalAssets === 0) return null
  return (currentAssets - currentLiabilities) / totalAssets
}

/**
 * X2 = Retained Earnings / Total Assets
 */
export function computeX2RetainedEarnings(
  retainedEarnings: number,
  totalAssets: number,
): number | null {
  if (totalAssets === 0) return null
  return retainedEarnings / totalAssets
}

/**
 * X3 = EBIT / Total Assets
 */
export function computeX3Ebit(
  ebit: number,
  totalAssets: number,
): number | null {
  if (totalAssets === 0) return null
  return ebit / totalAssets
}

/**
 * X4 = Book Value of Equity / Total Liabilities
 * If totalLiabilities === 0 (debt-free), return 10.0 (capped maximum).
 */
export function computeX4EquityToDebt(
  bookValueEquity: number,
  totalLiabilities: number,
): number | null {
  if (totalLiabilities === 0) return 10.0
  return bookValueEquity / totalLiabilities
}

/**
 * Z" = 6.56*X1 + 3.26*X2 + 6.72*X3 + 1.05*X4
 * Returns null if any input is null.
 */
export function computeAltmanZPrime(
  x1: number | null,
  x2: number | null,
  x3: number | null,
  x4: number | null,
): number | null {
  if (x1 === null || x2 === null || x3 === null || x4 === null) return null
  return 6.56 * x1 + 3.26 * x2 + 6.72 * x3 + 1.05 * x4
}

/**
 * Classify Altman Z"-Score zone.
 * safe:             z ≥ 2.6
 * grey:             1.1 ≤ z < 2.6
 * distress:         z < 1.1
 * insufficient_data: null
 */
export function classifyAltmanZone(
  zScore: number | null,
): 'safe' | 'grey' | 'distress' | 'insufficient_data' {
  if (zScore === null) return 'insufficient_data'
  if (zScore >= 2.6) return 'safe'
  if (zScore >= 1.1) return 'grey'
  return 'distress'
}

/**
 * Convert Z"-Score to 0-100 percentile for display.
 * percentile = 100 / (1 + exp(-1.5 * (zScore - 1.85)))
 * Clamped to [0, 100].
 */
export function computeAltmanPercentile(
  zScore: number | null,
): number | null {
  if (zScore === null) return null
  const raw = 100 / (1 + Math.exp(-1.5 * (zScore - 1.85)))
  return Math.min(100, Math.max(0, raw))
}

/**
 * Weighted composite health score (0-100):
 *   altman    × 0.40
 *   margin    × 0.25
 *   liquidity × 0.20
 *   runway    × 0.15
 *
 * Null inputs default to 50 (neutral).
 * Result rounded to 1 decimal.
 */
export function computeFlowraHealthScore(
  altmanZ: number | null,
  grossMarginPct: number | null,
  currentRatio: number | null,
  runwayMonths: number | null,
): number {
  // Altman component
  let altmanComponent: number
  if (altmanZ === null) {
    altmanComponent = 50 * 0.40
  } else {
    const pct = computeAltmanPercentile(altmanZ)!
    altmanComponent = Math.min(100, Math.max(0, pct)) * 0.40
  }

  // Margin component: grossMarginPct × 2 → 0-100 (50% margin = 100)
  let marginComponent: number
  if (grossMarginPct === null) {
    marginComponent = 50 * 0.25
  } else {
    marginComponent = Math.min(100, Math.max(0, grossMarginPct * 2)) * 0.25
  }

  // Liquidity component: currentRatio × 33 → 0-100 (3× ratio = 99)
  let liquidityComponent: number
  if (currentRatio === null) {
    liquidityComponent = 50 * 0.20
  } else {
    liquidityComponent = Math.min(100, Math.max(0, currentRatio * 33)) * 0.20
  }

  // Runway component: runwayMonths × 100/12 → 0-100 (12 months = 100)
  let runwayComponent: number
  if (runwayMonths === null) {
    runwayComponent = 50 * 0.15
  } else {
    runwayComponent = Math.min(100, Math.max(0, runwayMonths * 100 / 12)) * 0.15
  }

  const total = altmanComponent + marginComponent + liquidityComponent + runwayComponent
  return Math.round(total * 10) / 10
}

/**
 * Classify Flowra Health Score (0-100) into health tier.
 * excellent: ≥ 80
 * strong:    ≥ 65
 * adequate:  ≥ 50
 * weak:      ≥ 35
 * critical:  < 35
 */
export function classifyFlowraHealth(
  score: number,
): 'excellent' | 'strong' | 'adequate' | 'weak' | 'critical' {
  if (score >= 80) return 'excellent'
  if (score >= 65) return 'strong'
  if (score >= 50) return 'adequate'
  if (score >= 35) return 'weak'
  return 'critical'
}

/**
 * Compute Turkish risk indicator strings.
 * Returns an array of fired indicator labels.
 */
export function computeKeyRiskIndicators(
  x1: number | null,
  x2: number | null,
  x3: number | null,
  x4: number | null,
  runwayMonths: number | null,
): string[] {
  const indicators: string[] = []

  if (x1 !== null && x1 < 0)     indicators.push('Negatif işletme sermayesi')
  if (x2 !== null && x2 < 0)     indicators.push('Birikmiş zarar mevcut')
  if (x3 !== null && x3 < 0)     indicators.push('Negatif faaliyet kârı (EBIT)')
  if (x4 !== null && x4 < 0.5)   indicators.push('Yüksek finansal kaldıraç riski')

  if (runwayMonths !== null && runwayMonths < 3) {
    indicators.push('Kritik nakit akışı — 3 aydan az')
  } else if (runwayMonths !== null && runwayMonths < 6) {
    indicators.push('Nakit rezervi azalıyor')
  }

  return indicators
}

// ── Report Interface ──────────────────────────────────────────────────────────

export interface FinancialHealthReport {
  altman: {
    z_score: number | null
    zone: ReturnType<typeof classifyAltmanZone>
    percentile: number | null
    components: {
      x1_working_capital: number | null
      x2_retained_earnings: number | null
      x3_ebit: number | null
      x4_equity_to_debt: number | null
    }
  }
  flowra_score: number
  health_class: ReturnType<typeof classifyFlowraHealth>
  key_risk_indicators: string[]
  inputs: {
    total_assets: number
    total_liabilities: number
    current_assets: number
    current_liabilities: number
    retained_earnings: number
    ebit: number
    gross_margin_pct: number | null
    current_ratio: number | null
    runway_months: number | null
  }
}

// ── Service ───────────────────────────────────────────────────────────────────

export class FinancialHealthScoreService {
  constructor(private readonly supabase: AnyClient) {}

  async getReport(companyId: string): Promise<FinancialHealthReport> {
    const now       = new Date()
    const today     = now.toISOString().slice(0, 10)
    const yearStart = `${now.getFullYear()}-01-01`

    // ── 1. Fire all queries in parallel ─────────────────────────────────────────
    const [
      balanceSheetRes,
      salesYtdRes,
      expensesYtdRes,
      partnerLoansRes,
      stockLotsRes,
      burnReportRes,
    ] = await Promise.allSettled([
      // Balance sheet snapshot (latest)
      this.supabase
        .from('balance_sheet_snapshots')
        .select('total_assets_try, total_liabilities_try, current_assets_try, current_liabilities_try, retained_earnings_try')
        .eq('company_id', companyId)
        .order('snapshot_date', { ascending: false })
        .limit(1)
        .maybeSingle(),

      // YTD sales with item costs for gross margin + EBIT
      this.supabase
        .from('sales')
        .select('total_try, cost_of_goods_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .not('payment_status', 'eq', 'cancelled')
        .gte('sale_date', yearStart)
        .lte('sale_date', today),

      // YTD operating expenses
      this.supabase
        .from('expenses')
        .select('amount_try, expense_type')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('expense_date', yearStart)
        .lte('expense_date', today),

      // Outstanding partner loans (liabilities)
      this.supabase
        .from('partner_loan_tranches')
        .select('principal_try, total_repaid_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .in('status', ['active', 'partially_repaid', 'overdue']),

      // Stock lots for asset estimation
      this.supabase
        .from('stock_lots')
        .select('qty_remaining, cost_price_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gt('qty_remaining', 0),

      // Burn rate + runway
      BurnRateService.getReport(companyId, this.supabase, now),
    ])

    // ── 2. Parse results ─────────────────────────────────────────────────────────

    // Balance sheet snapshot
    type BSRow = {
      total_assets_try?: number | null
      total_liabilities_try?: number | null
      current_assets_try?: number | null
      current_liabilities_try?: number | null
      retained_earnings_try?: number | null
    }
    const bsRow: BSRow | null =
      balanceSheetRes.status === 'fulfilled' ? (balanceSheetRes.value.data as BSRow | null) : null

    // YTD sales
    type SaleRow = { total_try?: number | null; cost_of_goods_try?: number | null }
    const salesRows: SaleRow[] =
      salesYtdRes.status === 'fulfilled' ? (salesYtdRes.value.data ?? []) : []

    const revenueYtd = salesRows.reduce((s, r) => s + Number(r.total_try ?? 0), 0)
    const cogsYtd    = salesRows.reduce((s, r) => s + Number(r.cost_of_goods_try ?? 0), 0)

    // YTD expenses (opex only — exclude financing/tax)
    const NON_OPEX = new Set([
      'partner_financing', 'loan_repayment', 'dividend',
      'internal_transfer', 'partner_loan_interest', 'tax',
    ])
    type ExpRow = { amount_try?: number | null; expense_type?: string | null }
    const expRows: ExpRow[] =
      expensesYtdRes.status === 'fulfilled' ? (expensesYtdRes.value.data ?? []) : []

    let opexYtd = 0
    for (const r of expRows) {
      if (NON_OPEX.has(String(r.expense_type ?? ''))) continue
      opexYtd += Number(r.amount_try ?? 0)
    }

    // Partner loans
    type LoanRow = { principal_try?: number | null; total_repaid_try?: number | null }
    const loanRows: LoanRow[] =
      partnerLoansRes.status === 'fulfilled' ? (partnerLoansRes.value.data ?? []) : []
    const partnerLoanBalance = loanRows.reduce((s, r) =>
      s + Math.max(0, Number(r.principal_try ?? 0) - Number(r.total_repaid_try ?? 0)), 0)

    // Stock lots
    type StockRow = { qty_remaining?: number | null; cost_price_try?: number | null }
    const stockRows: StockRow[] =
      stockLotsRes.status === 'fulfilled' ? (stockLotsRes.value.data ?? []) : []
    const inventoryValue = stockRows.reduce((s, r) =>
      s + Number(r.qty_remaining ?? 0) * Number(r.cost_price_try ?? 0), 0)

    // Burn rate / runway
    const burnData = burnReportRes.status === 'fulfilled' ? burnReportRes.value : null
    const runwayMonths = burnData?.runway_estimate_months ?? null

    // ── 3. Derive balance sheet values ───────────────────────────────────────────
    // Prefer balance sheet snapshot; fall back to estimates from transactional data.

    const grossProfit = revenueYtd - cogsYtd
    const ebit        = grossProfit - opexYtd

    let totalAssets:       number
    let totalLiabilities:  number
    let currentAssets:     number
    let currentLiabilities: number
    let retainedEarnings:  number

    if (bsRow && bsRow.total_assets_try != null) {
      // Use snapshot values
      totalAssets        = Number(bsRow.total_assets_try       ?? 0)
      totalLiabilities   = Number(bsRow.total_liabilities_try  ?? 0)
      currentAssets      = Number(bsRow.current_assets_try     ?? 0)
      currentLiabilities = Number(bsRow.current_liabilities_try ?? 0)
      retainedEarnings   = Number(bsRow.retained_earnings_try  ?? ebit)
    } else {
      // Estimate from transactional data
      // Current assets: receivables (unpaid sales) + inventory
      const [receivablesRes] = await Promise.allSettled([
        this.supabase
          .from('sales')
          .select('total_try, paid_amount')
          .eq('company_id', companyId)
          .is('deleted_at', null)
          .in('payment_status', ['pending', 'partial', 'overdue'])
          .not('payment_status', 'eq', 'cancelled'),
      ])

      type RecRow = { total_try?: number | null; paid_amount?: number | null }
      const recRows: RecRow[] =
        receivablesRes.status === 'fulfilled' ? (receivablesRes.value.data ?? []) : []
      const receivables = recRows.reduce((s, r) =>
        s + Math.max(0, Number(r.total_try ?? 0) - Number(r.paid_amount ?? 0)), 0)

      currentAssets      = receivables + inventoryValue
      currentLiabilities = partnerLoanBalance  // outstanding loan balance as proxy
      totalLiabilities   = partnerLoanBalance
      retainedEarnings   = ebit                 // YTD net income as proxy
      // Total assets: current assets + estimated fixed assets (use revenue × 0.5 as rough proxy)
      totalAssets = Math.max(currentAssets + inventoryValue, currentAssets * 1.2)
      if (totalAssets === 0) totalAssets = revenueYtd * 0.3   // last-resort estimate
    }

    // ── 4. Compute Altman components ─────────────────────────────────────────────
    const bookValueEquity = totalAssets - totalLiabilities

    const x1 = computeX1WorkingCapital(currentAssets, currentLiabilities, totalAssets)
    const x2 = computeX2RetainedEarnings(retainedEarnings, totalAssets)
    const x3 = computeX3Ebit(ebit, totalAssets)
    const x4 = computeX4EquityToDebt(bookValueEquity, totalLiabilities)

    const zScore    = computeAltmanZPrime(x1, x2, x3, x4)
    const zone      = classifyAltmanZone(zScore)
    const percentile = computeAltmanPercentile(zScore)

    // ── 5. Flowra composite score ─────────────────────────────────────────────────
    const grossMarginPct = revenueYtd > 0 ? ((revenueYtd - cogsYtd) / revenueYtd) * 100 : null
    const currentRatio   = currentLiabilities > 0
      ? currentAssets / currentLiabilities
      : (currentAssets > 0 ? null : null)

    const flowraScore   = computeFlowraHealthScore(zScore, grossMarginPct, currentRatio, runwayMonths)
    const healthClass   = classifyFlowraHealth(flowraScore)
    const riskIndicators = computeKeyRiskIndicators(x1, x2, x3, x4, runwayMonths)

    return {
      altman: {
        z_score:    zScore,
        zone,
        percentile,
        components: {
          x1_working_capital:   x1,
          x2_retained_earnings: x2,
          x3_ebit:              x3,
          x4_equity_to_debt:    x4,
        },
      },
      flowra_score:          flowraScore,
      health_class:          healthClass,
      key_risk_indicators:   riskIndicators,
      inputs: {
        total_assets:        totalAssets,
        total_liabilities:   totalLiabilities,
        current_assets:      currentAssets,
        current_liabilities: currentLiabilities,
        retained_earnings:   retainedEarnings,
        ebit,
        gross_margin_pct:    grossMarginPct,
        current_ratio:       currentRatio,
        runway_months:       runwayMonths,
      },
    }
  }
}
