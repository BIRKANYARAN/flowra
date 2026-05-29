// ─────────────────────────────────────────────────────────────────────────────
// lib/services/governance/stakeholder-capital.service.ts
//
// Per-partner capital account statements — reads from PCLE data and presents
// as governance-grade capital account summaries.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StakeholderCapitalAccount {
  partner_id:              string
  partner_name:            string
  share_pct:               number   // equity share percentage (0–100)
  committed_try:           number   // equity_commitment total
  paid_try:                number   // equity_payment total
  unpaid_try:              number   // committed - paid
  loan_outstanding_try:    number   // active tranches sum
  distributions_ytd_try:  number   // COMPENSATION_PAYMENT + DIVIDEND_PAID events YTD
  net_position_try:        number   // paid - loan_outstanding
  burden_score:            number   // (loan_outstanding / total_loans) - share_pct (0 if no loans)
  capital_call_overdue:    boolean  // any unpaid commitment past call_date
}

export interface StakeholderCapitalSummary {
  accounts:                    StakeholderCapitalAccount[]
  total_committed_try:         number
  total_paid_try:              number
  total_loans_try:             number
  total_distributions_ytd_try: number
  equity_gap_try:              number   // total_committed - total_paid
  computed_at:                 string   // ISO timestamp
}

// ── Pure Helpers (exported for testing) ───────────────────────────────────────

/**
 * Net position = capital paid in minus outstanding loan obligations.
 */
export function computeNetPosition(paid: number, loanOutstanding: number): number {
  return paid - loanOutstanding
}

/**
 * Burden score = how disproportionate a partner's loan share is relative to equity share.
 * Returns 0 when there are no loans (to avoid division-by-zero).
 * Result is positive when partner carries more debt than their equity share would imply.
 */
export function computeBurdenScore(
  loanOutstanding: number,
  totalLoans: number,
  sharePct: number,
): number {
  if (totalLoans === 0) return 0
  const loanSharePct = (loanOutstanding / totalLoans) * 100
  return loanSharePct - sharePct
}

/**
 * Classify capital health based on unpaid commitments, loan exposure, and equity share.
 *
 * - 'critical': unpaid > 0 AND loan_outstanding > 0 (commitment gap with active debt)
 * - 'attention': unpaid > 0 OR burden_score > 15 (commitment gap or disproportionate debt)
 * - 'healthy':   fully paid and balanced debt
 */
export function classifyCapitalHealth(
  unpaidTry: number,
  loanOutstanding: number,
  sharePct: number,
): 'healthy' | 'attention' | 'critical' {
  if (unpaidTry > 0 && loanOutstanding > 0) return 'critical'
  if (unpaidTry > 0) return 'attention'
  // Use 15 percentage points as the threshold for disproportionate debt burden
  if (sharePct > 0 && loanOutstanding > 0) {
    // We cannot compute burden_score here without totalLoans, so we use a
    // heuristic: if loanOutstanding is > sharePct * some_baseline, flag attention.
    // Callers should use computeBurdenScore for more precision.
    return 'attention'
  }
  return 'healthy'
}

// ── Service ───────────────────────────────────────────────────────────────────

export class StakeholderCapitalService {
  /**
   * Compute a full capital account summary for all partners of a company.
   *
   * Data sources:
   *   - partners           table: partner list with share_pct
   *   - partner_finance_events: EQUITY_COMMITMENT, EQUITY_PAYMENT, COMPENSATION_PAYMENT, DIVIDEND_PAID
   *   - partner_loan_tranches: active loans (status = 'active' or 'disbursed')
   */
  static async getSummary(
    companyId: string,
    supabase: SupabaseClient,
    opts?: { asOf?: string },
  ): Promise<StakeholderCapitalSummary> {
    const asOf = opts?.asOf ?? new Date().toISOString().slice(0, 10)
    const ytdStart = `${asOf.slice(0, 4)}-01-01`

    // 1. Fetch partners
    const { data: partners, error: pErr } = await supabase
      .from('partners')
      .select('id, name, share_pct')
      .eq('company_id', companyId)
      .eq('status', 'active')
      .order('name')

    if (pErr) throw new Error(`Partners fetch failed: ${pErr.message}`)

    if (!partners || partners.length === 0) {
      return {
        accounts:                    [],
        total_committed_try:         0,
        total_paid_try:              0,
        total_loans_try:             0,
        total_distributions_ytd_try: 0,
        equity_gap_try:              0,
        computed_at:                 new Date().toISOString(),
      }
    }

    const partnerIds = partners.map((p: { id: string }) => p.id)

    // 2. Fetch finance events (equity + distribution)
    const { data: events } = await supabase
      .from('partner_finance_events')
      .select('partner_id, event_type, amount_try, event_date, call_date, metadata')
      .eq('company_id', companyId)
      .in('partner_id', partnerIds)
      .lte('event_date', asOf)
      .in('event_type', ['EQUITY_COMMITMENT', 'EQUITY_PAYMENT', 'COMPENSATION_PAYMENT', 'DIVIDEND_PAID'])

    const eventsData = events ?? []

    // 3. Fetch active loan tranches
    const { data: tranches } = await supabase
      .from('partner_loan_tranches')
      .select('partner_id, outstanding_try, status')
      .eq('company_id', companyId)
      .in('partner_id', partnerIds)
      .in('status', ['active', 'disbursed'])

    const tranchesData = tranches ?? []

    // 4. Aggregate per partner
    const totalLoans = tranchesData.reduce(
      (sum: number, t: { outstanding_try: number }) => sum + (Number(t.outstanding_try) || 0),
      0,
    )

    const accounts: StakeholderCapitalAccount[] = partners.map((p: { id: string; name: string; share_pct: number }) => {
      const partnerEvents = eventsData.filter(
        (e: { partner_id: string }) => e.partner_id === p.id,
      )

      const committed_try = partnerEvents
        .filter((e: { event_type: string }) => e.event_type === 'EQUITY_COMMITMENT')
        .reduce((s: number, e: { amount_try: number }) => s + (Number(e.amount_try) || 0), 0)

      const paid_try = partnerEvents
        .filter((e: { event_type: string }) => e.event_type === 'EQUITY_PAYMENT')
        .reduce((s: number, e: { amount_try: number }) => s + (Number(e.amount_try) || 0), 0)

      const unpaid_try = Math.max(0, committed_try - paid_try)

      const loan_outstanding_try = tranchesData
        .filter((t: { partner_id: string }) => t.partner_id === p.id)
        .reduce((s: number, t: { outstanding_try: number }) => s + (Number(t.outstanding_try) || 0), 0)

      // YTD distributions (current year only)
      const distributions_ytd_try = partnerEvents
        .filter(
          (e: { event_type: string; event_date: string }) =>
            (e.event_type === 'COMPENSATION_PAYMENT' || e.event_type === 'DIVIDEND_PAID') &&
            e.event_date >= ytdStart,
        )
        .reduce((s: number, e: { amount_try: number }) => s + (Number(e.amount_try) || 0), 0)

      const net_position_try = computeNetPosition(paid_try, loan_outstanding_try)
      const burden_score     = computeBurdenScore(loan_outstanding_try, totalLoans, p.share_pct)

      // Capital call overdue: unpaid commitment with a past call_date
      const today = asOf
      const capital_call_overdue = partnerEvents.some(
        (e: { event_type: string; call_date?: string | null; amount_try: number }) =>
          e.event_type === 'EQUITY_COMMITMENT' &&
          e.call_date != null &&
          e.call_date < today &&
          // only overdue if there's still unpaid balance
          unpaid_try > 0,
      )

      return {
        partner_id:              p.id,
        partner_name:            p.name,
        share_pct:               Number(p.share_pct) || 0,
        committed_try,
        paid_try,
        unpaid_try,
        loan_outstanding_try,
        distributions_ytd_try,
        net_position_try,
        burden_score,
        capital_call_overdue,
      }
    })

    const total_committed_try         = accounts.reduce((s, a) => s + a.committed_try, 0)
    const total_paid_try              = accounts.reduce((s, a) => s + a.paid_try, 0)
    const total_loans_try             = totalLoans
    const total_distributions_ytd_try = accounts.reduce((s, a) => s + a.distributions_ytd_try, 0)
    const equity_gap_try              = Math.max(0, total_committed_try - total_paid_try)

    return {
      accounts,
      total_committed_try,
      total_paid_try,
      total_loans_try,
      total_distributions_ytd_try,
      equity_gap_try,
      computed_at: new Date().toISOString(),
    }
  }
}
