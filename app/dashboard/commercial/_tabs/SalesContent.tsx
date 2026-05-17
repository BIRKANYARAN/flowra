// ── SalesContent — server component: fetches, passes to SalesTable client island

import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import { normalizeSaleRow } from '@/lib/normalize'
import { SalesTable } from './SalesTable'

interface Props { companyId: string }

export async function SalesContent({ companyId }: Props) {
  const supabase = createClient()
  let rows: ReturnType<typeof normalizeSaleRow>[] = []

  try {
    const { data, error } = await supabase
      .from('sales')
      .select('id, customer_name, currency, total_try:total, sale_date, created_at, proforma_id, payment_status, shipment_status, paid_amount, proformas(proforma_no, deleted_at)')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('sale_date', { ascending: false })

    if (!error) rows = (data ?? []).map(normalizeSaleRow)
  } catch {
    // non-fatal; SalesTable handles empty state
  }

  const list = rows.filter((r): r is NonNullable<typeof r> => r !== null)

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-gray-400">{list.length} satış kaydı</p>
        <Link
          href="/dashboard/commercial?tab=collections"
          className="border border-gray-100 px-3.5 py-2 rounded-xl text-xs font-semibold text-gray-500 hover:bg-gray-50 hover:text-gray-800 transition-colors"
        >
          Tahsilatlar →
        </Link>
      </div>

      <SalesTable rows={list} />
    </div>
  )
}
