// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/partners/distribution-simulator
//
// Returns a full profit distribution simulation report for the authenticated
// company, including current scenario and three pre-built alternatives
// (conservative / balanced / maximum board retention).
//
// Role guard: admin only
// ═══════════════════════════════════════════════════════════════════════════════

export const revalidate = 300

import { NextRequest, NextResponse } from 'next/server'
import { REQUEST_ID_HEADER } from '@/middleware'
import { resolveApiAuth } from '@/lib/api-auth'
import { requireAdmin } from '@/lib/require-role'
import { ProfitDistributionService } from '@/lib/services/pcle/profit-distribution.service'
import { AppError, toErrorResponse } from '@/types/errors'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { uid, companyId, supabase, ctx } = auth

  // Admin-only gate — distribution simulation accesses sensitive equity data
  try {
    await requireAdmin(uid, companyId, supabase)
  } catch (e) {
    if (e instanceof AppError && e.code === 'FORBIDDEN') {
      return NextResponse.json(
        { error: e.message, code: 'FORBIDDEN' },
        { status: 403, headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
      )
    }
    throw e
  }

  try {
    const periodId = req.nextUrl.searchParams.get('period_id') ?? null
    const report = await ProfitDistributionService.getReport(companyId, supabase, periodId)

    return NextResponse.json(
      { report },
      { headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
    )
  } catch (err) {
    const { body, status } = toErrorResponse(err)
    return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  }
}
