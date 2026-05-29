// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/partners/debt-maturity
//
// Returns the debt maturity ladder report: per-tranche maturity buckets,
// partner schedules, maturity cliffs, weighted average maturity, refinancing
// risk, and concentration metrics.
//
// Role guard: admin only.
// ═══════════════════════════════════════════════════════════════════════════════

export const revalidate = 3600

import { NextRequest, NextResponse } from 'next/server'
import { REQUEST_ID_HEADER } from '@/middleware'
import { resolveApiAuth } from '@/lib/api-auth'
import { requireAdmin } from '@/lib/require-role'
import { DebtMaturityService } from '@/lib/services/pcle/debt-maturity.service'
import { AppError, toErrorResponse } from '@/types/errors'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { uid, companyId, supabase, ctx } = auth

  // Admin-only gate
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
    const service = new DebtMaturityService(supabase)
    const report  = await service.getReport(companyId)
    return NextResponse.json(
      { report },
      { headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
    )
  } catch (err) {
    const { body, status } = toErrorResponse(err)
    return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  }
}
