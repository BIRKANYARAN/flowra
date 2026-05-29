// ═══════════════════════════════════════════════════════════════════════════════
// lib/services/pcle/equity-waterfall.service.ts
//
// Partner Equity Waterfall — Capital Return Projection
//
// Shows partners when/how their invested capital will be returned through
// dividends and loan repayments. Computes IRR, MOIC, break-even months,
// and forward-looking 24-month projection.
//
// Pure exported functions (no DB, testable in isolation):
//   computeCapitalAtRisk
//   computeReturnRatio
//   computeBreakEvenMonths
//   computeIrr
//   computePartnerMultiple
//   projectFutureReturns
//   classifyCapitalReturnHealth
//
// Service class:
//   EquityWaterfallService.getReport(companyId)
// ═══════════════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Pure exported functions ───────────────────────────────────────────────────

/**
 * Total capital deployed: paid equity + net loan balance.
 * Never negative — clamps to 0.
 */
export function computeCapitalAtRisk(
  totalCommitted: number,
  totalPaid: number,
  netLoanBalance: number,
): number {
  const result = totalPaid + netLoanBalance
  return Math.max(0, result)
}

/**
 * Return ratio as a percentage: (totalReturned / capitalAtRisk) × 100.
 * Returns null if capitalAtRisk === 0.
 */
export function computeReturnRatio(
  totalReturned: number,
  capitalAtRisk: number,
): number | null {
  if (capitalAtRisk === 0) return null
  return (totalReturned / capitalAtRisk) * 100
}

/**
 * Estimated months to recover capital at risk.
 * Returns Math.ceil(capitalAtRisk / avgMonthlyReturn).
 * Returns null if avgMonthlyReturn <= 0 or capitalAtRisk <= 0.
 */
export function computeBreakEvenMonths(
  capitalAtRisk: number,
  avgMonthlyReturn: number,
): number | null {
  if (avgMonthlyReturn <= 0 || capitalAtRisk <= 0) return null
  return Math.ceil(capitalAtRisk / avgMonthlyReturn)
}

/**
 * Simplified annualized IRR using Newton-Raphson (max 100 iterations).
 *
 * NPV(r) = -investment + Σ cf[t] / (1+r)^(t+1)
 * NPV'(r) = -Σ (t+1) × cf[t] / (1+r)^(t+2)
 * r_next = r - NPV(r) / NPV'(r)
 *
 * Returns annualized rate as percentage (× 12 from monthly).
 * Returns null if: cashFlows all 0, investment 0, non-convergent, or outside [-100, 1000].
 */
export function computeIrr(
  initialInvestment: number,
  cashFlows: number[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _monthlyRate?: number,
): number | null {
  if (initialInvestment === 0) return null
  if (cashFlows.length === 0) return null
  if (cashFlows.every(cf => cf === 0)) return null

  // Newton-Raphson iteration
  let r = 0.01 // initial guess: 1% monthly

  for (let iter = 0; iter < 100; iter++) {
    let npv = -initialInvestment
    let dnpv = 0

    for (let t = 0; t < cashFlows.length; t++) {
      const cf = cashFlows[t]
      const factor = Math.pow(1 + r, t + 1)
      npv += cf / factor
      dnpv -= ((t + 1) * cf) / Math.pow(1 + r, t + 2)
    }

    if (Math.abs(dnpv) < 1e-12) return null // derivative too small → can't converge

    const rNext = r - npv / dnpv

    if (Math.abs(rNext - r) < 1e-10) {
      // Converged — convert monthly to annualized percentage
      const annualized = rNext * 12 * 100
      if (annualized < -100 || annualized > 1000) return null
      return annualized
    }

    r = rNext

    // Guard against divergence
    if (!isFinite(r) || Math.abs(r) > 1e6) return null
  }

  return null // did not converge
}

/**
 * MOIC — Multiple of Invested Capital.
 * Returns totalReturned / capitalAtRisk.
 * Returns null if capitalAtRisk === 0.
 */
export function computePartnerMultiple(
  totalReturned: number,
  capitalAtRisk: number,
): number | null {
  if (capitalAtRisk === 0) return null
  return totalReturned / capitalAtRisk
}

/**
 * Project capital recovery over projectionMonths (default 24).
 *
 * For each month m from 1 to projectionMonths:
 *   cumulative_returned[m] = min(avgMonthlyReturn * m, capitalAtRisk)
 *   remaining_at_risk[m]   = max(0, capitalAtRisk - cumulative_returned[m])
 *   return_pct[m]          = (cumulative_returned[m] / capitalAtRisk) × 100
 *                            (0 if capitalAtRisk = 0)
 */
export function projectFutureReturns(
  capitalAtRisk: number,
  avgMonthlyReturn: number,
  projectionMonths = 24,
): Array<{
  month: number
  cumulative_returned: number
  remaining_at_risk: number
  return_pct: number
}> {
  const result = []

  for (let m = 1; m <= projectionMonths; m++) {
    const cumulative = avgMonthlyReturn > 0
      ? Math.min(avgMonthlyReturn * m, capitalAtRisk)
      : 0
    const remaining = Math.max(0, capitalAtRisk - cumulative)
    const returnPct = capitalAtRisk === 0 ? 0 : (cumulative / capitalAtRisk) * 100

    result.push({
      month: m,
      cumulative_returned: cumulative,
      remaining_at_risk: remaining,
      return_pct: returnPct,
    })
  }

  return result
}

/**
 * Classify capital return health based on return ratio and break-even months.
 *
 * insufficient_data: both null
 * strong:            returnRatio >= 50 OR breakEvenMonths <= 12
 * healthy:           returnRatio >= 25 OR breakEvenMonths <= 24
 * recovering:        returnRatio >= 10 OR breakEvenMonths <= 48
 * at_risk:           else
 */
export function classifyCapitalReturnHealth(
  returnRatioPct: number | null,
  breakEvenMonths: number | null,
): 'strong' | 'healthy' | 'recovering' | 'at_risk' | 'insufficient_data' {
  if (returnRatioPct === null && breakEvenMonths === null) {
    return 'insufficient_data'
  }

  const ratio = returnRatioPct ?? -Infinity
  const months = breakEvenMonths ?? Infinity

  if (ratio >= 50 || months <= 12)  return 'strong'
  if (ratio >= 25 || months <= 24)  return 'healthy'
  if (ratio >= 10 || months <= 48)  return 'recovering'
  return 'at_risk'
}

// ── Internal DB row types ─────────────────────────────────────────────────────

interface PartnerRow {
  id: string
  name: string
  share_pct: number
}

interface TxRow {
  partner_id: string
  amount_try: number
  tx_type: string
  created_at: string
}

interface LoanTrancheRow {
  partner_id: string
  outstanding_try: number
}

// ── EquityWaterfallService ────────────────────────────────────────────────────

export class EquityWaterfallService {
  constructor(private supabase: AnyClient) {}

  async getReport(companyId: string): Promise<{
    partners: Array<{
      partner_id: string
      partner_name: string
      share_pct: number
      capital_at_risk: number
      total_returned: number
      return_ratio_pct: number | null
      multiple: number | null
      break_even_months: number | null
      health: ReturnType<typeof classifyCapitalReturnHealth>
      projection: ReturnType<typeof projectFutureReturns>
    }>
    company_summary: {
      total_capital_at_risk: number
      total_returned: number
      weighted_return_ratio_pct: number | null
      avg_break_even_months: number | null
    }
  }> {
    // Fetch partners, transactions, and loan tranches in parallel
    const [partnersRes, txRes, trancheRes, financeEventsRes] = await Promise.allSettled([
      this.supabase
        .from('partners')
        .select('id, name, share_pct')
        .eq('company_id', companyId)
        .is('deleted_at', null),

      this.supabase
        .from('partner_transactions')
        .select('partner_id, amount_try, tx_type, created_at')
        .eq('company_id', companyId)
        .is('deleted_at', null),

      this.supabase
        .from('partner_loan_tranches')
        .select('partner_id, outstanding_try')
        .eq('company_id', companyId)
        .eq('status', 'active'),

      // Try partner_finance_events if available
      this.supabase
        .from('partner_finance_events')
        .select('partner_id, amount_try, event_type, created_at')
        .eq('company_id', companyId),
    ])

    const partners: PartnerRow[] =
      partnersRes.status === 'fulfilled' ? ((partnersRes.value.data ?? []) as PartnerRow[]) : []

    // Build transaction maps
    const rawTxs: TxRow[] =
      txRes.status === 'fulfilled' ? ((txRes.value.data ?? []) as TxRow[]) : []

    // Try finance events as preferred source (fall back to transactions)
    const financeEvents =
      financeEventsRes.status === 'fulfilled' && financeEventsRes.value.data
        ? (financeEventsRes.value.data as Array<{ partner_id: string; amount_try: number; event_type: string; created_at: string }>)
        : []

    // Loan balance map
    const loanBalanceMap = new Map<string, number>()
    if (trancheRes.status === 'fulfilled' && trancheRes.value.data) {
      for (const t of trancheRes.value.data as LoanTrancheRow[]) {
        const existing = loanBalanceMap.get(t.partner_id) ?? 0
        loanBalanceMap.set(t.partner_id, existing + Number(t.outstanding_try ?? 0))
      }
    }

    // Per-partner transaction aggregates
    const capitalDeployedMap = new Map<string, number>()
    const capitalReturnedMap = new Map<string, number>()
    const txDateMap          = new Map<string, string>()  // earliest tx date per partner

    // Capital deployed tx types
    const DEPLOYED_TYPES  = new Set(['capital_in', 'loan_to_company', 'loan_in'])
    // Capital returned tx types
    const RETURNED_TYPES  = new Set(['dividend', 'loan_repayment'])

    // Use finance_events if available, otherwise fall back to transactions
    const hasFinanceEvents = financeEvents.length > 0
    if (hasFinanceEvents) {
      // Map finance event_type to logic categories
      const FE_DEPLOYED  = new Set(['EQUITY_PAYMENT', 'LOAN_DISBURSEMENT'])
      const FE_RETURNED  = new Set(['DIVIDEND_PAID', 'LOAN_REPAYMENT'])

      for (const ev of financeEvents) {
        const pid = ev.partner_id
        const amt = Number(ev.amount_try ?? 0)

        if (FE_DEPLOYED.has(ev.event_type)) {
          capitalDeployedMap.set(pid, (capitalDeployedMap.get(pid) ?? 0) + amt)
        }
        if (FE_RETURNED.has(ev.event_type)) {
          capitalReturnedMap.set(pid, (capitalReturnedMap.get(pid) ?? 0) + amt)
        }
        if (ev.created_at) {
          const existing = txDateMap.get(pid)
          if (!existing || ev.created_at < existing) {
            txDateMap.set(pid, ev.created_at)
          }
        }
      }
    } else {
      for (const tx of rawTxs) {
        const pid = tx.partner_id
        const amt = Number(tx.amount_try ?? 0)

        if (DEPLOYED_TYPES.has(tx.tx_type)) {
          capitalDeployedMap.set(pid, (capitalDeployedMap.get(pid) ?? 0) + amt)
        }
        if (RETURNED_TYPES.has(tx.tx_type)) {
          capitalReturnedMap.set(pid, (capitalReturnedMap.get(pid) ?? 0) + amt)
        }
        if (tx.created_at) {
          const existing = txDateMap.get(pid)
          if (!existing || tx.created_at < existing) {
            txDateMap.set(pid, tx.created_at)
          }
        }
      }
    }

    // Per-partner computation
    const today = new Date()

    const partnerResults = partners.map(p => {
      const totalPaid     = capitalDeployedMap.get(p.id) ?? 0
      const netLoan       = loanBalanceMap.get(p.id) ?? 0
      const totalReturned = capitalReturnedMap.get(p.id) ?? 0
      const capitalAtRisk = computeCapitalAtRisk(0, totalPaid, netLoan)

      // Estimate months of data from earliest transaction date
      let monthsOfData = 1
      const earliestDate = txDateMap.get(p.id)
      if (earliestDate) {
        const startDate = new Date(earliestDate)
        const diffMs = today.getTime() - startDate.getTime()
        const diffMonths = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 30.44))
        monthsOfData = Math.max(1, diffMonths)
      }

      const avgMonthlyReturn = totalReturned / monthsOfData

      const returnRatioPct  = computeReturnRatio(totalReturned, capitalAtRisk)
      const multiple        = computePartnerMultiple(totalReturned, capitalAtRisk)
      const breakEvenMonths = computeBreakEvenMonths(capitalAtRisk, avgMonthlyReturn)
      const health          = classifyCapitalReturnHealth(returnRatioPct, breakEvenMonths)
      const projection      = projectFutureReturns(capitalAtRisk, avgMonthlyReturn, 24)

      return {
        partner_id:       p.id,
        partner_name:     p.name,
        share_pct:        Number(p.share_pct ?? 0),
        capital_at_risk:  capitalAtRisk,
        total_returned:   totalReturned,
        return_ratio_pct: returnRatioPct,
        multiple,
        break_even_months: breakEvenMonths,
        health,
        projection,
      }
    })

    // Company summary
    const totalCapitalAtRisk = partnerResults.reduce((s, p) => s + p.capital_at_risk, 0)
    const totalReturnedAll   = partnerResults.reduce((s, p) => s + p.total_returned, 0)

    // Weighted return ratio by share_pct
    const totalShare = partnerResults.reduce((s, p) => s + p.share_pct, 0)
    let weightedReturnRatio: number | null = null
    if (totalShare > 0) {
      const weighted = partnerResults.reduce((s, p) => {
        if (p.return_ratio_pct !== null) {
          return s + (p.return_ratio_pct * p.share_pct)
        }
        return s
      }, 0)
      const countWithRatio = partnerResults.filter(p => p.return_ratio_pct !== null).length
      if (countWithRatio > 0) {
        const weightedShare = partnerResults.reduce((s, p) => {
          return p.return_ratio_pct !== null ? s + p.share_pct : s
        }, 0)
        weightedReturnRatio = weightedShare > 0 ? weighted / weightedShare : null
      }
    }

    // Avg break-even months across partners with non-null
    const breakEvenValues = partnerResults
      .filter(p => p.break_even_months !== null)
      .map(p => p.break_even_months as number)
    const avgBreakEvenMonths = breakEvenValues.length > 0
      ? Math.round(breakEvenValues.reduce((s, v) => s + v, 0) / breakEvenValues.length)
      : null

    return {
      partners: partnerResults,
      company_summary: {
        total_capital_at_risk:    totalCapitalAtRisk,
        total_returned:           totalReturnedAll,
        weighted_return_ratio_pct: weightedReturnRatio,
        avg_break_even_months:    avgBreakEvenMonths,
      },
    }
  }
}
