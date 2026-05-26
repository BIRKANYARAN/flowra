import { NextRequest, NextResponse } from 'next/server'
import { requireRole }         from '@/lib/require-role'
import { resolveApiAuth }      from '@/lib/api-auth'
import { getExpiryDate }       from '@/lib/engines/workflow.engine'
import type { WorkflowType }   from '@/lib/engines/workflow.engine'

export const dynamic = 'force-dynamic'

// POST /api/workflow/initiate
// body: { workflow_type: WorkflowType, payload: object, notes?: string }
//
// Creates workflow_instances row with status='pending', expires_at computed.
// Requires admin role for most types (expense_approval: any member).
// Returns { workflow_id, expires_at, status: 'pending' }

const VALID_TYPES: WorkflowType[] = [
  'expense_approval',
  'partner_loan_entry',
  'dividend_declaration',
  'period_close',
  'period_lock',
]

// Types that require admin to initiate
const ADMIN_ONLY_TYPES: WorkflowType[] = [
  'partner_loan_entry',
  'dividend_declaration',
  'period_close',
  'period_lock',
]

export async function POST(req: NextRequest) {
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { uid, companyId, supabase } = auth

    const body = await req.json() as Record<string, unknown>
    const workflowType = body.workflow_type as WorkflowType | undefined
    const payload      = (body.payload as Record<string, unknown>) ?? {}
    const notes        = (body.notes as string | undefined) ?? null

    if (!workflowType || !VALID_TYPES.includes(workflowType)) {
      return NextResponse.json(
        { error: `workflow_type geçersiz. Geçerli değerler: ${VALID_TYPES.join(', ')}` },
        { status: 400 },
      )
    }

    // Admin-only types
    if (ADMIN_ONLY_TYPES.includes(workflowType)) {
      try { await requireRole(uid, companyId, 'admin', supabase) }
      catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
    }

    const now       = new Date().toISOString()
    const expiresAt = getExpiryDate(workflowType, now)

    // Insert workflow instance — handle missing table gracefully
    const { data, error } = await supabase
      .from('workflow_instances')
      .insert({
        company_id:    companyId,
        workflow_type: workflowType,
        status:        'pending',
        initiator_id:  uid,
        initiated_at:  now,
        expires_at:    expiresAt,
        payload,
        notes,
      })
      .select('id, expires_at, status')
      .single()

    if (error) {
      // Table doesn't exist yet
      if (error.message?.includes('does not exist') || error.code === '42P01') {
        return NextResponse.json(
          { error: 'Workflow servisi henüz aktif değil (migration bekliyor)' },
          { status: 503 },
        )
      }
      console.error('[workflow/initiate POST]', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(
      {
        workflow_id: (data as { id: string }).id,
        expires_at:  (data as { expires_at: string }).expires_at,
        status:      'pending',
      },
      { status: 201 },
    )
  } catch (e) {
    console.error('[workflow/initiate POST]', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
