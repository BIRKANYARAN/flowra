'use client'
// ── RfmSegmentationClient — Müşteri RFM Segmentasyonu ─────────────────────────
// Client island: fetches /api/commercial/rfm-segmentation via TanStack Query.
// Displays KPI cards, segment distribution, customer table, and high-value focus.

import { useQuery } from '@tanstack/react-query'
import { fmtTRY, fmtPct } from '@/lib/format'
import type {
  RfmSegmentationReport,
  RfmCustomerRecord,
  RfmSegment,
} from '@/lib/services/commercial/rfm-segmentation.service'
import { ALL_RFM_SEGMENTS } from '@/lib/services/commercial/rfm-segmentation.service'
import { useState } from 'react'

// ── Segment config ────────────────────────────────────────────────────────────

const SEGMENT_CFG: Record<RfmSegment, { label: string; bg: string; text: string; dot: string }> = {
  champion:            { label: 'Şampiyon',          bg: 'bg-purple-100', text: 'text-purple-700', dot: 'bg-purple-500'  },
  loyal_customer:      { label: 'Sadık Müşteri',     bg: 'bg-blue-100',   text: 'text-blue-700',   dot: 'bg-blue-500'    },
  potential_loyalist:  { label: 'Potansiyel Sadık',  bg: 'bg-cyan-100',   text: 'text-cyan-700',   dot: 'bg-cyan-500'    },
  recent_customer:     { label: 'Yeni Müşteri',      bg: 'bg-green-100',  text: 'text-green-700',  dot: 'bg-green-500'   },
  promising:           { label: 'Umut Vadeden',      bg: 'bg-teal-100',   text: 'text-teal-700',   dot: 'bg-teal-500'    },
  need_attention:      { label: 'İlgi Gerektirir',   bg: 'bg-yellow-100', text: 'text-yellow-700', dot: 'bg-yellow-500'  },
  about_to_sleep:      { label: 'Uyuma Noktasında',  bg: 'bg-orange-100', text: 'text-orange-600', dot: 'bg-orange-500'  },
  at_risk:             { label: 'Risk Altında',       bg: 'bg-red-100',    text: 'text-red-600',    dot: 'bg-red-500'     },
  cannot_lose:         { label: 'Kaybedilmemeli',    bg: 'bg-rose-100',   text: 'text-rose-700',   dot: 'bg-rose-500'    },
  hibernating:         { label: 'Hibernasyon',        bg: 'bg-slate-100',  text: 'text-slate-500',  dot: 'bg-slate-400'   },
  lost:                { label: 'Kayıp',              bg: 'bg-[#f1f5f9]',  text: 'text-[#94a3b8]',  dot: 'bg-[#cbd5e1]'   },
}

type SortKey = 'rfm_code' | 'segment' | 'total_spend' | 'days_since_purchase' | 'order_count'

// ── Loading skeleton ──────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="bg-white border border-[#e2e8f0] rounded-xl shadow-soft px-4 py-3 space-y-3 animate-pulse">
      <div className="h-3 w-56 bg-[#f1f5f9] rounded" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="h-16 bg-[#f8fafc] rounded" />
        ))}
      </div>
      <div className="h-48 bg-[#f8fafc] rounded" />
    </div>
  )
}

// ── KPI cards ─────────────────────────────────────────────────────────────────

function KpiCards({ report }: { report: RfmSegmentationReport }) {
  const total = report.customers.length
  const champions = report.segment_distribution['champion']
  const atRisk    = report.at_risk_count
  const revRisk   = report.revenue_at_risk_pct

  const cards = [
    {
      label: 'Toplam Müşteri',
      value: String(total),
      sub: `${report.high_value_customer_count} yüksek değerli`,
      color: 'text-[#0f172a]',
    },
    {
      label: 'Şampiyonlar',
      value: String(champions),
      sub: champions > 0
        ? `%${((champions / total) * 100).toFixed(0)} müşteri tabanı`
        : 'Henüz yok',
      color: champions > 0 ? 'text-purple-600' : 'text-[#94a3b8]',
    },
    {
      label: 'Risk Altındaki',
      value: String(atRisk),
      sub: atRisk > 0 ? 'at_risk + kaybedilmemeli' : 'Risk yok',
      color: atRisk > 0 ? 'text-red-600' : 'text-pos-text',
    },
    {
      label: 'Gelir Riski',
      value: revRisk !== null ? `%${revRisk.toFixed(1)}` : '—',
      sub: revRisk !== null ? 'Riskli segmentlerde' : 'Hesaplanamadı',
      color: revRisk !== null && revRisk > 20 ? 'text-neg' : 'text-warn-text',
    },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 border-b border-[#f1f5f9]">
      {cards.map((card, i) => (
        <div
          key={card.label}
          className={`p-3 ${i < 3 ? 'border-b sm:border-b-0 sm:border-r border-[#f1f5f9]' : ''}`}
        >
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">
            {card.label}
          </div>
          <div className={`text-xl font-black tabular-nums leading-none ${card.color}`}>
            {card.value}
          </div>
          <div className="text-[10px] text-[#94a3b8] mt-1">{card.sub}</div>
        </div>
      ))}
    </div>
  )
}

// ── Segment distribution ──────────────────────────────────────────────────────

function SegmentDistribution({ report }: { report: RfmSegmentationReport }) {
  const total = report.customers.length
  if (total === 0) return null

  const segments = ALL_RFM_SEGMENTS.filter(s => report.segment_distribution[s] > 0)

  return (
    <div className="px-4 py-3 space-y-2">
      <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-2">
        Segment Dağılımı
      </div>
      <div className="space-y-1.5">
        {segments.map(seg => {
          const count   = report.segment_distribution[seg]
          const revPct  = report.segment_revenue_pct[seg]
          const barPct  = (count / total) * 100
          const cfg     = SEGMENT_CFG[seg]

          return (
            <div key={seg} className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 w-40 shrink-0">
                <div className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
                <span className="text-[11px] font-medium text-[#334155] truncate">{cfg.label}</span>
              </div>
              <div className="flex-1 h-3 bg-[#f1f5f9] rounded overflow-hidden">
                <div
                  className={`h-3 rounded ${cfg.dot}`}
                  style={{ width: `${Math.max(barPct, 1)}%` }}
                />
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[11px] font-black tabular-nums text-[#334155] w-5 text-right">
                  {count}
                </span>
                <span className="text-[10px] text-[#94a3b8] w-12 text-right tabular-nums">
                  {revPct > 0 ? `%${revPct.toFixed(0)} gelir` : ''}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Customer table ─────────────────────────────────────────────────────────────

function CustomerTable({ customers }: { customers: RfmCustomerRecord[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('rfm_code')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 20

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
    setPage(0)
  }

  const sorted = [...customers].sort((a, b) => {
    let cmp = 0
    switch (sortKey) {
      case 'rfm_code':           cmp = a.rfm_code.localeCompare(b.rfm_code); break
      case 'segment':            cmp = a.segment.localeCompare(b.segment); break
      case 'total_spend':        cmp = a.total_spend - b.total_spend; break
      case 'days_since_purchase':cmp = a.days_since_purchase - b.days_since_purchase; break
      case 'order_count':        cmp = a.order_count - b.order_count; break
    }
    return sortDir === 'asc' ? cmp : -cmp
  })

  const pageSlice = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE)

  function ThBtn({ label, k }: { label: string; k: SortKey }) {
    const active = sortKey === k
    return (
      <button
        onClick={() => handleSort(k)}
        className={`text-left text-[0.6rem] font-black uppercase tracking-widest px-3 py-2 ${
          active ? 'text-brand' : 'text-[#94a3b8]'
        }`}
      >
        {label}{active ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
      </button>
    )
  }

  return (
    <div className="border-t border-[#f1f5f9]">
      <div className="px-4 pt-3 pb-1 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
        Müşteri Listesi
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[#f1f5f9]">
              <th className="text-left px-3 py-2 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] w-8">#</th>
              <th className="text-left">
                <ThBtn label="Müşteri" k="segment" />
              </th>
              <th className="text-center">
                <ThBtn label="RFM" k="rfm_code" />
              </th>
              <th className="text-center">
                <span className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] px-3 py-2 block">Segment</span>
              </th>
              <th className="text-right">
                <ThBtn label="Harcama" k="total_spend" />
              </th>
              <th className="text-right hidden sm:table-cell">
                <ThBtn label="Sipariş" k="order_count" />
              </th>
              <th className="text-right hidden sm:table-cell">
                <ThBtn label="Son Alım" k="days_since_purchase" />
              </th>
              <th className="text-left px-3 py-2 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] hidden md:table-cell">
                Aksiyon
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f8fafc]">
            {pageSlice.map((c, idx) => {
              const segCfg = SEGMENT_CFG[c.segment]
              const globalIdx = page * PAGE_SIZE + idx + 1
              return (
                <tr key={c.customer_id} className="hover:bg-[#f8fafc]/60">
                  <td className="px-3 py-2.5 tabular-nums text-[#94a3b8] font-medium text-[10px]">
                    {globalIdx}
                  </td>
                  <td className="px-3 py-2.5">
                    <div
                      className="text-[11px] font-bold text-[#1e293b] truncate max-w-[140px]"
                      title={c.customer_name}
                    >
                      {c.customer_name}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span className="inline-block bg-[#f1f5f9] text-[#334155] text-[11px] font-black tabular-nums px-2 py-0.5 rounded font-mono">
                      {c.rfm_code}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span
                      className={`inline-block text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded ${segCfg.bg} ${segCfg.text}`}
                    >
                      {segCfg.label}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <span className="text-[11px] font-black tabular-nums text-brand">
                      {fmtTRY(c.total_spend)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right hidden sm:table-cell">
                    <span className="text-[10px] tabular-nums text-[#64748b]">
                      {c.order_count}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right hidden sm:table-cell">
                    <span className="text-[10px] tabular-nums text-[#64748b]">
                      {c.days_since_purchase}g
                    </span>
                  </td>
                  <td className="px-3 py-2.5 hidden md:table-cell">
                    <span className="text-[10px] text-[#64748b] italic">{c.action}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-2 border-t border-[#f8fafc]">
          <span className="text-[10px] text-[#94a3b8]">
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, sorted.length)} / {sorted.length}
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="text-[10px] px-2 py-0.5 rounded border border-[#e2e8f0] disabled:opacity-30 text-[#64748b]"
            >
              ‹ Önceki
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="text-[10px] px-2 py-0.5 rounded border border-[#e2e8f0] disabled:opacity-30 text-[#64748b]"
            >
              Sonraki ›
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── High-value focus ──────────────────────────────────────────────────────────

function HighValueFocus({ report }: { report: RfmSegmentationReport }) {
  const highValue = report.customers.filter(
    c => c.segment === 'champion' || c.segment === 'loyal_customer',
  )

  if (highValue.length === 0) return null

  const totalRevenue = report.customers.reduce((s, c) => s + c.total_spend, 0)
  const highValueRevenue = highValue.reduce((s, c) => s + c.total_spend, 0)
  const highValueRevPct = totalRevenue > 0 ? (highValueRevenue / totalRevenue) * 100 : 0

  return (
    <div className="border-t border-[#f1f5f9] px-4 py-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
          Yüksek Değerli Müşteriler
        </span>
        <span className="text-[9px] text-[#94a3b8]">
          {highValue.length} müşteri · %{highValueRevPct.toFixed(0)} gelir
        </span>
      </div>
      <div className="space-y-1">
        {highValue.slice(0, 8).map(c => {
          const cfg = SEGMENT_CFG[c.segment]
          const revShare = totalRevenue > 0 ? (c.total_spend / totalRevenue) * 100 : 0
          return (
            <div key={c.customer_id} className="flex items-center gap-3">
              <div className="w-36 text-[11px] font-medium text-[#334155] truncate shrink-0" title={c.customer_name}>
                {c.customer_name}
              </div>
              <div className="flex-1 h-3 bg-[#f1f5f9] rounded overflow-hidden">
                <div
                  className={`h-3 rounded ${cfg.dot}`}
                  style={{ width: `${Math.max(revShare * 2, 2)}%` }}
                />
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[10px] font-black tabular-nums text-brand w-20 text-right">
                  {fmtTRY(c.total_spend)}
                </span>
                <span className={`text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.text}`}>
                  {c.rfm_code}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface ApiResponse {
  report: RfmSegmentationReport
}

interface Props {
  companyId: string
}

export default function RfmSegmentationClient({ companyId }: Props) {
  const { data, isLoading, error } = useQuery<ApiResponse>({
    queryKey: ['rfm-segmentation', companyId],
    queryFn: async () => {
      const res = await fetch('/api/commercial/rfm-segmentation')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json() as Promise<ApiResponse>
    },
    staleTime: 60 * 60 * 1000, // 1 hour
  })

  if (isLoading) return <Skeleton />
  if (error || !data?.report) return null

  const { report } = data

  if (report.customers.length === 0) return null

  return (
    <div className="bg-white border border-[#e2e8f0] rounded-xl shadow-soft overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#f1f5f9] flex items-center justify-between">
        <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
          Müşteri RFM Segmentasyonu
        </span>
        <span className="text-[9px] text-[#94a3b8]">
          Son 24 ay · {report.customers.length} müşteri
        </span>
      </div>

      {/* KPI cards */}
      <KpiCards report={report} />

      {/* Segment distribution */}
      <SegmentDistribution report={report} />

      {/* High value focus */}
      <HighValueFocus report={report} />

      {/* Customer table */}
      <CustomerTable customers={report.customers} />
    </div>
  )
}
