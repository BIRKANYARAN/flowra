// ─────────────────────────────────────────────────────────────────────────────
// GET /api/reports/health
//
// Returns the Company Financial Health Report as JSON.
// Any authenticated role may call this endpoint.
// Cached for 5 minutes (300s) — stale-while-revalidate via ISR.
//
// Response: { report: CompanyHealthReport }
// ─────────────────────────────────────────────────────────────────────────────

export const revalidate = 300

import { NextRequest, NextResponse }  from 'next/server'
import { resolveApiAuth }             from '@/lib/api-auth'
import { HealthReportService }        from '@/lib/services/reports/health-report.service'
import { toErrorResponse }            from '@/types/errors'
import { REQUEST_ID_HEADER }          from '@/middleware'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { uid, companyId, supabase, ctx } = auth

  try {
    const report = await HealthReportService.generate(companyId, supabase, uid)
    return NextResponse.json(
      { report },
      { headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
    )
  } catch (err) {
    const { body, status } = toErrorResponse(err)
    return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  }
}
