'use client'

// ─────────────────────────────────────────────────────────────────────────────
// SituationScoreCard — CEO Situation Score Hero Widget
//
// Displays the composite situation score as the most prominent element on the
// CEO Cockpit. Shows:
//   - Large circular score gauge with status color
//   - Status chip (Sağlıklı / Dikkat / Risk / Kritik)
//   - Situation line text (large, prominent Turkish narrative)
//   - 5 component bars: label, score bar (colored), weight
//
// Uses TanStack Query (5-minute stale matches server revalidate: 300).
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery } from '@tanstack/react-query'
import type { SituationReport, SituationComponent } from '@/lib/services/intelligence/situation-engine.service'

// ── Status config ──────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  healthy: {
    bg:          'bg-emerald-50',
    border:      'border-emerald-200',
    ring:        'ring-emerald-400',
    scoreColor:  'text-emerald-700',
    chipBg:      'bg-emerald-100',
    chipBorder:  'border-emerald-200',
    chipText:    'text-emerald-800',
    barColor:    'bg-emerald-500',
    dot:         'bg-emerald-500',
    label:       'Sağlıklı',
  },
  caution: {
    bg:          'bg-amber-50',
    border:      'border-amber-200',
    ring:        'ring-amber-400',
    scoreColor:  'text-amber-700',
    chipBg:      'bg-amber-100',
    chipBorder:  'border-amber-200',
    chipText:    'text-amber-800',
    barColor:    'bg-amber-500',
    dot:         'bg-amber-500',
    label:       'Dikkat',
  },
  at_risk: {
    bg:          'bg-orange-50',
    border:      'border-orange-200',
    ring:        'ring-orange-400',
    scoreColor:  'text-orange-700',
    chipBg:      'bg-orange-100',
    chipBorder:  'border-orange-200',
    chipText:    'text-orange-800',
    barColor:    'bg-orange-500',
    dot:         'bg-orange-500',
    label:       'Risk',
  },
  critical: {
    bg:          'bg-red-50',
    border:      'border-red-200',
    ring:        'ring-red-400',
    scoreColor:  'text-red-700',
    chipBg:      'bg-red-100',
    chipBorder:  'border-red-200',
    chipText:    'text-red-800',
    barColor:    'bg-red-500',
    dot:         'bg-red-500',
    label:       'Kritik',
  },
} as const

type Status = keyof typeof STATUS_CONFIG

function getConfig(status: string) {
  return STATUS_CONFIG[status as Status] ?? STATUS_CONFIG.caution
}

// ── Score Gauge ────────────────────────────────────────────────────────────────

function ScoreGauge({ score, status }: { score: number; status: string }) {
  const cfg    = getConfig(status)
  const radius = 36
  const circumference = 2 * Math.PI * radius
  const filled = (score / 100) * circumference

  return (
    <div className="relative flex items-center justify-center shrink-0" style={{ width: 100, height: 100 }}>
      <svg width="100" height="100" className="rotate-[-90deg]">
        {/* Background track */}
        <circle
          cx="50" cy="50" r={radius}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth="8"
        />
        {/* Filled arc */}
        <circle
          cx="50" cy="50" r={radius}
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference - filled}`}
          className={`transition-all duration-700 ${
            status === 'healthy'  ? 'stroke-emerald-500' :
            status === 'caution'  ? 'stroke-amber-500' :
            status === 'at_risk'  ? 'stroke-orange-500' :
            'stroke-red-500'
          }`}
        />
      </svg>
      {/* Score text centered */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-2xl font-black tabular-nums leading-none ${cfg.scoreColor}`}>
          {Math.round(score)}
        </span>
        <span className="text-[9px] text-[#94a3b8] font-semibold mt-0.5">/ 100</span>
      </div>
    </div>
  )
}

// ── Component Bar ──────────────────────────────────────────────────────────────

function ComponentBar({ component, status }: { component: SituationComponent; status: string }) {
  const cfg = getConfig(status)

  return (
    <div className="flex items-center gap-2">
      {/* Label */}
      <span className="text-[10px] text-[#64748b] font-medium w-28 shrink-0 truncate">
        {component.label}
      </span>
      {/* Bar */}
      <div className="flex-1 h-1.5 bg-[#f1f5f9] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${cfg.barColor}`}
          style={{ width: `${component.score}%` }}
        />
      </div>
      {/* Score */}
      <span className="text-[10px] tabular-nums text-[#475569] font-semibold w-6 text-right shrink-0">
        {Math.round(component.score)}
      </span>
      {/* Weight chip */}
      <span className="text-[9px] text-[#94a3b8] w-8 shrink-0 text-right">
        {Math.round(component.weight * 100)}%
      </span>
      {/* Input label */}
      <span className="text-[9px] text-[#94a3b8] w-24 shrink-0 truncate text-right hidden sm:block">
        {component.input_label}
      </span>
    </div>
  )
}

// ── Skeleton ───────────────────────────────────────────────────────────────────

function SituationScoreCardSkeleton() {
  return (
    <div className="w-full bg-white border border-[#e2e8f0] rounded-lg px-5 py-4 shadow-sm animate-pulse">
      <div className="flex items-start gap-5">
        <div className="w-[100px] h-[100px] rounded-full bg-[#f1f5f9] shrink-0" />
        <div className="flex-1 space-y-2 pt-2">
          <div className="h-4 bg-[#f1f5f9] rounded w-1/3" />
          <div className="h-3 bg-[#f1f5f9] rounded w-2/3" />
          <div className="space-y-1.5 pt-2">
            {[1,2,3,4,5].map(i => (
              <div key={i} className="h-1.5 bg-[#f1f5f9] rounded-full" />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function SituationScoreCard() {
  const { data, isLoading, isError } = useQuery<SituationReport>({
    queryKey: ['intelligence', 'situation'],
    queryFn:  () => fetch('/api/intelligence/situation').then(r => {
      if (!r.ok) throw new Error('Durum raporu alınamadı')
      return r.json() as Promise<SituationReport>
    }),
    staleTime: 5 * 60 * 1000,
  })

  if (isLoading) return <SituationScoreCardSkeleton />

  if (isError || !data) {
    return (
      <div className="w-full bg-white border border-[#e2e8f0] rounded-lg px-5 py-4 shadow-sm">
        <p className="text-xs text-[#94a3b8]">Durum skoru yüklenemedi.</p>
      </div>
    )
  }

  const cfg = getConfig(data.status)

  return (
    <div className={`w-full rounded-lg border px-5 py-4 shadow-sm ${cfg.bg} ${cfg.border}`}>

      {/* ── Top section: gauge + headline ───────────────────────────────────── */}
      <div className="flex items-start gap-5">

        {/* Circular gauge */}
        <ScoreGauge score={data.composite_score} status={data.status} />

        {/* Right: status chip + situation line */}
        <div className="flex-1 min-w-0 pt-1">

          {/* Status chip */}
          <span className={`
            inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-bold mb-2
            ${cfg.chipBg} ${cfg.chipBorder} ${cfg.chipText}
          `}>
            <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
            {cfg.label}
          </span>

          {/* Situation line — hero narrative */}
          <p className={`text-sm font-semibold leading-snug ${cfg.scoreColor} mb-1`}>
            {data.situation_line}
          </p>

          {/* Status detail label */}
          <p className="text-[10px] text-[#94a3b8]">
            Durum skoru — {data.status_label}
          </p>
        </div>
      </div>

      {/* ── Divider ─────────────────────────────────────────────────────────── */}
      <div className="border-t border-[#e2e8f0] mt-3 mb-3" />

      {/* ── 5 component bars ────────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        {data.components.map(c => (
          <ComponentBar key={c.key} component={c} status={data.status} />
        ))}
      </div>

      {/* ── Footer: computed_at ─────────────────────────────────────────────── */}
      <div className="mt-2 text-[9px] text-[#94a3b8] text-right">
        {new Date(data.computed_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })} itibarıyla hesaplandı
      </div>
    </div>
  )
}
