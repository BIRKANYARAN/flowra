// ─────────────────────────────────────────────────────────────────────────────
// AlertFeedService — persistent alert history feed
//
// Syncs live alerts from AlertEngine into the alert_feed table, resolves
// stale alerts, and provides acknowledge operations.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { evaluateAlerts } from '@/lib/engines/alert.engine'
import type { AlertInputs } from '@/lib/engines/alert.engine'

export interface FeedAlert {
  id: string
  alert_key: string
  alert_type: string
  severity: 'info' | 'warning' | 'critical'
  title: string
  detail: string | null
  action_label: string | null
  action_href: string | null
  amount_try: number | null
  due_date: string | null
  is_acknowledged: boolean
  first_triggered_at: string
  last_triggered_at: string
  trigger_count: number
}

export interface AlertFeedReport {
  alerts: FeedAlert[]       // unresolved, not acknowledged, sorted by severity then triggered_at desc
  unread_critical: number
  unread_warning: number
  total_unread: number
  acknowledged_today: number
}

// ── Pure helpers (exported for testing) ───────────────────────────────────────

const SEVERITY_ORDER: Record<string, number> = { critical: 0, warning: 1, info: 2 }

/** Sort alerts by severity (critical first), then by last_triggered_at descending */
export function sortAlertsBySeverity(alerts: FeedAlert[]): FeedAlert[] {
  return [...alerts].sort((a, b) => {
    const sevDiff = (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99)
    if (sevDiff !== 0) return sevDiff
    return new Date(b.last_triggered_at).getTime() - new Date(a.last_triggered_at).getTime()
  })
}

/** Count alerts by severity */
export function countBySeverity(alerts: FeedAlert[]): { critical: number; warning: number; info: number } {
  return alerts.reduce(
    (acc, a) => {
      if (a.severity === 'critical') acc.critical++
      else if (a.severity === 'warning') acc.warning++
      else acc.info++
      return acc
    },
    { critical: 0, warning: 0, info: 0 },
  )
}

// ── Service ───────────────────────────────────────────────────────────────────

export class AlertFeedService {
  /**
   * Sync live alerts from AlertEngine into alert_feed table.
   *
   * NOTE: This sync variant works without AlertInputs by querying them from DB.
   * For a full production sync you'd pass real AlertInputs. Here we accept
   * optional inputs — when omitted we produce an empty live-alert set and only
   * run the auto-resolve pass. Callers that have inputs should pass them.
   */
  static async sync(
    companyId: string,
    supabase: SupabaseClient,
    alertInputs?: AlertInputs,
  ): Promise<{ synced: number; resolved: number }> {
    const now = new Date().toISOString()

    // 1. Evaluate live alerts (from provided inputs, or empty if not provided)
    const liveAlerts = alertInputs ? evaluateAlerts(alertInputs) : []
    const liveKeys = new Set(liveAlerts.map(a => a.id))

    // 2. Upsert each live alert
    let synced = 0
    for (const alert of liveAlerts) {
      // Try to find existing unresolved record
      const { data: existing } = await supabase
        .from('alert_feed')
        .select('id, trigger_count')
        .eq('company_id', companyId)
        .eq('alert_key', alert.id)
        .eq('auto_resolved', false)
        .maybeSingle()

      if (existing) {
        await supabase
          .from('alert_feed')
          .update({
            last_triggered_at: now,
            trigger_count: (existing.trigger_count ?? 1) + 1,
            title: alert.title,
            detail: alert.detail,
            severity: alert.severity,
            action_label: alert.actionLabel,
            action_href: alert.actionHref,
            amount_try: alert.amount ?? null,
            due_date: alert.dueDate ?? null,
          })
          .eq('id', existing.id)
      } else {
        await supabase
          .from('alert_feed')
          .insert({
            company_id: companyId,
            alert_key: alert.id,
            alert_type: alert.rule_type,
            severity: alert.severity,
            title: alert.title,
            detail: alert.detail,
            action_label: alert.actionLabel,
            action_href: alert.actionHref,
            amount_try: alert.amount ?? null,
            due_date: alert.dueDate ?? null,
            first_triggered_at: now,
            last_triggered_at: now,
            trigger_count: 1,
          })
      }
      synced++
    }

    // 3. Auto-resolve alerts whose key is no longer in live set
    const { data: unresolvedRows } = await supabase
      .from('alert_feed')
      .select('id, alert_key')
      .eq('company_id', companyId)
      .eq('auto_resolved', false)

    const toResolve = (unresolvedRows ?? []).filter(r => !liveKeys.has(r.alert_key))
    let resolved = 0

    if (toResolve.length > 0) {
      const ids = toResolve.map(r => r.id)
      await supabase
        .from('alert_feed')
        .update({ auto_resolved: true, resolved_at: now })
        .in('id', ids)
      resolved = ids.length
    }

    return { synced, resolved }
  }

  /**
   * Get the alert feed report for a company.
   */
  static async getFeed(
    companyId: string,
    supabase: SupabaseClient,
    opts?: { includeAcknowledged?: boolean },
  ): Promise<AlertFeedReport> {
    let query = supabase
      .from('alert_feed')
      .select('id, alert_key, alert_type, severity, title, detail, action_label, action_href, amount_try, due_date, is_acknowledged, first_triggered_at, last_triggered_at, trigger_count, acknowledged_at')
      .eq('company_id', companyId)
      .eq('auto_resolved', false)
      .order('last_triggered_at', { ascending: false })

    if (!opts?.includeAcknowledged) {
      query = query.eq('is_acknowledged', false)
    }

    const { data, error } = await query

    if (error) throw new Error(`alert_feed query failed: ${error.message}`)

    const rows = (data ?? []) as Array<{
      id: string
      alert_key: string
      alert_type: string
      severity: string
      title: string
      detail: string | null
      action_label: string | null
      action_href: string | null
      amount_try: number | null
      due_date: string | null
      is_acknowledged: boolean
      first_triggered_at: string
      last_triggered_at: string
      trigger_count: number
      acknowledged_at: string | null
    }>

    const alerts: FeedAlert[] = rows.map(r => ({
      id: r.id,
      alert_key: r.alert_key,
      alert_type: r.alert_type,
      severity: r.severity as 'info' | 'warning' | 'critical',
      title: r.title,
      detail: r.detail,
      action_label: r.action_label,
      action_href: r.action_href,
      amount_try: r.amount_try !== null ? Number(r.amount_try) : null,
      due_date: r.due_date,
      is_acknowledged: r.is_acknowledged,
      first_triggered_at: r.first_triggered_at,
      last_triggered_at: r.last_triggered_at,
      trigger_count: r.trigger_count,
    }))

    const sorted = sortAlertsBySeverity(alerts)
    const counts = countBySeverity(sorted)

    // Count acknowledged today
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const todayISO = todayStart.toISOString()

    const { count: ackToday } = await supabase
      .from('alert_feed')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('is_acknowledged', true)
      .gte('acknowledged_at', todayISO)

    return {
      alerts: sorted,
      unread_critical: counts.critical,
      unread_warning: counts.warning,
      total_unread: counts.critical + counts.warning + counts.info,
      acknowledged_today: ackToday ?? 0,
    }
  }

  /**
   * Acknowledge a single alert.
   */
  static async acknowledge(
    companyId: string,
    alertId: string,
    userId: string,
    supabase: SupabaseClient,
  ): Promise<void> {
    const { error } = await supabase
      .from('alert_feed')
      .update({
        is_acknowledged: true,
        acknowledged_at: new Date().toISOString(),
        acknowledged_by: userId,
      })
      .eq('id', alertId)
      .eq('company_id', companyId)

    if (error) throw new Error(`acknowledge failed: ${error.message}`)
  }

  /**
   * Acknowledge all unresolved alerts for a company.
   */
  static async acknowledgeAll(
    companyId: string,
    userId: string,
    supabase: SupabaseClient,
  ): Promise<{ count: number }> {
    const now = new Date().toISOString()

    const { data, error } = await supabase
      .from('alert_feed')
      .update({
        is_acknowledged: true,
        acknowledged_at: now,
        acknowledged_by: userId,
      })
      .eq('company_id', companyId)
      .eq('auto_resolved', false)
      .eq('is_acknowledged', false)
      .select('id')

    if (error) throw new Error(`acknowledgeAll failed: ${error.message}`)

    return { count: (data ?? []).length }
  }
}
