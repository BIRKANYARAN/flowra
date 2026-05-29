// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/finance/balance-ratios
//
// Balance Sheet Ratio Analysis — Liquidity, Solvency, Efficiency ratios
// for Turkish SME CFOs.
//
// Auth:  resolveApiAuth + manager+
// Cache: revalidate: 3600 (1 hr)
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic    = 'force-dynamic'
export const revalidate = 3600

import { NextRequest, NextResponse }   from 'next/server'
import { resolveApiAuth }              from '@/lib/api-auth'
import { reqCtx, apiError }            from '@/lib/api-utils'
import { BalanceRatiosService }        from '@/lib/services/finance/balance-ratios.service'

export async function GET(req: NextRequest) {
  const ctx = reqCtx(req)
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response

    const { companyId, supabase } = auth

    const service = new BalanceRatiosService(supabase)
    const report  = await service.getReport(companyId)

    return NextResponse.json({ report })
  } catch (e) {
    console.error('[finance/balance-ratios]', e)
    return apiError(ctx, 'Bilanço oran analizi alınamadı', 500, 'DB_READ_FAILED')
  }
}
