// ─────────────────────────────────────────────────────────────────────────────
// GET /api/finance/quarterly-summary
//
// Quarterly P&L summary, QoQ comparisons, and KPI tracking.
// Auth: manager+ role required.
//
// Returns: { report: QuarterlySummaryReport }
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic  = 'force-dynamic'
export const revalidate = 3600

import { NextRequest, NextResponse }     from 'next/server'
import { resolveApiAuth }                from '@/lib/api-auth'
import { QuarterlySummaryService }       from '@/lib/services/finance/quarterly-summary.service'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase } = auth

  try {
    const service = new QuarterlySummaryService(supabase)
    const report  = await service.getReport(companyId)
    return NextResponse.json({ report })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
