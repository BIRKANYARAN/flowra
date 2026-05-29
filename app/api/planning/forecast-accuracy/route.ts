// ─────────────────────────────────────────────────────────────────────────────
// GET /api/planning/forecast-accuracy
//
// Revenue Forecast Accuracy & Variance Analysis.
// Returns MAPE, bias, hit rate, improvement trend, and monthly variances.
//
// Auth:  resolveApiAuth + company_members check, manager+
// Cache: revalidate: 3600 (1 hr)
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic   = 'force-dynamic'
export const revalidate = 3600

import { NextRequest, NextResponse }    from 'next/server'
import { resolveApiAuth }               from '@/lib/api-auth'
import { reqCtx, apiError }             from '@/lib/api-utils'
import { ForecastAccuracyService }      from '@/lib/services/planning/forecast-accuracy.service'

export async function GET(req: NextRequest) {
  const ctx = reqCtx(req)
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response

    const { companyId, supabase } = auth

    const service = new ForecastAccuracyService(supabase)
    const report  = await service.getReport(companyId)

    return NextResponse.json({ report })
  } catch (e) {
    console.error('[planning/forecast-accuracy]', e)
    return apiError(ctx, 'Tahmin doğruluk raporu alınamadı', 500, 'DB_READ_FAILED')
  }
}
