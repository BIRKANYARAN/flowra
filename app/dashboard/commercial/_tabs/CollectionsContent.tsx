// ── CollectionsContent — Commercial hub / collections tab ─────────────────────

import { Suspense } from 'react'
import { createClient } from '@/lib/supabase-server'
import CollectionsClient, { type CollectionRow } from '@/app/dashboard/collections/CollectionsClient'
import { CollectionsCommandBar } from '@/app/dashboard/collections/_components/CollectionsCommandBar'
import { fmtTRY as fmt } from '@/lib/format'

function CommandBarSkeleton() {
  return (
    <div className="flex items-center gap-2 animate-pulse">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-8 w-28 bg-gray-100 rounded-xl" />
      ))}
    </div>
  )
}

interface AgingBucket { label: string; count: number; total: number; color: string; sub: string }

function AgingStrip({ buckets, grandTotal }: { buckets: AgingBucket[]; grandTotal: number }) {
  if (grandTotal === 0) return null
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 bg-white border border-gray-100 rounded-xl overflow-hidden shadow-[0_1px_2px_rgba(17,24,39,0.04)]">
      {buckets.map((b, i) => (
        <div key={b.label} className={`p-3 ${i < 3 ? 'border-b sm:border-b-0 sm:border-r border-gray-100' : ''}`}>
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">{b.label}</div>
          <div className={`text-lg font-black tabular-nums leading-none ${b.color}`}>
            {b.total > 0 ? fmt(b.total) : '—'}
          </div>
          <div className="text-[10px] text-gray-400 mt-1">{b.sub}</div>
        </div>
      ))}
    </div>
  )
}

interface Props { companyId: string }

export async function CollectionsContent({ companyId }: Props) {
  const supabase = createClient()
  const today    = new Date().toISOString().slice(0, 10)

  const [rowsRes, agingRes] = await Promise.all([
    supabase
      .from('sales')
      .select('id, customer_name, currency, total_try:total, sale_date, created_at, due_date, amount_paid:paid_amount, proforma_id, payment_status, paid_at, proformas(proforma_no)')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .in('payment_status', ['pending', 'partial', 'overdue'])
      .order('sale_date', { ascending: false })
      .range(0, 49),

    // Full dataset for aging — lightweight select
    supabase
      .from('sales')
      .select('total:total, paid_amount, due_date, sale_date')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .in('payment_status', ['pending', 'partial', 'overdue']),
  ])

  const initialRows: CollectionRow[] = (rowsRes.data ?? []).map(r => ({
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

  // ── Aging computation ──────────────────────────────────────────────────────
  const bucketData = [
    { label: 'Güncel (0-30g)',    maxDays: 30,  count: 0, total: 0, color: 'text-amber-700',   sub: '' },
    { label: '31-60 Gün',         maxDays: 60,  count: 0, total: 0, color: 'text-orange-700',  sub: '' },
    { label: '61-90 Gün',         maxDays: 90,  count: 0, total: 0, color: 'text-red-600',     sub: '' },
    { label: '90+ Gün (Kritik)',  maxDays: Infinity, count: 0, total: 0, color: 'text-red-800 font-black', sub: '' },
  ]

  let grandTotal = 0

  for (const row of (agingRes.data ?? [])) {
    const remaining = Math.max(0, Number(row.total ?? 0) - Number(row.paid_amount ?? 0))
    if (remaining <= 0) continue

    // Reference date: use due_date if set, else sale_date; compare against today
    const refDate = (row.due_date ?? row.sale_date ?? '') as string
    const daysOverdue = refDate
      ? Math.max(0, Math.round((new Date(today).getTime() - new Date(refDate.slice(0, 10)).getTime()) / 86_400_000))
      : 0

    const bucketIdx = daysOverdue <= 30 ? 0 : daysOverdue <= 60 ? 1 : daysOverdue <= 90 ? 2 : 3
    bucketData[bucketIdx].count += 1
    bucketData[bucketIdx].total += remaining
    grandTotal += remaining
  }

  const agingBuckets: AgingBucket[] = bucketData.map(b => ({
    label: b.label,
    count: b.count,
    total: b.total,
    color: b.color,
    sub:   b.count > 0 ? `${b.count} fatura` : 'Yok',
  }))

  return (
    <div className="max-w-5xl space-y-3">
      <Suspense fallback={<CommandBarSkeleton />}>
        <CollectionsCommandBar companyId={companyId} />
      </Suspense>

      {/* Aging KPI strip */}
      <AgingStrip buckets={agingBuckets} grandTotal={grandTotal} />

      <CollectionsClient initialRows={initialRows} />
    </div>
  )
}
