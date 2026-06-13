'use client'
// ── SegmentProfitabilityClient — Segment profitability analysis ───────────────
// Client island: fetches /api/commercial/segment-profitability via TanStack Query.
// Segments by product_categories with margin, performance badges, and insights.

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import type {
  SegmentProfitabilityReport,
  SegmentData,
  SegmentPerformance,
} from '@/lib/services/commercial/segment-profitability.service'

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

// ── Period helpers ────────────────────────────────────────────────────────────

function lastNMonths(n: number): Array<{ key: string; label: string }> {
  const months: Array<{ key: string; label: string }> = []
  const MONTH_NAMES = [
    'Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz',
    'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara',
  ]
  const now = new Date()
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const y = d.getFullYear()
    const m = d.getMonth()
    months.push({
      key:   `${y}-${String(m + 1).padStart(2, '0')}`,
      label: `${MONTH_NAMES[m]} ${y}`,
    })
  }
  return months
}

// ── Performance badge config ──────────────────────────────────────────────────

const PERF_CFG: Record<SegmentPerformance, { label: string; bg: string; text: string }> = {
  star:        { label: 'Yıldız',     bg: 'bg-yellow-100', text: 'text-yellow-800' },
  profitable:  { label: 'Kârlı',      bg: 'bg-pos-light',  text: 'text-pos-text'   },
  marginal:    { label: 'Marjinal',   bg: 'bg-[#f1f5f9]',  text: 'text-[#64748b]'  },
  loss_leader: { label: 'Zararına',   bg: 'bg-neg-light',  text: 'text-neg-text'   },
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft px-4 py-3 space-y-3 animate-pulse">
      <div className="h-3 w-48 bg-[#f1f5f9] rounded" />
      <div className="grid grid-cols-4 gap-3">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="h-16 bg-[#f1f5f9] rounded" />
        ))}
      </div>
      <div className="h-48 bg-[#f8fafc] rounded" />
    </div>
  )
}

function PerfBadge({ performance }: { performance: SegmentPerformance }) {
  const cfg = PERF_CFG[performance]
  return (
    <span className={`inline-block text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  )
}

function GrowthArrow({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-[10px] text-[#94a3b8]">—</span>
  const isPos = pct >= 0
  return (
    <span className={`text-[10px] font-bold tabular-nums ${isPos ? 'text-pos-text' : 'text-neg-text'}`}>
      {isPos ? '↑' : '↓'} {fmtPct(Math.abs(pct))}
    </span>
  )
}

interface OverviewProps {
  report: SegmentProfitabilityReport
}

function OverviewStrip({ report }: OverviewProps) {
  const topSegment = report.segments[0]
  const cards = [
    {
      label: 'Toplam Gelir',
      value: report.total_revenue_try > 0 ? fmtTRY(report.total_revenue_try) : '—',
      sub:   `${report.segments.length} segment`,
      color: 'text-brand',
    },
    {
      label: 'Genel Marj',
      value: report.total_revenue_try > 0 ? fmtPct(report.overall_margin_pct) : '—',
      sub:   report.overall_margin_pct >= 25 ? 'Sağlıklı' : report.overall_margin_pct >= 10 ? 'Dikkat' : 'Düşük',
      color: report.overall_margin_pct >= 25
        ? 'text-pos-text'
        : report.overall_margin_pct >= 10
          ? 'text-warn-text'
          : 'text-neg',
    },
    {
      label: 'En İyi Segment',
      value: topSegment?.segment_name ?? '—',
      sub:   topSegment ? fmtTRY(topSegment.revenue_try) : '',
      color: 'text-[#0f172a]',
    },
    {
      label: 'Pareto 80%',
      value: report.pareto_80_count > 0 ? `${report.pareto_80_count} seg.` : '—',
      sub:   report.pareto_80_count > 0
        ? `${report.pareto_80_count} segment gelirin %80'ini oluşturuyor`
        : '',
      color: 'text-[#0f172a]',
    },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 divide-x divide-[#e8eaef] border-b border-[#e8eaef]">
      {cards.map((card, i) => (
        <div key={card.label} className={`p-3 ${i >= 2 ? 'border-t sm:border-t-0' : ''}`}>
          <div className="text-[0.6rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-1">
            {card.label}
          </div>
          <div className={`text-base font-bold tabular-nums leading-none truncate ${card.color}`}>
            {card.value}
          </div>
          {card.sub && (
            <div className="text-[9px] text-[#94a3b8] mt-1 truncate">{card.sub}</div>
          )}
        </div>
      ))}
    </div>
  )
}

interface SegmentTableProps {
  segments: SegmentData[]
  showGrowth: boolean
}

function SegmentTable({ segments, showGrowth }: SegmentTableProps) {
  const maxRevenue = segments[0]?.revenue_try ?? 1

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[#f1f5f9]">
            <th className="text-left px-3 py-2 text-[0.6rem] font-bold uppercase tracking-wider text-[#94a3b8]">
              Segment
            </th>
            <th className="text-right px-3 py-2 text-[0.6rem] font-bold uppercase tracking-wider text-[#94a3b8]">
              Gelir
            </th>
            <th className="px-3 py-2 text-[0.6rem] font-bold uppercase tracking-wider text-[#94a3b8] hidden sm:table-cell w-32">
              Gelir Payı
            </th>
            <th className="text-right px-3 py-2 text-[0.6rem] font-bold uppercase tracking-wider text-[#94a3b8]">
              Marj %
            </th>
            <th className="text-center px-3 py-2 text-[0.6rem] font-bold uppercase tracking-wider text-[#94a3b8] hidden sm:table-cell">
              Sipariş
            </th>
            <th className="text-center px-3 py-2 text-[0.6rem] font-bold uppercase tracking-wider text-[#94a3b8]">
              Performans
            </th>
            {showGrowth && (
              <th className="text-right px-3 py-2 text-[0.6rem] font-bold uppercase tracking-wider text-[#94a3b8] hidden sm:table-cell">
                Büyüme
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#f8fafc]">
          {segments.map(seg => {
            const barPct = maxRevenue > 0 ? (seg.revenue_try / maxRevenue) * 100 : 0
            return (
              <tr key={seg.segment_key} className="hover:bg-[#f8fafc]/60">
                <td className="px-3 py-2.5">
                  <div className="text-[11px] font-bold text-[#1e293b] truncate max-w-[150px]" title={seg.segment_name}>
                    {seg.segment_name}
                  </div>
                  <div className="text-[9px] text-[#94a3b8] mt-0.5">
                    {seg.unique_customers} müşteri
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right">
                  <div className="text-sm font-bold tabular-nums text-brand leading-none">
                    {fmtTRY(seg.revenue_try)}
                  </div>
                  <div className="text-[9px] text-[#94a3b8] mt-0.5 tabular-nums">
                    ort. {fmtTRY(seg.avg_order_value_try)}/sipariş
                  </div>
                </td>
                <td className="px-3 py-2.5 hidden sm:table-cell">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-3 bg-[#f1f5f9] rounded overflow-hidden">
                      <div
                        className="h-3 bg-brand-light rounded"
                        style={{ width: `${barPct}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-bold tabular-nums text-[#64748b] w-10 text-right shrink-0">
                      {fmtPct(seg.revenue_share_pct)}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right">
                  <span className={`text-sm font-bold tabular-nums leading-none ${
                    seg.gross_margin_pct >= 40
                      ? 'text-yellow-700'
                      : seg.gross_margin_pct >= 25
                        ? 'text-pos-text'
                        : seg.gross_margin_pct >= 10
                          ? 'text-warn-text'
                          : 'text-neg'
                  }`}>
                    {fmtPct(seg.gross_margin_pct)}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-center tabular-nums text-[#64748b] hidden sm:table-cell">
                  {seg.orders_count}
                </td>
                <td className="px-3 py-2.5 text-center">
                  <PerfBadge performance={seg.performance} />
                </td>
                {showGrowth && (
                  <td className="px-3 py-2.5 text-right hidden sm:table-cell">
                    <GrowthArrow pct={seg.revenue_growth_pct} />
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  companyId: string
}

interface ApiResponse {
  report: SegmentProfitabilityReport
}

export default function SegmentProfitabilityClient({ companyId: _companyId }: Props) {
  const periods     = useMemo(() => lastNMonths(6), [])
  const [period, setPeriod] = useState<string>(periods[0].key)
  const [includePrior, setIncludePrior] = useState(false)

  const { data, isLoading, error } = useQuery<ApiResponse>({
    queryKey: ['segment-profitability', period, includePrior],
    queryFn: async () => {
      const params = new URLSearchParams({ period })
      if (includePrior) params.set('includePrior', 'true')
      const res = await fetch(`/api/commercial/segment-profitability?${params}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json() as Promise<ApiResponse>
    },
    staleTime: 30 * 60 * 1000, // 30 min
  })

  if (isLoading) return <Skeleton />
  if (error) return null

  const report = data?.report
  if (!report || report.segments.length === 0) {
    return (
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft px-4 py-6 text-center">
        <p className="text-sm text-[#94a3b8]">Segment verisi bulunamadı</p>
        <p className="text-[10px] text-[#cbd5e1] mt-1">{periods.find(p => p.key === period)?.label}</p>
      </div>
    )
  }

  return (
    <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#f1f5f9] flex items-center justify-between gap-3 flex-wrap">
        <span className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">
          Segment Kârlılık Analizi
        </span>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Period selector */}
          <select
            value={period}
            onChange={e => setPeriod(e.target.value)}
            className="text-[11px] font-medium text-[#334155] border border-[#e8eaef] rounded px-2 py-1 bg-white focus:outline-none focus:border-brand"
          >
            {periods.map(p => (
              <option key={p.key} value={p.key}>{p.label}</option>
            ))}
          </select>

          {/* Prior toggle */}
          <button
            onClick={() => setIncludePrior(v => !v)}
            className={`text-[10px] font-bold px-2.5 py-1 rounded border transition-colors ${
              includePrior
                ? 'bg-brand text-white border-brand'
                : 'bg-white text-[#64748b] border-[#e8eaef] hover:border-brand hover:text-brand'
            }`}
          >
            Karşılaştırma {includePrior ? 'Açık' : 'Ekle'}
          </button>
        </div>
      </div>

      {/* Overview KPIs */}
      <OverviewStrip report={report} />

      {/* Insights */}
      <div className="px-4 pt-3 pb-1 space-y-2">
        {/* Pareto insight */}
        {report.pareto_80_count > 0 && report.segments.length > 0 && (
          <div className="bg-[#f8fafc] border border-[#e8eaef] rounded px-3 py-2 text-[11px] text-[#334155]">
            En iyi{' '}
            <strong>{report.pareto_80_count}</strong>{' '}
            segment, toplam gelirin <strong>%80&apos;ini</strong> oluşturuyor
            {report.segments.length > report.pareto_80_count && (
              <span className="text-[#94a3b8]"> · {report.segments.length} segment toplam</span>
            )}
          </div>
        )}

        {/* Star segments chip */}
        {report.star_segments.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold text-yellow-700 uppercase tracking-wide">Yıldız segmentler:</span>
            {report.star_segments.map(name => (
              <span key={name} className="text-[10px] font-bold bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full">
                {name}
              </span>
            ))}
          </div>
        )}

        {/* Loss leader alert */}
        {report.loss_leader_segments.length > 0 && (
          <div className="bg-neg-light border border-neg-light rounded px-3 py-2">
            <span className="text-[11px] font-bold text-neg-text">
              Zararına çalışan segmentler:{' '}
              {report.loss_leader_segments.join(', ')}
            </span>
          </div>
        )}
      </div>

      {/* Segment table */}
      <div className="mt-2">
        <SegmentTable segments={report.segments} showGrowth={includePrior} />
      </div>

      <div className="px-4 py-2 border-t border-[#f8fafc] text-[9px] text-[#cbd5e1]">
        Marj = brüt kâr / gelir · COGS FIFO lot maliyetlerinden · {report.period_label}
      </div>
    </div>
  )
}
