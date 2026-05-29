'use client'

// ─────────────────────────────────────────────────────────────────────────────
// FinancialBenchmarkingClient — Turkish SME Industry Benchmark Positioning
//
// Features:
//   - Composite score badge (0-100) with position label
//   - Top 3 strengths with percentile bars
//   - Top 3 weaknesses with percentile bars
//   - Full metrics grid: value, percentile pill, benchmark p50
//   - Turkish narrative footer
//   - Loading skeleton + error state
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery } from '@tanstack/react-query'
import type {
  FinancialBenchmarkReport,
  BenchmarkComparison,
} from '@/lib/services/intelligence/financial-benchmarking.service'

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  companyId: string
}

// ── Position config ───────────────────────────────────────────────────────────

const POSITION_CFG: Record<
  'top_quartile' | 'above_median' | 'below_median' | 'bottom_quartile' | 'no_data',
  { pill: string; barBg: string; label: string }
> = {
  top_quartile:   { pill: 'bg-pos-light text-pos-text border-pos',           barBg: 'bg-pos-text',    label: 'Üst Çeyrek' },
  above_median:   { pill: 'bg-[#f0fdfa] text-[#0f766e] border-[#99f6e4]',   barBg: 'bg-[#0f766e]',  label: 'Medyan Üstü' },
  below_median:   { pill: 'bg-warn-light text-warn-text border-warn',        barBg: 'bg-warn-text',   label: 'Medyan Altı' },
  bottom_quartile:{ pill: 'bg-neg-light text-neg border-neg',                barBg: 'bg-neg',         label: 'Alt Çeyrek' },
  no_data:        { pill: 'bg-[#f8fafc] text-[#94a3b8] border-[#e2e8f0]',   barBg: 'bg-[#cbd5e1]',  label: 'Veri Yok' },
}

const BENCHMARK_POSITION_CFG: Record<
  string,
  { badge: string; label: string }
> = {
  industry_leader:   { badge: 'bg-pos-light text-pos-text border-pos',           label: 'Sektör Lideri' },
  above_average:     { badge: 'bg-[#f0fdfa] text-[#0f766e] border-[#99f6e4]',   label: 'Ortalamanın Üstü' },
  average:           { badge: 'bg-warn-light text-warn-text border-warn',        label: 'Sektör Ortalaması' },
  below_average:     { badge: 'bg-[#fffbeb] text-[#d97706] border-[#fde68a]',   label: 'Ortalamanın Altı' },
  lagging:           { badge: 'bg-neg-light text-neg border-neg',                label: 'Geride Kalıyor' },
  insufficient_data: { badge: 'bg-[#f8fafc] text-[#94a3b8] border-[#e2e8f0]',  label: 'Yetersiz Veri' },
}

// ── Percentile bar component ──────────────────────────────────────────────────

function PercentileBar({
  comparison,
  showLabel = true,
}: {
  comparison: BenchmarkComparison
  showLabel?: boolean
}) {
  const cfg = POSITION_CFG[comparison.position]
  const pct = comparison.estimated_percentile ?? 0
  const valueStr = comparison.value !== null
    ? comparison.value.toFixed(1)
    : '—'

  return (
    <div className="py-2 border-b border-[#f1f5f9] last:border-0">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {showLabel && (
            <span className="text-xs text-[#0f172a] truncate font-medium">
              {comparison.metric_label_tr}
            </span>
          )}
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-semibold shrink-0 ${cfg.pill}`}
          >
            {cfg.label}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          <span className="text-[10px] text-[#94a3b8]">
            P50: {comparison.benchmark_p50}
          </span>
          <span className="text-xs font-bold tabular-nums text-[#0f172a] min-w-[3rem] text-right">
            {valueStr}
          </span>
        </div>
      </div>
      <div className="relative w-full bg-[#f1f5f9] rounded-full h-2">
        {/* Median marker at 50% */}
        <div
          className="absolute top-0 w-0.5 h-2 bg-[#cbd5e1] z-10"
          style={{ left: '50%' }}
        />
        <div
          className={`h-2 rounded-full transition-all duration-500 ${cfg.barBg}`}
          style={{ width: `${Math.min(95, pct)}%` }}
        />
      </div>
      <div className="flex justify-between mt-0.5">
        <span className="text-[10px] text-[#94a3b8]">P25: {comparison.benchmark_p25}</span>
        <span className="text-[10px] text-[#94a3b8] tabular-nums">
          {comparison.estimated_percentile !== null
            ? `~${Math.round(comparison.estimated_percentile)}. percentil`
            : 'Veri yok'}
        </span>
        <span className="text-[10px] text-[#94a3b8]">P75: {comparison.benchmark_p75}</span>
      </div>
    </div>
  )
}

// ── Metric grid row ───────────────────────────────────────────────────────────

function MetricRow({ comparison }: { comparison: BenchmarkComparison }) {
  const cfg = POSITION_CFG[comparison.position]
  const valueStr = comparison.value !== null ? comparison.value.toFixed(1) : '—'
  const pctStr = comparison.estimated_percentile !== null
    ? `~${Math.round(comparison.estimated_percentile)}p`
    : '—'

  return (
    <div className="flex items-center gap-2 py-2 border-b border-[#f1f5f9] last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-xs text-[#0f172a] font-medium truncate">
          {comparison.metric_label_tr}
        </p>
        <p className="text-[10px] text-[#94a3b8] mt-0.5">
          Medyan: {comparison.benchmark_p50}
          {comparison.direction === 'lower_is_better' && ' (düşük = iyi)'}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-sm font-bold tabular-nums text-[#0f172a]">{valueStr}</span>
        <span
          className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-semibold w-16 justify-center ${cfg.pill}`}
        >
          {pctStr}
        </span>
      </div>
    </div>
  )
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="animate-pulse space-y-3 px-4 py-4">
      <div className="h-20 bg-[#f1f5f9] rounded-xl w-full" />
      <div className="h-4 bg-[#f1f5f9] rounded w-3/4" />
      <div className="h-4 bg-[#f1f5f9] rounded w-1/2" />
      <div className="h-4 bg-[#f1f5f9] rounded w-2/3" />
      <div className="h-32 bg-[#f1f5f9] rounded-xl w-full" />
      <div className="h-4 bg-[#f1f5f9] rounded w-full" />
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function FinancialBenchmarkingClient({ companyId }: Props) {
  const { data, isLoading, error } = useQuery<{ report: FinancialBenchmarkReport }>({
    queryKey:  ['financial-benchmarking', companyId],
    queryFn:   async () => {
      const res = await fetch('/api/intelligence/financial-benchmarking')
      if (!res.ok) throw new Error('Kıyaslama raporu alınamadı')
      return res.json()
    },
    staleTime: 30 * 60 * 1000,  // 30 min
  })

  const report = data?.report
  const posCfg = report
    ? BENCHMARK_POSITION_CFG[report.benchmark_position] ?? BENCHMARK_POSITION_CFG.insufficient_data
    : null

  return (
    <section className="bg-white border border-[#e2e8f0] rounded-lg shadow-sm overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#f1f5f9]">
        <div>
          <h2 className="text-sm font-bold text-[#0f172a]">Sektör Kıyaslaması</h2>
          <p className="text-[10px] text-[#94a3b8] mt-0.5">Türkiye KOBİ Benchmarkları 2024</p>
        </div>
        {report && (
          <span className="text-[10px] text-[#94a3b8]">{report.as_of_date}</span>
        )}
      </div>

      {/* Loading */}
      {isLoading && <Skeleton />}

      {/* Error */}
      {error && (
        <div className="px-4 py-4 text-xs text-neg">
          Kıyaslama raporu yüklenemedi. Sayfayı yenileyin.
        </div>
      )}

      {/* Composite score hero */}
      {report && posCfg && (
        <div className="flex items-center gap-4 px-4 py-4 bg-[#f8fafc] border-b border-[#f1f5f9]">
          <div
            className={`flex flex-col items-center justify-center w-24 h-24 rounded-xl border-2 shrink-0 ${posCfg.badge}`}
          >
            <span className="text-4xl font-black leading-none">
              {report.composite_score !== null ? Math.round(report.composite_score) : '—'}
            </span>
            <span className="text-[10px] font-semibold mt-0.5">/ 100</span>
          </div>

          <div className="flex-1 min-w-0">
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-bold ${posCfg.badge}`}
            >
              {posCfg.label}
            </span>

            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 mt-2">
              <span className="text-[10px] text-pos-text">
                Üst çeyrek: {report.top_quartile_count}
              </span>
              <span className="text-[10px] text-[#0f766e]">
                Med. üstü: {report.above_median_count}
              </span>
              <span className="text-[10px] text-warn-text">
                Med. altı: {report.below_median_count}
              </span>
              <span className="text-[10px] text-neg">
                Alt çeyrek: {report.bottom_quartile_count}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Strengths */}
      {report && report.strengths.length > 0 && (
        <div className="px-4 pt-3 pb-1">
          <h3 className="text-[11px] font-bold text-pos-text uppercase tracking-wide mb-1">
            Güçlü Alanlar (Top {report.strengths.slice(0, 3).length})
          </h3>
          {report.strengths.slice(0, 3).map(c => (
            <PercentileBar key={c.metric_key} comparison={c} />
          ))}
        </div>
      )}

      {/* Weaknesses */}
      {report && report.weaknesses.length > 0 && (
        <div className="px-4 pt-3 pb-1 border-t border-[#f1f5f9]">
          <h3 className="text-[11px] font-bold text-neg uppercase tracking-wide mb-1">
            İyileştirme Alanları (Alt {report.weaknesses.slice(0, 3).length})
          </h3>
          {report.weaknesses.slice(0, 3).map(c => (
            <PercentileBar key={c.metric_key} comparison={c} />
          ))}
        </div>
      )}

      {/* Full metrics grid */}
      {report && (
        <div className="px-4 pt-3 pb-1 border-t border-[#f1f5f9]">
          <h3 className="text-[11px] font-bold text-[#64748b] uppercase tracking-wide mb-1">
            Tüm Metrikler
          </h3>
          {report.comparisons.map(c => (
            <MetricRow key={c.metric_key} comparison={c} />
          ))}
        </div>
      )}

      {/* Narrative footer */}
      {report && (
        <div className="px-4 py-3 bg-[#f8fafc] border-t border-[#f1f5f9]">
          <p className="text-[11px] text-[#475569] leading-relaxed">{report.narrative}</p>
        </div>
      )}
    </section>
  )
}
