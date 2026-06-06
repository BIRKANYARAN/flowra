// ═══════════════════════════════════════════════════════════════════════════════
// lib/services/pcle/dividend-calculator.service.ts
//
// Dividend Calculator Service
//
// Computes distributable dividends per partner with full Turkish tax compliance.
// Implements:
//   - TTK 519: Legal reserve guard (5% of period profit, capped at 20% of paid-in capital)
//   - TTK 509: Cannot distribute more than distributable profit
//   - TTK 588: Equity gap warning (unpaid capital commitments)
//   - GVK 94 Madde 94/6-b: 10% withholding tax on dividend distributions
//
// Pure exports (testable without DB):
//   computeLegalReserveDeduction
//   computeDistributableProfit
//   computeWithholdingTax
//   computeNetDividend
//   distributeGrossDividend
//   computeYtdDividendsPaid
//   checkTtk509Guard
//   checkEquityGapWarning
//   computeOptimalDistribution
//   classifyDistributionReadiness
//   generateDistributionNarrative
//   computeDividendYield
//   computePayoutRatio
// ═══════════════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Internal helpers ──────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// ── Public interfaces ─────────────────────────────────────────────────────────

export interface PartnerDividendAllocation {
  partner_id: string
  partner_name: string
  share_pct: number
  gross_dividend: number
  withholding_tax: number
  net_dividend: number
  ytd_dividends_paid: number
  cumulative_net_received: number   // net_dividend + ytd_dividends_paid
}

export interface DividendCalculatorReport {
  as_of_date: string

  // Profit basis
  period_profit: number
  legal_reserve_deduction: number
  board_retained_amount: number
  distributable_profit: number

  // Proposed distribution
  proposed_gross_dividend: number   // computeOptimalDistribution result
  total_withholding_tax: number
  total_net_dividend: number

  // Per-partner allocations
  allocations: PartnerDividendAllocation[]

  // Guards
  ttk509_check: { allowed: boolean; reason: string | null }
  equity_gap_warning: { hasWarning: boolean; warning: string | null }

  // Metrics
  payout_ratio: number | null
  dividend_yield: number | null
  readiness: ReturnType<typeof classifyDistributionReadiness>

  // Company totals
  paid_in_capital: number
  existing_legal_reserves: number
  equity_gap: number                 // sum of unpaid capital commitments

  narrative: string
}

// ── TTK Legal Reserve Guard ───────────────────────────────────────────────────

/**
 * Compute legal reserve deduction (TTK 519).
 * LR = min(periodProfit × 5%, max(0, paidInCapital × 20% - existingReserves))
 * Returns 0 if periodProfit <= 0.
 */
export function computeLegalReserveDeduction(
  periodProfit: number,
  paidInCapital: number,
  existingReserves: number,
): number {
  if (periodProfit <= 0) return 0
  const fivePercent = round2(periodProfit * 0.05)
  const reserveCap  = Math.max(0, round2(paidInCapital * 0.20 - existingReserves))
  return Math.min(fivePercent, reserveCap)
}

/**
 * Compute distributable profit after legal reserve.
 * Returns max(0, periodProfit - legalReserve - boardRetainedAmount).
 * boardRetainedAmount: additional amount board decided to retain (default 0).
 */
export function computeDistributableProfit(
  periodProfit: number,
  legalReserveDeduction: number,
  boardRetainedAmount = 0,
): number {
  return Math.max(0, round2(periodProfit - legalReserveDeduction - boardRetainedAmount))
}

// ── GVK 94 Withholding Tax ────────────────────────────────────────────────────

/**
 * Compute dividend withholding tax (GVK 94, Madde 94/6-b).
 * Rate: 10% for individual shareholders (Turkish residents and non-residents alike).
 * grossDividend × withholdingRate (default 0.10).
 */
export function computeWithholdingTax(grossDividend: number, withholdingRate = 0.10): number {
  return round2(grossDividend * withholdingRate)
}

/**
 * Compute net dividend: grossDividend - withholdingTax.
 */
export function computeNetDividend(grossDividend: number, withholdingTax: number): number {
  return round2(grossDividend - withholdingTax)
}

// ── Per-Partner Distribution ──────────────────────────────────────────────────

/**
 * Distribute gross dividend pro-rata by share_pct.
 * The last partner receives any rounding remainder.
 * Returns array of { partner_id, share_pct, gross_dividend, withholding_tax, net_dividend }.
 */
export function distributeGrossDividend(
  totalGrossDividend: number,
  partners: Array<{ partner_id: string; share_pct: number }>,
  withholdingRate = 0.10,
): Array<{
  partner_id: string
  share_pct: number
  gross_dividend: number
  withholding_tax: number
  net_dividend: number
}> {
  if (partners.length === 0) return []

  const results: Array<{
    partner_id: string
    share_pct: number
    gross_dividend: number
    withholding_tax: number
    net_dividend: number
  }> = []

  let allocated = 0

  for (let i = 0; i < partners.length; i++) {
    const p = partners[i]
    const isLast = i === partners.length - 1

    // Last partner absorbs rounding remainder
    const gross = isLast
      ? round2(totalGrossDividend - allocated)
      : round2(totalGrossDividend * (p.share_pct / 100))

    const whtax = computeWithholdingTax(gross, withholdingRate)
    const net   = computeNetDividend(gross, whtax)

    allocated = round2(allocated + gross)

    results.push({
      partner_id:      p.partner_id,
      share_pct:       p.share_pct,
      gross_dividend:  gross,
      withholding_tax: whtax,
      net_dividend:    net,
    })
  }

  return results
}

/**
 * Compute cumulative dividends paid YTD to a partner.
 * From partner_finance_events with event_type = 'DIVIDEND_PAID'.
 * (Pure function — takes pre-fetched events.)
 */
export function computeYtdDividendsPaid(
  events: Array<{ event_type: string; amount_try: number }>,
  partnerId: string,
): number {
  // partnerId parameter reserved for callers filtering by partner before passing in.
  // This function sums DIVIDEND_PAID events from the provided pre-filtered slice.
  // We still accept partnerId to allow a single-call convenience pattern.
  void partnerId // parameter is for interface consistency; callers pre-filter or pass all
  return round2(
    events
      .filter(e => e.event_type === 'DIVIDEND_PAID')
      .reduce((sum, e) => sum + Number(e.amount_try ?? 0), 0),
  )
}

// ── Distribution Guards ───────────────────────────────────────────────────────

/**
 * Check TTK 509 guard: cannot distribute more than distributable profit.
 * Returns { allowed: true } or { allowed: false, reason: string }.
 */
export function checkTtk509Guard(
  proposedGrossDividend: number,
  distributableProfit: number,
): { allowed: boolean; reason: string | null } {
  if (proposedGrossDividend <= distributableProfit) {
    return { allowed: true, reason: null }
  }
  return {
    allowed: false,
    reason: `TTK 509: Dağıtılabilir kâr (${round2(distributableProfit).toLocaleString('tr-TR')} TL) aşılamaz. Önerilen dağıtım: ${round2(proposedGrossDividend).toLocaleString('tr-TR')} TL.`,
  }
}

/**
 * Check equity gap guard: partners with unpaid capital should not receive dividends
 * until capital is paid up (TTK 588 caution).
 * equityGap: sum of (committed - paid) across all partners.
 * Returns warning (not blocker) if equityGap > 0.
 */
export function checkEquityGapWarning(
  equityGap: number,
): { hasWarning: boolean; warning: string | null } {
  if (equityGap <= 0) return { hasWarning: false, warning: null }
  return {
    hasWarning: true,
    warning: `TTK 588 Uyarı: Karşılanmamış sermaye taahhüdü bulunmaktadır (${round2(equityGap).toLocaleString('tr-TR')} TL). Sermaye taahhütleri tamamlanmadan temettü dağıtımı risk taşır.`,
  }
}

// ── Optimal Distribution ──────────────────────────────────────────────────────

/**
 * Compute optimal dividend distribution given constraints.
 * retentionRatio: fraction of distributable profit to retain (0-1, default 0.3).
 * Optimal gross = distributableProfit × (1 - retentionRatio).
 * Capped at distributableProfit (can't exceed it).
 */
export function computeOptimalDistribution(
  distributableProfit: number,
  retentionRatio = 0.3,
): number {
  if (distributableProfit <= 0) return 0
  const optimal = round2(distributableProfit * (1 - retentionRatio))
  return Math.min(optimal, distributableProfit)
}

/**
 * Classify distribution readiness.
 * 'ready': distributableProfit > 0 AND no ttk509 violation AND equityGap === 0
 * 'ready_with_warning': distributableProfit > 0 AND equityGap > 0
 * 'insufficient_profit': distributableProfit <= 0
 * 'blocked': ttk509 guard fails
 */
export function classifyDistributionReadiness(
  distributableProfit: number,
  proposedGross: number,
  equityGap: number,
): 'ready' | 'ready_with_warning' | 'insufficient_profit' | 'blocked' {
  if (distributableProfit <= 0) return 'insufficient_profit'
  const ttk509 = checkTtk509Guard(proposedGross, distributableProfit)
  if (!ttk509.allowed) return 'blocked'
  if (equityGap > 0) return 'ready_with_warning'
  return 'ready'
}

/**
 * Generate Turkish distribution narrative.
 */
export function generateDistributionNarrative(
  readiness: ReturnType<typeof classifyDistributionReadiness>,
  distributableProfit: number,
  proposedGross: number,
  partnerCount: number,
): string {
  const profitFmt    = round2(distributableProfit).toLocaleString('tr-TR')
  const proposedFmt  = round2(proposedGross).toLocaleString('tr-TR')

  switch (readiness) {
    case 'ready':
      return `Dağıtım hazır: ${partnerCount} ortak arasında ${proposedFmt} TL brüt temettü dağıtılabilir (dağıtılabilir kâr: ${profitFmt} TL).`
    case 'ready_with_warning':
      return `Dağıtım yapılabilir ancak karşılanmamış sermaye taahhüdü bulunmaktadır. ${proposedFmt} TL brüt temettü ${partnerCount} ortağa dağıtılabilir — sermaye taahhütlerinin tamamlanması önerilir.`
    case 'insufficient_profit':
      return `Dağıtılabilir kâr bulunmamaktadır (${profitFmt} TL). Temettü dağıtımı yapılamaz.`
    case 'blocked':
      return `TTK 509 ihlali: Önerilen dağıtım (${proposedFmt} TL) dağıtılabilir kârı (${profitFmt} TL) aşmaktadır. Dağıtım engellenmiştir.`
  }
}

// ── Annual Comparison ─────────────────────────────────────────────────────────

/**
 * Compute dividend yield: grossDividendDeclared / paidInCapital * 100.
 * Returns null if paidInCapital === 0.
 */
export function computeDividendYield(grossDividendDeclared: number, paidInCapital: number): number | null {
  if (paidInCapital === 0) return null
  return round2((grossDividendDeclared / paidInCapital) * 100)
}

/**
 * Compute payout ratio: grossDividendDeclared / periodProfit * 100.
 * Returns null if periodProfit <= 0.
 * Capped at 100 (cannot pay more than profit — TTK 509).
 */
export function computePayoutRatio(grossDividendDeclared: number, periodProfit: number): number | null {
  if (periodProfit <= 0) return null
  const ratio = round2((grossDividendDeclared / periodProfit) * 100)
  return Math.min(ratio, 100)
}

// ── Service class ─────────────────────────────────────────────────────────────

export class DividendCalculatorService {
  constructor(private readonly supabase: AnyClient) {}

  async getReport(companyId: string, periodProfitOverride?: number): Promise<DividendCalculatorReport> {
    // ── 1. Fetch data in parallel ─────────────────────────────────────────────
    const [
      partnersResult,
      commitmentsResult,
      balanceSheetResult,
      eventsResult,
    ] = await Promise.allSettled([
      // partners — active, non-deleted
      this.supabase
        .from('partners')
        .select('id, name, share_ratio, is_active')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .order('name', { ascending: true }),

      // capital commitments — committed vs paid
      this.supabase
        .from('partner_capital_commitments')
        .select('partner_id, committed_try, paid_try')
        .eq('company_id', companyId),

      // balance sheet snapshots — most recent for legal reserves
      this.supabase
        .from('balance_sheet_snapshots')
        .select('legal_reserves, snapshot_date')
        .eq('company_id', companyId)
        .order('snapshot_date', { ascending: false })
        .limit(1),

      // finance events — YTD dividends paid per partner
      this.supabase
        .from('partner_finance_events')
        .select('partner_id, event_type, amount_try')
        .eq('company_id', companyId)
        .eq('event_type', 'DIVIDEND_PAID'),
    ])

    // ── 2. Extract data with graceful fallbacks ───────────────────────────────

    const partnerRows: Array<{
      id: string
      name: string
      share_ratio: number
      is_active: boolean
    }> =
      partnersResult.status === 'fulfilled' && !partnersResult.value.error
        ? (partnersResult.value.data ?? []).map((p: Record<string, unknown>) => ({
            id:          String(p.id ?? ''),
            name:        String(p.name ?? ''),
            share_ratio: Number(p.share_ratio ?? 0),
            is_active:   Boolean(p.is_active),
          }))
        : []

    // Aggregate capital commitments per partner
    const commitMap = new Map<string, { committed: number; paid: number }>()
    if (commitmentsResult.status === 'fulfilled' && !commitmentsResult.value.error) {
      for (const row of (commitmentsResult.value.data ?? []) as Array<{
        partner_id: string
        committed_try?: number | null
        paid_try?: number | null
      }>) {
        const existing = commitMap.get(row.partner_id) ?? { committed: 0, paid: 0 }
        commitMap.set(row.partner_id, {
          committed: existing.committed + Number(row.committed_try ?? 0),
          paid:      existing.paid      + Number(row.paid_try      ?? 0),
        })
      }
    }

    // Period profit: override, else the CANONICAL YTD net income (revenue − COGS −
    // all opex − corporate tax) — the same basis as the dividend declaration, so the
    // preview matches what can actually be declared. (Was accounting_periods
    // .net_profit_try, a non-existent column → always 0.)
    let periodProfit = 0
    if (periodProfitOverride !== undefined) {
      periodProfit = periodProfitOverride
    } else {
      try {
        const { FinanceService } = await import('@/lib/services/finance.service')
        const yr = new Date().getFullYear()
        const summary = await FinanceService.getFinancialSummary(
          '', companyId,
          { from: `${yr}-01-01`, to: new Date().toISOString().slice(0, 10) },
          undefined, undefined, this.supabase,
        )
        periodProfit = round2(summary.net_after_tax_try)
      } catch {
        periodProfit = 0
      }
    }

    // Existing legal reserves
    let existingLegalReserves = 0
    if (
      balanceSheetResult.status === 'fulfilled' &&
      !balanceSheetResult.value.error &&
      (balanceSheetResult.value.data ?? []).length > 0
    ) {
      const row = balanceSheetResult.value.data[0] as Record<string, unknown>
      existingLegalReserves = Number(row.legal_reserves ?? 0)
    }

    // YTD dividend events per partner
    const dividendEventMap = new Map<string, Array<{ event_type: string; amount_try: number }>>()
    if (eventsResult.status === 'fulfilled' && !eventsResult.value.error) {
      for (const row of (eventsResult.value.data ?? []) as Array<{
        partner_id: string
        event_type: string
        amount_try?: number | null
      }>) {
        const list = dividendEventMap.get(row.partner_id) ?? []
        list.push({ event_type: row.event_type, amount_try: Number(row.amount_try ?? 0) })
        dividendEventMap.set(row.partner_id, list)
      }
    }

    // ── 3. Compute company-level figures ──────────────────────────────────────

    // Paid-in capital = sum of paid_try across all commitments
    let paidInCapital = 0
    let totalCommitted = 0
    for (const c of commitMap.values()) {
      paidInCapital  += c.paid
      totalCommitted += c.committed
    }
    paidInCapital  = round2(paidInCapital)
    totalCommitted = round2(totalCommitted)

    // Equity gap = sum of (committed - paid) across all partners
    const equityGap = Math.max(0, round2(totalCommitted - paidInCapital))

    // Legal reserve deduction
    const legalReserveDeduction = computeLegalReserveDeduction(
      periodProfit,
      paidInCapital,
      existingLegalReserves,
    )

    // Distributable profit (no board retained amount at this level)
    const boardRetainedAmount = 0
    const distributableProfit = computeDistributableProfit(
      periodProfit,
      legalReserveDeduction,
      boardRetainedAmount,
    )

    // Proposed gross = optimal distribution
    const proposedGrossDividend = computeOptimalDistribution(distributableProfit)

    // Guards
    const ttk509Check       = checkTtk509Guard(proposedGrossDividend, distributableProfit)
    const equityGapWarning  = checkEquityGapWarning(equityGap)
    const readiness         = classifyDistributionReadiness(distributableProfit, proposedGrossDividend, equityGap)

    // ── 4. Build per-partner allocations ──────────────────────────────────────

    const partnerShareInput = partnerRows.map(p => ({
      partner_id: p.id,
      share_pct:  round2(p.share_ratio * 100),
    }))

    const distributions = distributeGrossDividend(proposedGrossDividend, partnerShareInput)

    const allocations: PartnerDividendAllocation[] = distributions.map(d => {
      const pRow   = partnerRows.find(p => p.id === d.partner_id)!
      const events = dividendEventMap.get(d.partner_id) ?? []
      const ytd    = computeYtdDividendsPaid(events, d.partner_id)

      return {
        partner_id:             d.partner_id,
        partner_name:           pRow?.name ?? '',
        share_pct:              d.share_pct,
        gross_dividend:         d.gross_dividend,
        withholding_tax:        d.withholding_tax,
        net_dividend:           d.net_dividend,
        ytd_dividends_paid:     ytd,
        cumulative_net_received: round2(d.net_dividend + ytd),
      }
    })

    // ── 5. Totals and metrics ─────────────────────────────────────────────────

    const totalWithholdingTax = round2(allocations.reduce((s, a) => s + a.withholding_tax, 0))
    const totalNetDividend    = round2(allocations.reduce((s, a) => s + a.net_dividend, 0))

    const payoutRatio   = computePayoutRatio(proposedGrossDividend, periodProfit)
    const dividendYield = computeDividendYield(proposedGrossDividend, paidInCapital)

    const narrative = generateDistributionNarrative(
      readiness,
      distributableProfit,
      proposedGrossDividend,
      partnerRows.length,
    )

    return {
      as_of_date:               new Date().toISOString().slice(0, 10),
      period_profit:            round2(periodProfit),
      legal_reserve_deduction:  round2(legalReserveDeduction),
      board_retained_amount:    boardRetainedAmount,
      distributable_profit:     round2(distributableProfit),
      proposed_gross_dividend:  round2(proposedGrossDividend),
      total_withholding_tax:    totalWithholdingTax,
      total_net_dividend:       totalNetDividend,
      allocations,
      ttk509_check:             ttk509Check,
      equity_gap_warning:       equityGapWarning,
      payout_ratio:             payoutRatio,
      dividend_yield:           dividendYield,
      readiness,
      paid_in_capital:          paidInCapital,
      existing_legal_reserves:  round2(existingLegalReserves),
      equity_gap:               equityGap,
      narrative,
    }
  }
}
