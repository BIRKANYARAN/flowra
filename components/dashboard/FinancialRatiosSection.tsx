'use client'

// ── FinancialRatiosSection — Finansal Oranlar ─────────────────────────────────
// Client island: fetches /api/finance/ratios and renders 8 key ratio cards
// with current value, direction chip, benchmark line, and 12-month sparkline.

import { useQuery } from '@tanstack/react-query'
import { Skeleton } from '@/components/ds'
import type { RatioTrend, FinancialRatiosReport } from '@/lib/services/finance/financial-ratios.service'
import { formatRatioValue } from '@/lib/services/finance/financial-ratios.service'

// ── API response shape ────────────────────────────────────────────────────────

interface RatiosApiResponse {
  report: FinancialRatiosReport
}

// ── Direction chip ────────────────────────────────────────────────────────────

const DIRECTION_CONFIG: Record<
  RatioTrend['direction'],
  { icon: string; badge: string }
> = {
  improving:    { icon: '↑', badge: 'bg-pos-light text-pos-text' },
  deteriorating:{ icon: '↓', badge: 'bg-neg-light text-neg-text' },
  stable:       { icon: '→', badge: 'bg-[#f1f5f9] text-[#64748b]' },
  insufficient: { icon: '·', badge: 'bg-[#f8fafc] text-[#94a3b8]' },
}

function DirectionChip({ direction, label }: { direction: RatioTrend['direction']; label: string }) {
  const cfg = DIRECTION_CONFIG[direction]
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded ${cfg.badge}`}>
      <span>{cfg.icon}</span>
      <span>{label}</span>
    </span>
  )
}

// ── Mini sparkline ────────────────────────────────────────────────────────────

function Sparkline({ points, unit }: { points: RatioTrend['points']; unit: string }) {
  const values = points.map(p => p.value)
  const valid  = values.filter((v): v is number => v !== null && isFinite(v))
  if (valid.length === 0) return <div className="h-6 text-[9px] text-[#cbd5e1]">— veri yok</div>

  const min = Math.min(...valid)
  const max = Math.max(...valid)
  const range = max - min || 1

  return (
    <div className="flex items-end gap-px h-6 mt-1" title={`${unit} — son ${points.length} ay`}>
      {points.map(p => {
        const v      = p.value
        const isNull = v === null || !isFinite(v)
        const pct    = isNull ? 0 : Math.max(5, Math.round(((v - min) / range) * 100))
        return (
          <div
            key={p.month}
            className={`flex-1 rounded-[1px] ${isNull ? 'bg-[#e2e8f0]' : 'bg-brand-light opacity-80'}`}
            style={{ height: `${pct}%` }}
            title={isNull ? `${p.label}: veri yok` : `${p.label}: ${formatRatioValue(v, unit)}`}
          />
        )
      })}
    </div>
  )
}

// ── Ratio card ────────────────────────────────────────────────────────────────

function RatioCard({ ratio }: { ratio: RatioTrend }) {
  const currentFmt = formatRatioValue(ratio.current, ratio.unit)
  const avg12mFmt  = formatRatioValue(ratio.avg_12m, ratio.unit)

  return (
    <div className="bg-white border border-[#e2e8f0] rounded px-4 py-3 shadow-sm flex flex-col gap-1.5">

      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] leading-none mb-0.5">
            {ratio.label}
          </div>
          <div className="text-xs text-[#64748b] leading-snug">{ratio.description}</div>
        </div>
        <DirectionChip direction={ratio.direction} label={ratio.direction_label} />
      </div>

      {/* Value row */}
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-black tabular-nums text-[#0f172a] leading-none">
          {currentFmt}
        </span>
        {ratio.avg_12m !== null && (
          <span className="text-[10px] text-[#94a3b8]">12A ort. {avg12mFmt}</span>
        )}
      </div>

      {/* Benchmark */}
      {ratio.benchmark && (
        <div className="text-[10px] text-[#64748b]">
          {ratio.benchmark.label}:{' '}
          <span className="font-semibold text-[#334155]">
            {formatRatioValue(ratio.benchmark.value, ratio.unit)}
          </span>
        </div>
      )}

      {/* Sparkline */}
      <Sparkline points={ratio.points} unit={ratio.unit} />
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function FinancialRatiosSection() {
  const { data, isLoading, error } = useQuery<RatiosApiResponse>({
    queryKey: ['financial-ratios'],
    queryFn: async () => {
      const res = await fetch('/api/finance/ratios')
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Veri alınamadı' })) as { error?: string }
        throw new Error(err.error ?? `HTTP ${res.status}`)
      }
      return res.json() as Promise<RatiosApiResponse>
    },
    staleTime: 3_600_000,
  })

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton height="h-5" />
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} height="h-28" />
          ))}
        </div>
      </div>
    )
  }

  if (error || !data) {
    const msg = error instanceof Error ? error.message : 'Finansal oran verileri alınamadı'
    return (
      <div className="bg-[#fef2f2] border border-[#fecaca] rounded px-4 py-3 text-xs text-[#dc2626] font-medium">
        {msg}
      </div>
    )
  }

  const { report } = data

  return (
    <div className="space-y-3">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
          Finansal Oranlar
        </div>
        <div className="text-[10px] text-[#94a3b8]">
          Son 12 ay · {report.as_of_month}
        </div>
      </div>

      {/* 2-column ratio card grid */}
      <div className="grid grid-cols-2 gap-3">
        {report.ratios.map(ratio => (
          <RatioCard key={ratio.key} ratio={ratio} />
        ))}
      </div>

      {/* Footer note */}
      <div className="text-[10px] text-[#94a3b8] text-right">
        Hesaplanma: {new Date(report.computed_at).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}
      </div>
    </div>
  )
}
