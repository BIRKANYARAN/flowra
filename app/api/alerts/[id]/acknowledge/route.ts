// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/alerts/[id]/acknowledge — acknowledge a single alert
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { REQUEST_ID_HEADER } from '@/middleware'
import { AlertFeedService } from '@/lib/services/intelligence/alert-feed.service'
import { toErrorResponse } from '@/types/errors'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { uid, companyId, supabase, ctx } = auth

  try {
    const alertId = params.id
    if (!alertId) {
      return NextResponse.json({ error: 'Alert ID required' }, { status: 400, headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
    }

    await AlertFeedService.acknowledge(companyId, alertId, uid, supabase)
    return NextResponse.json({ ok: true }, { headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  } catch (err) {
    const { body, status } = toErrorResponse(err)
    return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  }
}
