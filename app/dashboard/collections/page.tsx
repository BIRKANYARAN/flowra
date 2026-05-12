// ── /dashboard/collections — server component wrapper ─────────────────────────
//
// Pre-fetches the initial "unpaid" rows (first 50) server-side so the page
// renders with data immediately — no loading spinner on first paint.
//
// The interactive shell (CollectionsClient) handles tab switching, mutations,
// and optimistic updates client-side after hydration.

export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { resolveCompanyId } from '@/lib/resolve-company'
import CollectionsClient, { type CollectionRow } from './CollectionsClient'

export default async function CollectionsPage() {
  const supabase = createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) redirect('/login')

  let companyId: string
  try {
    companyId = await resolveCompanyId(authData.user.id, supabase)
  } catch {
    // Fall back to empty initial rows — client will retry via API
    return (
      <div className="max-w-5xl">
        <CollectionsClient initialRows={[]} />
      </div>
    )
  }

  // Pre-fetch first page of "unpaid" rows (same query as /api/collections?status=unpaid)
  const { data } = await supabase
    .from('sales')
    .select('id, customer_name, currency, total, total_try, created_at, due_date, amount_paid, proforma_id, payment_status, paid_at, proformas(proforma_no)')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .in('payment_status', ['unpaid', 'partial', 'overdue'])
    .order('created_at', { ascending: false })
    .range(0, 49)

  const initialRows: CollectionRow[] = (data ?? []).map(r => ({
    id:             r.id,
    customer_name:  r.customer_name,
    currency:       r.currency,
    total:          r.total,
    total_try:      r.total_try,
    created_at:     r.created_at,
    due_date:       r.due_date,
    amount_paid:    r.amount_paid,
    proforma_id:    r.proforma_id,
    payment_status: r.payment_status as CollectionRow['payment_status'],
    paid_at:        r.paid_at,
    proformas:      (Array.isArray(r.proformas) ? r.proformas[0] ?? null : r.proformas) as CollectionRow['proformas'],
  }))

  return (
    <div className="max-w-5xl">
      <CollectionsClient initialRows={initialRows} />
    </div>
  )
}
