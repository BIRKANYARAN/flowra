// GET /api/export/sales  — Sales CSV for accountant handoff
//
// Query params:
//   from   YYYY-MM-DD  default: first day of current year
//   to     YYYY-MM-DD  default: today
//
// Columns (semicolon-delimited, UTF-8 BOM for Excel on Turkish locale):
//   Tarih · Müşteri · Ürün Grubu · KDV Hariç · KDV Tutarı · KDV Dahil ·
//   Ödeme Durumu · Ödeme Tarihi · Vade Tarihi · Gün Vadesi · Notlar

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth }            from '@/lib/api-auth'

function escCsv(val: unknown): string {
  const s = val == null ? '' : String(val)
  // If contains semicolon, double-quote, newline → wrap in double quotes + escape inner quotes
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

function daysBetween(from: string | null, to: string | null): number | '' {
  if (!from || !to) return ''
  try {
    const diff = new Date(to.slice(0, 10)).getTime() - new Date(from.slice(0, 10)).getTime()
    return Math.round(diff / 86_400_000)
  } catch { return '' }
}

const PAYMENT_STATUS_TR: Record<string, string> = {
  paid:      'Tahsil Edildi',
  partial:   'Kısmi Ödeme',
  unpaid:    'Ödenmedi',
  overdue:   'Gecikmiş',
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

  // Clamp to valid date strings
  const safePat = /^\d{4}-\d{2}-\d{2}$/
  const safeFrom = safePat.test(from) ? from : `${year}-01-01`
  const safeTo   = safePat.test(to)   ? to   : today

  const { data: sales, error } = await supabase
    .from('sales')
    .select(`
      sale_date, customer_name, total, paid_amount, payment_status,
      paid_at, due_date, notes,
      sale_items ( product_name, qty, unit_price_try, discount_pct )
    `)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .gte('sale_date', safeFrom)
    .lte('sale_date', safeTo)
    .order('sale_date', { ascending: true })

  if (error) {
    return NextResponse.json({ error: 'Veri alınamadı' }, { status: 500 })
  }

  const rows = sales ?? []

  const lines: string[] = [
    // UTF-8 BOM ensures Excel on Turkish locale opens correctly
    '﻿' + row([
      'Tarih', 'Müşteri', 'Ürün Özeti', 'Tutar (₺)', 'Tahsil Edilen (₺)',
      'Kalan (₺)', 'Ödeme Durumu', 'Ödeme Tarihi', 'Vade Tarihi', 'Gecikme (Gün)', 'Notlar',
    ]),
  ]

  for (const s of rows) {
    const total   = Number(s.total ?? 0)
    const paid    = Number(s.paid_amount ?? 0)
    const remaining = Math.max(0, total - paid)
    const items   = (s.sale_items as Array<{ product_name: string; qty: number }> | null) ?? []
    const summary = items.map(i => `${i.product_name} (${i.qty})`).join(', ') || ''
    const lateDays = s.payment_status !== 'paid' && s.due_date
      ? daysBetween(s.due_date, today)
      : ''

    lines.push(row([
      fmtDate(s.sale_date),
      s.customer_name ?? '',
      summary,
      fmtAmount(total),
      fmtAmount(paid),
      fmtAmount(remaining),
      PAYMENT_STATUS_TR[s.payment_status ?? ''] ?? s.payment_status ?? '',
      fmtDate(s.paid_at),
      fmtDate(s.due_date),
      typeof lateDays === 'number' && lateDays > 0 ? lateDays : '',
      s.notes ?? '',
    ]))
  }

  const csv = lines.join('\r\n')
  const filename = `flowra-satislar-${safeFrom}_${safeTo}.csv`

  return new NextResponse(csv, {
    headers: {
      'Content-Type':        'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
