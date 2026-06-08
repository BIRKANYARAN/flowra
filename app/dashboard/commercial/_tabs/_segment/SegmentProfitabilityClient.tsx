'use client'
// ── CustomerSegmentProfitabilityClient — Profitability by Customer Type ────────
// Fetches /api/commercial/customer-segment-profitability via TanStack Query.
// Displays customer type segments (enterprise/mid_market/small/one_time/new)
// with revenue, margin%, growth, and pareto insight in Turkish.

import { useQuery } from '@tanstack/react-query'
import type {
  CustomerSegmentReport,
  CustomerSegmentRow,
  CustomerSegment,
} from '@/lib/services/commercial/customer-segment-profitability.service'
import { fmtTRY, fmtPct } from '@/lib/format'

// ── Segment display config ────────────────────────────────────────────────────

const SEGMENT_LABELS: Record<CustomerSegment, string> = {
  enterprise: 'Büyük Müşteri',
  mid_market: 'Orta Ölçek',
  small:      'Küçük Müşteri',
  one_time:   'Tek Satın Alım',
  new:        'Yeni Müşteri',
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft px-4 py-3 space-y-3 animate-pulse">
      <div className="h-3 w-56 bg-[#f1f5f9] rounded" />
      <div className="h-6 w-80 bg-[#f8fafc] rounded" />
      <div className="space-y-2">
        {[0, 1, 2, 3, 4].map(i => (
          <div key={i} className="h-10 bg-[#f8fafc] rounded" />
        ))}
      </div>
    </div>
  )
}

function BadgeSegment({ segment }: { segment: CustomerSegment }) {
  const label = SEGMENT_LABELS[segment]
  const color =
    segment === 'enterprise' ? 'bg-[#ede9fe] text-[#6d28d9]'
    : segment === 'mid_market' ? 'bg-[#dbeafe] text-[#1d4ed8]'
    : segment === 'new'        ? 'bg-pos-light text-pos-text'
    : segment === 'one_time'   ? 'bg-[#fef3c7] text-[#92400e]'
    : 'bg-[#f1f5f9] text-[#475569]'

  return (
    <span className={`text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded ${color}`}>
      {label}
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

function MarginCell({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-[10px] text-[#94a3b8]">—</span>
  const color =
    pct >= 40 ? 'text-yellow-700'
    : pct >= 25 ? 'text-pos-text'
    : pct >= 10 ? 'text-warn-text'
    : 'text-neg'

  return (
    <span className={`text-sm font-black tabular-nums leading-none ${color}`}>
      {fmtPct(pct)}
    </span>
  )
}

interface SegmentTableProps {
  segments: CustomerSegmentRow[]
  totalRevenue: number
}

function SegmentTable({ segments, totalRevenue }: SegmentTableProps) {
  const active = segments.filter(s => s.revenue > 0)
  if (active.length === 0) return null

  const maxRevenue = Math.max(...active.map(s => s.revenue))

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[#f1f5f9]">
            <th className="text-left px-3 py-2 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">
              Segment
            </th>
            <th className="text-right px-3 py-2 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">
              Gelir
            </th>
            <th className="px-3 py-2 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] hidden sm:table-cell w-28">
              Gelir Payı
            </th>
            <th className="text-right px-3 py-2 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">
              Marj %
            </th>
            <th className="text-center px-3 py-2 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] hidden sm:table-cell">
              Müşteri
            </th>
            <th className="text-right px-3 py-2 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] hidden sm:table-cell">
              Büyüme
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#f8fafc]">
          {active.map(seg => {
            const barPct   = maxRevenue > 0 ? (seg.revenue / maxRevenue) * 100 : 0
            const sharePct = totalRevenue > 0 ? (seg.revenue / totalRevenue) * 100 : 0

            return (
              <tr key={seg.segment} className="hover:bg-[#f8fafc]/60">
                <td className="px-3 py-2.5">
                  <BadgeSegment segment={seg.segment} />
                  <div className="text-[9px] text-[#94a3b8] mt-0.5">
                    {seg.customer_count} müşteri
                    {seg.avg_order_value !== null && (
                      <> · ort. {fmtTRY(seg.avg_order_value)}/sipariş</>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right">
                  <div className="text-sm font-black tabular-nums text-brand leading-none">
                    {fmtTRY(seg.revenue)}
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
                      %{sharePct.toFixed(0)}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right">
                  <MarginCell pct={seg.gross_margin_pct} />
                </td>
                <td className="px-3 py-2.5 text-center tabular-nums text-[#64748b] hidden sm:table-cell">
                  {seg.customer_count}
                </td>
                <td className="px-3 py-2.5 text-right hidden sm:table-cell">
                  <GrowthArrow pct={seg.growth_rate_pct} />
                </td>
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
  report: CustomerSegmentReport
}

export default function CustomerSegmentProfitabilityClient({ companyId }: Props) {
  const { data, isLoading, error } = useQuery<ApiResponse>({
    queryKey: ['segment-profitability', companyId],
    queryFn: async () => {
      const res = await fetch('/api/commercial/customer-segment-profitability')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json() as Promise<ApiResponse>
    },
    staleTime: 30 * 60 * 1000, // 30 min
  })

  if (isLoading) return <Skeleton />
  if (error) return null

  const report = data?.report
  if (!report) return null

  const activeSegments = report.segments.filter(s => s.revenue > 0)
  if (activeSegments.length === 0) {
    return (
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft px-4 py-6 text-center">
        <p className="text-sm text-[#94a3b8]">Müşteri segment verisi bulunamadı</p>
      </div>
    )
  }

  const { revenue_concentration, unprofitable_segments, summary } = report

  return (
    <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#f1f5f9] flex items-center justify-between gap-2 flex-wrap">
        <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
          Müşteri Segmenti Kârlılığı
        </span>
        <span className="text-[10px] font-bold text-[#64748b]">
          {fmtTRY(summary.total_revenue)} toplam gelir · {revenue_concentration.total_customers} müşteri
        </span>
      </div>

      {/* Pareto insight */}
      {revenue_concentration.customers_for_80pct > 0 && (
        <div className="px-4 pt-3 pb-1">
          <div className="bg-[#f8fafc] border border-[#e8eaef] rounded px-3 py-2 text-[11px] text-[#334155]">
            <strong>{revenue_concentration.customers_for_80pct}</strong>{' '}
            müşteri toplam gelirin <strong>%80&apos;ini</strong> oluşturuyor
            {revenue_concentration.pareto_ratio !== null && (
              <span className="text-[#94a3b8]">
                {' '}· müşterilerin %{revenue_concentration.pareto_ratio.toFixed(0)}&apos;i
              </span>
            )}
          </div>
        </div>
      )}

      {/* Summary badges */}
      {(summary.most_profitable_segment || summary.fastest_growing_segment || summary.highest_revenue_segment) && (
        <div className="px-4 pt-2 pb-1 flex flex-wrap gap-2">
          {summary.highest_revenue_segment && (
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-black text-[#94a3b8] uppercase tracking-wide">En yüksek gelir:</span>
              <BadgeSegment segment={summary.highest_revenue_segment} />
            </div>
          )}
          {summary.most_profitable_segment && (
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-black text-[#94a3b8] uppercase tracking-wide">En kârlı:</span>
              <BadgeSegment segment={summary.most_profitable_segment} />
            </div>
          )}
          {summary.fastest_growing_segment && (
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-black text-[#94a3b8] uppercase tracking-wide">En hızlı büyüyen:</span>
              <BadgeSegment segment={summary.fastest_growing_segment} />
            </div>
          )}
        </div>
      )}

      {/* Unprofitable segments warning */}
      {unprofitable_segments.length > 0 && (
        <div className="px-4 py-2">
          <div className="bg-neg-light border border-neg-light rounded px-3 py-2">
            <span className="text-[11px] font-bold text-neg-text">
              Düşük/negatif marjlı segmentler:{' '}
              {unprofitable_segments
                .map(s => SEGMENT_LABELS[s as CustomerSegment] ?? s)
                .join(', ')}
            </span>
          </div>
        </div>
      )}

      {/* Segment table */}
      <div className="mt-1">
        <SegmentTable segments={report.segments} totalRevenue={summary.total_revenue} />
      </div>

      <div className="px-4 py-2 border-t border-[#f8fafc] text-[9px] text-[#cbd5e1]">
        COGS: stok lot maliyeti (yoksa gelirin %60&apos;ı) · Son 12 ay · Büyüme: önceki aya kıyasla
      </div>
    </div>
  )
}
