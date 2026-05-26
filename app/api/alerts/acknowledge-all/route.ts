// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/alerts/acknowledge-all — acknowledge all unresolved alerts
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { REQUEST_ID_HEADER } from '@/middleware'
import { AlertFeedService } from '@/lib/services/intelligence/alert-feed.service'
import { toErrorResponse } from '@/types/errors'

export async function POST(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { uid, companyId, supabase, ctx } = auth

  try {
    const result = await AlertFeedService.acknowledgeAll(companyId, uid, supabase)
    return NextResponse.json(result, { headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  } catch (err) {
    const { body, status } = toErrorResponse(err)
    return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  }
}
