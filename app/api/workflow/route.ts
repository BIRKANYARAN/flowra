import { NextRequest, NextResponse } from 'next/server'
import { requireRole }      from '@/lib/require-role'
import { WorkflowService }  from '@/lib/services/workflow.service'
import type { WorkflowType, WorkflowStatus } from '@/lib/services/workflow.service'
import { resolveApiAuth }   from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

// GET /api/workflow?type=expense_approval&status=pending  — list workflows (admin)
// POST /api/workflow                                       — initiate a new workflow

const VALID_TYPES: WorkflowType[] = [
  'expense_approval', 'partner_loan', 'dividend_declaration', 'period_close',
]

const VALID_STATUSES: WorkflowStatus[] = ['pending', 'approved', 'rejected', 'expired']

export async function GET(req: NextRequest) {
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { uid, companyId, supabase } = auth

    try { await requireRole(uid, companyId, 'admin', supabase) }
    catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }

    const type   = req.nextUrl.searchParams.get('type')   as WorkflowType   | null
    const status = req.nextUrl.searchParams.get('status') as WorkflowStatus | null

    if (type && !VALID_TYPES.includes(type)) {
      return NextResponse.json({ error: 'Geçersiz workflow type' }, { status: 400 })
    }
    if (status && !VALID_STATUSES.includes(status)) {
      return NextResponse.json({ error: 'Geçersiz workflow status' }, { status: 400 })
    }

    let workflows: Awaited<ReturnType<typeof WorkflowService.getPending>> = []
    try {
      if (status && status !== 'pending') {
        // Non-pending: query directly with status filter
        const { data, error } = await supabase
          .from('workflow_instances')
          .select('*')
          .eq('company_id', companyId)
          .eq('status', status)
          .order('initiated_at', { ascending: false })
        if (error) throw new Error(error.message)
        workflows = (data ?? []) as typeof workflows
        if (type) workflows = workflows.filter(w => w.workflow_type === type)
      } else {
        // Default: pending filter via WorkflowService
        workflows = await WorkflowService.getPending(supabase, companyId, type ?? undefined)
      }
    } catch (e) {
      // Handle missing workflow_instances table gracefully — return empty array
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('does not exist') || msg.includes('relation') || msg.includes('workflow_instances')) {
        return NextResponse.json({ workflows: [], count: 0 })
      }
      throw e
    }
    return NextResponse.json({ workflows, count: workflows.length })
  } catch (e) {
    console.error('[workflow GET]', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { uid, companyId, supabase } = auth

    const body = await req.json() as Record<string, unknown>
    const workflowType = body.workflow_type as WorkflowType | undefined

    if (!workflowType || !VALID_TYPES.includes(workflowType)) {
      return NextResponse.json({ error: 'workflow_type gerekli' }, { status: 400 })
    }

    // expense_approval: any authenticated member can initiate
    // partner_loan / dividend / period_close: admin only
    if (workflowType !== 'expense_approval') {
      try { await requireRole(uid, companyId, 'admin', supabase) }
      catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
    }

    const workflow = await WorkflowService.initiate(supabase, {
      companyId,
      workflowType,
      initiatorId:  uid,
      payload:      (body.payload as Record<string, unknown>) ?? {},
      resourceType: (body.resource_type as string | undefined),
      resourceId:   (body.resource_id   as string | undefined),
    })

    return NextResponse.json({ workflow }, { status: 201 })
  } catch (e) {
    console.error('[workflow POST]', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
