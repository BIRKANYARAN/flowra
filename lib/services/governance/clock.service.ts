// Governance Clock — computes upcoming obligations from Flowra-known data.
// Does NOT claim to be authoritative on Turkish statutory deadlines.
// Statutory reference items are labeled informational only.

import type { SupabaseClient } from '@supabase/supabase-js'

export type ObligationSource   = 'period_close' | 'pcle_repayment' | 'workflow_pending' | 'statutory_ref' | 'user_declared'
export type ObligationSeverity = 'info' | 'warning' | 'critical'
export type ObligationStatus   = 'upcoming' | 'due_today' | 'overdue' | 'completed'

export interface GovernanceObligation {
  id:          string
  source:      ObligationSource
  title:       string
  description: string
  due_date:    string          // YYYY-MM-DD
  status:      ObligationStatus
  severity:    ObligationSeverity
  days_until:  number          // negative = overdue
  action_href: string | null   // deep link to relevant Flowra page
  metadata:    Record<string, unknown>
  is_informational: boolean    // statutory_ref items are informational only
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000)
}

function toStatus(daysUntil: number): ObligationStatus {
  if (daysUntil < 0)  return 'overdue'
  if (daysUntil === 0) return 'due_today'
  return 'upcoming'
}

function toSeverity(daysUntil: number, source: ObligationSource): ObligationSeverity {
  if (source === 'statutory_ref') return 'info'
  if (daysUntil < 0)   return 'critical'
  if (daysUntil <= 7)  return 'critical'
  if (daysUntil <= 14) return 'warning'
  return 'info'
}

export class GovernanceClockService {
  /**
   * Returns all upcoming and overdue obligations for a company.
   * Combines system-computed obligations with user-declared ones.
   *
   * @param companyId  Company UUID
   * @param today      YYYY-MM-DD reference date (defaults to server today)
   * @param horizon    Days ahead to include (default: 90)
   */
  static async getObligations(
    companyId: string,
    supabase:  SupabaseClient,
    opts: { today?: string; horizon?: number } = {},
  ): Promise<GovernanceObligation[]> {
    const today   = opts.today   ?? new Date().toISOString().slice(0, 10)
    const horizon = opts.horizon ?? 90
    const cutoff  = new Date(today)
    cutoff.setDate(cutoff.getDate() + horizon)
    const cutoffStr = cutoff.toISOString().slice(0, 10)

    const obligations: GovernanceObligation[] = []

    // ── 1. Period close obligations ────────────────────────────────────────────
    const { data: openPeriods } = await supabase
      .from('accounting_periods')
      .select('id, period_start, period_end, status, label')
      .eq('company_id', companyId)
      .in('status', ['open', 'pre_close'])
      .order('period_end', { ascending: true })
      .limit(3)

    for (const p of openPeriods ?? []) {
      // Period should close within 10 days of its end date
      const closeTarget = new Date(p.period_end)
      closeTarget.setDate(closeTarget.getDate() + 10)
      const targetStr  = closeTarget.toISOString().slice(0, 10)
      const daysUntil  = daysBetween(today, targetStr)

      if (daysUntil <= horizon) {
        obligations.push({
          id:          `period_close_${p.id}`,
          source:      'period_close',
          title:       `${p.label ?? p.period_start.slice(0, 7)} dönemi kapatılmalı`,
          description: `Dönem sonu ${p.period_end}. Kapanış hedefi ${targetStr}.`,
          due_date:    targetStr,
          status:      toStatus(daysUntil),
          severity:    toSeverity(daysUntil, 'period_close'),
          days_until:  daysUntil,
          action_href: '/dashboard/cfo?tab=period-close',
          metadata:    { period_id: p.id, period_status: p.status },
          is_informational: false,
        })
      }
    }

    // ── 2. PCLE loan repayment obligations ─────────────────────────────────────
    const { data: tranches } = await supabase
      .from('partner_loan_tranches')
      .select('id, partner_id, outstanding_try, expected_repayment_date')
      .eq('company_id', companyId)
      .eq('status', 'active')
      .not('expected_repayment_date', 'is', null)
      .lte('expected_repayment_date', cutoffStr)
      .order('expected_repayment_date', { ascending: true })

    // Get partner names
    const partnerIds = [...new Set((tranches ?? []).map((t: { partner_id: string }) => t.partner_id))]
    const partnerMap: Record<string, string> = {}
    if (partnerIds.length > 0) {
      const { data: partners } = await supabase
        .from('partners')
        .select('id, name')
        .in('id', partnerIds)
        .eq('company_id', companyId)
      for (const p of partners ?? []) partnerMap[p.id] = p.name
    }

    for (const t of tranches ?? []) {
      const daysUntil = daysBetween(today, t.expected_repayment_date)
      const name      = partnerMap[t.partner_id] ?? 'Ortak'
      obligations.push({
        id:          `pcle_repayment_${t.id}`,
        source:      'pcle_repayment',
        title:       `${name} — kredi geri ödemesi`,
        description: `₺${Number(t.outstanding_try).toLocaleString('tr-TR')} bakiyeli tranche vadesi ${t.expected_repayment_date}.`,
        due_date:    t.expected_repayment_date,
        status:      toStatus(daysUntil),
        severity:    toSeverity(daysUntil, 'pcle_repayment'),
        days_until:  daysUntil,
        action_href: '/dashboard/partners?tab=tranches',
        metadata:    { tranche_id: t.id, partner_id: t.partner_id, outstanding_try: t.outstanding_try },
        is_informational: false,
      })
    }

    // ── 3. Pending workflow approvals ──────────────────────────────────────────
    const { data: workflows } = await supabase
      .from('workflow_instances')
      .select('id, workflow_type, initiated_at, expires_at, payload')
      .eq('company_id', companyId)
      .eq('status', 'pending')
      .order('initiated_at', { ascending: true })
      .limit(10)

    for (const w of workflows ?? []) {
      const expiry     = w.expires_at ?? w.initiated_at  // fallback
      const daysUntil  = daysBetween(today, expiry.slice(0, 10))
      const typeLabels: Record<string, string> = {
        expense_approval:   'Masraf onayı bekliyor',
        partner_loan:       'Ortak kredisi onayı bekliyor',
        dividend_declaration: 'Temettü beyanı onayı bekliyor',
        period_close:       'Dönem kapanışı onayı bekliyor',
      }
      obligations.push({
        id:          `workflow_${w.id}`,
        source:      'workflow_pending',
        title:       typeLabels[w.workflow_type] ?? 'İş akışı onay bekliyor',
        description: `${w.workflow_type} iş akışı ${expiry ? 'son tarih: ' + expiry.slice(0, 10) : 'açık'}.`,
        due_date:    expiry ? expiry.slice(0, 10) : today,
        status:      toStatus(daysUntil),
        severity:    toSeverity(daysUntil, 'workflow_pending'),
        days_until:  daysUntil,
        action_href: '/dashboard/admin/workflows',
        metadata:    { workflow_id: w.id, workflow_type: w.workflow_type },
        is_informational: false,
      })
    }

    // ── 4. Statutory reference obligations (informational only) ────────────────
    // These are REFERENCE ONLY — not authoritative for any specific company.
    // Always label: is_informational: true
    const currentYear  = new Date(today).getFullYear()
    const currentMonth = new Date(today).getMonth() + 1

    const statutoryRef: Array<{ title: string; description: string; day: number; month: number; year: number }> = []

    // KDV-15: always 15th of every month for current + next 3 months
    for (let i = 0; i < 3; i++) {
      let m = currentMonth + i
      let y = currentYear
      if (m > 12) { m -= 12; y++ }
      const dueStr = `${y}-${String(m).padStart(2,'0')}-15`
      if (dueStr >= today && dueStr <= cutoffStr) {
        statutoryRef.push({
          title:       `KDV Beyannamesi — ${m}. Ay`,
          description: 'KDV-1 beyannamesi (Bilgi amaçlı — mali müşavirinizle doğrulayın)',
          day: 15, month: m, year: y,
        })
      }
    }

    // Quarterly advance tax (geçici vergi): 15-Feb, 15-May, 15-Aug, 15-Nov
    for (const qm of [2, 5, 8, 11]) {
      const dueStr = `${currentYear}-${String(qm).padStart(2,'0')}-15`
      if (dueStr >= today && dueStr <= cutoffStr) {
        statutoryRef.push({
          title:       `Geçici Kurumlar Vergisi — ${qm}. Ay`,
          description: 'Üç aylık kurumlar vergisi avansı (Bilgi amaçlı — mali müşavirinizle doğrulayın)',
          day: 15, month: qm, year: currentYear,
        })
      }
    }

    for (const ref of statutoryRef) {
      const dueDate   = `${ref.year}-${String(ref.month).padStart(2,'0')}-${String(ref.day).padStart(2,'0')}`
      const daysUntil = daysBetween(today, dueDate)
      obligations.push({
        id:          `statutory_${dueDate.replace(/-/g,'')}`,
        source:      'statutory_ref',
        title:       ref.title,
        description: ref.description,
        due_date:    dueDate,
        status:      toStatus(daysUntil),
        severity:    'info',
        days_until:  daysUntil,
        action_href: null,
        metadata:    {},
        is_informational: true,
      })
    }

    // ── 5. User-declared obligations ──────────────────────────────────────────
    const { data: declared } = await supabase
      .from('governance_obligations')
      .select('*')
      .eq('company_id', companyId)
      .in('status', ['pending', 'overdue'])
      .lte('due_date', cutoffStr)
      .order('due_date', { ascending: true })
      .limit(50)

    for (const d of declared ?? []) {
      const daysUntil = daysBetween(today, d.due_date)
      obligations.push({
        id:          `declared_${d.id}`,
        source:      'user_declared',
        title:       d.title,
        description: d.description ?? '',
        due_date:    d.due_date,
        status:      toStatus(daysUntil),
        severity:    toSeverity(daysUntil, 'user_declared'),
        days_until:  daysUntil,
        action_href: null,
        metadata:    { obligation_id: d.id, obligation_type: d.obligation_type },
        is_informational: d.obligation_type === 'statutory',
      })
    }

    // Sort: overdue first, then by due_date ascending
    return obligations.sort((a, b) => {
      if (a.status === 'overdue' && b.status !== 'overdue') return -1
      if (b.status === 'overdue' && a.status !== 'overdue') return 1
      return a.due_date.localeCompare(b.due_date)
    })
  }

  /** Marks a user-declared obligation as completed */
  static async markComplete(
    id:        string,
    companyId: string,
    userId:    string,
    supabase:  SupabaseClient,
  ): Promise<void> {
    const { error } = await supabase
      .from('governance_obligations')
      .update({ status: 'completed', completed_at: new Date().toISOString(), completed_by: userId })
      .eq('id', id)
      .eq('company_id', companyId)
    if (error) throw error
  }
}
