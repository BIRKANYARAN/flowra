// ─────────────────────────────────────────────────────────────────────────────
// GET /api/commercial/market-basket
//
// Market Basket Analysis — product association rules for cross-sell.
// Auth: resolveApiAuth + manager+
// Cache: revalidate every 3600 seconds (analysis doesn't change frequently)
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic   = 'force-dynamic'
export const revalidate = 3600

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth }             from '@/lib/api-auth'
import { apiError, reqCtx }           from '@/lib/api-utils'
import { MarketBasketService }         from '@/lib/services/commercial/market-basket.service'

export async function GET(req: NextRequest) {
  const ctx  = reqCtx(req)
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response

  const { companyId, supabase } = auth

  try {
    const service = new MarketBasketService(supabase)
    const report  = await service.getReport(companyId)
    return NextResponse.json({ report })
  } catch (err) {
    console.error('[market-basket]', err)
    return apiError(ctx, 'Sepet analizi hesaplanamadı', 500)
  }
}
