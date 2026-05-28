// ─────────────────────────────────────────────────────────────────────────────
// GET /api/finance/revenue-recognition
//
// Returns revenue recognition report: accrual vs cash basis comparison,
// collection efficiency, deferred revenue, and pipeline backlog.
//
// Query params:
//   ?period=2025-01   (default: current month, format: YYYY-MM)
//
// Auth: resolveApiAuth, manager+
// Cache: revalidate every 1800 seconds
// ─────────────────────────────────────────────────────────────────────────────

export const revalidate = 1800

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { RevenueRecognitionService } from '@/lib/services/finance/revenue-recognition.service'
import { REQUEST_ID_HEADER } from '@/middleware'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase, ctx } = auth

  const periodRaw = req.nextUrl.searchParams.get('period') ?? undefined

  // Validate period format if provided
  if (periodRaw && !/^\d{4}-\d{2}$/.test(periodRaw)) {
    return NextResponse.json(
      { error: 'Invalid period format. Expected YYYY-MM.', code: 'INVALID_PARAM', type: 'CLIENT' },
      { status: 400, headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
    )
  }

  try {
    const service = new RevenueRecognitionService(supabase)
    const report  = await service.getReport(companyId, periodRaw)

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
