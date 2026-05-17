export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { checkPeriodGuard } from '@/lib/middleware/period-guard'
import { dualWrite, resolvePeriodId } from '@/lib/services/ledger/dual-write.service'
import { JournalEntryService } from '@/lib/services/ledger/journal-entry.service'
import { resolveApiAuth } from '@/lib/api-auth'

const VALID_CURRENCIES = ['TRY', 'USD', 'EUR', 'GBP'] as const
const VALID_KDV_RATES  = [0, 10, 20] as const

interface SaleItem {
  description: string
  quantity:    number
  unit_price:  number
  kdv_rate?:   number
}

// ── POST — create a direct sale ───────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { uid, companyId, supabase } = auth

    const body = await req.json() as Record<string, unknown>

    // ── Validate required fields ────────────────────────────────────────────
    const customerName = typeof body.customer_name === 'string' ? body.customer_name.trim() : ''
    if (!customerName || customerName.length < 2 || customerName.length > 300) {
      return NextResponse.json(
        { error: 'customer_name 2–300 karakter arasında olmalıdır' },
        { status: 422 },
      )
    }

    const currency = typeof body.currency === 'string' ? body.currency : 'TRY'
    if (!VALID_CURRENCIES.includes(currency as typeof VALID_CURRENCIES[number])) {
      return NextResponse.json(
        { error: `Geçerli para birimi: ${VALID_CURRENCIES.join(', ')}` },
        { status: 422 },
      )
    }

    let fxRate = 1
    if (currency !== 'TRY') {
      const rawFx = Number(body.fx_rate)
      if (!Number.isFinite(rawFx) || rawFx <= 0) {
        return NextResponse.json(
          { error: 'TRY dışı işlemlerde fx_rate zorunludur ve sıfırdan büyük olmalıdır' },
          { status: 422 },
        )
      }
      fxRate = rawFx
    }

    const saleDate = typeof body.sale_date === 'string' ? body.sale_date.slice(0, 10) : ''
    if (!saleDate || !/^\d{4}-\d{2}-\d{2}$/.test(saleDate)) {
      return NextResponse.json(
        { error: 'sale_date YYYY-MM-DD formatında zorunludur' },
        { status: 422 },
      )
    }

    const dueDate = typeof body.due_date === 'string' && body.due_date.length >= 10
      ? body.due_date.slice(0, 10)
      : null

    const rawItems = Array.isArray(body.items) ? body.items : []
    if (rawItems.length === 0) {
      return NextResponse.json(
        { error: 'En az bir kalem (item) zorunludur' },
        { status: 422 },
      )
    }

    // Validate + normalize items
    const items: SaleItem[] = []
    for (let i = 0; i < rawItems.length; i++) {
      const item = rawItems[i] as Record<string, unknown>
      const description = typeof item.description === 'string' ? item.description.trim() : ''
      if (!description) {
        return NextResponse.json(
          { error: `Kalem ${i + 1}: description zorunludur` },
          { status: 422 },
        )
      }
      const quantity = Number(item.quantity)
      if (!Number.isFinite(quantity) || quantity <= 0) {
        return NextResponse.json(
          { error: `Kalem ${i + 1}: quantity sıfırdan büyük olmalıdır` },
          { status: 422 },
        )
      }
      const unitPrice = Number(item.unit_price)
      if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
        return NextResponse.json(
          { error: `Kalem ${i + 1}: unit_price sıfırdan büyük olmalıdır` },
          { status: 422 },
        )
      }
      const kdvRate = item.kdv_rate !== undefined ? Number(item.kdv_rate) : 20
      if (!VALID_KDV_RATES.includes(kdvRate as typeof VALID_KDV_RATES[number])) {
        return NextResponse.json(
          { error: `Kalem ${i + 1}: kdv_rate 0, 10 veya 20 olmalıdır` },
          { status: 422 },
        )
      }
      items.push({ description, quantity, unit_price: unitPrice, kdv_rate: kdvRate })
    }

    const notes = typeof body.notes === 'string' ? body.notes.trim() : null

    // ── Compute total in TRY ───────────────────────────────────────────────
    // total = sum(qty * unit_price * (1 + kdv_rate/100)) * fx_rate
    let subtotalNoKdv = 0
    let total = 0
    for (const item of items) {
      const lineNet = item.quantity * item.unit_price * fxRate
      const kdvMultiplier = 1 + (item.kdv_rate ?? 20) / 100
      subtotalNoKdv += lineNet
      total += lineNet * kdvMultiplier
    }
    // Round to 2 decimals
    total = Math.round(total * 100) / 100
    subtotalNoKdv = Math.round(subtotalNoKdv * 100) / 100

    // ── Period guard ────────────────────────────────────────────────────────
    const guard = await checkPeriodGuard(companyId, saleDate, supabase)
    if (guard.blocked) {
      return NextResponse.json(
        { error: guard.reason, code: 'PERIOD_LOCKED', type: 'BUSINESS' },
        { status: 422 },
      )
    }

    // ── Insert sale ────────────────────────────────────────────────────────
    const { data, error: insertErr } = await supabase
      .from('sales')
      .insert({
        company_id:     companyId,
        customer_name:  customerName,
        currency,
        total,
        cogs:           0,
        nominal_profit: total,
        holding_cost:   0,
        sale_date:      saleDate,
        due_date:       dueDate,
        proforma_id:    null,
        payment_status: 'pending',
        paid_amount:    0,
        created_by:     uid,
        notes:          notes || null,
      })
      .select('id')
      .single()

    if (insertErr || !data) {
      console.error('[sales POST] insert error:', insertErr?.message)
      return NextResponse.json({ error: 'Satış kaydedilemedi' }, { status: 500 })
    }

    // ── Dual-write journal entry for new sale (AR debit, Revenue credit) ───
    try {
      const periodId = guard.period_id ?? await resolvePeriodId(companyId, saleDate, supabase)
      // Compute revenue (excl. KDV) and KDV from total
      const kdvAmount  = Math.round((total - subtotalNoKdv) * 100) / 100
      const revenue    = Math.round(subtotalNoKdv * 100) / 100
      await dualWrite({
        companyId,
        periodId,
        createdBy: uid,
        supabase,
        buildEntry: () => JournalEntryService.buildSaleEntry({
          id:             data.id,
          sale_date:      saleDate,
          revenue_try:    revenue,
          kdv_amount_try: kdvAmount,
          total_try:      total,
        }),
      })
    } catch {
      // Journal entry is best-effort; sale was already created
      console.warn('[sales POST] dual-write failed (non-fatal)')
    }

    return NextResponse.json({ id: data.id }, { status: 201 })
  } catch (err) {
    console.error('[sales POST] unexpected:', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}
