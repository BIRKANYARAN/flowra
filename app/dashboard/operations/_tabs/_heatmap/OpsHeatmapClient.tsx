'use client'
// ── OpsHeatmapClient — Operational KPI Heatmap section ───────────────────────
//
// OPS Command Center heatmap: 13 weeks × 7 days grid showing daily revenue
// intensity, plus DOW bar chart, header stats, and week summaries table.
//
// Client island: fetches /api/intelligence/ops-heatmap via TanStack Query.

import { useQuery } from '@tanstack/react-query'
import type { OpsHeatmapReport, DayData } from '@/lib/services/intelligence/ops-heatmap.service'

// ── Formatters ────────────────────────────────────────────────────────────────

const FMT = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 })

function fmtTRY(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `₺${(n / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000)     return `₺${(n / 1_000).toFixed(1)}K`
  return `₺${FMT.format(Math.round(n))}`
}

function fmtDate(s: string): string {
  if (!s) return '—'
  const [y, m, d] = s.split('-')
  return `${d}.${m}.${y}`
}

// ── Revenue intensity → CSS background color ──────────────────────────────────

function intensityBg(intensity: number, hasData: boolean): string {
  if (!hasData) return '#f1f5f9' // no-data: light gray
  if (intensity === 0) return '#f8fafc' // zero revenue: near-white

  // Green scale: intensity 1-100 → opacity 0.1 to 1.0 on green
  const opacity = 0.08 + (intensity / 100) * 0.92
  return `rgba(22, 163, 74, ${opacity.toFixed(2)})` // green-600 base
}

function intensityText(intensity: number, hasData: boolean): string {
  if (!hasData) return '#94a3b8'
  if (intensity > 60) return '#ffffff'
  if (intensity > 25) return '#15803d'
  return '#374151'
}

// ── Day-of-week labels ────────────────────────────────────────────────────────

const DOW_LABELS  = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']
const DOW_LABELS_FULL = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar']

// ── Loading skeleton ──────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-20 bg-[#f1f5f9] rounded" />
      <div className="h-32 bg-[#f1f5f9] rounded" />
      <div className="h-48 bg-[#f1f5f9] rounded" />
    </div>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, tone = 'neutral',
}: {
  label: string; value: string; sub?: string; tone?: 'ok' | 'warn' | 'neutral' | 'critical'
}) {
  const color = {
    ok:       'text-pos-text',
    warn:     'text-warn-text',
    critical: 'text-neg',
    neutral:  'text-[#0f172a]',
  }[tone]
  return (
    <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft px-4 py-3">
      <div className="text-[0.63rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-1">{label}</div>
      <div className={`text-lg font-black tabular-nums leading-none ${color}`}>{value}</div>
      {sub && <div className="text-[10px] text-[#94a3b8] mt-1">{sub}</div>}
    </div>
  )
}

// ── DOW bar chart ─────────────────────────────────────────────────────────────

function DowBarChart({ dowAvgs, bestDow }: { dowAvgs: number[]; bestDow: number }) {
  const maxVal = Math.max(...dowAvgs, 1)

  return (
    <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft p-4">
      <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#64748b] mb-3">
        Haftanın Günlerine Göre Ortalama Ciro
      </div>
      <div className="flex items-end gap-1.5 h-24">
        {dowAvgs.map((avg, i) => {
          const heightPct = (avg / maxVal) * 100
          const isBest    = i === bestDow
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full flex flex-col justify-end" style={{ height: '76px' }}>
                <div
                  className={`w-full rounded-t-sm transition-all ${isBest ? 'bg-pos-text' : 'bg-[#93c5fd]'}`}
                  style={{ height: `${Math.max(2, heightPct)}%` }}
                  title={`${DOW_LABELS_FULL[i]}: ${fmtTRY(avg)}`}
                />
              </div>
              <div className={`text-[10px] font-bold ${isBest ? 'text-pos-text' : 'text-[#64748b]'}`}>
                {DOW_LABELS[i]}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Heatmap grid ──────────────────────────────────────────────────────────────

function HeatmapGrid({ days, weeks }: { days: DayData[]; weeks: { week_start: string; week_label: string }[] }) {
  // Build lookup: date → DayData
  const dayMap = new Map<string, DayData>()
  for (const d of days) dayMap.set(d.date, d)

  // Build 13 × 7 grid: rows = weeks, cols = Mon-Sun
  return (
    <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft p-4 overflow-x-auto">
      <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#64748b] mb-3">
        Günlük Ciro Isı Haritası (Son 90 Gün)
      </div>

      {/* Legend */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[10px] text-[#94a3b8]">Düşük</span>
        <div className="flex gap-0.5">
          {[0, 15, 30, 50, 70, 90, 100].map(v => (
            <div
              key={v}
              className="w-4 h-4 rounded-sm"
              style={{ backgroundColor: intensityBg(v, v > 0) }}
            />
          ))}
        </div>
        <span className="text-[10px] text-[#94a3b8]">Yüksek</span>
      </div>

      {/* Day-of-week headers */}
      <div className="grid gap-1" style={{ gridTemplateColumns: '40px repeat(7, 1fr)' }}>
        <div /> {/* empty corner */}
        {DOW_LABELS.map(l => (
          <div key={l} className="text-center text-[10px] font-bold text-[#94a3b8]">{l}</div>
        ))}

        {/* Weeks */}
        {weeks.map(week => {
          // Get the 7 days starting from week_start
          const cells: (DayData | null)[] = Array(7).fill(null)
          for (let i = 0; i < 7; i++) {
            const date = new Date(week.week_start)
            date.setDate(date.getDate() + i)
            const dateStr = date.toISOString().slice(0, 10)
            cells[i] = dayMap.get(dateStr) ?? null
          }

          return (
            <>
              <div key={`lbl-${week.week_start}`}
                className="text-[10px] font-bold text-[#94a3b8] flex items-center justify-end pr-1">
                {week.week_label}
              </div>
              {cells.map((day, ci) => {
                const hasData = day !== null
                const intensity = day?.revenue_intensity ?? 0
                const bg   = intensityBg(intensity, hasData)
                const fg   = intensityText(intensity, hasData)
                const tip  = day
                  ? `${fmtDate(day.date)} | ${fmtTRY(day.revenue)} | ${day.orders} sipariş`
                  : 'Veri yok'

                return (
                  <div
                    key={`${week.week_start}-${ci}`}
                    className="rounded-sm flex items-center justify-center cursor-default transition-opacity hover:opacity-80"
                    style={{ backgroundColor: bg, color: fg, height: '28px', fontSize: '9px', fontWeight: 700 }}
                    title={tip}
                  >
                    {day && day.orders > 0 ? day.orders : ''}
                  </div>
                )
              })}
            </>
          )
        })}
      </div>
    </div>
  )
}

// ── Week summaries table ──────────────────────────────────────────────────────

function WeekTable({ weeks }: { weeks: OpsHeatmapReport['weeks'] }) {
  return (
    <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft overflow-hidden">
      <div className="px-4 py-3 border-b border-[#f1f5f9]">
        <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#64748b]">
          Haftalık Özet
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-[#f8fafc] border-b border-[#e8eaef]">
              <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-[#94a3b8]">Hafta</th>
              <th className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wider text-[#94a3b8]">Ciro</th>
              <th className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wider text-[#94a3b8]">Sipariş</th>
              <th className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wider text-[#94a3b8]">Net Nakit</th>
              <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-[#94a3b8]">En İyi Gün</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f1f5f9]">
            {weeks.map(w => (
              <tr key={w.week_start} className="hover:bg-[#f8fafc]">
                <td className="px-3 py-2 font-bold text-[#334155]">{w.week_label}</td>
                <td className="px-3 py-2 text-right font-black tabular-nums text-[#0f172a]">
                  {fmtTRY(w.total_revenue)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-[#64748b]">
                  {w.total_orders}
                </td>
                <td className={`px-3 py-2 text-right font-bold tabular-nums ${
                  w.net_cash >= 0 ? 'text-pos-text' : 'text-neg'
                }`}>
                  {fmtTRY(w.net_cash)}
                </td>
                <td className="px-3 py-2 text-[#64748b]">{fmtDate(w.best_day)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface ApiResponse {
  report: OpsHeatmapReport
}

export function OpsHeatmapClient() {
  const { data, isLoading, error } = useQuery<ApiResponse>({
    queryKey: ['ops-heatmap'],
    queryFn:  () => fetch('/api/intelligence/ops-heatmap').then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json()
    }),
    staleTime: 5 * 60 * 1_000,
  })

  if (isLoading) return <Skeleton />
  if (error || !data?.report) return null

  const r = data.report

  const weekendPct = ((r.weekend_vs_weekday_ratio - 1) * 100).toFixed(0)
  const weekendLabel = r.weekend_vs_weekday_ratio >= 1
    ? `Hafta sonu +%${weekendPct}`
    : `Hafta sonu -%${Math.abs(Number(weekendPct))}`

  return (
    <div className="space-y-4">
      {/* Header label */}
      <div className="flex items-center justify-between">
        <div className="text-xs font-bold uppercase tracking-wider text-[#64748b]">
          Operasyonel KPI Isı Haritası
        </div>
        <div className="text-[10px] text-[#94a3b8]">
          {`${fmtDate(r.from_date)} – ${fmtDate(r.to_date)}`}
        </div>
      </div>

      {/* Header stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="En İyi Gün Cirosu"
          value={fmtTRY(r.best_day_revenue)}
          sub={fmtDate(r.best_day_date)}
          tone="ok"
        />
        <StatCard
          label="Günlük Ort. Ciro"
          value={fmtTRY(r.avg_daily_revenue)}
          sub={`${r.avg_daily_orders.toFixed(1)} sipariş/gün`}
          tone="neutral"
        />
        <StatCard
          label="Satışsız Günler"
          value={`${r.zero_revenue_days} gün`}
          sub={`${r.days.length} günden`}
          tone={r.zero_revenue_days > 10 ? 'warn' : 'neutral'}
        />
        <StatCard
          label="Hafta Sonu / İş Günü"
          value={`${r.weekend_vs_weekday_ratio.toFixed(2)}x`}
          sub={weekendLabel}
          tone={r.weekend_vs_weekday_ratio >= 1 ? 'ok' : 'neutral'}
        />
      </div>

      {/* DOW bar chart */}
      <DowBarChart dowAvgs={r.dow_revenue_avg} bestDow={r.best_dow} />

      {/* Revenue heatmap grid */}
      <HeatmapGrid days={r.days} weeks={r.weeks} />

      {/* Week summaries table */}
      <WeekTable weeks={r.weeks} />
    </div>
  )
}
