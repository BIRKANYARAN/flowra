// ─────────────────────────────────────────────────────────────────────────────
// GET /api/finance/margin-bridge?current=2025-02&prior=2025-01
//
// Gross Margin Bridge Analysis — Price / Volume / Mix Decomposition.
// Returns the bridge report decomposing GP change between two periods.
//
// Query params:
//   ?current=2025-02  (default: current month, format: YYYY-MM)
//   ?prior=2025-01    (default: month prior to current, format: YYYY-MM)
//
// Auth: resolveApiAuth, manager+
// Cache: revalidate every 3600 seconds
// ─────────────────────────────────────────────────────────────────────────────

export const revalidate = 3600

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth }            from '@/lib/api-auth'
import { MarginBridgeService }       from '@/lib/services/finance/margin-bridge.service'
import { REQUEST_ID_HEADER }         from '@/middleware'

const PERIOD_RE = /^\d{4}-\d{2}$/

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase, ctx } = auth

  const currentRaw = req.nextUrl.searchParams.get('current') ?? undefined
  const priorRaw   = req.nextUrl.searchParams.get('prior')   ?? undefined

  if (currentRaw && !PERIOD_RE.test(currentRaw)) {
    return NextResponse.json(
      { error: 'Invalid current period format. Expected YYYY-MM.', code: 'INVALID_PARAM', type: 'CLIENT' },
      { status: 400, headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
    )
  }

  if (priorRaw && !PERIOD_RE.test(priorRaw)) {
    return NextResponse.json(
      { error: 'Invalid prior period format. Expected YYYY-MM.', code: 'INVALID_PARAM', type: 'CLIENT' },
      { status: 400, headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
    )
  }

  try {
    const service = new MarginBridgeService(supabase)
    const report  = await service.getReport(companyId, currentRaw, priorRaw)

    return NextResponse.json(
      { report },
      { headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { error: msg, code: 'SERVICE_ERROR', type: 'SYSTEM' },
      { status: 500, headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
    )
  }
}
