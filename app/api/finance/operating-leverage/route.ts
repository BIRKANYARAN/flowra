// ─────────────────────────────────────────────────────────────────────────────
// GET /api/finance/operating-leverage
//
// Returns operating leverage and cost structure analytics report for the
// authenticated company. Includes DOL, cost profile classification,
// contribution margin, break-even revenue, and margin of safety.
//
// Query params:
//   ?period_months=3   — analysis window in months (default 3)
//
// Auth: resolveApiAuth, manager+
// Cache: revalidate every 1800 seconds
// ─────────────────────────────────────────────────────────────────────────────

export const revalidate = 1800

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { OperatingLeverageService } from '@/lib/services/finance/operating-leverage.service'
import { REQUEST_ID_HEADER } from '@/middleware'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase, ctx } = auth

  const periodRaw = req.nextUrl.searchParams.get('period_months')
  const periodMonths = periodRaw ? parseInt(periodRaw, 10) : 3

  if (isNaN(periodMonths) || periodMonths < 1 || periodMonths > 24) {
    return NextResponse.json(
      {
        error: 'Invalid period_months. Expected integer between 1 and 24.',
        code:  'INVALID_PARAM',
        type:  'CLIENT',
      },
      { status: 400, headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
    )
  }

  try {
    const service = new OperatingLeverageService(supabase)
    const report  = await service.getReport(companyId, periodMonths)

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
