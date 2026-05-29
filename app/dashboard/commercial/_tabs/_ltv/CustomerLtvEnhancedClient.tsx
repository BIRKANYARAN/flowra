'use client'
// ── CustomerLtvEnhancedClient — Enhanced Customer LTV Analysis ───────────────
// Client island: fetches /api/commercial/customer-ltv-enhanced via TanStack Query.
// Shows portfolio summary, LTV:CAC health, revenue concentration, top customers,
// payback period breakdown, and narrative.

import { useQuery } from '@tanstack/react-query'
import type {
  CustomerLtvReport,
} from '@/lib/services/commercial/customer-ltv-enhanced.service'

// ── Format helpers ────────────────────────────────────────────────────────────

const TRY_FMT = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 })

function fmtTRY(n: number | null): string {
  if (n === null) return '—'
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `₺${(n / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000)     return `₺${(n / 1_000).toFixed(1)}B`
  return `₺${TRY_FMT.format(Math.round(n))}`
}

function fmtPct(n: number | null): string {
  if (n === null) return '—'
  return `%${n.toFixed(0)}`
}

function fmtRatio(n: number | null): string {
  if (n === null) return '—'
  return `${n.toFixed(1)}x`
}

// ── Health badge configs ──────────────────────────────────────────────────────

type LtvCacHealth = CustomerLtvReport['ltv_cac_health']
type LtvTier      = CustomerLtvReport['per_customer'][number]['ltv_tier']
type PaybackHealth = CustomerLtvReport['per_customer'][number]['payback_health']

const LTV_CAC_CFG: Record<LtvCacHealth, { label: string; bg: string; text: string }> = {
  excellent:         { label: 'Mükemmel',  bg: 'bg-green-100',   text: 'text-green-700'  },
  good:              { label: 'İyi',        bg: 'bg-blue-100',    text: 'text-blue-700'   },
  acceptable:        { label: 'Kabul Ed.',  bg: 'bg-yellow-100',  text: 'text-yellow-700' },
  poor:              { label: 'Zayıf',      bg: 'bg-orange-100',  text: 'text-orange-700' },
  critical:          { label: 'Kritik',     bg: 'bg-red-100',     text: 'text-red-700'    },
  insufficient_data: { label: 'Veri Yok',   bg: 'bg-[#f1f5f9]',  text: 'text-[#94a3b8]'  },
}

const TIER_CFG: Record<LtvTier, { label: string; bg: string; text: string }> = {
  champion:          { label: 'Şampiyon',  bg: 'bg-purple-100', text: 'text-purple-700' },
  high_value:        { label: 'Yüksek',    bg: 'bg-blue-100',   text: 'text-blue-700'   },
  mid_value:         { label: 'Orta',      bg: 'bg-green-100',  text: 'text-green-700'  },
  low_value:         { label: 'Düşük',     bg: 'bg-[#f1f5f9]',  text: 'text-[#94a3b8]'  },
  insufficient_data: { label: 'Bilinmiyor', bg: 'bg-[#f8fafc]', text: 'text-[#cbd5e1]'  },
}

const PAYBACK_CFG: Record<PaybackHealth, { label: string; bg: string; text: string }> = {
  immediate:         { label: '≤3 Ay',   bg: 'bg-green-100',  text: 'text-green-700'  },
  fast:              { label: '≤6 Ay',   bg: 'bg-blue-100',   text: 'text-blue-700'   },
  moderate:          { label: '≤12 Ay',  bg: 'bg-yellow-100', text: 'text-yellow-700' },
  slow:              { label: '≤24 Ay',  bg: 'bg-orange-100', text: 'text-orange-700' },
  very_slow:         { label: '>24 Ay',  bg: 'bg-red-100',    text: 'text-red-700'    },
  insufficient_data: { label: '—',       bg: 'bg-[#f1f5f9]',  text: 'text-[#94a3b8]'  },
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

function PortfolioSummary({ report }: { report: CustomerLtvReport }) {
  const health = LTV_CAC_CFG[report.ltv_cac_health]

  const cards = [
    {
      label: 'Ort. LTV',
      value: fmtTRY(report.portfolio_avg_ltv),
      sub:   `Medyan: ${fmtTRY(report.portfolio_median_ltv)}`,
    },
    {
      label: 'LTV:CAC Oranı',
      value: fmtRatio(report.ltv_cac_ratio),
      sub:   health.label,
      subCfg: health,
    },
    {
      label: 'Net Gelir Ret.',
      value: report.net_revenue_retention_pct !== null ? `%${report.net_revenue_retention_pct.toFixed(0)}` : '—',
      sub:   'Son ay / önceki ay',
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
          {'subCfg' in c && c.subCfg ? (
            <span className={`inline-block text-[9px] font-bold mt-0.5 px-1 rounded ${c.subCfg.bg} ${c.subCfg.text}`}>
              {c.sub}
            </span>
          ) : (
            <div className="text-[9px] text-[#94a3b8] mt-0.5">{c.sub}</div>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Concentration info ────────────────────────────────────────────────────────

function ConcentrationInfo({ report }: { report: CustomerLtvReport }) {
  const { revenue_concentration, top_customer_revenue_pct, revenue_concentration_hhi } = report

  const concLabel: Record<typeof revenue_concentration, { label: string; color: string }> = {
    diversified:       { label: 'Çeşitlendirilmiş', color: 'text-green-600'  },
    moderate:          { label: 'Orta',              color: 'text-blue-600'   },
    concentrated:      { label: 'Yoğunlaşmış',      color: 'text-yellow-600' },
    highly_concentrated: { label: 'Yüksek Yoğun.',  color: 'text-orange-600' },
    monopoly:          { label: 'Tekelci',           color: 'text-red-600'    },
    insufficient_data: { label: '—',                 color: 'text-[#94a3b8]'  },
  }

  const cfg = concLabel[revenue_concentration]

  return (
    <div className="flex items-center gap-3 text-xs">
      <div>
        <span className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">Gelir Yoğunlaşması</span>
        <span className={`ml-2 font-bold text-[10px] ${cfg.color}`}>{cfg.label}</span>
        {revenue_concentration_hhi !== null && (
          <span className="ml-1 text-[9px] text-[#94a3b8]">HHI: {revenue_concentration_hhi.toFixed(2)}</span>
        )}
      </div>
      {top_customer_revenue_pct !== null && (
        <div className="text-[9px] text-[#94a3b8]">
          Top müşteri: <span className="font-bold text-[#475569]">{fmtPct(top_customer_revenue_pct)}</span>
        </div>
      )}
    </div>
  )
}

// ── Per-customer table ────────────────────────────────────────────────────────

type CustomerRow = CustomerLtvReport['per_customer'][number]

function CustomerTable({ customers }: { customers: CustomerRow[] }) {
  if (customers.length === 0) return null

  const topN = customers.slice(0, 10)

  return (
    <div className="overflow-x-auto">
      <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] px-3 py-2 border-b border-[#f1f5f9]">
        Top 10 Müşteri (Gelire Göre)
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[#f1f5f9]">
            <th className="text-left px-3 py-2 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] w-6">#</th>
            <th className="text-left px-3 py-2 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">Müşteri</th>
            <th className="text-right px-3 py-2 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">Toplam Gelir</th>
            <th className="text-right px-3 py-2 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] hidden sm:table-cell">LTV (Basit)</th>
            <th className="text-right px-3 py-2 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] hidden sm:table-cell">Marjlı LTV</th>
            <th className="text-center px-3 py-2 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">Tier</th>
            <th className="text-center px-3 py-2 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] hidden md:table-cell">Geri Ödeme</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#f8fafc]">
          {topN.map((c, idx) => {
            const tierCfg    = TIER_CFG[c.ltv_tier]
            const paybackCfg = PAYBACK_CFG[c.payback_health]
            return (
              <tr key={`${c.customer_id}-${idx}`} className="hover:bg-[#f8fafc]/60">
                <td className="px-3 py-2.5 tabular-nums text-[#94a3b8] font-medium">{idx + 1}</td>
                <td className="px-3 py-2.5">
                  <div className="text-[11px] font-bold text-[#1e293b] truncate max-w-[140px]" title={c.customer_name}>
                    {c.customer_name}
                  </div>
                  <div className="text-[9px] text-[#94a3b8] tabular-nums">
                    {c.order_count} sipariş · {c.active_months} ay aktif
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right">
                  <div className="text-sm font-black tabular-nums text-brand leading-none">
                    {fmtTRY(c.total_revenue_try)}
                  </div>
                  <div className="text-[9px] text-[#94a3b8] tabular-nums mt-0.5">
                    AOV: {fmtTRY(c.avg_order_value)}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-[10px] text-[#64748b] hidden sm:table-cell">
                  {fmtTRY(c.simple_ltv)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-[10px] text-[#64748b] hidden sm:table-cell">
                  {fmtTRY(c.margin_adjusted_ltv)}
                </td>
                <td className="px-3 py-2.5 text-center">
                  <span className={`inline-block text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded ${tierCfg.bg} ${tierCfg.text}`}>
                    {tierCfg.label}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-center hidden md:table-cell">
                  <span className={`inline-block text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded ${paybackCfg.bg} ${paybackCfg.text}`}>
                    {paybackCfg.label}
                  </span>
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
  report: CustomerLtvReport
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

  if (report.per_customer.length === 0) return null

  return (
    <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#f1f5f9] flex items-center justify-between">
        <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
          Gelişmiş Müşteri Yaşam Boyu Değeri
        </span>
        <span className="text-[9px] text-[#94a3b8]">
          {report.per_customer.length} müşteri · {report.period_months} ay
        </span>
      </div>

      {/* Body */}
      <div className="px-4 py-3 space-y-3">
        {/* Portfolio summary */}
        <PortfolioSummary report={report} />

        {/* Revenue concentration */}
        <ConcentrationInfo report={report} />
      </div>

      {/* Top customers table */}
      <CustomerTable customers={report.per_customer} />

      {/* Narrative */}
      <Narrative text={report.narrative} />
    </div>
  )
}
