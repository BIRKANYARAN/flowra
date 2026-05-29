// ═══════════════════════════════════════════════════════════════════════════════
// lib/services/pcle/equity-commitment.service.ts
//
// Partner Equity Commitment Tracking Analytics
//
// Computes a comprehensive equity commitment report for a company's
// partner equity portfolio, including:
//   - Equity gap per partner (committed minus paid)
//   - Fulfillment ratio and status classification
//   - Capital call overdue days and urgency
//   - TTK 588 statutory interest on overdue capital
//   - Company-level equity health classification
//   - Effective equity ratio and leverage level
//   - Weighted average fulfillment
//   - Turkish narrative summary
//
// All pure functions are exported for unit testing.
// ═══════════════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Pure computation functions ────────────────────────────────────────────────

/**
 * Compute equity gap: total committed minus total paid.
 * Gap is never negative (returns 0 if paid >= committed).
 */
export function computeEquityGap(
  committedAmount: number,
  paidAmount: number,
): number {
  return Math.max(0, committedAmount - paidAmount)
}

/**
 * Compute fulfillment ratio: paid / committed.
 * Returns null if committedAmount <= 0.
 * Result can exceed 1.0 if overpaid.
 */
export function computeFulfillmentRatio(
  committedAmount: number,
  paidAmount: number,
): number | null {
  if (committedAmount <= 0) return null
  return paidAmount / committedAmount
}

/**
 * Classify fulfillment status based on the fulfillment ratio.
 *   complete:        ratio >= 1.0 (100%)
 *   nearly_complete: ratio >= 0.90
 *   partial:         ratio >= 0.50
 *   minimal:         ratio >= 0.10
 *   unfulfilled:     ratio <  0.10 but > 0 (or ratio <= 0 with commitment)
 *   no_commitment:   null
 */
export function classifyFulfillmentStatus(
  ratio: number | null,
): 'complete' | 'nearly_complete' | 'partial' | 'minimal' | 'unfulfilled' | 'no_commitment' {
  if (ratio === null) return 'no_commitment'
  if (ratio >= 1.0) return 'complete'
  if (ratio >= 0.90) return 'nearly_complete'
  if (ratio >= 0.50) return 'partial'
  if (ratio >= 0.10) return 'minimal'
  return 'unfulfilled'
}

/**
 * Compute days overdue for a capital call.
 * Returns null if callDate is null.
 * Returns 0 if callDate is in the future (not yet due).
 * Returns 0 if paidDate exists and paidDate <= callDate (on time or early).
 * Returns positive days if callDate <= today AND (paidDate is null OR paidDate > callDate).
 */
export function computeCapitalCallOverdueDays(
  callDate: string | null,
  paidDate: string | null,
): number | null {
  if (callDate === null) return null

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const call = new Date(callDate)
  call.setHours(0, 0, 0, 0)

  // Not yet due
  if (call > today) return 0

  // Paid on time or early
  if (paidDate !== null) {
    const paid = new Date(paidDate)
    paid.setHours(0, 0, 0, 0)
    if (paid <= call) return 0
    // Paid but late — overdue days = paidDate - callDate
    const diffMs = paid.getTime() - call.getTime()
    return Math.floor(diffMs / (1000 * 60 * 60 * 24))
  }

  // Not paid and past due
  const diffMs = today.getTime() - call.getTime()
  return Math.floor(diffMs / (1000 * 60 * 60 * 24))
}

/**
 * Classify capital call urgency.
 *   paid:             isPaid=true (regardless of overdueDays)
 *   not_due:          overdueDays=null
 *   due_today:        overdueDays=0 AND !isPaid
 *   overdue_7d:       overdueDays <= 7
 *   overdue_30d:      overdueDays <= 30
 *   overdue_90d:      overdueDays <= 90
 *   severely_overdue: overdueDays > 90
 */
export function classifyCallUrgency(
  overdueDays: number | null,
  isPaid: boolean,
): 'paid' | 'due_today' | 'overdue_7d' | 'overdue_30d' | 'overdue_90d' | 'not_due' | 'severely_overdue' {
  if (isPaid) return 'paid'
  if (overdueDays === null) return 'not_due'
  if (overdueDays === 0) return 'due_today'
  if (overdueDays <= 7) return 'overdue_7d'
  if (overdueDays <= 30) return 'overdue_30d'
  if (overdueDays <= 90) return 'overdue_90d'
  return 'severely_overdue'
}

/**
 * Compute TTK 588 statutory interest on overdue capital.
 * Formula: overduePrincipal × annualRatePct / 100 × overdueDays / 365
 * Default annual rate: 9.0% (Turkish commercial statutory rate).
 */
export function computeStatutoryInterest(
  overduePrincipal: number,
  overdueDays: number,
  annualRatePct = 9.0,
): number {
  if (overduePrincipal <= 0 || overdueDays <= 0) return 0
  return overduePrincipal * (annualRatePct / 100) * (overdueDays / 365)
}

/**
 * Compute total unfulfilled commitment across all partners.
 */
export function computeTotalEquityGap(
  partners: Array<{ committed_amount: number; paid_amount: number }>,
): number {
  return partners.reduce(
    (sum, p) => sum + computeEquityGap(p.committed_amount, p.paid_amount),
    0,
  )
}

/**
 * Compute company equity fulfillment ratio: total paid / total committed.
 * Returns null if total committed = 0.
 */
export function computeCompanyFulfillmentRatio(
  partners: Array<{ committed_amount: number; paid_amount: number }>,
): number | null {
  const totalCommitted = partners.reduce((s, p) => s + p.committed_amount, 0)
  const totalPaid = partners.reduce((s, p) => s + p.paid_amount, 0)
  return computeFulfillmentRatio(totalCommitted, totalPaid)
}

/**
 * Compute weighted average fulfillment (weighted by committed amount).
 * Returns null if total weight = 0.
 */
export function computeWeightedFulfillment(
  partners: Array<{ committed_amount: number; paid_amount: number }>,
): number | null {
  const totalWeight = partners.reduce((s, p) => s + p.committed_amount, 0)
  if (totalWeight <= 0) return null
  const weightedSum = partners.reduce((s, p) => {
    const ratio = computeFulfillmentRatio(p.committed_amount, p.paid_amount)
    if (ratio === null) return s
    return s + ratio * p.committed_amount
  }, 0)
  return weightedSum / totalWeight
}

/**
 * Classify company-level equity health.
 *   fully_funded:          ratio >= 0.95
 *   nearly_funded:         ratio >= 0.80
 *   partially_funded:      ratio >= 0.50
 *   underfunded:           ratio >= 0.20
 *   critically_underfunded: ratio < 0.20
 *   no_data:               null
 */
export function classifyEquityHealth(
  ratio: number | null,
): 'fully_funded' | 'nearly_funded' | 'partially_funded' | 'underfunded' | 'critically_underfunded' | 'no_data' {
  if (ratio === null) return 'no_data'
  if (ratio >= 0.95) return 'fully_funded'
  if (ratio >= 0.80) return 'nearly_funded'
  if (ratio >= 0.50) return 'partially_funded'
  if (ratio >= 0.20) return 'underfunded'
  return 'critically_underfunded'
}

/**
 * Generate Turkish narrative for equity commitment health.
 */
export function generateEquityNarrative(params: {
  totalCommitted: number
  totalPaid: number
  equityGap: number
  health: ReturnType<typeof classifyEquityHealth>
  overduePartners: number
}): string {
  const { totalCommitted, totalPaid, equityGap, health, overduePartners } = params

  const healthLabels: Record<ReturnType<typeof classifyEquityHealth>, string> = {
    fully_funded:           'tam finanse edilmiş',
    nearly_funded:          'neredeyse tamamlanmış',
    partially_funded:       'kısmen finanse edilmiş',
    underfunded:            'yetersiz finanse',
    critically_underfunded: 'kritik düzeyde yetersiz finanse',
    no_data:                'veri yetersiz',
  }

  const pct = totalCommitted > 0
    ? Math.round((totalPaid / totalCommitted) * 100)
    : 0

  const paidText = totalCommitted > 0
    ? `Toplam sermaye taahhüdünün %${pct}'i ödenmiş (${healthLabels[health]}).`
    : 'Kayıtlı sermaye taahhüdü bulunmamaktadır.'

  const gapText = equityGap > 0
    ? ` Ödenmemiş taahhüt tutarı ₺${Math.round(equityGap).toLocaleString('tr-TR')}.`
    : ' Tüm sermaye taahhütleri yerine getirilmiştir.'

  const overdueText = overduePartners > 0
    ? ` ${overduePartners} ortağın vadesi geçmiş ödemesi var.`
    : ''

  return `${paidText}${gapText}${overdueText}`
}

/**
 * Compute effective equity ratio: paidEquity / (paidEquity + totalLoans).
 * Returns null if total financing = 0.
 */
export function computeEffectiveEquityRatio(
  totalPaidEquity: number,
  totalLoans: number,
): number | null {
  const total = totalPaidEquity + totalLoans
  if (total <= 0) return null
  return totalPaidEquity / total
}

/**
 * Classify leverage level based on effective equity ratio.
 *   equity_heavy:      ratio >= 0.70 (70%+ equity)
 *   balanced:          ratio >= 0.40
 *   leveraged:         ratio >= 0.20
 *   highly_leveraged:  ratio < 0.20
 *   insufficient_data: null
 */
export function classifyLeverageLevel(
  equityRatio: number | null,
): 'equity_heavy' | 'balanced' | 'leveraged' | 'highly_leveraged' | 'insufficient_data' {
  if (equityRatio === null) return 'insufficient_data'
  if (equityRatio >= 0.70) return 'equity_heavy'
  if (equityRatio >= 0.40) return 'balanced'
  if (equityRatio >= 0.20) return 'leveraged'
  return 'highly_leveraged'
}

// ── Report interface ──────────────────────────────────────────────────────────

export interface EquityCommitmentReport {
  total_committed_try: number
  total_paid_try: number
  total_equity_gap_try: number
  company_fulfillment_ratio: number | null
  equity_health: ReturnType<typeof classifyEquityHealth>
  effective_equity_ratio: number | null
  leverage_level: ReturnType<typeof classifyLeverageLevel>
  statutory_interest_accrued_try: number
  per_partner: Array<{
    partner_id: string
    partner_name: string
    share_pct: number
    committed_try: number
    paid_try: number
    gap_try: number
    fulfillment_ratio: number | null
    fulfillment_status: ReturnType<typeof classifyFulfillmentStatus>
    overdue_days: number | null
    call_urgency: ReturnType<typeof classifyCallUrgency>
    statutory_interest_try: number
  }>
  narrative: string
}

// ── DB row shapes ─────────────────────────────────────────────────────────────

interface PartnerRow {
  id: string
  name: string | null
  share_pct: number | null
}

interface PartnerTransactionRow {
  partner_id: string | null
  amount_try: number
  tx_type: string
  tx_date: string | null
}

interface CapitalCommitmentRow {
  partner_id: string
  committed_amount: number | null
  paid_amount: number | null
  due_date: string | null
  paid_date: string | null
}

// ── Service Class ─────────────────────────────────────────────────────────────

export class EquityCommitmentService {
  constructor(private readonly supabase: AnyClient) {}

  async getReport(companyId: string): Promise<EquityCommitmentReport> {
    const [partnersRes, equityTxRes, commitmentRes, loanTxRes] =
      await Promise.allSettled([
        // All partners for this company
        this.supabase
          .from('partners')
          .select('id, name, share_pct')
          .eq('company_id', companyId)
          .is('deleted_at', null),

        // Equity payment and commitment transactions
        this.supabase
          .from('partner_transactions')
          .select('partner_id, amount_try, tx_type, tx_date')
          .eq('company_id', companyId)
          .is('deleted_at', null)
          .in('tx_type', ['equity_payment', 'capital_contribution', 'equity_commitment', 'capital_in']),

        // Partner capital commitments table (may not exist)
        this.supabase
          .from('partner_capital_commitments')
          .select('partner_id, committed_amount, paid_amount, due_date, paid_date')
          .eq('company_id', companyId)
          .is('deleted_at', null),

        // Loan transactions for effective equity ratio
        this.supabase
          .from('partner_transactions')
          .select('partner_id, amount_try, tx_type, tx_date')
          .eq('company_id', companyId)
          .is('deleted_at', null)
          .in('tx_type', ['loan_disbursement', 'partner_loan', 'loan_to_company', 'loan_repayment', 'loan_in', 'loan_out']),
      ])

    // ── Extract data gracefully ───────────────────────────────────────────────

    const partners: PartnerRow[] =
      partnersRes.status === 'fulfilled' ? (partnersRes.value.data ?? []) : []

    const equityTxs: PartnerTransactionRow[] =
      equityTxRes.status === 'fulfilled' ? (equityTxRes.value.data ?? []) : []

    // Commitments table may not exist (check for error)
    const commitmentRows: CapitalCommitmentRow[] =
      commitmentRes.status === 'fulfilled' && !commitmentRes.value.error
        ? (commitmentRes.value.data ?? [])
        : []

    const loanTxs: PartnerTransactionRow[] =
      loanTxRes.status === 'fulfilled' ? (loanTxRes.value.data ?? []) : []

    // ── Aggregate equity payments per partner from transactions ───────────────

    const equityPaidMap = new Map<string, number>()
    const equityCommittedMap = new Map<string, number>()

    for (const tx of equityTxs) {
      if (!tx.partner_id) continue
      const amt = Math.max(0, Number(tx.amount_try) || 0)
      if (tx.tx_type === 'equity_commitment') {
        equityCommittedMap.set(tx.partner_id, (equityCommittedMap.get(tx.partner_id) ?? 0) + amt)
      } else {
        // equity_payment, capital_contribution, capital_in
        equityPaidMap.set(tx.partner_id, (equityPaidMap.get(tx.partner_id) ?? 0) + amt)
      }
    }

    // ── Build commitment map from partner_capital_commitments (preferred) ─────

    const commitmentByPartner = new Map<string, {
      committed_amount: number
      paid_amount: number
      due_date: string | null
      paid_date: string | null
    }>()

    for (const row of commitmentRows) {
      const existing = commitmentByPartner.get(row.partner_id)
      const committed = Math.max(0, Number(row.committed_amount) || 0)
      const paid = Math.max(0, Number(row.paid_amount) || 0)
      if (existing) {
        existing.committed_amount += committed
        existing.paid_amount += paid
        // Use the most recent due_date for overdue calculation
        if (row.due_date && (!existing.due_date || row.due_date > existing.due_date)) {
          existing.due_date = row.due_date
          existing.paid_date = row.paid_date ?? null
        }
      } else {
        commitmentByPartner.set(row.partner_id, {
          committed_amount: committed,
          paid_amount: paid,
          due_date: row.due_date ?? null,
          paid_date: row.paid_date ?? null,
        })
      }
    }

    // If no capital_commitments table data, derive from transactions
    const useTransactionDerived = commitmentRows.length === 0

    // ── Net loan balance for effective equity ratio ───────────────────────────

    let totalNetLoans = 0
    for (const tx of loanTxs) {
      const amt = Math.max(0, Number(tx.amount_try) || 0)
      const isRepayment = tx.tx_type === 'loan_repayment' || tx.tx_type === 'loan_out'
      if (isRepayment) {
        totalNetLoans -= amt
      } else {
        totalNetLoans += amt
      }
    }
    totalNetLoans = Math.max(0, totalNetLoans)

    // ── Build per-partner report ──────────────────────────────────────────────

    let totalCommitted = 0
    let totalPaid = 0
    let totalStatutoryInterest = 0
    let overduePartnerCount = 0

    const perPartner = partners.map(p => {
      let committed: number
      let paid: number
      let dueDate: string | null
      let paidDate: string | null

      if (!useTransactionDerived && commitmentByPartner.has(p.id)) {
        const row = commitmentByPartner.get(p.id)!
        committed = row.committed_amount
        paid = row.paid_amount
        dueDate = row.due_date
        paidDate = row.paid_date
      } else {
        // Derive from transactions
        committed = equityCommittedMap.get(p.id) ?? 0
        paid = equityPaidMap.get(p.id) ?? 0
        // No call date available from pure transactions
        dueDate = null
        paidDate = null
      }

      const gap = computeEquityGap(committed, paid)
      const ratio = computeFulfillmentRatio(committed, paid)
      const status = classifyFulfillmentStatus(ratio)
      const overdueDays = computeCapitalCallOverdueDays(dueDate, paidDate)
      const isPaid = paid >= committed && committed > 0
      const urgency = classifyCallUrgency(overdueDays, isPaid)
      const statutoryInterest = computeStatutoryInterest(gap, overdueDays ?? 0)

      if (overdueDays !== null && overdueDays > 0 && !isPaid) {
        overduePartnerCount++
      }

      totalCommitted += committed
      totalPaid += paid
      totalStatutoryInterest += statutoryInterest

      return {
        partner_id: p.id,
        partner_name: p.name ?? 'Ortak',
        share_pct: Math.max(0, Number(p.share_pct) || 0),
        committed_try: committed,
        paid_try: paid,
        gap_try: gap,
        fulfillment_ratio: ratio,
        fulfillment_status: status,
        overdue_days: overdueDays,
        call_urgency: urgency,
        statutory_interest_try: statutoryInterest,
      }
    })

    // ── Aggregate totals ──────────────────────────────────────────────────────

    const totalGap = computeTotalEquityGap(
      perPartner.map(p => ({ committed_amount: p.committed_try, paid_amount: p.paid_try })),
    )

    const companyRatio = computeCompanyFulfillmentRatio(
      perPartner.map(p => ({ committed_amount: p.committed_try, paid_amount: p.paid_try })),
    )

    const equityHealth = classifyEquityHealth(companyRatio)

    const effectiveEquityRatio = computeEffectiveEquityRatio(totalPaid, totalNetLoans)
    const leverageLevel = classifyLeverageLevel(effectiveEquityRatio)

    const narrative = generateEquityNarrative({
      totalCommitted,
      totalPaid,
      equityGap: totalGap,
      health: equityHealth,
      overduePartners: overduePartnerCount,
    })

    return {
      total_committed_try: totalCommitted,
      total_paid_try: totalPaid,
      total_equity_gap_try: totalGap,
      company_fulfillment_ratio: companyRatio,
      equity_health: equityHealth,
      effective_equity_ratio: effectiveEquityRatio,
      leverage_level: leverageLevel,
      statutory_interest_accrued_try: totalStatutoryInterest,
      per_partner: perPartner,
      narrative,
    }
  }
}
