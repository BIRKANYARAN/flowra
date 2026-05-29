// ── /api/commercial/sku-performance ──────────────────────────────────────────
// GET — Returns SkuPerformanceReport: SKU-level performance scoring.
// Access: manager+ only.

export const revalidate = 3600 // 1 hour

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { apiError, reqCtx } from '@/lib/api-utils'
import { SkuPerformanceService } from '@/lib/services/commercial/sku-performance.service'

export async function GET(req: NextRequest) {
  const ctx  = reqCtx(req)
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response

  const { companyId, supabase } = auth

  try {
    const service = new SkuPerformanceService(supabase)
    const report  = await service.getReport(companyId)
    return NextResponse.json({ report })
  } catch (err) {
    console.error('[sku-performance]', err)
    return apiError(ctx, 'SKU performans analizi hesaplanamadı', 500)
  }
}
