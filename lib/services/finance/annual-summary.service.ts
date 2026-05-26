// ─────────────────────────────────────────────────────────────────────────────
// lib/services/finance/annual-summary.service.ts
//
// Annual Financial Summary — year-over-year P&L comparison.
//
// Rules:
//   • Each year's data is fetched via FinanceService.getFinancialSummary.
//   • Growth rates are vs. prior year (null for the oldest year).
//   • Division by zero guarded: growth = null when prior value is 0.
//   • Years array is ordered newest first.
//   • cash_try is approximated as net_after_tax_try cumulative (not balance sheet).
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient }  from '@supabase/supabase-js'
import { FinanceService }       from '@/lib/services/finance.service'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Output interfaces ─────────────────────────────────────────────────────────

export interface AnnualMetrics {
  year:           number
  revenue_try:    number
  cogs_try:       number
  gross_profit_try: number
  gross_margin_pct: number   // gross_profit / revenue (0 if revenue = 0)
  expenses_try:   number
  net_income_try: number     // net_after_tax_try
  net_margin_pct: number     // net_income / revenue (0 if revenue = 0)
  cash_try:       number     // year-end cash proxy (net_after_tax_try for the year)

  // Growth vs prior year (null = no prior year or division by zero)
  revenue_growth_pct:    number | null
  net_income_growth_pct: number | null
}

export interface AnnualSummary {
  years:              AnnualMetrics[]   // newest first
  best_year_revenue:  number | null
  best_year_net:      number | null
  computed_at:        string
}

// ── Service ───────────────────────────────────────────────────────────────────

export class AnnualSummaryService {

  static async getSummary(
    companyId:   string,
    uid:         string,
    supabase:    AnyClient,
    opts?:       { currentYear?: number; yearsBack?: number },
  ): Promise<AnnualSummary> {
    const currentYear = opts?.currentYear ?? new Date().getFullYear()
    const yearsBack   = opts?.yearsBack   ?? 3
    const computedAt  = new Date().toISOString()

    // Build year list: current, current-1, current-2 ...
    const yearList = Array.from({ length: yearsBack }, (_, i) => currentYear - i)

    // Fetch all years in parallel
    const results = await Promise.allSettled(
      yearList.map(year =>
        FinanceService.getFinancialSummary(
          uid,
          companyId,
          { from: `${year}-01-01`, to: `${year}-12-31` },
          undefined,
          undefined,
          supabase,
        ).then(s => ({ year, summary: s }))
      )
    )

    // Parse results (newest first — yearList already newest-first)
    const rawMetrics: Array<{ year: number; summary: Awaited<ReturnType<typeof FinanceService.getFinancialSummary>> }> = []
    for (const r of results) {
      if (r.status === 'fulfilled') rawMetrics.push(r.value)
    }

    // Build AnnualMetrics with growth rates
    const annualMetrics: AnnualMetrics[] = []

    for (let i = 0; i < rawMetrics.length; i++) {
      const { year, summary }   = rawMetrics[i]
      const prior               = rawMetrics[i + 1] ?? null

      const revenue    = summary.revenue_try
      const cogs       = summary.cost_try
      const grossP     = summary.gross_profit_try
      const expenses   = summary.expenses_total_try
      const netIncome  = summary.net_after_tax_try

      const grossMargin = revenue > 0 ? (grossP / revenue) * 100 : 0
      const netMargin   = revenue > 0 ? (netIncome / revenue) * 100 : 0

      let revenueGrowth:    number | null = null
      let netIncomeGrowth:  number | null = null

      if (prior) {
        const priorRevenue   = prior.summary.revenue_try
        const priorNetIncome = prior.summary.net_after_tax_try
        revenueGrowth    = priorRevenue   !== 0 ? ((revenue   - priorRevenue)   / Math.abs(priorRevenue))   * 100 : null
        netIncomeGrowth  = priorNetIncome !== 0 ? ((netIncome - priorNetIncome) / Math.abs(priorNetIncome)) * 100 : null
      }

      annualMetrics.push({
        year,
        revenue_try:          revenue,
        cogs_try:             cogs,
        gross_profit_try:     grossP,
        gross_margin_pct:     grossMargin,
        expenses_try:         expenses,
        net_income_try:       netIncome,
        net_margin_pct:       netMargin,
        cash_try:             netIncome,   // cash proxy = net income for the year
        revenue_growth_pct:   revenueGrowth,
        net_income_growth_pct: netIncomeGrowth,
      })
    }

    const revenues    = annualMetrics.map(m => m.revenue_try)
    const nets        = annualMetrics.map(m => m.net_income_try)
    const bestRevYear = revenues.length > 0 ? annualMetrics[revenues.indexOf(Math.max(...revenues))].year : null
    const bestNetYear = nets.length    > 0 ? annualMetrics[nets.indexOf(Math.max(...nets))].year    : null

    return {
      years:             annualMetrics,
      best_year_revenue: bestRevYear,
      best_year_net:     bestNetYear,
      computed_at:       computedAt,
    }
  }
}
