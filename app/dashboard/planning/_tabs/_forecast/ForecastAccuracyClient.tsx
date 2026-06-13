'use client'
// ── ForecastAccuracyClient — Tahmin Doğruluk Analizi ─────────────────────────
//
// Displays MAPE, hit rate, bias, and improvement trend KPI cards,
// a 12-month variance table, and a summary footer.

import { useQuery } from '@tanstack/react-query'
import { fmtTRY, fmtPct } from '@/lib/format'
import type {
  ForecastAccuracyClass,
  ForecastBiasClass,
  ForecastImprovementTrend,
  MonthlyVarianceEntry,
} from '@/lib/services/planning/forecast-accuracy.service'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ForecastReport {
  last_12_months: {
    mape_pct:           number | null
    bias:               number | null
    accuracy_class:     ForecastAccuracyClass
    bias_class:         ForecastBiasClass
    hit_rate_pct:       number | null
    improvement_trend:  ForecastImprovementTrend
  }
  monthly_variances: MonthlyVarianceEntry[]
  summary: {
    best_month:      string | null
    worst_month:     string | null
    total_forecast:  number
    total_actual:    number
    total_error:     number
  }
}

interface Props {
  companyId: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const MONTH_NAMES_TR: Record<string, string> = {
  '01': 'Ocak',    '02': 'Şubat',   '03': 'Mart',
  '04': 'Nisan',   '05': 'Mayıs',   '06': 'Haziran',
  '07': 'Temmuz',  '08': 'Ağustos', '09': 'Eylül',
  '10': 'Ekim',    '11': 'Kasım',   '12': 'Aralık',
}

function monthLabel(key: string): string {
  const parts = key.split('-')
  const m     = parts[1] ?? ''
  const y     = parts[0] ?? ''
  return `${MONTH_NAMES_TR[m] ?? m} ${y}`
}

function accuracyLabel(cls: ForecastAccuracyClass): string {
  switch (cls) {
    case 'excellent':         return 'Mükemmel'
    case 'good':              return 'İyi'
    case 'acceptable':        return 'Kabul Edilebilir'
    case 'poor':              return 'Zayıf'
    case 'unreliable':        return 'Güvenilmez'
    case 'insufficient_data': return 'Veri Yok'
  }
}

function accuracyColor(cls: ForecastAccuracyClass): string {
  switch (cls) {
    case 'excellent':
    case 'good':              return 'text-pos-text'
    case 'acceptable':        return 'text-warn-text'
    case 'poor':
    case 'unreliable':        return 'text-neg-text'
    default:                  return 'text-[#94a3b8]'
  }
}

function biasLabel(cls: ForecastBiasClass): string {
  switch (cls) {
    case 'unbiased':          return 'Tarafsız'
    case 'over_forecast':     return 'Aşırı Tahmin'
    case 'under_forecast':    return 'Düşük Tahmin'
    case 'insufficient_data': return 'Veri Yok'
  }
}

function biasColor(cls: ForecastBiasClass): string {
  switch (cls) {
    case 'unbiased':          return 'text-pos-text'
    case 'over_forecast':
    case 'under_forecast':    return 'text-warn-text'
    default:                  return 'text-[#94a3b8]'
  }
}

function trendLabel(trend: ForecastImprovementTrend): string {
  switch (trend) {
    case 'improving':         return 'İyileşiyor'
    case 'stable':            return 'Stabil'
    case 'deteriorating':     return 'Kötüleşiyor'
    case 'insufficient_data': return 'Veri Yok'
  }
}

function trendColor(trend: ForecastImprovementTrend): string {
  switch (trend) {
    case 'improving':         return 'text-pos-text'
    case 'stable':            return 'text-[#64748b]'
    case 'deteriorating':     return 'text-neg-text'
    default:                  return 'text-[#94a3b8]'
  }
}

// ── Fetcher ───────────────────────────────────────────────────────────────────

async function fetchForecastAccuracy(): Promise<ForecastReport> {
  const res = await fetch('/api/planning/forecast-accuracy')
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`)
  }
  const data = await res.json() as { report: ForecastReport }
  return data.report
}

// ── Main component ────────────────────────────────────────────────────────────

export function ForecastAccuracyClient({ companyId }: Props) {
  const { data: report, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['forecast-accuracy', companyId],
    queryFn:  fetchForecastAccuracy,
    staleTime: 30 * 60 * 1000,
  })

  // ── Loading ───────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="grid grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-[#f1f5f9] rounded h-20" />
          ))}
        </div>
        <div className="bg-[#f1f5f9] rounded h-64" />
        <div className="bg-[#f1f5f9] rounded h-16" />
      </div>
    )
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (isError || !report) {
    return (
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft p-6 text-center text-xs text-[#94a3b8]">
        <p className="mb-3">Tahmin doğruluk verisi yüklenemedi.</p>
        <button
          onClick={() => refetch()}
          className="text-xs text-brand-light font-semibold hover:underline"
        >
          Yeniden Dene
        </button>
        {error instanceof Error && (
          <p className="mt-2 text-[10px] text-[#cbd5e1]">{error.message}</p>
        )}
      </div>
    )
  }

  const { last_12_months: stats, monthly_variances: variances, summary } = report

  // No forecast scenario ─────────────────────────────────────────────────────
  if (variances.length === 0) {
    return (
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft p-8 text-center space-y-2">
        <p className="text-sm font-semibold text-[#334155]">Baz Senaryo Bulunamadı</p>
        <p className="text-xs text-[#94a3b8]">
          Tahmin doğruluğu hesaplamak için Senaryolar sekmesinde bir baz senaryo işaretleyin.
        </p>
      </div>
    )
  }

  // ── KPI cards ─────────────────────────────────────────────────────────────
  const mapeDisplay = stats.mape_pct !== null
    ? `%${stats.mape_pct.toFixed(1)}`
    : '—'

  const hitRateDisplay = stats.hit_rate_pct !== null
    ? `%${stats.hit_rate_pct.toFixed(0)}`
    : '—'

  const biasDisplay = stats.bias !== null
    ? (stats.bias >= 0 ? `+${fmtTRY(stats.bias)}` : fmtTRY(stats.bias))
    : '—'

  const errorSign = summary.total_error >= 0 ? '+' : ''

  return (
    <div className="space-y-5">

      {/* Header */}
      <div>
        <h2 className="text-sm font-bold text-[#0f172a] tracking-tight">
          Tahmin Doğruluk Analizi
        </h2>
        <p className="text-[10px] text-[#94a3b8] mt-0.5">
          Son 12 ay · Baz senaryo vs gerçekleşen gelir
        </p>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {/* MAPE */}
        <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft p-4 space-y-1">
          <div className="text-[10px] font-bold uppercase tracking-widest text-[#94a3b8]">
            MAPE
          </div>
          <div className={`text-2xl font-bold tabular-nums ${accuracyColor(stats.accuracy_class)}`}>
            {mapeDisplay}
          </div>
          <div className="text-[10px] text-[#64748b]">
            {accuracyLabel(stats.accuracy_class)}
          </div>
        </div>

        {/* Hit rate */}
        <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft p-4 space-y-1">
          <div className="text-[10px] font-bold uppercase tracking-widest text-[#94a3b8]">
            İsabet Oranı
          </div>
          <div className="text-2xl font-bold tabular-nums text-[#0f172a]">
            {hitRateDisplay}
          </div>
          <div className="text-[10px] text-[#64748b]">±10% tolerans</div>
        </div>

        {/* Bias */}
        <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft p-4 space-y-1">
          <div className="text-[10px] font-bold uppercase tracking-widest text-[#94a3b8]">
            Yanlılık
          </div>
          <div className={`text-2xl font-bold tabular-nums ${biasColor(stats.bias_class)}`}>
            {biasDisplay}
          </div>
          <div className="text-[10px] text-[#64748b]">
            {biasLabel(stats.bias_class)}
          </div>
        </div>

        {/* Trend */}
        <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft p-4 space-y-1">
          <div className="text-[10px] font-bold uppercase tracking-widest text-[#94a3b8]">
            Trend
          </div>
          <div className={`text-2xl font-bold ${trendColor(stats.improvement_trend)}`}>
            {stats.improvement_trend === 'improving'
              ? '↑'
              : stats.improvement_trend === 'deteriorating'
              ? '↓'
              : '→'}
          </div>
          <div className="text-[10px] text-[#64748b]">
            {trendLabel(stats.improvement_trend)}
          </div>
        </div>
      </div>

      {/* Monthly variance table */}
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft overflow-hidden">
        <div className="px-4 py-3 border-b border-[#f1f5f9] bg-[#f8fafc]">
          <span className="text-xs font-bold text-[#334155]">Aylık Tahmin Sapması</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#f1f5f9]">
                <th className="px-4 py-2 text-left font-bold text-[#64748b]">Dönem</th>
                <th className="px-3 py-2 text-right font-bold text-[#64748b]">Tahmin</th>
                <th className="px-3 py-2 text-right font-bold text-[#64748b]">Gerçekleşen</th>
                <th className="px-3 py-2 text-right font-bold text-[#64748b]">Sapma %</th>
                <th className="px-3 py-2 text-center font-bold text-[#64748b]">Durum</th>
              </tr>
            </thead>
            <tbody>
              {variances.map((v: MonthlyVarianceEntry) => {
                const isHit = v.error_pct !== null && Math.abs(v.error_pct) <= 10
                const errorPctDisplay = v.error_pct !== null
                  ? `${v.error_pct >= 0 ? '+' : ''}${fmtPct(v.error_pct)}`
                  : '—'
                const isHighlight =
                  v.month === summary.best_month || v.month === summary.worst_month

                return (
                  <tr
                    key={v.month}
                    className={`border-b border-[#f8fafc] transition-colors ${
                      isHighlight ? 'bg-[#f8fafc]' : 'hover:bg-[#fafafa]'
                    }`}
                  >
                    <td className="px-4 py-2 font-semibold text-[#334155]">
                      {monthLabel(v.month)}
                      {v.month === summary.best_month && (
                        <span className="ml-1 text-[9px] text-pos-text font-bold">BEST</span>
                      )}
                      {v.month === summary.worst_month && v.month !== summary.best_month && (
                        <span className="ml-1 text-[9px] text-neg-text font-bold">WORST</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#64748b]">
                      {fmtTRY(v.forecast)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-bold text-[#0f172a]">
                      {fmtTRY(v.actual)}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums font-bold ${
                      v.error_pct === null
                        ? 'text-[#94a3b8]'
                        : v.error_pct > 0
                        ? 'text-warn-text'
                        : 'text-neg-text'
                    }`}>
                      {errorPctDisplay}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {v.error_pct === null ? (
                        <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded bg-[#f8fafc] text-[#94a3b8]">—</span>
                      ) : isHit ? (
                        <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded bg-pos-light text-pos-text">
                          İsabet
                        </span>
                      ) : (
                        <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded bg-neg-light text-neg-text">
                          Sapma
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Summary footer */}
      <div className="bg-[#f8fafc] border border-[#e8eaef] rounded p-4 grid grid-cols-2 gap-4 sm:grid-cols-4 text-xs">
        <div>
          <div className="text-[10px] uppercase tracking-widest font-bold text-[#94a3b8] mb-0.5">
            Toplam Tahmin
          </div>
          <div className="font-bold tabular-nums text-[#334155]">
            {fmtTRY(summary.total_forecast)}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest font-bold text-[#94a3b8] mb-0.5">
            Toplam Gerçekleşen
          </div>
          <div className="font-bold tabular-nums text-[#334155]">
            {fmtTRY(summary.total_actual)}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest font-bold text-[#94a3b8] mb-0.5">
            Toplam Sapma
          </div>
          <div className={`font-bold tabular-nums ${
            summary.total_error > 0
              ? 'text-warn-text'
              : summary.total_error < 0
              ? 'text-neg-text'
              : 'text-[#334155]'
          }`}>
            {errorSign}{fmtTRY(summary.total_error)}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest font-bold text-[#94a3b8] mb-0.5">
            En İyi Ay
          </div>
          <div className="font-bold text-pos-text">
            {summary.best_month ? monthLabel(summary.best_month) : '—'}
          </div>
        </div>
      </div>

    </div>
  )
}
