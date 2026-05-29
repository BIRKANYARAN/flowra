// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/commercial/supplier-scorecard
//
// Returns a SupplierScorecardReport: per-supplier scoring across volume,
// relationship, payment reliability, price stability, and dependency risk.
//
// Access: manager+ only.
// Cache:  revalidate 3600 seconds (1 hour)
// ═══════════════════════════════════════════════════════════════════════════════

export const revalidate = 3600

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { SupplierScorecardService } from '@/lib/services/commercial/supplier-scorecard.service'
import { REQUEST_ID_HEADER } from '@/middleware'
import { toErrorResponse } from '@/types/errors'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase, ctx } = auth

  try {
    const service = new SupplierScorecardService(supabase)
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
