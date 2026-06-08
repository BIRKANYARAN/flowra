'use client'

// ─────────────────────────────────────────────────────────────────────────────
// PricingIntelligenceClient
//
// Pricing Intelligence dashboard panel.
//
// Features:
//   - Pricing pressure badge (5-tier classification)
//   - 4 KPI cards: avg discount %, price realization, price variance, discipline
//   - Top discounted SKUs table with discipline badges
//   - Summary row: list revenue / actual revenue / discount amount
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery }        from '@tanstack/react-query'
import { fmtTRY, fmtPct }  from '@/lib/format'
import type {
  SkuPricingHealth,
}                          from '@/lib/services/finance/pricing-intelligence.service'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  companyId: string
}

interface PricingReport {
  current_period: {
    avg_discount_pct:      number | null
    price_realization_pct: number | null
    discount_discipline:   'disciplined' | 'moderate' | 'aggressive' | 'distressed' | null
    pricing_pressure:      'expanding' | 'stable' | 'compressing' | 'under_pressure' | 'insufficient_data'
    price_variance_pct:    number | null
  }
  sku_pricing:         SkuPricingHealth[]
  top_discounted_skus: Array<{ product_name: string; discount_rate_pct: number }>
  summary: {
    total_list_revenue:    number
    total_actual_revenue:  number
    total_discount_amount: number
    sku_count:             number
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function pressureCfg(
  p: PricingReport['current_period']['pricing_pressure'],
): { label: string; color: string } {
  switch (p) {
    case 'expanding':        return { label: 'Fiyat Yükseliyor',  color: 'bg-[#dcfce7] border-green-200 text-[#16a34a]' }
    case 'stable':           return { label: 'Fiyat Stabil',      color: 'bg-[#f1f5f9] border-[#e8eaef] text-[#64748b]' }
    case 'compressing':      return { label: 'Fiyat Sıkışıyor',   color: 'bg-[#fefce8] border-yellow-200 text-yellow-700' }
    case 'under_pressure':   return { label: 'Yoğun Baskı',       color: 'bg-[#fee2e2] border-red-200 text-[#dc2626]' }
    case 'insufficient_data': return { label: 'Veri Yok',         color: 'bg-[#f1f5f9] border-[#e8eaef] text-[#94a3b8]' }
  }
}

function disciplineCfg(
  d: SkuPricingHealth['discipline'],
): { label: string; color: string } {
  switch (d) {
    case 'disciplined': return { label: 'Disiplinli', color: 'bg-[#dcfce7] text-[#16a34a]' }
    case 'moderate':    return { label: 'Orta',       color: 'bg-[#fefce8] text-yellow-700' }
    case 'aggressive':  return { label: 'Agresif',    color: 'bg-orange-50 text-orange-700' }
    case 'distressed':  return { label: 'Kritik',     color: 'bg-[#fee2e2] text-[#dc2626]' }
    default:            return { label: '—',          color: 'bg-[#f1f5f9] text-[#94a3b8]' }
  }
}

function varianceColor(v: number | null): string {
  if (v === null) return 'text-[#94a3b8]'
  if (v > 0)  return 'text-[#16a34a]'
  if (v < 0)  return 'text-[#dc2626]'
  return 'text-[#64748b]'
}

// ── KPI card ──────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  valueClass,
}: {
  label:      string
  value:      string
  sub?:       string
  valueClass?: string
}) {
  return (
    <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft p-3 flex flex-col gap-1">
      <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">
        {label}
      </div>
      <div className={`text-xl font-black tabular-nums leading-tight ${valueClass ?? 'text-[#0f172a]'}`}>
        {value}
      </div>
      {sub && (
        <div className="text-[10px] text-[#94a3b8]">{sub}</div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PricingIntelligenceClient({ companyId }: Props) {
  const { data, isLoading, isError } = useQuery<{ report: PricingReport }>({
    queryKey:  ['pricing-intelligence', companyId],
    queryFn:   () =>
      fetch('/api/finance/pricing-intelligence').then(r => {
        if (!r.ok) throw new Error('Fiyatlama verileri yüklenemedi')
        return r.json()
      }),
    staleTime: 1_800_000,
  })

  const report = data?.report
  const cp     = report?.current_period

  const pressure     = cp?.pricing_pressure ?? 'insufficient_data'
  const pressureCfgV = pressureCfg(pressure)

  return (
    <div>
      <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-1.5">
        Fiyatlama Sağlığı
      </div>

      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft shadow-sm overflow-hidden">

        {/* ── Header ──────────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#f1f5f9] bg-[#f8fafc]">
          <span className="text-sm font-black text-[#0f172a]">Fiyatlama Sağlığı</span>
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full border text-[10px] font-black uppercase tracking-wide ${pressureCfgV.color}`}>
            {pressureCfgV.label}
          </span>
        </div>

        {/* ── Loading / Error ──────────────────────────────────────────────────── */}
        {isLoading && (
          <div className="px-4 py-8 text-center text-xs text-[#94a3b8]">
            Fiyatlama analizi hesaplanıyor…
          </div>
        )}

        {isError && (
          <div className="px-4 py-6 text-center text-xs text-[#dc2626]">
            Veriler yüklenemedi — lütfen tekrar deneyin.
          </div>
        )}

        {report && !isLoading && (
          <>
            {/* ── KPI Cards ─────────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 border-b border-[#f1f5f9]">
              <KpiCard
                label="Ort. İndirim Oranı"
                value={cp?.avg_discount_pct !== null && cp?.avg_discount_pct !== undefined
                  ? fmtPct(cp.avg_discount_pct)
                  : '—'}
                sub="Cari ay"
                valueClass={
                  cp?.avg_discount_pct !== null && cp?.avg_discount_pct !== undefined
                    ? cp.avg_discount_pct >= 25
                      ? 'text-[#dc2626]'
                      : cp.avg_discount_pct >= 15
                      ? 'text-orange-600'
                      : 'text-[#16a34a]'
                    : 'text-[#94a3b8]'
                }
              />
              <KpiCard
                label="Fiyat Gerçekleşme"
                value={cp?.price_realization_pct !== null && cp?.price_realization_pct !== undefined
                  ? fmtPct(cp.price_realization_pct)
                  : '—'}
                sub="Gerçek / Liste"
                valueClass={
                  cp?.price_realization_pct !== null && cp?.price_realization_pct !== undefined
                    ? cp.price_realization_pct >= 90
                      ? 'text-[#16a34a]'
                      : cp.price_realization_pct >= 75
                      ? 'text-orange-600'
                      : 'text-[#dc2626]'
                    : 'text-[#94a3b8]'
                }
              />
              <KpiCard
                label="Fiyat Değişimi"
                value={cp?.price_variance_pct !== null && cp?.price_variance_pct !== undefined
                  ? `${cp.price_variance_pct >= 0 ? '+' : ''}${cp.price_variance_pct.toFixed(1)}%`
                  : '—'}
                sub="vs. önceki ay"
                valueClass={varianceColor(cp?.price_variance_pct ?? null)}
              />
              <KpiCard
                label="İndirim Disiplini"
                value={cp?.discount_discipline
                  ? {
                      disciplined: 'Disiplinli',
                      moderate:    'Orta',
                      aggressive:  'Agresif',
                      distressed:  'Kritik',
                    }[cp.discount_discipline]
                  : '—'}
                sub={cp?.avg_discount_pct !== null && cp?.avg_discount_pct !== undefined
                  ? `${cp.avg_discount_pct.toFixed(1)}% ort. indirim`
                  : undefined}
                valueClass={
                  cp?.discount_discipline === 'disciplined' ? 'text-[#16a34a] text-base' :
                  cp?.discount_discipline === 'moderate'    ? 'text-yellow-600 text-base' :
                  cp?.discount_discipline === 'aggressive'  ? 'text-orange-600 text-base' :
                  cp?.discount_discipline === 'distressed'  ? 'text-[#dc2626] text-base' :
                  'text-[#94a3b8] text-base'
                }
              />
            </div>

            {/* ── Top Discounted SKUs ───────────────────────────────────────── */}
            {report.top_discounted_skus.length > 0 && (
              <div className="px-4 py-3 border-b border-[#f1f5f9]">
                <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-2">
                  En Yüksek İndirimli Ürünler
                </div>
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">
                      <th className="text-left pb-1.5 font-black">Ürün</th>
                      <th className="text-right pb-1.5 font-black">İndirim %</th>
                      <th className="text-right pb-1.5 font-black">Disiplin</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f1f5f9]">
                    {report.top_discounted_skus.map((sku, idx) => {
                      // Find discipline from sku_pricing
                      const skuData = report.sku_pricing.find(
                        s => s.product_name === sku.product_name,
                      )
                      const disc = disciplineCfg(skuData?.discipline ?? null)
                      return (
                        <tr key={idx}>
                          <td className="py-1.5 text-[#334155] font-semibold max-w-[180px] truncate">
                            {sku.product_name}
                          </td>
                          <td className="py-1.5 text-right tabular-nums font-black text-[#dc2626]">
                            {sku.discount_rate_pct.toFixed(1)}%
                          </td>
                          <td className="py-1.5 text-right">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-black ${disc.color}`}>
                              {disc.label}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* ── Summary row ───────────────────────────────────────────────── */}
            <div className="px-4 py-3 bg-[#f8fafc] grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-0.5">
                  Toplam Liste Geliri
                </div>
                <div className="text-sm font-black tabular-nums text-[#334155]">
                  {fmtTRY(report.summary.total_list_revenue)}
                </div>
              </div>
              <div>
                <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-0.5">
                  Gerçek Gelir
                </div>
                <div className="text-sm font-black tabular-nums text-[#16a34a]">
                  {fmtTRY(report.summary.total_actual_revenue)}
                </div>
              </div>
              <div>
                <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-0.5">
                  İndirim Tutarı
                </div>
                <div className="text-sm font-black tabular-nums text-[#dc2626]">
                  {fmtTRY(report.summary.total_discount_amount)}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
