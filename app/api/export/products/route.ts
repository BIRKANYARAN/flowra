// GET /api/export/products — Product catalogue CSV for accountant / price-list handoff
//
// No date filter: exports all non-deleted products as of now.
// Re-importable: the header row matches the /api/products/import synonyms, so an
// exported file can be edited in Excel and re-imported.
//
// Columns (semicolon-delimited, UTF-8 BOM for Excel on Turkish locale):
//   Ürün Adı · Stok Kodu · Birim · Birim Maliyet · Satış Fiyatı · Kategori ·
//   Stok · Kritik Stok

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
function fmtAmount(n: unknown): string {
  return Number(n ?? 0).toFixed(2).replace('.', ',')
}

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase } = auth

  const { data, error } = await supabase
    .from('products')
    .select('name, sku, unit, unit_cost, default_sale_price, category, stock_qty, stock_alert_qty')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('name')

  if (error) return NextResponse.json({ error: 'Veri alınamadı' }, { status: 500 })

  const products = data ?? []
  const today    = new Date().toISOString().slice(0, 10)

  const lines: string[] = [
    '﻿' + row(['Ürün Adı', 'Stok Kodu', 'Birim', 'Birim Maliyet', 'Satış Fiyatı', 'Kategori', 'Stok', 'Kritik Stok']),
  ]

  for (const p of products) {
    lines.push(row([
      p.name ?? '',
      p.sku ?? '',
      p.unit ?? 'adet',
      fmtAmount(p.unit_cost),
      p.default_sale_price != null ? fmtAmount(p.default_sale_price) : '',
      p.category ?? '',
      String(Number(p.stock_qty ?? 0)),
      String(Number(p.stock_alert_qty ?? 0)),
    ]))
  }

  if (products.length > 0) {
    lines.push('')
    lines.push(row([`TOPLAM (${products.length} ürün)`, '', '', '', '', '', '', '']))
  }

  const csv      = lines.join('\r\n')
  const filename = `flowra-urunler-${today}.csv`

  return new NextResponse(csv, {
    headers: {
      'Content-Type':        'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
