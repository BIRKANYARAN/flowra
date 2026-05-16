// ─────────────────────────────────────────────────────────────────────────────
// lib/services/pcle/pcle.equity.ts — PCLE Equity Context
//
// Tracks: committed vs paid equity, capital gap, equity call compliance (TTK 588)
// ─────────────────────────────────────────────────────────────────────────────

import { round2 } from '@/lib/calc'

export interface PartnerEquityPosition {
  partner_id:        string
  partner_name:      string
  share_ratio:       number
  total_committed:   number  // from partner_capital_commitments
  total_paid:        number  // from partner_transactions (capital_in)
  equity_gap:        number  // committed - paid (TTK 588 risk)
  gap_pct:           number  // equity_gap / total_committed × 100
  has_overdue_call:  boolean // gap > 0 AND due_date < today
}

export interface CompanyEquityState {
  total_committed_try:   number
  total_paid_in_try:     number
  total_equity_gap_try:  number
  partner_positions:     PartnerEquityPosition[]
}

export class PCLEEquity {
  /**
   * Compute equity positions from partner transaction history.
   * Uses capital_in transactions as proxy for paid equity (no commitments table yet).
   */
  static computeFromTransactions(
    partners: Array<{ id: string; name: string; share_ratio: number }>,
    capitalInByPartner: Map<string, number>,
  ): CompanyEquityState {
    const positions: PartnerEquityPosition[] = partners.map(p => {
      const total_paid      = round2(capitalInByPartner.get(p.id) ?? 0)
      const total_committed = total_paid // Without commitments table, committed = paid
      const equity_gap      = 0         // No gap if committed = paid

      return {
        partner_id:       p.id,
        partner_name:     p.name,
        share_ratio:      Number(p.share_ratio),
        total_committed,
        total_paid,
        equity_gap,
        gap_pct:          0,
        has_overdue_call: false,
      }
    })

    const total_paid_in  = round2(positions.reduce((s, p) => s + p.total_paid, 0))
    const total_committed= round2(positions.reduce((s, p) => s + p.total_committed, 0))

    return {
      total_committed_try:  total_committed,
      total_paid_in_try:    total_paid_in,
      total_equity_gap_try: round2(total_committed - total_paid_in),
      partner_positions:    positions,
    }
  }

  /**
   * Compute equity positions from partner_capital_commitments + partner_transactions.
   * Full implementation when partner_capital_commitments table is populated.
   */
  static computeFromCommitments(
    partners: Array<{ id: string; name: string; share_ratio: number }>,
    commitments: Array<{ partner_id: string; committed_try: number; paid_try: number; due_date: string | null }>,
    today: Date = new Date(),
  ): CompanyEquityState {
    const positions: PartnerEquityPosition[] = partners.map(p => {
      const partnerCommitments = commitments.filter(c => c.partner_id === p.id)
      const total_committed    = round2(partnerCommitments.reduce((s, c) => s + c.committed_try, 0))
      const total_paid         = round2(partnerCommitments.reduce((s, c) => s + c.paid_try, 0))
      const equity_gap         = round2(Math.max(0, total_committed - total_paid))
      const gap_pct            = total_committed > 0 ? round2((equity_gap / total_committed) * 100) : 0

      const has_overdue_call = partnerCommitments.some(c => {
        if (c.paid_try >= c.committed_try) return false
        if (!c.due_date) return false
        return new Date(c.due_date) < today
      })

      return {
        partner_id:       p.id,
        partner_name:     p.name,
        share_ratio:      Number(p.share_ratio),
        total_committed,
        total_paid,
        equity_gap,
        gap_pct,
        has_overdue_call,
      }
    })

    const total_paid_in   = round2(positions.reduce((s, p) => s + p.total_paid, 0))
    const total_committed = round2(positions.reduce((s, p) => s + p.total_committed, 0))

    return {
      total_committed_try:  total_committed,
      total_paid_in_try:    total_paid_in,
      total_equity_gap_try: round2(total_committed - total_paid_in),
      partner_positions:    positions,
    }
  }
}
