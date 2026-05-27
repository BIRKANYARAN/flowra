// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/finance/cash-projection
//
// Returns a 90-day (13-week) forward-looking cash flow projection.
// Combines committed pipeline (receivables + payables) with statistical estimates.
//
// Response: { report: CashProjectionReport }
//
// Auth: any authenticated company member.
// Cache: 5 minutes (revalidate = 300) — forward-looking, changes as payments come in
// ═══════════════════════════════════════════════════════════════════════════════

export const revalidate = 300

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { CashProjectionService } from '@/lib/services/finance/cash-projection.service'
import { REQUEST_ID_HEADER } from '@/middleware'
import { toErrorResponse } from '@/types/errors'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase, ctx } = auth

  try {
    const report = await CashProjectionService.getReport(companyId, supabase)
    return NextResponse.json(
      { report },
      { headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
    )
  } catch (err) {
    const { body, status } = toErrorResponse(err)
    return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  }
}
