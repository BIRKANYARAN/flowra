// ─────────────────────────────────────────────────────────────────────────────
// lib/services/pcle/contribution-timeline.service.ts
//
// Partner Contribution Timeline & Commitment Fulfillment
//
// Tracks partner capital commitment fulfillment over time, computes contribution
// schedules, identifies overdue capital calls (TTK 588), and provides a
// timeline view.
//
// Pure exports (testable without DB):
//   computeFulfillmentPct
//   computeDaysSinceCommitment
//   hasTtk588Risk
//   computeStatutoryInterest
//   classifyCommitmentStatus
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { round2 } from '@/lib/calc'

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION A — Interfaces
// ═══════════════════════════════════════════════════════════════════════════════

export interface PartnerContributionPosition {
  partner_id:                string
  partner_name:              string
  committed_try:             number
  paid_try:                  number
  gap_try:                   number
  fulfillment_pct:           number
  commitment_date:           string | null
  days_since_commitment:     number
  status:                    'fulfilled' | 'on_track' | 'partial' | 'overdue' | 'pending'
  has_ttk588_risk:           boolean
  statutory_interest_try:    number
  contributions: Array<{
    event_id:   string
    amount_try: number
    event_date: string
    note:       string | null
  }>
}

export interface ContributionTimelineReport {
  total_committed_try:          number
  total_paid_try:               number
  total_gap_try:                number
  overall_fulfillment_pct:      number
  partners:                     PartnerContributionPosition[]
  overdue_partners:             PartnerContributionPosition[]
  ttk588_risk_partners:         PartnerContributionPosition[]
  total_statutory_interest_try: number
  next_expected_contribution: {
    partner_name:         string
    expected_amount_try:  number
  } | null
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION B — Pure functions (exported for testing)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Compute fulfillment percentage: paid / committed × 100.
 * Returns 0 if committed = 0 to avoid division by zero.
 */
export function computeFulfillmentPct(
  paidTry:      number,
  committedTry: number,
): number {
  if (committedTry === 0) return 0
  return round2((paidTry / committedTry) * 100)
}

/**
 * Compute days since commitment (from commitment_date to today).
 * Returns 0 if commitment_date is null, invalid, or in the future.
 */
export function computeDaysSinceCommitment(
  commitmentDate: string,
  today?: string,
): number {
  if (!commitmentDate) return 0
  const todayDate = today ?? new Date().toISOString().slice(0, 10)
  const start     = new Date(commitmentDate)
  const end       = new Date(todayDate)
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0
  const diffMs = end.getTime() - start.getTime()
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)))
}

/**
 * Determine TTK 588 risk: overdue capital call.
 * Risk if: capital_gap > 0 AND days_since_commitment > 90.
 * (90 days = reasonable call period before statutory interest kicks in)
 */
export function hasTtk588Risk(
  capitalGapTry:         number,
  daysSinceCommitment:   number,
): boolean {
  return capitalGapTry > 0 && daysSinceCommitment > 90
}

/**
 * Compute statutory interest owed on unpaid capital (TTK 588).
 * Rate: Turkish Central Bank reference rate (default 50% conservative).
 * Interest = capital_gap × rate × (days_overdue / 365)
 * days_overdue = max(0, days_since_commitment - 90)
 */
export function computeStatutoryInterest(
  capitalGapTry:         number,
  daysSinceCommitment:   number,
  annualRatePct?:        number,
): number {
  if (capitalGapTry <= 0) return 0
  const rate      = (annualRatePct ?? 50) / 100
  const daysOver  = Math.max(0, daysSinceCommitment - 90)
  if (daysOver === 0) return 0
  return round2(capitalGapTry * rate * (daysOver / 365))
}

/**
 * Classify commitment status:
 *   gap = 0:               'fulfilled'
 *   fulfillment >= 75%:    'on_track'
 *   fulfillment >= 25%:    'partial'
 *   fulfillment < 25%:     'overdue' (if days > 90) or 'pending'
 */
export function classifyCommitmentStatus(
  fulfillmentPct:        number,
  daysSinceCommitment:   number,
): 'fulfilled' | 'on_track' | 'partial' | 'overdue' | 'pending' {
  if (fulfillmentPct >= 100) return 'fulfilled'
  if (fulfillmentPct >= 75)  return 'on_track'
  if (fulfillmentPct >= 25)  return 'partial'
  // fulfillment < 25%
  return daysSinceCommitment > 90 ? 'overdue' : 'pending'
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION C — ContributionTimelineService
// ═══════════════════════════════════════════════════════════════════════════════

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

type PartnerRow         = { id: string; name: string }
type CommitmentRow      = { partner_id: string; committed_try: number; commitment_date: string | null }
type EventRow           = { id: string; partner_id: string; amount_try: number; event_date: string; note: string | null }

export class ContributionTimelineService {
  constructor(private supabase: AnyClient) {}

  async getReport(companyId: string): Promise<ContributionTimelineReport> {
    const today = new Date().toISOString().slice(0, 10)

    // 1. Fetch active partners
    const { data: partnerRows } = await this.supabase
      .from('partners')
      .select('id, name')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('name', { ascending: true })

    const partners: PartnerRow[] = (partnerRows ?? []) as PartnerRow[]

    if (partners.length === 0) {
      return _emptyReport()
    }

    const partnerIds = partners.map(p => p.id)

    // 2. Fetch latest capital commitment per partner
    //    We take the most recent non-cancelled commitment date + sum amounts
    const { data: commitmentRows } = await this.supabase
      .from('partner_capital_commitments')
      .select('partner_id, committed_try, commitment_date')
      .eq('company_id', companyId)
      .is('deleted_at', null)   // cancelled = soft-deleted (no payment_status column)
      .in('partner_id', partnerIds)
      .order('commitment_date', { ascending: false })

    // Build committed map and record latest commitment date per partner
    const committedMap       = new Map<string, number>()
    const commitmentDateMap  = new Map<string, string | null>()
    for (const r of (commitmentRows ?? []) as CommitmentRow[]) {
      committedMap.set(r.partner_id, (committedMap.get(r.partner_id) ?? 0) + Number(r.committed_try))
      // Keep the earliest commitment date (first occurrence in a capital program)
      if (!commitmentDateMap.has(r.partner_id)) {
        commitmentDateMap.set(r.partner_id, r.commitment_date ?? null)
      }
    }

    // 3. Fetch EQUITY_PAYMENT events — these are actual contributions
    const { data: eventRows } = await this.supabase
      .from('partner_finance_events')
      .select('id, partner_id, amount_try, event_date, note')
      .eq('company_id', companyId)
      .eq('event_type', 'EQUITY_PAYMENT')
      .in('partner_id', partnerIds)
      .order('event_date', { ascending: true })

    // Group events per partner
    const eventsMap = new Map<string, EventRow[]>()
    for (const r of (eventRows ?? []) as EventRow[]) {
      const arr = eventsMap.get(r.partner_id) ?? []
      arr.push(r)
      eventsMap.set(r.partner_id, arr)
    }

    // 4. Build per-partner positions
    const positions: PartnerContributionPosition[] = partners.map(p => {
      const committed         = round2(committedMap.get(p.id) ?? 0)
      const contributions     = (eventsMap.get(p.id) ?? []).map(ev => ({
        event_id:   ev.id,
        amount_try: round2(Number(ev.amount_try)),
        event_date: ev.event_date,
        note:       ev.note ?? null,
      }))
      const paid              = round2(contributions.reduce((s, c) => s + c.amount_try, 0))
      const gap               = round2(Math.max(0, committed - paid))
      const fulfillment       = computeFulfillmentPct(paid, committed)
      const commitmentDate    = commitmentDateMap.get(p.id) ?? null
      const daysSince         = commitmentDate
        ? computeDaysSinceCommitment(commitmentDate, today)
        : 0
      const status            = classifyCommitmentStatus(fulfillment, daysSince)
      const risk              = hasTtk588Risk(gap, daysSince)
      const interest          = computeStatutoryInterest(gap, daysSince)

      return {
        partner_id:             p.id,
        partner_name:           p.name,
        committed_try:          committed,
        paid_try:               paid,
        gap_try:                gap,
        fulfillment_pct:        fulfillment,
        commitment_date:        commitmentDate,
        days_since_commitment:  daysSince,
        status,
        has_ttk588_risk:        risk,
        statutory_interest_try: interest,
        contributions,
      }
    })

    // 5. Aggregate totals
    const totalCommitted  = round2(positions.reduce((s, p) => s + p.committed_try, 0))
    const totalPaid       = round2(positions.reduce((s, p) => s + p.paid_try,      0))
    const totalGap        = round2(positions.reduce((s, p) => s + p.gap_try,       0))
    const overallFulfill  = computeFulfillmentPct(totalPaid, totalCommitted)
    const overduePartners = positions.filter(p => p.status === 'overdue')
    const riskPartners    = positions.filter(p => p.has_ttk588_risk)
    const totalInterest   = round2(riskPartners.reduce((s, p) => s + p.statutory_interest_try, 0))

    // 6. Next expected contribution — partner with largest gap (excluding fulfilled)
    const unfinished = positions
      .filter(p => p.gap_try > 0)
      .sort((a, b) => b.gap_try - a.gap_try)
    const nextExpected = unfinished.length > 0
      ? { partner_name: unfinished[0].partner_name, expected_amount_try: unfinished[0].gap_try }
      : null

    return {
      total_committed_try:          totalCommitted,
      total_paid_try:               totalPaid,
      total_gap_try:                totalGap,
      overall_fulfillment_pct:      overallFulfill,
      partners:                     positions,
      overdue_partners:             overduePartners,
      ttk588_risk_partners:         riskPartners,
      total_statutory_interest_try: totalInterest,
      next_expected_contribution:   nextExpected,
    }
  }
}

// ── Internal helper ───────────────────────────────────────────────────────────

function _emptyReport(): ContributionTimelineReport {
  return {
    total_committed_try:          0,
    total_paid_try:               0,
    total_gap_try:                0,
    overall_fulfillment_pct:      0,
    partners:                     [],
    overdue_partners:             [],
    ttk588_risk_partners:         [],
    total_statutory_interest_try: 0,
    next_expected_contribution:   null,
  }
}
