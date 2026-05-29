// ═══════════════════════════════════════════════════════════════════════════════
// lib/services/pcle/dividend-ledger.service.ts
//
// Dividend Ledger — formal statement of all dividend declarations, withholding
// tax calculations, net payouts per partner, and cumulative dividend history.
//
// Legal framework:
//   GVK 94: 10% withholding tax on gross dividend distributions
//   TTK 509: dividends cannot exceed distributable profit
//
// Pure exports (testable without DB):
//   computePartnerGrossDividend
//   computeWithholdingTax
//   computeNetDividend
//   computeDividendYield
//   validateDividendDeclaration
// ═══════════════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// ── Public interfaces ─────────────────────────────────────────────────────────

export interface DividendEvent {
  event_id: string
  event_type: 'DIVIDEND_DECLARED' | 'DIVIDEND_PAID'
  event_date: string
  period_key: string       // which profit period this dividend is from
  partner_id: string
  partner_name: string
  gross_amount_try: number
  withholding_tax_try: number
  net_amount_try: number
  share_ratio_pct: number
  is_paid: boolean         // DIVIDEND_PAID event exists for this declaration
  paid_date: string | null
}

export interface PartnerDividendSummary {
  partner_id: string
  partner_name: string
  share_ratio_pct: number
  paid_in_capital_try: number
  total_gross_dividends_try: number
  total_withholding_try: number
  total_net_dividends_try: number
  dividend_yield_pct: number | null
  pending_gross_try: number        // declared but not yet paid
  events: DividendEvent[]
}

export interface DividendLedger {
  company_id: string
  generated_at: string
  total_declared_try: number
  total_paid_try: number
  total_pending_try: number
  total_withholding_ytd_try: number
  partner_summaries: PartnerDividendSummary[]
  all_events: DividendEvent[]     // chronological, all partners
  compliance_notes: string[]      // Turkish compliance messages
}

// ── Legacy types (kept for backward compat with existing UI/API) ──────────────

export type DividendEventType = 'declared' | 'paid' | 'cancelled' | 'withheld'

export interface DividendLedgerEntry {
  id: string
  event_type: DividendEventType
  event_date: string
  period_label: string
  gross_amount_try: number
  withholding_try: number
  net_amount_try: number
  per_partner: Array<{
    partner_name: string
    share_ratio: number
    gross_try: number
    withholding_try: number
    net_try: number
    paid: boolean
  }>
  workflow_status: string
  declared_by: string | null
  notes: string | null
  ttk_509_compliant: boolean
  ttk_519_compliant: boolean
}

export interface DividendLedgerReport {
  entries: DividendLedgerEntry[]
  total_declared_try: number
  total_paid_try: number
  total_withholding_try: number
  total_net_paid_try: number
  per_partner_totals: Array<{
    partner_name: string
    total_gross_try: number
    total_net_try: number
    total_withholding_try: number
  }>
  ytd_declared_try: number
  ytd_paid_try: number
  compliance_issues: string[]
}

// ── Internal payload shapes ───────────────────────────────────────────────────

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

interface PartnerFinanceEventRow {
  id:          string
  event_type:  string
  event_date:  string
  period_key:  string | null
  partner_id:  string
  amount_try:  number
  metadata:    Record<string, unknown> | null
  created_at:  string
}

interface PartnerRow {
  id:          string
  name:        string
  share_ratio: number
}

// ── Pure exported functions ───────────────────────────────────────────────────

/**
 * Compute gross dividend for a partner: total_distributable × share_pct / 100
 */
export function computePartnerGrossDividend(
  totalDistributableTry: number,
  shareRatioPct: number,
): number {
  return round2(totalDistributableTry * shareRatioPct / 100)
}

/**
 * Compute withholding tax: gross × 0.10 (GVK 94)
 */
export function computeWithholdingTax(grossDividendTry: number): number {
  if (grossDividendTry <= 0) return 0
  return round2(grossDividendTry * 0.10)
}

/**
 * Compute net dividend: gross - withholding
 */
export function computeNetDividend(grossDividendTry: number): number {
  const withholding = computeWithholdingTax(grossDividendTry)
  return round2(grossDividendTry - withholding)
}

/**
 * Compute cumulative yield: total_dividends_received / paid_in_capital × 100
 * Returns null if paid_in_capital = 0
 */
export function computeDividendYield(
  totalDividendsReceivedTry: number,
  paidInCapitalTry: number,
): number | null {
  if (paidInCapitalTry === 0) return null
  return round2(totalDividendsReceivedTry / paidInCapitalTry * 100)
}

/**
 * Validate dividend declaration: check TTK 509 (cannot exceed distributable profit)
 * Returns { valid: true } or { valid: false, reason: string }
 */
export function validateDividendDeclaration(
  grossDividendTry: number,
  distributableProfitTry: number,
): { valid: boolean; reason: string | null } {
  if (grossDividendTry <= distributableProfitTry) {
    return { valid: true, reason: null }
  }
  return {
    valid: false,
    reason: `TTK 509 ihlali: Beyan edilen temettü (₺${grossDividendTry.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}) dağıtılabilir kârı (₺${distributableProfitTry.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}) aşıyor`,
  }
}

// ── Legacy pure helpers (kept for backward compat with existing tests) ─────────

/**
 * Given a gross dividend amount and partner list (with share_ratio values),
 * returns a per-partner breakdown with 10% withholding applied to each share.
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
      partner_name:    p.name,
      share_ratio:     round2(ratio),
      gross_try:       gross,
      withholding_try: withholding,
      net_try:         net,
      paid:            false,
    }
  })
}

/**
 * Compute 10% withholding tax (GVK 94 §4) on a gross dividend amount.
 * @deprecated Use computeWithholdingTax instead.
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
  private supabase: AnyClient

  constructor(supabase: AnyClient) {
    this.supabase = supabase
  }

  /**
   * Build a full DividendLedger for a company.
   * Fetches DIVIDEND_DECLARED and DIVIDEND_PAID events from partner_finance_events,
   * matches declarations to payments, builds per-partner summaries.
   */
  async getLedger(companyId: string, year?: number): Promise<DividendLedger> {
    // Fetch partner data and paid-in capital in parallel
    const [partnersRes, eventsRes] = await Promise.all([
      this.supabase
        .from('partners')
        .select('id, name, share_ratio')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .eq('is_active', true)
        .order('name'),
      this.fetchDividendEvents(companyId, year),
    ])

    const partners = (partnersRes.data ?? []) as PartnerRow[]

    // Fetch paid-in capital per partner
    const capitalMap = await this.fetchPaidInCapital(companyId)

    // Build per-partner summaries
    const partnerMap = new Map<string, PartnerRow>(
      partners.map(p => [p.id, p]),
    )

    // Group events by partner
    const eventsByPartner = new Map<string, DividendEvent[]>()
    for (const event of eventsRes) {
      const list = eventsByPartner.get(event.partner_id) ?? []
      list.push(event)
      eventsByPartner.set(event.partner_id, list)
    }

    // All partner IDs that have events OR are active partners
    const allPartnerIds = new Set<string>([
      ...partners.map(p => p.id),
      ...eventsRef(eventsRes),
    ])

    const partnerSummaries: PartnerDividendSummary[] = []
    const currentYear = new Date().getFullYear()

    for (const partnerId of allPartnerIds) {
      const partner = partnerMap.get(partnerId)
      if (!partner) continue

      const shareRatioPct = round2(partner.share_ratio * 100)
      const paidInCapital = capitalMap.get(partnerId) ?? 0
      const events = eventsByPartner.get(partnerId) ?? []

      const declaredEvents = events.filter(e => e.event_type === 'DIVIDEND_DECLARED')
      const totalGross = round2(declaredEvents.reduce((s, e) => s + e.gross_amount_try, 0))
      const totalWithholding = round2(declaredEvents.reduce((s, e) => s + e.withholding_tax_try, 0))
      const totalNet = round2(declaredEvents.reduce((s, e) => s + e.net_amount_try, 0))
      const pendingGross = round2(declaredEvents.filter(e => !e.is_paid).reduce((s, e) => s + e.gross_amount_try, 0))
      const dividendYield = computeDividendYield(totalNet, paidInCapital)

      partnerSummaries.push({
        partner_id:                partnerId,
        partner_name:              partner.name,
        share_ratio_pct:           shareRatioPct,
        paid_in_capital_try:       paidInCapital,
        total_gross_dividends_try: totalGross,
        total_withholding_try:     totalWithholding,
        total_net_dividends_try:   totalNet,
        dividend_yield_pct:        dividendYield,
        pending_gross_try:         pendingGross,
        events:                    events.sort((a, b) => a.event_date.localeCompare(b.event_date)),
      })
    }

    // Sort by partner name
    partnerSummaries.sort((a, b) => a.partner_name.localeCompare(b.partner_name, 'tr'))

    // Aggregate totals
    const allDeclared = eventsRes.filter(e => e.event_type === 'DIVIDEND_DECLARED')
    const allPaid     = eventsRes.filter(e => e.event_type === 'DIVIDEND_PAID')

    const totalDeclaredTry = round2(allDeclared.reduce((s, e) => s + e.gross_amount_try, 0))
    const totalPaidTry     = round2(allDeclared.filter(e => e.is_paid).reduce((s, e) => s + e.gross_amount_try, 0))
    const totalPendingTry  = round2(allDeclared.filter(e => !e.is_paid).reduce((s, e) => s + e.gross_amount_try, 0))

    // YTD withholding (year filter already applied if year param provided; otherwise use current year)
    const ytdYear = year ?? currentYear
    const ytdEvents = allDeclared.filter(e => e.event_date.startsWith(String(ytdYear)))
    const totalWithholdingYtd = round2(ytdEvents.reduce((s, e) => s + e.withholding_tax_try, 0))

    // Compliance notes
    const complianceNotes: string[] = []
    if (totalWithholdingYtd > 0) {
      complianceNotes.push(
        `KV stopajı toplam ₺${totalWithholdingYtd.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} — beyanname dahil edin`,
      )
    }

    // All events chronological
    const allEvents = [...eventsRes].sort((a, b) => a.event_date.localeCompare(b.event_date))

    return {
      company_id:              companyId,
      generated_at:            new Date().toISOString(),
      total_declared_try:      totalDeclaredTry,
      total_paid_try:          totalPaidTry,
      total_pending_try:       totalPendingTry,
      total_withholding_ytd_try: totalWithholdingYtd,
      partner_summaries:       partnerSummaries,
      all_events:              allEvents,
      compliance_notes:        complianceNotes,
    }
  }

  /**
   * Fetch DIVIDEND_DECLARED and DIVIDEND_PAID events from partner_finance_events.
   * Falls back to workflow_instances if partner_finance_events is empty.
   */
  private async fetchDividendEvents(
    companyId: string,
    year?: number,
  ): Promise<DividendEvent[]> {
    try {
      let query = this.supabase
        .from('partner_finance_events')
        .select('id, event_type, event_date, period_key, partner_id, amount_try, metadata, created_at')
        .eq('company_id', companyId)
        .in('event_type', ['DIVIDEND_DECLARED', 'DIVIDEND_PAID'])
        .order('event_date', { ascending: true })

      if (year) {
        query = query
          .gte('event_date', `${year}-01-01`)
          .lte('event_date', `${year}-12-31`)
      }

      const { data, error } = await query

      if (!error && data && data.length > 0) {
        return this.buildEventsFromFinanceEvents(
          (data as PartnerFinanceEventRow[]),
          companyId,
        )
      }
    } catch { /* fallthrough to workflow approach */ }

    // Fallback: derive from workflow_instances
    return this.fetchEventsFromWorkflows(companyId, year)
  }

  private async buildEventsFromFinanceEvents(
    rows: PartnerFinanceEventRow[],
    _companyId: string,
  ): Promise<DividendEvent[]> {
    // Fetch partner names
    const partnerIds = [...new Set(rows.map(r => r.partner_id))]
    const { data: partnerData } = await this.supabase
      .from('partners')
      .select('id, name, share_ratio')
      .in('id', partnerIds)

    const partnerMap = new Map<string, { name: string; share_ratio: number }>(
      ((partnerData ?? []) as PartnerRow[]).map(p => [p.id, p]),
    )

    // Build payment lookup: partner_id → paid_date
    const declaredRows = rows.filter(r => r.event_type === 'DIVIDEND_DECLARED')
    const paidRows     = rows.filter(r => r.event_type === 'DIVIDEND_PAID')
    const paidByPartner = new Map<string, string>()
    for (const p of paidRows) {
      paidByPartner.set(p.partner_id, p.event_date)
    }

    return declaredRows.map(row => {
      const partner = partnerMap.get(row.partner_id)
      const gross = Number(row.amount_try ?? 0)
      const withholding = computeWithholdingTax(gross)
      const net = computeNetDividend(gross)
      const shareRatioPct = partner ? round2(partner.share_ratio * 100) : 0
      const paidDate = paidByPartner.get(row.partner_id) ?? null

      return {
        event_id:           row.id,
        event_type:         'DIVIDEND_DECLARED' as const,
        event_date:         row.event_date,
        period_key:         row.period_key ?? row.event_date.slice(0, 7),
        partner_id:         row.partner_id,
        partner_name:       partner?.name ?? 'Bilinmeyen Ortak',
        gross_amount_try:   gross,
        withholding_tax_try: withholding,
        net_amount_try:     net,
        share_ratio_pct:    shareRatioPct,
        is_paid:            paidDate !== null,
        paid_date:          paidDate,
      }
    })
  }

  private async fetchEventsFromWorkflows(
    companyId: string,
    year?: number,
  ): Promise<DividendEvent[]> {
    try {
      let query = this.supabase
        .from('workflow_instances')
        .select('id, status, initiated_at, resolved_at, initiator_id, payload')
        .eq('company_id', companyId)
        .eq('workflow_type', 'dividend_declaration')
        .order('initiated_at', { ascending: true })

      if (year) {
        query = query
          .gte('initiated_at', `${year}-01-01`)
          .lte('initiated_at', `${year}-12-31T23:59:59.999Z`)
      }

      const { data, error } = await query
      if (error || !data) return []

      const workflows = data as WorkflowRow[]

      // Fetch partners for name/share lookups
      const { data: partnerData } = await this.supabase
        .from('partners')
        .select('id, name, share_ratio')
        .eq('company_id', companyId)
        .is('deleted_at', null)

      const partnerMap = new Map<string, PartnerRow>(
        ((partnerData ?? []) as PartnerRow[]).map(p => [p.id, p]),
      )

      const events: DividendEvent[] = []

      for (const wf of workflows) {
        const payload = wf.payload ?? {} as WorkflowPayload
        const allocs = payload.partner_allocations ?? []

        if (allocs.length === 0) {
          // No per-partner breakdown — create aggregate-level event
          const gross = Number(payload.gross_dividend_try ?? 0)
          events.push({
            event_id:           wf.id,
            event_type:         'DIVIDEND_DECLARED',
            event_date:         wf.initiated_at.slice(0, 10),
            period_key:         wf.initiated_at.slice(0, 7),
            partner_id:         'aggregate',
            partner_name:       'Tüm Ortaklar',
            gross_amount_try:   gross,
            withholding_tax_try: computeWithholdingTax(gross),
            net_amount_try:     computeNetDividend(gross),
            share_ratio_pct:    100,
            is_paid:            wf.status === 'approved',
            paid_date:          wf.status === 'approved' ? (wf.resolved_at?.slice(0, 10) ?? null) : null,
          })
          continue
        }

        for (const alloc of allocs) {
          const partner = partnerMap.get(alloc.partner_id)
          events.push({
            event_id:           `${wf.id}::${alloc.partner_id}`,
            event_type:         'DIVIDEND_DECLARED',
            event_date:         wf.initiated_at.slice(0, 10),
            period_key:         wf.initiated_at.slice(0, 7),
            partner_id:         alloc.partner_id,
            partner_name:       alloc.partner_name ?? partner?.name ?? 'Bilinmeyen',
            gross_amount_try:   Number(alloc.gross_share_try ?? 0),
            withholding_tax_try: Number(alloc.withholding_try ?? 0),
            net_amount_try:     Number(alloc.net_share_try ?? 0),
            share_ratio_pct:    Number(alloc.share_ratio_pct ?? 0),
            is_paid:            wf.status === 'approved',
            paid_date:          wf.status === 'approved' ? (wf.resolved_at?.slice(0, 10) ?? null) : null,
          })
        }
      }

      return events
    } catch {
      return []
    }
  }

  /**
   * Fetch paid-in capital per partner from partner_capital_commitments.
   */
  private async fetchPaidInCapital(
    companyId: string,
  ): Promise<Map<string, number>> {
    const map = new Map<string, number>()
    try {
      const { data, error } = await this.supabase
        .from('partner_capital_commitments')
        .select('partner_id, paid_amount_try')
        .eq('company_id', companyId)

      if (error || !data) return map

      for (const row of data as Array<{ partner_id: string; paid_amount_try: unknown }>) {
        const existing = map.get(row.partner_id) ?? 0
        map.set(row.partner_id, round2(existing + Number(row.paid_amount_try ?? 0)))
      }
    } catch { /* graceful fallback */ }
    return map
  }

  // ── Legacy static method (kept for backward compat with old route) ────────────

  /**
   * @deprecated Use new DividendLedgerService(supabase).getLedger() instead.
   */
  static async getReport(
    companyId: string,
    supabase: AnyClient,
  ): Promise<DividendLedgerReport> {
    const twoYearsAgo = new Date()
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2)
    const sinceDate = twoYearsAgo.toISOString().slice(0, 10)

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

    const entries: DividendLedgerEntry[] = workflows.map(wf => {
      const payload = wf.payload ?? {} as WorkflowPayload

      const eventType: DividendEventType =
        wf.status === 'approved'  ? 'paid'      :
        wf.status === 'rejected'  ? 'cancelled' :
        wf.status === 'expired'   ? 'cancelled' :
        'declared'

      const grossAmount     = Number(payload.gross_dividend_try ?? 0)
      const withholdingAmt  = Number(payload.withholding_try ?? 0) || computeWithholding(grossAmount)
      const netAmount       = round2(grossAmount - withholdingAmt)

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

      const ttk509 = payload.ttk_509_satisfied ?? (grossAmount > 0 && (payload.ytd_net_income_try ?? 0) > 0)
      const ttk519 = payload.ttk_519_satisfied ?? true

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

    const declaredEntries = entries.filter(e => e.event_type === 'declared' || e.event_type === 'paid')
    const paidEntries     = entries.filter(e => e.event_type === 'paid')

    const totalDeclaredTry    = round2(declaredEntries.reduce((s, e) => s + e.gross_amount_try, 0))
    const totalPaidTry        = round2(paidEntries.reduce((s, e) => s + e.gross_amount_try, 0))
    const totalWithholdingTry = round2(paidEntries.reduce((s, e) => s + e.withholding_try, 0))
    const totalNetPaidTry     = round2(paidEntries.reduce((s, e) => s + e.net_amount_try, 0))

    const ytdDeclared = declaredEntries.filter(e => new Date(e.event_date).getFullYear() === currentYear)
    const ytdPaid     = paidEntries.filter(e => new Date(e.event_date).getFullYear() === currentYear)

    const ytdDeclaredTry = round2(ytdDeclared.reduce((s, e) => s + e.gross_amount_try, 0))
    const ytdPaidTry     = round2(ytdPaid.reduce((s, e) => s + e.gross_amount_try, 0))

    const perPartnerTotals = sumByPartner(entries)

    return {
      entries,
      total_declared_try:    totalDeclaredTry,
      total_paid_try:        totalPaidTry,
      total_withholding_try: totalWithholdingTry,
      total_net_paid_try:    totalNetPaidTry,
      per_partner_totals:    perPartnerTotals,
      ytd_declared_try:      ytdDeclaredTry,
      ytd_paid_try:          ytdPaidTry,
      compliance_issues:     [...new Set(complianceIssues)],
    }
  }
}

// ── Helper: extract unique partner IDs from events ────────────────────────────

function eventsRef(events: DividendEvent[]): string[] {
  return [...new Set(events.map(e => e.partner_id))]
}
