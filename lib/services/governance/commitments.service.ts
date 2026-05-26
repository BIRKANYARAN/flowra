// ─────────────────────────────────────────────────────────────────────────────
// lib/services/governance/commitments.service.ts
//
// Commitment & Obligation Ledger — merges computed forward obligations from
// existing Flowra data with user-declared commitments in the new
// forward_commitments table.
//
// Computed sources:
//   1. Partner loan repayments (partner_loan_tranches)
//   2. Monthly interest accruals (partner_loan_tranches)
//   3. Pending workflow expense approvals (workflow_instances)
//   4. Governance obligations already declared (governance_obligations)
//
// User-declared source:
//   5. forward_commitments table (admin-managed)
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'

// ── Types ─────────────────────────────────────────────────────────────────────

export type ObligationSource =
  | 'loan_repayment'
  | 'interest_accrual'
  | 'workflow_expense'
  | 'governance_obligation'
  | 'declared_commitment'

export interface ForwardObligation {
  id:              string
  source:          ObligationSource
  title:           string
  amount_try:      number | null
  due_date:        string          // YYYY-MM-DD
  commitment_type: string
  counterparty:    string | null
  status:          'upcoming' | 'due_soon' | 'overdue'   // due_soon = within 14 days
  is_computed:     boolean         // true = auto-derived, false = user-declared
  recurrence:      string | null
  description:     string | null
}

export interface CommitmentsLedger {
  obligations:      ForwardObligation[]    // sorted by due_date asc
  total_known_try:  number                 // sum of obligations with known amounts
  overdue_count:    number
  due_soon_count:   number                 // within 14 days
  upcoming_count:   number
  by_month:         Record<string, {       // key: "YYYY-MM"
    total_try: number
    count:     number
  }>
  computed_at: string
}

export interface CreateCommitmentParams {
  title:                string
  commitment_type:      string
  amount_try?:          number | null
  currency?:            string
  due_date:             string
  recurrence?:          string | null
  recurrence_end_date?: string | null
  counterparty?:        string | null
  description?:         string | null
  linked_resource_type?: string | null
  linked_resource_id?:   string | null
}

export interface ForwardCommitment {
  id:                  string
  company_id:          string
  title:               string
  commitment_type:     string
  amount_try:          number | null
  currency:            string
  due_date:            string
  recurrence:          string | null
  recurrence_end_date: string | null
  counterparty:        string | null
  description:         string | null
  status:              string
  linked_resource_type: string | null
  linked_resource_id:   string | null
  created_by:          string
  created_at:          string
  updated_at:          string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysBetween(from: string, to: string): number {
  return Math.round(
    (new Date(to).getTime() - new Date(from).getTime()) / 86_400_000,
  )
}

function toObligationStatus(
  daysUntil: number,
): 'upcoming' | 'due_soon' | 'overdue' {
  if (daysUntil < 0)   return 'overdue'
  if (daysUntil <= 14) return 'due_soon'
  return 'upcoming'
}

function addMonths(yyyyMm: string, n: number): string {
  const [y, m] = yyyyMm.split('-').map(Number)
  let year  = y
  let month = m + n
  while (month > 12) { month -= 12; year++ }
  return `${year}-${String(month).padStart(2, '0')}`
}

function dateToMonth(d: string): string {
  return d.slice(0, 7)   // "YYYY-MM"
}

// ── Service ───────────────────────────────────────────────────────────────────

export class CommitmentsService {
  /**
   * Build the full CommitmentsLedger for a company.
   *
   * @param companyId  Company UUID
   * @param supabase   Authenticated Supabase client
   * @param opts.horizon  Days ahead to include (default 365)
   * @param opts.today    YYYY-MM-DD reference date (default: today)
   */
  static async getLedger(
    companyId: string,
    supabase:  SupabaseClient,
    opts?: { horizon?: number; today?: string },
  ): Promise<CommitmentsLedger> {
    const today   = opts?.today   ?? new Date().toISOString().slice(0, 10)
    const horizon = opts?.horizon ?? 365

    const cutoff = new Date(today)
    cutoff.setDate(cutoff.getDate() + horizon)
    const cutoffStr = cutoff.toISOString().slice(0, 10)

    const obligations: ForwardObligation[] = []

    // ── 1. Partner loan repayments ────────────────────────────────────────────
    const { data: tranches } = await supabase
      .from('partner_loan_tranches')
      .select('id, partner_id, outstanding_try, expected_repayment_date, annual_interest_rate')
      .eq('company_id', companyId)
      .neq('status', 'repaid')
      .not('expected_repayment_date', 'is', null)
      .lte('expected_repayment_date', cutoffStr)
      .order('expected_repayment_date', { ascending: true })

    // Resolve partner names
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
        id:              `loan_repayment_${t.id}`,
        source:          'loan_repayment',
        title:           `${name} — kredi geri ödemesi`,
        amount_try:      Number(t.outstanding_try ?? 0) || null,
        due_date:        t.expected_repayment_date,
        commitment_type: 'loan_repayment',
        counterparty:    name,
        status:          toObligationStatus(daysUntil),
        is_computed:     true,
        recurrence:      null,
        description:     `₺${Number(t.outstanding_try ?? 0).toLocaleString('tr-TR')} bakiyeli tranche vadesi ${t.expected_repayment_date}.`,
      })
    }

    // ── 2. Monthly interest accruals (next 12 months) ─────────────────────────
    const activeTranches = (tranches ?? []).filter(
      (t: { outstanding_try: number | null; annual_interest_rate: number | null }) =>
        Number(t.outstanding_try ?? 0) > 0 &&
        Number(t.annual_interest_rate ?? 0) > 0,
    )

    if (activeTranches.length > 0) {
      const todayMonth = today.slice(0, 7)   // "YYYY-MM"
      for (let i = 1; i <= 12; i++) {
        const accrualMonth = addMonths(todayMonth, i)
        const accrualDate  = `${accrualMonth}-01`

        // Only include if within horizon
        if (accrualDate > cutoffStr) break

        // Sum interest across all active tranches for this company
        let totalInterest = 0
        for (const t of activeTranches) {
          const monthly = (Number(t.outstanding_try) * Number(t.annual_interest_rate)) / 12
          totalInterest += monthly
        }

        if (totalInterest > 0) {
          const daysUntil = daysBetween(today, accrualDate)
          obligations.push({
            id:              `interest_accrual_${accrualMonth}`,
            source:          'interest_accrual',
            title:           `Faiz tahakkuku — ${accrualMonth}`,
            amount_try:      Math.round(totalInterest * 100) / 100,
            due_date:        accrualDate,
            commitment_type: 'interest_accrual',
            counterparty:    null,
            status:          toObligationStatus(daysUntil),
            is_computed:     true,
            recurrence:      'monthly',
            description:     `${activeTranches.length} aktif tranche için aylık faiz tahmini.`,
          })
        }
      }
    }

    // ── 3. Pending workflow expense approvals ─────────────────────────────────
    const { data: workflows } = await supabase
      .from('workflow_instances')
      .select('id, workflow_type, initiated_at, expires_at, payload')
      .eq('company_id', companyId)
      .eq('status', 'pending')
      .eq('workflow_type', 'expense_approval')
      .order('initiated_at', { ascending: true })
      .limit(50)

    for (const w of workflows ?? []) {
      const expiry    = w.expires_at ?? w.initiated_at
      const dueDate   = expiry ? expiry.slice(0, 10) : today
      const daysUntil = daysBetween(today, dueDate)

      // Extract amount from payload
      const payload    = (w.payload ?? {}) as Record<string, unknown>
      const amountTry  = typeof payload.amount_try === 'number'
        ? payload.amount_try
        : typeof payload.amount === 'number'
          ? payload.amount
          : null

      obligations.push({
        id:              `workflow_expense_${w.id}`,
        source:          'workflow_expense',
        title:           'Masraf onayı bekliyor',
        amount_try:      amountTry,
        due_date:        dueDate,
        commitment_type: 'other',
        counterparty:    null,
        status:          toObligationStatus(daysUntil),
        is_computed:     true,
        recurrence:      null,
        description:     `expense_approval iş akışı${expiry ? ' son tarih: ' + dueDate : ' — açık'}.`,
      })
    }

    // ── 4. Governance obligations already declared ────────────────────────────
    const { data: govObligations } = await supabase
      .from('governance_obligations')
      .select('id, title, description, due_date, obligation_type')
      .eq('company_id', companyId)
      .in('status', ['pending', 'overdue'])
      .lte('due_date', cutoffStr)
      .order('due_date', { ascending: true })
      .limit(50)

    for (const g of govObligations ?? []) {
      const daysUntil = daysBetween(today, g.due_date)
      obligations.push({
        id:              `governance_obligation_${g.id}`,
        source:          'governance_obligation',
        title:           g.title,
        amount_try:      null,
        due_date:        g.due_date,
        commitment_type: g.obligation_type ?? 'other',
        counterparty:    null,
        status:          toObligationStatus(daysUntil),
        is_computed:     true,
        recurrence:      null,
        description:     g.description ?? null,
      })
    }

    // ── 5. User-declared forward commitments ──────────────────────────────────
    const { data: declared } = await supabase
      .from('forward_commitments')
      .select('*')
      .eq('company_id', companyId)
      .eq('status', 'active')
      .lte('due_date', cutoffStr)
      .order('due_date', { ascending: true })
      .limit(200)

    for (const d of declared ?? []) {
      const daysUntil = daysBetween(today, d.due_date)
      obligations.push({
        id:              `declared_commitment_${d.id}`,
        source:          'declared_commitment',
        title:           d.title,
        amount_try:      d.amount_try != null ? Number(d.amount_try) : null,
        due_date:        d.due_date,
        commitment_type: d.commitment_type,
        counterparty:    d.counterparty ?? null,
        status:          toObligationStatus(daysUntil),
        is_computed:     false,
        recurrence:      d.recurrence ?? null,
        description:     d.description ?? null,
      })
    }

    // ── Sort by due_date ascending ─────────────────────────────────────────────
    obligations.sort((a, b) => a.due_date.localeCompare(b.due_date))

    // ── Aggregate stats ────────────────────────────────────────────────────────
    const total_known_try = obligations
      .filter(o => o.amount_try != null)
      .reduce((s, o) => s + (o.amount_try ?? 0), 0)

    const overdue_count  = obligations.filter(o => o.status === 'overdue').length
    const due_soon_count = obligations.filter(o => o.status === 'due_soon').length
    const upcoming_count = obligations.filter(o => o.status === 'upcoming').length

    // ── By-month grouping ──────────────────────────────────────────────────────
    const by_month: Record<string, { total_try: number; count: number }> = {}
    for (const o of obligations) {
      const key = dateToMonth(o.due_date)
      if (!by_month[key]) by_month[key] = { total_try: 0, count: 0 }
      by_month[key].count++
      if (o.amount_try != null) by_month[key].total_try += o.amount_try
    }

    return {
      obligations,
      total_known_try:  Math.round(total_known_try * 100) / 100,
      overdue_count,
      due_soon_count,
      upcoming_count,
      by_month,
      computed_at: new Date().toISOString(),
    }
  }

  /** Create a new user-declared forward commitment */
  static async createCommitment(
    companyId: string,
    userId:    string,
    supabase:  SupabaseClient,
    params:    CreateCommitmentParams,
  ): Promise<ForwardCommitment> {
    const { data, error } = await supabase
      .from('forward_commitments')
      .insert({
        company_id:           companyId,
        title:                params.title,
        commitment_type:      params.commitment_type,
        amount_try:           params.amount_try ?? null,
        currency:             params.currency ?? 'TRY',
        due_date:             params.due_date,
        recurrence:           params.recurrence ?? null,
        recurrence_end_date:  params.recurrence_end_date ?? null,
        counterparty:         params.counterparty ?? null,
        description:          params.description ?? null,
        status:               'active',
        linked_resource_type: params.linked_resource_type ?? null,
        linked_resource_id:   params.linked_resource_id ?? null,
        created_by:           userId,
      })
      .select()
      .single()
    if (error) throw error
    return data as ForwardCommitment
  }

  /** Mark a declared commitment as fulfilled */
  static async fulfillCommitment(
    id:        string,
    companyId: string,
    supabase:  SupabaseClient,
  ): Promise<void> {
    const { error } = await supabase
      .from('forward_commitments')
      .update({ status: 'fulfilled', updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('company_id', companyId)
    if (error) throw error
  }

  /** Mark a declared commitment as cancelled */
  static async cancelCommitment(
    id:        string,
    companyId: string,
    supabase:  SupabaseClient,
  ): Promise<void> {
    const { error } = await supabase
      .from('forward_commitments')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('company_id', companyId)
    if (error) throw error
  }
}
