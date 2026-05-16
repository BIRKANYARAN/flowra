export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { resolveCompanyId } from '@/lib/resolve-company'
import { checkPeriodGuard } from '@/lib/middleware/period-guard'
import { dualWrite, resolvePeriodId } from '@/lib/services/ledger/dual-write.service'
import { JournalEntryService } from '@/lib/services/ledger/journal-entry.service'

const PAYMENT_STATUSES  = ['pending', 'paid', 'partial', 'overdue', 'cancelled'] as const
const SHIPMENT_STATUSES = ['pending', 'shipped', 'delivered'] as const

// ── PATCH — update payment_status and/or shipment_status ─────────────────────
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient()
    const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError || !authData?.user)
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED', type: 'SECURITY' }, { status: 401 })
    const user = authData.user

    let companyId: string
    try { companyId = await resolveCompanyId(user.id, supabase) }
    catch { return NextResponse.json({ error: 'Şirket bilgisi alınamadı', code: 'COMPANY_NOT_RESOLVED', type: 'SYSTEM' }, { status: 409 }) }

    const { id } = params
    const body = await req.json() as Record<string, unknown>

    // ── Validate incoming fields FIRST (before any DB call) ──────────────────
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }

    if (body.payment_status !== undefined) {
      if (typeof body.payment_status !== 'string' ||
          !PAYMENT_STATUSES.includes(body.payment_status as typeof PAYMENT_STATUSES[number])) {
        return NextResponse.json(
          { error: 'Geçerli payment_status: pending | paid | partial | overdue | cancelled' },
          { status: 422 },
        )
      }
      patch.payment_status = body.payment_status
      // paid_at: stamp only when fully paid; clear for every other status
      patch.paid_at = body.payment_status === 'paid' ? new Date().toISOString() : null
    }

    if (body.shipment_status !== undefined) {
      if (typeof body.shipment_status !== 'string' ||
          !SHIPMENT_STATUSES.includes(body.shipment_status as typeof SHIPMENT_STATUSES[number])) {
        return NextResponse.json(
          { error: 'Geçerli shipment_status: pending | shipped | delivered' },
          { status: 422 },
        )
      }
      patch.shipment_status = body.shipment_status
    }

    if (Object.keys(patch).length === 1) {
      // Only updated_at — caller sent no actionable field
      return NextResponse.json({ error: 'Güncellenecek alan gönderilmedi' }, { status: 422 })
    }

    // ── Security: verify the record exists and belongs to this company ────────
    const { data: existing, error: findErr } = await supabase
      .from('sales')
      .select('id, sale_date, total_try, amount_paid_try, revenue_try, kdv_amount_try')
      .eq('id', id)
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .maybeSingle()

    if (findErr) {
      console.error('[sales PATCH] find error:', findErr.message)
      return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
    }
    if (!existing) {
      return NextResponse.json({ error: 'Satış bulunamadı' }, { status: 404 })
    }

    // Period guard — block writes to locked periods
    const saleDate = (existing as { sale_date?: string }).sale_date ?? new Date().toISOString().slice(0, 10)
    const guard = await checkPeriodGuard(companyId, saleDate, supabase)
    if (guard.blocked) {
      return NextResponse.json({ error: guard.reason, code: 'PERIOD_LOCKED', type: 'BUSINESS' }, { status: 422 })
    }

    // ── Apply update (scoped to company_id for defence-in-depth) ─────────────
    const { error: updateErr } = await supabase
      .from('sales')
      .update(patch)
      .eq('id', id)
      .eq('company_id', companyId)

    if (updateErr) {
      console.error('[sales PATCH] update error:', updateErr.message)
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

    // Dual-write: journal entry for payment (DR 102 Bankalar, CR 120 Alıcılar)
    if (body.payment_status === 'paid' && body.amount_paid !== undefined) {
      const amountPaid = Number(body.amount_paid) || 0
      if (amountPaid > 0) {
        const periodId = guard.period_id ?? await resolvePeriodId(companyId, saleDate, supabase)
        await dualWrite({
          companyId,
          periodId,
          createdBy: user.id,
          supabase,
          buildEntry: () => JournalEntryService.buildSalePaymentEntry({
            sale_id:      id,
            payment_date: new Date().toISOString().slice(0, 10),
            amount_try:   amountPaid,
          }),
        })
      }
    }

    return NextResponse.json({ updated: true })
  } catch (err) {
    console.error('[sales PATCH] unexpected:', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}

// ── DELETE — soft-delete a sale ───────────────────────────────────────────────
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient()
    const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError || !authData?.user) return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED', type: 'SECURITY' }, { status: 401 })
    const user = authData.user

    let companyId: string
    try { companyId = await resolveCompanyId(user.id, supabase) }
    catch { return NextResponse.json({ error: 'Şirket bilgisi alınamadı', code: 'COMPANY_NOT_RESOLVED', type: 'SYSTEM' }, { status: 409 }) }

    const { id } = params

    const { data: sale, error: findErr } = await supabase
      .from('sales')
      .select('id')
      .eq('id', id)
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .maybeSingle()

    if (findErr) {
      console.error('[sales DELETE] find error:', findErr.message)
      return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
    }
    if (!sale) return NextResponse.json({ error: 'Satış bulunamadı' }, { status: 404 })

    const { error: delErr } = await supabase
      .from('sales')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('company_id', companyId)

    if (delErr) {
      console.error('[sales DELETE] update error:', delErr.message)
      return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
    }

    return NextResponse.json({ deleted: true })
  } catch (err) {
    console.error('[sales DELETE] unexpected:', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}
