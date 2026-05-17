// ── CollectionsContent — Commercial hub / collections tab ─────────────────────

import { Suspense } from 'react'
import { createClient } from '@/lib/supabase-server'
import CollectionsClient, { type CollectionRow } from '@/app/dashboard/collections/CollectionsClient'
import { CollectionsCommandBar } from '@/app/dashboard/collections/_components/CollectionsCommandBar'

function CommandBarSkeleton() {
  return (
    <div className="flex items-center gap-2 animate-pulse">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-8 w-28 bg-gray-100 rounded-xl" />
      ))}
    </div>
  )
}

interface Props { companyId: string }

export async function CollectionsContent({ companyId }: Props) {
  const supabase = createClient()

  const { data } = await supabase
    .from('sales')
    .select('id, customer_name, currency, total_try:total, sale_date, created_at, due_date, amount_paid:paid_amount, proforma_id, payment_status, paid_at, proformas(proforma_no)')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .in('payment_status', ['pending', 'partial', 'overdue'])
    .order('sale_date', { ascending: false })
    .range(0, 49)

  const initialRows: CollectionRow[] = (data ?? []).map(r => ({
    id:             r.id,
    customer_name:  r.customer_name,
    currency:       r.currency,
    total:          r.total_try,
    total_try:      r.total_try,
    sale_date:      r.sale_date,
    created_at:     r.created_at,
    due_date:       r.due_date,
    amount_paid:    r.amount_paid,
    proforma_id:    r.proforma_id,
    payment_status: r.payment_status as CollectionRow['payment_status'],
    paid_at:        r.paid_at,
    proformas:      (Array.isArray(r.proformas) ? r.proformas[0] ?? null : r.proformas) as CollectionRow['proformas'],
  }))

  return (
    <div className="max-w-5xl space-y-3">
      <Suspense fallback={<CommandBarSkeleton />}>
        <CollectionsCommandBar companyId={companyId} />
      </Suspense>
      <CollectionsClient initialRows={initialRows} />
    </div>
  )
}
