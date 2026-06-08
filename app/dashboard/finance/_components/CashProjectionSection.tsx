'use client'

// ─────────────────────────────────────────────────────────────────────────────
// CashProjectionSection — 90 Günlük Nakit Projeksiyonu
//
// 13-week forward-looking cash flow projection.
// Combines committed pipeline (receivables + payables) with statistical estimates.
// Uses TanStack Query to fetch from /api/finance/cash-projection.
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery } from '@tanstack/react-query'
import { fmtTRY as fmt } from '@/lib/format'
import type { CashProjectionReport, ProjectionWeek } from '@/lib/services/finance/cash-projection.service'

interface ApiResponse {
  report: CashProjectionReport
}

const CONFIDENCE_STYLES: Record<ProjectionWeek['confidence'], { bg: string; text: string; label: string }> = {
  high:   { bg: 'bg-pos-light',  text: 'text-pos-text',  label: 'Yüksek' },
  medium: { bg: 'bg-warn-light', text: 'text-warn-text', label: 'Orta'   },
  low:    { bg: 'bg-[#f1f5f9]',  text: 'text-[#64748b]', label: 'Düşük'  },
}

export function CashProjectionSection() {
  const { data, isLoading, isError } = useQuery<ApiResponse>({
    queryKey: ['cash-projection'],
    queryFn: async () => {
      const res = await fetch('/api/finance/cash-projection')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  if (isLoading) {
    return (
      <div className="bg-white border border-[#e2e8f0] rounded-xl shadow-soft overflow-hidden shadow-sm animate-pulse">
        <div className="px-4 py-3 border-b border-[#e2e8f0]">
          <div className="h-3 bg-[#f1f5f9] rounded w-56" />
        </div>
        <div className="p-4 space-y-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-8 bg-[#f1f5f9] rounded" />
          ))}
        </div>
      </div>
    )
  }

  if (isError || !data?.report) {
    return (
      <div className="bg-white border border-[#e2e8f0] rounded-xl shadow-soft p-4 shadow-sm">
        <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-2">
          90 Günlük Nakit Projeksiyonu
        </div>
        <div className="text-xs text-neg-text bg-neg-light border border-neg-light rounded px-3 py-2">
          Projeksiyon verisi yüklenemedi. Lütfen sayfayı yenileyin.
        </div>
      </div>
    )
  }

  const r = data.report

  return (
    <div className="bg-white border border-[#e2e8f0] rounded-xl shadow-soft overflow-hidden shadow-sm">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#e2e8f0]">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
              90 Günlük Nakit Projeksiyonu
            </div>
            <p className="text-[10px] text-[#94a3b8] mt-0.5">
              {r.as_of_date} itibarıyla — 13 haftalık taahhütlü + istatistiksel tahmin
            </p>
          </div>
          <span className={`text-xs font-bold px-2.5 py-1 rounded ${
            r.projected_closing_cash >= 0
              ? 'bg-pos-light text-pos-text'
              : 'bg-neg-light text-neg-text'
          }`}>
            Kapanış: {fmt(r.projected_closing_cash)}
          </span>
        </div>
      </div>

      {/* KPI chips */}
      <div className="grid grid-cols-3 divide-x divide-[#e2e8f0] border-b border-[#e2e8f0]">
        {[
          {
            label: 'Açılış Nakit',
            value: fmt(r.opening_cash),
            tone: r.opening_cash >= 0 ? 'text-pos-text' : 'text-neg',
          },
          {
            label: 'Kapanış Nakiti (90G)',
            value: fmt(r.projected_closing_cash),
            tone: r.projected_closing_cash >= 0 ? 'text-pos-text' : 'text-neg',
          },
          {
            label: 'Kritik Eşik (2 Haftalık Gider)',
            value: fmt(r.critical_threshold_try),
            tone: r.is_below_critical ? 'text-neg' : 'text-[#94a3b8]',
          },
        ].map(chip => (
          <div key={chip.label} className="px-4 py-3">
            <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">
              {chip.label}
            </div>
            <div className={`text-base font-black tabular-nums leading-none ${chip.tone}`}>
              {chip.value}
            </div>
          </div>
        ))}
      </div>

      {/* Warning banner */}
      {r.is_below_critical && (
        <div className="mx-4 mt-3 bg-neg-light border border-neg-light rounded px-3 py-2.5 text-xs text-neg-text font-semibold">
          Kritik nakit seviyesine yaklasiyor — {r.lowest_cash_week + 1}. haftada en düsük nokta ({fmt(r.lowest_cash_point)})
        </div>
      )}

      {/* 13-week table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-[#f8fafc] border-b border-t border-[#e2e8f0] mt-3">
              <th className="text-left px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Hafta</th>
              <th className="text-right px-3 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-pos">Taahhütlü Giriş</th>
              <th className="text-right px-3 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-neg">Taahhütlü Çıkış</th>
              <th className="text-right px-3 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-[#64748b]">Net Akış</th>
              <th className="text-right px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-[#0f172a]">Kümülatif</th>
              <th className="text-center px-3 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Güven</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f1f5f9]">
            {r.weeks.map((week, i) => {
              const isNeg = week.cumulative_cash < 0
              const conf  = CONFIDENCE_STYLES[week.confidence]
              return (
                <tr
                  key={week.week_start}
                  className={`hover:bg-[#f8fafc]/60 ${isNeg ? 'bg-neg-light/20' : ''}`}
                >
                  <td className="px-4 py-2 font-semibold text-[#334155]">
                    <span className="font-black text-[#0f172a]">{week.week_label}</span>
                    <span className="ml-1.5 text-[10px] text-[#94a3b8] font-normal">{week.week_start.slice(5)}</span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {week.inflow_committed > 0
                      ? <span className="text-pos-text font-semibold">{fmt(week.inflow_committed)}</span>
                      : <span className="text-[#cbd5e1]">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {week.outflow_committed > 0
                      ? <span className="text-neg font-semibold">{fmt(week.outflow_committed)}</span>
                      : <span className="text-[#cbd5e1]">—</span>}
                  </td>
                  <td className={`px-3 py-2 text-right font-mono font-bold tabular-nums ${
                    week.net_cash_flow > 0 ? 'text-pos-text' :
                    week.net_cash_flow < 0 ? 'text-neg' : 'text-[#94a3b8]'
                  }`}>
                    {fmt(week.net_cash_flow)}
                  </td>
                  <td className={`px-4 py-2 text-right font-black tabular-nums ${
                    isNeg ? 'text-neg-text bg-neg-light/40 rounded' : 'text-[#0f172a]'
                  }`}>
                    {fmt(week.cumulative_cash)}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded ${conf.bg} ${conf.text}`}>
                      {conf.label}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Footer: committed vs estimated breakdown */}
      <div className="border-t border-[#e2e8f0] px-4 py-3 bg-[#f8fafc]">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Taahhütlü Giriş',    value: r.total_committed_inflow,   tone: 'text-pos-text' },
            { label: 'Tahmini Giriş',       value: r.total_estimated_inflow,   tone: 'text-pos-text opacity-60' },
            { label: 'Taahhütlü Çıkış',     value: r.total_committed_outflow,  tone: 'text-neg' },
            { label: 'Tahmini Çıkış',       value: r.total_estimated_outflow,  tone: 'text-neg opacity-60' },
          ].map(item => (
            <div key={item.label}>
              <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">{item.label}</div>
              <div className={`text-sm font-black tabular-nums leading-none mt-0.5 ${item.tone}`}>
                {fmt(item.value)}
              </div>
            </div>
          ))}
        </div>
        {r.negative_cash_weeks.length > 0 && (
          <div className="mt-2 text-[10px] text-neg-text font-semibold">
            Negatif nakit: H{r.negative_cash_weeks.map(i => i + 1).join(', H')} haftalarda
          </div>
        )}
      </div>
    </div>
  )
}
