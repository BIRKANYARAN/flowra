// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/intelligence/financial-health-score
//
// Financial Health Score — Altman Z"-Score adapted for Turkish SMEs.
// Composite 0-100 score + zone classification + key risk indicators.
//
// Auth:  resolveApiAuth + admin only
// Cache: revalidate: 3600 (1 hr)
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic    = 'force-dynamic'
export const revalidate = 3600

import { NextRequest, NextResponse }           from 'next/server'
import { resolveApiAuth }                      from '@/lib/api-auth'
import { reqCtx, apiError }                    from '@/lib/api-utils'
import { FinancialHealthScoreService }         from '@/lib/services/intelligence/financial-health-score.service'

export async function GET(req: NextRequest) {
  const ctx = reqCtx(req)
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response

    const { companyId, supabase } = auth

    const service = new FinancialHealthScoreService(supabase)
    const report  = await service.getReport(companyId)

    return NextResponse.json({ report })
  } catch (e) {
    console.error('[intelligence/financial-health-score]', e)
    return apiError(ctx, 'Finansal sağlık skoru alınamadı', 500, 'DB_READ_FAILED')
  }
}
