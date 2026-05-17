import { NextRequest, NextResponse } from 'next/server'
import { requireRole }      from '@/lib/require-role'
import { WorkflowService }  from '@/lib/services/workflow.service'
import type { WorkflowType } from '@/lib/services/workflow.service'
import { resolveApiAuth }   from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

// GET /api/workflow?type=expense_approval   — list pending workflows (admin)
// POST /api/workflow                         — initiate a new workflow

const VALID_TYPES: WorkflowType[] = [
  'expense_approval', 'partner_loan', 'dividend_declaration', 'period_close',
]

export async function GET(req: NextRequest) {
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { uid, companyId, supabase } = auth

    try { await requireRole(uid, companyId, 'admin', supabase) }
    catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }

    const type = req.nextUrl.searchParams.get('type') as WorkflowType | null
    if (type && !VALID_TYPES.includes(type)) {
      return NextResponse.json({ error: 'Geçersiz workflow type' }, { status: 400 })
    }

    const workflows = await WorkflowService.getPending(supabase, companyId, type ?? undefined)
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
