// ─────────────────────────────────────────────────────────────────────────────
// lib/services/finance/balance-ratios.service.ts
//
// Balance Sheet Ratio Analysis — Liquidity, Solvency, Efficiency
//
// Pure exported functions organized into 3 categories:
//   1. Liquidity  — current, quick, cash ratios + health classifier
//   2. Solvency   — D/E, D/A, equity multiplier, interest coverage + classifier
//   3. Efficiency — asset turnover, receivables/payables turnover, NPM, ROA, ROE
//
// Plus a composite BalanceSheetHealthScore (0-100) and a BalanceRatiosService
// class that fetches DB data and returns a full report.
//
// Turkish SME context:
//   Current ratio benchmark: 1.5-2.0 is healthy.
//   Debt-to-equity < 1.5 is acceptable; < 0.5 is strong.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ═══════════════════════════════════════════════════════════════════════════════
// LIQUIDITY RATIOS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Current Ratio = currentAssets / currentLiabilities
 * Turkish SME benchmark: 1.5-2.0 is healthy.
 * Returns null if currentLiabilities === 0.
 */
export function computeCurrentRatio(
  currentAssets: number,
  currentLiabilities: number,
): number | null {
  if (currentLiabilities === 0) return null
  return currentAssets / currentLiabilities
}

/**
 * Quick Ratio = (currentAssets - inventory) / currentLiabilities
 * Excludes inventory (less liquid). Returns null if currentLiabilities === 0.
 */
export function computeQuickRatio(
  currentAssets: number,
  inventory: number,
  currentLiabilities: number,
): number | null {
  if (currentLiabilities === 0) return null
  return (currentAssets - inventory) / currentLiabilities
}

/**
 * Cash Ratio = cash / currentLiabilities
 * Most conservative liquidity measure.
 * Returns null if currentLiabilities === 0.
 */
export function computeCashRatio(
  cash: number,
  currentLiabilities: number,
): number | null {
  if (currentLiabilities === 0) return null
  return cash / currentLiabilities
}

/**
 * Classify liquidity health from current ratio.
 *   insufficient_data: null
 *   strong:   >= 2.0
 *   adequate: >= 1.5
 *   tight:    >= 1.0
 *   critical: < 1.0
 */
export function classifyLiquidityHealth(
  currentRatio: number | null,
): 'strong' | 'adequate' | 'tight' | 'critical' | 'insufficient_data' {
  if (currentRatio === null) return 'insufficient_data'
  if (currentRatio >= 2.0)  return 'strong'
  if (currentRatio >= 1.5)  return 'adequate'
  if (currentRatio >= 1.0)  return 'tight'
  return 'critical'
}

// ═══════════════════════════════════════════════════════════════════════════════
// SOLVENCY RATIOS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Debt-to-Equity = totalLiabilities / totalEquity
 * Returns null if totalEquity === 0.
 * Can be negative if equity is negative (distressed).
 */
export function computeDebtToEquityRatio(
  totalLiabilities: number,
  totalEquity: number,
): number | null {
  if (totalEquity === 0) return null
  return totalLiabilities / totalEquity
}

/**
 * Debt-to-Assets = totalLiabilities / totalAssets
 * Range 0-1+. > 1 means insolvent.
 * Returns null if totalAssets === 0.
 */
export function computeDebtToAssetsRatio(
  totalLiabilities: number,
  totalAssets: number,
): number | null {
  if (totalAssets === 0) return null
  return totalLiabilities / totalAssets
}

/**
 * Equity Multiplier = totalAssets / totalEquity
 * Financial leverage measure. Returns null if totalEquity === 0.
 */
export function computeEquityMultiplier(
  totalAssets: number,
  totalEquity: number,
): number | null {
  if (totalEquity === 0) return null
  return totalAssets / totalEquity
}

/**
 * Interest Coverage Ratio = ebit / interestExpense
 * > 1.5 acceptable; > 3.0 comfortable; < 1 = cannot service debt.
 * Returns null if interestExpense === 0.
 */
export function computeInterestCoverageRatio(
  ebit: number,
  interestExpense: number,
): number | null {
  if (interestExpense === 0) return null
  return ebit / interestExpense
}

/**
 * Classify solvency health.
 *   insufficient_data: both debtToEquity and interestCoverage are null
 *   distressed:  debtToEquity > 3 OR interestCoverage < 1
 *   leveraged:   debtToEquity > 1.5 OR interestCoverage < 2
 *   adequate:    debtToEquity > 0.5 OR interestCoverage < 4
 *   strong:      else (low leverage, high coverage)
 */
export function classifySolvencyHealth(
  debtToEquity: number | null,
  interestCoverage: number | null,
): 'strong' | 'adequate' | 'leveraged' | 'distressed' | 'insufficient_data' {
  if (debtToEquity === null && interestCoverage === null) return 'insufficient_data'

  if (
    (debtToEquity !== null && debtToEquity > 3) ||
    (interestCoverage !== null && interestCoverage < 1)
  ) return 'distressed'

  if (
    (debtToEquity !== null && debtToEquity > 1.5) ||
    (interestCoverage !== null && interestCoverage < 2)
  ) return 'leveraged'

  if (
    (debtToEquity !== null && debtToEquity > 0.5) ||
    (interestCoverage !== null && interestCoverage < 4)
  ) return 'adequate'

  return 'strong'
}

// ═══════════════════════════════════════════════════════════════════════════════
// EFFICIENCY RATIOS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Asset Turnover = totalRevenue / avgTotalAssets
 * How efficiently assets generate revenue.
 * Returns null if avgTotalAssets === 0.
 */
export function computeAssetTurnover(
  totalRevenue: number,
  avgTotalAssets: number,
): number | null {
  if (avgTotalAssets === 0) return null
  return totalRevenue / avgTotalAssets
}

/**
 * Receivables Turnover = totalRevenue / avgReceivables
 * Returns null if avgReceivables === 0.
 */
export function computeReceivablesTurnover(
  totalRevenue: number,
  avgReceivables: number,
): number | null {
  if (avgReceivables === 0) return null
  return totalRevenue / avgReceivables
}

/**
 * Payables Turnover = totalPurchases / avgPayables
 * totalPurchases: COGS or total purchases.
 * Returns null if avgPayables === 0.
 */
export function computePayablesTurnover(
  totalPurchases: number,
  avgPayables: number,
): number | null {
  if (avgPayables === 0) return null
  return totalPurchases / avgPayables
}

/**
 * Net Profit Margin = (netProfit / totalRevenue) × 100
 * Returns null if totalRevenue === 0.
 */
export function computeNetProfitMargin(
  netProfit: number,
  totalRevenue: number,
): number | null {
  if (totalRevenue === 0) return null
  return (netProfit / totalRevenue) * 100
}

/**
 * Return on Assets = (netProfit / avgTotalAssets) × 100
 * Returns null if avgTotalAssets === 0.
 */
export function computeReturnOnAssets(
  netProfit: number,
  avgTotalAssets: number,
): number | null {
  if (avgTotalAssets === 0) return null
  return (netProfit / avgTotalAssets) * 100
}

/**
 * Return on Equity = (netProfit / avgEquity) × 100
 * Returns null if avgEquity === 0.
 */
export function computeReturnOnEquity(
  netProfit: number,
  avgEquity: number,
): number | null {
  if (avgEquity === 0) return null
  return (netProfit / avgEquity) * 100
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPOSITE HEALTH SCORE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Composite Balance Sheet Health Score (0-100).
 *
 * Weights:
 *   liquidity     × 0.35  — currentRatio: null→50; else min(100, ratio/2×100)
 *   leverage      × 0.30  — debtToEquity: null→50; else max(0, 100 - D/E × 20)
 *   efficiency    × 0.20  — assetTurnover: null→50; else min(100, turnover × 50)
 *   profitability × 0.15  — margin: null→50; else clamp(margin+50, 0, 100)
 *
 * Result rounded to 1 decimal.
 */
export function computeBalanceSheetHealthScore(
  currentRatio: number | null,
  debtToEquity: number | null,
  assetTurnover: number | null,
  netProfitMarginPct: number | null,
): number {
  // Liquidity component
  const liquidityRaw = currentRatio === null
    ? 50
    : Math.min(100, (currentRatio / 2) * 100)
  const liquidityComponent = liquidityRaw * 0.35

  // Leverage component
  const leverageRaw = debtToEquity === null
    ? 50
    : Math.max(0, 100 - debtToEquity * 20)
  const leverageComponent = leverageRaw * 0.30

  // Efficiency component
  const efficiencyRaw = assetTurnover === null
    ? 50
    : Math.min(100, assetTurnover * 50)
  const efficiencyComponent = efficiencyRaw * 0.20

  // Profitability component
  const profitabilityRaw = netProfitMarginPct === null
    ? 50
    : Math.min(100, Math.max(0, netProfitMarginPct + 50))
  const profitabilityComponent = profitabilityRaw * 0.15

  const total = liquidityComponent + leverageComponent + efficiencyComponent + profitabilityComponent
  return Math.round(total * 10) / 10
}

// ═══════════════════════════════════════════════════════════════════════════════
// REPORT INTERFACE
// ═══════════════════════════════════════════════════════════════════════════════

export interface BalanceRatiosReport {
  liquidity: {
    current_ratio:        number | null
    quick_ratio:          number | null
    cash_ratio:           number | null
    health:               ReturnType<typeof classifyLiquidityHealth>
  }
  solvency: {
    debt_to_equity:       number | null
    debt_to_assets:       number | null
    equity_multiplier:    number | null
    interest_coverage:    number | null
    health:               ReturnType<typeof classifySolvencyHealth>
  }
  efficiency: {
    asset_turnover:       number | null
    receivables_turnover: number | null
    payables_turnover:    number | null
    net_profit_margin:    number | null
    return_on_assets:     number | null
    return_on_equity:     number | null
  }
  composite_score:        number
  inputs: {
    total_assets:         number
    total_liabilities:    number
    total_equity:         number
    current_assets:       number
    current_liabilities:  number
    inventory:            number
    cash:                 number
    receivables:          number
    payables:             number
    revenue_ytd:          number
    cogs_ytd:             number
    net_profit_ytd:       number
    interest_expense_ytd: number
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SERVICE CLASS
// ═══════════════════════════════════════════════════════════════════════════════

export class BalanceRatiosService {
  constructor(private readonly supabase: AnyClient) {}

  async getReport(companyId: string): Promise<BalanceRatiosReport> {
    const now       = new Date()
    const today     = now.toISOString().slice(0, 10)
    const yearStart = `${now.getFullYear()}-01-01`

    // ── Fire all queries in parallel ─────────────────────────────────────────

    const [
      balanceSheetRes,
      salesYtdRes,
      expensesYtdRes,
      partnerLoansRes,
      stockLotsRes,
      payablesRes,
    ] = await Promise.allSettled([
      // Balance sheet snapshot (latest)
      this.supabase
        .from('balance_sheet_snapshots')
        .select('total_assets_try, total_liabilities_try, current_assets_try, current_liabilities_try, retained_earnings_try')
        .eq('company_id', companyId)
        .order('snapshot_date', { ascending: false })
        .limit(1)
        .maybeSingle(),

      // YTD sales
      this.supabase
        .from('sales')
        .select('total_try, cost_of_goods_try, paid_amount')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .not('payment_status', 'eq', 'cancelled')
        .gte('sale_date', yearStart)
        .lte('sale_date', today),

      // YTD expenses
      this.supabase
        .from('expenses')
        .select('amount_try, expense_type')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('expense_date', yearStart)
        .lte('expense_date', today),

      // Outstanding partner loans (for interest expense estimation)
      this.supabase
        .from('partner_loan_tranches')
        .select('principal_try, total_repaid_try, interest_rate_annual_pct')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .in('status', ['active', 'partially_repaid', 'overdue']),

      // Stock lots (inventory value)
      this.supabase
        .from('stock_lots')
        .select('qty_remaining, cost_price_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gt('qty_remaining', 0),

      // Outstanding receivables (unpaid sales)
      this.supabase
        .from('sales')
        .select('total_try, paid_amount')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .in('payment_status', ['pending', 'partial', 'overdue'])
        .not('payment_status', 'eq', 'cancelled'),
    ])

    // ── Parse results ─────────────────────────────────────────────────────────

    type BSRow = {
      total_assets_try?:       number | null
      total_liabilities_try?:  number | null
      current_assets_try?:     number | null
      current_liabilities_try?: number | null
      retained_earnings_try?:  number | null
    }
    const bsRow: BSRow | null =
      balanceSheetRes.status === 'fulfilled' ? (balanceSheetRes.value.data as BSRow | null) : null

    type SaleRow = { total_try?: number | null; cost_of_goods_try?: number | null; paid_amount?: number | null }
    const salesRows: SaleRow[] =
      salesYtdRes.status === 'fulfilled' ? (salesYtdRes.value.data ?? []) : []

    const revenueYtd = salesRows.reduce((s, r) => s + Number(r.total_try ?? 0), 0)
    const cogsYtd    = salesRows.reduce((s, r) => s + Number(r.cost_of_goods_try ?? 0), 0)

    // NON-OPEX types (same list as financial-health-score.service)
    const NON_OPEX = new Set([
      'partner_financing', 'loan_repayment', 'dividend',
      'internal_transfer', 'partner_loan_interest', 'tax',
    ])
    type ExpRow = { amount_try?: number | null; expense_type?: string | null }
    const expRows: ExpRow[] =
      expensesYtdRes.status === 'fulfilled' ? (expensesYtdRes.value.data ?? []) : []

    let opexYtd         = 0
    let interestExpYtd  = 0
    for (const r of expRows) {
      const etype = String(r.expense_type ?? '')
      const amt   = Number(r.amount_try ?? 0)
      if (etype === 'partner_loan_interest') {
        interestExpYtd += amt
      } else if (!NON_OPEX.has(etype)) {
        opexYtd += amt
      }
    }

    // Partner loans
    type LoanRow = { principal_try?: number | null; total_repaid_try?: number | null; interest_rate_annual_pct?: number | null }
    const loanRows: LoanRow[] =
      partnerLoansRes.status === 'fulfilled' ? (partnerLoansRes.value.data ?? []) : []

    const partnerLoanBalance = loanRows.reduce((s, r) =>
      s + Math.max(0, Number(r.principal_try ?? 0) - Number(r.total_repaid_try ?? 0)), 0)

    // If no interest expenses recorded, estimate from outstanding loan balances
    if (interestExpYtd === 0 && loanRows.length > 0) {
      for (const r of loanRows) {
        const outstanding   = Math.max(0, Number(r.principal_try ?? 0) - Number(r.total_repaid_try ?? 0))
        const annualRatePct = Number(r.interest_rate_annual_pct ?? 0)
        // Annual interest = outstanding × rate / 100; YTD months proportional
        const monthsElapsed = now.getMonth() + 1  // 1-12
        interestExpYtd += outstanding * (annualRatePct / 100) * (monthsElapsed / 12)
      }
    }

    // Inventory
    type StockRow = { qty_remaining?: number | null; cost_price_try?: number | null }
    const stockRows: StockRow[] =
      stockLotsRes.status === 'fulfilled' ? (stockLotsRes.value.data ?? []) : []
    const inventoryValue = stockRows.reduce((s, r) =>
      s + Number(r.qty_remaining ?? 0) * Number(r.cost_price_try ?? 0), 0)

    // Receivables from payables query
    type RecRow = { total_try?: number | null; paid_amount?: number | null }
    const recRows: RecRow[] =
      payablesRes.status === 'fulfilled' ? (payablesRes.value.data ?? []) : []
    const receivables = recRows.reduce((s, r) =>
      s + Math.max(0, Number(r.total_try ?? 0) - Number(r.paid_amount ?? 0)), 0)

    // ── Derive balance sheet values ───────────────────────────────────────────

    const netProfitYtd = revenueYtd - cogsYtd - opexYtd - interestExpYtd

    let totalAssets:        number
    let totalLiabilities:   number
    let currentAssets:      number
    let currentLiabilities: number

    if (bsRow && bsRow.total_assets_try != null) {
      totalAssets        = Number(bsRow.total_assets_try        ?? 0)
      totalLiabilities   = Number(bsRow.total_liabilities_try   ?? 0)
      currentAssets      = Number(bsRow.current_assets_try      ?? 0)
      currentLiabilities = Number(bsRow.current_liabilities_try ?? 0)
    } else {
      // Estimate from transactional data
      currentAssets      = receivables + inventoryValue
      currentLiabilities = partnerLoanBalance
      totalLiabilities   = partnerLoanBalance
      totalAssets        = Math.max(currentAssets * 1.2, currentAssets + 1)
      if (totalAssets === 0) totalAssets = revenueYtd * 0.3
    }

    const totalEquity = totalAssets - totalLiabilities

    // ── Compute ratios ────────────────────────────────────────────────────────

    const currentRatio     = computeCurrentRatio(currentAssets, currentLiabilities)
    const quickRatio       = computeQuickRatio(currentAssets, inventoryValue, currentLiabilities)
    const cashRatio        = computeCashRatio(0 /* cash not separately tracked here */, currentLiabilities)
    const liquidityHealth  = classifyLiquidityHealth(currentRatio)

    const debtToEquity     = computeDebtToEquityRatio(totalLiabilities, totalEquity)
    const debtToAssets     = computeDebtToAssetsRatio(totalLiabilities, totalAssets)
    const equityMultiplier = computeEquityMultiplier(totalAssets, totalEquity)
    const interestCoverage = computeInterestCoverageRatio(
      revenueYtd - cogsYtd - opexYtd,  // EBIT
      interestExpYtd,
    )
    const solvencyHealth   = classifySolvencyHealth(debtToEquity, interestCoverage)

    const assetTurnover       = computeAssetTurnover(revenueYtd, totalAssets)
    const receivablesTurnover = computeReceivablesTurnover(revenueYtd, receivables)
    const payablesTurnover    = computePayablesTurnover(cogsYtd, partnerLoanBalance)
    const netProfitMargin     = computeNetProfitMargin(netProfitYtd, revenueYtd)
    const returnOnAssets      = computeReturnOnAssets(netProfitYtd, totalAssets)
    const returnOnEquity      = computeReturnOnEquity(netProfitYtd, totalEquity)

    const compositeScore = computeBalanceSheetHealthScore(
      currentRatio,
      debtToEquity,
      assetTurnover,
      netProfitMargin,
    )

    return {
      liquidity: {
        current_ratio: currentRatio,
        quick_ratio:   quickRatio,
        cash_ratio:    cashRatio,
        health:        liquidityHealth,
      },
      solvency: {
        debt_to_equity:    debtToEquity,
        debt_to_assets:    debtToAssets,
        equity_multiplier: equityMultiplier,
        interest_coverage: interestCoverage,
        health:            solvencyHealth,
      },
      efficiency: {
        asset_turnover:       assetTurnover,
        receivables_turnover: receivablesTurnover,
        payables_turnover:    payablesTurnover,
        net_profit_margin:    netProfitMargin,
        return_on_assets:     returnOnAssets,
        return_on_equity:     returnOnEquity,
      },
      composite_score: compositeScore,
      inputs: {
        total_assets:         totalAssets,
        total_liabilities:    totalLiabilities,
        total_equity:         totalEquity,
        current_assets:       currentAssets,
        current_liabilities:  currentLiabilities,
        inventory:            inventoryValue,
        cash:                 0,
        receivables,
        payables:             partnerLoanBalance,
        revenue_ytd:          revenueYtd,
        cogs_ytd:             cogsYtd,
        net_profit_ytd:       netProfitYtd,
        interest_expense_ytd: interestExpYtd,
      },
    }
  }
}
