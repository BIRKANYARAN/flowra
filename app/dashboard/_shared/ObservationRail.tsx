'use client'

// ─────────────────────────────────────────────────────────────────────────────
// ObservationRail — Contextual intelligence signal rail
//
// Props: context string, maxItems? number (default 3)
// Fetches from /api/intelligence/observations?context={context}
// Subtle inline rail — not a banner, not a modal.
// Collapsed by default if all severity='signal', expanded if any 'caution'/'critical'
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface ObservationSpec {
  id: string
  context: string
  type: string
  title: string
  detail: string
  severity: 'signal' | 'caution' | 'critical'
  actionLabel?: string
  actionHref?: string
}

interface Props {
  context: string
  maxItems?: number
}

function SeverityDot({ severity }: { severity: ObservationSpec['severity'] }) {
  const color =
    severity === 'critical' ? 'bg-[#ef4444]' :
    severity === 'caution'  ? 'bg-[#f59e0b]' :
    'bg-[#64748b]'
  return <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1 ${color}`} />
}

function ObservationRow({ obs }: { obs: ObservationSpec }) {
  const titleColor =
    obs.severity === 'critical' ? 'text-[#dc2626]' :
    obs.severity === 'caution'  ? 'text-[#b45309]' :
    'text-[#475569]'

  return (
    <div className="flex items-start gap-2 py-2 px-3 border-b border-[#f1f5f9] last:border-0">
      <SeverityDot severity={obs.severity} />
      <div className="flex-1 min-w-0">
        <span className={`text-[11px] font-bold ${titleColor}`}>{obs.title}</span>
        <span className="text-[11px] text-[#64748b] ml-1.5">{obs.detail}</span>
        {obs.actionLabel && obs.actionHref && (
          <Link
            href={obs.actionHref}
            className="ml-2 text-[10px] font-semibold text-[#6366f1] hover:underline whitespace-nowrap"
          >
            {obs.actionLabel} →
          </Link>
        )}
      </div>
    </div>
  )
}

export function ObservationRail({ context, maxItems = 3 }: Props) {
  const [observations, setObservations] = useState<ObservationSpec[]>([])
  const [loading, setLoading]           = useState(true)
  const [collapsed, setCollapsed]       = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/intelligence/observations?context=${encodeURIComponent(context)}`)
      .then(r => r.ok ? r.json() : null)
      .then((data: { observations: ObservationSpec[] } | null) => {
        if (cancelled) return
        const obs = data?.observations ?? []
        setObservations(obs)
        // Auto-expand if any caution or critical
        const hasUrgent = obs.some(o => o.severity === 'caution' || o.severity === 'critical')
        setCollapsed(!hasUrgent)
      })
      .catch(() => { /* non-fatal — rail stays hidden */ })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [context])

  if (loading) return null
  if (observations.length === 0) return null

  const visible  = observations.slice(0, maxItems)
  const hasMore  = observations.length > maxItems
  const urgent   = observations.filter(o => o.severity !== 'signal').length
  const label    = urgent > 0
    ? `${urgent} sinyal · dikkat gerekiyor`
    : `${observations.length} gözlem`

  const headerBg =
    observations.some(o => o.severity === 'critical') ? 'bg-[#fef2f2] border-[#fecaca]' :
    observations.some(o => o.severity === 'caution')  ? 'bg-[#fffbeb] border-[#fde68a]' :
    'bg-[#f8fafc] border-[#e8eaef]'

  const labelColor =
    observations.some(o => o.severity === 'critical') ? 'text-[#dc2626]' :
    observations.some(o => o.severity === 'caution')  ? 'text-[#b45309]' :
    'text-[#64748b]'

  return (
    <div className={`border rounded shadow-sm overflow-hidden ${headerBg}`}>
      {/* Header / toggle */}
      <button
        type="button"
        onClick={() => setCollapsed(c => !c)}
        className={`w-full flex items-center justify-between px-3 py-2 text-left hover:opacity-80 transition-opacity ${headerBg}`}
      >
        <div className="flex items-center gap-2">
          <span className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">
            Durum Sinyalleri
          </span>
          <span className={`text-[10px] font-semibold ${labelColor}`}>{label}</span>
        </div>
        <span className="text-[10px] text-[#94a3b8]">{collapsed ? '▸' : '▾'}</span>
      </button>

      {/* Observations list */}
      {!collapsed && (
        <div className="bg-white border-t border-[#f1f5f9]">
          {visible.map(obs => (
            <ObservationRow key={obs.id} obs={obs} />
          ))}
          {hasMore && (
            <div className="px-3 py-1.5 text-[10px] text-[#94a3b8]">
              +{observations.length - maxItems} daha fazla sinyal
            </div>
          )}
        </div>
      )}
    </div>
  )
}
