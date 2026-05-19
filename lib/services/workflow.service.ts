// ── WorkflowService — Multi-step approval engine ─────────────────────────────
//
// Handles approval workflows for:
//   expense_approval      — manager expense > threshold → admin must approve
//   partner_loan          — 2-step admin confirm for partner loan entry
//   dividend_declaration  — legality check + admin final
//   period_close          — 5/5 checklist before period close
//
// All workflow records are append-only; resolved workflows are never deleted.
// Timeout: 48 hours for expense/loan/dividend. Period close: no expiry.

import type { SupabaseClient } from '@supabase/supabase-js'

// ── Types ─────────────────────────────────────────────────────────────────────

export type WorkflowType =
  | 'expense_approval'
  | 'partner_loan'
  | 'dividend_declaration'
  | 'period_close'

export type WorkflowStatus = 'pending' | 'approved' | 'rejected' | 'expired'

export interface WorkflowInstance {
  id:            string
  company_id:    string
  workflow_type: WorkflowType
  status:        WorkflowStatus
  initiator_id:  string
  approver_id:   string | null
  initiated_at:  string
  resolved_at:   string | null
  expires_at:    string | null
  payload:       Record<string, unknown>
  notes:         string | null
  resource_type: string | null
  resource_id:   string | null
  created_at:    string
  updated_at:    string
}

export interface WorkflowChecklistItem {
  id:           string
  workflow_id:  string
  item_key:     string
  label:        string
  is_required:  boolean
  is_completed: boolean
  completed_at: string | null
  completed_by: string | null
  notes:        string | null
}

export interface InitiateWorkflowParams {
  companyId:     string
  workflowType:  WorkflowType
  initiatorId:   string
  payload:       Record<string, unknown>
  resourceType?: string
  resourceId?:   string
  /** Hours until expiry. Defaults: expense=48, loan=48, dividend=72, period=none */
  expiresInHours?: number | null
}

export interface ResolveWorkflowParams {
  workflowId:  string
  companyId:   string
  approverId:  string
  action:      'approve' | 'reject'
  notes?:      string
}

// ── Default checklist items per workflow type ─────────────────────────────────

const PERIOD_CLOSE_CHECKLIST: Array<{ key: string; label: string; required: boolean }> = [
  { key: 'trial_balance',     label: 'Mizan dengesi kontrol edildi',          required: true  },
  { key: 'bank_reconciliation', label: 'Banka mutabakatı tamamlandı',         required: true  },
  { key: 'all_sales_entered', label: 'Tüm satış faturaları girildi',           required: true  },
  { key: 'all_expenses_entered', label: 'Tüm masraflar girildi',               required: true  },
  { key: 'kdv_calculated',    label: 'KDV beyanı hesaplandı',                  required: true  },
  { key: 'stock_counted',     label: 'Stok sayımı yapıldı',                    required: false },
  { key: 'compensation_paid', label: 'Ortak huzur hakkı işlendi',              required: false },
  { key: 'interest_accrued',  label: 'Faiz tahakkukları hesaplandı',           required: false },
]

// ── Default expiry per type (hours) ──────────────────────────────────────────

const DEFAULT_EXPIRY_HOURS: Record<WorkflowType, number | null> = {
  expense_approval:     48,
  partner_loan:         48,
  dividend_declaration: 72,
  period_close:         null,  // no expiry for period close
}

// ── WorkflowService ──────────────────────────────────────────────────────────

export const WorkflowService = {

  // ── initiate ───────────────────────────────────────────────────────────────
  // Creates a new pending workflow instance.
  // For period_close, also creates checklist items.
  async initiate(
    supabase: SupabaseClient,
    params: InitiateWorkflowParams,
  ): Promise<WorkflowInstance> {
    const { companyId, workflowType, initiatorId, payload, resourceType, resourceId } = params

    const expiresInHours = params.expiresInHours !== undefined
      ? params.expiresInHours
      : DEFAULT_EXPIRY_HOURS[workflowType]

    const expiresAt = expiresInHours != null
      ? new Date(Date.now() + expiresInHours * 3_600_000).toISOString()
      : null

    // Duplicate workflow guard: prevent multiple concurrent pending workflows for
    // the same resource. A manager retrying a failed submission or a race between
    // two concurrent form submits must not create duplicate approval queues.
    if (resourceId && resourceType) {
      const existing = await WorkflowService.getForResource(supabase, companyId, resourceType, resourceId)
      if (existing) {
        throw new Error(
          `Bu kayıt için zaten bekleyen bir onay akışı var (id: ${existing.id})`
        )
      }
    }

    const { data, error } = await supabase
      .from('workflow_instances')
      .insert({
        company_id:    companyId,
        workflow_type: workflowType,
        status:        'pending',
        initiator_id:  initiatorId,
        payload,
        resource_type: resourceType ?? null,
        resource_id:   resourceId   ?? null,
        expires_at:    expiresAt,
      })
      .select()
      .single()

    if (error) throw new Error(`WorkflowService.initiate: ${error.message}`)
    const instance = data as WorkflowInstance

    // For period_close, create checklist items
    if (workflowType === 'period_close') {
      const items = PERIOD_CLOSE_CHECKLIST.map(item => ({
        workflow_id:  instance.id,
        item_key:     item.key,
        label:        item.label,
        is_required:  item.required,
        is_completed: false,
      }))
      await supabase.from('workflow_instance_items').insert(items)
    }

    return instance
  },

  // ── resolve ────────────────────────────────────────────────────────────────
  // Approves or rejects a workflow.
  //
  // Governance guards:
  //   1. Status check — must be 'pending'; expired transitions are detected here.
  //   2. Expiry check — if expires_at is in the past, expire and reject.
  //   3. Self-approval block — financial workflows (partner_loan, dividend_declaration)
  //      require a different approver than the initiator.
  //   4. CAS update — WHERE status='pending' prevents concurrent double-resolution
  //      when two admins approve the same workflow simultaneously.
  async resolve(
    supabase: SupabaseClient,
    params: ResolveWorkflowParams,
  ): Promise<WorkflowInstance> {
    const { workflowId, companyId, approverId, action, notes } = params

    // Fetch and validate current state
    const { data: existing, error: fetchErr } = await supabase
      .from('workflow_instances')
      .select('*')
      .eq('id', workflowId)
      .eq('company_id', companyId)
      .single()

    if (fetchErr || !existing) throw new Error('Workflow bulunamadı')
    if (existing.status !== 'pending') {
      throw new Error(`Workflow zaten ${existing.status} — değiştirilemez`)
    }

    // Expiry check: transition to expired before rejecting
    if (existing.expires_at && new Date(existing.expires_at as string) < new Date()) {
      await supabase
        .from('workflow_instances')
        .update({ status: 'expired', resolved_at: new Date().toISOString() })
        .eq('id', workflowId)
        .eq('status', 'pending')  // CAS — only expire if still pending
      throw new Error('Workflow süresi dolmuş')
    }

    // Self-approval guard: financial workflows require independent approver
    const SELF_APPROVAL_BLOCKED: WorkflowType[] = ['partner_loan', 'dividend_declaration']
    if (
      SELF_APPROVAL_BLOCKED.includes(existing.workflow_type as WorkflowType) &&
      existing.initiator_id === approverId
    ) {
      throw new Error(
        `${existing.workflow_type} workflow'u için kendi başlattığınız işlemi onaylayamazsınız — bağımsız yönetici onayı gerekir`
      )
    }

    // CAS update: .eq('status', 'pending') ensures only one concurrent request wins.
    // If two admins simultaneously pass the read check above, the second one will
    // find 0 rows updated and receive a 409 from the route handler.
    const resolvedStatus = action === 'approve' ? 'approved' : 'rejected'
    const { data: updatedRows, error: updateErr } = await supabase
      .from('workflow_instances')
      .update({
        status:      resolvedStatus,
        approver_id: approverId,
        resolved_at: new Date().toISOString(),
        notes:       notes ?? null,
      })
      .eq('id', workflowId)
      .eq('company_id', companyId)
      .eq('status', 'pending')  // CAS guard — prevents concurrent double-resolution
      .select()

    if (updateErr) throw new Error(`WorkflowService.resolve: ${updateErr.message}`)
    if (!updatedRows || updatedRows.length === 0) {
      throw new Error('Workflow zaten işleme alındı — eş zamanlı değişiklik algılandı')
    }
    return updatedRows[0] as WorkflowInstance
  },

  // ── completeChecklistItem ──────────────────────────────────────────────────
  async completeChecklistItem(
    supabase: SupabaseClient,
    workflowId: string,
    itemKey: string,
    completedBy: string,
    notes?: string,
  ): Promise<void> {
    const { error } = await supabase
      .from('workflow_instance_items')
      .update({
        is_completed: true,
        completed_at: new Date().toISOString(),
        completed_by: completedBy,
        notes:        notes ?? null,
      })
      .eq('workflow_id', workflowId)
      .eq('item_key', itemKey)

    if (error) throw new Error(`WorkflowService.completeChecklistItem: ${error.message}`)
  },

  // ── getChecklist ───────────────────────────────────────────────────────────
  async getChecklist(
    supabase: SupabaseClient,
    workflowId: string,
  ): Promise<WorkflowChecklistItem[]> {
    const { data, error } = await supabase
      .from('workflow_instance_items')
      .select('*')
      .eq('workflow_id', workflowId)
      .order('is_required', { ascending: false })

    if (error) throw new Error(`WorkflowService.getChecklist: ${error.message}`)
    return (data ?? []) as WorkflowChecklistItem[]
  },

  // ── getPending ─────────────────────────────────────────────────────────────
  async getPending(
    supabase: SupabaseClient,
    companyId: string,
    type?: WorkflowType,
  ): Promise<WorkflowInstance[]> {
    let q = supabase
      .from('workflow_instances')
      .select('*')
      .eq('company_id', companyId)
      .eq('status', 'pending')
      .order('initiated_at', { ascending: false })

    if (type) q = q.eq('workflow_type', type)

    const { data, error } = await q
    if (error) throw new Error(`WorkflowService.getPending: ${error.message}`)
    return (data ?? []) as WorkflowInstance[]
  },

  // ── getForResource ─────────────────────────────────────────────────────────
  // Find active (pending) workflow for a specific resource.
  async getForResource(
    supabase: SupabaseClient,
    companyId: string,
    resourceType: string,
    resourceId: string,
  ): Promise<WorkflowInstance | null> {
    const { data, error } = await supabase
      .from('workflow_instances')
      .select('*')
      .eq('company_id', companyId)
      .eq('resource_type', resourceType)
      .eq('resource_id', resourceId)
      .eq('status', 'pending')
      .order('initiated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) throw new Error(`WorkflowService.getForResource: ${error.message}`)
    return (data ?? null) as WorkflowInstance | null
  },

  // ── expireStale ────────────────────────────────────────────────────────────
  // Called by cron job to expire workflows past their expiry time.
  //
  // Three-phase approach:
  //   1. SELECT pending workflows with expires_at < now (collect IDs + metadata)
  //   2. UPDATE those workflows to status='expired'
  //   3. For expense_approval workflows, soft-delete associated orphaned pending
  //      expenses so they don't linger in the DB as invisible pending records.
  //
  // Returns { expired, orphaned_expenses_cleaned, expired_workflow_ids } so the
  // cron caller can write structured audit log entries for each expiration.
  async expireStale(
    supabase: SupabaseClient,
    companyId?: string,
  ): Promise<{
    expired: number
    orphaned_expenses_cleaned: number
    expired_workflow_ids: string[]
    expired_workflows: Array<{ id: string; workflow_type: string; company_id: string; resource_id: string | null; resource_type: string | null; initiator_id: string }>
  }> {
    const now = new Date().toISOString()

    // Phase 1: Find all stale pending workflows
    let findQ = supabase
      .from('workflow_instances')
      .select('id, workflow_type, company_id, resource_id, resource_type, initiator_id')
      .eq('status', 'pending')
      .lt('expires_at', now)
      .not('expires_at', 'is', null)
    if (companyId) findQ = findQ.eq('company_id', companyId)

    const { data: staleWorkflows, error: findErr } = await findQ
    if (findErr) throw new Error(`WorkflowService.expireStale find: ${findErr.message}`)
    if (!staleWorkflows || staleWorkflows.length === 0) {
      return { expired: 0, orphaned_expenses_cleaned: 0, expired_workflow_ids: [], expired_workflows: [] }
    }

    const staleIds = staleWorkflows.map(w => w.id as string)

    // Phase 2: Expire them atomically using IN clause
    const { error: updateErr } = await supabase
      .from('workflow_instances')
      .update({ status: 'expired', resolved_at: now })
      .in('id', staleIds)
      .eq('status', 'pending')  // Guard: only update rows still pending (concurrent safety)
    if (updateErr) throw new Error(`WorkflowService.expireStale update: ${updateErr.message}`)

    // Phase 3: Clean up orphaned pending expenses for expired expense_approval workflows.
    // Without this, approved-pending expenses remain in limbo — not counted in P&L,
    // not deleted, not visible to CFO — invisible financial ghost entries.
    const expenseApprovalWorkflows = staleWorkflows.filter(
      w => w.workflow_type === 'expense_approval' && w.resource_id
    )
    let orphanedExpensesCleaned = 0
    if (expenseApprovalWorkflows.length > 0) {
      const orphanedExpenseIds = expenseApprovalWorkflows.map(w => w.resource_id as string)
      let cleanQ = supabase
        .from('expenses')
        .update({ deleted_at: now })
        .in('id', orphanedExpenseIds)
        .eq('payment_status', 'pending')
        .is('deleted_at', null)
      if (companyId) cleanQ = cleanQ.eq('company_id', companyId)
      const { count: cleaned, error: cleanErr } = await cleanQ
      if (cleanErr) {
        // Non-fatal: log but don't fail the cron job over orphan cleanup
        console.warn('[WorkflowService.expireStale] orphan expense cleanup failed (non-fatal):', cleanErr.message)
      } else {
        orphanedExpensesCleaned = cleaned ?? 0
      }
    }

    return {
      expired: staleIds.length,
      orphaned_expenses_cleaned: orphanedExpensesCleaned,
      expired_workflow_ids: staleIds,
      expired_workflows: staleWorkflows as Array<{ id: string; workflow_type: string; company_id: string; resource_id: string | null; resource_type: string | null; initiator_id: string }>,
    }
  },

  // ── getApprovalThreshold ───────────────────────────────────────────────────
  // Returns expense approval threshold (TRY) from alert_rules.
  // Default: 50_000 TRY
  async getApprovalThreshold(
    supabase: SupabaseClient,
    companyId: string,
  ): Promise<number> {
    const { data } = await supabase
      .from('alert_rules')
      .select('threshold_value')
      .eq('company_id', companyId)
      .eq('rule_type', 'EXPENSE_APPROVAL_THRESHOLD')
      .eq('is_active', true)
      .maybeSingle()

    return data?.threshold_value != null ? Number(data.threshold_value) : 50_000
  },

  // ── isRequiredForExpense ───────────────────────────────────────────────────
  // Returns true if this expense amount triggers an approval workflow.
  // Only applies when initiator is not an admin.
  isRequiredForExpense(amountTry: number, threshold: number): boolean {
    return amountTry > threshold
  },
}
