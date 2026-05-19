// ── CollectionsCommandBar — Tahsilat İstihbarat Şeridi ───────────────────────
//
// Server component — renders above CollectionsClient with zero client JS.
// Queries collection state directly from Supabase.
//
// Zones:
//   LEFT  — 4 KPI pills: Açık Alacak · Gecikmiş · Kısmi · Tahsilat Oranı
//   RIGHT — Top 3 acil tahsilat (en uzun vadesi geçmiş)
//
// Data: single parallel Supabase query, no external API calls.

import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import { fmtCompact as fmt } from '@/lib/format'

function daysBetween(a: string, b: string): number {
  return Math.floor((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000)
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  companyId: string
}

export async function CollectionsCommandBar({ companyId }: Props) {
  const supabase = createClient()
  const today    = new Date().toISOString().slice(0, 10)

  // ── Parallel queries ────────────────────────────────────────────────────────
  const [outstandingRes, urgentRes] = await Promise.all([
    // Aggregate by payment_status
    supabase
      .from('sales')
      .select('payment_status, total_try:total, amount_paid:paid_amount')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .in('payment_status', ['pending', 'partial', 'overdue']),

    // Top urgent: oldest due_date first (max 3)
    supabase
      .from('sales')
      .select('id, customer_name, total_try:total, amount_paid:paid_amount, due_date, payment_status')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .in('payment_status', ['pending', 'partial', 'overdue'])
      .not('due_date', 'is', null)
      .lt('due_date', today)
      .order('due_date', { ascending: true })
      .limit(3),
  ])

  const rows      = outstandingRes.data ?? []
  const urgentRows = urgentRes.data ?? []

  // ── Aggregate metrics ───────────────────────────────────────────────────────
  let totalOutstanding = 0
  let overdueTotal     = 0
  let partialTotal     = 0
  let totalInvoiced    = 0
  let totalPaid        = 0

  for (const r of rows) {
    const remaining = Number(r.total_try ?? 0) - Number(r.amount_paid ?? 0)
    totalOutstanding += remaining
    totalInvoiced    += Number(r.total_try ?? 0)
    totalPaid        += Number(r.amount_paid ?? 0)
    if (r.payment_status === 'overdue') overdueTotal += remaining
    if (r.payment_status === 'partial') partialTotal += remaining
  }

  const collectionRate = totalInvoiced > 0 ? (totalPaid / totalInvoiced) * 100 : 100
  const openCount      = rows.length

  // ── Render ─────────────────────────────────────────────────────────────────

  if (totalOutstanding === 0 && urgentRows.length === 0) {
    return (
      <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 border border-emerald-200 rounded text-xs font-semibold text-emerald-700">
        ✓ Tüm tahsilatlar güncel — açık alacak yok.
      </div>
    )
  }

  return (
    <div className="space-y-2">

      {/* ── KPI strip ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">

        {/* Açık Alacak */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-100 rounded">
          <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">Açık Alacak</span>
          <span className="text-sm font-black tabular-nums text-gray-900">{fmt(totalOutstanding)}</span>
          <span className="text-[9px] text-gray-400">{openCount} fatura</span>
        </div>

        {/* Gecikmiş */}
        {overdueTotal > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 border border-red-200 rounded">
            <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse shrink-0" />
            <span className="text-[9px] font-black uppercase tracking-widest text-red-600">Gecikmiş</span>
            <span className="text-sm font-black tabular-nums text-red-700">{fmt(overdueTotal)}</span>
          </div>
        )}

        {/* Kısmi */}
        {partialTotal > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded">
            <span className="text-[9px] font-black uppercase tracking-widest text-blue-600">Kısmi</span>
            <span className="text-sm font-black tabular-nums text-blue-700">{fmt(partialTotal)}</span>
          </div>
        )}

        {/* Tahsilat oranı */}
        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded border ${
          collectionRate >= 80
            ? 'bg-emerald-50 border-emerald-200'
            : collectionRate >= 50
            ? 'bg-amber-50 border-amber-200'
            : 'bg-red-50 border-red-200'
        }`}>
          <span className="text-[9px] font-black uppercase tracking-widest text-gray-500">Tahsilat</span>
          <span className={`text-sm font-black tabular-nums ${
            collectionRate >= 80 ? 'text-emerald-700' :
            collectionRate >= 50 ? 'text-amber-700' : 'text-red-700'
          }`}>
            %{collectionRate.toFixed(0)}
          </span>
          <span className="text-[9px] text-gray-400">{fmt(totalPaid)} alındı</span>
        </div>

        {/* Link to risk tab for full aging */}
        <Link href="/dashboard/finance?tab=risks"
          className="ml-auto text-[10px] text-primary-600 font-semibold hover:text-primary-700 transition-colors shrink-0">
          Yaşlandırma Analizi →
        </Link>
      </div>

      {/* ── Acil Tahsilat ─────────────────────────────────────────────────── */}
      {urgentRows.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded overflow-hidden">
          <div className="px-3 py-2 border-b border-red-100 flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
            <span className="text-[9px] font-black uppercase tracking-widest text-red-700">Acil Tahsilat — Vadesi Geçmiş</span>
          </div>
          <div className="divide-y divide-red-100">
            {urgentRows.map(r => {
              const remaining = Number(r.total_try ?? 0) - Number(r.amount_paid ?? 0)
              const days      = r.due_date ? daysBetween(r.due_date, today) : 0
              return (
                <div key={r.id} className="px-3 py-2 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <span className="text-xs font-bold text-gray-900 truncate block">
                      {r.customer_name}
                    </span>
                    <span className="text-[10px] text-red-600 font-semibold">
                      {days} gün gecikmiş
                    </span>
                  </div>
                  <div className="text-sm font-black tabular-nums text-red-700 shrink-0">
                    {fmt(remaining)}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
