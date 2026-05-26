// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/finance/ap-aging
//
// Returns a full Accounts Payable Aging report as of today.
// All unpaid/partially-paid expenses bucketed by days outstanding.
//
// Response: { report: APAgingReport }
//
// Auth: any authenticated company member.
// Cache: 5 minutes (revalidate = 300)
// ═══════════════════════════════════════════════════════════════════════════════

export const revalidate = 300

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { APAgingService } from '@/lib/services/finance/ap-aging.service'
import { REQUEST_ID_HEADER } from '@/middleware'
import { toErrorResponse } from '@/types/errors'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase, ctx } = auth

  try {
    const report = await APAgingService.getReport(companyId, supabase)
    return NextResponse.json(
      { report },
      { headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
    )
  } catch (err) {
    const { body, status } = toErrorResponse(err)
    return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  }
}
