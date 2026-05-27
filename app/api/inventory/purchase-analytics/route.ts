// ─────────────────────────────────────────────────────────────────────────────
// GET /api/inventory/purchase-analytics
//
// Purchase order analytics — lead time, supplier reliability, purchase
// frequency, cost variance, monthly spend trend.
// Auth: resolveApiAuth, company_members check, manager+
// Cache: revalidate every 300 seconds.
// ─────────────────────────────────────────────────────────────────────────────

export const revalidate = 300

import { NextRequest, NextResponse }        from 'next/server'
import { resolveApiAuth }                   from '@/lib/api-auth'
import { PurchaseAnalyticsService }         from '@/lib/services/inventory/purchase-analytics.service'
import { REQUEST_ID_HEADER }                from '@/middleware'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase, ctx } = auth

  try {
    const service = new PurchaseAnalyticsService(supabase)
    const summary = await service.getSummary(companyId)
    return NextResponse.json(
      { summary },
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
