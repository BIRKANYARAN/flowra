'use client'
// ── ProductProfitabilityWaterfall — Product profitability overview ─────────────
// Client island: fetches /api/commercial/product-profitability via TanStack Query,
// renders portfolio summary, tier distribution chips, product table, and
// loss-leader alert.

import { useQuery } from '@tanstack/react-query'
import type {
  ProductProfitabilityReport,
  ProductProfitabilityStats,
} from '@/lib/services/commercial/product-profitability.service'

// ── Helpers ───────────────────────────────────────────────────────────────────

const FMT = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 })
function fmtTRY(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `₺${(n / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000)     return `₺${(n / 1_000).toFixed(1)}K`
  return `₺${FMT.format(Math.round(n))}`
}

function fmtPct(n: number | null): string {
  if (n === null) return '—'
  return `%${n.toFixed(1)}`
}

function marginColor(pct: number | null): string {
  if (pct === null) return 'text-[#94a3b8]'
  if (pct >= 30) return 'text-pos-text'
  if (pct >= 15) return 'text-warn-text'
  return 'text-neg'
}

// ── Tier config ───────────────────────────────────────────────────────────────

type Tier = ProductProfitabilityStats['tier']

const TIER_CONFIG: Record<Tier, { label: string; bg: string; text: string }> = {
  star:             { label: 'Yıldız',        bg: 'bg-amber-100',   text: 'text-amber-800'  },
  hero:             { label: 'Kahraman',       bg: 'bg-emerald-100', text: 'text-emerald-800' },
  workhorse:        { label: 'İş Atı',         bg: 'bg-blue-100',    text: 'text-blue-700'   },
  low_margin:       { label: 'Düşük Marj',     bg: 'bg-yellow-100',  text: 'text-yellow-700' },
  loss_leader:      { label: 'Zarar Eden',     bg: 'bg-neg-light',   text: 'text-neg-text'   },
  insufficient_data: { label: 'Yetersiz Veri', bg: 'bg-[#f1f5f9]',  text: 'text-[#94a3b8]' },
}

// ── API response type ─────────────────────────────────────────────────────────

interface ApiResponse {
  report: ProductProfitabilityReport
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ProductProfitabilityWaterfall() {
  const { data, isLoading, error } = useQuery<ApiResponse>({
    queryKey:  ['product-profitability'],
    queryFn:   async () => {
      const res = await fetch('/api/commercial/product-profitability?months=6')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json() as Promise<ApiResponse>
    },
    staleTime: 5 * 60 * 1000,
  })

  if (isLoading) {
    return (
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft shadow-sm p-6 animate-pulse">
        <div className="h-4 w-48 bg-[#f1f5f9] rounded mb-4" />
        <div className="grid grid-cols-4 gap-3 mb-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-14 bg-[#f1f5f9] rounded" />)}
        </div>
        <div className="h-48 bg-[#f1f5f9] rounded" />
      </div>
    )
  }

  if (error || !data?.report) return null

  const r = data.report
  if (r.products.length === 0) return null

  const lossLeaders = r.loss_leaders
  const lossLeaderTotal = lossLeaders.reduce((s, p) => s + p.gross_profit, 0)

  const tiersAll: Array<{ key: Tier; count: number }> = [
    { key: 'star' as const,        count: r.tier_counts.star        },
    { key: 'hero' as const,        count: r.tier_counts.hero        },
    { key: 'workhorse' as const,   count: r.tier_counts.workhorse   },
    { key: 'low_margin' as const,  count: r.tier_counts.low_margin  },
    { key: 'loss_leader' as const, count: r.tier_counts.loss_leader },
  ]
  const tiers = tiersAll.filter(t => t.count > 0)

  return (
    <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft shadow-sm">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#f1f5f9]">
        <div>
          <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">
            Ürün Karlılığı
          </div>
          <div className="text-xs text-[#64748b] mt-0.5">
            Son {r.period_months} ay · {r.product_count} ürün · {r.as_of_date}
          </div>
        </div>
        <div className="text-[10px] text-[#94a3b8]">
          {r.narrative}
        </div>
      </div>

      {/* ── Portfolio summary strip ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-0 border-b border-[#f1f5f9]">
        {[
          {
            label: 'Portföy Brüt Marjı',
            value: fmtPct(r.portfolio_gross_margin_pct),
            color: marginColor(r.portfolio_gross_margin_pct),
          },
          {
            label: 'Ağırlıklı Ort. Marj',
            value: fmtPct(r.weighted_avg_margin_pct),
            color: marginColor(r.weighted_avg_margin_pct),
          },
          {
            label: 'İlk 5 Yoğunlaşma',
            value: fmtPct(r.top5_revenue_concentration_pct),
            color: 'text-[#0f172a]',
          },
        ].map((card, i) => (
          <div key={card.label} className={`p-3 ${i < 2 ? 'border-b sm:border-b-0 sm:border-r border-[#e8eaef]' : ''}`}>
            <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">{card.label}</div>
            <div className={`text-xl font-black tabular-nums leading-none ${card.color}`}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* ── Tier distribution chips ─────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#f1f5f9] flex-wrap">
        <span className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mr-1">Tier Dağılımı</span>
        {tiers.map(({ key, count }) => {
          const cfg = TIER_CONFIG[key]
          return (
            <span key={key} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold ${cfg.bg} ${cfg.text}`}>
              {cfg.label} <span className="font-black">{count}</span>
            </span>
          )
        })}
      </div>

      {/* ── Loss-leader alert ────────────────────────────────────────────────── */}
      {lossLeaders.length > 0 && (
        <div className="px-4 py-2.5 bg-neg-light border-b border-neg/20 text-xs text-neg-text font-semibold flex items-center gap-2">
          <span>{lossLeaders.length} ürün maliyetin altında satılıyor — toplam {fmtTRY(lossLeaderTotal)} brüt zarar</span>
        </div>
      )}

      {/* ── Product table ─────────────────────────────────────────────────────── */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[#f1f5f9]">
              <th className="text-left px-4 py-2 text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">Ürün</th>
              <th className="text-right px-4 py-2 text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">Gelir</th>
              <th className="text-right px-4 py-2 text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">Brüt Marj %</th>
              <th className="text-right px-4 py-2 text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">Katkı Marjı</th>
              <th className="text-right px-4 py-2 text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">Katkı %</th>
            </tr>
          </thead>
          <tbody>
            {r.products.map((p: ProductProfitabilityStats) => {
              const cfg = TIER_CONFIG[p.tier]
              const cmColor = p.contribution_margin > 0 ? 'text-pos-text'
                : p.contribution_margin < 0 ? 'text-neg'
                : 'text-[#64748b]'
              return (
                <tr key={p.product_id} className="border-b border-[#f8fafc] hover:bg-[#fafafa]">
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <div>
                        <div className="font-semibold text-[#0f172a]">{p.product_name}</div>
                        {p.category && <div className="text-[10px] text-[#94a3b8]">{p.category}</div>}
                      </div>
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-black ${cfg.bg} ${cfg.text}`}>
                        {cfg.label}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    <div className="font-semibold text-[#0f172a]">{fmtTRY(p.revenue)}</div>
                    <div className="text-[10px] text-[#94a3b8]">{fmtPct(p.revenue_share)}</div>
                  </td>
                  <td className={`px-4 py-2 text-right tabular-nums font-semibold ${marginColor(p.gross_margin_pct)}`}>
                    {fmtPct(p.gross_margin_pct)}
                  </td>
                  <td className={`px-4 py-2 text-right tabular-nums font-black text-sm ${cmColor}`}>
                    {fmtTRY(p.contribution_margin)}
                  </td>
                  <td className={`px-4 py-2 text-right tabular-nums font-semibold ${cmColor}`}>
                    {fmtPct(p.contribution_margin_ratio)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

    </div>
  )
}
