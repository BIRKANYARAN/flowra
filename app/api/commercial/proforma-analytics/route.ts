// ── /api/commercial/proforma-analytics ───────────────────────────────────────
// GET ?from=YYYY-MM-DD&to=YYYY-MM-DD
//
// Returns ProformaConversionMetrics — win rate, pipeline, funnel counts.
// Access: any authenticated member.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { apiError, reqCtx } from '@/lib/api-utils'
import { ProformaAnalyticsService } from '@/lib/services/commercial/proforma-analytics.service'

export async function GET(req: NextRequest) {
  const ctx  = reqCtx(req)
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response

  const { companyId, supabase } = auth
  const { searchParams }        = new URL(req.url)

  const now  = new Date()
  const from = searchParams.get('from') ?? `${now.getFullYear()}-01-01`
  const to   = searchParams.get('to')   ?? now.toISOString().slice(0, 10)

  try {
    const metrics = await ProformaAnalyticsService.getMetrics(
      companyId,
      supabase,
      { from, to },
    )
    return NextResponse.json(metrics)
  } catch (err) {
    console.error('[proforma-analytics]', err)
    return apiError(ctx, 'Proforma analizi hesaplanamadı', 500)
  }
}
