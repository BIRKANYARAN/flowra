// ── /api/customers/import — bulk import customers from a spreadsheet ──────────
// Accepts already-parsed canonical rows ({ name, email?, phone?, tax_number?,
// tax_office?, address? }). Validates per-row, dedupes against existing customer
// names (case-insensitive) AND within the batch, then batch-inserts the valid
// rows. One bad row never fails the whole import — it's reported in `errors`.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'

const FIELD_MAX: Record<string, number> = {
  name: 300, email: 300, phone: 50, tax_number: 50, tax_office: 200, address: 1000,
}
const OPTIONAL = ['email', 'phone', 'tax_number', 'tax_office', 'address'] as const

export async function POST(req: NextRequest) {
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { uid, companyId, supabase } = auth

    const body = await req.json().catch(() => null)
    const rawRows: unknown = body?.rows
    if (!Array.isArray(rawRows)) {
      return NextResponse.json({ error: 'rows bir dizi olmalıdır' }, { status: 422 })
    }
    if (rawRows.length === 0) {
      return NextResponse.json({ error: 'İçe aktarılacak satır yok' }, { status: 422 })
    }
    if (rawRows.length > 5000) {
      return NextResponse.json({ error: 'Tek seferde en fazla 5000 satır içe aktarılabilir' }, { status: 422 })
    }

    // Existing names for this company (case-insensitive dedupe target)
    const { data: existing } = await supabase
      .from('customers')
      .select('name')
      .eq('company_id', companyId)
      .is('deleted_at', null)
    const seen = new Set((existing ?? []).map((c: { name: string }) => (c.name ?? '').trim().toLowerCase()))

    const errors: { row: number; reason: string }[] = []
    const toInsert: Record<string, unknown>[] = []
    let skipped = 0

    rawRows.forEach((raw, i) => {
      const r = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {}
      const name = typeof r.name === 'string' ? r.name.trim() : ''
      if (name.length < 2) { errors.push({ row: i + 1, reason: 'İsim zorunlu (en az 2 karakter)' }); return }
      if (name.length > FIELD_MAX.name) { errors.push({ row: i + 1, reason: 'İsim çok uzun' }); return }

      const key = name.toLowerCase()
      if (seen.has(key)) { skipped++; return }   // duplicate (existing or earlier in batch)
      seen.add(key)

      const payload: Record<string, unknown> = { user_id: uid, company_id: companyId, name }
      let tooLong = false
      for (const f of OPTIONAL) {
        const v = r[f]
        if (typeof v === 'string' && v.trim() !== '') {
          if (v.trim().length > FIELD_MAX[f]) { tooLong = true; break }
          payload[f] = v.trim()
        }
      }
      if (tooLong) { errors.push({ row: i + 1, reason: 'Bir alan izin verilen uzunluğu aşıyor' }); return }

      toInsert.push(payload)
    })

    let inserted = 0
    if (toInsert.length > 0) {
      const { data, error } = await supabase.from('customers').insert(toInsert).select('id')
      if (error) {
        console.error('[customers/import] insert error:', error.message)
        return NextResponse.json({ error: 'Kayıt sırasında hata: ' + error.message }, { status: 500 })
      }
      inserted = Array.isArray(data) ? data.length : 0
    }

    return NextResponse.json({ inserted, skipped, errorCount: errors.length, errors: errors.slice(0, 50) })

  } catch (err) {
    console.error('[customers/import] unexpected:', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}
