// GET /api/export/expenses  — Expenses CSV for accountant handoff
//
// Query params:
//   from   YYYY-MM-DD  default: first day of current year
//   to     YYYY-MM-DD  default: today
//
// Columns (semicolon-delimited, UTF-8 BOM for Excel on Turkish locale):
//   Tarih · Açıklama · Kategori · Tutar · Ödeme Durumu · Ödeme Tarihi · Notlar

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

const EXPENSE_TYPE_TR: Record<string, string> = {
  salary:              'Maaş / İşçilik',
  rent:                'Kira',
  software:            'Yazılım / Abonelik',
  marketing:           'Pazarlama',
  logistics:           'Lojistik / Kargo',
  utilities:           'Faturalar / Hizmetler',
  operational:         'Genel Operasyonel',
  partner_financing:   'Ortak Finansmanı',
  loan_repayment:      'Kredi Geri Ödeme',
  dividend:            'Temettü',
  internal_transfer:   'İç Transfer',
  tax:                 'Vergi / SGK',
  other:               'Diğer',
}

const PAYMENT_STATUS_TR: Record<string, string> = {
  paid:    'Ödendi',
  unpaid:  'Ödenmedi',
  overdue: 'Gecikmiş',
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

  const safePat  = /^\d{4}-\d{2}-\d{2}$/
  const safeFrom = safePat.test(from) ? from : `${year}-01-01`
  const safeTo   = safePat.test(to)   ? to   : today

  const { data: expenses, error } = await supabase
    .from('expenses')
    .select('expense_date, description, expense_type, amount_try, payment_status, paid_date, notes, vendor_name')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .gte('expense_date', safeFrom)
    .lte('expense_date', safeTo)
    .order('expense_date', { ascending: true })

  if (error) {
    return NextResponse.json({ error: 'Veri alınamadı' }, { status: 500 })
  }

  const rows = expenses ?? []

  const lines: string[] = [
    '﻿' + row([
      'Tarih', 'Açıklama', 'Tedarikçi', 'Kategori', 'Tutar (₺)',
      'Ödeme Durumu', 'Ödeme Tarihi', 'Notlar',
    ]),
  ]

  for (const e of rows) {
    lines.push(row([
      fmtDate(e.expense_date),
      e.description ?? '',
      (e as { vendor_name?: string | null }).vendor_name ?? '',
      EXPENSE_TYPE_TR[e.expense_type ?? ''] ?? e.expense_type ?? '',
      fmtAmount(e.amount_try),
      PAYMENT_STATUS_TR[e.payment_status ?? ''] ?? e.payment_status ?? '',
      fmtDate((e as { paid_date?: string | null }).paid_date),
      e.notes ?? '',
    ]))
  }

  const csv = lines.join('\r\n')
  const filename = `flowra-masraflar-${safeFrom}_${safeTo}.csv`

  return new NextResponse(csv, {
    headers: {
      'Content-Type':        'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
