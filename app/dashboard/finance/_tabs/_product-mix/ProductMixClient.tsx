'use client'

// ─────────────────────────────────────────────────────────────────────────────
// ProductMixClient
//
// Product Mix Profitability Analysis dashboard panel.
//
// Features:
//   - Header: "Ürün Karması Kârlılığı"
//   - 4 quadrant summary (star/cash_cow/question_mark/dog) with counts
//   - Weighted average margin + mix shift effect with +/- impact
//   - Concentration risk badge (HHI-based)
//   - Product ranking table: rank, name, revenue, CM, margin %, quadrant badge
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery }       from '@tanstack/react-query'
import { fmtTRY, fmtPct } from '@/lib/format'
import type { ProductQuadrant } from '@/lib/services/finance/product-mix.service'

// ── Types ─────────────────────────────────────────────────────────────────────

interface RankedProduct {
  rank:                number
  product_id:          string
  product_name:        string
  revenue:             number
  contribution_margin: number
  margin_ratio_pct:    number | null
  quadrant:            ProductQuadrant
}

interface ProductMixReport {
  products: RankedProduct[]
  quadrant_distribution: {
    star:          number
    cash_cow:      number
    question_mark: number
    dog:           number
  }
  weighted_avg_margin_pct: number | null
  mix_shift_effect:        number
  concentration_risk: {
    hhi:               number
    top_product_share: number | null
    is_concentrated:   boolean
  }
  total_revenue:             number
  total_contribution_margin: number
  summary: {
    star_revenue_pct: number
    dog_revenue_pct:  number
  }
}

interface Props {
  companyId: string
}

// ── Quadrant config ───────────────────────────────────────────────────────────

const QUADRANT_CFG: Record<ProductQuadrant, {
  label: string
  emoji: string
  colors: string
  description: string
}> = {
  star: {
    label:       'Yıldız',
    emoji:       'S',
    colors:      'bg-yellow-50 border-yellow-200 text-yellow-800',
    description: 'Yüksek ciro + yüksek marj',
  },
  cash_cow: {
    label:       'Nakit İneği',
    emoji:       'N',
    colors:      'bg-green-50 border-green-200 text-green-800',
    description: 'Yüksek ciro + düşük marj',
  },
  question_mark: {
    label:       'Soru İşareti',
    emoji:       '?',
    colors:      'bg-blue-50 border-blue-200 text-blue-700',
    description: 'Düşük ciro + yüksek marj',
  },
  dog: {
    label:       'Köpek',
    emoji:       'K',
    colors:      'bg-red-50 border-red-200 text-red-700',
    description: 'Düşük ciro + düşük marj',
  },
}

// ── Quadrant badge ────────────────────────────────────────────────────────────

function QuadrantBadge({ quadrant }: { quadrant: ProductQuadrant }) {
  const cfg = QUADRANT_CFG[quadrant]
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-bold ${cfg.colors}`}
      title={cfg.description}
    >
      {cfg.emoji} {cfg.label}
    </span>
  )
}

// ── Concentration badge ───────────────────────────────────────────────────────

function ConcentrationBadge({ concentrated, hhi }: { concentrated: boolean; hhi: number }) {
  if (concentrated) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold bg-red-50 border-red-200 text-red-700">
        Yoğunlaşmış (HHI {Math.round(hhi)})
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold bg-green-50 border-green-200 text-green-700">
      Dengeli (HHI {Math.round(hhi)})
    </span>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function ProductMixClient({ companyId }: Props) {
  const { data, isLoading, isError } = useQuery<{ report: ProductMixReport }>({
    queryKey:  ['product-mix', companyId],
    queryFn:   async () => {
      const res = await fetch('/api/finance/product-mix')
      if (!res.ok) throw new Error('Ürün karması verisi yüklenemedi')
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft p-6 shadow-sm">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-[#f1f5f9] rounded w-56" />
          <div className="h-20 bg-[#f1f5f9] rounded" />
          <div className="h-40 bg-[#f1f5f9] rounded" />
        </div>
      </div>
    )
  }

  // ── Error ─────────────────────────────────────────────────────────────────────
  if (isError || !data?.report) {
    return (
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft p-6 shadow-sm text-center">
        <p className="text-sm text-[#64748b] font-medium">
          Ürün karması verisi yüklenirken hata oluştu.
        </p>
      </div>
    )
  }

  const report = data.report
  const { quadrant_distribution: qd, concentration_risk: cr } = report

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
            Ürün Karması Kârlılığı
          </h3>
          <p className="text-[10px] text-[#64748b] mt-0.5">
            BCG matris · katkı marjı · yoğunlaşma riski
          </p>
        </div>
        <ConcentrationBadge
          concentrated={cr.is_concentrated}
          hhi={cr.hhi}
        />
      </div>

      {/* ── 4-Quadrant Summary ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-2">
        {(Object.entries(QUADRANT_CFG) as Array<[ProductQuadrant, typeof QUADRANT_CFG[ProductQuadrant]]>).map(
          ([key, cfg]) => (
            <div
              key={key}
              className={`rounded border px-3 py-3 ${cfg.colors}`}
            >
              <div className="text-[9px] font-black uppercase tracking-widest opacity-60 mb-0.5">
                {cfg.label}
              </div>
              <div className="text-2xl font-black leading-none">
                {qd[key]}
              </div>
              <div className="text-[9px] mt-1 opacity-70">{cfg.description}</div>
            </div>
          ),
        )}
      </div>

      {/* ── Margin + Mix Shift KPIs ──────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">

        {/* Weighted avg margin */}
        <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft px-4 py-3 shadow-sm">
          <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-0.5">
            Ağırlıklı Ort. Marj
          </div>
          <div className="text-[10px] text-[#94a3b8] mb-1">
            Gelir ağırlıklı katkı marjı oranı
          </div>
          <div className={`text-xl font-black tabular-nums ${
            report.weighted_avg_margin_pct === null
              ? 'text-[#94a3b8]'
              : report.weighted_avg_margin_pct >= 30
              ? 'text-green-700'
              : report.weighted_avg_margin_pct >= 15
              ? 'text-yellow-700'
              : 'text-red-700'
          }`}>
            {report.weighted_avg_margin_pct !== null
              ? `%${report.weighted_avg_margin_pct.toFixed(1)}`
              : '—'}
          </div>
        </div>

        {/* Mix shift effect */}
        <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft px-4 py-3 shadow-sm">
          <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-0.5">
            Karışım Etkisi
          </div>
          <div className="text-[10px] text-[#94a3b8] mb-1">
            Ürün karması değişiminin kâr etkisi
          </div>
          <div className={`text-xl font-black tabular-nums ${
            report.mix_shift_effect > 0
              ? 'text-green-700'
              : report.mix_shift_effect < 0
              ? 'text-red-700'
              : 'text-[#94a3b8]'
          }`}>
            {report.mix_shift_effect !== 0
              ? `${report.mix_shift_effect > 0 ? '+' : ''}${fmtTRY(report.mix_shift_effect, 0)}`
              : '—'}
          </div>
          {report.mix_shift_effect !== 0 && (
            <div className={`text-[10px] font-semibold mt-0.5 ${
              report.mix_shift_effect > 0 ? 'text-green-600' : 'text-red-600'
            }`}>
              {report.mix_shift_effect > 0 ? 'Olumlu karışım' : 'Olumsuz karışım'}
            </div>
          )}
        </div>

        {/* Total CM */}
        <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft px-4 py-3 shadow-sm">
          <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-0.5">
            Toplam Katkı Payı
          </div>
          <div className="text-[10px] text-[#94a3b8] mb-1">
            {fmtTRY(report.total_revenue, 0)} cirodan
          </div>
          <div className={`text-xl font-black tabular-nums ${
            report.total_contribution_margin >= 0 ? 'text-[#0f172a]' : 'text-red-700'
          }`}>
            {fmtTRY(report.total_contribution_margin, 0)}
          </div>
        </div>
      </div>

      {/* ── Revenue composition alerts ───────────────────────────────────────── */}
      {report.summary.dog_revenue_pct > 20 && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-3">
          <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0 mt-1.5" />
          <div>
            <span className="text-[11px] font-bold text-red-800">
              Düşük kârlı ürünler yüksek pay alıyor:
            </span>{' '}
            <span className="text-[11px] text-red-700 font-semibold tabular-nums">
              %{report.summary.dog_revenue_pct.toFixed(1)}
            </span>
            <span className="text-[10px] text-red-600 ml-1">
              ciroda "Köpek" sınıfı ürünler
            </span>
          </div>
        </div>
      )}

      {report.summary.star_revenue_pct > 0 && (
        <div className="rounded border border-yellow-200 bg-yellow-50 px-4 py-2.5 flex items-center gap-2">
          <span className="text-[11px] text-yellow-800 font-semibold">
            Yıldız ürünler cirosun{' '}
            <strong>%{report.summary.star_revenue_pct.toFixed(1)}</strong>&apos;ini{' '}
            oluşturuyor — büyüme odağı bunlara kaydırılabilir.
          </span>
        </div>
      )}

      {/* ── Product ranking table ────────────────────────────────────────────── */}
      {report.products.length > 0 ? (
        <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[#f1f5f9] bg-[#f8fafc]">
            <span className="text-[10px] font-black uppercase tracking-widest text-[#64748b]">
              Ürün Sıralaması — Katkı Payına Göre
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#e8eaef] bg-[#f8fafc]">
                  <th className="text-center px-3 py-2 text-[9px] font-black uppercase tracking-widest text-[#94a3b8] w-8">#</th>
                  <th className="text-left px-3 py-2 text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">Ürün</th>
                  <th className="text-right px-3 py-2 text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">Ciro</th>
                  <th className="text-right px-3 py-2 text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">Katkı Payı</th>
                  <th className="text-right px-3 py-2 text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">Marj %</th>
                  <th className="text-center px-3 py-2 text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">Kadran</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f8fafc]">
                {report.products.map(p => (
                  <tr key={p.product_id} className="hover:bg-[#f8fafc]/60">
                    <td className="px-3 py-2 text-center">
                      <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-black ${
                        p.rank === 1
                          ? 'bg-yellow-100 text-yellow-800'
                          : p.rank === 2
                          ? 'bg-slate-100 text-slate-600'
                          : p.rank === 3
                          ? 'bg-orange-100 text-orange-700'
                          : 'bg-[#f1f5f9] text-[#64748b]'
                      }`}>
                        {p.rank}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="font-semibold text-[#334155] truncate max-w-[160px] block">
                        {p.product_name}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-[#0f172a]">
                      {fmtTRY(p.revenue, 0)}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums font-bold ${
                      p.contribution_margin >= 0 ? 'text-green-700' : 'text-red-600'
                    }`}>
                      {fmtTRY(p.contribution_margin, 0)}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums font-semibold ${
                      p.margin_ratio_pct === null
                        ? 'text-[#94a3b8]'
                        : p.margin_ratio_pct >= 30
                        ? 'text-green-700'
                        : p.margin_ratio_pct >= 15
                        ? 'text-yellow-700'
                        : 'text-red-600'
                    }`}>
                      {p.margin_ratio_pct !== null
                        ? `%${p.margin_ratio_pct.toFixed(1)}`
                        : '—'}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <QuadrantBadge quadrant={p.quadrant} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Table footer: totals */}
          <div className="px-4 py-2.5 border-t border-[#e8eaef] bg-[#f8fafc] flex items-center justify-between gap-4">
            <span className="text-[10px] font-black uppercase tracking-widest text-[#94a3b8]">
              Toplam ({report.products.length} ürün)
            </span>
            <div className="flex items-center gap-6">
              <div className="text-right">
                <div className="text-[9px] font-semibold text-[#94a3b8] uppercase tracking-wide">Ciro</div>
                <div className="text-[11px] font-black tabular-nums text-[#0f172a]">
                  {fmtTRY(report.total_revenue, 0)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[9px] font-semibold text-[#94a3b8] uppercase tracking-wide">Katkı Payı</div>
                <div className={`text-[11px] font-black tabular-nums ${
                  report.total_contribution_margin >= 0 ? 'text-green-700' : 'text-red-600'
                }`}>
                  {fmtTRY(report.total_contribution_margin, 0)}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft py-10 text-center shadow-sm">
          <p className="text-[#64748b] font-medium text-sm">Bu dönem için ürün satış verisi bulunamadı.</p>
          <p className="text-[#94a3b8] text-xs mt-1">
            Satış kaydı eklendiğinde ürün karması analizi otomatik hesaplanır.
          </p>
        </div>
      )}

      {/* ── Concentration risk detail ─────────────────────────────────────────── */}
      {cr.top_product_share !== null && (
        <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft px-4 py-3 shadow-sm">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">
                Yoğunlaşma Riski
              </div>
              <div className="text-[10px] text-[#64748b] mt-0.5">
                En büyük ürün pay:{' '}
                <strong className="text-[#0f172a]">
                  %{cr.top_product_share.toFixed(1)}
                </strong>
                {' '}· HHI: <strong className="text-[#0f172a]">{Math.round(cr.hhi)}</strong>
                {' '}(sınır: 2500)
              </div>
            </div>
            <ConcentrationBadge concentrated={cr.is_concentrated} hhi={cr.hhi} />
          </div>
        </div>
      )}
    </div>
  )
}
