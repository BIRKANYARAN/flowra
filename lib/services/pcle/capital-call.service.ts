// ─────────────────────────────────────────────────────────────────────────────
// lib/services/pcle/capital-call.service.ts
//
// TTK 588 Capital Call Tracker
//
// Computes equity commitment status per partner:
//   - equity_gap = committed - paid
//   - overdue detection: call_date < today AND equity_gap > 0
//   - TTK 588 interest: equity_gap × rate × (days_overdue / 365)
// ─────────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any

import { round2 } from '@/lib/calc'

// ── Default TTK 588 interest rate ─────────────────────────────────────────────
// TCMB referans faiz oranı — configurable per-call
export const DEFAULT_TTK588_RATE = 0.09  // 9% per annum

// ── Data shapes ───────────────────────────────────────────────────────────────

export type CapitalCallStatus =
  | 'paid'
  | 'current'
  | 'due_soon'
  | 'overdue_no_interest'
  | 'overdue_with_interest'

export interface CapitalCallSummary {
  partner_id:            string
  partner_name:          string
  share_ratio_pct:       number
  total_committed_try:   number
  total_paid_try:        number
  equity_gap_try:        number            // committed − paid
  call_date:             string | null     // en erken ödenmemiş vade
  is_overdue:            boolean           // call_date < today AND equity_gap > 0
  days_overdue:          number | null

  // TTK 588 interest
  ttk_588_applies:       boolean
  ttk_588_interest_rate: number
  ttk_588_interest_try:  number            // equity_gap × rate × (days_overdue / 365)

  // Durum
  status: CapitalCallStatus
}

export interface CapitalCallReport {
  partners:                CapitalCallSummary[]
  total_committed_try:     number
  total_paid_try:          number
  total_equity_gap_try:    number
  total_ttk_588_interest_try: number
  overdue_partners:        number
  computed_at:             string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysBetween(from: string, to: string): number {
  const a = new Date(from + 'T00:00:00Z').getTime()
  const b = new Date(to   + 'T00:00:00Z').getTime()
  return Math.max(0, Math.floor((b - a) / 86_400_000))
}

function classifyStatus(opts: {
  equity_gap:   number
  is_overdue:   boolean
  days_overdue: number | null
  call_date:    string | null
  today:        string
}): CapitalCallStatus {
  const { equity_gap, is_overdue, days_overdue, call_date, today } = opts
  if (equity_gap <= 0) return 'paid'
  if (is_overdue && (days_overdue ?? 0) > 0) return 'overdue_with_interest'
  if (is_overdue) return 'overdue_no_interest'
  if (call_date) {
    const daysUntilDue = daysBetween(today, call_date)
    if (daysUntilDue <= 30) return 'due_soon'
  }
  return 'current'
}

// ── Service ───────────────────────────────────────────────────────────────────

export class CapitalCallService {

  // ── Pure computation ───────────────────────────────────────────────────────

  static computeInterest(
    equityGap:   number,
    daysOverdue: number,
    annualRate:  number,
  ): number {
    if (equityGap <= 0 || daysOverdue <= 0) return 0
    return round2(equityGap * annualRate * (daysOverdue / 365))
  }

  // ── getReport ──────────────────────────────────────────────────────────────

  static async getReport(
    companyId: string,
    supabase:  SupabaseClient,
    opts?: { today?: string; ttk588Rate?: number },
  ): Promise<CapitalCallReport> {
    const today   = opts?.today ?? new Date().toISOString().slice(0, 10)
    const rate    = opts?.ttk588Rate ?? DEFAULT_TTK588_RATE

    // Load commitments + partner names
    const { data: rows, error } = await supabase
      .from('partner_capital_commitments')
      .select(`
        id, partner_id, committed_amount_try, paid_amount_try,
        commitment_date, call_date, payment_status,
        partners!inner(name, share_ratio)
      `)
      .eq('company_id', companyId)

    if (error) throw new Error(`getReport: ${error.message}`)

    if (!rows || rows.length === 0) {
      return {
        partners:                [],
        total_committed_try:     0,
        total_paid_try:          0,
        total_equity_gap_try:    0,
        total_ttk_588_interest_try: 0,
        overdue_partners:        0,
        computed_at:             new Date().toISOString(),
      }
    }

    // Group by partner
    const partnerMap = new Map<string, {
      name:       string
      share_ratio: number
      committed:  number
      paid:       number
      call_dates: string[]
    }>()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const row of rows as any[]) {
      const pid = row.partner_id as string
      if (!partnerMap.has(pid)) {
        partnerMap.set(pid, {
          name:        row.partners?.name ?? 'Bilinmeyen',
          share_ratio: Number(row.partners?.share_ratio ?? 0),
          committed:   0,
          paid:        0,
          call_dates:  [],
        })
      }
      const p = partnerMap.get(pid)!
      p.committed += Number(row.committed_amount_try)
      p.paid      += Number(row.paid_amount_try)
      if (row.call_date && Number(row.paid_amount_try) < Number(row.committed_amount_try)) {
        p.call_dates.push(row.call_date)
      }
    }

    const partners: CapitalCallSummary[] = []

    for (const [pid, p] of partnerMap) {
      const equity_gap = round2(p.committed - p.paid)

      // Earliest unpaid call date
      const sorted    = [...p.call_dates].sort()
      const call_date = sorted[0] ?? null

      const is_overdue   = equity_gap > 0 && call_date !== null && call_date < today
      const days_overdue = is_overdue ? daysBetween(call_date!, today) : null

      const ttk_588_applies       = is_overdue && (days_overdue ?? 0) > 0 && equity_gap > 0
      const ttk_588_interest_try  = ttk_588_applies
        ? CapitalCallService.computeInterest(equity_gap, days_overdue!, rate)
        : 0

      const status = classifyStatus({ equity_gap, is_overdue, days_overdue, call_date, today })

      partners.push({
        partner_id:            pid,
        partner_name:          p.name,
        share_ratio_pct:       round2(p.share_ratio * 100),
        total_committed_try:   round2(p.committed),
        total_paid_try:        round2(p.paid),
        equity_gap_try:        equity_gap,
        call_date,
        is_overdue,
        days_overdue,
        ttk_588_applies,
        ttk_588_interest_rate: rate,
        ttk_588_interest_try,
        status,
      })
    }

    // Sort: overdue first, then by gap descending
    partners.sort((a, b) => {
      if (a.is_overdue !== b.is_overdue) return a.is_overdue ? -1 : 1
      return b.equity_gap_try - a.equity_gap_try
    })

    return {
      partners,
      total_committed_try:     round2(partners.reduce((s, p) => s + p.total_committed_try, 0)),
      total_paid_try:          round2(partners.reduce((s, p) => s + p.total_paid_try, 0)),
      total_equity_gap_try:    round2(partners.reduce((s, p) => s + p.equity_gap_try, 0)),
      total_ttk_588_interest_try: round2(partners.reduce((s, p) => s + p.ttk_588_interest_try, 0)),
      overdue_partners:        partners.filter(p => p.is_overdue).length,
      computed_at:             new Date().toISOString(),
    }
  }
}
