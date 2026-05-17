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
  async resolve(
    supabase: SupabaseClient,
    params: ResolveWorkflowParams,
  ): Promise<WorkflowInstance> {
    const { workflowId, companyId, approverId, action, notes } = params

    // Fetch and validate
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
    // Check expiry
    if (existing.expires_at && new Date(existing.expires_at as string) < new Date()) {
      await supabase
        .from('workflow_instances')
        .update({ status: 'expired', resolved_at: new Date().toISOString() })
        .eq('id', workflowId)
      throw new Error('Workflow süresi dolmuş')
    }

    const { data: updated, error: updateErr } = await supabase
      .from('workflow_instances')
      .update({
        status:      action === 'approve' ? 'approved' : 'rejected',
        approver_id: approverId,
        resolved_at: new Date().toISOString(),
        notes:       notes ?? null,
      })
      .eq('id', workflowId)
      .eq('company_id', companyId)
      .select()
      .single()

    if (updateErr) throw new Error(`WorkflowService.resolve: ${updateErr.message}`)
    return updated as WorkflowInstance
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
  async expireStale(supabase: SupabaseClient, companyId?: string): Promise<number> {
    // First count pending expired workflows, then update them
    let countQ = supabase
      .from('workflow_instances')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .lt('expires_at', new Date().toISOString())
    if (companyId) countQ = countQ.eq('company_id', companyId)
    const { count } = await countQ

    if (!count || count === 0) return 0

    let updateQ = supabase
      .from('workflow_instances')
      .update({ status: 'expired', resolved_at: new Date().toISOString() })
      .eq('status', 'pending')
      .lt('expires_at', new Date().toISOString())
    if (companyId) updateQ = updateQ.eq('company_id', companyId)
    const { error } = await updateQ
    if (error) throw new Error(`WorkflowService.expireStale: ${error.message}`)
    return count
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
