'use client'

// ─────────────────────────────────────────────────────────────────────────────
// RevenueQualityClient
//
// Revenue Quality Score dashboard — 5-dimension revenue health scoring.
//
// Features:
//   - Large composite score with quality class label in Turkish
//   - 5 dimension bars (horizontal, 0-100 scale) with Turkish labels
//   - Growth quality badge
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery } from '@tanstack/react-query'
import type { RevenueQualityReport } from '@/lib/services/finance/revenue-quality.service'
import type { classifyRevenueQuality, classifyGrowthQuality } from '@/lib/services/finance/revenue-quality.service'

// ── Turkish labels ─────────────────────────────────────────────────────────────

type QualityClass = ReturnType<typeof classifyRevenueQuality>
type GrowthQuality = ReturnType<typeof classifyGrowthQuality>

const QUALITY_LABELS: Record<QualityClass, string> = {
  premium:    'Birinci Sınıf',
  strong:     'Güçlü',
  moderate:   'Orta',
  developing: 'Gelişiyor',
  fragile:    'Kırılgan',
}

const QUALITY_COLORS: Record<QualityClass, { bg: string; text: string; bar: string }> = {
  premium:    { bg: 'bg-emerald-100', text: 'text-emerald-800', bar: 'bg-emerald-500' },
  strong:     { bg: 'bg-teal-100',    text: 'text-teal-800',    bar: 'bg-teal-500'    },
  moderate:   { bg: 'bg-blue-100',    text: 'text-blue-800',    bar: 'bg-blue-500'    },
  developing: { bg: 'bg-yellow-100',  text: 'text-yellow-800',  bar: 'bg-yellow-400'  },
  fragile:    { bg: 'bg-red-100',     text: 'text-red-800',     bar: 'bg-red-500'     },
}

const GROWTH_LABELS: Record<GrowthQuality, { label: string; style: string }> = {
  quality_growth: { label: 'Kaliteli Büyüme',      style: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  growth_only:    { label: 'Büyüme (kalite düşük)', style: 'bg-yellow-100  text-yellow-800  border-yellow-200'  },
  quality_only:   { label: 'Kalite Artıyor',        style: 'bg-blue-100    text-blue-800    border-blue-200'    },
  stagnant:       { label: 'Durağan',               style: 'bg-slate-100   text-slate-600   border-slate-200'   },
  declining:      { label: 'Gelir Düşüyor',         style: 'bg-red-100     text-red-800     border-red-200'     },
}

const DIMENSION_LABELS: Record<string, string> = {
  predictability:   'Öngörülebilirlik',
  diversification:  'Müşteri Dağılımı',
  collection:       'Tahsilat Etkinliği',
  recurring:        'Yinelenen Gelir',
  margin_stability: 'Marj İstikrarı',
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function DimensionBar({
  label,
  score,
  isWeakest,
}: {
  label:     string
  score:     number
  isWeakest: boolean
}) {
  const width     = Math.max(0, Math.min(100, score))
  const barColor  = score >= 70
    ? 'bg-emerald-500'
    : score >= 50
      ? 'bg-blue-400'
      : score >= 35
        ? 'bg-yellow-400'
        : 'bg-red-400'

  return (
    <div className={`space-y-1 ${isWeakest ? 'ring-1 ring-red-200 rounded p-1.5 -mx-1.5' : ''}`}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-[#475569]">
          {label}
          {isWeakest && (
            <span className="ml-1.5 text-[9px] font-black text-red-500 uppercase tracking-wide">
              En Zayıf
            </span>
          )}
        </span>
        <span className="text-[11px] font-black tabular-nums text-[#1e293b]">
          {score.toFixed(0)}
        </span>
      </div>
      <div className="w-full h-2.5 bg-[#f1f5f9] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="bg-white border border-[#e2e8f0] rounded p-6 shadow-sm animate-pulse space-y-4">
      <div className="h-4 bg-[#f1f5f9] rounded w-48" />
      <div className="h-24 bg-[#f1f5f9] rounded" />
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-8 bg-[#f1f5f9] rounded" />
        ))}
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

interface Props {
  companyId: string
}

export function RevenueQualityClient({ companyId }: Props) {
  const { data, isLoading, isError } = useQuery<{ report: RevenueQualityReport }>({
    queryKey: ['revenue-quality', companyId],
    queryFn:  async () => {
      const res = await fetch('/api/finance/revenue-quality')
      if (!res.ok) throw new Error('Gelir kalite skoru yüklenemedi')
      return res.json()
    },
    staleTime: 60 * 60 * 1000,   // 1 hour
  })

  if (isLoading) return <LoadingSkeleton />

  if (isError || !data?.report) {
    return (
      <div className="bg-white border border-[#e2e8f0] rounded p-6 shadow-sm text-center">
        <p className="text-sm text-[#64748b] font-medium">
          Gelir kalite verisi yüklenirken hata oluştu.
        </p>
      </div>
    )
  }

  const report  = data.report
  const qColors = QUALITY_COLORS[report.quality_class]
  const growth  = GROWTH_LABELS[report.growth_quality]

  const dimensionOrder: Array<keyof typeof report.dimensions> = [
    'predictability',
    'diversification',
    'collection',
    'recurring',
    'margin_stability',
  ]

  return (
    <div className="space-y-4">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
        Gelir Kalite Skoru
      </div>

      {/* ── Composite score card ───────────────────────────────────────────── */}
      <div className={`${qColors.bg} rounded-lg p-5 flex items-center justify-between gap-4`}>
        <div>
          <div className={`text-5xl font-black tabular-nums ${qColors.text}`}>
            {report.composite_score.toFixed(0)}
          </div>
          <div className={`text-[11px] font-black mt-1 ${qColors.text}`}>
            / 100
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className={`
            inline-flex items-center px-3 py-1 rounded-full border text-[12px] font-black
            ${qColors.bg} ${qColors.text} border-current/20
          `}>
            {QUALITY_LABELS[report.quality_class]}
          </span>
          <span className={`
            inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-semibold
            ${growth.style}
          `}>
            {growth.label}
          </span>
          {report.revenue_growth_pct !== null && (
            <span className={`text-[10px] font-semibold ${report.revenue_growth_pct >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
              Büyüme: {report.revenue_growth_pct >= 0 ? '+' : ''}{report.revenue_growth_pct.toFixed(1)}%
            </span>
          )}
        </div>
      </div>

      {/* ── Dimension bars ─────────────────────────────────────────────────── */}
      <div className="bg-white border border-[#e2e8f0] rounded p-5 shadow-sm space-y-3">
        <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-3">
          Boyut Analizi
        </div>
        {dimensionOrder.map(key => (
          <DimensionBar
            key={key}
            label={DIMENSION_LABELS[key]}
            score={report.dimensions[key]}
            isWeakest={report.weakest_dimension === key}
          />
        ))}
      </div>

      {/* ── Footer note ────────────────────────────────────────────────────── */}
      <div className="text-[10px] text-[#94a3b8] text-right">
        Son {report.analysis_months} aylık veri baz alındı
      </div>
    </div>
  )
}
