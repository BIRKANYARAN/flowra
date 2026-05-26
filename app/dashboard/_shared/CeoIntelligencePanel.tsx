'use client'

// ─────────────────────────────────────────────────────────────────────────────
// CeoIntelligencePanel — Multi-signal aggregation with health scoring.
//
// Shows:
//   1. overall_health status bar
//   2. top_metric in large format
//   3. narrative_headline (CFO-brief style)
//   4. Signals: critical (red border) → warning (amber) → info (gray)
//
// Uses TanStack Query (5-minute stale time mirrors server revalidate: 300).
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import type { CeoIntelligencePanel, IntelligenceSignal } from '@/lib/services/intelligence/ceo-intelligence.service'

// ── Health badge ──────────────────────────────────────────────────────────────

const HEALTH_CONFIG = {
  excellent: {
    label: 'Mükemmel',
    bar:   'bg-pos',
    badge: 'bg-pos-light text-pos-text border-pos',
    icon:  '●',
  },
  good: {
    label: 'İyi',
    bar:   'bg-[#22c55e]',
    badge: 'bg-pos-light text-pos-text border-pos',
    icon:  '●',
  },
  attention: {
    label: 'Dikkat',
    bar:   'bg-warn',
    badge: 'bg-warn-light text-warn-text border-warn',
    icon:  '◆',
  },
  critical: {
    label: 'Kritik',
    bar:   'bg-neg',
    badge: 'bg-neg-light text-neg border-neg',
    icon:  '▲',
  },
} as const

// ── Severity styles ────────────────────────────────────────────────────────────

const SEVERITY_CONFIG = {
  critical: {
    border:  'border-l-4 border-l-[#ef4444]',
    icon:    '▲',
    iconCls: 'text-[#ef4444]',
    title:   'text-[#dc2626] font-bold',
    badge:   'bg-neg-light text-neg text-[9px] font-bold px-1.5 py-0.5 rounded uppercase',
  },
  warning: {
    border:  'border-l-4 border-l-[#f59e0b]',
    icon:    '◆',
    iconCls: 'text-[#f59e0b]',
    title:   'text-[#b45309] font-semibold',
    badge:   'bg-warn-light text-warn-text text-[9px] font-bold px-1.5 py-0.5 rounded uppercase',
  },
  info: {
    border:  'border-l-4 border-l-[#e2e8f0]',
    icon:    '●',
    iconCls: 'text-[#94a3b8]',
    title:   'text-[#475569] font-medium',
    badge:   'bg-[#f1f5f9] text-[#64748b] text-[9px] font-bold px-1.5 py-0.5 rounded uppercase',
  },
} as const

const SEVERITY_LABEL: Record<IntelligenceSignal['severity'], string> = {
  critical: 'Kritik',
  warning:  'Uyarı',
  info:     'Bilgi',
}

// ── Signal card ───────────────────────────────────────────────────────────────

function SignalCard({ signal }: { signal: IntelligenceSignal }) {
  const cfg = SEVERITY_CONFIG[signal.severity]

  return (
    <div className={`bg-white rounded px-3 py-2.5 ${cfg.border} shadow-sm`}>
      <div className="flex items-start gap-2">
        <span className={`text-sm leading-none mt-0.5 flex-shrink-0 ${cfg.iconCls}`}>{cfg.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
            <span className={`text-xs ${cfg.title} leading-snug`}>{signal.headline}</span>
            <span className={cfg.badge}>{SEVERITY_LABEL[signal.severity]}</span>
          </div>
          <p className="text-[10px] text-[#64748b] leading-relaxed">{signal.detail}</p>
          {signal.metric && (
            <div className="mt-1.5 flex items-center gap-2 flex-wrap">
              <span className="text-xs font-black tabular-nums text-[#0f172a]">{signal.metric}</span>
              {signal.metric_label && (
                <span className="text-[10px] text-[#94a3b8]">{signal.metric_label}</span>
              )}
            </div>
          )}
        </div>
        {signal.action_label && signal.action_url && (
          <Link
            href={signal.action_url}
            className={`text-[10px] font-semibold shrink-0 px-2 py-1 rounded transition-colors ${
              signal.severity === 'critical'
                ? 'bg-neg text-white hover:bg-neg/90'
                : signal.severity === 'warning'
                  ? 'bg-warn-light text-warn-text hover:bg-warn/10 border border-warn/30'
                  : 'bg-[#f1f5f9] text-[#64748b] hover:bg-[#e2e8f0]'
            }`}
          >
            {signal.action_label} →
          </Link>
        )}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function CeoIntelligencePanel() {
  const { data, isLoading, isError } = useQuery<CeoIntelligencePanel>({
    queryKey: ['ceo-intelligence'],
    queryFn:  async () => {
      const res = await fetch('/api/intelligence/ceo-panel')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json() as Promise<CeoIntelligencePanel>
    },
    staleTime: 5 * 60 * 1000,
    retry:     1,
  })

  if (isLoading) {
    return (
      <div className="bg-white border border-[#e2e8f0] rounded shadow-sm p-4 animate-pulse">
        <div className="h-3 w-32 bg-[#e2e8f0] rounded mb-3" />
        <div className="h-6 w-full bg-[#f1f5f9] rounded mb-2" />
        <div className="grid grid-cols-2 gap-2 mt-3">
          <div className="h-16 bg-[#f8fafc] rounded" />
          <div className="h-16 bg-[#f8fafc] rounded" />
        </div>
      </div>
    )
  }

  if (isError || !data) return null

  const healthCfg = HEALTH_CONFIG[data.overall_health]

  return (
    <div className="flex flex-col gap-3">

      {/* ── Health bar + top metric ─────────────────────────────────── */}
      <div className="bg-white border border-[#e2e8f0] rounded shadow-sm overflow-hidden">

        {/* Health status bar */}
        <div className={`h-1 w-full ${healthCfg.bar}`} />

        <div className="px-4 py-3">
          <div className="flex items-start gap-4 flex-wrap">

            {/* Health badge + signal counts */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${healthCfg.badge}`}>
                  {healthCfg.icon} {healthCfg.label}
                </span>
                {data.critical_count > 0 && (
                  <span className="text-[10px] font-bold text-neg">{data.critical_count} kritik</span>
                )}
                {data.warning_count > 0 && (
                  <span className="text-[10px] font-bold text-warn-text">{data.warning_count} uyarı</span>
                )}
                {data.critical_count === 0 && data.warning_count === 0 && (
                  <span className="text-[10px] text-pos-text font-semibold">Sorun yok</span>
                )}
              </div>

              {/* Narrative headline */}
              <p className="text-xs text-[#334155] leading-relaxed font-medium">
                {data.narrative_headline}
              </p>
            </div>

            {/* Top metric */}
            <div className="text-right shrink-0">
              <div className="text-2xl font-black tabular-nums text-[#0f172a] leading-none">
                {data.top_metric.value}
              </div>
              <div className="text-[10px] text-[#94a3b8] mt-0.5">{data.top_metric.label}</div>
              <div className="text-[9px] text-[#cbd5e1] mt-0.5 max-w-[140px] text-right leading-tight">{data.top_metric.context}</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Signal cards ──────────────────────────────────────────────── */}
      {data.signals.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] px-0.5">
            İstihbarat Sinyalleri — {data.signals.length} aktif
          </p>
          {data.signals.map(signal => (
            <SignalCard key={signal.signal_id} signal={signal} />
          ))}
        </div>
      )}

      {data.signals.length === 0 && (
        <div className="bg-pos-light border border-pos-light rounded px-4 py-3 text-xs text-pos-text font-semibold">
          ✓ Tüm sistemler normal — aktif istihbarat sinyali yok.
        </div>
      )}
    </div>
  )
}
