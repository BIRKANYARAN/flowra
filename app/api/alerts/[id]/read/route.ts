// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/alerts/[id]/read  — mark a single alert as read
// POST /api/alerts/read-all   — handled in a separate flat route
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase-server'
import { contextFromHeader }         from '@/lib/logger'
import { REQUEST_ID_HEADER }         from '@/middleware'
import { AuditService }              from '@/lib/audit'
import { toErrorResponse }           from '@/types/errors'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) {
    return NextResponse.json(
      { error: 'Unauthorized', code: 'UNAUTHORIZED', type: 'SECURITY' },
      { status: 401 }
    )
  }
  const ctx = contextFromHeader(req.headers.get(REQUEST_ID_HEADER), authData.user.id)

  try {
    await AuditService.markAlertRead(authData.user.id, params.id)
    return NextResponse.json({ ok: true }, { headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  } catch (err) {
    const { body, status } = toErrorResponse(err)
    return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  }
}
