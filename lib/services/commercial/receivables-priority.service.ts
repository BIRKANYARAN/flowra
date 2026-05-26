// ═══════════════════════════════════════════════════════════════════════════════
// lib/services/commercial/receivables-priority.service.ts
//
// Smart Receivables Prioritization — collection scoring + action recommendations.
//
// Instead of a flat list of overdue invoices, this system scores and prioritizes
// receivables by collection probability and urgency. It integrates customer
// payment profiles (from CustomerIntelligenceService) to tell the collections
// team: "Call this customer first — they're low risk and the amount is large."
//
// Collection score (0-100, higher = more collectible / easier to collect now):
//   Base              : 50
//   Risk tier         : low +30 / medium +10 / high -10 / critical -30 / unknown 0
//   Days overdue      : not overdue +20 / 1-30d 0 / 31-60d -10 / 60+d -25
//   On-time rate > 0.8: +10
//   On-time rate < 0.5: -10
//
// Priority rank: urgency desc (critical > urgent > follow_up > routine),
//   then outstanding_try desc within urgency tier.
// ═══════════════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import { CustomerIntelligenceService } from '@/lib/services/commercial/customer-intelligence.service'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Public types ───────────────────────────────────────────────────────────────

export interface PrioritizedReceivable {
  sale_id: string
  customer_name: string
  outstanding_try: number
  sale_date: string
  due_date: string | null
  days_overdue: number | null
  payment_status: string

  // From CustomerPaymentProfile
  customer_risk_tier: 'low' | 'medium' | 'high' | 'critical' | 'unknown'
  customer_avg_days_to_pay: number | null
  customer_on_time_rate: number | null

  // Priority scoring
  collection_score: number        // 0-100: higher = easier to collect NOW
  priority_rank: number           // 1 = collect first

  // Action recommendation
  recommended_action: string      // Turkish
  urgency: 'routine' | 'follow_up' | 'urgent' | 'critical'
}

export interface ReceivablesPriorityReport {
  total_outstanding_try: number
  priority_outstanding_try: number  // urgent + critical total

  receivables: PrioritizedReceivable[]  // sorted by priority_rank

  // Summary by urgency
  by_urgency: {
    routine:   number
    follow_up: number
    urgent:    number
    critical:  number
  }

  computed_at: string
}

// ── Pure scoring helpers ───────────────────────────────────────────────────────

const URGENCY_ORDER: Record<PrioritizedReceivable['urgency'], number> = {
  critical:   3,
  urgent:     2,
  follow_up:  1,
  routine:    0,
}

// ── Main service ───────────────────────────────────────────────────────────────

export class ReceivablesPriorityService {

  // ── Pure: compute collection score, urgency, and recommended action ─────────

  static scoreReceivable(params: {
    outstanding_try: number
    days_overdue: number | null
    customer_risk_tier: string
    customer_on_time_rate: number | null
  }): { score: number; urgency: PrioritizedReceivable['urgency']; recommended_action: string } {

    const { days_overdue, customer_risk_tier, customer_on_time_rate, outstanding_try } = params

    let score = 50

    // Risk tier adjustment
    switch (customer_risk_tier) {
      case 'low':      score += 30; break
      case 'medium':   score += 10; break
      case 'high':     score -= 10; break
      case 'critical': score -= 30; break
      default:         score += 0;  break  // unknown
    }

    // Days overdue adjustment
    if (days_overdue === null || days_overdue <= 0) {
      score += 20   // not overdue
    } else if (days_overdue <= 30) {
      score += 0    // 1-30 days: no adjustment
    } else if (days_overdue <= 60) {
      score -= 10   // 31-60 days
    } else {
      score -= 25   // 60+ days
    }

    // On-time rate adjustment
    if (customer_on_time_rate !== null) {
      if (customer_on_time_rate > 0.8) score += 10
      else if (customer_on_time_rate < 0.5) score -= 10
    }

    // Clamp to [0, 100]
    score = Math.max(0, Math.min(100, score))

    // Determine urgency
    let urgency: PrioritizedReceivable['urgency']
    if (customer_risk_tier === 'critical' && (days_overdue ?? 0) > 0) {
      urgency = 'critical'
    } else if (customer_risk_tier === 'critical' || (days_overdue ?? 0) > 60 || outstanding_try > 100_000) {
      urgency = 'urgent'
    } else if ((days_overdue ?? 0) > 0 || customer_risk_tier === 'high') {
      urgency = 'follow_up'
    } else {
      urgency = 'routine'
    }

    // Recommended action (Turkish)
    let recommended_action: string
    if (urgency === 'critical') {
      recommended_action = 'Acil: kritik müşteri, gecikmiş ödeme — hukuki süreç değerlendirilebilir'
    } else if (urgency === 'urgent') {
      if (outstanding_try > 100_000) {
        recommended_action = 'Acil: büyük tutar, gecikmiş ödeme — üst yönetim devreye girmeli'
      } else if ((days_overdue ?? 0) > 60) {
        recommended_action = 'Hukuki süreç değerlendirilebilir — 60+ gün gecikme'
      } else {
        recommended_action = 'Müşteri acilen aranmalı — ödeme planı talep edilmeli'
      }
    } else if (urgency === 'follow_up') {
      if ((days_overdue ?? 0) > 0) {
        recommended_action = 'Müşteri aranmalı — vade gecikmiş, hatırlatma yapılmalı'
      } else {
        recommended_action = 'Rutin takip — vade yaklaşıyor, müşteri uyarılmalı'
      }
    } else {
      recommended_action = 'Rutin takip — tahsilat bekleniyor'
    }

    return { score, urgency, recommended_action }
  }

  // ── Main: get prioritized receivables report ─────────────────────────────────

  static async getReport(
    companyId: string,
    supabase: AnyClient,
    opts?: { today?: string },
  ): Promise<ReceivablesPriorityReport> {

    const today = opts?.today ?? new Date().toISOString().slice(0, 10)

    // ── Fetch open receivables ───────────────────────────────────────────────
    const { data: rawSales } = await supabase
      .from('sales')
      .select('id, customer_name, total_try, paid_amount, sale_date, due_date, payment_status')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .in('payment_status', ['pending', 'partial', 'overdue'])
      .order('total_try', { ascending: false })
      .limit(200)

    const sales = (rawSales ?? []) as Array<{
      id: string
      customer_name: string
      total_try: number
      paid_amount: number | null
      sale_date: string
      due_date: string | null
      payment_status: string
    }>

    if (sales.length === 0) {
      return {
        total_outstanding_try:    0,
        priority_outstanding_try: 0,
        receivables:              [],
        by_urgency:               { routine: 0, follow_up: 0, urgent: 0, critical: 0 },
        computed_at:              new Date().toISOString(),
      }
    }

    // ── Fetch customer payment profiles ──────────────────────────────────────
    // CustomerIntelligenceService returns profiles keyed by customer_name
    let profileMap: Map<string, { risk_tier: string; avg_days_to_pay: number | null; on_time_rate: number }> | null = null

    try {
      const profiles = await CustomerIntelligenceService.getProfiles(companyId, supabase, { today })
      profileMap = new Map(profiles.map(p => [
        p.customer_name,
        { risk_tier: p.risk_tier, avg_days_to_pay: p.avg_days_to_pay, on_time_rate: p.on_time_rate },
      ]))
    } catch {
      // If customer intelligence is not available, proceed without it
      profileMap = null
    }

    // ── Score each receivable ────────────────────────────────────────────────
    const scored: PrioritizedReceivable[] = sales.map(sale => {
      const outstanding_try = Math.max(0, Number(sale.total_try ?? 0) - Number(sale.paid_amount ?? 0))

      // Days overdue — relative to due_date; null if not set
      let days_overdue: number | null = null
      if (sale.due_date) {
        const dueMs   = new Date(sale.due_date  + 'T00:00:00Z').getTime()
        const todayMs = new Date(today           + 'T00:00:00Z').getTime()
        const diff    = Math.round((todayMs - dueMs) / 86_400_000)
        days_overdue  = diff > 0 ? diff : null
      } else if (sale.payment_status === 'overdue') {
        // No due_date but marked overdue — use sale_date + 30d as proxy
        const saleMs  = new Date(sale.sale_date + 'T00:00:00Z').getTime()
        const todayMs = new Date(today           + 'T00:00:00Z').getTime()
        const diff    = Math.round((todayMs - saleMs) / 86_400_000) - 30
        days_overdue  = diff > 0 ? diff : 1
      }

      const profile = profileMap?.get(sale.customer_name)
      const customer_risk_tier = (profile?.risk_tier ?? 'unknown') as PrioritizedReceivable['customer_risk_tier']
      const customer_avg_days_to_pay = profile?.avg_days_to_pay ?? null
      const customer_on_time_rate    = profile?.on_time_rate    ?? null

      const { score, urgency, recommended_action } = ReceivablesPriorityService.scoreReceivable({
        outstanding_try,
        days_overdue,
        customer_risk_tier,
        customer_on_time_rate,
      })

      return {
        sale_id:                  sale.id,
        customer_name:            sale.customer_name,
        outstanding_try,
        sale_date:                sale.sale_date,
        due_date:                 sale.due_date,
        days_overdue,
        payment_status:           sale.payment_status,
        customer_risk_tier,
        customer_avg_days_to_pay,
        customer_on_time_rate,
        collection_score:         score,
        priority_rank:            0,   // will be assigned after sort
        recommended_action,
        urgency,
      }
    })

    // ── Sort: urgency desc, then outstanding desc ─────────────────────────────
    scored.sort((a, b) => {
      const uDiff = URGENCY_ORDER[b.urgency] - URGENCY_ORDER[a.urgency]
      if (uDiff !== 0) return uDiff
      return b.outstanding_try - a.outstanding_try
    })

    // Assign priority_rank (1-based)
    scored.forEach((r, i) => { r.priority_rank = i + 1 })

    // ── Totals ───────────────────────────────────────────────────────────────
    const total_outstanding_try    = scored.reduce((s, r) => s + r.outstanding_try, 0)
    const priority_outstanding_try = scored
      .filter(r => r.urgency === 'urgent' || r.urgency === 'critical')
      .reduce((s, r) => s + r.outstanding_try, 0)

    const by_urgency = {
      routine:   scored.filter(r => r.urgency === 'routine').length,
      follow_up: scored.filter(r => r.urgency === 'follow_up').length,
      urgent:    scored.filter(r => r.urgency === 'urgent').length,
      critical:  scored.filter(r => r.urgency === 'critical').length,
    }

    return {
      total_outstanding_try:    Math.round(total_outstanding_try * 100) / 100,
      priority_outstanding_try: Math.round(priority_outstanding_try * 100) / 100,
      receivables:              scored,
      by_urgency,
      computed_at:              new Date().toISOString(),
    }
  }
}
