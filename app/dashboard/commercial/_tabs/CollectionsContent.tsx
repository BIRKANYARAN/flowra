// ── CollectionsContent — Collections Pressure Surface ──────────────────────────
// Sprint 3: risk-weighted pressure view replacing the tab-based table

import { Suspense } from 'react'
import { NarrativeFooter } from '@/components/ds'
import { createClient } from '@/lib/supabase-server'
import CollectionsPressureClient, { type CollectionRow } from '@/app/dashboard/collections/CollectionsPressureClient'
import { CollectionsCommandBar } from '@/app/dashboard/collections/_components/CollectionsCommandBar'
import { ObservationRail } from '@/app/dashboard/_shared/ObservationRail'
import { fmtTRY as fmt } from '@/lib/format'

function CommandBarSkeleton() {
  return (
    <div className="flex items-center gap-2 animate-pulse">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-8 w-28 bg-[#f1f5f9] rounded" />
      ))}
    </div>
  )
}

// ── Risk score formula (same as API sort) ─────────────────────────────────────
function riskScore(row: { due_date?: string | null; sale_date?: string | null; total_try: number }, today: string): number {
  const refDate = row.due_date ?? row.sale_date ?? ''
  const days = refDate
    ? Math.max(0, Math.round((new Date(today).getTime() - new Date(refDate.slice(0, 10)).getTime()) / 86_400_000))
    : 0
  return days * 0.6 + (row.total_try / 10000) * 0.4
}

interface Props { companyId: string }

export async function CollectionsContent({ companyId }: Props) {
  const supabase = createClient()
  const today    = new Date().toISOString().slice(0, 10)

  // Fetch all open receivables (pending + partial + overdue)
  const { data: rawRows } = await supabase
    .from('sales')
    .select('id, customer_name, currency, total_try:total, sale_date, created_at, due_date, amount_paid:paid_amount, proforma_id, payment_status, paid_at, proformas(proforma_no)')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .in('payment_status', ['pending', 'partial', 'overdue'])
    .order('sale_date', { ascending: false })
    .limit(100)

  const initialRows: CollectionRow[] = ((rawRows ?? []) as Array<{
    id: string
    customer_name: string
    currency: string
    total_try: number
    sale_date: string | null
    created_at: string
    due_date: string | null
    amount_paid: number | null
    proforma_id: string | null
    payment_status: string
    paid_at: string | null
    proformas: { proforma_no: string } | { proforma_no: string }[] | null
  }>)
    .map(r => ({
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
    // Sort by risk score DESC server-side
    .sort((a, b) => riskScore(b, today) - riskScore(a, today))

  // ── Pressure summary stats ─────────────────────────────────────────────────
  const grandTotal  = initialRows.reduce((s, r) => s + Math.max(0, r.total_try - (r.amount_paid ?? 0)), 0)
  const totalCount  = initialRows.length

  const criticalRows = initialRows.filter(r => {
    const refDate = r.due_date ?? r.sale_date ?? ''
    if (!refDate) return false
    const days = Math.round((new Date(today).getTime() - new Date(refDate.slice(0, 10)).getTime()) / 86_400_000)
    return days > 60
  })
  const criticalTotal = criticalRows.reduce((s, r) => s + Math.max(0, r.total_try - (r.amount_paid ?? 0)), 0)

  const nearDueRows = initialRows.filter(r => {
    const refDate = r.due_date ?? r.sale_date ?? ''
    if (!refDate) return false
    const days = Math.round((new Date(today).getTime() - new Date(refDate.slice(0, 10)).getTime()) / 86_400_000)
    return days >= 0 && days <= 30
  })
  const nearDueTotal = nearDueRows.reduce((s, r) => s + Math.max(0, r.total_try - (r.amount_paid ?? 0)), 0)

  return (
    <div className="max-w-5xl space-y-3">
      <ObservationRail context="collections" maxItems={3} />

      <Suspense fallback={<CommandBarSkeleton />}>
        <CollectionsCommandBar companyId={companyId} />
      </Suspense>

      {/* ── Pressure Summary Strip ─────────────────────────────────────────────── */}
      {grandTotal > 0 && (
        <div className="bg-white border border-[#e2e8f0] rounded px-4 py-3 shadow-sm flex flex-wrap gap-x-4 gap-y-1 items-center text-xs">
          <span className="font-bold text-[#0f172a]">{fmt(grandTotal)} açık alacak</span>
          <span className="text-[#94a3b8]">·</span>
          <span className="text-[#334155]">{totalCount} fatura</span>
          {criticalTotal > 0 && (
            <>
              <span className="text-[#94a3b8]">·</span>
              <span className="font-bold text-neg">{fmt(criticalTotal)} kritik (60+ gün)</span>
            </>
          )}
          {nearDueTotal > 0 && (
            <>
              <span className="text-[#94a3b8]">·</span>
              <span className="font-semibold text-warn-text">{fmt(nearDueTotal)} vadesi &lt;30 gün</span>
            </>
          )}
        </div>
      )}

      {/* ── Risk-sorted pressure rows (client) ────────────────────────────────── */}
      <CollectionsPressureClient initialRows={initialRows} />

      {/* Cross-navigation */}
      <NarrativeFooter
        narrative="60+ gün geciken alacaklar nakit pozisyonunu doğrudan baskılar — runway hesabı bu rakamlara dayanır."
        links={[
          { label: 'Müşteri Riskleri',    href: '/dashboard/commercial?tab=customers' },
          { label: 'Alacak Risk Analizi', href: '/dashboard/finance?tab=risks' },
        ]}
      />
    </div>
  )
}
