'use client'
// ── SalesVelocityClient — Multi-Timeframe Sales Velocity Trends ───────────────
// Fetches /api/commercial/sales-velocity via TanStack Query.
// Features:
//   • 4 KPI cells: daily avg, weekly avg, WoW growth, consistency score
//   • Trend direction badge
//   • Day-of-week bar chart (Mon–Sun, avg revenue per day)
//   • 7-day moving average trend (proportional div widths)
//   • Anomaly days list (if any)

import { useQuery } from '@tanstack/react-query'
import type {
  SalesVelocityReport,
} from '@/lib/services/commercial/sales-velocity-trends.service'

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

function fmtPct(n: number, sign = false): string {
  const str = `%${PCT_FMT.format(Math.abs(n))}`
  if (!sign) return str
  return n >= 0 ? `+${str}` : `-${str}`
}

// ── Turkish day names ─────────────────────────────────────────────────────────

const TR_DAYS: Record<number, string> = {
  0: 'Pzt',
  1: 'Sal',
  2: 'Çar',
  3: 'Per',
  4: 'Cum',
  5: 'Cmt',
  6: 'Paz',
}

// ── Trend badge ───────────────────────────────────────────────────────────────

type TrendDir = 'accelerating' | 'growing' | 'stable' | 'slowing' | 'declining'

const TREND_CFG: Record<TrendDir, { label: string; bg: string; text: string; icon: string }> = {
  accelerating: { label: 'Hızlanıyor',  bg: 'bg-emerald-100', text: 'text-emerald-800', icon: '↑↑' },
  growing:      { label: 'Büyüyor',     bg: 'bg-teal-100',    text: 'text-teal-700',    icon: '↑'  },
  stable:       { label: 'Stabil',      bg: 'bg-blue-50',     text: 'text-blue-700',    icon: '→'  },
  slowing:      { label: 'Yavaşlıyor',  bg: 'bg-yellow-100',  text: 'text-yellow-700',  icon: '↓'  },
  declining:    { label: 'Düşüyor',     bg: 'bg-red-100',     text: 'text-red-700',     icon: '↓↓' },
}

function TrendBadge({ trend }: { trend: TrendDir }) {
  const cfg = TREND_CFG[trend] ?? TREND_CFG.stable
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded ${cfg.bg} ${cfg.text}`}>
      <span>{cfg.icon}</span>
      {cfg.label}
    </span>
  )
}

// ── KPI cell ──────────────────────────────────────────────────────────────────

function KpiCell({
  label,
  value,
  sub,
  highlight,
}: {
  label: string
  value: string
  sub?: string
  highlight?: boolean
}) {
  return (
    <div className={`rounded border px-3 py-2.5 ${highlight ? 'bg-brand/5 border-brand/20' : 'bg-white border-[#e2e8f0]'}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[#64748b] mb-1">{label}</p>
      <p className="text-xl font-black tabular-nums text-[#0f172a]">{value}</p>
      {sub && <p className="text-[10px] text-[#94a3b8] mt-0.5">{sub}</p>}
    </div>
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="bg-white border border-[#e2e8f0] rounded px-4 py-3 space-y-3 animate-pulse">
      <div className="h-3 w-52 bg-[#f1f5f9] rounded" />
      <div className="grid grid-cols-4 gap-3">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="h-16 bg-[#f1f5f9] rounded" />
        ))}
      </div>
      <div className="h-32 bg-[#f1f5f9] rounded" />
    </div>
  )
}

// ── EmptySlate ────────────────────────────────────────────────────────────────

function EmptySlate() {
  return (
    <div className="bg-white border border-[#e2e8f0] rounded px-4 py-10 text-center">
      <p className="text-[13px] font-medium text-[#64748b]">Son 90 günde satış verisi bulunamadı.</p>
    </div>
  )
}

// ── Day-of-Week Bar Chart ─────────────────────────────────────────────────────

function DowChart({
  dowPerformance,
  bestDay,
}: {
  dowPerformance: Record<number, number>
  bestDay: number
}) {
  const values = Array.from({ length: 7 }, (_, i) => dowPerformance[i] ?? 0)
  const maxVal = Math.max(...values, 1)

  return (
    <div className="space-y-1.5">
      {values.map((val, i) => {
        const barPct = (val / maxVal) * 100
        const isBest = i === bestDay
        return (
          <div key={i} className="flex items-center gap-2">
            <div className={`w-8 text-[11px] font-semibold shrink-0 ${isBest ? 'text-brand' : 'text-[#64748b]'}`}>
              {TR_DAYS[i]}
            </div>
            <div className="flex-1 h-4 bg-[#f1f5f9] rounded overflow-hidden">
              <div
                className={`h-4 rounded ${isBest ? 'bg-brand' : 'bg-brand-light'}`}
                style={{ width: `${barPct}%` }}
              />
            </div>
            <div className="w-16 text-right shrink-0">
              <span className={`text-[11px] font-bold tabular-nums ${isBest ? 'text-brand' : 'text-[#334155]'}`}>
                {fmtTRY(val)}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Moving Average Trend ──────────────────────────────────────────────────────

function MaTrendChart({ values }: { values: number[] }) {
  if (values.length === 0) return null
  // Show last 30 points for readability
  const subset = values.slice(-30)
  const maxVal = Math.max(...subset, 1)

  return (
    <div className="flex items-end gap-0.5 h-16">
      {subset.map((v, i) => {
        const heightPct = (v / maxVal) * 100
        return (
          <div
            key={i}
            className="flex-1 min-w-0 bg-brand rounded-t opacity-70"
            style={{ height: `${Math.max(4, heightPct)}%` }}
          />
        )
      })}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  companyId: string
}

interface ApiResponse {
  report: SalesVelocityReport
}

export default function SalesVelocityClient({ companyId }: Props) {
  const { data, isLoading, error } = useQuery<ApiResponse>({
    queryKey: ['sales-velocity', companyId],
    queryFn: async () => {
      const res = await fetch('/api/commercial/sales-velocity')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json() as Promise<ApiResponse>
    },
    staleTime: 5 * 60 * 1000,
  })

  if (isLoading) return <Skeleton />

  if (error || !data?.report) {
    return (
      <div className="bg-white border border-[#e2e8f0] rounded px-4 py-3">
        <p className="text-xs text-red-600">Satış hız analizi yüklenemedi.</p>
      </div>
    )
  }

  const r = data.report

  // If no sales at all, show empty state
  if (r.velocity.peak_day_revenue === 0 && r.daily_data.every(d => d.revenue_try === 0)) {
    return <EmptySlate />
  }

  const wowPct = r.wow_growth_pct
  const wowLabel = wowPct !== null
    ? `${fmtPct(wowPct, true)} hft/hft`
    : 'Yeterli veri yok'

  const accelPct = r.velocity_acceleration_pct
  const accelLabel = accelPct !== null
    ? `${fmtPct(accelPct, true)} ivme`
    : ''

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-sm font-bold text-[#0f172a]">Satış Hız Analizi</h2>
          <p className="text-[11px] text-[#64748b]">Son {r.analysis_window_days} gün</p>
        </div>
        <TrendBadge trend={r.trend as TrendDir} />
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <KpiCell
          label="Günlük Ort. Gelir"
          value={fmtTRY(r.velocity.daily_avg_revenue)}
          sub={`Haftalık: ${fmtTRY(r.velocity.weekly_avg_revenue)}`}
          highlight
        />
        <KpiCell
          label="Aylık Ort. Gelir"
          value={fmtTRY(r.velocity.monthly_avg_revenue)}
          sub={`${r.velocity.daily_avg_orders.toFixed(1)} sipariş/gün`}
        />
        <KpiCell
          label="HFT/HFT Büyüme"
          value={wowLabel}
          sub={accelLabel || undefined}
        />
        <KpiCell
          label="Tutarlılık"
          value={`%${PCT_FMT.format(r.consistency_score)}`}
          sub={`${r.daily_data.filter(d => d.order_count > 0).length} aktif gün / ${r.analysis_window_days}`}
        />
      </div>

      {/* Day-of-week performance */}
      <div className="bg-white border border-[#e2e8f0] rounded px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[#64748b]">Haftanın Günleri</p>
          <span className="text-[11px] text-[#64748b]">
            En iyi: <span className="font-bold text-brand">{r.best_day_name}</span>
          </span>
        </div>
        <DowChart dowPerformance={r.dow_performance} bestDay={r.best_day_of_week} />
      </div>

      {/* Moving average trend */}
      <div className="bg-white border border-[#e2e8f0] rounded px-4 py-3">
        <p className="text-[11px] font-bold uppercase tracking-wide text-[#64748b] mb-2">
          7 Günlük Hareketli Ortalama (son 30 gün)
        </p>
        <MaTrendChart values={r.moving_avg_7d} />
      </div>

      {/* Anomaly days */}
      {r.anomaly_days.length > 0 && (
        <div className="bg-white border border-[#e2e8f0] rounded px-4 py-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[#64748b] mb-2">
            Aykırı Günler ({r.anomaly_days.length})
          </p>
          <div className="space-y-1">
            {r.anomaly_days.map(a => (
              <div key={a.date} className="flex items-center justify-between text-[11px]">
                <span className="text-[#334155] font-medium">{a.date}</span>
                <span className={`font-bold ${a.is_positive ? 'text-emerald-700' : 'text-red-600'}`}>
                  {fmtTRY(a.revenue)}
                </span>
                <span className="text-[#94a3b8]">
                  z={a.z_score.toFixed(2)}
                </span>
                <span className={`text-[10px] font-semibold ${a.is_positive ? 'text-emerald-700' : 'text-red-600'}`}>
                  {a.is_positive ? 'Pozitif' : 'Negatif'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
