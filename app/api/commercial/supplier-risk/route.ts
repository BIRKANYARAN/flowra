// ── /api/commercial/supplier-risk ─────────────────────────────────────────────
// GET — Returns SupplierRiskReport: supplier concentration risk & supply chain
// vulnerability analysis for Turkish SMEs.
// Access: manager+ only.

export const revalidate = 3600 // 1 hour

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { apiError, reqCtx } from '@/lib/api-utils'
import { SupplierRiskService } from '@/lib/services/commercial/supplier-risk.service'

export async function GET(req: NextRequest) {
  const ctx  = reqCtx(req)
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response

  const { companyId, supabase } = auth

  const periodMonths = Number(req.nextUrl.searchParams.get('periodMonths') ?? 6)

  try {
    const service = new SupplierRiskService(supabase)
    const report  = await service.getReport(companyId, periodMonths)
    return NextResponse.json({ report })
  } catch (err) {
    console.error('[supplier-risk]', err)
    return apiError(ctx, 'Tedarikçi risk raporu hesaplanamadı', 500)
  }
}
