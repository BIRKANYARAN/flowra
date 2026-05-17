import { NextRequest, NextResponse } from 'next/server'
import { requireRole }      from '@/lib/require-role'
import { WorkflowService }  from '@/lib/services/workflow.service'
import { logAudit }         from '@/lib/audit'
import type { AuditEntityType, AuditAction } from '@/types'
import { resolveApiAuth }   from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

// POST /api/workflow/[id]/resolve — approve or reject a pending workflow (admin only)

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

    const body = await req.json() as Record<string, unknown>
    const action = body.action as 'approve' | 'reject' | undefined

    if (action !== 'approve' && action !== 'reject') {
      return NextResponse.json({ error: 'action "approve" veya "reject" olmalı' }, { status: 400 })
    }

    const workflow = await WorkflowService.resolve(supabase, {
      workflowId: params.id,
      companyId,
      approverId: uid,
      action,
      notes: (body.notes as string | undefined),
    })

    // ── Post-resolution side effects ──────────────────────────────────────────
    if (workflow.workflow_type === 'expense_approval' && workflow.resource_id) {
      const expenseId = workflow.resource_id
      if (action === 'approve') {
        // Restore intended payment_status from payload
        const intendedStatus = (workflow.payload as Record<string, unknown>).intended_payment_status as string | undefined
        await supabase
          .from('expenses')
          .update({ payment_status: intendedStatus ?? 'paid' })
          .eq('id', expenseId)
          .eq('company_id', companyId)
      } else {
        // Rejected: soft-delete the pending expense
        await supabase
          .from('expenses')
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', expenseId)
          .eq('company_id', companyId)
      }
    }

    logAudit({
      userId:     uid,
      companyId,
      entityType: 'expense' as AuditEntityType,
      entityId:   workflow.id,
      action:     (action === 'approve' ? 'update' : 'delete') as AuditAction,
      newData:    { workflow_status: workflow.status, workflow_type: workflow.workflow_type, notes: workflow.notes },
    })

    return NextResponse.json({ workflow, resolved: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal error'
    const status = msg.includes('bulunamadı') ? 404
      : msg.includes('zaten') || msg.includes('dolmuş') ? 409
      : 500
    console.error('[workflow/resolve]', e)
    return NextResponse.json({ error: msg }, { status })
  }
}
