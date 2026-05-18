// GET /api/export/customers — Customer list CSV for accountant / CRM handoff
//
// No date filter: exports all non-deleted customers as of now.
// Includes sale totals and outstanding balance per customer from the sales table.
//
// Columns (semicolon-delimited, UTF-8 BOM for Excel on Turkish locale):
//   Müşteri Adı · Vergi No · Vergi Dairesi · E-posta · Telefon · Adres ·
//   Toplam Ciro (TRY) · Tahsil Edilen (TRY) · Bekleyen Alacak (TRY) · Notlar

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

function fmtAmount(n: number): string {
  return Number(n).toFixed(2).replace('.', ',')
}

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase } = auth

  const [customersRes, salesRes] = await Promise.all([
    supabase
      .from('customers')
      .select('id, name, tax_number, tax_office, email, phone, address, notes, created_at')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('name'),

    // Lightweight sales aggregation per customer_name
    supabase
      .from('sales')
      .select('customer_name, total_try:total, paid_amount, payment_status')
      .eq('company_id', companyId)
      .is('deleted_at', null),
  ])

  if (customersRes.error) {
    return NextResponse.json({ error: 'Veri alınamadı' }, { status: 500 })
  }

  const customers = customersRes.data ?? []
  const sales     = salesRes.data    ?? []

  // Aggregate sales per customer name (lowercase match for resilience)
  const salesMap = new Map<string, { total: number; paid: number }>()
  for (const s of sales) {
    const key = (s.customer_name ?? '').trim().toLowerCase()
    const prev = salesMap.get(key) ?? { total: 0, paid: 0 }
    const total = Number(s.total_try ?? 0)
    const paid  = s.payment_status === 'paid'
      ? total
      : Number(s.paid_amount ?? 0)
    salesMap.set(key, { total: prev.total + total, paid: prev.paid + paid })
  }

  const today = new Date().toISOString().slice(0, 10)

  const lines: string[] = [
    '﻿' + row([
      'Müşteri Adı', 'Vergi No', 'Vergi Dairesi', 'E-posta', 'Telefon', 'Adres',
      'Toplam Ciro (TRY)', 'Tahsil Edilen (TRY)', 'Bekleyen Alacak (TRY)', 'Notlar',
    ]),
  ]

  let grandTotal = 0
  let grandPaid  = 0

  for (const c of customers) {
    const key  = (c.name ?? '').trim().toLowerCase()
    const agg  = salesMap.get(key) ?? { total: 0, paid: 0 }
    const owed = Math.max(0, agg.total - agg.paid)
    grandTotal += agg.total
    grandPaid  += agg.paid

    lines.push(row([
      c.name        ?? '',
      c.tax_number  ?? '',
      c.tax_office  ?? '',
      c.email       ?? '',
      c.phone       ?? '',
      (c.address ?? '').replace(/\n/g, ' '),
      fmtAmount(agg.total),
      fmtAmount(agg.paid),
      fmtAmount(owed),
      (c.notes ?? '').replace(/\n/g, ' '),
    ]))
  }

  // Summary footer
  if (customers.length > 0) {
    lines.push('')
    lines.push(row([
      `TOPLAM (${customers.length} müşteri)`, '', '', '', '', '',
      fmtAmount(grandTotal),
      fmtAmount(grandPaid),
      fmtAmount(Math.max(0, grandTotal - grandPaid)),
      '',
    ]))
  }

  const csv      = lines.join('\r\n')
  const filename = `flowra-musteriler-${today}.csv`

  return new NextResponse(csv, {
    headers: {
      'Content-Type':        'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
