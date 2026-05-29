'use client'
// ── CustomerLtvEnhancedClient — Enhanced Customer LTV Analysis ───────────────
// Client island: fetches /api/commercial/customer-ltv-enhanced via TanStack Query.
// Shows portfolio summary, segment distribution, CLV tier breakdown,
// top customers table, and at-risk alert.

import { useQuery } from '@tanstack/react-query'
import type {
  CustomerLtvEnhancedReport,
  LtvEstimate,
} from '@/lib/services/commercial/customer-ltv-enhanced.service'

// ── Format helpers ────────────────────────────────────────────────────────────

const TRY_FMT = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 })

function fmtTRY(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `₺${(n / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000)     return `₺${(n / 1_000).toFixed(1)}B`
  return `₺${TRY_FMT.format(Math.round(n))}`
}

function fmtPct(n: number): string {
  return `%${(n * 100).toFixed(0)}`
}

// ── Segment config ────────────────────────────────────────────────────────────

type LtvSegment = LtvEstimate['ltv_segment']
type ClvTier    = LtvEstimate['clv_tier']

const SEGMENT_CFG: Record<LtvSegment, { label: string; bg: string; text: string }> = {
  champion:  { label: 'Şampiyon',     bg: 'bg-purple-100', text: 'text-purple-700' },
  loyal:     { label: 'Sadık',        bg: 'bg-blue-100',   text: 'text-blue-700'   },
  potential: { label: 'Potansiyel',   bg: 'bg-green-100',  text: 'text-green-700'  },
  at_risk:   { label: 'Risk Altında', bg: 'bg-orange-100', text: 'text-orange-700' },
  lost:      { label: 'Kayıp',        bg: 'bg-[#f1f5f9]',  text: 'text-[#94a3b8]'  },
}

const TIER_CFG: Record<ClvTier, { label: string; bg: string; text: string; dot: string }> = {
  platinum: { label: 'Platin', bg: 'bg-[#f0f4ff]', text: 'text-[#3b4fd9]', dot: 'bg-[#3b4fd9]' },
  gold:     { label: 'Altın',  bg: 'bg-[#fffbeb]', text: 'text-[#b45309]', dot: 'bg-[#f59e0b]' },
  silver:   { label: 'Gümüş', bg: 'bg-[#f1f5f9]', text: 'text-[#475569]', dot: 'bg-[#94a3b8]' },
  bronze:   { label: 'Bronz', bg: 'bg-[#fef3c7]', text: 'text-[#92400e]', dot: 'bg-[#d97706]' },
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="bg-white border border-[#e2e8f0] rounded px-4 py-3 space-y-3 animate-pulse">
      <div className="h-3 w-48 bg-[#f1f5f9] rounded" />
      <div className="grid grid-cols-3 gap-2">
        {[0, 1, 2].map(i => (
          <div key={i} className="h-14 bg-[#f8fafc] rounded" />
        ))}
      </div>
      <div className="h-40 bg-[#f8fafc] rounded" />
    </div>
  )
}

// ── Portfolio summary cards ───────────────────────────────────────────────────

function PortfolioSummary({ report }: { report: CustomerLtvEnhancedReport }) {
  const { portfolio_stats, retention_rate, customer_count } = report

  const cards = [
    {
      label: '5 Yıllık Projeksiyon',
      value: fmtTRY(portfolio_stats.total_projected_5yr),
      sub:   `${customer_count} müşteri`,
    },
    {
      label: 'Ort. Müşteri LTV',
      value: fmtTRY(portfolio_stats.avg_projected_5yr),
      sub:   `Medyan: ${fmtTRY(portfolio_stats.median_projected_5yr)}`,
    },
    {
      label: 'Yıllık Elde Tutma',
      value: retention_rate !== null ? fmtPct(retention_rate) : '—',
      sub:   'Geçen yıla kıyasla',
    },
  ]

  return (
    <div className="grid grid-cols-3 gap-2">
      {cards.map(c => (
        <div key={c.label} className="bg-[#f8fafc] rounded px-3 py-2.5">
          <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-0.5">
            {c.label}
          </div>
          <div className="text-sm font-black tabular-nums text-[#1e293b] leading-none">
            {c.value}
          </div>
          <div className="text-[9px] text-[#94a3b8] mt-0.5">{c.sub}</div>
        </div>
      ))}
    </div>
  )
}

// ── Segment distribution ──────────────────────────────────────────────────────

function SegmentDistribution({ estimates }: { estimates: LtvEstimate[] }) {
  if (estimates.length === 0) return null

  const counts: Record<LtvSegment, number> = {
    champion: 0, loyal: 0, potential: 0, at_risk: 0, lost: 0,
  }
  for (const e of estimates) counts[e.ltv_segment] += 1

  const segments: LtvSegment[] = ['champion', 'loyal', 'potential', 'at_risk', 'lost']

  return (
    <div>
      <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-1.5">
        Segment Dağılımı
      </div>
      <div className="flex flex-wrap gap-1.5">
        {segments.map(seg => {
          const cfg = SEGMENT_CFG[seg]
          if (counts[seg] === 0) return null
          return (
            <span
              key={seg}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${cfg.bg} ${cfg.text}`}
            >
              <span className="font-black tabular-nums">{counts[seg]}</span>
              {cfg.label}
            </span>
          )
        })}
      </div>
    </div>
  )
}

// ── CLV tier breakdown ────────────────────────────────────────────────────────

function TierBreakdown({ estimates }: { estimates: LtvEstimate[] }) {
  if (estimates.length === 0) return null

  const counts: Record<ClvTier, number> = {
    platinum: 0, gold: 0, silver: 0, bronze: 0,
  }
  for (const e of estimates) counts[e.clv_tier] += 1

  const tiers: ClvTier[] = ['platinum', 'gold', 'silver', 'bronze']

  return (
    <div>
      <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-1.5">
        CLV Seviyesi
      </div>
      <div className="flex flex-wrap gap-1.5">
        {tiers.map(tier => {
          const cfg = TIER_CFG[tier]
          if (counts[tier] === 0) return null
          return (
            <span
              key={tier}
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${cfg.bg} ${cfg.text}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
              <span className="font-black tabular-nums">{counts[tier]}</span>
              {cfg.label}
            </span>
          )
        })}
      </div>
    </div>
  )
}

// ── At-risk alert banner ──────────────────────────────────────────────────────

function AtRiskAlert({ atRiskCustomers, totalCustomers }: {
  atRiskCustomers: LtvEstimate[]
  totalCustomers: number
}) {
  if (atRiskCustomers.length === 0) return null

  const totalAtRiskValue = atRiskCustomers.reduce((s, e) => s + e.expected_remaining_value, 0)
  const isHighRisk = atRiskCustomers.length > totalCustomers * 0.3

  return (
    <div className={`border rounded px-3 py-2 ${isHighRisk ? 'bg-neg-light border-neg-light' : 'bg-orange-50 border-orange-100'}`}>
      <span className={`text-[11px] font-bold ${isHighRisk ? 'text-neg-text' : 'text-orange-700'}`}>
        {isHighRisk ? '⚠️ ' : ''}
        {atRiskCustomers.length} müşteri kayıp riski altında — beklenen değer: {fmtTRY(totalAtRiskValue)}
        {isHighRisk && ' (yüksek risk)'}
      </span>
    </div>
  )
}

// ── Top customers table ───────────────────────────────────────────────────────

function TopCustomersTable({ customers }: { customers: LtvEstimate[] }) {
  if (customers.length === 0) return null

  return (
    <div className="overflow-x-auto">
      <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] px-3 py-2 border-b border-[#f1f5f9]">
        Top 10 Müşteri (5 Yıllık LTV)
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[#f1f5f9]">
            <th className="text-left px-3 py-2 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] w-6">#</th>
            <th className="text-left px-3 py-2 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">Müşteri</th>
            <th className="text-right px-3 py-2 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">5 Yıl LTV</th>
            <th className="text-right px-3 py-2 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] hidden sm:table-cell">Marjlı LTV</th>
            <th className="text-center px-3 py-2 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">Segment</th>
            <th className="text-center px-3 py-2 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">Seviye</th>
            <th className="text-right px-3 py-2 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] hidden md:table-cell">Kayıp Risk</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#f8fafc]">
          {customers.map((c, idx) => {
            const segCfg  = SEGMENT_CFG[c.ltv_segment]
            const tierCfg = TIER_CFG[c.clv_tier]
            return (
              <tr key={`${c.customer_id}-${idx}`} className="hover:bg-[#f8fafc]/60">
                <td className="px-3 py-2.5 tabular-nums text-[#94a3b8] font-medium">{idx + 1}</td>
                <td className="px-3 py-2.5">
                  <div className="text-[11px] font-bold text-[#1e293b] truncate max-w-[140px]" title={c.customer_id}>
                    {c.customer_id}
                  </div>
                  <div className="text-[9px] text-[#94a3b8] tabular-nums">
                    Geçmiş: {fmtTRY(c.historical_ltv)}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right">
                  <div className="text-sm font-black tabular-nums text-brand leading-none">
                    {fmtTRY(c.projected_ltv_5yr)}
                  </div>
                  <div className="text-[9px] text-[#94a3b8] tabular-nums mt-0.5">
                    Beklenen: {fmtTRY(c.expected_remaining_value)}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-[10px] text-[#64748b] hidden sm:table-cell">
                  {fmtTRY(c.margin_adjusted_ltv)}
                </td>
                <td className="px-3 py-2.5 text-center">
                  <span className={`inline-block text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded ${segCfg.bg} ${segCfg.text}`}>
                    {segCfg.label}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-center">
                  <span className={`inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded ${tierCfg.bg} ${tierCfg.text}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${tierCfg.dot}`} />
                    {tierCfg.label}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-[10px] text-[#64748b] hidden md:table-cell">
                  {fmtPct(c.churn_probability)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Narrative section ─────────────────────────────────────────────────────────

function Narrative({ text }: { text: string }) {
  if (!text) return null
  return (
    <p className="text-[10px] text-[#64748b] leading-relaxed px-4 py-2 border-t border-[#f8fafc]">
      {text}
    </p>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface ApiResponse {
  report: CustomerLtvEnhancedReport
}

export default function CustomerLtvEnhancedClient() {
  const { data, isLoading, error } = useQuery<ApiResponse>({
    queryKey: ['customer-ltv-enhanced'],
    queryFn: async () => {
      const res = await fetch('/api/commercial/customer-ltv-enhanced')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json() as Promise<ApiResponse>
    },
    staleTime: 60 * 60 * 1000, // 1 hour
  })

  if (isLoading) return <Skeleton />
  if (error || !data?.report) return null

  const { report } = data

  if (report.customer_count === 0) return null

  return (
    <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#f1f5f9] flex items-center justify-between">
        <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
          Gelişmiş Müşteri Yaşam Boyu Değeri
        </span>
        <span className="text-[9px] text-[#94a3b8]">
          {report.customer_count} müşteri
        </span>
      </div>

      {/* Body */}
      <div className="px-4 py-3 space-y-3">
        {/* Portfolio summary */}
        <PortfolioSummary report={report} />

        {/* Segment distribution */}
        <SegmentDistribution estimates={report.customer_estimates} />

        {/* CLV tier breakdown */}
        <TierBreakdown estimates={report.customer_estimates} />

        {/* At-risk alert */}
        <AtRiskAlert
          atRiskCustomers={report.at_risk_customers}
          totalCustomers={report.customer_count}
        />
      </div>

      {/* Top customers table */}
      {report.top_customers_by_ltv.length > 0 && (
        <TopCustomersTable customers={report.top_customers_by_ltv} />
      )}

      {/* Narrative */}
      <Narrative text={report.narrative} />
    </div>
  )
}
