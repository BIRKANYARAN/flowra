// ── /api/commercial/revenue-forecast ─────────────────────────────────────────
// GET — Returns RevenueForecastReport: 3/6-month revenue forecast.
// Query params:
//   history_months  number (default 12) — months of history to use
// Access: manager+ only.

export const revalidate = 3600 // 1 hour

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { apiError, reqCtx } from '@/lib/api-utils'
import { RevenueForecastService } from '@/lib/services/commercial/revenue-forecast.service'

export async function GET(req: NextRequest) {
  const ctx  = reqCtx(req)
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response

  const { companyId, supabase } = auth

  const { searchParams } = new URL(req.url)
  const historyParam = searchParams.get('history_months')
  const historyMonths = historyParam
    ? Math.max(3, Math.min(24, parseInt(historyParam, 10) || 12))
    : 12

  try {
    const service = new RevenueForecastService(supabase)
    const report  = await service.getReport(companyId, historyMonths)
    return NextResponse.json({ report })
  } catch (err) {
    console.error('[revenue-forecast]', err)
    return apiError(ctx, 'Gelir tahmini hesaplanamadı', 500)
  }
}
