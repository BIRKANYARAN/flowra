// ── CollectionsContent — Collections Pressure Surface ──────────────────────────
// Sprint 3: risk-weighted pressure view replacing the tab-based table

import { Suspense } from 'react'
import { NarrativeFooter } from '@/components/ds'
import { createClient } from '@/lib/supabase-server'
import CollectionsPressureClient, { type CollectionRow } from '@/app/dashboard/collections/CollectionsPressureClient'
import { CollectionsCommandBar } from '@/app/dashboard/collections/_components/CollectionsCommandBar'
import { ObservationRail } from '@/app/dashboard/_shared/ObservationRail'
import { fmtTRY as fmt } from '@/lib/format'
import { ReceivablesPriorityService } from '@/lib/services/commercial/receivables-priority.service'
import type { ReceivablesPriorityReport } from '@/lib/services/commercial/receivables-priority.service'

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

  // Fetch prioritized receivables and flat list in parallel
  const [priorityReport] = await Promise.all([
    ReceivablesPriorityService.getReport(companyId, supabase, { today })
      .catch(() => null as ReceivablesPriorityReport | null),
  ])

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

      {/* ── Tahsilat Önceliklendirme ────────────────────────────────────────────── */}
      {priorityReport && priorityReport.receivables.length > 0 && (
        <div className="bg-white border border-[#e2e8f0] rounded shadow-sm">
          {/* KPI strip */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#f1f5f9]">
            <div>
              <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">Tahsilat Önceliklendirme</div>
              <div className="text-xs text-[#64748b] mt-0.5">Müşteri risk profili bazlı öncelik sıralaması</div>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <div className="text-right">
                <div className="text-[9px] uppercase tracking-wide text-[#94a3b8]">Toplam Açık</div>
                <div className="font-black tabular-nums text-[#0f172a]">{fmt(priorityReport.total_outstanding_try)}</div>
              </div>
              {priorityReport.priority_outstanding_try > 0 && (
                <div className="text-right">
                  <div className="text-[9px] uppercase tracking-wide text-[#94a3b8]">Öncelikli (Acil+Kritik)</div>
                  <div className="font-black tabular-nums text-neg">{fmt(priorityReport.priority_outstanding_try)}</div>
                </div>
              )}
            </div>
          </div>

          {/* Urgency breakdown pills */}
          <div className="flex items-center gap-2 px-4 py-2 border-b border-[#f1f5f9] flex-wrap">
            {[
              { key: 'routine',   label: 'Rutin',      count: priorityReport.by_urgency.routine,   color: 'bg-[#f1f5f9] text-[#64748b]' },
              { key: 'follow_up', label: 'Takip',      count: priorityReport.by_urgency.follow_up, color: 'bg-blue-50 text-blue-700' },
              { key: 'urgent',    label: 'Acil',       count: priorityReport.by_urgency.urgent,    color: 'bg-warn-light text-warn-text' },
              { key: 'critical',  label: 'Kritik',     count: priorityReport.by_urgency.critical,  color: 'bg-neg-light text-neg-text' },
            ].map(pill => pill.count > 0 && (
              <span key={pill.key} className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black ${pill.color}`}>
                <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
                {pill.label} · {pill.count}
              </span>
            ))}
          </div>

          {/* Prioritized list */}
          <div className="divide-y divide-[#f8fafc]">
            {priorityReport.receivables.slice(0, 15).map(r => {
              const urgencyColors: Record<string, string> = {
                critical:  'border-l-2 border-neg bg-neg-light/30',
                urgent:    'border-l-2 border-warn bg-warn-light/30',
                follow_up: 'border-l-2 border-blue-300 bg-blue-50/30',
                routine:   '',
              }
              const tierLabels: Record<string, string> = {
                low: 'Düşük Risk', medium: 'Orta Risk', high: 'Yüksek Risk', critical: 'Kritik Risk', unknown: '—',
              }
              const tierColors: Record<string, string> = {
                low:      'text-pos-text bg-pos-light',
                medium:   'text-warn-text bg-warn-light',
                high:     'text-orange-700 bg-orange-50',
                critical: 'text-neg-text bg-neg-light',
                unknown:  'text-[#94a3b8] bg-[#f1f5f9]',
              }
              return (
                <div key={r.sale_id} className={`flex items-start gap-3 px-4 py-3 hover:bg-[#fafafa] ${urgencyColors[r.urgency] ?? ''}`}>
                  {/* Rank */}
                  <div className="w-6 h-6 rounded-full bg-[#f1f5f9] flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-[9px] font-black text-[#64748b]">{r.priority_rank}</span>
                  </div>

                  {/* Customer + action */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-xs text-[#0f172a]">{r.customer_name}</span>
                      <span className={`inline-block text-[9px] font-black px-1.5 py-0.5 rounded ${tierColors[r.customer_risk_tier] ?? tierColors.unknown}`}>
                        {tierLabels[r.customer_risk_tier] ?? '—'}
                      </span>
                    </div>
                    <div className="text-[10px] text-[#64748b] mt-0.5">{r.recommended_action}</div>
                    <div className="flex items-center gap-3 mt-0.5 text-[10px] text-[#94a3b8]">
                      <span>{r.sale_date}</span>
                      {r.days_overdue !== null && r.days_overdue > 0 && (
                        <span className="text-neg font-semibold">{r.days_overdue} gün gecikmiş</span>
                      )}
                    </div>
                  </div>

                  {/* Amount */}
                  <div className="text-right shrink-0">
                    <div className={`font-black tabular-nums text-sm ${
                      r.urgency === 'critical' ? 'text-neg' :
                      r.urgency === 'urgent'   ? 'text-warn-text' : 'text-[#0f172a]'
                    }`}>{fmt(r.outstanding_try)}</div>
                    <div className="text-[9px] text-[#94a3b8] tabular-nums">Skor: {r.collection_score}/100</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

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
