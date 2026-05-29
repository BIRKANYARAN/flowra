// ── /api/commercial/inventory-aging ──────────────────────────────────────────
// GET — Returns InventoryAgingReport: stock aging buckets, turnover metrics,
// obsolescence risk, and health score.
// Access: manager+ only.

export const revalidate = 1800 // 30 minutes

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { apiError, reqCtx } from '@/lib/api-utils'
import { InventoryAgingService } from '@/lib/services/commercial/inventory-aging.service'

export async function GET(req: NextRequest) {
  const ctx  = reqCtx(req)
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response

  const { companyId, supabase } = auth

  try {
    const service = new InventoryAgingService(supabase)
    const report  = await service.getReport(companyId)
    return NextResponse.json({ report })
  } catch (err) {
    console.error('[inventory-aging]', err)
    return apiError(ctx, 'Stok yaşlanma analizi hesaplanamadı', 500)
  }
}
