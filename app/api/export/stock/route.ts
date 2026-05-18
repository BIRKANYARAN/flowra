// GET /api/export/stock — Current stock (FIFO lots) CSV for stocktaker / accountant
//
// No date filter: exports all active lots (qty_remaining > 0) as of now.
// Grouped by product: product name, lot info, qty, unit cost, total TRY value.
//
// Columns (semicolon-delimited, UTF-8 BOM for Excel on Turkish locale):
//   Ürün · SKU · Lot No · Stok (Adet) · Birim Maliyet · Para Birimi ·
//   Maliyet (TRY) · Toplam Değer (TRY) · Giriş Tarihi · Notlar

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
  return Number(n).toFixed(4).replace('.', ',')
}

function fmtAmountShort(n: number | null | undefined): string {
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

function fmtQty(n: number | null | undefined): string {
  if (n == null) return '0'
  const num = Number(n)
  // Show up to 3 decimal places but trim trailing zeros
  return num.toFixed(3).replace(/\.?0+$/, '').replace('.', ',')
}

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase } = auth

  const { data: lots, error } = await supabase
    .from('stock_lots')
    .select(`
      lot_no, qty_remaining, cost_price, cost_currency, cost_price_try,
      received_at, notes,
      products ( name, sku, unit )
    `)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .gt('qty_remaining', 0)
    .order('received_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: 'Veri alınamadı' }, { status: 500 })
  }

  const today = new Date().toISOString().slice(0, 10)

  const lines: string[] = [
    '﻿' + row([
      'Ürün', 'SKU', 'Birim', 'Lot No', 'Stok Miktarı',
      'Birim Maliyet', 'Para Birimi', 'Birim Maliyet (TRY)',
      'Toplam Değer (TRY)', 'Giriş Tarihi', 'Notlar',
    ]),
  ]

  let grandTotal = 0

  for (const lot of (lots ?? [])) {
    const product = (Array.isArray(lot.products) ? lot.products[0] ?? null : lot.products) as { name: string; sku: string | null; unit: string | null } | null
    const qtyRem  = Number(lot.qty_remaining ?? 0)
    const cpTry   = Number(lot.cost_price_try ?? lot.cost_price ?? 0)
    const value   = qtyRem * cpTry
    grandTotal   += value

    lines.push(row([
      product?.name ?? '—',
      product?.sku ?? '',
      product?.unit ?? 'adet',
      lot.lot_no ?? '',
      fmtQty(qtyRem),
      fmtAmount(lot.cost_price),
      lot.cost_currency ?? 'TRY',
      fmtAmount(cpTry),
      fmtAmountShort(value),
      fmtDate(lot.received_at),
      lot.notes ?? '',
    ]))
  }

  // Summary row
  if ((lots?.length ?? 0) > 0) {
    lines.push('')
    lines.push(row(['TOPLAM STOK DEĞERİ (TRY)', '', '', '', '', '', '', '', fmtAmountShort(grandTotal), today, '']))
  }

  const csv      = lines.join('\r\n')
  const filename = `flowra-stok-${today}.csv`

  return new NextResponse(csv, {
    headers: {
      'Content-Type':        'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
