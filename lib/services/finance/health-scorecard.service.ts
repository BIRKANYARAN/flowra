// ═══════════════════════════════════════════════════════════════════════════════
// lib/services/finance/health-scorecard.service.ts
//
// Financial Health Scorecard — 10 standard financial ratios with board-grade
// reporting. CFOs and boards use these to assess company health.
//
// Ratio categories:
//   Liquidity     — current_ratio, quick_ratio, cash_ratio
//   Profitability — gross_margin_pct, net_margin_pct, roe_pct
//   Efficiency    — asset_turnover, receivables_turnover
//   Leverage      — debt_to_equity, debt_service_ratio
//
// Data sources:
//   Revenue / COGS  ← sales (period-scoped)
//   Expenses        ← expenses (period-scoped)
//   Balance sheet   ← stock_lots, sales (receivables), expenses (payables),
//                      partner_transactions (equity + loans)
//   Debt service    ← loan principal from partner_loan_tranches
// ═══════════════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Public types ───────────────────────────────────────────────────────────────

export interface FinancialRatio {
  key: string
  name: string                  // Turkish label
  value: number | null
  unit: 'ratio' | 'pct' | 'days' | 'x'
  grade: 'A' | 'B' | 'C' | 'D' | 'F' | null
  description: string           // 1-line explanation
  benchmark: string             // e.g. "İdeal: >2.0"
  trend: 'improving' | 'stable' | 'declining' | null
}

export interface HealthScorecard {
  period_from: string
  period_to: string

  overall_grade: 'A' | 'B' | 'C' | 'D' | 'F'
  overall_score: number         // 0-100

  ratios: FinancialRatio[]

  categories: {
    liquidity:     { grade: string; ratios: string[] }
    profitability: { grade: string; ratios: string[] }
    efficiency:    { grade: string; ratios: string[] }
    leverage:      { grade: string; ratios: string[] }
  }

  computed_at: string
}

// ── Ratio metadata (static) ────────────────────────────────────────────────────

const RATIO_META: Record<string, { name: string; unit: FinancialRatio['unit']; description: string; benchmark: string }> = {
  current_ratio:         { name: 'Cari Oran',             unit: 'ratio', description: 'Dönen varlıkların kısa vadeli yükümlülükleri karşılama oranı',        benchmark: 'İdeal: ≥ 2.0' },
  quick_ratio:           { name: 'Asit-Test Oranı',       unit: 'ratio', description: 'Nakit ve alacakların kısa vadeli yükümlülüklere oranı',                benchmark: 'İdeal: ≥ 1.0' },
  cash_ratio:            { name: 'Nakit Oranı',           unit: 'ratio', description: 'Nakit pozisyonunun kısa vadeli yükümlülüklere oranı',                  benchmark: 'İdeal: ≥ 0.5' },
  gross_margin_pct:      { name: 'Brüt Kâr Marjı',        unit: 'pct',   description: 'Satış gelirinden COGS düşüldükten sonraki kâr yüzdesi',                benchmark: 'İdeal: ≥ %40' },
  net_margin_pct:        { name: 'Net Kâr Marjı',         unit: 'pct',   description: 'Tüm giderler sonrası net kârın gelire oranı',                          benchmark: 'İdeal: ≥ %15' },
  roe_pct:               { name: 'Özkaynak Kârlılığı',    unit: 'pct',   description: 'Özkaynağa oranla net kâr — ortakların getirisi',                       benchmark: 'İdeal: ≥ %20' },
  asset_turnover:        { name: 'Varlık Devir Hızı',     unit: 'x',     description: 'Toplam varlıklarla üretilen gelir katsayısı',                          benchmark: 'İdeal: ≥ 2.0x' },
  receivables_turnover:  { name: 'Alacak Devir Hızı',     unit: 'x',     description: 'Yılda kaç kez alacakların tahsil edildiği',                            benchmark: 'İdeal: ≥ 12x (aylık)' },
  debt_to_equity:        { name: 'Borç / Özkaynak',       unit: 'ratio', description: 'Toplam yükümlülüklerin özkaynağa oranı — kaldıraç göstergesi',         benchmark: 'İdeal: ≤ 0.5' },
  debt_service_ratio:    { name: 'Borç Servis Oranı',     unit: 'ratio', description: 'Aylık borç ödemelerinin aylık net kâra oranı',                         benchmark: 'İdeal: ≤ 0.2' },
}

const CATEGORY_MAP: Record<string, keyof HealthScorecard['categories']> = {
  current_ratio:        'liquidity',
  quick_ratio:          'liquidity',
  cash_ratio:           'liquidity',
  gross_margin_pct:     'profitability',
  net_margin_pct:       'profitability',
  roe_pct:              'profitability',
  asset_turnover:       'efficiency',
  receivables_turnover: 'efficiency',
  debt_to_equity:       'leverage',
  debt_service_ratio:   'leverage',
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function round2(v: number): number {
  return Math.round(v * 100) / 100
}

function scoreToGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 90) return 'A'
  if (score >= 70) return 'B'
  if (score >= 50) return 'C'
  if (score >= 30) return 'D'
  return 'F'
}

function gradeToScore(g: FinancialRatio['grade']): number {
  if (g === 'A') return 100
  if (g === 'B') return 80
  if (g === 'C') return 60
  if (g === 'D') return 40
  return 20   // F
}

// ── Main service ───────────────────────────────────────────────────────────────

export class HealthScorecardService {

  // ── Pure: grade a single ratio value ─────────────────────────────────────────

  static gradeRatio(key: string, value: number): FinancialRatio['grade'] {
    switch (key) {
      case 'current_ratio':
        if (value >= 2.0) return 'A'
        if (value >= 1.5) return 'B'
        if (value >= 1.0) return 'C'
        if (value >= 0.5) return 'D'
        return 'F'

      case 'quick_ratio':
        if (value >= 1.0)  return 'A'
        if (value >= 0.75) return 'B'
        if (value >= 0.5)  return 'C'
        if (value >= 0.25) return 'D'
        return 'F'

      case 'cash_ratio':
        if (value >= 0.5)  return 'A'
        if (value >= 0.25) return 'B'
        if (value >= 0.1)  return 'C'
        if (value >= 0.05) return 'D'
        return 'F'

      case 'gross_margin_pct':
        if (value >= 40) return 'A'
        if (value >= 30) return 'B'
        if (value >= 20) return 'C'
        if (value >= 10) return 'D'
        return 'F'

      case 'net_margin_pct':
        if (value >= 15) return 'A'
        if (value >= 10) return 'B'
        if (value >= 5)  return 'C'
        if (value >= 0)  return 'D'
        return 'F'

      case 'roe_pct':
        if (value >= 20) return 'A'
        if (value >= 15) return 'B'
        if (value >= 10) return 'C'
        if (value >= 5)  return 'D'
        return 'F'

      case 'asset_turnover':
        if (value >= 2.0) return 'A'
        if (value >= 1.5) return 'B'
        if (value >= 1.0) return 'C'
        if (value >= 0.5) return 'D'
        return 'F'

      case 'receivables_turnover':
        if (value >= 12) return 'A'
        if (value >= 8)  return 'B'
        if (value >= 6)  return 'C'
        if (value >= 4)  return 'D'
        return 'F'

      case 'debt_to_equity':
        // Lower is better
        if (value <= 0.5) return 'A'
        if (value <= 1.0) return 'B'
        if (value <= 2.0) return 'C'
        if (value <= 4.0) return 'D'
        return 'F'

      case 'debt_service_ratio':
        // Lower is better
        if (value <= 0.2)  return 'A'
        if (value <= 0.35) return 'B'
        if (value <= 0.5)  return 'C'
        if (value <= 0.7)  return 'D'
        return 'F'

      default:
        return null
    }
  }

  // ── Pure: compute overall score from graded ratios ─────────────────────────

  static computeOverallScore(ratios: FinancialRatio[]): number {
    const gradedRatios = ratios.filter(r => r.grade !== null)
    if (gradedRatios.length === 0) return 0
    const total = gradedRatios.reduce((sum, r) => sum + gradeToScore(r.grade), 0)
    return round2(total / gradedRatios.length)
  }

  // ── Pure: compute category grade from category ratios ─────────────────────

  static computeCategoryGrade(ratios: FinancialRatio[], keys: string[]): string {
    const categoryRatios = ratios.filter(r => keys.includes(r.key) && r.grade !== null)
    if (categoryRatios.length === 0) return 'N/A'
    const total = categoryRatios.reduce((sum, r) => sum + gradeToScore(r.grade), 0)
    const avg = total / categoryRatios.length
    return scoreToGrade(avg)
  }

  // ── Main: get scorecard for period ─────────────────────────────────────────

  static async getScorecard(
    companyId: string,
    uid: string,
    supabase: AnyClient,
    period: { from: string; to: string },
  ): Promise<HealthScorecard> {

    // ── Parallel data fetch ──────────────────────────────────────────────────
    const [
      salesResult,
      expensesResult,
      stockLotsResult,
      openReceivablesResult,
      partnerTxResult,
      partnerLoansResult,
    ] = await Promise.all([

      // Sales in period for revenue and COGS
      supabase
        .from('sales')
        .select('total_try, cogs, payment_status, sale_date')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('sale_date', period.from)
        .lte('sale_date', period.to),

      // Expenses in period
      supabase
        .from('expenses')
        .select('amount_try, expense_date, category')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('expense_date', period.from)
        .lte('expense_date', period.to),

      // Stock lots for inventory value
      supabase
        .from('stock_lots')
        .select('qty_remaining, cost_price_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gt('qty_remaining', 0),

      // All-time open receivables (balance sheet)
      supabase
        .from('sales')
        .select('total_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .in('payment_status', ['pending', 'partial', 'overdue']),

      // Partner transactions for equity computation
      supabase
        .from('partner_transactions')
        .select('tx_type, amount_try')
        .eq('company_id', companyId)
        .is('deleted_at', null),

      // Partner loan tranches for outstanding debt
      supabase
        .from('partner_loan_tranches')
        .select('outstanding_try, status')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .neq('status', 'repaid'),
    ])

    const sales           = (salesResult.data           ?? []) as Array<{ total_try: number; cogs: number; payment_status: string; sale_date: string }>
    const expenses        = (expensesResult.data         ?? []) as Array<{ amount_try: number; expense_date: string; category: string }>
    const stockLots       = (stockLotsResult.data        ?? []) as Array<{ qty_remaining: number; cost_price_try: number }>
    const openReceivables = (openReceivablesResult.data  ?? []) as Array<{ total_try: number }>
    const partnerTxs      = (partnerTxResult.data        ?? []) as Array<{ tx_type: string; amount_try: number }>
    const partnerLoans    = (partnerLoansResult.data     ?? []) as Array<{ outstanding_try: number; status: string }>

    // ── Balance sheet proxies ────────────────────────────────────────────────

    // Cash position proxy: sum of paid sales minus paid expenses (all-time)
    // We use the period revenue + cogs as a simpler proxy for ratio computation.
    // For balance sheet, we approximate:
    //   cash = paid sales total - total expenses (proxy; no bank table)
    // We use stock_lots as inventory (balance sheet asset)

    const period_revenue_try = sales.reduce((s, r) => s + (Number(r.total_try) || 0), 0)
    const period_cogs_try    = sales.reduce((s, r) => s + (Number(r.cogs)      || 0), 0)
    const period_expense_try = expenses.reduce((s, e) => s + (Number(e.amount_try) || 0), 0)

    // Gross profit
    const gross_profit_try = period_revenue_try - period_cogs_try
    // Net income (approximation: revenue - cogs - expenses)
    const net_income_try   = gross_profit_try - period_expense_try

    // Receivables (balance sheet)
    const receivables_try = openReceivables.reduce((s, r) => s + (Number(r.total_try) || 0), 0)

    // Inventory value from stock lots
    const inventory_try = stockLots.reduce(
      (s, lot) => s + (Number(lot.qty_remaining) || 0) * (Number(lot.cost_price_try) || 0),
      0,
    )

    // Cash proxy: for ratio purposes, use a minimal positive proxy
    // In the absence of a real bank balance table, we use receivables/inventory as proxies
    // Cash = net income for period (rough proxy)
    const cash_proxy_try = Math.max(0, net_income_try)

    // Partner loan outstanding = total_outstanding_try of active tranches
    const partner_loans_outstanding_try = partnerLoans.reduce(
      (s, l) => s + (Number(l.outstanding_try) || 0),
      0,
    )

    // Tax payable proxy: 0 (no tax payable table; use 0 as safe default)
    const tax_payable_try = 0

    // Trade payables proxy: unpaid expenses (period)
    const trade_payables_try = period_expense_try  // simplification

    // Current liabilities = trade payables + partner short-term loans + tax payable
    const current_liabilities_try = trade_payables_try + partner_loans_outstanding_try + tax_payable_try

    // Current assets = cash + receivables + inventory
    const current_assets_try = cash_proxy_try + receivables_try + inventory_try

    // Total assets = current assets (we don't have fixed assets data)
    const total_assets_try = current_assets_try

    // Equity from partner transactions:
    //   capital_in + loan_in (legacy) − loan_repayment/loan_out
    let total_capital_try   = 0
    let total_loaned_try    = 0
    let total_repaid_try    = 0
    let total_dividend_try  = 0

    for (const tx of partnerTxs) {
      const amt = Number(tx.amount_try) || 0
      switch (tx.tx_type) {
        case 'capital_in':      total_capital_try  += amt; break
        case 'loan_to_company':
        case 'loan_in':         total_loaned_try   += amt; break
        case 'loan_repayment':
        case 'loan_out':        total_repaid_try   += amt; break
        case 'dividend':        total_dividend_try += amt; break
      }
    }

    // Total equity = capital contributed + retained earnings proxy
    // Retained = Σ net_income periods (approximate: use all-time sales COGS - expenses)
    // Simplified: equity = capital_in + net_income_try (current period proxy)
    const total_equity_try = total_capital_try + net_income_try - total_dividend_try

    // Total liabilities = partner loans + payables
    const total_liabilities_try = partner_loans_outstanding_try + trade_payables_try

    // Avg receivables (for turnover): use current receivables / 2 as proxy
    const avg_receivables_try = receivables_try > 0 ? receivables_try / 2 : 0

    // Monthly debt service: rough estimate from outstanding loans / 12
    const monthly_net_income  = net_income_try / 12   // annualize
    const monthly_debt_service = partner_loans_outstanding_try / 12

    // ── Compute 10 ratios ────────────────────────────────────────────────────

    function makeRatio(
      key: string,
      value: number | null,
      trend: FinancialRatio['trend'] = null,
    ): FinancialRatio {
      const meta  = RATIO_META[key]
      const grade = value !== null ? HealthScorecardService.gradeRatio(key, value) : null
      return {
        key,
        name:        meta.name,
        value:       value !== null ? round2(value) : null,
        unit:        meta.unit,
        grade,
        description: meta.description,
        benchmark:   meta.benchmark,
        trend,
      }
    }

    // 1. Current ratio
    const current_ratio = current_liabilities_try > 0
      ? current_assets_try / current_liabilities_try
      : null

    // 2. Quick ratio
    const quick_ratio = current_liabilities_try > 0
      ? (cash_proxy_try + receivables_try) / current_liabilities_try
      : null

    // 3. Cash ratio
    const cash_ratio = current_liabilities_try > 0
      ? cash_proxy_try / current_liabilities_try
      : null

    // 4. Gross margin %
    const gross_margin_pct = period_revenue_try > 0
      ? (gross_profit_try / period_revenue_try) * 100
      : null

    // 5. Net margin %
    const net_margin_pct = period_revenue_try > 0
      ? (net_income_try / period_revenue_try) * 100
      : null

    // 6. ROE %
    const roe_pct = total_equity_try > 0
      ? (net_income_try / total_equity_try) * 100
      : null   // skip if equity ≤ 0

    // 7. Asset turnover
    const asset_turnover = total_assets_try > 0
      ? period_revenue_try / total_assets_try
      : null

    // 8. Receivables turnover
    const receivables_turnover = avg_receivables_try > 0
      ? period_revenue_try / avg_receivables_try
      : null

    // 9. Debt to equity
    const debt_to_equity = total_equity_try > 0
      ? total_liabilities_try / total_equity_try
      : null   // skip if equity ≤ 0

    // 10. Debt service ratio
    const debt_service_ratio = (monthly_net_income > 0 && monthly_debt_service > 0)
      ? monthly_debt_service / monthly_net_income
      : (monthly_debt_service > 0 ? 999 : null)

    const ratios: FinancialRatio[] = [
      makeRatio('current_ratio',        current_ratio),
      makeRatio('quick_ratio',          quick_ratio),
      makeRatio('cash_ratio',           cash_ratio),
      makeRatio('gross_margin_pct',     gross_margin_pct),
      makeRatio('net_margin_pct',       net_margin_pct),
      makeRatio('roe_pct',              roe_pct),
      makeRatio('asset_turnover',       asset_turnover),
      makeRatio('receivables_turnover', receivables_turnover),
      makeRatio('debt_to_equity',       debt_to_equity),
      makeRatio('debt_service_ratio',   debt_service_ratio),
    ]

    // ── Overall score and grade ──────────────────────────────────────────────
    const overall_score = HealthScorecardService.computeOverallScore(ratios)
    const overall_grade = scoreToGrade(overall_score)

    // ── Category grades ──────────────────────────────────────────────────────
    const liquidityKeys     = ['current_ratio', 'quick_ratio', 'cash_ratio']
    const profitabilityKeys = ['gross_margin_pct', 'net_margin_pct', 'roe_pct']
    const efficiencyKeys    = ['asset_turnover', 'receivables_turnover']
    const leverageKeys      = ['debt_to_equity', 'debt_service_ratio']

    const categories: HealthScorecard['categories'] = {
      liquidity:     { grade: HealthScorecardService.computeCategoryGrade(ratios, liquidityKeys),     ratios: liquidityKeys },
      profitability: { grade: HealthScorecardService.computeCategoryGrade(ratios, profitabilityKeys), ratios: profitabilityKeys },
      efficiency:    { grade: HealthScorecardService.computeCategoryGrade(ratios, efficiencyKeys),    ratios: efficiencyKeys },
      leverage:      { grade: HealthScorecardService.computeCategoryGrade(ratios, leverageKeys),      ratios: leverageKeys },
    }

    return {
      period_from:   period.from,
      period_to:     period.to,
      overall_grade,
      overall_score,
      ratios,
      categories,
      computed_at:   new Date().toISOString(),
    }
  }
}
