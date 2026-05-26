// ─────────────────────────────────────────────────────────────────────────────
// lib/services/pcle/dividend-ledger.service.ts
//
// Dividend History Ledger — complete distribution history with compliance tracking.
//
// Reads all dividend_declaration workflow_instances for a company (last 2 years)
// and builds a structured ledger report with:
//   - Per-entry compliance checks (TTK 509 / TTK 519)
//   - Per-partner breakdowns from workflow payload
//   - Aggregate totals: YTD, all-time, withholding
//
// Pure helpers (exported for unit testing):
//   computePerPartnerAmount  — gross → per-partner array (no DB)
//   computeWithholding       — 10% GVK 94 §4
//   sumByPartner             — aggregate per-partner totals from entries
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// ── Public types ──────────────────────────────────────────────────────────────

export type DividendEventType = 'declared' | 'paid' | 'cancelled' | 'withheld'

export interface DividendLedgerEntry {
  id: string
  event_type: DividendEventType
  event_date: string
  period_label: string               // e.g. 'Q1 2026' or '2025 Yılı'
  gross_amount_try: number
  withholding_try: number            // %10 stopaj (GVK 94)
  net_amount_try: number
  per_partner: Array<{
    partner_name: string
    share_ratio: number
    gross_try: number
    withholding_try: number
    net_try: number
    paid: boolean
  }>
  workflow_status: string            // 'approved' | 'pending' | 'rejected'
  declared_by: string | null
  notes: string | null
  ttk_509_compliant: boolean        // was distributable_net > 0 and period profit > 0?
  ttk_519_compliant: boolean        // was legal reserve requirement met?
}

export interface DividendLedgerReport {
  entries: DividendLedgerEntry[]     // newest first
  total_declared_try: number         // sum of gross amounts for declared/paid
  total_paid_try: number             // sum of gross amounts actually paid (approved)
  total_withholding_try: number      // total tax withheld
  total_net_paid_try: number         // net after withholding
  per_partner_totals: Array<{
    partner_name: string
    total_gross_try: number
    total_net_try: number
    total_withholding_try: number
  }>
  ytd_declared_try: number           // current year only
  ytd_paid_try: number
  compliance_issues: string[]        // Turkish descriptions of any TTK violations found
}

// ── Internal payload shape from DividendService.initiateDeclaration ──────────

interface WorkflowPayload {
  gross_dividend_try?:          number
  withholding_try?:             number
  distributable_net_try?:       number
  ttk_509_satisfied?:           boolean
  ttk_519_satisfied?:           boolean
  ytd_net_income_try?:          number
  partner_allocations?: Array<{
    partner_id:       string
    partner_name:     string
    share_ratio_pct:  number
    gross_share_try:  number
    withholding_try:  number
    net_share_try:    number
  }>
  notes?: string | null
}

interface WorkflowRow {
  id:           string
  status:       string
  initiated_at: string
  resolved_at:  string | null
  initiator_id: string | null
  payload:      WorkflowPayload | null
}

interface PartnerRow {
  id:          string
  name:        string
  share_ratio: number
}

// ── Pure helper: compute per-partner breakdown from gross amount ──────────────

/**
 * Given a gross dividend amount and partner list (with share_ratio values),
 * returns a per-partner breakdown with 10% withholding applied to each share.
 *
 * Share ratios are normalised so they sum to 1 before splitting.
 */
export function computePerPartnerAmount(
  grossAmount: number,
  partners: Array<{ name: string; share_ratio: number }>,
): DividendLedgerEntry['per_partner'] {
  if (grossAmount <= 0 || partners.length === 0) return []

  const totalRatio = partners.reduce((s, p) => s + Number(p.share_ratio ?? 0), 0)

  return partners.map(p => {
    const ratio         = totalRatio > 0 ? Number(p.share_ratio) / totalRatio : 0
    const gross         = round2(grossAmount * ratio)
    const withholding   = computeWithholding(gross)
    const net           = round2(gross - withholding)
    return {
      partner_name:  p.name,
      share_ratio:   round2(ratio),
      gross_try:     gross,
      withholding_try: withholding,
      net_try:       net,
      paid:          false,
    }
  })
}

/**
 * Compute 10% withholding tax (GVK 94 §4) on a gross dividend amount.
 */
export function computeWithholding(grossAmount: number): number {
  if (grossAmount <= 0) return 0
  return round2(grossAmount * 0.10)
}

/**
 * Aggregate per-partner totals across all ledger entries.
 * Only entries with event_type 'declared' or 'paid' are counted.
 */
export function sumByPartner(
  entries: DividendLedgerEntry[],
): DividendLedgerReport['per_partner_totals'] {
  const map = new Map<string, { total_gross_try: number; total_net_try: number; total_withholding_try: number }>()

  for (const entry of entries) {
    if (entry.event_type !== 'declared' && entry.event_type !== 'paid') continue
    for (const pp of entry.per_partner) {
      const existing = map.get(pp.partner_name) ?? { total_gross_try: 0, total_net_try: 0, total_withholding_try: 0 }
      map.set(pp.partner_name, {
        total_gross_try:       round2(existing.total_gross_try + pp.gross_try),
        total_net_try:         round2(existing.total_net_try + pp.net_try),
        total_withholding_try: round2(existing.total_withholding_try + pp.withholding_try),
      })
    }
  }

  return Array.from(map.entries()).map(([partner_name, totals]) => ({
    partner_name,
    ...totals,
  }))
}

// ── DividendLedgerService ─────────────────────────────────────────────────────

export class DividendLedgerService {
  /**
   * Build a full dividend ledger report for a company.
   * Fetches workflow_instances of type 'dividend_declaration' from the last 2 years,
   * combines with partner data to produce per-entry and aggregate figures.
   */
  static async getReport(
    companyId: string,
    supabase: AnyClient,
  ): Promise<DividendLedgerReport> {
    const twoYearsAgo = new Date()
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2)
    const sinceDate = twoYearsAgo.toISOString().slice(0, 10)

    // Fetch workflow instances + active partners in parallel
    const [workflowsRes, partnersRes] = await Promise.all([
      supabase
        .from('workflow_instances')
        .select('id, status, initiated_at, resolved_at, initiator_id, payload')
        .eq('company_id', companyId)
        .eq('workflow_type', 'dividend_declaration')
        .gte('initiated_at', sinceDate)
        .order('initiated_at', { ascending: false }),
      supabase
        .from('partners')
        .select('id, name, share_ratio')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .eq('is_active', true)
        .order('name'),
    ])

    const workflows = (workflowsRes.data ?? []) as WorkflowRow[]
    const partners  = (partnersRes.data ?? []) as PartnerRow[]

    const currentYear = new Date().getFullYear()
    const complianceIssues: string[] = []

    // ── Build ledger entries ──────────────────────────────────────────────────
    const entries: DividendLedgerEntry[] = workflows.map(wf => {
      const payload = wf.payload ?? {} as WorkflowPayload

      // Determine event type from workflow status
      const eventType: DividendEventType =
        wf.status === 'approved'  ? 'paid'      :
        wf.status === 'rejected'  ? 'cancelled' :
        wf.status === 'expired'   ? 'cancelled' :
        'declared'

      const grossAmount     = Number(payload.gross_dividend_try ?? 0)
      const withholdingAmt  = Number(payload.withholding_try ?? 0) || computeWithholding(grossAmount)
      const netAmount       = round2(grossAmount - withholdingAmt)

      // Build per-partner breakdown — prefer payload allocations, fall back to partners list
      let perPartner: DividendLedgerEntry['per_partner']
      if (Array.isArray(payload.partner_allocations) && payload.partner_allocations.length > 0) {
        perPartner = payload.partner_allocations.map(pa => ({
          partner_name:    pa.partner_name,
          share_ratio:     round2(pa.share_ratio_pct / 100),
          gross_try:       pa.gross_share_try,
          withholding_try: pa.withholding_try,
          net_try:         pa.net_share_try,
          paid:            wf.status === 'approved',
        }))
      } else if (grossAmount > 0) {
        perPartner = computePerPartnerAmount(grossAmount, partners).map(pp => ({
          ...pp,
          paid: wf.status === 'approved',
        }))
      } else {
        perPartner = []
      }

      // Compliance
      const ttk509 = payload.ttk_509_satisfied ?? (grossAmount > 0 && (payload.ytd_net_income_try ?? 0) > 0)
      const ttk519 = payload.ttk_519_satisfied ?? true

      // Collect violations for the report-level compliance_issues array
      if (!ttk509) {
        complianceIssues.push(
          `TTK 509 ihlali — ${new Date(wf.initiated_at).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })} tarihli beyan`
        )
      }
      if (!ttk519) {
        complianceIssues.push(
          `TTK 519 ihlali (yasal yedek karşılanmamış) — ${new Date(wf.initiated_at).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })} tarihli beyan`
        )
      }

      // Period label: derive from initiated_at date
      const date         = new Date(wf.initiated_at)
      const year         = date.getFullYear()
      const quarter      = Math.ceil((date.getMonth() + 1) / 3)
      const periodLabel  = `Q${quarter} ${year}`

      return {
        id:                wf.id,
        event_type:        eventType,
        event_date:        wf.initiated_at.slice(0, 10),
        period_label:      periodLabel,
        gross_amount_try:  grossAmount,
        withholding_try:   withholdingAmt,
        net_amount_try:    netAmount,
        per_partner:       perPartner,
        workflow_status:   wf.status,
        declared_by:       wf.initiator_id ?? null,
        notes:             (typeof payload.notes === 'string' ? payload.notes : null),
        ttk_509_compliant: ttk509,
        ttk_519_compliant: ttk519,
      } satisfies DividendLedgerEntry
    })

    // ── Aggregates ───────────────────────────────────────────────────────────

    // "declared" = any non-cancelled entry (pending + approved)
    const declaredEntries = entries.filter(e => e.event_type === 'declared' || e.event_type === 'paid')
    // "paid" = approved workflow only
    const paidEntries     = entries.filter(e => e.event_type === 'paid')

    const totalDeclaredTry   = round2(declaredEntries.reduce((s, e) => s + e.gross_amount_try, 0))
    const totalPaidTry       = round2(paidEntries.reduce((s, e) => s + e.gross_amount_try, 0))
    const totalWithholdingTry = round2(paidEntries.reduce((s, e) => s + e.withholding_try, 0))
    const totalNetPaidTry    = round2(paidEntries.reduce((s, e) => s + e.net_amount_try, 0))

    // YTD = entries whose event_date is in the current calendar year
    const ytdDeclared = declaredEntries.filter(e => new Date(e.event_date).getFullYear() === currentYear)
    const ytdPaid     = paidEntries.filter(e => new Date(e.event_date).getFullYear() === currentYear)

    const ytdDeclaredTry = round2(ytdDeclared.reduce((s, e) => s + e.gross_amount_try, 0))
    const ytdPaidTry     = round2(ytdPaid.reduce((s, e) => s + e.gross_amount_try, 0))

    const perPartnerTotals = sumByPartner(entries)

    return {
      entries,
      total_declared_try:   totalDeclaredTry,
      total_paid_try:       totalPaidTry,
      total_withholding_try: totalWithholdingTry,
      total_net_paid_try:   totalNetPaidTry,
      per_partner_totals:   perPartnerTotals,
      ytd_declared_try:     ytdDeclaredTry,
      ytd_paid_try:         ytdPaidTry,
      compliance_issues:    [...new Set(complianceIssues)],
    }
  }
}
