// ═══════════════════════════════════════════════════════════════════════════════
// GET  /api/alerts                — list alerts for the current user
// POST /api/alerts/read           — mark alert(s) as read (handled in [id] route)
//
// Query params:
//   unread_only   boolean  (default false) — only return unread alerts
//   limit         number   (default 100, max 200)
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { REQUEST_ID_HEADER }         from '@/middleware'
import { AuditService }              from '@/lib/audit'
import { toErrorResponse }           from '@/types/errors'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { uid, companyId, supabase, ctx } = auth

  try {
    const url        = new URL(req.url)
    const unreadOnly = url.searchParams.get('unread_only') === 'true'
    const rawLimit   = Number(url.searchParams.get('limit') ?? 100)
    const limit      = Math.min(isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 100, 200)

    const alerts = await AuditService.listAlerts(uid, unreadOnly, limit)
    return NextResponse.json(alerts, { headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  } catch (err) {
    const { body, status } = toErrorResponse(err)
    return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  }
}
