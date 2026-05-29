'use client'
// ── CategoryPerformanceClient — Product Category Sales Performance ─────────
// Fetches /api/commercial/category-performance via TanStack Query.
// Features:
//   • Portfolio summary KPIs: total revenue, weighted margin, portfolio growth
//   • HHI concentration badge
//   • Growth momentum badge
//   • Category revenue bars (sorted by revenue DESC)
//   • Mix shift indicators (gaining/losing/stable arrows)
//   • Fastest/slowest growing category callouts
//   • Narrative summary

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
  CategoryPerformanceReport,
  CategoryMetrics,
  CategoryGrowth,
} from '@/lib/services/commercial/category-performance.service'

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

// ── Concentration badge ───────────────────────────────────────────────────────

const CONCENTRATION_CFG = {
  diversified:       { label: 'Çeşitlendirilmiş', bg: 'bg-emerald-100', text: 'text-emerald-800' },
  moderate:          { label: 'Orta',              bg: 'bg-teal-100',    text: 'text-teal-700'    },
  concentrated:      { label: 'Yoğunlaşmış',      bg: 'bg-yellow-100',  text: 'text-yellow-700'  },
  highly_concentrated: { label: 'Çok Yoğun',      bg: 'bg-red-100',     text: 'text-red-700'     },
} as const

type Concentration = keyof typeof CONCENTRATION_CFG

function ConcentrationBadge({ level }: { level: Concentration }) {
  const cfg = CONCENTRATION_CFG[level]
  return (
    <span className={`inline-block text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  )
}

// ── Momentum badge ────────────────────────────────────────────────────────────

const MOMENTUM_CFG = {
  strong_broad:      { label: 'Geniş Büyüme',   bg: 'bg-emerald-100', text: 'text-emerald-800' },
  strong_narrow:     { label: 'Dar Büyüme',      bg: 'bg-teal-100',    text: 'text-teal-700'    },
  moderate:          { label: 'Ilımlı',           bg: 'bg-blue-100',    text: 'text-blue-700'    },
  weak:              { label: 'Zayıf',            bg: 'bg-yellow-100',  text: 'text-yellow-700'  },
  declining:         { label: 'Düşüş',            bg: 'bg-red-100',     text: 'text-red-700'     },
  insufficient_data: { label: 'Yetersiz Veri',   bg: 'bg-[#f1f5f9]',   text: 'text-[#94a3b8]'  },
} as const

type Momentum = keyof typeof MOMENTUM_CFG

function MomentumBadge({ momentum }: { momentum: Momentum }) {
  const cfg = MOMENTUM_CFG[momentum]
  return (
    <span className={`inline-block text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  )
}

// ── Mix shift indicator ───────────────────────────────────────────────────────

function ShiftArrow({ type }: { type: 'gaining' | 'losing' | 'stable' }) {
  if (type === 'gaining') return <span className="text-emerald-600 font-bold text-xs">↑</span>
  if (type === 'losing')  return <span className="text-red-500 font-bold text-xs">↓</span>
  return <span className="text-[#94a3b8] text-xs">→</span>
}

// ── Revenue bar ───────────────────────────────────────────────────────────────

function RevenueBar({ revenue, maxRevenue, label, share }: {
  revenue: number
  maxRevenue: number
  label: string
  share: number
}) {
  const widthPct = maxRevenue > 0 ? (revenue / maxRevenue) * 100 : 0
  return (
    <div className="flex items-center gap-2">
      <div className="w-28 shrink-0 text-[10px] text-[#475569] truncate" title={label}>{label}</div>
      <div className="flex-1 h-4 bg-[#f1f5f9] rounded overflow-hidden">
        <div
          className="h-full bg-[#0f172a] rounded transition-all"
          style={{ width: `${widthPct}%` }}
        />
      </div>
      <div className="w-20 shrink-0 text-[10px] text-right text-[#0f172a] font-medium tabular-nums">
        {fmtTRY(revenue)}
      </div>
      <div className="w-10 shrink-0 text-[10px] text-right text-[#94a3b8] tabular-nums">
        {fmtPct(share)}
      </div>
    </div>
  )
}

// ── Category growth row ───────────────────────────────────────────────────────

function GrowthRow({ growth }: { growth: CategoryGrowth }) {
  const growthColor =
    growth.revenue_growth_pct === null ? 'text-[#94a3b8]'
    : growth.revenue_growth_pct > 0 ? 'text-emerald-700'
    : 'text-red-600'

  return (
    <div className="flex items-center justify-between py-1 border-b border-[#f1f5f9] last:border-0">
      <span className="text-[10px] text-[#475569] truncate w-32" title={growth.category_name}>
        {growth.category_name}
      </span>
      <span className="text-[10px] text-[#0f172a] tabular-nums w-20 text-right">
        {fmtTRY(growth.current_revenue)}
      </span>
      <span className={`text-[10px] font-semibold tabular-nums w-16 text-right ${growthColor}`}>
        {fmtPct(growth.revenue_growth_pct, true)}
      </span>
      <span className="text-[10px] text-[#94a3b8] tabular-nums w-16 text-right">
        {fmtPct(growth.margin_change_pp, true)} pp
      </span>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CategoryPerformanceClient() {
  const { data, isLoading, error } = useQuery<{ report: CategoryPerformanceReport }>({
    queryKey: ['category-performance'],
    queryFn: () => fetch('/api/commercial/category-performance').then(r => r.json()),
    staleTime: 1000 * 60 * 30,
  })

  if (isLoading) {
    return (
      <Panel>
        <PanelHeader label="Kategori Performansı" />
        <Skeleton />
      </Panel>
    )
  }

  if (error || !data?.report) {
    return (
      <Panel>
        <PanelHeader label="Kategori Performansı" />
        <EmptySlate title="Kategori performans verisi yüklenemedi." />
      </Panel>
    )
  }

  const report = data.report
  const {
    categories,
    category_growths,
    mix_shifts,
    portfolio_hhi,
    concentration_level,
    portfolio_growth_pct,
    weighted_avg_margin_pct,
    growth_momentum,
    fastest_growing,
    slowest_growing,
    top_category,
    narrative,
    total_revenue_try,
    total_units,
    current_period,
    prior_period,
  } = report

  const maxRevenue = categories.length > 0 ? categories[0].revenue_try : 0

  const mixShiftMap = new Map(mix_shifts.map(s => [s.category_name, s]))

  return (
    <Panel>
      <PanelHeader
        label="Kategori Performansı"
        sub={`${current_period} — önceki yıl ${prior_period} ile kıyaslama`}
      />

      {/* KPI Strip */}
      <KpiStrip>
        <KpiCell
          label="Toplam Gelir"
          value={fmtTRY(total_revenue_try)}
        />
        <KpiCell
          label="Toplam Birim"
          value={total_units.toLocaleString('tr-TR')}
        />
        <KpiCell
          label="Portföy Büyümesi"
          value={fmtPct(portfolio_growth_pct, true)}
        />
        <KpiCell
          label="Ağırlıklı Marj"
          value={fmtPct(weighted_avg_margin_pct)}
        />
        <KpiCell
          label={`HHI (${fmtPct(portfolio_hhi * 100)})`}
          value={<ConcentrationBadge level={concentration_level} />}
        />
        <KpiCell
          label="Büyüme Momenti"
          value={<MomentumBadge momentum={growth_momentum} />}
        />
      </KpiStrip>

      {/* Narrative */}
      {narrative && (
        <div className="mt-3 px-3 py-2 bg-[#f8fafc] border border-[#e2e8f0] rounded text-[11px] text-[#475569] italic">
          {narrative}
        </div>
      )}

      {/* Category Revenue Bars */}
      {categories.length === 0 ? (
        <EmptySlate title="Bu dönem için kategori verisi bulunamadı." />
      ) : (
        <div className="mt-4 space-y-1">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[#94a3b8] mb-2">
            Kategorilere Göre Gelir
          </div>
          {categories.map(cat => {
            const shift = mixShiftMap.get(cat.category_name)
            return (
              <div key={cat.category_name} className="flex items-center gap-1">
                {shift && <ShiftArrow type={shift.shift_type} />}
                <div className="flex-1">
                  <RevenueBar
                    revenue={cat.revenue_try}
                    maxRevenue={maxRevenue}
                    label={cat.category_name}
                    share={cat.revenue_share_pct}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Growth Table */}
      {category_growths.length > 0 && (
        <div className="mt-5">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[#94a3b8] mb-2">
            Kategori Büyüme Analizi
          </div>
          <div className="flex items-center justify-between mb-1 px-0.5">
            <span className="text-[9px] text-[#cbd5e1] uppercase w-32">Kategori</span>
            <span className="text-[9px] text-[#cbd5e1] uppercase w-20 text-right">Gelir</span>
            <span className="text-[9px] text-[#cbd5e1] uppercase w-16 text-right">Büyüme</span>
            <span className="text-[9px] text-[#cbd5e1] uppercase w-16 text-right">Marj Δ</span>
          </div>
          {category_growths.map(g => (
            <GrowthRow key={g.category_name} growth={g} />
          ))}
        </div>
      )}

      {/* Fastest / Slowest */}
      {(fastest_growing || slowest_growing) && (
        <div className="mt-4 grid grid-cols-2 gap-3">
          {fastest_growing && (
            <div className="bg-emerald-50 border border-emerald-100 rounded px-3 py-2">
              <div className="text-[9px] font-semibold uppercase tracking-wide text-emerald-600 mb-0.5">
                En Hızlı Büyüyen
              </div>
              <div className="text-[11px] font-semibold text-[#0f172a] truncate">
                {fastest_growing.category_name}
              </div>
              <div className="text-[10px] text-emerald-700 font-bold">
                {fmtPct(fastest_growing.revenue_growth_pct, true)}
              </div>
            </div>
          )}
          {slowest_growing && (
            <div className="bg-red-50 border border-red-100 rounded px-3 py-2">
              <div className="text-[9px] font-semibold uppercase tracking-wide text-red-500 mb-0.5">
                En Yavaş Büyüyen
              </div>
              <div className="text-[11px] font-semibold text-[#0f172a] truncate">
                {slowest_growing.category_name}
              </div>
              <div className="text-[10px] text-red-600 font-bold">
                {fmtPct(slowest_growing.revenue_growth_pct, true)}
              </div>
            </div>
          )}
        </div>
      )}
    </Panel>
  )
}
