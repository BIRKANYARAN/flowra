'use client'
// ── RevenueForecastClient — Revenue Forecast (3/6-month) ──────────────────────
// Fetches /api/commercial/revenue-forecast via TanStack Query.
// Features:
//   • History selector: 3 / 6 / 12 months
//   • Inline CSS bar chart for historical revenue
//   • 3-month forecast table with base/optimistic/pessimistic columns
//   • 6-month forecast summary bars
//   • Confidence badge + R² display
//   • Turkish narrative
//   • Loading skeleton + empty state

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type {
  RevenueForecastReport,
} from '@/lib/services/commercial/revenue-forecast.service'

// ── Formatters ────────────────────────────────────────────────────────────────

const TRY_FMT = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 })
const PCT_FMT = new Intl.NumberFormat('tr-TR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

function fmtTRY(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `₺${(n / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000)     return `₺${(n / 1_000).toFixed(1)}K`
  return `₺${TRY_FMT.format(Math.round(n))}`
}

function fmtPct(n: number): string {
  return `%${PCT_FMT.format(n)}`
}

function fmtMonth(yyyyMM: string): string {
  const [y, m] = yyyyMM.split('-').map(Number)
  const TR_MONTHS = [
    'Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz',
    'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara',
  ]
  return `${TR_MONTHS[m - 1]} ${y}`
}

// ── Confidence badge config ───────────────────────────────────────────────────

const CONF_CFG = {
  high:         { label: 'Yüksek Güven',   bg: 'bg-emerald-100', text: 'text-emerald-800' },
  medium:       { label: 'Orta Güven',     bg: 'bg-teal-100',    text: 'text-teal-700'    },
  low:          { label: 'Düşük Güven',    bg: 'bg-yellow-100',  text: 'text-yellow-700'  },
  insufficient: { label: 'Yetersiz Veri',  bg: 'bg-red-100',     text: 'text-red-700'     },
} as const

type Confidence = keyof typeof CONF_CFG

// ── Bar chart ─────────────────────────────────────────────────────────────────

function InlineBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-4 bg-[#f1f5f9] rounded overflow-hidden">
        <div
          className={`h-full rounded ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-[#64748b] w-20 text-right">{fmtTRY(value)}</span>
    </div>
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-8 bg-[#e2e8f0] rounded w-48" />
      <div className="grid grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-24 bg-[#e2e8f0] rounded" />
        ))}
      </div>
      <div className="h-48 bg-[#e2e8f0] rounded" />
      <div className="h-32 bg-[#e2e8f0] rounded" />
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function RevenueForecastClient() {
  const [historyMonths, setHistoryMonths] = useState<3 | 6 | 12>(12)

  const { data, isLoading, isError } = useQuery<{ report: RevenueForecastReport }>({
    queryKey: ['revenue-forecast', historyMonths],
    queryFn: async () => {
      const res = await fetch(`/api/commercial/revenue-forecast?history_months=${historyMonths}`)
      if (!res.ok) throw new Error('Forecast yüklenemedi')
      return res.json()
    },
    staleTime: 60 * 60 * 1000,
  })

  const report = data?.report

  // Max value for bar scaling
  const allHistoricalMax = Math.max(
    ...(report?.historical_monthly.map(m => m.revenue) ?? [1]),
    1,
  )
  const allForecastMax = Math.max(
    ...(report?.forecast_6m.map(m => m.optimistic) ?? [1]),
    1,
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[#1e293b]">Gelir Tahmini</h2>
          {report && (
            <p className="text-sm text-[#64748b] mt-0.5">
              {report.history_months} aylık geçmişe dayalı — {fmtMonth(report.current_month)} itibarıyla
            </p>
          )}
        </div>
        {/* History selector */}
        <div className="flex gap-1">
          {([3, 6, 12] as const).map(m => (
            <button
              key={m}
              onClick={() => setHistoryMonths(m)}
              className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                historyMonths === m
                  ? 'bg-[#1e293b] text-white border-[#1e293b]'
                  : 'text-[#64748b] border-[#e2e8f0] hover:border-[#94a3b8]'
              }`}
            >
              {m}A
            </button>
          ))}
        </div>
      </div>

      {isLoading && <Skeleton />}

      {isError && (
        <div className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-lg">
          Gelir tahmini yüklenirken hata oluştu.
        </div>
      )}

      {report && (
        <>
          {/* KPI strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white border border-[#e2e8f0] rounded-xl p-4">
              <p className="text-xs text-[#64748b] mb-1">3A Tahmin (Baz)</p>
              <p className="text-xl font-bold text-[#1e293b]">{fmtTRY(report.forecast_3m_total_base)}</p>
            </div>
            <div className="bg-white border border-[#e2e8f0] rounded-xl p-4">
              <p className="text-xs text-[#64748b] mb-1">6A Tahmin (Baz)</p>
              <p className="text-xl font-bold text-[#1e293b]">{fmtTRY(report.forecast_6m_total_base)}</p>
            </div>
            <div className="bg-white border border-[#e2e8f0] rounded-xl p-4">
              <p className="text-xs text-[#64748b] mb-1">Aylık Trend</p>
              <p className={`text-xl font-bold ${
                (report.trend_slope ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-500'
              }`}>
                {report.trend_slope !== null
                  ? `${(report.trend_slope ?? 0) >= 0 ? '+' : ''}${fmtTRY(report.trend_slope ?? 0)}`
                  : '—'}
              </p>
            </div>
            <div className="bg-white border border-[#e2e8f0] rounded-xl p-4">
              <p className="text-xs text-[#64748b] mb-1">CMGR</p>
              <p className={`text-xl font-bold ${
                (report.cmgr ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-500'
              }`}>
                {report.cmgr !== null
                  ? `${(report.cmgr * 100) >= 0 ? '+' : ''}${fmtPct(report.cmgr * 100)}`
                  : '—'}
              </p>
            </div>
          </div>

          {/* Confidence + R² */}
          <div className="flex items-center gap-3 flex-wrap">
            {(() => {
              const cfg = CONF_CFG[report.forecast_confidence as Confidence] ?? CONF_CFG.low
              return (
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
                  {cfg.label}
                </span>
              )
            })()}
            {report.r_squared !== null && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-[#f1f5f9] text-[#475569]">
                R² = {report.r_squared.toFixed(2)}
              </span>
            )}
            {report.history_months > 0 && (
              <span className="text-xs text-[#94a3b8]">
                {report.history_months} ay geçmiş verisi
              </span>
            )}
          </div>

          {/* Narrative */}
          <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded-xl px-4 py-3">
            <p className="text-sm text-[#475569] leading-relaxed">{report.narrative}</p>
          </div>

          {/* Historical chart */}
          <div className="bg-white border border-[#e2e8f0] rounded-xl p-5">
            <h3 className="text-sm font-semibold text-[#1e293b] mb-4">Geçmiş Gelir (Son 6 Ay)</h3>
            <div className="space-y-2">
              {report.historical_monthly.map(row => (
                <div key={row.month} className="flex items-center gap-3">
                  <span className="text-xs text-[#64748b] w-16 shrink-0">{fmtMonth(row.month)}</span>
                  <div className="flex-1">
                    <InlineBar value={row.revenue} max={allHistoricalMax} color="bg-[#3b82f6]" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 3-month forecast table */}
          <div className="bg-white border border-[#e2e8f0] rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[#f1f5f9]">
              <h3 className="text-sm font-semibold text-[#1e293b]">3 Aylık Tahmin</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#f8fafc] text-xs text-[#64748b]">
                    <th className="px-4 py-2 text-left font-medium">Ay</th>
                    <th className="px-4 py-2 text-right font-medium">Kötümser</th>
                    <th className="px-4 py-2 text-right font-medium">Baz</th>
                    <th className="px-4 py-2 text-right font-medium">İyimser</th>
                    <th className="px-4 py-2 text-right font-medium">CI Alt</th>
                    <th className="px-4 py-2 text-right font-medium">CI Üst</th>
                  </tr>
                </thead>
                <tbody>
                  {report.forecast_3m.map((row, i) => (
                    <tr key={row.month} className={i % 2 === 0 ? 'bg-white' : 'bg-[#f8fafc]'}>
                      <td className="px-4 py-2 font-medium text-[#1e293b]">{fmtMonth(row.month)}</td>
                      <td className="px-4 py-2 text-right text-red-500">{fmtTRY(row.pessimistic)}</td>
                      <td className="px-4 py-2 text-right font-semibold text-[#1e293b]">{fmtTRY(row.base)}</td>
                      <td className="px-4 py-2 text-right text-emerald-600">{fmtTRY(row.optimistic)}</td>
                      <td className="px-4 py-2 text-right text-[#94a3b8] text-xs">{fmtTRY(row.confidence_interval.lower)}</td>
                      <td className="px-4 py-2 text-right text-[#94a3b8] text-xs">{fmtTRY(row.confidence_interval.upper)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-[#f1f5f9] font-semibold text-[#1e293b]">
                    <td className="px-4 py-2">Toplam (Baz)</td>
                    <td className="px-4 py-2 text-right text-red-500">{fmtTRY(report.forecast_3m.reduce((s, r) => s + r.pessimistic, 0))}</td>
                    <td className="px-4 py-2 text-right">{fmtTRY(report.forecast_3m_total_base)}</td>
                    <td className="px-4 py-2 text-right text-emerald-600">{fmtTRY(report.forecast_3m.reduce((s, r) => s + r.optimistic, 0))}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* 6-month forecast bars */}
          <div className="bg-white border border-[#e2e8f0] rounded-xl p-5">
            <h3 className="text-sm font-semibold text-[#1e293b] mb-4">6 Aylık Tahmin (Baz Senaryo)</h3>
            <div className="space-y-2">
              {report.forecast_6m.map(row => (
                <div key={row.month} className="flex items-center gap-3">
                  <span className="text-xs text-[#64748b] w-16 shrink-0">{fmtMonth(row.month)}</span>
                  <div className="flex-1">
                    <InlineBar value={row.base} max={allForecastMax} color="bg-[#8b5cf6]" />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-3 border-t border-[#f1f5f9] flex justify-between text-sm">
              <span className="text-[#64748b]">6A Toplam (Baz)</span>
              <span className="font-semibold text-[#1e293b]">{fmtTRY(report.forecast_6m_total_base)}</span>
            </div>
          </div>
        </>
      )}

      {!isLoading && !isError && !report && (
        <div className="text-center py-12 text-[#94a3b8]">
          <p className="text-sm">Gelir tahmini için yeterli veri bulunamadı.</p>
        </div>
      )}
    </div>
  )
}
