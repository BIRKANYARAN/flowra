// ─────────────────────────────────────────────────────────────────────────────
// lib/audit.ts
//
// Phase 7 — Audit, Alerts, and Rollback support layer.
//
// Fire-and-forget writers (never throw, never block):
//   logAudit(input)  — write one audit_logs row after a successful operation
//   logAlert(input)  — write one alerts row for significant events
//
// DB-bound readers:
//   AuditService.listLogs(userId, filters?)  → AuditLog[]
//   AuditService.listAlerts(userId, opts?)   → Alert[]
//   AuditService.markAlertRead(userId, id)   → void
//
// Usage in services (always AFTER the main operation succeeds):
//   logAudit({ userId, entityType: 'purchase', entityId: id, action: 'create', newData: row })
// ─────────────────────────────────────────────────────────────────────────────

import { createClient }    from '@/lib/supabase-server'
import { stampAuditRow }  from '@/lib/services/audit-chain.service'
import { AppError }       from '@/types/errors'
import type {
  AuditLog,
  Alert,
  AuditAction,
  AuditEntityType,
  AlertSeverity,
} from '@/types/index'

// ── Input types ───────────────────────────────────────────────────────────────

export interface LogAuditInput {
  userId:     string
  /** Company the action belongs to. Required — must be a valid UUID. */
  companyId:  string
  entityType: AuditEntityType
  entityId:   string
  action:     AuditAction
  /** Snapshot of the entity BEFORE the change. null for 'create'. */
  oldData?:   Record<string, unknown> | null
  /** Snapshot of the entity AFTER the change. null for 'delete'. */
  newData?:   Record<string, unknown> | null
  /** Caller IP address (optional; populated by route layer). */
  ipAddress?: string
}

export interface LogAlertInput {
  actorUserId: string
  entityType:  AuditEntityType
  entityId:    string
  message:     string
  severity:    AlertSeverity
}

// ── Fire-and-forget writers ───────────────────────────────────────────────────

/**
 * Write one audit log row. Fire-and-forget — never awaited, never throws.
 * Call this synchronously (no await) after a successful DB write.
 */
export async function logAudit(input: LogAuditInput): Promise<void> {
  // createClient() must be called inside the function so it picks up
  // the current request's cookies (Next.js server context).
  try {
    const supabase = createClient()
    const { data: inserted, error: insertError } = await supabase
      .from('audit_logs')
      .insert({
        user_id:     input.userId,
        company_id:  input.companyId,
        entity_type: input.entityType,
        entity_id:   input.entityId,
        action:      input.action,
        old_data:    input.oldData  ?? null,
        new_data:    input.newData  ?? null,
        ip_address:  input.ipAddress ?? null,
      })
      .select('id, created_at')
      .single()

    if (!insertError && inserted) {
      // Fire-and-forget tamper-evident hash stamp.
      // stampAuditRow gracefully no-ops if content_hash column is not yet migrated.
      stampAuditRow(
        inserted.id,
        input.companyId,
        {
          action:        input.action,
          resource_type: input.entityType,
          resource_id:   input.entityId,
          old_values:    input.oldData  ?? null,
          new_values:    input.newData  ?? null,
          created_at:    inserted.created_at,
        },
        supabase,
      ).catch(() => { /* non-fatal: hash stamp failure never blocks audit write */ })
    }
  } catch (err: unknown) {
    // Log but never propagate — audit failures must not crash the main flow.
    console.error('[audit] WRITE_FAIL audit_logs:', err instanceof Error ? err.message : String(err))
  }
}

/**
 * Write one alert row. Fire-and-forget — never awaited, never throws.
 * Call this synchronously (no await) for significant events.
 */
export async function logAlert(input: LogAlertInput): Promise<void> {
  try {
    const supabase = createClient()
    await supabase
      .from('alerts')
      .insert({
        actor_user_id: input.actorUserId,
        entity_type:   input.entityType,
        entity_id:     input.entityId,
        message:       input.message,
        severity:      input.severity,
      })
  } catch (err: unknown) {
    console.error('[audit] WRITE_FAIL alerts:', err instanceof Error ? err.message : String(err))
  }
}

// ── DB-bound read service ─────────────────────────────────────────────────────

export interface AuditLogFilters {
  entity_type?: AuditEntityType
  action?:      AuditAction
  entity_id?:   string
  /** Max rows to return. Default 200, max 500. */
  limit?:       number
  /** ISO datetime — return rows created at or after this timestamp. */
  since?:       string
}

export class AuditService {
  /**
   * List audit logs for a user (most recent first).
   * RLS guarantees the user can only see their own rows.
   */
  static async listLogs(
    userId:   string,
    filters?: AuditLogFilters,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    clientOverride?: any,
  ): Promise<AuditLog[]> {
    // Thread the request's authenticated client through so Bearer-token (mobile/
    // API) callers aren't silently downgraded to an anonymous client by createClient().
    const supabase = clientOverride ?? createClient()
    const cap = Math.min(filters?.limit ?? 200, 500)

    let q = supabase
      .from('audit_logs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(cap)

    if (filters?.entity_type) q = q.eq('entity_type', filters.entity_type)
    if (filters?.action)      q = q.eq('action',      filters.action)
    if (filters?.entity_id)   q = q.eq('entity_id',   filters.entity_id)
    if (filters?.since)       q = q.gte('created_at', filters.since)

    const { data, error } = await q
    if (error) throw new AppError('DB_READ_FAILED', 'Audit logları okunamadı', error)
    return (data ?? []) as AuditLog[]
  }

  /**
   * List alerts for a user (most recent first).
   * Optionally filter to unread only.
   */
  static async listAlerts(
    userId:     string,
    onlyUnread?: boolean,
    limit?:      number,
  ): Promise<Alert[]> {
    const supabase = createClient()
    let q = supabase
      .from('alerts')
      .select('*')
      .eq('actor_user_id', userId)
      .order('created_at', { ascending: false })
      .limit(Math.min(limit ?? 100, 200))

    if (onlyUnread) q = q.eq('is_read', false)

    const { data, error } = await q
    if (error) throw new AppError('DB_READ_FAILED', 'Uyarılar okunamadı', error)
    return (data ?? []) as Alert[]
  }

  /**
   * Mark a single alert as read. Idempotent — safe to call multiple times.
   */
  static async markAlertRead(userId: string, alertId: string): Promise<void> {
    const supabase = createClient()
    const { error } = await supabase
      .from('alerts')
      .update({ is_read: true })
      .eq('id', alertId)
      .eq('actor_user_id', userId)   // RLS + ownership double-check
    if (error) throw new AppError('DB_UPDATE_FAILED', 'Uyarı güncellenemedi', error)
  }

  /**
   * Mark all unread alerts as read for a user.
   */
  static async markAllRead(userId: string): Promise<void> {
    const supabase = createClient()
    const { error } = await supabase
      .from('alerts')
      .update({ is_read: true })
      .eq('actor_user_id', userId)
      .eq('is_read', false)
    if (error) throw new AppError('DB_UPDATE_FAILED', 'Uyarılar güncellenemedi', error)
  }
}
