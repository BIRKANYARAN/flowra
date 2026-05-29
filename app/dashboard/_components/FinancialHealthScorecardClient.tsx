'use client'

// ─────────────────────────────────────────────────────────────────────────────
// FinancialHealthScorecardClient — CEO Cockpit: 6-Dimension Health Scorecard
//
// Features:
//   - Composite score as large hero number with health badge
//   - 6-dimension horizontal bar display with score, weight, status
//   - Trend arrow with color coding
//   - Turkish narrative footer
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery } from '@tanstack/react-query'
import type {
  FinancialHealthScorecardReport,
  DimensionScore,
} from '@/lib/services/intelligence/financial-health-scorecard.service'

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  companyId: string
}

// ── Health level config ───────────────────────────────────────────────────────

const HEALTH_CFG: Record<
  'excellent' | 'good' | 'fair' | 'poor' | 'critical',
  { badge: string; barBg: string; label: string }
> = {
  excellent: {
    badge: 'bg-pos-light text-pos-text border-pos',
    barBg: 'bg-pos-text',
    label: 'Mükemmel',
  },
  good: {
    badge: 'bg-[#f0fdfa] text-[#0f766e] border-[#99f6e4]',
    barBg: 'bg-[#0f766e]',
    label: 'İyi',
  },
  fair: {
    badge: 'bg-warn-light text-warn-text border-warn',
    barBg: 'bg-warn-text',
    label: 'Orta',
  },
  poor: {
    badge: 'bg-[#fffbeb] text-[#d97706] border-[#fde68a]',
    barBg: 'bg-[#d97706]',
    label: 'Zayıf',
  },
  critical: {
    badge: 'bg-neg-light text-neg border-neg',
    barBg: 'bg-neg',
    label: 'Kritik',
  },
}

// ── Trend display ─────────────────────────────────────────────────────────────

function TrendBadge({
  trend,
}: {
  trend: FinancialHealthScorecardReport['score_trend']
}) {
  if (trend === 'improving')
    return (
      <span className="inline-flex items-center gap-1 text-pos-text font-semibold text-xs">
        <span>↑</span>
        <span>Yükseliyor</span>
      </span>
    )
  if (trend === 'declining')
    return (
      <span className="inline-flex items-center gap-1 text-neg font-semibold text-xs">
        <span>↓</span>
        <span>Düşüyor</span>
      </span>
    )
  if (trend === 'stable')
    return (
      <span className="inline-flex items-center gap-1 text-[#64748b] text-xs">
        <span>→</span>
        <span>Stabil</span>
      </span>
    )
  return (
    <span className="text-[#94a3b8] text-xs">Veri yok</span>
  )
}

// ── Dimension row with horizontal bar ─────────────────────────────────────────

function DimensionRow({ dim }: { dim: DimensionScore }) {
  const cfg = HEALTH_CFG[dim.status]
  return (
    <div className="py-2.5 border-b border-[#f1f5f9] last:border-0">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-medium text-[#0f172a] truncate">
            {DIMENSION_LABELS[dim.dimension as keyof typeof DIMENSION_LABELS] ?? dim.dimension}
          </span>
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-semibold shrink-0 ${cfg.badge}`}
          >
            {cfg.label}
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-3">
          <span className="text-[10px] text-[#94a3b8]">{dim.key_metric}</span>
          <span className="text-xs font-bold tabular-nums text-[#0f172a] w-8 text-right">
            {Math.round(dim.score)}
          </span>
        </div>
      </div>
      <div className="w-full bg-[#f1f5f9] rounded-full h-1.5">
        <div
          className={`h-1.5 rounded-full transition-all duration-500 ${cfg.barBg}`}
          style={{ width: `${dim.score}%` }}
        />
      </div>
      <div className="flex justify-between mt-0.5">
        <span className="text-[10px] text-[#94a3b8]">
          Ağırlık: {Math.round(dim.weight * 100)}%
        </span>
        <span className="text-[10px] text-[#94a3b8]">
          Katkı: {dim.weighted_score.toFixed(1)}
        </span>
      </div>
    </div>
  )
}

// ── Dimension labels (Turkish) ────────────────────────────────────────────────

const DIMENSION_LABELS: Record<string, string> = {
  liquidity:     'Likidite',
  profitability: 'Kârlılık',
  receivables:   'Alacak Yönetimi',
  efficiency:    'Verimlilik',
  debt_burden:   'Borç Yükü',
  growth:        'Büyüme',
}

// ── Main component ────────────────────────────────────────────────────────────

export function FinancialHealthScorecardClient({ companyId }: Props) {
  const { data, isLoading, error } = useQuery<{ scorecard: FinancialHealthScorecardReport }>({
    queryKey:  ['financial-health-scorecard', companyId],
    queryFn:   async () => {
      const res = await fetch('/api/intelligence/financial-health')
      if (!res.ok) throw new Error('Skorkart alınamadı')
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  const sc = data?.scorecard
  const hcfg = sc ? HEALTH_CFG[sc.overall_health] : null

  return (
    <section className="bg-white border border-[#e2e8f0] rounded-lg shadow-sm overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#f1f5f9]">
        <div>
          <h2 className="text-sm font-bold text-[#0f172a]">Finansal Sağlık Skorkartı</h2>
          <p className="text-[10px] text-[#94a3b8] mt-0.5">6 boyutlu bileşik skor</p>
        </div>
        {sc && <TrendBadge trend={sc.score_trend} />}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-10">
          <div className="animate-spin rounded-full h-5 w-5 border-2 border-brand-light border-t-transparent" />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="px-4 py-4 text-xs text-neg">
          Skorkart yüklenemedi. Sayfayı yenileyin.
        </div>
      )}

      {/* Composite score hero */}
      {sc && hcfg && (
        <div className="flex items-center gap-4 px-4 py-4 bg-[#f8fafc] border-b border-[#f1f5f9]">
          <div
            className={`flex flex-col items-center justify-center w-20 h-20 rounded-xl border-2 shrink-0 ${hcfg.badge}`}
          >
            <span className="text-4xl font-black leading-none">
              {sc.composite_score.toFixed(0)}
            </span>
            <span className="text-[10px] font-semibold mt-0.5">/ 100</span>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-bold ${hcfg.badge}`}
              >
                {hcfg.label}
              </span>
              {sc.prior_composite_score !== null && (
                <span className="text-[10px] text-[#94a3b8]">
                  Önceki: {sc.prior_composite_score.toFixed(1)}
                </span>
              )}
            </div>

            <div className="flex gap-3 flex-wrap mt-1">
              {sc.strongest_dimension && (
                <span className="text-[10px] text-pos-text font-medium">
                  En güçlü: {DIMENSION_LABELS[sc.strongest_dimension.dimension] ?? sc.strongest_dimension.dimension}
                  {' '}({Math.round(sc.strongest_dimension.score)})
                </span>
              )}
              {sc.weakest_dimension && (
                <span className="text-[10px] text-neg font-medium">
                  En zayıf: {DIMENSION_LABELS[sc.weakest_dimension.dimension] ?? sc.weakest_dimension.dimension}
                  {' '}({Math.round(sc.weakest_dimension.score)})
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Dimension bars */}
      {sc && (
        <div className="px-4">
          {sc.dimension_scores.map(dim => (
            <DimensionRow key={dim.dimension} dim={dim} />
          ))}
        </div>
      )}

      {/* Narrative footer */}
      {sc && (
        <div className="px-4 py-3 bg-[#f8fafc] border-t border-[#f1f5f9]">
          <p className="text-[11px] text-[#475569] leading-relaxed">{sc.narrative}</p>
          <p className="text-[10px] text-[#94a3b8] mt-1">
            {new Date(sc.computed_at).toLocaleString('tr-TR', {
              day:    '2-digit',
              month:  '2-digit',
              year:   'numeric',
              hour:   '2-digit',
              minute: '2-digit',
            })} tarihinde hesaplandı
          </p>
        </div>
      )}
    </section>
  )
}
