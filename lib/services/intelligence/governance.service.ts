// ═══════════════════════════════════════════════════════════════════════════════
// lib/services/intelligence/governance.service.ts
//
// Governance & Audit Trail — compliance and accountability layer.
// Reads workflow_instances and audit_logs to produce a GovernanceReport with
// resolution stats, high-value action log, and a 0-100 health score.
// ═══════════════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Types ──────────────────────────────────────────────────────────────────────

export type WorkflowOutcome = 'approved' | 'rejected' | 'expired' | 'pending' | 'executed'

export interface WorkflowLogEntry {
  id: string
  workflow_type: string
  type_label: string          // Turkish
  status: WorkflowOutcome
  initiated_by: string        // user_id
  initiated_at: string
  resolved_at: string | null
  resolution_days: number | null
  notes: string | null
  payload_summary: string     // brief description from payload JSONB
}

export interface AuditLogEntry {
  id: string
  action: string
  action_label: string        // Turkish
  resource_type: string
  resource_id: string
  amount_try: number | null
  created_at: string
  user_id: string | null
}

export interface GovernanceReport {
  company_id: string
  // Workflow stats
  total_workflows: number
  resolved_count: number
  pending_count: number
  stale_pending_count: number   // pending > 3 days
  resolution_rate_pct: number
  avg_resolution_days: number | null
  // Log entries
  workflow_log: WorkflowLogEntry[]   // last 50, newest first
  audit_log: AuditLogEntry[]         // last 100, newest first
  // Health
  governance_score: number           // 0-100
  score_breakdown: {
    resolution_rate: number    // 0-40
    no_stale: number           // 0-30
    period_close: number       // 0-20
    audit_trail: number        // 0-10
  }
  computed_at: string
}

// ── Turkish Workflow Type Labels ───────────────────────────────────────────────

export const WORKFLOW_TYPE_LABELS: Record<string, string> = {
  'dividend_declaration': 'Temettü Beyanı',
  'expense_approval':     'Masraf Onayı',
  'partner_loan_entry':   'Ortak Borç Girişi',
  'period_close':         'Dönem Kapanışı',
  'period_lock':          'Dönem Kilitleme',
  'equity_payment':       'Sermaye Ödemesi',
  'compensation_payment': 'Huzur Hakkı',
  'large_expense':        'Büyük Masraf Onayı',
}

// ── Turkish Action Labels ──────────────────────────────────────────────────────

const ACTION_LABELS: Record<string, string> = {
  'sale_created':           'Satış Oluşturuldu',
  'sale_updated':           'Satış Güncellendi',
  'sale_deleted':           'Satış Silindi',
  'expense_created':        'Gider Oluşturuldu',
  'expense_updated':        'Gider Güncellendi',
  'expense_deleted':        'Gider Silindi',
  'expense_approved':       'Gider Onaylandı',
  'partner_loan_created':   'Ortak Borç Girişi',
  'partner_loan_updated':   'Ortak Borç Güncellendi',
  'dividend_declared':      'Temettü Beyan Edildi',
  'dividend_paid':          'Temettü Ödendi',
  'period_closed':          'Dönem Kapatıldı',
  'period_locked':          'Dönem Kilitlendi',
  'period_unlocked':        'Dönem Kilidi Açıldı',
  'equity_payment':         'Sermaye Ödemesi',
  'compensation_payment':   'Huzur Hakkı Ödemesi',
  'user_invited':           'Kullanıcı Davet Edildi',
  'user_removed':           'Kullanıcı Çıkarıldı',
  'role_changed':           'Rol Değiştirildi',
  'create':                 'Oluşturuldu',
  'update':                 'Güncellendi',
  'delete':                 'Silindi',
}

function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action
}

// ── Pure Exports ───────────────────────────────────────────────────────────────

/**
 * Compute resolution time in whole days between initiatedAt and resolvedAt.
 * Returns null if resolvedAt is null (workflow still pending).
 */
export function computeResolutionDays(
  initiatedAt: string,
  resolvedAt: string | null,
): number | null {
  if (!resolvedAt) return null
  const diff = new Date(resolvedAt).getTime() - new Date(initiatedAt).getTime()
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)))
}

/**
 * Compute governance health score 0-100.
 *
 * - resolution_rate (40 pts): linear 0→40 as resolutionRatePct goes 0→100
 * - no_stale (30 pts): 30 if stalePendingCount === 0, else 0
 * - period_close (20 pts): 20 if periodCloseOnTime, else 0
 * - audit_trail (10 pts): 10 if hasAuditTrail, else 0
 */
export function computeGovernanceScore(
  resolutionRatePct: number,
  stalePendingCount: number,
  periodCloseOnTime: boolean,
  hasAuditTrail: boolean,
): number {
  const resolutionScore = Math.round((Math.min(100, Math.max(0, resolutionRatePct)) / 100) * 40)
  const staleScore      = stalePendingCount === 0 ? 30 : 0
  const periodScore     = periodCloseOnTime ? 20 : 0
  const auditScore      = hasAuditTrail ? 10 : 0
  return resolutionScore + staleScore + periodScore + auditScore
}

/**
 * Build a human-readable summary from a workflow payload JSONB object.
 * Tries: amount_try → partner_name → description → "—"
 */
export function buildPayloadSummary(payload: Record<string, unknown> | null): string {
  if (!payload || typeof payload !== 'object') return '—'

  // Try amount_try first
  if (typeof payload.amount_try === 'number' && payload.amount_try > 0) {
    const formatted = payload.amount_try >= 1000
      ? `₺${(payload.amount_try / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 0 })}K`
      : `₺${payload.amount_try.toLocaleString('tr-TR')}`
    return formatted
  }
  if (typeof payload.amount_try === 'string' && Number(payload.amount_try) > 0) {
    const amt = Number(payload.amount_try)
    const formatted = amt >= 1000
      ? `₺${(amt / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 0 })}K`
      : `₺${amt.toLocaleString('tr-TR')}`
    return formatted
  }

  // Try partner_name
  if (typeof payload.partner_name === 'string' && payload.partner_name.trim()) {
    return payload.partner_name.trim()
  }

  // Try description
  if (typeof payload.description === 'string' && payload.description.trim()) {
    const desc = payload.description.trim()
    return desc.length > 60 ? desc.slice(0, 57) + '…' : desc
  }

  return '—'
}

// ── Service ────────────────────────────────────────────────────────────────────

// High-value audit action filter
const HIGH_VALUE_ACTIONS = new Set([
  'sale_created', 'partner_loan_created', 'partner_loan_updated',
  'dividend_declared', 'dividend_paid', 'period_closed', 'period_locked',
  'period_unlocked', 'expense_approved', 'equity_payment', 'compensation_payment',
])

const STALE_THRESHOLD_DAYS = 3

export class GovernanceService {
  /**
   * Build a full GovernanceReport for the given company.
   */
  static async getReport(
    companyId: string,
    supabase: AnyClient,
    workflowLimit = 50,
    auditLimit    = 100,
  ): Promise<GovernanceReport> {
    const now = new Date()

    // ── Parallel DB reads ────────────────────────────────────────────────────
    const [workflowsRes, auditRes, periodCloseRes] = await Promise.allSettled([
      supabase
        .from('workflow_instances')
        .select('id, workflow_type, status, initiator_id, initiated_at, resolved_at, notes, payload')
        .eq('company_id', companyId)
        .order('initiated_at', { ascending: false })
        .limit(workflowLimit),

      supabase
        .from('audit_logs')
        .select('id, action, entity_type, entity_id, new_data, user_id, created_at')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(auditLimit),

      // Check if any period was closed within 10 days of month-end
      supabase
        .from('workflow_instances')
        .select('initiated_at, resolved_at, payload')
        .eq('company_id', companyId)
        .eq('workflow_type', 'period_close')
        .eq('status', 'approved')
        .order('resolved_at', { ascending: false })
        .limit(3),
    ])

    const workflowRows: WorkflowRow[] =
      workflowsRes.status === 'fulfilled' ? (workflowsRes.value.data ?? []) : []
    const auditRows: AuditRow[] =
      auditRes.status === 'fulfilled' ? (auditRes.value.data ?? []) : []
    const closedPeriods: PeriodCloseRow[] =
      periodCloseRes.status === 'fulfilled' ? (periodCloseRes.value.data ?? []) : []

    // ── Workflow stats ───────────────────────────────────────────────────────
    const staleThresholdMs = STALE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000

    const totalWorkflows    = workflowRows.length
    const pendingWorkflows  = workflowRows.filter(w => w.status === 'pending')
    const resolvedWorkflows = workflowRows.filter(w =>
      w.status === 'approved' || w.status === 'rejected' || w.status === 'executed',
    )
    const stalePending = pendingWorkflows.filter(w => {
      const age = now.getTime() - new Date(w.initiated_at).getTime()
      return age > staleThresholdMs
    })

    const resolutionRatePct = totalWorkflows > 0
      ? Math.round((resolvedWorkflows.length / totalWorkflows) * 100)
      : 100  // No workflows = 100% resolved

    // Average resolution days for resolved workflows
    const resolutionTimes = resolvedWorkflows
      .map(w => computeResolutionDays(w.initiated_at, w.resolved_at ?? null))
      .filter((d): d is number => d !== null)
    const avgResolutionDays = resolutionTimes.length > 0
      ? Math.round((resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length) * 10) / 10
      : null

    // ── Period close on time ─────────────────────────────────────────────────
    const periodCloseOnTime = checkPeriodCloseOnTime(closedPeriods)

    // ── Has audit trail ──────────────────────────────────────────────────────
    const hasAuditTrail = auditRows.length > 0

    // ── Governance score ─────────────────────────────────────────────────────
    const resolutionScore = Math.round((Math.min(100, resolutionRatePct) / 100) * 40)
    const staleScore      = stalePending.length === 0 ? 30 : 0
    const periodScore     = periodCloseOnTime ? 20 : 0
    const auditScore      = hasAuditTrail ? 10 : 0
    const governanceScore = resolutionScore + staleScore + periodScore + auditScore

    // ── Build workflow log ───────────────────────────────────────────────────
    const workflowLog: WorkflowLogEntry[] = workflowRows.map(w => ({
      id:              w.id,
      workflow_type:   w.workflow_type,
      type_label:      WORKFLOW_TYPE_LABELS[w.workflow_type] ?? w.workflow_type,
      status:          w.status as WorkflowOutcome,
      initiated_by:    w.initiator_id,
      initiated_at:    w.initiated_at,
      resolved_at:     w.resolved_at ?? null,
      resolution_days: computeResolutionDays(w.initiated_at, w.resolved_at ?? null),
      notes:           w.notes ?? null,
      payload_summary: buildPayloadSummary(w.payload as Record<string, unknown> | null),
    }))

    // ── Build audit log (high-value only) ────────────────────────────────────
    const filteredAuditRows = auditRows.filter(row => {
      if (HIGH_VALUE_ACTIONS.has(row.action)) return true
      // Also include large sales / expenses from new_data
      const newData = row.new_data as Record<string, unknown> | null
      if (!newData) return false
      const amtRaw = newData.total_try ?? newData.amount_try
      const amt = Number(amtRaw ?? 0)
      if (row.entity_type === 'sales'    && amt >= 50_000) return true
      if (row.entity_type === 'expenses' && amt >= 25_000) return true
      return false
    })

    const auditLog: AuditLogEntry[] = filteredAuditRows.map(row => {
      const newData = row.new_data as Record<string, unknown> | null
      const amtRaw  = newData?.total_try ?? newData?.amount_try
      return {
        id:            row.id,
        action:        row.action,
        action_label:  actionLabel(row.action),
        resource_type: row.entity_type,
        resource_id:   row.entity_id ?? '',
        amount_try:    amtRaw != null ? Number(amtRaw) : null,
        created_at:    row.created_at,
        user_id:       row.user_id ?? null,
      }
    })

    return {
      company_id:           companyId,
      total_workflows:      totalWorkflows,
      resolved_count:       resolvedWorkflows.length,
      pending_count:        pendingWorkflows.length,
      stale_pending_count:  stalePending.length,
      resolution_rate_pct:  resolutionRatePct,
      avg_resolution_days:  avgResolutionDays,
      workflow_log:         workflowLog,
      audit_log:            auditLog,
      governance_score:     governanceScore,
      score_breakdown: {
        resolution_rate: resolutionScore,
        no_stale:        staleScore,
        period_close:    periodScore,
        audit_trail:     auditScore,
      },
      computed_at: now.toISOString(),
    }
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

interface WorkflowRow {
  id: string
  workflow_type: string
  status: string
  initiator_id: string
  initiated_at: string
  resolved_at: string | null
  notes: string | null
  payload: unknown
}

interface AuditRow {
  id: string
  action: string
  entity_type: string
  entity_id: string | null
  new_data: unknown
  user_id: string | null
  created_at: string
}

interface PeriodCloseRow {
  initiated_at: string
  resolved_at: string | null
  payload: unknown
}

/**
 * Returns true if the most recent period close was resolved within 10 days of
 * the period end. If no closed periods exist, returns false (no evidence).
 */
function checkPeriodCloseOnTime(closedPeriods: PeriodCloseRow[]): boolean {
  if (closedPeriods.length === 0) return false

  for (const cp of closedPeriods) {
    if (!cp.resolved_at) continue
    const payload = cp.payload as Record<string, unknown> | null

    // Try to get period_end from payload
    const periodEnd = payload?.period_end as string | undefined
    if (!periodEnd) continue

    const periodEndDate = new Date(periodEnd)
    const resolvedDate  = new Date(cp.resolved_at)
    const diffDays = (resolvedDate.getTime() - periodEndDate.getTime()) / (1000 * 60 * 60 * 24)

    if (diffDays <= 10) return true
  }

  return false
}
