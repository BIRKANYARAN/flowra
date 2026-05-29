// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/partners/partner-capital-statement
//
// Returns the partner capital statement report: equity, loans, distributions,
// and net position per partner as of today.
//
// Role guard: admin only (capital data is sensitive equity information).
// ═══════════════════════════════════════════════════════════════════════════════

export const revalidate = 1800

import { NextRequest, NextResponse } from 'next/server'
import { REQUEST_ID_HEADER } from '@/middleware'
import { resolveApiAuth } from '@/lib/api-auth'
import { requireAdmin } from '@/lib/require-role'
import { PartnerCapitalStatementService } from '@/lib/services/pcle/partner-capital-statement.service'
import { AppError, toErrorResponse } from '@/types/errors'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { uid, companyId, supabase, ctx } = auth

  // Admin-only gate — capital statement contains sensitive equity data
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
    const service = new PartnerCapitalStatementService(supabase)
    const report  = await service.getStatement(companyId)

    return NextResponse.json(
      { report },
      { headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
    )
  } catch (err) {
    const { body, status } = toErrorResponse(err)
    return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  }
}
