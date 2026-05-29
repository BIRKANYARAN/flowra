'use client'
// ── SkuPerformanceClient — SKU Performance Analytics ─────────────────────────
// Fetches /api/commercial/sku-performance via TanStack Query.
// Features:
//   • 4 KPI cells: total SKUs, portfolio balance, pareto SKU count, stockout risks
//   • SKU table sorted by composite score with quadrant + tier badges
//   • Tier distribution pill row

import { useQuery } from '@tanstack/react-query'
import type {
  SkuPerformanceReport,
  SkuMetrics,
  SkuScore,
} from '@/lib/services/commercial/sku-performance.service'

// ── Formatters ────────────────────────────────────────────────────────────────

const PCT_FMT = new Intl.NumberFormat('tr-TR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

const NUM_FMT = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 })

function fmtPct(n: number): string {
  return `%${PCT_FMT.format(n)}`
}

function fmtNum(n: number): string {
  return NUM_FMT.format(Math.round(n))
}

function fmtDays(n: number | null): string {
  if (n === null) return '—'
  if (n < 1) return '< 1 gün'
  return `${Math.round(n)} gün`
}

function fmtScore(n: number): string {
  return PCT_FMT.format(n)
}

// ── Quadrant badge ────────────────────────────────────────────────────────────

const QUADRANT_CFG: Record<
  SkuScore['quadrant'],
  { label: string; bg: string; text: string }
> = {
  star:          { label: 'Yıldız',      bg: 'bg-amber-100',  text: 'text-amber-800'  },
  cash_cow:      { label: 'Nakit İnek',  bg: 'bg-emerald-100', text: 'text-emerald-800' },
  question_mark: { label: 'Soru İşareti', bg: 'bg-blue-100',  text: 'text-blue-800'   },
  dog:           { label: 'Köpek',       bg: 'bg-slate-100',  text: 'text-slate-600'  },
}

function QuadrantBadge({ quadrant }: { quadrant: SkuScore['quadrant'] }) {
  const cfg = QUADRANT_CFG[quadrant]
  return (
    <span
      className={`inline-block text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.text}`}
    >
      {cfg.label}
    </span>
  )
}

// ── Tier badge ────────────────────────────────────────────────────────────────

const TIER_CFG: Record<
  SkuScore['performance_tier'],
  { label: string; bg: string; text: string }
> = {
  top:            { label: 'Zirve',        bg: 'bg-violet-100', text: 'text-violet-800'  },
  core:           { label: 'Çekirdek',     bg: 'bg-sky-100',    text: 'text-sky-800'     },
  niche:          { label: 'Niş',          bg: 'bg-teal-100',   text: 'text-teal-700'    },
  underperformer: { label: 'Düşük Perf.',  bg: 'bg-orange-100', text: 'text-orange-700'  },
  discontinued:   { label: 'İncelemelik', bg: 'bg-red-100',    text: 'text-red-700'     },
}

function TierBadge({ tier }: { tier: SkuScore['performance_tier'] }) {
  const cfg = TIER_CFG[tier]
  return (
    <span
      className={`inline-block text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.text}`}
    >
      {cfg.label}
    </span>
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="bg-white border border-[#e2e8f0] rounded px-4 py-3 space-y-3 animate-pulse">
      <div className="h-3 w-48 bg-[#f1f5f9] rounded" />
      <div className="grid grid-cols-4 gap-3">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="h-16 bg-[#f1f5f9] rounded" />
        ))}
      </div>
      <div className="h-40 bg-[#f8fafc] rounded" />
    </div>
  )
}

// ── EmptySlate ────────────────────────────────────────────────────────────────

function EmptySlate() {
  return (
    <div className="bg-white border border-[#e2e8f0] rounded px-4 py-10 text-center">
      <p className="text-sm text-[#94a3b8]">
        Son 90 günde satış verisi bulunamadı
      </p>
      <p className="text-[10px] text-[#cbd5e1] mt-1">
        SKU performans analizi için satış kaydı gereklidir
      </p>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  companyId: string
}

interface ApiResponse {
  report: SkuPerformanceReport
}

type MergedSku = SkuMetrics & SkuScore

export default function SkuPerformanceClient({ companyId }: Props) {
  const { data, isLoading, error } = useQuery<ApiResponse>({
    queryKey: ['sku-performance', companyId],
    queryFn: async () => {
      const res = await fetch('/api/commercial/sku-performance')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json() as Promise<ApiResponse>
    },
    staleTime: 60 * 60 * 1000, // 1 hour
  })

  if (isLoading) return <Skeleton />
  if (error) return null

  const report = data?.report
  if (!report || report.total_skus === 0) return <EmptySlate />

  const { skus, tier_distribution: td } = report

  return (
    <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#f1f5f9]">
        <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
          SKU Performans Analizi — Son {report.analysis_days} Gün
        </span>
      </div>

      {/* KPI Strip — 4 cells */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 divide-x divide-[#e2e8f0] border-b border-[#e2e8f0]">
        {/* Total SKUs */}
        <div className="p-3">
          <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">
            Toplam SKU
          </div>
          <div className="text-xl font-black tabular-nums leading-none text-[#0f172a]">
            {fmtNum(report.total_skus)}
          </div>
          <div className="text-[9px] text-[#94a3b8] mt-0.5">aktif ürün</div>
        </div>

        {/* Portfolio balance score */}
        <div className="p-3">
          <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">
            Portföy Dengesi
          </div>
          <div
            className={`text-xl font-black tabular-nums leading-none ${
              report.portfolio_balance_score >= 70
                ? 'text-emerald-700'
                : report.portfolio_balance_score >= 40
                  ? 'text-yellow-700'
                  : 'text-red-700'
            }`}
          >
            {fmtScore(report.portfolio_balance_score)}
          </div>
          <div className="text-[9px] text-[#94a3b8] mt-0.5">dağılım skoru / 100</div>
        </div>

        {/* Pareto SKU count */}
        <div className="p-3">
          <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">
            Pareto SKU (80%)
          </div>
          <div className="text-xl font-black tabular-nums leading-none text-[#0f172a]">
            {fmtNum(report.pareto_sku_count)}
          </div>
          <div className="text-[9px] text-[#94a3b8] mt-0.5">
            gelirin %80'ini karşılar
          </div>
        </div>

        {/* Stockout risks */}
        <div className="p-3">
          <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">
            Stok Riski
          </div>
          <div
            className={`text-xl font-black tabular-nums leading-none ${
              report.stockout_risk_skus.length === 0
                ? 'text-emerald-700'
                : report.stockout_risk_skus.length <= 2
                  ? 'text-yellow-700'
                  : 'text-red-700'
            }`}
          >
            {fmtNum(report.stockout_risk_skus.length)}
          </div>
          <div className="text-[9px] text-[#94a3b8] mt-0.5">
            {report.highest_stockout_risk
              ? `En kritik: ${report.highest_stockout_risk}`
              : 'stok riski yok'}
          </div>
        </div>
      </div>

      {/* Tier distribution pill row */}
      <div className="px-4 py-2.5 border-b border-[#f1f5f9] flex flex-wrap gap-2 items-center">
        <span className="text-[9px] font-black uppercase tracking-widest text-[#cbd5e1] mr-1">
          Tier
        </span>
        {(
          [
            ['top',            'Zirve',       'bg-violet-100 text-violet-800'],
            ['core',           'Çekirdek',    'bg-sky-100 text-sky-800'],
            ['niche',          'Niş',         'bg-teal-100 text-teal-700'],
            ['underperformer', 'Düşük Perf.', 'bg-orange-100 text-orange-700'],
            ['discontinued',   'İncelemelik', 'bg-red-100 text-red-700'],
          ] as const
        ).map(([key, label, cls]) => {
          const count = td[key as keyof typeof td]
          return (
            <span
              key={key}
              className={`inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded ${cls}`}
            >
              {label}
              <span className="font-black">{count}</span>
            </span>
          )
        })}
      </div>

      {/* Top SKU callouts */}
      {(report.top_sku_by_revenue || report.top_sku_by_margin) && (
        <div className="px-4 py-2 border-b border-[#f1f5f9] flex flex-wrap gap-4">
          {report.top_sku_by_revenue && (
            <div className="text-[11px] text-[#334155]">
              <span className="text-[9px] font-black uppercase tracking-wide text-amber-600 mr-1">
                En Yüksek Gelir:
              </span>
              <strong>{report.top_sku_by_revenue}</strong>
            </div>
          )}
          {report.top_sku_by_margin && report.top_sku_by_margin !== report.top_sku_by_revenue && (
            <div className="text-[11px] text-[#334155]">
              <span className="text-[9px] font-black uppercase tracking-wide text-emerald-600 mr-1">
                En Yüksek Marj:
              </span>
              <strong>{report.top_sku_by_margin}</strong>
            </div>
          )}
        </div>
      )}

      {/* SKU table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-[#f8fafc] text-[#94a3b8] text-[9px] font-black uppercase tracking-wide">
              <th className="px-3 py-2 text-left">Ürün</th>
              <th className="px-3 py-2 text-left">Kadran</th>
              <th className="px-3 py-2 text-left">Tier</th>
              <th className="px-3 py-2 text-right">Gelir %</th>
              <th className="px-3 py-2 text-right">Marj %</th>
              <th className="px-3 py-2 text-right">Hız / Ay</th>
              <th className="px-3 py-2 text-right">Stok Kapsamı</th>
              <th className="px-3 py-2 text-right">Skor</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f1f5f9]">
            {skus.map((sku: MergedSku) => (
              <tr
                key={sku.product_id}
                className="hover:bg-[#f8fafc] transition-colors"
              >
                <td className="px-3 py-2.5">
                  <div className="font-semibold text-[#0f172a] truncate max-w-[160px]">
                    {sku.product_name}
                  </div>
                  {sku.sku_code && (
                    <div className="text-[9px] text-[#94a3b8] mt-0.5 font-mono">
                      {sku.sku_code}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <QuadrantBadge quadrant={sku.quadrant} />
                </td>
                <td className="px-3 py-2.5">
                  <TierBadge tier={sku.performance_tier} />
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums font-medium text-[#0f172a]">
                  {fmtPct(sku.revenue_contribution_pct)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  <span
                    className={
                      sku.gross_margin_pct >= 40
                        ? 'text-emerald-700 font-bold'
                        : sku.gross_margin_pct >= 20
                          ? 'text-teal-600'
                          : sku.gross_margin_pct >= 0
                            ? 'text-yellow-700'
                            : 'text-red-700 font-bold'
                    }
                  >
                    {fmtPct(sku.gross_margin_pct)}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-[#334155]">
                  {fmtNum(sku.units_velocity)} adet
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {sku.is_stockout ? (
                    <span className="text-[9px] font-black uppercase tracking-wide bg-red-100 text-red-700 px-1.5 py-0.5 rounded">
                      Stok Yok
                    </span>
                  ) : (
                    <span
                      className={
                        sku.stock_coverage_days === null
                          ? 'text-[#94a3b8]'
                          : sku.stock_coverage_days < 7
                            ? 'text-red-700 font-bold'
                            : sku.stock_coverage_days < 14
                              ? 'text-yellow-700'
                              : 'text-[#334155]'
                      }
                    >
                      {fmtDays(sku.stock_coverage_days)}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right">
                  <div
                    className={`inline-block text-[10px] font-black tabular-nums px-2 py-0.5 rounded ${
                      sku.composite_score >= 75
                        ? 'bg-violet-100 text-violet-800'
                        : sku.composite_score >= 50
                          ? 'bg-sky-100 text-sky-800'
                          : sku.composite_score >= 30
                            ? 'bg-teal-50 text-teal-700'
                            : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {fmtScore(sku.composite_score)}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer note */}
      <div className="px-4 py-2 bg-[#f8fafc] border-t border-[#f1f5f9]">
        <p className="text-[9px] text-[#94a3b8]">
          Skor ağırlıkları: Gelir katkısı %35 · Marj %35 · Hız %30
          &nbsp;·&nbsp;
          Pareto: {report.pareto_sku_count} SKU gelirin %80'ini karşılıyor
          &nbsp;·&nbsp;
          Son {report.analysis_days} gün analizi
        </p>
      </div>
    </div>
  )
}
