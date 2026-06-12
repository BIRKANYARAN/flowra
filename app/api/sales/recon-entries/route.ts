// ── /api/sales/recon-entries — read-only Flowra sales for invoice reconciliation
//
// Returns Flowra's sales as signed BookEntry[] (positive = an issued invoice's
// total) to match against an accounting/e-Fatura system's invoice list uploaded
// client-side. READ-ONLY — selects only, no writes, no DDL.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import type { BookEntry } from '@/lib/connectors/reconcile'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase } = auth

  const { searchParams } = new URL(req.url)
  const from = (searchParams.get('from') ?? '').slice(0, 10) || null
  const to   = (searchParams.get('to')   ?? '').slice(0, 10) || null

  let q = supabase
    .from('sales')
    .select('id, customer_name, total:total, sale_date')
    .eq('company_id', companyId)
    .is('deleted_at', null)
  if (from) q = q.gte('sale_date', from)
  if (to)   q = q.lte('sale_date', to)
  const { data, error } = await q.limit(3000)

  if (error) return NextResponse.json({ error: 'Veri alınamadı' }, { status: 500 })

  const entries: BookEntry[] = ((data ?? []) as Array<Record<string, unknown>>)
    .map(s => ({
      id:     `sale:${s.id}`,
      date:   String((s.sale_date as string) || '').slice(0, 10),
      amount: Math.round((Number(s.total ?? 0)) * 100) / 100,   // + issued total
      label:  String(s.customer_name ?? '—'),
    }))
    .filter(e => e.date && e.amount > 0)

  return NextResponse.json({ entries })
}
