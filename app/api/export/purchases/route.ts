// GET /api/export/purchases — Purchase orders CSV for accountant handoff
//
// Query params:
//   from   YYYY-MM-DD  default: first day of current year
//   to     YYYY-MM-DD  default: today
//
// Columns (semicolon-delimited, UTF-8 BOM for Excel on Turkish locale):
//   Sipariş Tarihi · Tedarikçi · Durum · Beklenen Teslimat ·
//   Ürün Özeti · Para Birimi · Toplam (TRY) · Notlar

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth }            from '@/lib/api-auth'

function escCsv(val: unknown): string {
  const s = val == null ? '' : String(val)
  if (s.includes(';') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

function row(cells: unknown[]): string {
  return cells.map(escCsv).join(';')
}

function fmtAmount(n: number | null | undefined): string {
  if (n == null) return '0'
  return Number(n).toFixed(2).replace('.', ',')
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return ''
  try {
    const d = new Date(iso.slice(0, 10) + 'T00:00:00')
    return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch { return iso?.slice(0, 10) ?? '' }
}

const STATUS_TR: Record<string, string> = {
  draft:     'Taslak',
  ordered:   'Sipariş Verildi',
  received:  'Teslim Alındı',
  cancelled: 'İptal',
}

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase } = auth

  const params = req.nextUrl.searchParams
  const today  = new Date().toISOString().slice(0, 10)
  const year   = new Date().getFullYear()
  const from   = params.get('from') ?? `${year}-01-01`
  const to     = params.get('to')   ?? today

  const safePat = /^\d{4}-\d{2}-\d{2}$/
  const safeFrom = safePat.test(from) ? from : `${year}-01-01`
  const safeTo   = safePat.test(to)   ? to   : today

  const { data: orders, error } = await supabase
    .from('purchase_orders')
    .select(`
      order_date, supplier_name, status, expected_date,
      currency, total_try, notes,
      purchase_order_items ( name, quantity, unit, unit_price, currency )
    `)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .gte('order_date', safeFrom)
    .lte('order_date', safeTo)
    .order('order_date', { ascending: true })

  if (error) {
    return NextResponse.json({ error: 'Veri alınamadı' }, { status: 500 })
  }

  const lines: string[] = [
    '﻿' + row([
      'Sipariş Tarihi', 'Tedarikçi', 'Durum', 'Beklenen Teslimat',
      'Ürün Özeti', 'Para Birimi', 'Toplam (TRY)', 'Notlar',
    ]),
  ]

  for (const o of (orders ?? [])) {
    const items = (o.purchase_order_items as Array<{
      name: string; quantity: number; unit: string; unit_price: number; currency: string
    }> | null) ?? []
    const summary = items
      .map(i => `${i.name} (${i.quantity} ${i.unit})`)
      .join(', ') || ''

    lines.push(row([
      fmtDate(o.order_date),
      o.supplier_name ?? '',
      STATUS_TR[o.status ?? ''] ?? o.status ?? '',
      fmtDate(o.expected_date),
      summary,
      o.currency ?? 'TRY',
      fmtAmount(o.total_try),
      o.notes ?? '',
    ]))
  }

  const csv      = lines.join('\r\n')
  const filename = `flowra-satinalma-${safeFrom}_${safeTo}.csv`

  return new NextResponse(csv, {
    headers: {
      'Content-Type':        'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
