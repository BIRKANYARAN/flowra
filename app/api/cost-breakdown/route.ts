// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/cost-breakdown?product_id=…
//
// Phase 3 read-side: for one product, list every finalized-purchase lot with
// its frozen base cost + allocated landed cost + final unit cost (all TRY).
//
// Lots created via the legacy direct-adjust path are intentionally excluded —
// they don't have a purchase header to break down. Use /api/stock?view=history
// for the full ledger.
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { REQUEST_ID_HEADER } from '@/middleware'
import { CostService } from '@/lib/services/cost.service'
import { toErrorResponse } from '@/types/errors'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { uid, companyId, supabase, ctx } = auth

  try {
    const productId = new URL(req.url).searchParams.get('product_id') || ''
    if (!productId) {
      return NextResponse.json(
        { error: 'product_id zorunludur', code: 'VALIDATION_ERROR', type: 'BUSINESS' },
        { status: 422, headers: { [REQUEST_ID_HEADER]: ctx.requestId } }
      )
    }
    const entries = await CostService.getCostBreakdown(productId)
    return NextResponse.json(
      { entries, count: entries.length },
      { headers: { [REQUEST_ID_HEADER]: ctx.requestId } }
    )
  } catch (err) {
    const { body, status } = toErrorResponse(err)
    return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  }
}
