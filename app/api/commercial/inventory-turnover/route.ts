// ── /api/commercial/inventory-turnover ────────────────────────────────────────
// GET — Returns InventoryTurnoverReport: turnover ratio, DIO, slow-moving stock.
// Query params:
//   period_months  number (default 6) — lookback window (1–24)
// Access: manager+ only.

export const revalidate = 1800 // 30 min

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { apiError, reqCtx } from '@/lib/api-utils'
import { InventoryTurnoverService } from '@/lib/services/commercial/inventory-turnover.service'

export async function GET(req: NextRequest) {
  const ctx  = reqCtx(req)
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response

  const { companyId, supabase } = auth

  const { searchParams } = new URL(req.url)
  const periodParam  = searchParams.get('period_months')
  const periodMonths = periodParam ? Math.max(1, Math.min(24, parseInt(periodParam, 10) || 6)) : 6

  try {
    const service = new InventoryTurnoverService(supabase)
    const report  = await service.getReport(companyId, periodMonths)
    return NextResponse.json({ report })
  } catch (err) {
    console.error('[inventory-turnover]', err)
    return apiError(ctx, 'Stok devir hızı analizi hesaplanamadı', 500)
  }
}
