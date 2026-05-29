// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/partners/risk-composite
//
// Returns the 6-dimension partner risk composite scoring report for the
// authenticated company. Evaluates each partner across debt concentration,
// repayment timeliness, equity fulfillment, liquidity contribution,
// loan-to-equity ratio, and partnership duration stability.
//
// Auth: admin only — risk scoring data is sensitive financial information
// Cache: revalidate 3600 seconds (1 hour)
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic'
export const revalidate = 3600

import { NextRequest, NextResponse } from 'next/server'
import { REQUEST_ID_HEADER } from '@/middleware'
import { resolveApiAuth } from '@/lib/api-auth'
import { requireAdmin } from '@/lib/require-role'
import { PartnerRiskCompositeService } from '@/lib/services/pcle/partner-risk-composite.service'
import { AppError, toErrorResponse } from '@/types/errors'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { uid, companyId, supabase, ctx } = auth

  // Admin-only gate — composite risk scoring is sensitive financial data
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
    const service = new PartnerRiskCompositeService(supabase)
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
