// ── /api/products/import — bulk import a product catalogue from a spreadsheet ──
// Catalogue-only: name (required), sku, unit, unit_cost, default_sale_price,
// category. Stock is intentionally NOT imported (stock_qty = 0) — FIFO lots are
// created through the stock-movement flow, not bulk import; users add stock via
// the "Stok Düzeltme" tool. Dedupe by name (existing + within batch).

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'

function num(v: unknown): number | null {
  if (typeof v === 'number' && isFinite(v)) return v >= 0 ? v : null
  if (typeof v === 'string') {
    // tolerate "1.234,56" (TR) and "1234.56"
    const cleaned = v.trim().replace(/\./g, '').replace(',', '.')
    const n = Number(cleaned)
    return isFinite(n) && n >= 0 ? n : null
  }
  return null
}

export async function POST(req: NextRequest) {
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { uid, companyId, supabase } = auth

    const body = await req.json().catch(() => null)
    const rawRows: unknown = body?.rows
    if (!Array.isArray(rawRows)) return NextResponse.json({ error: 'rows bir dizi olmalıdır' }, { status: 422 })
    if (rawRows.length === 0)    return NextResponse.json({ error: 'İçe aktarılacak satır yok' }, { status: 422 })
    if (rawRows.length > 5000)   return NextResponse.json({ error: 'Tek seferde en fazla 5000 satır içe aktarılabilir' }, { status: 422 })

    const { data: existing } = await supabase
      .from('products').select('name').eq('company_id', companyId).is('deleted_at', null)
    const seen = new Set((existing ?? []).map((p: { name: string }) => (p.name ?? '').trim().toLowerCase()))

    const errors: { row: number; reason: string }[] = []
    const toInsert: Record<string, unknown>[] = []
    let skipped = 0

    rawRows.forEach((raw, i) => {
      const r = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {}
      const name = typeof r.name === 'string' ? r.name.trim() : ''
      if (name.length < 2)   { errors.push({ row: i + 1, reason: 'İsim zorunlu (en az 2 karakter)' }); return }
      if (name.length > 300) { errors.push({ row: i + 1, reason: 'İsim çok uzun' }); return }

      const key = name.toLowerCase()
      if (seen.has(key)) { skipped++; return }
      seen.add(key)

      const payload: Record<string, unknown> = {
        user_id:         uid,
        company_id:      companyId,
        name,
        unit:            (typeof r.unit === 'string' && r.unit.trim()) ? r.unit.trim().slice(0, 50) : 'adet',
        unit_cost:       num(r.unit_cost) ?? 0,
        cost_currency:   'TRY',
        stock_qty:       0,
        stock_alert_qty: num(r.stock_alert_qty) ?? 0,
        is_active:       true,
      }
      if (typeof r.sku === 'string' && r.sku.trim()) payload.sku = r.sku.trim().slice(0, 100)
      if (typeof r.category === 'string' && r.category.trim()) payload.category = r.category.trim().slice(0, 100)
      const salePrice = num(r.default_sale_price)
      if (salePrice !== null) { payload.default_sale_price = salePrice; payload.default_sale_currency = 'TRY' }

      toInsert.push(payload)
    })

    let inserted = 0
    if (toInsert.length > 0) {
      const { data, error } = await supabase.from('products').insert(toInsert).select('id')
      if (error) {
        console.error('[products/import] insert error:', error.message)
        return NextResponse.json({ error: 'Kayıt sırasında hata: ' + error.message }, { status: 500 })
      }
      inserted = Array.isArray(data) ? data.length : 0
    }

    return NextResponse.json({ inserted, skipped, errorCount: errors.length, errors: errors.slice(0, 50) })

  } catch (err) {
    console.error('[products/import] unexpected:', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}
