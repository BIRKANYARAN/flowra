'use client'
// ── AbcAnalysisClient — ABC (Pareto) Envanter Sınıflandırması ─────────────────
// Client island: fetches /api/inventory/abc-analysis via TanStack Query,
// shows ABC distribution bar, alerts, recommendations, and a filterable
// product table.

import { useState } from 'react'
import { useQuery }  from '@tanstack/react-query'
import type {
  AbcAnalysisReport,
  ProductAbcProfile,
} from '@/lib/services/inventory/abc-analysis.service'

// ── Helpers ───────────────────────────────────────────────────────────────────

const FMT0 = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 })
const FMT2 = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function fmtTRY(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `₺${(n / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000)     return `₺${(n / 1_000).toFixed(1)}K`
  return `₺${FMT0.format(Math.round(n))}`
}

function fmtPct(n: number): string {
  return `%${FMT2.format(n)}`
}

// ── Tier badge ────────────────────────────────────────────────────────────────

function TierBadge({ tier }: { tier: 'A' | 'B' | 'C' }) {
  const styles: Record<string, string> = {
    A: 'bg-pos-light text-pos-text font-black',
    B: 'bg-blue-50 text-blue-700 font-black',
    C: 'bg-[#f1f5f9] text-[#64748b] font-semibold',
  }
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[10px] ${styles[tier]}`}>
      {tier}
    </span>
  )
}

// ── Efficiency badge ──────────────────────────────────────────────────────────

type EffClass = 'under_invested' | 'optimal' | 'over_invested' | 'excessive' | 'unknown'

function EfficiencyBadge({ cls }: { cls: EffClass }) {
  const config: Record<EffClass, { label: string; style: string }> = {
    under_invested: { label: 'Yetersiz Stok', style: 'bg-neg-light text-neg-text' },
    optimal:        { label: 'Optimal',        style: 'bg-pos-light text-pos-text' },
    over_invested:  { label: 'Fazla Yatırım',  style: 'bg-warn-light text-warn-text' },
    excessive:      { label: 'Aşırı Yatırım',  style: 'bg-red-50 text-red-700' },
    unknown:        { label: '—',              style: 'bg-[#f1f5f9] text-[#94a3b8]' },
  }
  const { label, style } = config[cls]
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${style}`}>
      {label}
    </span>
  )
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="bg-white border border-[#e2e8f0] rounded shadow-sm p-4 space-y-3 animate-pulse">
      <div className="h-4 bg-[#f1f5f9] rounded w-48" />
      <div className="h-8 bg-[#f1f5f9] rounded" />
      <div className="h-48 bg-[#f1f5f9] rounded" />
    </div>
  )
}

// ── ABC Distribution Bar ──────────────────────────────────────────────────────

function AbcDistributionBar({ report }: { report: AbcAnalysisReport }) {
  const segments = [
    {
      label: 'A',
      count: report.a_count,
      revPct: report.a_revenue_pct,
      color: 'bg-emerald-500',
      textColor: 'text-pos-text',
    },
    {
      label: 'B',
      count: report.b_count,
      revPct: report.b_revenue_pct,
      color: 'bg-blue-400',
      textColor: 'text-blue-700',
    },
    {
      label: 'C',
      count: report.c_count,
      revPct: report.c_revenue_pct,
      color: 'bg-[#cbd5e1]',
      textColor: 'text-[#64748b]',
    },
  ]

  return (
    <div className="space-y-2">
      {/* Bar */}
      <div className="flex h-5 rounded overflow-hidden gap-px">
        {segments.map(seg => (
          <div
            key={seg.label}
            className={`${seg.color} transition-all`}
            style={{ width: `${seg.revPct.toFixed(1)}%` }}
            title={`${seg.label} sınıfı: ${seg.count} ürün, gelirin %${seg.revPct.toFixed(1)}'i`}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="flex gap-4 text-[10px]">
        {segments.map(seg => (
          <div key={seg.label} className="flex items-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded-sm ${seg.color} shrink-0`} />
            <span className={`font-semibold ${seg.textColor}`}>
              {seg.label} sınıfı: {seg.count} ürün, gelirin {fmtPct(seg.revPct)}&apos;i
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Product table ─────────────────────────────────────────────────────────────

function ProductTable({ products }: { products: ProductAbcProfile[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[#f1f5f9]">
            {[
              { label: 'Ürün',         align: 'text-left'  },
              { label: 'ABC',          align: 'text-center' },
              { label: 'Gelir',        align: 'text-right' },
              { label: 'Gelir %',      align: 'text-right' },
              { label: 'Adet',         align: 'text-right' },
              { label: 'Stok Miktarı', align: 'text-right' },
              { label: 'Verimlilik',   align: 'text-right' },
              { label: 'Sınıf',        align: 'text-center' },
            ].map(col => (
              <th key={col.label} className={`px-3 py-2 ${col.align} text-[9px] font-black uppercase tracking-widest text-[#94a3b8]`}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {products.map(p => (
            <tr key={p.product_id} className="border-b border-[#f8fafc] hover:bg-[#fafafa]">
              <td className="px-3 py-2">
                <div className="font-semibold text-[#0f172a] truncate max-w-[180px]" title={p.product_name}>
                  {p.product_name}
                </div>
                {p.sku && (
                  <div className="text-[10px] text-[#94a3b8]">{p.sku}</div>
                )}
              </td>
              <td className="px-3 py-2 text-center">
                <TierBadge tier={p.abc_tier} />
              </td>
              <td className="px-3 py-2 text-right tabular-nums font-semibold text-[#0f172a]">
                {fmtTRY(p.revenue_try)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-[#334155]">
                {fmtPct(p.revenue_share_pct)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-[#334155]">
                {FMT0.format(p.units_sold)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-[#334155]">
                {FMT0.format(p.current_stock_qty)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-[#334155]">
                {p.inventory_efficiency_pct !== null
                  ? `%${FMT0.format(Math.round(p.inventory_efficiency_pct))}`
                  : '—'}
              </td>
              <td className="px-3 py-2 text-center">
                <EfficiencyBadge cls={p.efficiency_class} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props { companyId: string }

type Tab = 'all' | 'A' | 'B' | 'C'

export function AbcAnalysisClient({ companyId }: Props) {
  const [months, setMonths] = useState<6 | 12>(12)
  const [tab, setTab]       = useState<Tab>('all')

  const { data, isLoading, error } = useQuery<{ report: AbcAnalysisReport }>({
    queryKey: ['abc-analysis', companyId, months],
    queryFn:  () => fetch(`/api/inventory/abc-analysis?months=${months}`).then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json()
    }),
    staleTime: 60 * 60 * 1_000,
  })

  if (isLoading) return <Skeleton />
  if (error || !data?.report) return null

  const report = data.report

  // Empty state
  if (report.total_products === 0) {
    return (
      <div className="bg-white border border-[#e2e8f0] rounded shadow-sm px-6 py-8 text-center text-sm text-[#94a3b8]">
        Satış verisi bulunamadı
      </div>
    )
  }

  // Filtered products for current tab
  const displayProducts: ProductAbcProfile[] =
    tab === 'all' ? report.products :
    tab === 'A'   ? report.a_products :
    tab === 'B'   ? report.b_products :
                    report.c_products

  const tabs: Array<{ id: Tab; label: string; count: number }> = [
    { id: 'all', label: 'Tümü',    count: report.total_products },
    { id: 'A',   label: 'A Sınıfı', count: report.a_count },
    { id: 'B',   label: 'B Sınıfı', count: report.b_count },
    { id: 'C',   label: 'C Sınıfı', count: report.c_count },
  ]

  return (
    <div className="bg-white border border-[#e2e8f0] rounded shadow-sm">
      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#f1f5f9]">
        <div>
          <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">
            ABC Stok Analizi
          </div>
          <div className="text-xs text-[#64748b] mt-0.5">
            Pareto sınıflandırması · Son {months} ay · {report.total_products} ürün
          </div>
        </div>

        {/* Period selector */}
        <div className="flex gap-1">
          {([6, 12] as const).map(m => (
            <button
              key={m}
              onClick={() => setMonths(m)}
              className={`text-[10px] font-semibold px-2.5 py-1 rounded transition-colors ${
                months === m
                  ? 'bg-[#0f172a] text-white'
                  : 'bg-[#f1f5f9] text-[#64748b] hover:bg-[#e2e8f0]'
              }`}
            >
              {m} ay
            </button>
          ))}
        </div>
      </div>

      {/* ── ABC distribution bar ──────────────────────────────────────────────── */}
      <div className="px-4 py-3 border-b border-[#f1f5f9]">
        <AbcDistributionBar report={report} />
      </div>

      {/* ── Alerts ───────────────────────────────────────────────────────────── */}
      {report.over_invested_a_products.length > 0 && (
        <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-100 flex items-center gap-2 text-xs text-amber-700">
          <span className="text-base leading-none">⚠</span>
          <span>
            <span className="font-black">A sınıfı ürünlerde fazla stok yatırımı</span>
            {' '}— {report.over_invested_a_products.length} ürün nakit bağlıyor.
          </span>
        </div>
      )}
      {report.under_invested_a_products.length > 0 && (
        <div className="px-4 py-2.5 bg-neg-light border-b border-red-100 flex items-center gap-2 text-xs text-neg-text">
          <span className="text-base leading-none">⚠</span>
          <span>
            <span className="font-black">A sınıfı ürünlerde stok yetersizliği riski</span>
            {' '}— {report.under_invested_a_products.length} ürün stokout tehlikesinde.
          </span>
        </div>
      )}

      {/* ── Recommendations ───────────────────────────────────────────────────── */}
      {report.recommendations.length > 0 && (
        <div className="px-4 py-3 border-b border-[#f1f5f9] space-y-1">
          <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-1.5">
            Öneriler
          </div>
          {report.recommendations.map((rec, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-[#334155]">
              <span className="shrink-0 text-[#94a3b8] mt-0.5">•</span>
              <span>{rec}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Tab filter ───────────────────────────────────────────────────────── */}
      <div className="flex gap-0 border-b border-[#f1f5f9]">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-[10px] font-semibold flex items-center gap-1.5 border-b-2 transition-colors ${
              tab === t.id
                ? 'border-[#0f172a] text-[#0f172a]'
                : 'border-transparent text-[#94a3b8] hover:text-[#334155]'
            }`}
          >
            {t.label}
            <span className={`px-1.5 py-0.5 rounded text-[9px] font-black ${
              tab === t.id ? 'bg-[#0f172a] text-white' : 'bg-[#f1f5f9] text-[#64748b]'
            }`}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* ── Product table ─────────────────────────────────────────────────────── */}
      {displayProducts.length === 0 ? (
        <div className="px-6 py-8 text-center text-sm text-[#94a3b8]">
          Bu sınıfta ürün bulunmuyor
        </div>
      ) : (
        <ProductTable products={displayProducts} />
      )}
    </div>
  )
}
