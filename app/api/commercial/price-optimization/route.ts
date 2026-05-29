// ── GET /api/commercial/price-optimization ────────────────────────────────────
//
// Price & Discount Optimization Analytics — per-product discount rates, price
// realization, revenue lost to discounts, price consistency, and optimal
// price recommendations.
//
// Query params:
//   period_months  number (default 6) — lookback window (1–24)
//
// Returns: { report: PriceOptimizationReport }
//
// Auth: manager+ only.
// Cache: revalidate every 3600 seconds (1 hour).
// ─────────────────────────────────────────────────────────────────────────────

export const revalidate = 3600

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { apiError, reqCtx } from '@/lib/api-utils'
import { PriceOptimizationService } from '@/lib/services/commercial/price-optimization.service'

export async function GET(req: NextRequest) {
  const ctx  = reqCtx(req)
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response

  const { companyId, supabase } = auth

  const { searchParams } = new URL(req.url)
  const periodParam = searchParams.get('period_months')
  const periodMonths = periodParam
    ? Math.max(1, Math.min(24, parseInt(periodParam, 10) || 6))
    : 6

  try {
    const service = new PriceOptimizationService(supabase)
    const report  = await service.getReport(companyId, periodMonths)
    return NextResponse.json({ report })
  } catch (err) {
    console.error('[price-optimization]', err)
    return apiError(ctx, 'Fiyat optimizasyonu analizi hesaplanamadı', 500)
  }
}
