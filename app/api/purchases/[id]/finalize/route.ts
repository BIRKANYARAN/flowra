// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/purchases/[id]/finalize
//
// Atomic finalize:
//   1. CostService.calculateUnitCost() → per-line landed unit cost in TRY
//   2. For each line: StockService.adjust(reference_type='purchase', cost_price=…)
//      → creates stock_movement + stock_lot (FIFO ledger stays consistent)
//   3. Stamp lots with purchase_item_id + allocated_cost_try
//   4. Flip status='finalized' (DB trigger then locks the row)
//
// Idempotent: per-line idempotency keys are deterministic
//   (`purchase_finalize:{purchase_id}:{purchase_item_id}`).
//   A retried call after partial failure will not double-create lots.
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { contextFromHeader } from '@/lib/logger'
import { REQUEST_ID_HEADER } from '@/middleware'
import { PurchaseService } from '@/lib/services/purchase.service'
import { toErrorResponse } from '@/types/errors'
import { resolveCompanyId } from '@/lib/resolve-company'

interface Ctx { params: { id: string } }

export async function POST(req: NextRequest, { params }: Ctx) {
  const supabase = createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) {
    return NextResponse.json(
      { error: 'Unauthorized', code: 'UNAUTHORIZED', type: 'SECURITY' },
      { status: 401 }
    )
  }
  const ctx = contextFromHeader(req.headers.get(REQUEST_ID_HEADER), authData.user.id)

  let companyId: string
  try { companyId = await resolveCompanyId(authData.user.id, supabase) }
  catch { return NextResponse.json({ error: 'Şirket bilgisi alınamadı', code: 'COMPANY_NOT_RESOLVED', type: 'SYSTEM' }, { status: 409 }) }

  try {
    const result = await PurchaseService.finalize(authData.user.id, params.id, companyId, ctx)
    return NextResponse.json(result, { headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  } catch (err) {
    const { body, status } = toErrorResponse(err)
    return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  }
}
