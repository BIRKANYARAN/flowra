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
import { checkPeriodGuard } from '@/lib/middleware/period-guard'
import { dualWrite, resolvePeriodId } from '@/lib/services/ledger/dual-write.service'
import { JournalEntryService } from '@/lib/services/ledger/journal-entry.service'

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

  // Fetch purchase to get received_date for period guard
  const { data: purchase } = await supabase
    .from('purchases')
    .select('id, received_date, total_cost_try, payment_status')
    .eq('id', params.id)
    .eq('company_id', companyId)
    .maybeSingle()

  if (purchase) {
    const receiveDate = purchase.received_date ?? new Date().toISOString().slice(0, 10)
    const guard = await checkPeriodGuard(companyId, receiveDate, supabase)
    if (guard.blocked) {
      return NextResponse.json({ error: guard.reason, code: 'PERIOD_LOCKED', type: 'BUSINESS' }, { status: 422 })
    }
  }

  try {
    const result = await PurchaseService.finalize(authData.user.id, params.id, companyId, ctx)

    // Dual-write: inventory + COGS journal entries
    if (purchase) {
      const receiveDate = purchase.received_date ?? new Date().toISOString().slice(0, 10)
      const periodId    = await resolvePeriodId(companyId, receiveDate, supabase)
      const paidFromBank = purchase.payment_status === 'paid'

      await dualWrite({
        companyId, periodId, createdBy: authData.user.id, supabase,
        buildEntry: () => JournalEntryService.buildPurchaseEntry({
          id:             purchase.id,
          received_date:  receiveDate,
          cost_try:       Number(purchase.total_cost_try) || 0,
          paid_from_bank: paidFromBank,
        }),
      })
    }

    return NextResponse.json(result, { headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  } catch (err) {
    const { body, status } = toErrorResponse(err)
    return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  }
}
