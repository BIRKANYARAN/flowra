// ─────────────────────────────────────────────────────────────────────────────
// lib/engines/workflow.engine.ts
//
// Pure workflow state machine — no DB, no side effects.
// Takes current instance + action + actor → new status.
//
// Business rules:
//   pending → approve/reject  by any admin (actorId checked by caller)
//   pending → expire          system only (actorId = 'system')
//   self-approval blocked for all types
//   any other transition → INVALID_TRANSITION
//
// Expiry windows:
//   48h  — expense_approval, partner_loan_entry, dividend_declaration
//   168h — period_close, period_lock
// ─────────────────────────────────────────────────────────────────────────────

export type WorkflowType =
  | 'expense_approval'
  | 'partner_loan_entry'
  | 'dividend_declaration'
  | 'period_close'
  | 'period_lock'

export type WorkflowStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'executed'

export interface WorkflowInstance {
  id:            string
  company_id:    string
  workflow_type: WorkflowType
  status:        WorkflowStatus
  initiator_id:  string
  approver_id?:  string | null
  initiated_at:  string
  resolved_at?:  string | null
  expires_at:    string
  payload:       Record<string, unknown>
  notes?:        string | null
}

export type WorkflowAction = 'approve' | 'reject' | 'expire'

export interface WorkflowTransitionResult {
  success:      boolean
  new_status?:  WorkflowStatus
  error?:       string
}

// ── Expiry windows (hours) ────────────────────────────────────────────────────

const EXPIRY_HOURS: Record<WorkflowType, number> = {
  expense_approval:    48,
  partner_loan_entry:  48,
  dividend_declaration: 48,
  period_close:        168,
  period_lock:         168,
}

// ── Valid transitions ─────────────────────────────────────────────────────────
// Only 'pending' workflows can be acted upon.

const TERMINAL_STATUSES: WorkflowStatus[] = ['approved', 'rejected', 'expired', 'executed']

// ── transitionWorkflow ────────────────────────────────────────────────────────

export function transitionWorkflow(
  instance:    Pick<WorkflowInstance, 'status' | 'workflow_type'>,
  action:      WorkflowAction,
  actorId:     string,
  initiatorId: string,
): WorkflowTransitionResult {
  const { status } = instance

  // Only pending workflows can transition
  if (status !== 'pending') {
    return { success: false, error: 'INVALID_TRANSITION' }
  }

  // expire is system-only
  if (action === 'expire') {
    if (actorId !== 'system') {
      return { success: false, error: 'INVALID_TRANSITION' }
    }
    return { success: true, new_status: 'expired' }
  }

  // approve or reject: block self-approval
  if (actorId === initiatorId) {
    return { success: false, error: 'SELF_APPROVAL_NOT_ALLOWED' }
  }

  if (action === 'approve') {
    return { success: true, new_status: 'approved' }
  }

  if (action === 'reject') {
    return { success: true, new_status: 'rejected' }
  }

  return { success: false, error: 'INVALID_TRANSITION' }
}

// ── getExpiryDate ─────────────────────────────────────────────────────────────

export function getExpiryDate(workflowType: WorkflowType, initiatedAt: string): string {
  const hours = EXPIRY_HOURS[workflowType] ?? 48
  const initiated = new Date(initiatedAt)
  return new Date(initiated.getTime() + hours * 3_600_000).toISOString()
}

// ── isExpired ─────────────────────────────────────────────────────────────────

export function isExpired(instance: Pick<WorkflowInstance, 'expires_at'>): boolean {
  return new Date(instance.expires_at) < new Date()
}
