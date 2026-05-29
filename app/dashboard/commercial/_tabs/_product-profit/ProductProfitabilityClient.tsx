'use client'
// ── ProductProfitabilityClient — Per-Product P&L and Profitability Ranking ───
// Fetches /api/commercial/product-profitability via TanStack Query.
// Features:
//   • Portfolio summary: gross margin %, top5 concentration, tier distribution pills
//   • Products table: name, tier badge, revenue, margin%, trend indicator
//   • Top 5 by revenue + top 5 by margin (two small lists)
//   • Loss leaders section (if any)
//   • Narrative footer

import { useQuery } from '@tanstack/react-query'
import {
  Panel,
  PanelHeader,
  KpiStrip,
  KpiCell,
  EmptySlate,
  Skeleton,
} from '@/components/ds'
import type {
  ProductProfitabilityReport,
  ProductProfitabilityStats,
} from '@/lib/services/commercial/product-profitability.service'

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

function fmtPct(n: number | null | undefined, showSign = false): string {
  if (n === null || n === undefined) return '—'
  const sign = showSign && n > 0 ? '+' : ''
  return `${sign}%${PCT_FMT.format(n)}`
}

// ── Tier badge ────────────────────────────────────────────────────────────────

const TIER_CFG = {
  star:             { label: 'Yıldız',        bg: 'bg-amber-100',   text: 'text-amber-800'  },
  hero:             { label: 'Kahraman',       bg: 'bg-emerald-100', text: 'text-emerald-800' },
  workhorse:        { label: 'İş Atı',         bg: 'bg-blue-100',    text: 'text-blue-700'   },
  low_margin:       { label: 'Düşük Marj',     bg: 'bg-yellow-100',  text: 'text-yellow-700' },
  loss_leader:      { label: 'Zarar Eden',     bg: 'bg-red-100',     text: 'text-red-700'    },
  insufficient_data: { label: 'Yetersiz Veri', bg: 'bg-[#f1f5f9]',  text: 'text-[#94a3b8]' },
} as const

type Tier = keyof typeof TIER_CFG

function TierBadge({ tier }: { tier: Tier }) {
  const cfg = TIER_CFG[tier]
  return (
    <span
      className={`inline-block text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.text}`}
    >
      {cfg.label}
    </span>
  )
}

// ── Trend indicator ───────────────────────────────────────────────────────────

type Trend = ProductProfitabilityStats['trend']

function TrendIcon({ trend }: { trend: Trend }) {
  switch (trend) {
    case 'growing':          return <span className="text-emerald-600 font-bold text-xs" title="Büyüyor">↑</span>
    case 'stable':           return <span className="text-[#94a3b8] text-xs" title="Stabil">→</span>
    case 'declining':        return <span className="text-orange-500 font-bold text-xs" title="Azalıyor">↓</span>
    case 'rapidly_declining':return <span className="text-red-600 font-bold text-xs" title="Hızlı Düşüş">↓↓</span>
    case 'new_product':      return <span className="text-blue-500 font-bold text-xs" title="Yeni Ürün">★</span>
    case 'discontinued':     return <span className="text-[#94a3b8] text-xs" title="Durduruldu">✕</span>
  }
}

// ── Tier distribution pills ───────────────────────────────────────────────────

function TierDistribution({
  counts,
}: {
  counts: ProductProfitabilityReport['tier_counts']
}) {
  const allEntries: Array<{ key: Tier; count: number }> = [
    { key: 'star' as const,             count: counts.star             },
    { key: 'hero' as const,             count: counts.hero             },
    { key: 'workhorse' as const,        count: counts.workhorse        },
    { key: 'low_margin' as const,       count: counts.low_margin       },
    { key: 'loss_leader' as const,      count: counts.loss_leader      },
    { key: 'insufficient_data' as const, count: counts.insufficient_data },
  ]
  const entries = allEntries.filter(e => e.count > 0)

  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map(e => (
        <span
          key={e.key}
          className={`inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${TIER_CFG[e.key].bg} ${TIER_CFG[e.key].text}`}
        >
          {TIER_CFG[e.key].label}
          <span className="font-black">{e.count}</span>
        </span>
      ))}
    </div>
  )
}

// ── Product row ───────────────────────────────────────────────────────────────

function ProductRow({ product }: { product: ProductProfitabilityStats }) {
  const marginColor =
    product.gross_margin_pct === null ? 'text-[#94a3b8]'
    : product.gross_margin_pct < 0 ? 'text-red-600'
    : product.gross_margin_pct >= 30 ? 'text-emerald-700'
    : 'text-[#0f172a]'

  return (
    <div className="flex items-center justify-between py-1.5 border-b border-[#f1f5f9] last:border-0 gap-2">
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        <TrendIcon trend={product.trend} />
        <span className="text-[10px] text-[#0f172a] truncate" title={product.product_name}>
          {product.product_name}
        </span>
      </div>
      <div className="shrink-0">
        <TierBadge tier={product.tier} />
      </div>
      <div className="w-20 shrink-0 text-[10px] text-right text-[#0f172a] tabular-nums font-medium">
        {fmtTRY(product.revenue)}
      </div>
      <div className={`w-14 shrink-0 text-[10px] text-right tabular-nums font-semibold ${marginColor}`}>
        {fmtPct(product.gross_margin_pct)}
      </div>
    </div>
  )
}

// ── Mini product list ─────────────────────────────────────────────────────────

function MiniProductList({
  title,
  products,
  metricLabel,
  getMetric,
}: {
  title: string
  products: ProductProfitabilityStats[]
  metricLabel: string
  getMetric: (p: ProductProfitabilityStats) => string
}) {
  if (products.length === 0) return null
  return (
    <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded p-3">
      <div className="text-[9px] font-semibold uppercase tracking-wide text-[#94a3b8] mb-2">
        {title}
      </div>
      {products.map((p, i) => (
        <div
          key={p.product_id}
          className="flex items-center justify-between py-0.5 gap-2"
        >
          <span className="text-[10px] text-[#475569] w-4 shrink-0 tabular-nums">{i + 1}.</span>
          <span className="text-[10px] text-[#0f172a] truncate flex-1" title={p.product_name}>
            {p.product_name}
          </span>
          <span className="text-[10px] text-[#0f172a] font-semibold tabular-nums shrink-0">
            {getMetric(p)}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ProductProfitabilityClient() {
  const { data, isLoading, error } = useQuery<{ report: ProductProfitabilityReport }>({
    queryKey: ['product-profitability'],
    queryFn: () => fetch('/api/commercial/product-profitability').then(r => r.json()),
    staleTime: 1000 * 60 * 30,
  })

  if (isLoading) {
    return (
      <Panel>
        <PanelHeader label="Ürün Karlılığı" />
        <Skeleton />
      </Panel>
    )
  }

  if (error || !data?.report) {
    return (
      <Panel>
        <PanelHeader label="Ürün Karlılığı" />
        <EmptySlate title="Ürün karlılık verisi yüklenemedi." />
      </Panel>
    )
  }

  const report = data.report
  const {
    products,
    top_by_revenue,
    top_by_margin,
    loss_leaders,
    tier_counts,
    portfolio_gross_margin_pct,
    weighted_avg_margin_pct,
    top5_revenue_concentration_pct,
    product_count,
    period_months,
    narrative,
    as_of_date,
  } = report

  return (
    <Panel>
      <PanelHeader
        label="Ürün Karlılığı"
        sub={`Son ${period_months} ay — ${as_of_date} itibarıyla`}
      />

      {/* KPI Strip */}
      <KpiStrip>
        <KpiCell
          label="Ürün Sayısı"
          value={product_count.toLocaleString('tr-TR')}
        />
        <KpiCell
          label="Portföy Brüt Marjı"
          value={fmtPct(portfolio_gross_margin_pct)}
        />
        <KpiCell
          label="Ağırlıklı Ort. Marj"
          value={fmtPct(weighted_avg_margin_pct)}
        />
        <KpiCell
          label="İlk 5 Yoğunlaşma"
          value={fmtPct(top5_revenue_concentration_pct)}
        />
        <KpiCell
          label="Zarar Eden Ürün"
          value={String(tier_counts.loss_leader)}
        />
      </KpiStrip>

      {/* Tier Distribution */}
      <div className="mt-3">
        <div className="text-[9px] font-semibold uppercase tracking-wide text-[#94a3b8] mb-1.5">
          Karlılık Dağılımı
        </div>
        <TierDistribution counts={tier_counts} />
      </div>

      {/* Narrative */}
      {narrative && (
        <div className="mt-3 px-3 py-2 bg-[#f8fafc] border border-[#e2e8f0] rounded text-[11px] text-[#475569] italic">
          {narrative}
        </div>
      )}

      {/* Top 5 by Revenue + Top 5 by Margin */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <MiniProductList
          title="En Yüksek Gelir (Top 5)"
          products={top_by_revenue}
          metricLabel="Gelir"
          getMetric={p => fmtTRY(p.revenue)}
        />
        <MiniProductList
          title="En Yüksek Marj (Top 5)"
          products={top_by_margin}
          metricLabel="Marj"
          getMetric={p => fmtPct(p.gross_margin_pct)}
        />
      </div>

      {/* Loss Leaders */}
      {loss_leaders.length > 0 && (
        <div className="mt-4">
          <div className="text-[9px] font-semibold uppercase tracking-wide text-red-500 mb-2">
            Zarar Eden Ürünler ({loss_leaders.length})
          </div>
          <div className="border border-red-100 rounded overflow-hidden">
            {loss_leaders.map(p => (
              <div
                key={p.product_id}
                className="flex items-center justify-between px-3 py-1.5 bg-red-50 border-b border-red-100 last:border-0 gap-2"
              >
                <span className="text-[10px] text-[#0f172a] truncate flex-1" title={p.product_name}>
                  {p.product_name}
                </span>
                <span className="text-[10px] text-[#475569] tabular-nums shrink-0">
                  {fmtTRY(p.revenue)}
                </span>
                <span className="text-[10px] text-red-600 font-semibold tabular-nums shrink-0">
                  {fmtPct(p.gross_margin_pct)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Products Table */}
      {products.length === 0 ? (
        <EmptySlate title="Bu dönem için ürün verisi bulunamadı." />
      ) : (
        <div className="mt-4">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[#94a3b8] mb-2">
            Tüm Ürünler
          </div>
          {/* Header */}
          <div className="flex items-center justify-between mb-1 px-0.5 gap-2">
            <span className="text-[9px] text-[#cbd5e1] uppercase flex-1">Ürün</span>
            <span className="text-[9px] text-[#cbd5e1] uppercase shrink-0 w-16">Tier</span>
            <span className="text-[9px] text-[#cbd5e1] uppercase w-20 text-right shrink-0">Gelir</span>
            <span className="text-[9px] text-[#cbd5e1] uppercase w-14 text-right shrink-0">Marj</span>
          </div>
          {products.map(p => (
            <ProductRow key={p.product_id} product={p} />
          ))}
        </div>
      )}
    </Panel>
  )
}
