// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/commercial/receivables-heatmap
//
// Returns a Receivables Aging Heatmap report: customer × aging bucket breakdown
// with monthly trend (last 6 months).
//
// No query params — report is always as-of today.
//
// Auth: any authenticated company member.
// ═══════════════════════════════════════════════════════════════════════════════

export const revalidate = 300

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { ReceivablesHeatmapService } from '@/lib/services/commercial/receivables-heatmap.service'
import { REQUEST_ID_HEADER } from '@/middleware'
import { toErrorResponse } from '@/types/errors'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase, ctx } = auth

  try {
    const report = await ReceivablesHeatmapService.getReport(companyId, supabase)

    return NextResponse.json(
      { report },
      { headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
    )

  } catch (err) {
    const { body, status } = toErrorResponse(err)
    return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  }
}
