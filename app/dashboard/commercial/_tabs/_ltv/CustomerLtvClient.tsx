'use client'
// ── CustomerLtvClient — Customer LTV Analysis section ─────────────────────────
// Client island: fetches /api/commercial/customer-ltv via TanStack Query.
// Shows segment pills, churn risk alert, and top-20 LTV table.

import { useQuery } from '@tanstack/react-query'
import type {
  CustomerLtvReport,
  CustomerLtvProfile,
  ChurnRisk,
  CustomerSegment,
} from '@/lib/services/commercial/customer-ltv.service'

// ── Format helpers ────────────────────────────────────────────────────────────

const TRY_FMT = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 })
function fmtTRY(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `₺${(n / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000)     return `₺${(n / 1_000).toFixed(1)}K`
  return `₺${TRY_FMT.format(Math.round(n))}`
}

function fmtDate(d: string): string {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}.${m}.${y}`
}

// ── Chip configs ──────────────────────────────────────────────────────────────

const SEGMENT_CFG: Record<CustomerSegment, { label: string; bg: string; text: string }> = {
  champions: { label: 'Şampiyon',    bg: 'bg-purple-100', text: 'text-purple-700' },
  loyal:     { label: 'Sadık',       bg: 'bg-blue-100',   text: 'text-blue-700'   },
  at_risk:   { label: 'Risk Altında',bg: 'bg-orange-100', text: 'text-orange-700' },
  new:       { label: 'Yeni',        bg: 'bg-green-100',  text: 'text-green-700'  },
  lost:      { label: 'Kayıp',       bg: 'bg-[#f1f5f9]',  text: 'text-[#94a3b8]' },
  other:     { label: 'Diğer',       bg: 'bg-[#f1f5f9]',  text: 'text-[#64748b]' },
}

const CHURN_CFG: Record<ChurnRisk, { label: string; bg: string; text: string }> = {
  low:       { label: 'Düşük',   bg: 'bg-pos-light',   text: 'text-pos-text'   },
  medium:    { label: 'Orta',    bg: 'bg-warn-light',  text: 'text-warn-text'  },
  high:      { label: 'Yüksek', bg: 'bg-neg-light',   text: 'text-neg-text'   },
  uncertain: { label: '?',       bg: 'bg-[#f1f5f9]',   text: 'text-[#94a3b8]' },
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="bg-white border border-[#e2e8f0] rounded px-4 py-3 space-y-3 animate-pulse">
      <div className="h-3 w-48 bg-[#f1f5f9] rounded" />
      <div className="flex gap-2">
        {[0, 1, 2, 3, 4].map(i => (
          <div key={i} className="h-6 w-20 bg-[#f1f5f9] rounded-full" />
        ))}
      </div>
      <div className="h-40 bg-[#f8fafc] rounded" />
    </div>
  )
}

// ── Segment pill row ──────────────────────────────────────────────────────────

function SegmentPills({ report }: { report: CustomerLtvReport }) {
  const pills = [
    { label: 'Şampiyon',     count: report.champions,     bg: 'bg-purple-100', text: 'text-purple-700' },
    { label: 'Sadık',        count: report.loyal,         bg: 'bg-blue-100',   text: 'text-blue-700'   },
    { label: 'Risk Altında', count: report.at_risk,       bg: 'bg-orange-100', text: 'text-orange-700' },
    { label: 'Yeni',         count: report.new_customers, bg: 'bg-green-100',  text: 'text-green-700'  },
    { label: 'Kayıp',        count: report.lost,          bg: 'bg-[#f1f5f9]',  text: 'text-[#94a3b8]'  },
  ]

  return (
    <div className="flex flex-wrap gap-2">
      {pills.map(p => (
        <span
          key={p.label}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${p.bg} ${p.text}`}
        >
          <span className="tabular-nums font-black">{p.count}</span>
          {p.label}
        </span>
      ))}
    </div>
  )
}

// ── Churn alert banner ────────────────────────────────────────────────────────

function ChurnAlert({ report }: { report: CustomerLtvReport }) {
  if (report.high_churn_risk_count === 0) return null

  return (
    <div className="bg-neg-light border border-neg-light rounded px-3 py-2">
      <span className="text-[11px] font-bold text-neg-text">
        ⚠️ {report.high_churn_risk_count} yüksek değerli müşteri kayıp riski altında —{' '}
        toplam LTV: {fmtTRY(report.high_churn_risk_value)}
      </span>
    </div>
  )
}

// ── Top 20 LTV table ──────────────────────────────────────────────────────────

function LtvTable({ customers }: { customers: CustomerLtvProfile[] }) {
  const top20 = customers.slice(0, 20)

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[#f1f5f9]">
            <th className="text-left px-3 py-2 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] w-8">#</th>
            <th className="text-left px-3 py-2 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">Müşteri</th>
            <th className="text-right px-3 py-2 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">LTV</th>
            <th className="text-center px-3 py-2 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">RFM</th>
            <th className="text-center px-3 py-2 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">Segment</th>
            <th className="text-center px-3 py-2 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">Kayıp Riski</th>
            <th className="text-right px-3 py-2 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] hidden sm:table-cell">Son Sipariş</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#f8fafc]">
          {top20.map((c, idx) => {
            const segCfg   = SEGMENT_CFG[c.segment]
            const churnCfg = CHURN_CFG[c.churn_risk]
            return (
              <tr key={`${c.customer_id ?? c.customer_name}-${idx}`} className="hover:bg-[#f8fafc]/60">
                <td className="px-3 py-2.5 tabular-nums text-[#94a3b8] font-medium">{idx + 1}</td>
                <td className="px-3 py-2.5">
                  <div className="text-[11px] font-bold text-[#1e293b] truncate max-w-[160px]" title={c.customer_name}>
                    {c.customer_name}
                  </div>
                  <div className="text-[9px] text-[#94a3b8] tabular-nums">
                    {c.total_orders} sipariş
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right">
                  <div className="text-sm font-black tabular-nums text-brand leading-none">
                    {fmtTRY(c.estimated_ltv)}
                  </div>
                  <div className="text-[9px] text-[#94a3b8] tabular-nums mt-0.5">
                    ort. {fmtTRY(c.avg_order_value)}/sipariş
                  </div>
                </td>
                <td className="px-3 py-2.5 text-center">
                  <span className="inline-block bg-[#f1f5f9] text-[#334155] text-[10px] font-black tabular-nums px-2 py-0.5 rounded">
                    {c.rfm_score}/15
                  </span>
                </td>
                <td className="px-3 py-2.5 text-center">
                  <span className={`inline-block text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded ${segCfg.bg} ${segCfg.text}`}>
                    {segCfg.label}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-center">
                  <span className={`inline-block text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded ${churnCfg.bg} ${churnCfg.text}`}>
                    {churnCfg.label}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right text-[10px] tabular-nums text-[#64748b] hidden sm:table-cell">
                  {fmtDate(c.last_order_date)}
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

interface ApiResponse {
  report: CustomerLtvReport
}

export default function CustomerLtvClient() {
  const { data, isLoading, error } = useQuery<ApiResponse>({
    queryKey: ['customer-ltv'],
    queryFn: async () => {
      const res = await fetch('/api/commercial/customer-ltv')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json() as Promise<ApiResponse>
    },
    staleTime: 60 * 60 * 1000, // 1 hour
  })

  if (isLoading) return <Skeleton />
  if (error || !data?.report) return null

  const { report } = data

  if (report.total_customers === 0) return null

  return (
    <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden space-y-0">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#f1f5f9] flex items-center justify-between">
        <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
          Müşteri Değer Analizi
        </span>
        <span className="text-[9px] text-[#94a3b8]">
          {report.total_customers} müşteri · ort. LTV {fmtTRY(report.avg_ltv)}
        </span>
      </div>

      {/* Body */}
      <div className="px-4 py-3 space-y-3">
        {/* Segment pills */}
        <SegmentPills report={report} />

        {/* Churn alert */}
        <ChurnAlert report={report} />

        {/* Top 10% concentration note */}
        {report.top_10_pct_revenue_share > 0 && (
          <p className="text-[10px] text-[#94a3b8]">
            Top %10 müşteri toplam LTV&apos;nin{' '}
            <strong className="text-[#1e293b]">%{report.top_10_pct_revenue_share.toFixed(0)}&apos;ini</strong>{' '}
            oluşturuyor.
          </p>
        )}
      </div>

      {/* LTV table */}
      {report.customers.length > 0 && (
        <LtvTable customers={report.customers} />
      )}

      {report.customers.length > 20 && (
        <div className="px-4 py-2 border-t border-[#f8fafc] text-[9px] text-[#cbd5e1]">
          Top 20 gösteriliyor · toplam {report.total_customers} müşteri
        </div>
      )}
    </div>
  )
}
