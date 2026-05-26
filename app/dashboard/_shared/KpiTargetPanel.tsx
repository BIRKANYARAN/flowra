'use client'

// ─────────────────────────────────────────────────────────────────────────────
// KpiTargetPanel — Hedef Takibi section for the CEO Cockpit.
//
// Fetches KPI dashboard report and renders:
//   1. Overall score badge
//   2. 3-column KPI grid with progress bars and status dots
//
// Uses TanStack Query (5-minute stale time mirrors server revalidate: 300).
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery } from '@tanstack/react-query'
import type { KpiDashboardReport, KpiStatus } from '@/lib/services/intelligence/kpi-tracker.service'

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  achieved: {
    dot:      'bg-[#22c55e]',
    bar:      'bg-[#22c55e]',
    badge:    'bg-pos-light text-pos-text border-pos',
    label:    'Hedefte',
    cardCls:  'border-[#bbf7d0]',
  },
  on_track: {
    dot:      'bg-[#3b82f6]',
    bar:      'bg-[#3b82f6]',
    badge:    'bg-[#eff6ff] text-[#1d4ed8] border-[#bfdbfe]',
    label:    'İyi Gidiyor',
    cardCls:  'border-[#bfdbfe]',
  },
  at_risk: {
    dot:      'bg-[#f59e0b]',
    bar:      'bg-[#f59e0b]',
    badge:    'bg-warn-light text-warn-text border-warn',
    label:    'Riskli',
    cardCls:  'border-[#fde68a]',
  },
  off_track: {
    dot:      'bg-[#ef4444]',
    bar:      'bg-[#ef4444]',
    badge:    'bg-neg-light text-neg border-neg',
    label:    'Geride',
    cardCls:  'border-[#fecaca]',
  },
  no_target: {
    dot:      'bg-[#cbd5e1]',
    bar:      'bg-[#e2e8f0]',
    badge:    'bg-[#f1f5f9] text-[#94a3b8] border-[#e2e8f0]',
    label:    'Hedef Yok',
    cardCls:  'border-[#e2e8f0]',
  },
} as const

// ── Formatters ────────────────────────────────────────────────────────────────

function formatValue(value: number | null, format: KpiStatus['format']): string {
  if (value === null) return '—'
  switch (format) {
    case 'currency': {
      const abs  = Math.abs(value)
      const sign = value < 0 ? '-' : ''
      if (abs >= 1_000_000) return `${sign}₺${(abs / 1_000_000).toFixed(1)}M`
      if (abs >= 1_000)     return `${sign}₺${Math.round(abs / 1_000)}K`
      return `${sign}₺${Math.round(abs).toLocaleString('tr-TR')}`
    }
    case 'percent':
      return `%${value.toFixed(1)}`
    case 'months':
      return `${value.toFixed(1)} ay`
    case 'decimal':
      return value.toFixed(2)
    default:
      return String(value)
  }
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({ kpi }: { kpi: KpiStatus }) {
  const cfg       = STATUS_CONFIG[kpi.status]
  const progress  = Math.min(100, Math.max(0, kpi.progress_pct ?? 0))

  return (
    <div className={`bg-white rounded border ${cfg.cardCls} px-3 py-2.5 flex flex-col gap-1.5 shadow-sm`}>
      {/* Header: name + status dot */}
      <div className="flex items-center justify-between gap-1">
        <span className="text-[10px] font-black uppercase tracking-widest text-[#94a3b8] leading-none truncate">
          {kpi.label}
        </span>
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} title={cfg.label} />
      </div>

      {/* Current value */}
      <div className="text-base font-black tabular-nums text-[#0f172a] leading-none">
        {formatValue(kpi.current_value, kpi.format)}
      </div>

      {/* Target */}
      <div className="text-[10px] text-[#94a3b8]">
        Hedef: {formatValue(kpi.target_value, kpi.format)}
      </div>

      {/* Progress bar */}
      <div className="w-full h-1.5 bg-[#f1f5f9] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${cfg.bar}`}
          style={{ width: `${kpi.status === 'no_target' ? 0 : progress}%` }}
        />
      </div>

      {/* Progress % + status badge */}
      <div className="flex items-center justify-between gap-1">
        <span className="text-[10px] tabular-nums text-[#64748b]">
          {kpi.progress_pct !== null ? `%${Math.round(kpi.progress_pct)}` : '—'}
        </span>
        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase ${cfg.badge}`}>
          {cfg.label}
        </span>
      </div>
    </div>
  )
}

// ── Score badge ───────────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 80
    ? 'bg-pos-light text-pos-text border-pos'
    : score >= 60
      ? 'bg-warn-light text-warn-text border-warn'
      : 'bg-neg-light text-neg border-neg'

  return (
    <span className={`text-xs font-black px-2 py-0.5 rounded border tabular-nums ${color}`}>
      {score}
    </span>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function KpiTargetPanel() {
  const { data, isLoading, isError } = useQuery<KpiDashboardReport>({
    queryKey: ['kpi-dashboard'],
    queryFn: async () => {
      const res = await fetch('/api/intelligence/kpi-dashboard')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json() as Promise<KpiDashboardReport>
    },
    staleTime: 5 * 60 * 1000,
    retry:     1,
  })

  if (isLoading) {
    return (
      <div className="bg-white border border-[#e2e8f0] rounded shadow-sm p-4 animate-pulse">
        <div className="h-3 w-32 bg-[#e2e8f0] rounded mb-3" />
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-20 bg-[#f8fafc] rounded" />
          ))}
        </div>
      </div>
    )
  }

  if (isError || !data) return null

  // Don't render if no targets are set at all
  if (data.no_target_count === data.kpis.length) {
    return (
      <div className="bg-white border border-[#e2e8f0] rounded shadow-sm px-4 py-3 flex items-center justify-between">
        <div>
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-0.5">
            Hedef Takibi
          </div>
          <p className="text-xs text-[#94a3b8]">
            Henüz KPI hedefi tanımlanmamış. Ayarlar &rsaquo; KPI Hedefleri bölümünden ekleyebilirsiniz.
          </p>
        </div>
      </div>
    )
  }

  const kpisWithTarget = data.kpis.filter(k => k.status !== 'no_target')

  return (
    <div className="flex flex-col gap-3">
      {/* ── Header bar ─────────────────────────────────────────────────── */}
      <div className="bg-white border border-[#e2e8f0] rounded shadow-sm px-4 py-3 flex items-center justify-between">
        <div>
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-0.5">
            Hedef Takibi
          </div>
          <div className="text-xs text-[#64748b]">{data.period_label}</div>
        </div>

        <div className="flex items-center gap-3">
          {/* Summary counts */}
          <div className="hidden sm:flex items-center gap-2 text-[10px] text-[#94a3b8]">
            {data.achieved_count  > 0 && <span className="text-pos-text font-bold">{data.achieved_count} ✓</span>}
            {data.on_track_count  > 0 && <span className="text-[#1d4ed8] font-bold">{data.on_track_count} →</span>}
            {data.at_risk_count   > 0 && <span className="text-warn-text font-bold">{data.at_risk_count} !</span>}
            {data.off_track_count > 0 && <span className="text-neg font-bold">{data.off_track_count} ✗</span>}
          </div>
          {/* Score */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-[#94a3b8]">Skor</span>
            <ScoreBadge score={data.overall_score} />
          </div>
        </div>
      </div>

      {/* ── KPI grid (3-column) ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {kpisWithTarget.map(kpi => (
          <KpiCard key={kpi.kpi_key} kpi={kpi} />
        ))}
      </div>
    </div>
  )
}
