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
import { REQUEST_ID_HEADER } from '@/middleware'
import { PurchaseService } from '@/lib/services/purchase.service'
import { toErrorResponse } from '@/types/errors'
import { checkPeriodGuard } from '@/lib/middleware/period-guard'
import { dualWrite, resolvePeriodId } from '@/lib/services/ledger/dual-write.service'
import { JournalEntryService } from '@/lib/services/ledger/journal-entry.service'
import { resolveApiAuth } from '@/lib/api-auth'

interface Ctx { params: { id: string } }

export async function POST(req: NextRequest, { params }: Ctx) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { uid, companyId, supabase, ctx } = auth

  // Fetch purchase to get purchase_date for period guard
  // NOTE: purchases table uses purchase_date (not received_date)
  const { data: purchase } = await supabase
    .from('purchases')
    .select('id, purchase_date, currency, fx_rate')
    .eq('id', params.id)
    .eq('company_id', companyId)
    .maybeSingle()

  if (purchase) {
    const purchaseDate = purchase.purchase_date ?? new Date().toISOString().slice(0, 10)
    const guard = await checkPeriodGuard(companyId, purchaseDate, supabase)
    if (guard.blocked) {
      return NextResponse.json({ error: guard.reason, code: 'PERIOD_LOCKED', type: 'BUSINESS' }, { status: 422 })
    }
  }

  try {
    const result = await PurchaseService.finalize(uid, params.id, companyId, ctx, supabase)

    // Dual-write: inventory journal entry (DR 153 Ticari Mallar, CR 102 Bankalar / 320 Satıcılar)
    // total cost comes from the allocation result (CostService computed it)
    if (purchase && result.allocation.grand_total_try > 0) {
      const purchaseDate = purchase.purchase_date ?? new Date().toISOString().slice(0, 10)
      const periodId     = await resolvePeriodId(companyId, purchaseDate, supabase)

      await dualWrite({
        companyId, periodId, createdBy: uid, supabase,
        buildEntry: () => JournalEntryService.buildPurchaseEntry({
          id:             purchase.id,
          received_date:  purchaseDate,
          cost_try:       result.allocation.grand_total_try,
          paid_from_bank: false,  // assume payable until paid; can be overridden
        }),
      })
    }

    return NextResponse.json(result, { headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  } catch (err) {
    const { body, status } = toErrorResponse(err)
    return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  }
}
