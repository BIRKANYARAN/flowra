'use client'
// ── DiscountAnalysisClient — Price Elasticity & Discount Analysis ─────────────
// Fetches /api/commercial/discount-analysis via TanStack Query.
// Features:
//   • Discount health badge + narrative callout
//   • KPI strip: avg discount %, discounted deal %, revenue leakage
//   • Discount bucket distribution CSS bars
//   • Product discount table (sorted by revenue, highest avg discount flagged)
//   • Margin erosion indicator
//   • Empty state

import { useQuery } from '@tanstack/react-query'
import type {
  DiscountAnalysisReport,
  DiscountBucket,
  ProductDiscountProfile,
} from '@/lib/services/commercial/discount-analysis.service'

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

function fmtPct(n: number, decimals = 1): string {
  return `%${n.toFixed(decimals)}`
}

// ── Health badge ──────────────────────────────────────────────────────────────

type Health = 'healthy' | 'moderate_concern' | 'high_concern' | 'critical'

const HEALTH_CFG: Record<Health, { label: string; bg: string; text: string }> = {
  healthy:          { label: 'Sağlıklı',         bg: 'bg-emerald-100', text: 'text-emerald-800' },
  moderate_concern: { label: 'Orta Risk',         bg: 'bg-yellow-100',  text: 'text-yellow-700'  },
  high_concern:     { label: 'Yüksek Risk',       bg: 'bg-orange-100',  text: 'text-orange-700'  },
  critical:         { label: 'Kritik',            bg: 'bg-red-100',     text: 'text-red-700'     },
}

function HealthBadge({ health }: { health: Health }) {
  const cfg = HEALTH_CFG[health]
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
      <div className="h-3 w-52 bg-[#f1f5f9] rounded" />
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map(i => (
          <div key={i} className="h-14 bg-[#f1f5f9] rounded" />
        ))}
      </div>
      <div className="h-32 bg-[#f8fafc] rounded" />
      <div className="h-40 bg-[#f8fafc] rounded" />
    </div>
  )
}

// ── Bucket bars ───────────────────────────────────────────────────────────────

function BucketBars({ buckets }: { buckets: DiscountBucket[] }) {
  const maxCount = Math.max(...buckets.map(b => b.deal_count), 1)

  return (
    <div className="space-y-2">
      {buckets.map(b => {
        const barPct = (b.deal_count / maxCount) * 100

        const barColor =
          b.min_pct === 0
            ? 'bg-emerald-400'
            : b.min_pct < 10
              ? 'bg-teal-400'
              : b.min_pct < 20
                ? 'bg-yellow-400'
                : b.min_pct < 30
                  ? 'bg-orange-400'
                  : 'bg-red-400'

        return (
          <div key={b.label} className="flex items-center gap-3">
            <div className="w-14 text-[10px] font-bold text-[#334155] shrink-0">
              {b.label}
            </div>
            <div className="flex-1 h-5 bg-[#f1f5f9] rounded overflow-hidden">
              <div
                className={`h-5 rounded ${barColor}`}
                style={{ width: `${barPct}%` }}
              />
            </div>
            <div className="w-28 text-right shrink-0 flex items-center justify-end gap-2">
              <span className="text-[10px] font-bold tabular-nums text-[#334155]">
                {b.deal_count} adet
              </span>
              <span className="text-[9px] text-[#94a3b8]">
                {fmtPct(b.revenue_share_pct)} ciro
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Product table ─────────────────────────────────────────────────────────────

function ProductTable({ profiles }: { profiles: ProductDiscountProfile[] }) {
  if (profiles.length === 0) {
    return (
      <p className="text-xs text-[#94a3b8] px-2 py-3">Ürün profili bulunamadı.</p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[#f1f5f9]">
            <th className="text-left px-3 py-2 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">
              Ürün
            </th>
            <th className="text-right px-3 py-2 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">
              Liste Fiyatı
            </th>
            <th className="text-right px-3 py-2 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">
              Ort. Satış
            </th>
            <th className="text-right px-3 py-2 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">
              Ort. İskonto
            </th>
            <th className="text-right px-3 py-2 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">
              Maks İskonto
            </th>
            <th className="text-right px-3 py-2 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">
              Ciro
            </th>
            <th className="text-right px-3 py-2 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">
              İşlem
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#f8fafc]">
          {profiles.map(p => {
            const isHighDiscount = p.avg_discount_pct > 15
            return (
              <tr
                key={p.product_id}
                className="hover:bg-[#f8fafc]/60"
              >
                <td className="px-3 py-2 text-[11px] font-medium text-[#334155] max-w-[160px] truncate">
                  {isHighDiscount && (
                    <span className="mr-1 text-red-500" title="Yüksek iskonto">▲</span>
                  )}
                  {p.product_name}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-[11px] text-[#64748b]">
                  {p.avg_list_price > 0 ? fmtTRY(p.avg_list_price) : '—'}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-[11px] text-[#334155] font-medium">
                  {fmtTRY(p.avg_selling_price)}
                </td>
                <td className={`px-3 py-2 text-right tabular-nums text-[11px] font-bold ${
                  p.avg_discount_pct > 25
                    ? 'text-red-600'
                    : p.avg_discount_pct > 15
                      ? 'text-orange-600'
                      : p.avg_discount_pct > 8
                        ? 'text-yellow-600'
                        : 'text-emerald-700'
                }`}>
                  {fmtPct(p.avg_discount_pct)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-[11px] text-[#64748b]">
                  {fmtPct(p.max_discount_pct)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-[11px] font-bold text-brand">
                  {fmtTRY(p.revenue_try)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-[11px] text-[#94a3b8]">
                  {p.deal_count}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  companyId: string
}

interface ApiResponse {
  report: DiscountAnalysisReport
}

export default function DiscountAnalysisClient({ companyId: _companyId }: Props) {
  const { data, isLoading, error } = useQuery<ApiResponse>({
    queryKey: ['discount-analysis'],
    queryFn: async () => {
      const res = await fetch('/api/commercial/discount-analysis')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json() as Promise<ApiResponse>
    },
    staleTime: 30 * 60 * 1000, // 30 minutes
  })

  if (isLoading) return <Skeleton />
  if (error) return null

  const report = data?.report

  if (!report || report.total_deals === 0) {
    return (
      <div className="bg-white border border-[#e2e8f0] rounded px-4 py-6 text-center">
        <p className="text-sm text-[#94a3b8]">
          İskonto analizi için yeterli satış verisi bulunamadı.
        </p>
        <p className="text-[10px] text-[#cbd5e1] mt-1">
          {report?.period_label ?? 'Son 3 Ay'} tarandı
        </p>
      </div>
    )
  }

  const frequencyPct = report.discount_frequency * 100

  return (
    <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden">

      {/* Header */}
      <div className="px-4 py-3 border-b border-[#f1f5f9] flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
            İskonto & Fiyat Esnekliği Analizi
          </span>
          <HealthBadge health={report.discount_health} />
        </div>
        <span className="text-[9px] text-[#cbd5e1]">{report.period_label}</span>
      </div>

      {/* Narrative callout */}
      <div className={`px-4 py-2 border-b border-[#f1f5f9] text-[11px] font-medium ${
        report.discount_health === 'critical'
          ? 'bg-red-50 text-red-700'
          : report.discount_health === 'high_concern'
            ? 'bg-orange-50 text-orange-700'
            : report.discount_health === 'moderate_concern'
              ? 'bg-yellow-50 text-yellow-700'
              : 'bg-emerald-50 text-emerald-700'
      }`}>
        {report.narrative}
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 divide-x divide-[#e2e8f0] border-b border-[#e2e8f0]">
        <div className="p-3">
          <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">
            Ort. İskonto
          </div>
          <div className={`text-lg font-black tabular-nums leading-none ${
            report.avg_discount_pct != null && report.avg_discount_pct > 15
              ? 'text-red-600'
              : report.avg_discount_pct != null && report.avg_discount_pct > 8
                ? 'text-yellow-600'
                : 'text-emerald-700'
          }`}>
            {report.avg_discount_pct != null ? fmtPct(report.avg_discount_pct) : '—'}
          </div>
          <div className="text-[9px] text-[#94a3b8] mt-0.5">Gelir ağırlıklı</div>
        </div>

        <div className="p-3">
          <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">
            İskontolu İşlem
          </div>
          <div className="text-lg font-black tabular-nums leading-none text-[#0f172a]">
            {fmtPct(frequencyPct)}
          </div>
          <div className="text-[9px] text-[#94a3b8] mt-0.5">
            {report.discounted_deals} / {report.total_deals} işlem
          </div>
        </div>

        <div className="p-3">
          <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">
            Ciro Kaybı
          </div>
          <div className={`text-lg font-black tabular-nums leading-none ${
            report.revenue_leakage_try > 0 ? 'text-orange-600' : 'text-[#0f172a]'
          }`}>
            {fmtTRY(report.revenue_leakage_try)}
          </div>
          <div className="text-[9px] text-[#94a3b8] mt-0.5">Liste fiyatından sapma</div>
        </div>

        <div className="p-3">
          <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">
            Marj Erozyonu
          </div>
          <div className={`text-lg font-black tabular-nums leading-none ${
            report.margin_erosion_pp != null && report.margin_erosion_pp < -5
              ? 'text-red-600'
              : report.margin_erosion_pp != null && report.margin_erosion_pp < 0
                ? 'text-yellow-600'
                : 'text-[#0f172a]'
          }`}>
            {report.margin_erosion_pp != null
              ? `${report.margin_erosion_pp > 0 ? '+' : ''}${report.margin_erosion_pp.toFixed(1)} pp`
              : '—'}
          </div>
          <div className="text-[9px] text-[#94a3b8] mt-0.5">İskontolu vs iskontosuz</div>
        </div>
      </div>

      {/* Bucket distribution */}
      <div className="px-4 py-3 border-b border-[#f1f5f9]">
        <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] mb-3">
          İskonto Dağılımı
        </div>
        <BucketBars buckets={report.discount_buckets} />
      </div>

      {/* Most discounted product callout */}
      {report.most_discounted_product && (
        <div className="px-4 py-2 border-b border-[#f1f5f9] flex items-center gap-2 bg-[#fef9f0]">
          <span className="text-[9px] font-black uppercase tracking-wide text-orange-600 shrink-0">
            En yüksek iskontolu ürün:
          </span>
          <span className="text-[11px] font-bold text-[#334155] truncate">
            {report.most_discounted_product.product_name}
          </span>
          <span className="text-[10px] text-[#94a3b8] ml-auto shrink-0">
            Ort. {fmtPct(report.most_discounted_product.avg_discount_pct)} iskonto
          </span>
        </div>
      )}

      {/* Product table */}
      <div className="border-b border-[#f1f5f9]">
        <div className="px-4 py-2">
          <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">
            Ürün Bazlı İskonto Profili
          </div>
        </div>
        <ProductTable profiles={report.product_profiles} />
      </div>

      {/* Footer note */}
      <div className="px-4 py-2 text-[9px] text-[#cbd5e1]">
        Son 3 ay satışları analiz edildi. Ciro kaybı = (liste fiyatı - satış fiyatı) × adet. İskontosuz bazda marj verisi yoksa erozyon hesaplanamaz.
      </div>
    </div>
  )
}
