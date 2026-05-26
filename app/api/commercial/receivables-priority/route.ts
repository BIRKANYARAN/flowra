// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/commercial/receivables-priority
//
// Returns a Smart Receivables Prioritization report: open receivables scored
// by collection probability and urgency, with Turkish action recommendations.
//
// No query params — report is always as-of today.
//
// Auth: any authenticated company member.
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { ReceivablesPriorityService } from '@/lib/services/commercial/receivables-priority.service'
import { REQUEST_ID_HEADER } from '@/middleware'
import { toErrorResponse } from '@/types/errors'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase, ctx } = auth

  try {
    const report = await ReceivablesPriorityService.getReport(
      companyId,
      supabase,
    )

    return NextResponse.json(report, { headers: { [REQUEST_ID_HEADER]: ctx.requestId } })

  } catch (err) {
    const { body, status } = toErrorResponse(err)
    return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  }
}
