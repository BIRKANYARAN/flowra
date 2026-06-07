// ═══════════════════════════════════════════════════════════════════════════════
// lib/services/pcle/partner-capital-statement.service.ts
//
// Partner Capital Statement Service
//
// Tracks equity, loans, distributions, and net position per partner.
// Produces a point-in-time capital statement showing:
//   - Committed vs paid capital per partner
//   - Outstanding loan balances
//   - All-time distributions (dividends + compensation)
//   - Net equity position and capital fulfillment metrics
//
// Pure exports (testable without DB):
//   computeUnpaidCapital
//   computeCapitalFulfillmentPct
//   computeNetEquityPosition
//   computeLoanToEquityRatio
//   classifyCapitalFulfillment
//   classifyLoanBurden
//   computePartnerCapitalLine
//   buildCapitalSummary
//   classifyCompanyCapitalHealth
//   generateCapitalNarrative
//   computeCapitalCallAmount
//   rankPartnersByLoanBurden
// ═══════════════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Public interfaces ─────────────────────────────────────────────────────────

export interface PartnerCapitalLine {
  partner_id: string
  partner_name: string
  share_pct: number               // 0-100 (converted from share_ratio 0-1)
  committed_capital_try: number
  paid_capital_try: number
  unpaid_capital_try: number      // committed - paid, min 0
  outstanding_loans_try: number
  accrued_interest_try: number
  total_distributions_try: number // all-time dividends + compensation paid
  net_equity_position_try: number // paid_capital - outstanding_loans - unpaid_capital
  capital_fulfillment_pct: number // paid/committed × 100, 100 if committed=0
  loan_to_equity_ratio: number | null  // outstanding_loans / paid_capital, null if paid=0
}

export interface CapitalStatementSummary {
  total_paid_capital_try: number
  total_committed_capital_try: number
  total_outstanding_loans_try: number
  total_distributions_try: number
  company_equity_try: number            // sum of paid_capital across all partners
  weighted_avg_fulfillment_pct: number  // weighted by share_pct
}

export interface PartnerCapitalStatementReport {
  as_of_date: string
  partner_lines: PartnerCapitalLine[]
  summary: CapitalStatementSummary
  company_capital_health: ReturnType<typeof classifyCompanyCapitalHealth>
  narrative: string
  partner_count: number
  fully_funded_partners: number    // fulfillment_pct >= 100
  partners_with_loans: number      // outstanding_loans > 0
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

// ── Pure exported functions ───────────────────────────────────────────────────

/**
 * Compute unpaid capital = max(0, committed - paid).
 */
export function computeUnpaidCapital(committed: number, paid: number): number {
  return Math.max(0, round2(committed - paid))
}

/**
 * Compute capital fulfillment percentage = paid/committed × 100.
 * Returns 100 if committed === 0.
 * Result is clamped to 0–100.
 */
export function computeCapitalFulfillmentPct(paid: number, committed: number): number {
  if (committed === 0) return 100
  return clamp(round2((paid / committed) * 100), 0, 100)
}

/**
 * Compute net equity position = paidCapital - outstandingLoans - unpaidCapital.
 * Result can be negative.
 */
export function computeNetEquityPosition(
  paidCapital: number,
  outstandingLoans: number,
  unpaidCapital: number,
): number {
  return round2(paidCapital - outstandingLoans - unpaidCapital)
}

/**
 * Compute loan-to-equity ratio = outstandingLoans / paidCapital.
 * Returns null when paidCapital === 0 (undefined ratio).
 */
export function computeLoanToEquityRatio(
  outstandingLoans: number,
  paidCapital: number,
): number | null {
  if (paidCapital === 0) return null
  return round2(outstandingLoans / paidCapital)
}

/**
 * Classify capital fulfillment percentage into 5 tiers.
 */
export function classifyCapitalFulfillment(
  fulfillmentPct: number,
): 'complete' | 'near_complete' | 'partial' | 'low' | 'critical' {
  if (fulfillmentPct >= 100) return 'complete'
  if (fulfillmentPct >= 90)  return 'near_complete'
  if (fulfillmentPct >= 50)  return 'partial'
  if (fulfillmentPct >= 25)  return 'low'
  return 'critical'
}

/**
 * Classify loan burden based on loan-to-equity ratio.
 * null or 0 → no_debt
 * ratio <= 0.5 → low
 * ratio <= 1.0 → moderate
 * ratio <= 2.0 → high
 * ratio > 2.0 → severe
 */
export function classifyLoanBurden(
  loanToEquityRatio: number | null,
): 'no_debt' | 'low' | 'moderate' | 'high' | 'severe' {
  if (loanToEquityRatio === null || loanToEquityRatio === 0) return 'no_debt'
  if (loanToEquityRatio <= 0.5) return 'low'
  if (loanToEquityRatio <= 1.0) return 'moderate'
  if (loanToEquityRatio <= 2.0) return 'high'
  return 'severe'
}

/**
 * Build a full PartnerCapitalLine from raw inputs.
 */
export function computePartnerCapitalLine(
  partner: { id: string; name: string; share_pct: number },
  committed_capital_try: number,
  paid_capital_try: number,
  outstanding_loans_try: number,
  accrued_interest_try: number,
  total_distributions_try: number,
): PartnerCapitalLine {
  const unpaid = computeUnpaidCapital(committed_capital_try, paid_capital_try)
  const net    = computeNetEquityPosition(paid_capital_try, outstanding_loans_try, unpaid)
  const fulfil = computeCapitalFulfillmentPct(paid_capital_try, committed_capital_try)
  const lte    = computeLoanToEquityRatio(outstanding_loans_try, paid_capital_try)

  return {
    partner_id:              partner.id,
    partner_name:            partner.name,
    share_pct:               round2(partner.share_pct),
    committed_capital_try:   round2(committed_capital_try),
    paid_capital_try:        round2(paid_capital_try),
    unpaid_capital_try:      unpaid,
    outstanding_loans_try:   round2(outstanding_loans_try),
    accrued_interest_try:    round2(accrued_interest_try),
    total_distributions_try: round2(total_distributions_try),
    net_equity_position_try: net,
    capital_fulfillment_pct: fulfil,
    loan_to_equity_ratio:    lte,
  }
}

/**
 * Build company-level capital summary from partner lines.
 * weighted_avg_fulfillment_pct = Σ(fulfillment_pct × share_pct) / Σ(share_pct)
 * Returns 0 for weighted avg if no partners.
 */
export function buildCapitalSummary(lines: PartnerCapitalLine[]): CapitalStatementSummary {
  let totalPaid         = 0
  let totalCommitted    = 0
  let totalLoans        = 0
  let totalDistributions = 0
  let weightedFulfil    = 0
  let totalSharePct     = 0

  for (const l of lines) {
    totalPaid          += l.paid_capital_try
    totalCommitted     += l.committed_capital_try
    totalLoans         += l.outstanding_loans_try
    totalDistributions += l.total_distributions_try
    weightedFulfil     += l.capital_fulfillment_pct * l.share_pct
    totalSharePct      += l.share_pct
  }

  const weightedAvg = totalSharePct > 0 ? round2(weightedFulfil / totalSharePct) : 0

  return {
    total_paid_capital_try:       round2(totalPaid),
    total_committed_capital_try:  round2(totalCommitted),
    total_outstanding_loans_try:  round2(totalLoans),
    total_distributions_try:      round2(totalDistributions),
    company_equity_try:           round2(totalPaid),
    weighted_avg_fulfillment_pct: weightedAvg,
  }
}

/**
 * Classify overall company capital health.
 * excellent: fulfillment >=90% AND total_loans/total_equity <= 0.5
 * good: fulfillment >=75% AND total_loans/total_equity <= 1.0
 * fair: fulfillment >=50%
 * poor: fulfillment >=25%
 * critical: <25% OR (partnerCount === 0)
 */
export function classifyCompanyCapitalHealth(
  summary: CapitalStatementSummary,
  partnerCount: number,
): 'excellent' | 'good' | 'fair' | 'poor' | 'critical' {
  if (partnerCount === 0) return 'critical'

  const fulfil = summary.weighted_avg_fulfillment_pct
  const equity = summary.total_paid_capital_try > 0 ? summary.total_paid_capital_try : 1
  const loanRatio = summary.total_outstanding_loans_try / equity

  if (fulfil >= 90 && loanRatio <= 0.5) return 'excellent'
  if (fulfil >= 75 && loanRatio <= 1.0) return 'good'
  if (fulfil >= 50) return 'fair'
  if (fulfil >= 25) return 'poor'
  return 'critical'
}

/**
 * Generate a deterministic Turkish narrative based on company capital health.
 */
export function generateCapitalNarrative(
  health: ReturnType<typeof classifyCompanyCapitalHealth>,
  _summary: CapitalStatementSummary,
  _partnerCount: number,
): string {
  switch (health) {
    case 'excellent':
      return 'Ortak sermaye yapısı sağlıklı — taahhütlerin büyük bölümü karşılandı.'
    case 'good':
      return 'Sermaye taahhütleri büyük ölçüde karşılandı — borç seviyeleri makul.'
    case 'fair':
      return 'Sermaye taahhütlerinin kısmen karşılandığı görülüyor — takip önerilir.'
    case 'poor':
      return 'Sermaye açığı dikkat çekici — taahhüt karşılama oranı düşük.'
    case 'critical':
      return 'Kritik: Sermaye taahhütleri karşılanmamış veya ortak tanımlı değil.'
  }
}

/**
 * Compute capital call amount = max(0, committed - paid) × callPct / 100.
 */
export function computeCapitalCallAmount(
  committed: number,
  paid: number,
  callPct: number,
): number {
  const unpaid = Math.max(0, committed - paid)
  return round2(unpaid * callPct / 100)
}

/**
 * Rank partners by outstanding_loans_try descending.
 */
export function rankPartnersByLoanBurden(lines: PartnerCapitalLine[]): PartnerCapitalLine[] {
  return [...lines].sort((a, b) => b.outstanding_loans_try - a.outstanding_loans_try)
}

// ── Service class ─────────────────────────────────────────────────────────────

export class PartnerCapitalStatementService {
  constructor(private readonly supabase: AnyClient) {}

  async getStatement(companyId: string): Promise<PartnerCapitalStatementReport> {
    // ── 1. Fetch data in parallel ─────────────────────────────────────────────
    const [partnersResult, commitmentsResult, loansResult, eventsResult] =
      await Promise.allSettled([
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

        // active loan tranches — outstanding balances
        this.supabase
          .from('partner_loan_tranches')
          // no outstanding_try column — consumer falls back to principal_try − total_repaid_try
          .select('partner_id, principal_try, total_repaid_try')
          .eq('company_id', companyId)
          .eq('status', 'active')
          .is('deleted_at', null),

        // finance events — distributions
        this.supabase
          .from('partner_finance_events')
          .select('partner_id, event_type, amount_try')
          .eq('company_id', companyId)
          .in('event_type', ['DIVIDEND_PAID', 'COMPENSATION_PAYMENT']),
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

    // Aggregate commitments per partner
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

    // Aggregate outstanding loans per partner
    const loanMap = new Map<string, number>()
    if (loansResult.status === 'fulfilled' && !loansResult.value.error) {
      for (const row of (loansResult.value.data ?? []) as Array<{
        partner_id: string
        outstanding_try?: number | null
        principal_try?: number | null
        total_repaid_try?: number | null
      }>) {
        // Prefer outstanding_try; fall back to principal - total_repaid
        const outstanding =
          row.outstanding_try != null
            ? Number(row.outstanding_try)
            : Math.max(
                0,
                Number(row.principal_try ?? 0) - Number(row.total_repaid_try ?? 0),
              )
        loanMap.set(row.partner_id, (loanMap.get(row.partner_id) ?? 0) + outstanding)
      }
    }

    // Aggregate distributions per partner
    const distMap = new Map<string, number>()
    if (eventsResult.status === 'fulfilled' && !eventsResult.value.error) {
      for (const row of (eventsResult.value.data ?? []) as Array<{
        partner_id: string
        event_type: string
        amount_try?: number | null
      }>) {
        distMap.set(
          row.partner_id,
          (distMap.get(row.partner_id) ?? 0) + Number(row.amount_try ?? 0),
        )
      }
    }

    // ── 3. Build partner capital lines ────────────────────────────────────────
    const partnerLines: PartnerCapitalLine[] = partnerRows.map(p => {
      const sharePct = round2(p.share_ratio * 100)
      const commits  = commitMap.get(p.id) ?? { committed: 0, paid: 0 }
      const loans    = loanMap.get(p.id) ?? 0
      const dists    = distMap.get(p.id) ?? 0

      return computePartnerCapitalLine(
        { id: p.id, name: p.name, share_pct: sharePct },
        commits.committed,
        commits.paid,
        loans,
        0,    // accrued_interest_try: computed dynamically by interest-accrual service
        dists,
      )
    })

    // ── 4. Build summary and classifications ──────────────────────────────────
    const summary = buildCapitalSummary(partnerLines)
    const health  = classifyCompanyCapitalHealth(summary, partnerLines.length)
    const narrative = generateCapitalNarrative(health, summary, partnerLines.length)

    const fullyFunded     = partnerLines.filter(l => l.capital_fulfillment_pct >= 100).length
    const partnersWithLoans = partnerLines.filter(l => l.outstanding_loans_try > 0).length

    return {
      as_of_date:           new Date().toISOString().slice(0, 10),
      partner_lines:        partnerLines,
      summary,
      company_capital_health: health,
      narrative,
      partner_count:        partnerLines.length,
      fully_funded_partners: fullyFunded,
      partners_with_loans:  partnersWithLoans,
    }
  }
}
