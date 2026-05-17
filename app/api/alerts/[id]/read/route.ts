// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/alerts/[id]/read  — mark a single alert as read
// POST /api/alerts/read-all   — handled in a separate flat route
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { REQUEST_ID_HEADER }         from '@/middleware'
import { AuditService }              from '@/lib/audit'
import { toErrorResponse }           from '@/types/errors'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { uid, companyId, supabase, ctx } = auth

  try {
    await AuditService.markAlertRead(uid, params.id)
    return NextResponse.json({ ok: true }, { headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  } catch (err) {
    const { body, status } = toErrorResponse(err)
    return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  }
}
