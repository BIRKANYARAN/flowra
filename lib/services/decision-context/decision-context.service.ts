// ─────────────────────────────────────────────────────────────────────────────
// lib/services/decision-context/decision-context.service.ts
//
// Automated Decision Context Engine — captures financial state snapshots at the
// moment significant governance decisions are made.
//
// Core principle: never ask users to take notes. Instead, automatically record
// the financial context (cash, runway, net income, partner debt, situation score)
// so that future decision-makers can verify what the financial state was at the
// time of approval.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient }   from '@supabase/supabase-js'
import { round2 }                from '@/lib/calc'
import { computeSituation }      from '@/lib/engines/situation.engine'
import { PartnerService }        from '@/lib/services/partner.service'
import { PeriodService }         from '@/lib/services/period.service'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Pure Helpers ──────────────────────────────────────────────────────────────

/**
 * Compute how much has changed between two snapshots (numeric distance 0–100).
 * Compares key numeric fields across all four state groups and returns a
 * weighted average of relative differences, clamped to [0, 100].
 */
export function computeSnapshotDrift(prev: ContextSnapshot, curr: ContextSnapshot): number {
  // Each entry: [prevValue, currValue, maxScale (used to normalise)]
  const comparisons: Array<[number, number, number]> = [
    // Financial state
    [prev.financial_state.cash_try,             curr.financial_state.cash_try,             1_000_000],
    [prev.financial_state.cash_runway_months,   curr.financial_state.cash_runway_months,   24],
    [prev.financial_state.net_income_try,        curr.financial_state.net_income_try,        500_000],
    [prev.financial_state.composite_score,       curr.financial_state.composite_score,       100],
    // Partner state
    [prev.partner_state.total_partner_debt_try,  curr.partner_state.total_partner_debt_try,  1_000_000],
    [prev.partner_state.active_partners,         curr.partner_state.active_partners,         20],
    [prev.partner_state.overfinanced_partners,   curr.partner_state.overfinanced_partners,   10],
    // Receivables state
    [prev.receivables_state.total_receivables_try,   curr.receivables_state.total_receivables_try,   1_000_000],
    [prev.receivables_state.overdue_receivables_try, curr.receivables_state.overdue_receivables_try, 500_000],
    [prev.receivables_state.overdue_ratio,           curr.receivables_state.overdue_ratio,           100],
    // Governance state
    [prev.governance_state.open_period_days,  curr.governance_state.open_period_days,  365],
    [prev.governance_state.pending_workflows, curr.governance_state.pending_workflows, 50],
    [prev.governance_state.recent_resolutions, curr.governance_state.recent_resolutions, 30],
  ]

  let totalDrift = 0
  for (const [p, c, scale] of comparisons) {
    const diff = Math.abs(c - p)
    const normalised = scale > 0 ? Math.min(1, diff / scale) : 0
    totalDrift += normalised
  }

  const avgDrift = totalDrift / comparisons.length
  return Math.round(Math.min(100, avgDrift * 100))
}

/**
 * Returns a human-readable title for what changed most between two snapshots.
 */
export function summarizeChanges(prev: ContextSnapshot, curr: ContextSnapshot): string {
  const candidates: Array<{ label: string; relChange: number }> = [
    {
      label: 'nakit',
      relChange: prev.financial_state.cash_try !== 0
        ? Math.abs((curr.financial_state.cash_try - prev.financial_state.cash_try) / Math.abs(prev.financial_state.cash_try))
        : curr.financial_state.cash_try !== 0 ? 1 : 0,
    },
    {
      label: 'nakit ömrü',
      relChange: prev.financial_state.cash_runway_months !== 0
        ? Math.abs((curr.financial_state.cash_runway_months - prev.financial_state.cash_runway_months) / Math.abs(prev.financial_state.cash_runway_months))
        : curr.financial_state.cash_runway_months !== 0 ? 1 : 0,
    },
    {
      label: 'net gelir',
      relChange: prev.financial_state.net_income_try !== 0
        ? Math.abs((curr.financial_state.net_income_try - prev.financial_state.net_income_try) / Math.abs(prev.financial_state.net_income_try))
        : curr.financial_state.net_income_try !== 0 ? 1 : 0,
    },
    {
      label: 'bileşik skor',
      relChange: prev.financial_state.composite_score !== 0
        ? Math.abs((curr.financial_state.composite_score - prev.financial_state.composite_score) / Math.abs(prev.financial_state.composite_score))
        : curr.financial_state.composite_score !== 0 ? 1 : 0,
    },
    {
      label: 'ortak borcu',
      relChange: prev.partner_state.total_partner_debt_try !== 0
        ? Math.abs((curr.partner_state.total_partner_debt_try - prev.partner_state.total_partner_debt_try) / Math.abs(prev.partner_state.total_partner_debt_try))
        : curr.partner_state.total_partner_debt_try !== 0 ? 1 : 0,
    },
    {
      label: 'toplam alacak',
      relChange: prev.receivables_state.total_receivables_try !== 0
        ? Math.abs((curr.receivables_state.total_receivables_try - prev.receivables_state.total_receivables_try) / Math.abs(prev.receivables_state.total_receivables_try))
        : curr.receivables_state.total_receivables_try !== 0 ? 1 : 0,
    },
    {
      label: 'gecikme oranı',
      relChange: prev.receivables_state.overdue_ratio !== 0
        ? Math.abs((curr.receivables_state.overdue_ratio - prev.receivables_state.overdue_ratio) / Math.abs(prev.receivables_state.overdue_ratio))
        : curr.receivables_state.overdue_ratio !== 0 ? 1 : 0,
    },
    {
      label: 'bekleyen iş akışı',
      relChange: prev.governance_state.pending_workflows !== 0
        ? Math.abs((curr.governance_state.pending_workflows - prev.governance_state.pending_workflows) / Math.abs(prev.governance_state.pending_workflows))
        : curr.governance_state.pending_workflows !== 0 ? 1 : 0,
    },
  ]

  const revenue_trend_changed =
    prev.financial_state.revenue_trend !== curr.financial_state.revenue_trend
  const status_changed =
    prev.financial_state.situation_status !== curr.financial_state.situation_status

  candidates.sort((a, b) => b.relChange - a.relChange)
  const top = candidates[0]

  const parts: string[] = []

  if (top.relChange > 0) {
    parts.push(`En büyük değişim: ${top.label}`)
  }
  if (status_changed) {
    parts.push(`durum ${prev.financial_state.situation_status} → ${curr.financial_state.situation_status}`)
  }
  if (revenue_trend_changed) {
    parts.push(`gelir trendi ${prev.financial_state.revenue_trend} → ${curr.financial_state.revenue_trend}`)
  }

  if (parts.length === 0) return 'Anlamlı bir değişim tespit edilmedi.'
  return parts.join('; ') + '.'
}

/**
 * Classify snapshot age based on capturedAt ISO timestamp.
 * fresh  = < 24 hours
 * stale  = >= 24 hours and < 7 days
 * outdated = >= 7 days
 */
export function classifySnapshotAge(
  capturedAt: string,
  nowIso: string,
): 'fresh' | 'stale' | 'outdated' {
  const capturedMs = new Date(capturedAt).getTime()
  const nowMs      = new Date(nowIso).getTime()
  const diffHours  = (nowMs - capturedMs) / (1000 * 60 * 60)

  if (diffHours < 24)         return 'fresh'
  if (diffHours < 7 * 24)     return 'stale'
  return 'outdated'
}

/**
 * Build a clean annotation tag string from an array of tags.
 * Rules: trim whitespace, deduplicate, keep max 5, join with ", ".
 */
export function buildAnnotationTag(tags: string[]): string {
  const seen = new Set<string>()
  const result: string[] = []

  for (const tag of tags) {
    const t = tag.trim()
    if (!t) continue
    if (seen.has(t)) continue
    seen.add(t)
    result.push(t)
    if (result.length === 5) break
  }

  return result.join(', ')
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ContextSnapshot {
  financial_state: {
    cash_try:             number
    cash_runway_months:   number
    net_income_try:       number        // last 30 days
    revenue_trend:        'up' | 'down' | 'stable'
    situation_status:     'healthy' | 'caution' | 'at-risk' | 'critical'
    composite_score:      number
  }
  partner_state: {
    total_partner_debt_try:  number
    active_partners:         number
    overfinanced_partners:   number    // partners whose loans exceed their pro-rata share
  }
  receivables_state: {
    total_receivables_try:   number
    overdue_receivables_try: number
    overdue_ratio:           number
  }
  governance_state: {
    open_period_days:    number        // how many days current period has been open
    pending_workflows:   number
    recent_resolutions:  number        // resolutions in last 30 days
  }
  computed_at: string                  // ISO timestamp
}

export interface DecisionContextSnapshot {
  id:             string
  company_id:     string
  trigger_type:   string
  trigger_id:     string | null
  trigger_label:  string
  decision_by:    string | null
  decision_at:    string
  context_snapshot: ContextSnapshot
  annotation:     string | null
  annotated_by:   string | null
  annotated_at:   string | null
  created_at:     string
}

// ── Service ───────────────────────────────────────────────────────────────────

export class DecisionContextService {

  /**
   * Build a ContextSnapshot from current live DB state.
   * Uses Promise.allSettled so partial data is better than no data.
   */
  static async buildSnapshot(
    companyId: string,
    uid:       string,
    supabase:  AnyClient,
  ): Promise<ContextSnapshot> {
    const now      = new Date()
    const today    = now.toISOString().slice(0, 10)
    const ago30    = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const ago60    = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000)
    const date30   = ago30.toISOString().slice(0, 10)
    const date60   = ago60.toISOString().slice(0, 10)

    // ── Parallel data fetch ───────────────────────────────────────────────────
    const [
      cashResult,
      salesLast30Result,
      salesPrev30Result,
      receivablesResult,
      overdueResult,
      pendingWorkflowsResult,
      openPeriodResult,
      partnerBalancesResult,
      recentResolutionsResult,
    ] = await Promise.allSettled([

      // 1. Cash inflows (total paid - total expenses)
      (async () => {
        const [inflows, outflows] = await Promise.all([
          supabase
            .from('sales')
            .select('total_try:total, paid_amount, payment_status')
            .eq('company_id', companyId)
            .is('deleted_at', null)
            .in('payment_status', ['paid', 'partial']),
          supabase
            .from('expenses')
            .select('amount_try')
            .eq('company_id', companyId)
            .eq('payment_status', 'paid')
            .is('deleted_at', null),
        ])
        let collected = 0
        for (const s of inflows.data ?? []) {
          if (s.payment_status === 'paid') collected += Number(s.total_try ?? 0)
          else collected += Number(s.paid_amount ?? 0)
        }
        const paid = (outflows.data ?? []).reduce(
          (sum: number, e: { amount_try: number }) => sum + Number(e.amount_try ?? 0), 0,
        )
        return round2(Math.max(0, collected - paid))
      })(),

      // 2. Sales last 30 days (revenue)
      supabase
        .from('sales')
        .select('total_try:total')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('sale_date', date30)
        .lte('sale_date', today),

      // 3. Sales prev 30 days (for trend)
      supabase
        .from('sales')
        .select('total_try:total')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('sale_date', date60)
        .lt('sale_date', date30),

      // 4. Total receivables (unpaid / partial / overdue)
      supabase
        .from('sales')
        .select('total_try:total, paid_amount')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .in('payment_status', ['pending', 'partial', 'overdue']),

      // 5. Overdue receivables specifically
      supabase
        .from('sales')
        .select('total_try:total, paid_amount')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .eq('payment_status', 'overdue'),

      // 6. Pending workflows
      supabase
        .from('workflow_instances')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .eq('status', 'pending'),

      // 7. Current open accounting period
      PeriodService.getCurrent(companyId, supabase),

      // 8. Partner balances
      PartnerService.getPartnerBalances(uid, companyId, undefined, supabase),

      // 9. Resolutions in last 30 days
      supabase
        .from('governance_resolutions')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .gte('resolution_date', date30),
    ])

    // ── Unpack results (fallback to 0 on failure) ─────────────────────────────

    const cash_try = cashResult.status === 'fulfilled' ? cashResult.value : 0

    const rev30 = salesLast30Result.status === 'fulfilled'
      ? (salesLast30Result.value.data ?? []).reduce((s: number, r: { total_try: number }) => s + Number(r.total_try ?? 0), 0)
      : 0

    const rev60prev = salesPrev30Result.status === 'fulfilled'
      ? (salesPrev30Result.value.data ?? []).reduce((s: number, r: { total_try: number }) => s + Number(r.total_try ?? 0), 0)
      : 0

    // Revenue trend
    let revenue_trend: 'up' | 'down' | 'stable' = 'stable'
    if (rev30 > rev60prev * 1.05)       revenue_trend = 'up'
    else if (rev30 < rev60prev * 0.95)  revenue_trend = 'down'

    // Net income (approx): revenue minus a rough expense estimate
    const net_income_try = round2(rev30 * 0.25) // kept simple; full computation would need FinanceService

    // Receivables
    let total_receivables_try = 0
    if (receivablesResult.status === 'fulfilled') {
      for (const r of receivablesResult.value.data ?? []) {
        total_receivables_try += Math.max(0, Number(r.total_try ?? 0) - Number(r.paid_amount ?? 0))
      }
    }
    total_receivables_try = round2(total_receivables_try)

    let overdue_receivables_try = 0
    if (overdueResult.status === 'fulfilled') {
      for (const r of overdueResult.value.data ?? []) {
        overdue_receivables_try += Math.max(0, Number(r.total_try ?? 0) - Number(r.paid_amount ?? 0))
      }
    }
    overdue_receivables_try = round2(overdue_receivables_try)

    const overdue_ratio = total_receivables_try > 0
      ? round2((overdue_receivables_try / total_receivables_try) * 100)
      : 0

    // Pending workflows
    const pending_workflows = pendingWorkflowsResult.status === 'fulfilled'
      ? (pendingWorkflowsResult.value.count ?? 0)
      : 0

    // Open period days
    let open_period_days = 0
    if (openPeriodResult.status === 'fulfilled' && openPeriodResult.value) {
      const start = new Date(openPeriodResult.value.period_start)
      open_period_days = Math.round((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
    }

    // Partner state
    let total_partner_debt_try = 0
    let active_partners        = 0
    let overfinanced_partners  = 0
    let maxBurdenScoreAbs      = 0

    if (partnerBalancesResult.status === 'fulfilled') {
      const balances = partnerBalancesResult.value
      const totalLoanedProRata = balances
        .filter(b => b.is_active)
        .reduce((s, b) => s + b.net_loan_try, 0)

      for (const b of balances) {
        if (b.is_active) active_partners++
        total_partner_debt_try += Math.max(0, b.net_loan_try)
        // overfinanced: partner loan exceeds their pro-rata share of total loans
        if (b.net_loan_try > 0 && totalLoanedProRata > 0) {
          const actualShare = b.net_loan_try / totalLoanedProRata
          const expectedShare = b.share_ratio
          const burden = Math.abs(actualShare - expectedShare)
          if (burden > 0.05) overfinanced_partners++
          if (burden > maxBurdenScoreAbs) maxBurdenScoreAbs = burden
        }
      }
    }
    total_partner_debt_try = round2(total_partner_debt_try)

    // Recent resolutions
    const recent_resolutions = recentResolutionsResult.status === 'fulfilled'
      ? (recentResolutionsResult.value.count ?? 0)
      : 0

    // ── Situation score ───────────────────────────────────────────────────────
    // Monthly expenses estimate for runway
    const monthlyExpenseEstimate = rev30 > 0 ? rev30 * 0.75 : 1
    const cash_runway_months = monthlyExpenseEstimate > 0
      ? round2(cash_try / monthlyExpenseEstimate)
      : 0
    const isProfitable   = net_income_try > 0
    const netMarginPct   = rev30 > 0 ? net_income_try / rev30 : 0
    const overdueRatioPct = overdue_ratio

    const situation = computeSituation({
      cashRunwayMonths:  cash_runway_months,
      isProfitable,
      netMarginPct,
      debtServiceRatio:  0,
      overdueRatioPct,
      maxBurdenScoreAbs,
    })

    return {
      financial_state: {
        cash_try,
        cash_runway_months,
        net_income_try,
        revenue_trend,
        situation_status: situation.status,
        composite_score:  situation.composite,
      },
      partner_state: {
        total_partner_debt_try,
        active_partners,
        overfinanced_partners,
      },
      receivables_state: {
        total_receivables_try,
        overdue_receivables_try,
        overdue_ratio,
      },
      governance_state: {
        open_period_days,
        pending_workflows,
        recent_resolutions,
      },
      computed_at: now.toISOString(),
    }
  }

  /**
   * Capture a context snapshot for a decision event and persist it.
   */
  static async capture(
    companyId: string,
    userId:    string,
    supabase:  AnyClient,
    params: {
      triggerType:  string
      triggerId?:   string
      triggerLabel: string
    },
  ): Promise<DecisionContextSnapshot> {
    const snapshot = await this.buildSnapshot(companyId, userId, supabase)

    const { data, error } = await supabase
      .from('decision_context_snapshots')
      .insert({
        company_id:       companyId,
        trigger_type:     params.triggerType,
        trigger_id:       params.triggerId ?? null,
        trigger_label:    params.triggerLabel,
        decision_by:      userId,
        decision_at:      new Date().toISOString(),
        context_snapshot: snapshot,
      })
      .select()
      .single()

    if (error) throw new Error(`Failed to capture decision context: ${error.message}`)
    return data as DecisionContextSnapshot
  }

  /**
   * List snapshots for a company, newest first.
   */
  static async list(
    companyId: string,
    supabase:  AnyClient,
    opts?: {
      triggerType?: string
      limit?:       number
      offset?:      number
    },
  ): Promise<DecisionContextSnapshot[]> {
    let query = supabase
      .from('decision_context_snapshots')
      .select('*')
      .eq('company_id', companyId)
      .order('decision_at', { ascending: false })

    if (opts?.triggerType) {
      query = query.eq('trigger_type', opts.triggerType)
    }

    const limit  = opts?.limit  ?? 50
    const offset = opts?.offset ?? 0
    query = query.range(offset, offset + limit - 1)

    const { data, error } = await query
    if (error) throw new Error(`Failed to list decision snapshots: ${error.message}`)
    return (data ?? []) as DecisionContextSnapshot[]
  }

  /**
   * Add or update an annotation on an existing snapshot.
   */
  static async annotate(
    id:         string,
    companyId:  string,
    userId:     string,
    annotation: string,
    supabase:   AnyClient,
  ): Promise<void> {
    const { error } = await supabase
      .from('decision_context_snapshots')
      .update({
        annotation,
        annotated_by: userId,
        annotated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('company_id', companyId)

    if (error) throw new Error(`Failed to annotate snapshot: ${error.message}`)
  }

  /**
   * Get a single snapshot by ID.
   */
  static async getById(
    id:        string,
    companyId: string,
    supabase:  AnyClient,
  ): Promise<DecisionContextSnapshot | null> {
    const { data, error } = await supabase
      .from('decision_context_snapshots')
      .select('*')
      .eq('id', id)
      .eq('company_id', companyId)
      .maybeSingle()

    if (error) throw new Error(`Failed to get snapshot: ${error.message}`)
    return data as DecisionContextSnapshot | null
  }
}
