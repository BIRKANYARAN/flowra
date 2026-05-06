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
import { createClient }              from '@/lib/supabase-server'
import { contextFromHeader }         from '@/lib/logger'
import { REQUEST_ID_HEADER }         from '@/middleware'
import { AuditService }              from '@/lib/audit'
import { toErrorResponse }           from '@/types/errors'

export async function GET(req: NextRequest) {
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
    const url        = new URL(req.url)
    const unreadOnly = url.searchParams.get('unread_only') === 'true'
    const limit      = url.searchParams.has('limit')
      ? Math.min(Number(url.searchParams.get('limit')), 200)
      : 100

    const alerts = await AuditService.listAlerts(authData.user.id, unreadOnly, limit)
    return NextResponse.json(alerts, { headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  } catch (err) {
    const { body, status } = toErrorResponse(err)
    return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  }
}
