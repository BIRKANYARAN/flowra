'use client'
// ── TaxComplianceClient — Vergi Uyum Takvimi ─────────────────────────────────
//
// Client island: fetches /api/finance/tax-compliance via TanStack Query.
//
// Displays:
//   - "Vergi Uyum Takvimi" header
//   - Current month KDV card (amount, due date, status badge)
//   - Current quarter Geçici Vergi card (amount, due date, status badge)
//   - Next 3 upcoming obligations list
//   - Penalty preview section (only if overdue)

import { useQuery }   from '@tanstack/react-query'
import { fmtTRY, fmtDate } from '@/lib/format'
import type { TaxComplianceReport } from '@/lib/services/finance/tax-compliance.service'

// ── Status badge helpers ──────────────────────────────────────────────────────

type ObligStatus = 'paid' | 'due_soon' | 'overdue' | 'upcoming'

function statusBadgeCls(status: ObligStatus): string {
  switch (status) {
    case 'overdue':  return 'bg-neg-light text-neg-text border-neg-light'
    case 'due_soon': return 'bg-warn-light text-warn-text border-warn-light'
    case 'paid':     return 'bg-pos-light text-pos-text border-pos-light'
    default:         return 'bg-[#f1f5f9] text-[#64748b] border-[#e8eaef]'
  }
}

function statusBadgeLabel(status: ObligStatus): string {
  switch (status) {
    case 'overdue':  return 'Vadesi Geçti'
    case 'due_soon': return '7 Gün İçinde'
    case 'paid':     return 'Ödendi'
    default:         return 'Bekliyor'
  }
}

function kdvStatusLabel(status: 'payable' | 'credit' | 'zero'): string {
  switch (status) {
    case 'payable': return 'Ödenecek KDV'
    case 'credit':  return 'Devir Kredisi'
    default:        return 'Sıfır KDV'
  }
}

function kdvAmountColor(status: 'payable' | 'credit' | 'zero', obligStatus: ObligStatus): string {
  if (obligStatus === 'overdue') return 'text-neg'
  if (status === 'payable')      return 'text-warn-text'
  if (status === 'credit')       return 'text-pos-text'
  return 'text-[#64748b]'
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft overflow-hidden shadow-sm">
      <div className="px-4 py-3 border-b border-[#e8eaef]">
        <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">
          Vergi Uyum Takvimi
        </div>
      </div>
      <div className="px-4 py-8 text-center">
        <div className="text-xs text-[#94a3b8] animate-pulse">Yükleniyor…</div>
      </div>
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  companyId: string
}

export function TaxComplianceClient({ companyId }: Props) {
  const { data, isLoading, isError } = useQuery<{ report: TaxComplianceReport }>({
    queryKey: ['tax-compliance', companyId],
    queryFn: async () => {
      const res = await fetch('/api/finance/tax-compliance')
      if (!res.ok) throw new Error('Vergi uyum takvimi yüklenemedi')
      return res.json()
    },
    staleTime: 1000 * 60 * 30, // 30 min
  })

  if (isLoading) return <LoadingSkeleton />

  // Guard the NESTED field, not just `data`: a 200 response without `report`
  // (e.g. an error-shaped body) would otherwise crash on `report.current_month_kdv`
  // below and bubble to the route error boundary as a full-page "Bir hata oluştu".
  if (isError || !data?.report?.current_month_kdv) {
    return (
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-[#e8eaef]">
          <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">
            Vergi Uyum Takvimi
          </div>
        </div>
        <div className="px-4 py-6 text-center">
          <p className="text-xs text-[#94a3b8]">Vergi uyum takvimi yüklenemedi</p>
        </div>
      </div>
    )
  }

  const { report } = data
  const kdv        = report.current_month_kdv
  const gecici     = report.ytd_gecici_vergi
  const penalty    = report.penalty_preview

  return (
    <div className="space-y-3">

      {/* ── Overdue penalty banner ─────────────────────────────────────────── */}
      {kdv.obligation_status === 'overdue' && penalty && (
        <div className="bg-neg-light border border-neg rounded px-4 py-3 flex items-start gap-3">
          <span className="w-1.5 h-1.5 rounded-full bg-neg shrink-0 mt-1.5" />
          <div className="text-xs text-neg-text">
            <span className="font-black">KDV vadesi geçmiş.</span>
            {' '}Ceza ve faiz dahil tahmini toplam:{' '}
            <strong>{fmtTRY(penalty.total)}</strong>
            {' '}(anapara: {fmtTRY(penalty.principal)}, faiz: {fmtTRY(penalty.interest)}, ceza: {fmtTRY(penalty.penalty)})
          </div>
        </div>
      )}

      {/* ── Main card ────────────────────────────────────────────────────────── */}
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft overflow-hidden shadow-sm">

        {/* Header */}
        <div className="px-4 py-3 border-b border-[#e8eaef]">
          <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">
            Vergi Uyum Takvimi
          </div>
          <p className="text-[10px] text-[#94a3b8] mt-0.5">
            KDV · Geçici Vergi · Türkiye vergi takvimi
          </p>
        </div>

        {/* 2-column obligation cards */}
        <div className="grid grid-cols-2 gap-0 border-b border-[#e8eaef]">

          {/* Current month KDV card */}
          <div className="p-4 border-r border-[#e8eaef]">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">
                KDV — Bu Ay
              </div>
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${statusBadgeCls(kdv.obligation_status)}`}>
                {statusBadgeLabel(kdv.obligation_status)}
              </span>
            </div>

            <div className={`text-2xl font-extrabold tabular-nums leading-none mb-1 ${kdvAmountColor(kdv.status, kdv.obligation_status)}`}>
              {kdv.kdv_payable !== 0
                ? fmtTRY(Math.abs(kdv.kdv_payable))
                : '₺0'
              }
            </div>
            <div className="text-[10px] text-[#64748b] mb-2">
              {kdvStatusLabel(kdv.status)}
            </div>

            <div className="space-y-1 text-[10px]">
              <div className="flex justify-between">
                <span className="text-[#94a3b8]">Hesaplanan KDV</span>
                <span className="tabular-nums font-semibold text-warn-text">{fmtTRY(kdv.output_kdv)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#94a3b8]">İndirilecek KDV</span>
                <span className="tabular-nums font-semibold text-pos-text">−{fmtTRY(kdv.input_kdv)}</span>
              </div>
              <div className="flex justify-between border-t border-[#f1f5f9] pt-1">
                <span className="text-[#64748b] font-semibold">Son Beyan</span>
                <span className="tabular-nums text-[#1e293b] font-bold">{fmtDate(kdv.due_date)}</span>
              </div>
            </div>
          </div>

          {/* Current quarter Geçici Vergi card */}
          <div className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">
                Geçici Vergi — Q{gecici.current_quarter}
              </div>
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${statusBadgeCls(gecici.obligation_status)}`}>
                {statusBadgeLabel(gecici.obligation_status)}
              </span>
            </div>

            <div className={`text-2xl font-extrabold tabular-nums leading-none mb-1 ${
              gecici.obligation_status === 'overdue' ? 'text-neg' :
              gecici.estimated_tax > 0 ? 'text-warn-text' :
              'text-[#64748b]'
            }`}>
              {gecici.estimated_tax > 0
                ? fmtTRY(gecici.estimated_tax)
                : '—'
              }
            </div>
            <div className="text-[10px] text-[#64748b] mb-2">
              %25 kurumlar vergisi tahmini
            </div>

            <div className="space-y-1 text-[10px]">
              <div className="flex justify-between">
                <span className="text-[#94a3b8]">YTD Net Kâr</span>
                <span className={`tabular-nums font-semibold ${gecici.ytd_net_profit >= 0 ? 'text-pos-text' : 'text-neg'}`}>
                  {fmtTRY(gecici.ytd_net_profit)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#94a3b8]">Vergi Oranı</span>
                <span className="tabular-nums text-[#64748b]">%25</span>
              </div>
              <div className="flex justify-between border-t border-[#f1f5f9] pt-1">
                <span className="text-[#64748b] font-semibold">Son Ödeme</span>
                <span className="tabular-nums text-[#1e293b] font-bold">{fmtDate(gecici.due_date)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Next 3 obligations list */}
        <div>
          <div className="px-4 py-2 bg-[#f8fafc] border-b border-[#e8eaef]">
            <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">
              Sonraki Yükümlülükler
            </div>
          </div>
          <div className="divide-y divide-[#f1f5f9]">
            {report.next_3_obligations.map((ob, i) => {
              const isOverdue  = ob.status === 'overdue'
              const isDueSoon  = ob.status === 'due_soon'
              const rowBg = isOverdue ? 'bg-neg-light/20' : isDueSoon ? 'bg-warn-light/10' : ''
              const dateTone  = isOverdue
                ? 'text-neg-text font-black'
                : isDueSoon
                ? 'text-warn-text font-bold'
                : 'text-[#64748b]'

              return (
                <div key={i} className={`px-4 py-2.5 flex items-center justify-between gap-3 ${rowBg}`}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-[#1e293b]">{ob.label}</span>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${statusBadgeCls(ob.status)}`}>
                        {statusBadgeLabel(ob.status)}
                      </span>
                    </div>
                    <div className={`text-[10px] mt-0.5 ${dateTone}`}>
                      Son gün: {fmtDate(ob.due_date)}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    {ob.estimated_amount !== null && ob.estimated_amount > 0 ? (
                      <span className={`text-sm font-extrabold tabular-nums ${
                        isOverdue ? 'text-neg' : isDueSoon ? 'text-warn-text' : 'text-[#1e293b]'
                      }`}>
                        {fmtTRY(ob.estimated_amount)}
                      </span>
                    ) : (
                      <span className="text-xs text-[#94a3b8] italic">Hesaplanıyor</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Penalty preview — only when overdue */}
        {penalty && (
          <div className="border-t border-[#e8eaef]">
            <div className="px-4 py-2 bg-neg-light/30 border-b border-[#e8eaef]">
              <div className="text-[0.65rem] font-bold uppercase tracking-wider text-neg-text">
                Gecikme Cezası Tahmini
              </div>
            </div>
            <div className="grid grid-cols-4 gap-0">
              {[
                { label: 'Anapara',   value: penalty.principal, cls: 'text-[#1e293b]'  },
                { label: 'Faiz',      value: penalty.interest,  cls: 'text-warn-text'  },
                { label: 'Ceza',      value: penalty.penalty,   cls: 'text-neg'        },
                { label: 'Toplam',    value: penalty.total,     cls: 'text-neg font-black' },
              ].map((item, i) => (
                <div
                  key={item.label}
                  className={`p-3 ${i < 3 ? 'border-r border-[#e8eaef]' : ''}`}
                >
                  <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-1">
                    {item.label}
                  </div>
                  <div className={`text-sm font-extrabold tabular-nums ${item.cls}`}>
                    {fmtTRY(item.value)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
