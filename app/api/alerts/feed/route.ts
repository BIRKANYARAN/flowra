// ═══════════════════════════════════════════════════════════════════════════════
// GET  /api/alerts/feed  — returns AlertFeedReport
// POST /api/alerts/feed  — triggers sync (with optional alertInputs body)
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { REQUEST_ID_HEADER } from '@/middleware'
import { AlertFeedService } from '@/lib/services/intelligence/alert-feed.service'
import { toErrorResponse } from '@/types/errors'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase, ctx } = auth

  try {
    const url = new URL(req.url)
    const includeAcknowledged = url.searchParams.get('include_acknowledged') === 'true'

    const report = await AlertFeedService.getFeed(companyId, supabase, { includeAcknowledged })
    return NextResponse.json(report, { headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  } catch (err) {
    const { body, status } = toErrorResponse(err)
    return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  }
}

export async function POST(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase, ctx } = auth

  try {
    let alertInputs
    try {
      const body = await req.json()
      alertInputs = body?.alertInputs ?? undefined
    } catch {
      // no body — sync without inputs (auto-resolve only)
    }

    const result = await AlertFeedService.sync(companyId, supabase, alertInputs)
    return NextResponse.json(result, { headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  } catch (err) {
    const { body, status } = toErrorResponse(err)
    return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  }
}
