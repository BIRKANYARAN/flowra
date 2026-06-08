'use client'
// ── ProformaAnalyticsClient — 90-day proforma pipeline analytics ──────────────
// Client island: fetches /api/commercial/proforma-analytics via TanStack Query.
// Renders: 4-chip summary, monthly trend sparkline, size distribution, top products.

import { useQuery } from '@tanstack/react-query'
import type {
  ProformaAnalyticsReport,
  MonthlyProformaStat,
  SizeBucket,
  ProformaProductStat,
} from '@/lib/services/commercial/proforma-analytics.service'

// ── Format helpers ────────────────────────────────────────────────────────────

const TRY_FMT = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 })
function fmtTRY(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `₺${(n / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000)     return `₺${(n / 1_000).toFixed(1)}K`
  return `₺${TRY_FMT.format(Math.round(n))}`
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="bg-white border border-[#e2e8f0] rounded-xl shadow-soft px-4 py-3 space-y-3 animate-pulse">
      <div className="h-3 w-32 bg-[#f1f5f9] rounded" />
      <div className="grid grid-cols-4 gap-0 border border-[#e2e8f0] rounded overflow-hidden">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="p-3 h-16 bg-[#f8fafc]" />
        ))}
      </div>
      <div className="h-14 bg-[#f1f5f9] rounded" />
    </div>
  )
}

// ── Monthly trend mini-bars ───────────────────────────────────────────────────

function TrendBars({ months }: { months: MonthlyProformaStat[] }) {
  const maxCreated = Math.max(...months.map(m => m.created), 1)
  return (
    <div>
      <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-2">
        Aylık Trend (Kazanma Oranı)
      </div>
      <div className="flex items-end gap-1 h-10">
        {months.map(mo => {
          const barH = Math.max(4, Math.round((mo.created / maxCreated) * 40))
          const wr   = mo.win_rate_pct
          const barColor =
            wr === null       ? 'bg-[#e2e8f0]'
            : wr >= 60        ? 'bg-pos-light'
            : wr >= 40        ? 'bg-warn-light'
            : mo.created > 0  ? 'bg-neg-light'
            : 'bg-[#f1f5f9]'
          return (
            <div key={mo.month} className="flex flex-col items-center flex-1 min-w-0 gap-0.5">
              <div
                className={`w-full rounded-sm ${barColor}`}
                style={{ height: `${barH}px` }}
                title={`${mo.label}: ${mo.created} teklif, %${wr !== null ? wr.toFixed(0) : '—'} kazanma`}
              />
              <div className="text-[8px] text-[#94a3b8] truncate w-full text-center leading-none">
                {mo.label.split(' ')[0]}
              </div>
            </div>
          )
        })}
      </div>
      <div className="flex gap-3 mt-1.5">
        {months.map(mo => (
          <div key={mo.month} className="flex-1 text-center">
            {mo.win_rate_pct !== null ? (
              <span className={`text-[9px] font-black tabular-nums ${
                mo.win_rate_pct >= 60 ? 'text-pos-text' : mo.win_rate_pct >= 40 ? 'text-warn-text' : 'text-neg'
              }`}>
                %{mo.win_rate_pct.toFixed(0)}
              </span>
            ) : (
              <span className="text-[9px] text-[#cbd5e1]">—</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Size distribution table ───────────────────────────────────────────────────

function SizeTable({ buckets, total }: { buckets: SizeBucket[]; total: number }) {
  const nonEmpty = buckets.filter(b => b.count > 0)
  if (nonEmpty.length === 0) return null
  return (
    <div>
      <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-2">
        Anlaşma Büyüklüğü Dağılımı
      </div>
      <div className="border border-[#e2e8f0] rounded overflow-hidden">
        <div className="grid grid-cols-3 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] px-3 py-1.5 border-b border-[#f1f5f9] bg-[#f8fafc]">
          <div>Aralık</div>
          <div className="text-right">Teklif</div>
          <div className="text-right">Toplam TL</div>
        </div>
        {buckets.map(b => (
          <div key={b.label} className={`grid grid-cols-3 px-3 py-2 border-b border-[#f1f5f9] last:border-b-0 ${b.count === 0 ? 'opacity-30' : ''}`}>
            <div className="text-[11px] font-semibold text-[#334155]">{b.label}</div>
            <div className="text-right text-[11px] tabular-nums font-black text-[#0f172a]">
              {b.count}
              {total > 0 && b.count > 0 && (
                <span className="text-[9px] font-normal text-[#94a3b8] ml-1">
                  %{Math.round((b.count / total) * 100)}
                </span>
              )}
            </div>
            <div className="text-right text-[11px] tabular-nums text-[#334155]">
              {b.value_try > 0 ? fmtTRY(b.value_try) : '—'}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Top products section ──────────────────────────────────────────────────────

function TopProducts({ products }: { products: ProformaProductStat[] }) {
  const top5 = products.slice(0, 5)
  if (top5.length === 0) return null
  return (
    <div>
      <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-2">
        Tekliflerde En Çok Görünen Ürünler
      </div>
      <div className="space-y-1.5">
        {top5.map((p, i) => (
          <div key={p.product_id || p.product_name} className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[9px] font-black text-[#94a3b8] tabular-nums w-3">{i + 1}</span>
              <span className="text-[11px] font-medium text-[#334155] truncate">{p.product_name || '(isimsiz)'}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[10px] text-[#64748b] tabular-nums">{p.times_quoted}x</span>
              <span className={`text-[9px] font-black px-1.5 py-0.5 rounded tabular-nums ${
                p.win_rate_pct >= 60 ? 'bg-pos-light text-pos-text'
                : p.win_rate_pct >= 40 ? 'bg-warn-light text-warn-text'
                : p.times_converted > 0 ? 'bg-neg-light text-neg-text'
                : 'bg-[#f1f5f9] text-[#94a3b8]'
              }`}>
                %{p.win_rate_pct}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface ApiResponse {
  report: ProformaAnalyticsReport
}

export function ProformaAnalyticsClient() {
  const { data, isLoading, error } = useQuery<ApiResponse>({
    queryKey: ['proforma-analytics-report'],
    queryFn:  () => fetch('/api/commercial/proforma-analytics').then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json()
    }),
    staleTime: 5 * 60 * 1_000,
  })

  if (isLoading) return <Skeleton />
  if (error || !data?.report) return null

  const rpt = data.report
  if (rpt.total_created === 0) return null

  const summaryCards = [
    {
      label: 'Kazanma Oranı',
      value: rpt.win_rate_pct !== null ? `%${rpt.win_rate_pct.toFixed(0)}` : '—',
      sub:   `${rpt.total_converted + rpt.total_expired} kararlaştırıldı`,
      color: rpt.win_rate_pct === null ? 'text-[#94a3b8]'
        : rpt.win_rate_pct >= 60 ? 'text-pos-text'
        : rpt.win_rate_pct >= 40 ? 'text-warn-text'
        : 'text-neg',
    },
    {
      label: 'Oluşturulan Teklif',
      value: String(rpt.total_created),
      sub:   `son ${rpt.period_days} gün`,
      color: 'text-[#0f172a]',
    },
    {
      label: 'Ort. Teklif Tutarı',
      value: rpt.avg_value_try > 0 ? fmtTRY(rpt.avg_value_try) : '—',
      sub:   rpt.median_value_try > 0 ? `Medyan: ${fmtTRY(rpt.median_value_try)}` : 'Veri yok',
      color: 'text-[#334155]',
    },
    {
      label: 'Ort. Dönüşüm Süresi',
      value: rpt.avg_days_to_convert !== null ? `${rpt.avg_days_to_convert}g` : '—',
      sub:   rpt.median_days_to_convert !== null ? `Medyan: ${rpt.median_days_to_convert}g` : 'Dönüşüm yok',
      color: rpt.avg_days_to_convert !== null ? 'text-info-text' : 'text-[#94a3b8]',
    },
  ]

  return (
    <div className="bg-white border border-[#e2e8f0] rounded-xl shadow-soft px-4 py-3 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
          Proforma Analizi — Son {rpt.period_days} Gün
        </span>
        <span className="text-[9px] text-[#94a3b8]">{rpt.total_pending} bekleyen</span>
      </div>

      {/* 4-chip summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 border border-[#e2e8f0] rounded overflow-hidden">
        {summaryCards.map((card, i) => (
          <div key={card.label} className={`p-3 ${i < 3 ? 'border-b sm:border-b-0 sm:border-r border-[#e2e8f0]' : ''}`}>
            <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">{card.label}</div>
            <div className={`text-xl font-black tabular-nums leading-none ${card.color}`}>{card.value}</div>
            <div className="text-[10px] text-[#94a3b8] mt-1 leading-tight">{card.sub}</div>
          </div>
        ))}
      </div>

      {/* Monthly trend + size table side-by-side on larger screens */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Monthly trend sparkline */}
        {rpt.monthly_trend.length > 0 && (
          <TrendBars months={rpt.monthly_trend} />
        )}

        {/* Size distribution */}
        <SizeTable buckets={rpt.size_buckets} total={rpt.total_created} />
      </div>

      {/* Top 5 products */}
      {rpt.top_products.length > 0 && (
        <TopProducts products={rpt.top_products} />
      )}
    </div>
  )
}
