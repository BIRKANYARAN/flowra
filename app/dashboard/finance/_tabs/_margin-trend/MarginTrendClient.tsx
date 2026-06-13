'use client'

// ─────────────────────────────────────────────────────────────────────────────
// MarginTrendClient
//
// Margin Trend Analysis dashboard — gross, operating, and net margin over 12
// months with anomaly indicators and Turkish SME benchmark comparison.
//
// Features:
//   - KPI tiles: latest gross / operating / net margin with avg and health badge
//   - Monthly CSS bar chart for gross margin trend (color-coded)
//   - Rolling average overlay line
//   - Anomaly month badges
//   - Benchmark gap indicator vs Turkish SME average
//   - Best / worst month highlights
//   - Turkish narrative summary
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery } from '@tanstack/react-query'
import type {
  MarginTrendReport,
  MonthlyMarginPoint,
} from '@/lib/services/finance/margin-trend.service'
import {
  TURKISH_SME_GROSS_MARGIN_BENCHMARK,
  TURKISH_SME_NET_MARGIN_BENCHMARK,
} from '@/lib/services/finance/margin-trend.service'

// ── Types ─────────────────────────────────────────────────────────────────────

type MarginTrend = 'expanding' | 'contracting' | 'volatile' | 'stable' | 'insufficient_data'
type MarginHealth = 'excellent' | 'strong' | 'adequate' | 'thin' | 'negative' | 'insufficient_data'

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtPct(v: number | null, decimals = 1): string {
  if (v === null) return '—'
  return `%${v.toFixed(decimals)}`
}

function fmtMonthShort(ym: string): string {
  const MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']
  const [, m] = ym.split('-')
  return MONTHS[(parseInt(m, 10) - 1)] ?? ym
}

// ── Trend badge ───────────────────────────────────────────────────────────────

const TREND_CONFIG: Record<MarginTrend, { label: string; cls: string; dot: string }> = {
  expanding:         { label: 'Genişliyor',        cls: 'bg-green-50 border-green-300 text-green-800',    dot: 'bg-green-500' },
  contracting:       { label: 'Daralıyor',          cls: 'bg-red-50 border-red-300 text-red-800',          dot: 'bg-red-500' },
  volatile:          { label: 'Dalgalı',            cls: 'bg-amber-50 border-amber-300 text-amber-800',    dot: 'bg-amber-500' },
  stable:            { label: 'Stabil',             cls: 'bg-slate-50 border-slate-300 text-slate-600',    dot: 'bg-slate-400' },
  insufficient_data: { label: 'Yetersiz Veri',      cls: 'bg-slate-50 border-slate-200 text-slate-400',    dot: 'bg-slate-300' },
}

function TrendBadge({ trend }: { trend: MarginTrend }) {
  const cfg = TREND_CONFIG[trend]
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-bold ${cfg.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

// ── Health badge ──────────────────────────────────────────────────────────────

const HEALTH_CONFIG: Record<MarginHealth, { label: string; cls: string }> = {
  excellent:         { label: 'Mükemmel',      cls: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  strong:            { label: 'Güçlü',          cls: 'bg-green-100 text-green-800 border-green-300' },
  adequate:          { label: 'Yeterli',        cls: 'bg-info-light text-info-text border-info-light' },
  thin:              { label: 'İnce',           cls: 'bg-amber-100 text-amber-800 border-amber-300' },
  negative:          { label: 'Negatif',        cls: 'bg-red-100 text-red-800 border-red-300' },
  insufficient_data: { label: 'Yetersiz Veri', cls: 'bg-slate-100 text-slate-500 border-slate-200' },
}

function HealthBadge({ health }: { health: MarginHealth }) {
  const cfg = HEALTH_CONFIG[health]
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[10px] font-bold ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}

// ── KPI tile ──────────────────────────────────────────────────────────────────

function KpiTile({
  label,
  value,
  avg,
  benchmark,
  accentCls,
}: {
  label:      string
  value:      number | null
  avg:        number | null
  benchmark:  number
  accentCls:  string
}) {
  const gap = value !== null ? value - benchmark : null
  const gapCls = gap === null ? '' : gap >= 0 ? 'text-green-600' : 'text-red-600'

  return (
    <div className={`bg-white border border-[#e8eaef] border-l-4 ${accentCls} rounded px-4 py-4 shadow-sm`}>
      <div className="text-[9px] font-bold uppercase tracking-wider text-[#94a3b8] mb-1">{label}</div>
      <div className="text-2xl font-bold tabular-nums text-[#0f172a] mb-1">
        {fmtPct(value)}
      </div>
      <div className="text-[10px] text-[#94a3b8]">
        12A ort: <span className="font-semibold text-[#475569]">{fmtPct(avg)}</span>
      </div>
      {gap !== null && (
        <div className={`text-[10px] font-semibold mt-0.5 ${gapCls}`}>
          {gap >= 0 ? '+' : ''}{gap.toFixed(1)}pp KOBİ ort.
        </div>
      )}
    </div>
  )
}

// ── Bar chart ─────────────────────────────────────────────────────────────────

function MarginBarChart({
  points,
  rolling,
  anomalyMonths,
  bestMonth,
  worstMonth,
}: {
  points:        MonthlyMarginPoint[]
  rolling:       Array<number | null>
  anomalyMonths: string[]
  bestMonth:     MonthlyMarginPoint | null
  worstMonth:    MonthlyMarginPoint | null
}) {
  const allMargins = points
    .map(p => p.gross_margin_pct)
    .filter((v): v is number => v !== null)
  const maxVal = allMargins.length > 0 ? Math.max(...allMargins, 5) : 100
  const minVal = Math.min(...allMargins.map(v => Math.min(v, 0)), 0)
  const range  = maxVal - minVal || 1

  const anomalySet = new Set(anomalyMonths)

  return (
    <div className="flex items-end gap-1 h-32 mt-2">
      {points.map((p, i) => {
        const gm          = p.gross_margin_pct
        const barHeight   = gm !== null ? Math.max(2, ((gm - minVal) / range) * 100) : 0
        const isBest      = bestMonth?.year_month === p.year_month
        const isWorst     = worstMonth?.year_month === p.year_month
        const isAnomaly   = anomalySet.has(p.year_month)

        const barCls = isBest
          ? 'bg-amber-400'
          : isWorst
          ? 'bg-red-400'
          : isAnomaly
          ? 'bg-orange-400'
          : 'bg-[#3b82f6]'

        const rollingPct  = rolling[i]
        const rollingHeight = rollingPct !== null
          ? Math.max(2, ((rollingPct - minVal) / range) * 100)
          : null

        return (
          <div key={p.year_month} className="flex-1 flex flex-col items-center gap-0.5 relative">
            {/* Rolling avg dot */}
            {rollingHeight !== null && (
              <div
                className="absolute w-1.5 h-1.5 rounded-full bg-slate-500 z-10"
                style={{ bottom: `${rollingHeight}%`, transform: 'translateY(50%)' }}
                title={`3A ort: ${fmtPct(rollingPct)}`}
              />
            )}
            <div
              className={`w-full rounded-sm ${barCls} transition-all`}
              style={{ height: `${barHeight}%` }}
              title={`${p.year_month}: ${fmtPct(gm)}${isAnomaly ? ' (anomali)' : ''}`}
            />
            {isAnomaly && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-[8px] text-orange-600 font-bold">!</div>
            )}
            <div className="text-[8px] text-[#94a3b8] font-medium">{fmtMonthShort(p.year_month)}</div>
          </div>
        )
      })}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

interface Props {
  companyId: string
}

export function MarginTrendClient({ companyId }: Props) {
  const { data, isLoading, isError } = useQuery<{ report: MarginTrendReport }>({
    queryKey:  ['margin-trend-v2', companyId],
    queryFn:   async () => {
      const res = await fetch('/api/finance/margin-trend')
      if (!res.ok) throw new Error('Marj trendi verisi yüklenemedi')
      return res.json()
    },
    staleTime: 15 * 60 * 1000,
  })

  if (isLoading) {
    return (
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft p-6 shadow-sm">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-[#f1f5f9] rounded w-64" />
          <div className="grid grid-cols-3 gap-3">
            {[0, 1, 2].map(i => <div key={i} className="h-24 bg-[#f1f5f9] rounded" />)}
          </div>
          <div className="h-40 bg-[#f1f5f9] rounded" />
          <div className="h-24 bg-[#f1f5f9] rounded" />
        </div>
      </div>
    )
  }

  if (isError || !data?.report) {
    return (
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft p-6 shadow-sm text-center">
        <p className="text-sm text-[#64748b] font-medium">Marj verisi hesaplanamadı</p>
        <p className="text-xs text-[#94a3b8] mt-1">
          Satış ve gider verileri mevcut olduğunda otomatik hesaplanır.
        </p>
      </div>
    )
  }

  const r = data.report
  const latestOpMargin = r.monthly_points[r.monthly_points.length - 1]?.operating_margin_pct ?? null
  const avgOpMargin    = (() => {
    const vals = r.monthly_points.map(p => p.operating_margin_pct).filter((v): v is number => v !== null)
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
  })()

  return (
    <div className="space-y-4">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">
          Kâr Marjı Trend Analizi — Son 12 Ay
        </div>
        <HealthBadge health={r.margin_health as MarginHealth} />
      </div>

      {/* ── Narrative banner ────────────────────────────────────────────────── */}
      <div className="bg-[#f8fafc] border border-[#e8eaef] rounded px-4 py-3">
        <p className="text-[12px] font-semibold text-[#334155]">{r.narrative}</p>
      </div>

      {/* ── KPI tiles ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        <KpiTile
          label="Brüt Marj"
          value={r.latest_gross_margin_pct}
          avg={r.avg_gross_margin_pct}
          benchmark={TURKISH_SME_GROSS_MARGIN_BENCHMARK}
          accentCls="border-l-[#059669]"
        />
        <KpiTile
          label="Faaliyet Marjı"
          value={latestOpMargin}
          avg={avgOpMargin}
          benchmark={12.0}
          accentCls="border-l-[#3b82f6]"
        />
        <KpiTile
          label="Net Marj"
          value={r.latest_net_margin_pct}
          avg={r.avg_net_margin_pct}
          benchmark={TURKISH_SME_NET_MARGIN_BENCHMARK}
          accentCls="border-l-[#d97706]"
        />
      </div>

      {/* ── Trend badges ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-[10px] text-[#94a3b8] font-semibold">Brüt Marj Trendi:</span>
        <TrendBadge trend={r.gross_margin_trend as MarginTrend} />
        <span className="text-[10px] text-[#94a3b8] font-semibold ml-2">Net Marj Trendi:</span>
        <TrendBadge trend={r.net_margin_trend as MarginTrend} />
        {r.anomaly_months.length > 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold bg-orange-50 border-orange-300 text-orange-800 ml-2">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
            {r.anomaly_months.length} anomali ay
          </span>
        )}
      </div>

      {/* ── Bar chart ────────────────────────────────────────────────────────── */}
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft p-5 shadow-sm">
        <div className="flex items-center justify-between mb-1">
          <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">
            Aylık Brüt Marj
          </div>
          <div className="flex gap-3 text-[9px] text-[#94a3b8]">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-400 inline-block" /> En İyi</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-400 inline-block" /> En Kötü</span>
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-slate-500 inline-block" /> 3A Ort.</span>
            <span className="flex items-center gap-1 text-orange-600 font-bold">! Anomali</span>
          </div>
        </div>

        <MarginBarChart
          points={r.monthly_points}
          rolling={r.rolling_avg_gross_margin}
          anomalyMonths={r.anomaly_months}
          bestMonth={r.best_month}
          worstMonth={r.worst_month}
        />

        {/* Benchmark line label */}
        <div className="mt-2 text-[9px] text-[#94a3b8] flex gap-4">
          <span>KOBİ Brüt Marj Kıyası: <span className="font-bold text-[#64748b]">%{TURKISH_SME_GROSS_MARGIN_BENCHMARK}</span></span>
          {r.gross_margin_benchmark_gap !== null && (
            <span className={r.gross_margin_benchmark_gap >= 0 ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}>
              {r.gross_margin_benchmark_gap >= 0 ? '+' : ''}{r.gross_margin_benchmark_gap.toFixed(1)}pp kıyasla
            </span>
          )}
        </div>
      </div>

      {/* ── Monthly detail table ─────────────────────────────────────────────── */}
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft p-5 shadow-sm overflow-x-auto">
        <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-4">
          Aylık Marj Detayı
        </div>
        <table className="w-full text-xs border-collapse min-w-[560px]">
          <thead>
            <tr className="border-b border-[#e8eaef]">
              {['Ay', 'Brüt Marj', 'Faaliyet Marjı', 'Net Marj', '3A Ort. (Brüt)'].map(h => (
                <th key={h} className="text-right py-2 px-2 first:text-left text-[10px] font-bold uppercase tracking-wide text-[#94a3b8]">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...r.monthly_points].reverse().map((p, ri) => {
              const origIdx      = r.monthly_points.length - 1 - ri
              const rollingVal   = r.rolling_avg_gross_margin[origIdx]
              const isBest       = r.best_month?.year_month === p.year_month
              const isWorst      = r.worst_month?.year_month === p.year_month
              const isAnomaly    = r.anomaly_months.includes(p.year_month)
              const rowCls = isBest
                ? 'border-t border-[#f1f5f9] bg-yellow-50'
                : isWorst
                ? 'border-t border-[#f1f5f9] bg-red-50'
                : isAnomaly
                ? 'border-t border-[#f1f5f9] bg-orange-50'
                : 'border-t border-[#f1f5f9]'

              return (
                <tr key={p.year_month} className={rowCls}>
                  <td className="py-1.5 px-2 text-left">
                    <span className="text-[11px] font-semibold text-[#334155]">{p.year_month}</span>
                    {isBest    && <span className="ml-1 text-[9px] text-amber-700 font-bold">★</span>}
                    {isWorst   && <span className="ml-1 text-[9px] text-red-600 font-bold">▼</span>}
                    {isAnomaly && <span className="ml-1 text-[9px] text-orange-600 font-bold">!</span>}
                  </td>
                  <td className="py-1.5 px-2 text-right text-[11px] tabular-nums font-semibold text-[#1e293b]">
                    {fmtPct(p.gross_margin_pct)}
                  </td>
                  <td className="py-1.5 px-2 text-right text-[11px] tabular-nums text-[#475569]">
                    {fmtPct(p.operating_margin_pct)}
                  </td>
                  <td className="py-1.5 px-2 text-right text-[11px] tabular-nums text-[#475569]">
                    {fmtPct(p.net_margin_pct)}
                  </td>
                  <td className="py-1.5 px-2 text-right text-[11px] tabular-nums text-[#64748b]">
                    {fmtPct(rollingVal)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div className="text-[9px] text-[#94a3b8] mt-3 font-semibold">
          ★ En yüksek brüt marjlı ay · ▼ En düşük brüt marjlı ay · ! Anomali (±2σ)
        </div>
      </div>

      {/* ── Best / worst highlights ──────────────────────────────────────────── */}
      {(r.best_month || r.worst_month) && (
        <div className="grid grid-cols-2 gap-3">
          {r.best_month && (
            <div className="bg-amber-50 border border-amber-200 rounded px-4 py-3">
              <div className="text-[9px] font-bold uppercase tracking-wider text-amber-600 mb-1">En İyi Ay</div>
              <div className="text-[13px] font-bold text-amber-900">{r.best_month.year_month}</div>
              <div className="text-xl font-bold text-amber-700">{fmtPct(r.best_month.gross_margin_pct)}</div>
              <div className="text-[9px] text-amber-600 mt-0.5">brüt marj</div>
            </div>
          )}
          {r.worst_month && (
            <div className="bg-red-50 border border-red-200 rounded px-4 py-3">
              <div className="text-[9px] font-bold uppercase tracking-wider text-red-600 mb-1">En Kötü Ay</div>
              <div className="text-[13px] font-bold text-red-900">{r.worst_month.year_month}</div>
              <div className="text-xl font-bold text-red-700">{fmtPct(r.worst_month.gross_margin_pct)}</div>
              <div className="text-[9px] text-red-600 mt-0.5">brüt marj</div>
            </div>
          )}
        </div>
      )}

    </div>
  )
}
