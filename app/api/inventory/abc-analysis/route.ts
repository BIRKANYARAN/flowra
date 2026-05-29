// ─────────────────────────────────────────────────────────────────────────────
// GET /api/inventory/abc-analysis?months=12
//
// ABC (Pareto) inventory classification report.
// Auth: resolveApiAuth + company_members check, manager+
// Cache: revalidate every 3600 seconds.
// ─────────────────────────────────────────────────────────────────────────────

export const revalidate = 3600

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth }            from '@/lib/api-auth'
import { AbcAnalysisService }        from '@/lib/services/inventory/abc-analysis.service'
import { REQUEST_ID_HEADER }         from '@/middleware'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase, ctx } = auth

  const months = Math.min(
    24,
    Math.max(1, parseInt(req.nextUrl.searchParams.get('months') ?? '12', 10) || 12),
  )

  try {
    const service = new AbcAnalysisService(supabase)
    const report  = await service.getReport(companyId, months)
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
