// ─────────────────────────────────────────────────────────────────────────────
// lib/db/mutation-audit.ts
//
// CONTRACT INTEGRITY — Financial mutation audit layer.
//
// Wraps the existing `logAudit` from lib/audit.ts with financial-domain
// context. Every financial mutation (create/update/delete of a record that
// affects money) should call one of these functions AFTER the DB write succeeds.
//
// Key guarantees:
//   - Fire-and-forget: never throws, never blocks the main flow
//   - Before/after snapshots: callers provide old_data + new_data
//   - Structured source tracking: what route/service triggered the mutation
//   - Amount drift detection: logs when a computed total changes
//
// Usage (in an API route, after a successful supabase write):
//
//   auditSaleMutation({
//     userId,
//     companyId,
//     saleId: sale.id,
//     action: 'update',
//     oldData: previousRow,
//     newData: updatedRow,
//     source: 'api/sales/[id]',
//   })
//   // No await — fire and forget
// ─────────────────────────────────────────────────────────────────────────────

import { logAudit } from '@/lib/audit'
import type { AuditAction, AuditEntityType } from '@/types/index'

// ─── Base mutation input ──────────────────────────────────────────────────────

interface FinancialMutationInput {
  /** User who performed the mutation */
  userId:    string
  /** Company the record belongs to */
  companyId: string
  /** Record ID that was mutated */
  entityId:  string
  /** What happened */
  action:    AuditAction
  /** Row BEFORE the mutation (null for create) */
  oldData?:  Record<string, unknown> | null
  /** Row AFTER the mutation (null for delete) */
  newData?:  Record<string, unknown> | null
  /** Which route or service triggered this — for traceability */
  source:    string
  /** Optional caller IP from request headers */
  ipAddress?:string
}

// ─── Generic financial mutation ───────────────────────────────────────────────

/**
 * Log any financial mutation. Fire-and-forget, never throws.
 * Use this as the base primitive — domain-specific wrappers call this.
 */
export function auditFinancialMutation(
  entityType: AuditEntityType,
  input: FinancialMutationInput,
): void {
  // Always fire-and-forget — do not await
  logAudit({
    userId:     input.userId,
    companyId:  input.companyId,
    entityType,
    entityId:   input.entityId,
    action:     input.action,
    oldData:    input.oldData ?? null,
    newData:    input.newData
      ? { ...input.newData, _mutation_source: input.source }
      : null,
    ipAddress:  input.ipAddress,
  }).catch(err => {
    // Audit failures must never crash the main flow
    console.error('[mutation-audit] WRITE_FAIL:', entityType, input.entityId, err instanceof Error ? err.message : String(err))
  })
}

// ─── Domain-specific wrappers ─────────────────────────────────────────────────

/** Audit a sale mutation (create/update/delete) */
export function auditSaleMutation(input: FinancialMutationInput): void {
  // Detect amount drift: log a warning if total_try changed
  if (input.oldData && input.newData) {
    const oldTotal = Number(input.oldData.total_try ?? input.oldData.total ?? 0)
    const newTotal = Number(input.newData.total_try ?? input.newData.total ?? 0)
    const drift    = Math.abs(newTotal - oldTotal)
    if (drift > 0.01) {
      console.info(
        `[mutation-audit] sale ${input.entityId} total_try drift: ${oldTotal.toFixed(2)} → ${newTotal.toFixed(2)} (Δ${drift.toFixed(2)}) via ${input.source}`,
      )
    }
  }
  auditFinancialMutation('sale', input)
}

/** Audit an expense mutation */
export function auditExpenseMutation(input: FinancialMutationInput): void {
  auditFinancialMutation('expense', input)
}

/** Audit a proforma mutation */
export function auditProformaMutation(input: FinancialMutationInput): void {
  auditFinancialMutation('proforma', input)
}

/** Audit a partner transaction / PCLE event */
export function auditPartnerMutation(input: FinancialMutationInput): void {
  auditFinancialMutation('partner_transaction', input)
}

/** Audit a period state transition (open → pre_close → closed → locked) */
export function auditPeriodTransition(opts: {
  userId:     string
  companyId:  string
  periodId:   string
  fromStatus: string
  toStatus:   string
  source:     string
}): void {
  const { userId, companyId, periodId, fromStatus, toStatus, source } = opts
  auditFinancialMutation('period', {
    userId,
    companyId,
    entityId: periodId,
    action:   'update',
    oldData:  { status: fromStatus },
    newData:  { status: toStatus, _transition: `${fromStatus} → ${toStatus}` },
    source,
  })
}

/** Audit a payment applied to a sale */
export function auditPaymentApplied(opts: {
  userId:     string
  companyId:  string
  saleId:     string
  previousPaidAmount:  number
  newPaidAmount:       number
  paymentStatus:       string
  source:     string
}): void {
  const { userId, companyId, saleId, previousPaidAmount, newPaidAmount, paymentStatus, source } = opts
  auditFinancialMutation('sale', {
    userId,
    companyId,
    entityId: saleId,
    action:   'update',
    oldData:  { paid_amount: previousPaidAmount },
    newData:  { paid_amount: newPaidAmount, payment_status: paymentStatus },
    source,
  })
}

// ─── Amount drift detection utility ──────────────────────────────────────────

/**
 * Detect if a financial amount drifted beyond a tolerance between two snapshots.
 * Returns null if within tolerance, drift info if outside.
 *
 * @example
 *   const drift = detectAmountDrift('total_try', oldRow, newRow)
 *   if (drift) console.warn('[drift]', drift.message)
 */
export function detectAmountDrift(
  field:     string,
  oldData:   Record<string, unknown>,
  newData:   Record<string, unknown>,
  toleranceTry = 0.01,
): { field: string; oldValue: number; newValue: number; delta: number; message: string } | null {
  const oldValue = Number(oldData[field] ?? 0)
  const newValue = Number(newData[field] ?? 0)
  const delta    = Math.abs(newValue - oldValue)

  if (delta > toleranceTry) {
    return {
      field,
      oldValue,
      newValue,
      delta,
      message: `${field} drift: ${oldValue.toFixed(2)} → ${newValue.toFixed(2)} (Δ${delta.toFixed(4)})`,
    }
  }
  return null
}
