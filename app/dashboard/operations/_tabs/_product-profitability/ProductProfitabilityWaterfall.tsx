'use client'
// ── ProductProfitabilityWaterfall — True product profitability waterfall ───────
// Client island: fetches /api/commercial/product-profitability via TanStack Query,
// renders portfolio summary, tier distribution chips, product waterfall table,
// and loss-maker alert.

import { useQuery } from '@tanstack/react-query'
import type { ProductWaterfall, ProductProfitabilityReport } from '@/lib/services/commercial/product-profitability.service'
import type { ProfitabilityTier } from '@/lib/services/commercial/product-profitability.service'

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

// ── Tier config ───────────────────────────────────────────────────────────────

const TIER_CONFIG: Record<ProfitabilityTier, { label: string; bg: string; text: string }> = {
  star:        { label: 'Yıldız',   bg: 'bg-purple-100', text: 'text-purple-700' },
  profitable:  { label: 'Kârlı',   bg: 'bg-pos-light',  text: 'text-pos-text'  },
  marginal:    { label: 'Sınırlı', bg: 'bg-warn-light', text: 'text-warn-text' },
  loss_maker:  { label: 'Zararlı', bg: 'bg-neg-light',  text: 'text-neg-text'  },
}

function cmColor(cm: number): string {
  if (cm > 0)  return 'text-pos-text'
  if (cm < 0)  return 'text-neg'
  return 'text-[#64748b]'
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
      const res = await fetch('/api/commercial/product-profitability?months=12')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json() as Promise<ApiResponse>
    },
    staleTime: 5 * 60 * 1000,
  })

  if (isLoading) {
    return (
      <div className="bg-white border border-[#e2e8f0] rounded shadow-sm p-6 animate-pulse">
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

  const lossMakers = r.products.filter(p => p.tier === 'loss_maker')
  const lossMakerTotal = lossMakers.reduce((s, p) => s + p.contribution_margin, 0)

  return (
    <div className="bg-white border border-[#e2e8f0] rounded shadow-sm">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#f1f5f9]">
        <div>
          <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">
            Ürün Kârlılık Şelalesi
          </div>
          <div className="text-xs text-[#64748b] mt-0.5">
            Son {r.period_months} ay · Gelir → SMM → Brüt Kâr → OpEx → Katkı Marjı
          </div>
        </div>
        <div className="text-[10px] text-[#94a3b8]">
          {r.analysis_from.slice(0, 7)} – {r.analysis_to.slice(0, 7)}
        </div>
      </div>

      {/* ── Portfolio summary strip ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 border-b border-[#f1f5f9]">
        {[
          {
            label: 'Toplam Gelir',
            value: fmtTRY(r.total_revenue),
            sub:   `${r.products.length} ürün`,
            color: 'text-[#0f172a]',
          },
          {
            label: 'Brüt Marj',
            value: fmtPct(r.portfolio_gross_margin_pct),
            sub:   `SMM: ${fmtTRY(r.total_cogs)}`,
            color: r.portfolio_gross_margin_pct === null ? 'text-[#94a3b8]'
              : r.portfolio_gross_margin_pct >= 30 ? 'text-pos-text'
              : r.portfolio_gross_margin_pct >= 15 ? 'text-warn-text'
              : 'text-neg',
          },
          {
            label: 'Katkı Marjı',
            value: fmtPct(r.portfolio_contribution_margin_pct),
            sub:   `Attr. OpEx: ${fmtTRY(r.total_attributed_opex)}`,
            color: r.portfolio_contribution_margin_pct === null ? 'text-[#94a3b8]'
              : r.portfolio_contribution_margin_pct >= 15 ? 'text-pos-text'
              : r.portfolio_contribution_margin_pct >= 0  ? 'text-warn-text'
              : 'text-neg',
          },
          {
            label: 'Toplam Katkı',
            value: fmtTRY(r.total_contribution_margin),
            sub:   `Brüt kâr: ${fmtTRY(r.total_gross_profit)}`,
            color: r.total_contribution_margin >= 0 ? 'text-pos-text' : 'text-neg',
          },
        ].map((card, i) => (
          <div key={card.label} className={`p-3 ${i < 3 ? 'border-b sm:border-b-0 sm:border-r border-[#e2e8f0]' : ''}`}>
            <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">{card.label}</div>
            <div className={`text-xl font-black tabular-nums leading-none ${card.color}`}>{card.value}</div>
            <div className="text-[10px] text-[#94a3b8] mt-1 truncate" title={card.sub}>{card.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Tier distribution chips ─────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#f1f5f9] flex-wrap">
        <span className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mr-1">Tier Dağılımı</span>
        {(
          [
            { tier: 'star'       as ProfitabilityTier, count: r.star_count       },
            { tier: 'profitable' as ProfitabilityTier, count: r.profitable_count },
            { tier: 'marginal'   as ProfitabilityTier, count: r.marginal_count   },
            { tier: 'loss_maker' as ProfitabilityTier, count: r.loss_maker_count },
          ] as Array<{ tier: ProfitabilityTier; count: number }>
        ).map(({ tier, count }) => {
          const cfg = TIER_CONFIG[tier]
          return (
            <span key={tier} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold ${cfg.bg} ${cfg.text}`}>
              {cfg.label} <span className="font-black">{count}</span>
            </span>
          )
        })}
      </div>

      {/* ── Loss-maker alert ────────────────────────────────────────────────── */}
      {lossMakers.length > 0 && (
        <div className="px-4 py-2.5 bg-neg-light border-b border-neg/20 text-xs text-neg-text font-semibold flex items-center gap-2">
          <span>⚠ {lossMakers.length} ürün zarar üretiyor — toplam {fmtTRY(lossMakerTotal)} contribution margin</span>
        </div>
      )}

      {/* ── Product waterfall table ─────────────────────────────────────────── */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[#f1f5f9]">
              <th className="text-left px-4 py-2 text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">Ürün</th>
              <th className="text-right px-4 py-2 text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">Gelir</th>
              <th className="text-right px-4 py-2 text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">Brüt Marj %</th>
              <th className="text-right px-4 py-2 text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">Attr. OpEx</th>
              <th className="text-right px-4 py-2 text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">Katkı Marjı</th>
              <th className="text-right px-4 py-2 text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">Katkı %</th>
              <th className="text-right px-4 py-2 text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">Başabaş Adet</th>
            </tr>
          </thead>
          <tbody>
            {r.products.map((p: ProductWaterfall) => {
              const cfg = TIER_CONFIG[p.tier]
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
                    <div className="text-[10px] text-[#94a3b8]">%{p.revenue_share_pct.toFixed(1)}</div>
                  </td>
                  <td className={`px-4 py-2 text-right tabular-nums font-semibold ${
                    p.gross_margin_pct === null ? 'text-[#94a3b8]'
                      : p.gross_margin_pct >= 30 ? 'text-pos-text'
                      : p.gross_margin_pct >= 15 ? 'text-warn-text'
                      : 'text-neg'
                  }`}>
                    {fmtPct(p.gross_margin_pct)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-[#64748b]">
                    {fmtTRY(p.attributed_opex)}
                  </td>
                  <td className={`px-4 py-2 text-right tabular-nums font-black text-sm ${cmColor(p.contribution_margin)}`}>
                    {fmtTRY(p.contribution_margin)}
                  </td>
                  <td className={`px-4 py-2 text-right tabular-nums font-semibold ${cmColor(p.contribution_margin)}`}>
                    {fmtPct(p.contribution_margin_pct)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-[#64748b]">
                    {p.breakeven_units !== null
                      ? FMT.format(Math.ceil(p.breakeven_units))
                      : '—'}
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
