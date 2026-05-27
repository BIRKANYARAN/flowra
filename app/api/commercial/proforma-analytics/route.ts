// ─────────────────────────────────────────────────────────────────────────────
// GET /api/commercial/proforma-analytics
//
// Proforma Pipeline Analytics — win rate, deal size, time-to-conversion,
// product performance in quotes, and 6-month monthly trend.
//
// Query params (optional):
//   ?period_days=90   (default: 90)
//   ?mode=report      returns ProformaAnalyticsReport (new, default)
//   ?mode=metrics     returns legacy ProformaConversionMetrics
//   ?from=YYYY-MM-DD  (legacy metrics mode only)
//   ?to=YYYY-MM-DD    (legacy metrics mode only)
//
// Auth: any authenticated company member.
// Cache: revalidate every 300 seconds.
// ─────────────────────────────────────────────────────────────────────────────

export const revalidate = 300

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { apiError, reqCtx } from '@/lib/api-utils'
import { ProformaAnalyticsService } from '@/lib/services/commercial/proforma-analytics.service'
import { REQUEST_ID_HEADER } from '@/middleware'

export async function GET(req: NextRequest) {
  const ctx  = reqCtx(req)
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response

  const { companyId, supabase } = auth
  const { searchParams }        = new URL(req.url)

  const mode = searchParams.get('mode') ?? 'report'

  // ── Legacy metrics mode ───────────────────────────────────────────────────
  if (mode === 'metrics') {
    const now  = new Date()
    const from = searchParams.get('from') ?? `${now.getFullYear()}-01-01`
    const to   = searchParams.get('to')   ?? now.toISOString().slice(0, 10)
    try {
      const metrics = await ProformaAnalyticsService.getMetrics(companyId, supabase, { from, to })
      return NextResponse.json(metrics, { headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
    } catch (err) {
      console.error('[proforma-analytics/metrics]', err)
      return apiError(ctx, 'Proforma analizi hesaplanamadı', 500)
    }
  }

  // ── Full analytics report mode (default) ─────────────────────────────────
  const periodDays = Number(searchParams.get('period_days') ?? 90) || 90

  try {
    const report = await ProformaAnalyticsService.getReport(companyId, supabase, { periodDays })
    return NextResponse.json(
      { report },
      { headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
    )
  } catch (err) {
    console.error('[proforma-analytics/report]', err)
    return apiError(ctx, 'Proforma analiz raporu hesaplanamadı', 500)
  }
}
