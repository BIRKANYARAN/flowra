import { NextRequest, NextResponse } from 'next/server'
import { requireRole }         from '@/lib/require-role'
import { resolveApiAuth }      from '@/lib/api-auth'
import { logAudit }            from '@/lib/audit'
import { transitionWorkflow }  from '@/lib/engines/workflow.engine'
import type { AuditEntityType, AuditAction } from '@/types'

export const dynamic = 'force-dynamic'

// GET  /api/workflow/[id]  → WorkflowInstance
// PATCH /api/workflow/[id] body: { action: 'approve' | 'reject', notes?: string }

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { uid, companyId, supabase } = auth

    try { await requireRole(uid, companyId, 'admin', supabase) }
    catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }

    const { id } = await params

    const { data, error } = await supabase
      .from('workflow_instances')
      .select('*')
      .eq('id', id)
      .eq('company_id', companyId)
      .maybeSingle()

    if (error) {
      if (error.message?.includes('does not exist') || error.code === '42P01') {
        return NextResponse.json(
          { error: 'Workflow servisi henüz aktif değil (migration bekliyor)' },
          { status: 503 },
        )
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!data) return NextResponse.json({ error: 'Workflow bulunamadı' }, { status: 404 })

    return NextResponse.json({ workflow: data })
  } catch (e) {
    console.error('[workflow GET id]', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { uid, companyId, supabase } = auth

    try { await requireRole(uid, companyId, 'admin', supabase) }
    catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }

    const { id } = await params
    const body = await req.json() as Record<string, unknown>
    const action = body.action as 'approve' | 'reject' | undefined
    const notes  = body.notes as string | undefined

    if (action !== 'approve' && action !== 'reject') {
      return NextResponse.json({ error: 'action "approve" veya "reject" olmalı' }, { status: 400 })
    }

    // Fetch current workflow
    const { data: current, error: fetchErr } = await supabase
      .from('workflow_instances')
      .select('*')
      .eq('id', id)
      .eq('company_id', companyId)
      .maybeSingle()

    if (fetchErr) {
      if (fetchErr.message?.includes('does not exist') || fetchErr.code === '42P01') {
        return NextResponse.json(
          { error: 'Workflow servisi henüz aktif değil (migration bekliyor)' },
          { status: 503 },
        )
      }
      return NextResponse.json({ error: fetchErr.message }, { status: 500 })
    }

    if (!current) return NextResponse.json({ error: 'Workflow bulunamadı' }, { status: 404 })

    // Run state machine
    const result = transitionWorkflow(
      current,
      action,
      uid,
      current.initiator_id as string,
    )

    if (!result.success) {
      const status =
        result.error === 'SELF_APPROVAL_NOT_ALLOWED' ? 403 :
        result.error === 'INVALID_TRANSITION'        ? 409 :
        400
      return NextResponse.json({ error: result.error }, { status })
    }

    // Update DB
    const now = new Date().toISOString()
    const { data: updated, error: updateErr } = await supabase
      .from('workflow_instances')
      .update({
        status:      result.new_status,
        approver_id: uid,
        resolved_at: now,
        notes:       notes ?? null,
      })
      .eq('id', id)
      .eq('company_id', companyId)
      .eq('status', 'pending')   // CAS guard
      .select()
      .maybeSingle()

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })
    if (!updated)  return NextResponse.json({ error: 'Workflow zaten işleme alındı' }, { status: 409 })

    // Audit
    const entityType: AuditEntityType = 'workflow'
    logAudit({
      userId:     uid,
      companyId,
      entityType,
      entityId:   id,
      action:     (action === 'approve' ? 'update' : 'delete') as AuditAction,
      newData:    { workflow_id: id, workflow_status: result.new_status, approver_id: uid, notes: notes ?? null },
    })

    return NextResponse.json({ workflow: updated, resolved: true })
  } catch (e) {
    console.error('[workflow PATCH id]', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
