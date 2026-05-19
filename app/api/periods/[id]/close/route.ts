import { NextRequest, NextResponse } from 'next/server'
import { requireRole }      from '@/lib/require-role'
import { TrialBalanceService } from '@/lib/services/ledger/trial-balance.service'
import { ReconciliationService } from '@/lib/services/ledger/reconciliation.service'
import { resolveApiAuth } from '@/lib/api-auth'
import { auditPeriodTransition } from '@/lib/db/mutation-audit'
import { WorkflowService } from '@/lib/services/workflow.service'

export const dynamic = 'force-dynamic'

// POST /api/periods/[id]/close — transition period open|pre_close → closed
// Guards: admin only, trial balance must be balanced, reconciliation must pass
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { uid, companyId, supabase } = auth

    try { await requireRole(uid, companyId, 'admin', supabase) }
    catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }

    const { data: period, error: periodErr } = await supabase
      .from('accounting_periods')
      .select('id, status, period_start, period_end')
      .eq('id', params.id)
      .eq('company_id', companyId)
      .maybeSingle()

    if (periodErr || !period) return NextResponse.json({ error: 'Dönem bulunamadı' }, { status: 404 })
    if (period.status === 'closed')  return NextResponse.json({ error: 'Dönem zaten kapalı' }, { status: 409 })
    if (period.status === 'locked')  return NextResponse.json({ error: 'Dönem kilitlenmiş, kapatılamaz' }, { status: 409 })

    // Run accounting checks before allowing close
    const [tbReport, reconciliation] = await Promise.all([
      TrialBalanceService.compute(companyId, supabase, { periodId: params.id }),
      ReconciliationService.check(companyId, supabase, { periodId: params.id }),
    ])

    // Use canClosePeriod from TrialBalanceService — requires balance + no abnormal + entries
    if (!tbReport.can_close_period) {
      const failedChecks = tbReport.checks.filter(c => !c.passed).map(c => c.name).join(', ')
      return NextResponse.json({
        error:   'Muhasebe kontrolleri geçilemedi. Dönem kapatılamaz.',
        detail:  failedChecks || 'Mizan dengeli değil veya journal kayıt yok.',
        code:    'TRIAL_BALANCE_UNBALANCED',
      }, { status: 422 })
    }

    const hasCriticalReconciliation = reconciliation.items.some(i => i.severity === 'critical')
    if (hasCriticalReconciliation) {
      return NextResponse.json({
        error:  'Mutabakat kritik uyuşmazlıklar içeriyor. Düzeltme yapın.',
        items:  reconciliation.items.filter(i => i.severity === 'critical'),
        code:   'RECONCILIATION_FAILED',
      }, { status: 422 })
    }

    // ── Workflow awareness check (non-blocking) ───────────────────────────────
    // Query pending expense approval workflows before closing the period.
    // These are NOT blockers — the CFO can still close, but should be aware that
    // un-approved expenses are still outstanding. They will flow into the next
    // period if approved after close, which may cause reconciliation surprises.
    //
    // This is informational only: warnings are returned alongside the success response.
    // If the workflow_instances table doesn't exist yet, we degrade gracefully.
    const pendingWorkflowWarnings: Array<{ id: string; amount_try: number | null; description: string | null }> = []
    try {
      const pending = await WorkflowService.getPending(supabase, companyId, 'expense_approval')
      for (const wf of pending) {
        pendingWorkflowWarnings.push({
          id:          wf.id,
          amount_try:  (wf.payload as { amount_try?: number } | null)?.amount_try ?? null,
          description: (wf.payload as { notes?: string } | null)?.notes ?? null,
        })
      }
    } catch (wfErr) {
      // Non-fatal: workflow_instances table may not exist in all environments
      console.warn('[periods/close] workflow check failed (non-fatal):', wfErr instanceof Error ? wfErr.message : String(wfErr))
    }

    // Transition to closed — conditional on current status to prevent concurrent
    // double-close race (two admins simultaneously passing the pre-check).
    // .neq('status','closed') ensures only one request wins the CAS-like update.
    const { error: updateErr, count } = await supabase
      .from('accounting_periods')
      .update({
        status:    'closed',
        closed_at: new Date().toISOString(),
        closed_by: uid,
      }, { count: 'exact' })
      .eq('id', params.id)
      .eq('company_id', companyId)
      .neq('status', 'closed')
      .neq('status', 'locked')

    if (updateErr) {
      console.error('[periods/close] update error:', updateErr)
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }
    if (count === 0) {
      // Another request already closed this period between our read and write
      return NextResponse.json({ error: 'Dönem zaten kapalı veya kilitlendi', code: 'CONCURRENT_TRANSITION' }, { status: 409 })
    }

    // Audit trail — period state transitions are immutable and must be traceable
    auditPeriodTransition({
      userId:     uid,
      companyId,
      periodId:   params.id,
      fromStatus: period.status,
      toStatus:   'closed',
      source:     'api/periods/close',
    })

    return NextResponse.json({
      closed:          true,
      period_id:       params.id,
      trial_balance:   { is_balanced: true, checks: tbReport.checks },
      reconciliation:  { is_reconciled: reconciliation.is_reconciled },
      warnings:        pendingWorkflowWarnings.length > 0
        ? [{
            code:    'PENDING_EXPENSE_APPROVALS',
            message: `${pendingWorkflowWarnings.length} bekleyen masraf onayı var. Bu masraflar onaylanırsa bir sonraki döneme düşecek.`,
            items:   pendingWorkflowWarnings,
          }]
        : [],
    })
  } catch (e) {
    console.error('[periods/close] error:', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
