'use client'

// ─────────────────────────────────────────────────────────────────────────────
// PeriodComparisonClient
//
// Period Performance Comparison dashboard — MoM, trend series, run rate.
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery }  from '@tanstack/react-query'
import { fmtTRY }    from '@/lib/format'
import type {
  PeriodComparisonReport,
  classifyGrowthDirection,
} from '@/lib/services/finance/period-comparison.service'

type GrowthDirection = ReturnType<typeof classifyGrowthDirection>

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtChangePct(pct: number | null): string {
  if (pct === null) return '—'
  const sign = pct > 0 ? '+' : ''
  return `${sign}${pct.toFixed(1)}%`
}

function growthBadge(dir: GrowthDirection): { label: string; cls: string } {
  switch (dir) {
    case 'strong_growth': return { label: '↑↑ Güçlü Büyüme', cls: 'bg-green-100 text-green-800 border-green-200' }
    case 'growth':        return { label: '↑ Büyüme',        cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
    case 'flat':          return { label: '→ Yatay',         cls: 'bg-slate-100 text-slate-600 border-slate-200' }
    case 'decline':       return { label: '↓ Düşüş',        cls: 'bg-orange-50 text-orange-700 border-orange-200' }
    case 'strong_decline':return { label: '↓↓ Sert Düşüş',  cls: 'bg-red-100 text-red-800 border-red-200' }
    default:              return { label: '— Veri Yok',      cls: 'bg-slate-50 text-slate-400 border-slate-200' }
  }
}

function changeColor(pct: number | null, lowerIsBetter = false): string {
  if (pct === null) return 'text-slate-400'
  const good = lowerIsBetter ? pct < 0 : pct > 0
  const bad  = lowerIsBetter ? pct > 0 : pct < 0
  return good ? 'text-green-700' : bad ? 'text-red-700' : 'text-slate-500'
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-4 bg-[#f1f5f9] rounded w-48" />
      <div className="h-20 bg-[#f1f5f9] rounded" />
      <div className="h-40 bg-[#f1f5f9] rounded" />
    </div>
  )
}

// ── Revenue sparkline ──────────────────────────────────────────────────────────

function RevenueSparkline({ series }: {
  series: PeriodComparisonReport['monthly_series']
}) {
  if (series.length === 0) return null
  const maxRev = Math.max(...series.map(m => m.revenue_try), 1)

  return (
    <div className="space-y-1">
      <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-2">
        Aylık Ciro Trendi
      </div>
      <div className="flex items-end gap-0.5 h-14">
        {series.map((m) => {
          const h = Math.max(2, (m.revenue_try / maxRev) * 100)
          const isLast = m === series[series.length - 1]
          return (
            <div
              key={m.period}
              className="flex-1 flex flex-col justify-end"
              title={`${m.period}: ${fmtTRY(m.revenue_try)}`}
            >
              <div
                className={`rounded-sm transition-all ${isLast ? 'bg-blue-600' : 'bg-blue-300'}`}
                style={{ height: `${h}%` }}
              />
            </div>
          )
        })}
      </div>
      <div className="flex justify-between text-[8px] text-[#94a3b8]">
        <span>{series[0]?.period ?? ''}</span>
        <span>{series[series.length - 1]?.period ?? ''}</span>
      </div>
    </div>
  )
}

// ── Metric row ─────────────────────────────────────────────────────────────────

function MetricRow({
  label,
  current,
  prior,
  changePct,
  lowerIsBetter = false,
}: {
  label: string
  current: string
  prior: string
  changePct: number | null
  lowerIsBetter?: boolean
}) {
  const pctCls = changeColor(changePct, lowerIsBetter)
  return (
    <tr className="border-b border-[#f1f5f9] hover:bg-[#fafafa]">
      <td className="py-2 pr-3 text-[11px] font-semibold text-[#1e293b]">{label}</td>
      <td className="py-2 px-2 text-right tabular-nums text-[11px] font-bold text-[#0f172a]">{current}</td>
      <td className="py-2 px-2 text-right tabular-nums text-[11px] text-[#64748b]">{prior}</td>
      <td className={`py-2 pl-2 text-right tabular-nums text-[11px] font-bold ${pctCls}`}>
        {fmtChangePct(changePct)}
      </td>
    </tr>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

interface Props {
  companyId: string
}

export function PeriodComparisonClient({ companyId }: Props) {
  const { data, isLoading, isError } = useQuery<{ report: PeriodComparisonReport }>({
    queryKey: ['period-comparison', companyId],
    queryFn:  async () => {
      const res = await fetch('/api/finance/period-comparison')
      if (!res.ok) throw new Error('Dönem karşılaştırma verisi yüklenemedi')
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  if (isLoading) return <Skeleton />
  if (isError || !data?.report) {
    return (
      <div className="text-center py-8 text-sm text-[#94a3b8]">
        Dönem karşılaştırma verisi yüklenirken hata oluştu.
      </div>
    )
  }

  const r = data.report
  const { current_period: cur, prior_period: pri, changes, run_rate, cmgr_3m, monthly_series, narrative } = r

  const badge = growthBadge(changes.growth_direction)

  return (
    <div className="space-y-5">

      {/* Header row */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">
            Dönem Performans Karşılaştırması
          </div>
          <div className="text-xs text-[#64748b] mt-0.5">
            {cur.label} / {pri.label}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] font-bold ${badge.cls}`}>
            {badge.label}
          </span>
          {cmgr_3m !== null && (
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded border text-[11px] font-bold ${cmgr_3m > 0 ? 'bg-green-50 text-green-700 border-green-200' : cmgr_3m < 0 ? 'bg-red-50 text-red-700 border-red-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
              <span className="text-[9px] uppercase tracking-widest opacity-60">CMGR 3A</span>
              {cmgr_3m > 0 ? '+' : ''}{(cmgr_3m * 100).toFixed(2)}%
            </span>
          )}
        </div>
      </div>

      {/* Narrative */}
      {narrative && (
        <p className="text-xs text-[#64748b] bg-[#f8fafc] rounded px-4 py-3 border border-[#e2e8f0] leading-relaxed">
          {narrative}
        </p>
      )}

      {/* Comparison table */}
      <div className="bg-white border border-[#e2e8f0] rounded shadow-sm overflow-hidden">
        <div className="px-4 py-2 border-b border-[#f1f5f9] bg-[#f8fafc]">
          <span className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">
            Aylık Karşılaştırma (MoM)
          </span>
        </div>
        <div className="px-4 py-1">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#e2e8f0]">
                <th className="text-left py-2 pr-3 text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">Metrik</th>
                <th className="text-right py-2 px-2 text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">{cur.label}</th>
                <th className="text-right py-2 px-2 text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">{pri.label}</th>
                <th className="text-right py-2 pl-2 text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">Δ%</th>
              </tr>
            </thead>
            <tbody>
              <MetricRow
                label="Gelir"
                current={fmtTRY(cur.revenue_try)}
                prior={fmtTRY(pri.revenue_try)}
                changePct={changes.revenue_change_pct}
              />
              <MetricRow
                label="Giderler"
                current={fmtTRY(cur.expenses_try)}
                prior={fmtTRY(pri.expenses_try)}
                changePct={changes.expense_change_pct}
                lowerIsBetter
              />
              <MetricRow
                label="Brüt Kâr"
                current={fmtTRY(cur.gross_profit_try)}
                prior={fmtTRY(pri.gross_profit_try)}
                changePct={changes.profit_change_pct}
              />
              <MetricRow
                label="Net Kâr"
                current={fmtTRY(cur.net_profit_try)}
                prior={fmtTRY(pri.net_profit_try)}
                changePct={changes.profit_change_pct}
              />
              {cur.gross_margin_pct !== null && pri.gross_margin_pct !== null && (
                <MetricRow
                  label="Brüt Marj"
                  current={`%${cur.gross_margin_pct.toFixed(1)}`}
                  prior={`%${pri.gross_margin_pct.toFixed(1)}`}
                  changePct={changes.gross_margin_change_ppt}
                />
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bottom: sparkline + run rate */}
      <div className="grid grid-cols-12 gap-4">

        {/* Sparkline */}
        <div className="col-span-8 bg-white border border-[#e2e8f0] rounded p-4 shadow-sm">
          <RevenueSparkline series={monthly_series} />
        </div>

        {/* Run rate */}
        <div className="col-span-4 bg-white border border-[#e2e8f0] rounded p-4 shadow-sm flex flex-col justify-center gap-1">
          <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">Yıllık Koşu Hızı</div>
          {run_rate !== null ? (
            <>
              <div className="text-xl font-black tabular-nums text-[#0f172a]">
                {fmtTRY(run_rate)}
              </div>
              <div className="text-[10px] text-[#64748b]">Mevcut tempoda yıllık gelir tahmini</div>
            </>
          ) : (
            <div className="text-sm text-[#94a3b8]">Hesaplanamadı</div>
          )}
          {r.rolling_3m.avg_revenue !== null && (
            <div className="mt-2 pt-2 border-t border-[#f1f5f9]">
              <div className="text-[9px] text-[#94a3b8] uppercase tracking-widest">3 Aylık Ort.</div>
              <div className="text-sm font-bold tabular-nums text-[#334155]">
                {fmtTRY(r.rolling_3m.avg_revenue)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
