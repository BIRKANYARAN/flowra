'use client'

// ── Shared UI sub-components for /dashboard/partners ─────────────────────────

import { TabId, DebtTranche, STATUS_LABELS, pct, fmtPct } from '@/app/dashboard/partners/_components/types'

export function ShareBar({ ratio }: { ratio: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-100 rounded-full h-1.5 max-w-[80px]">
        <div className="bg-primary-500 h-1.5 rounded-full" style={{ width: `${Math.min(ratio * 100, 100)}%` }} />
      </div>
      <span className="text-xs text-gray-500 w-8">{pct(ratio)}</span>
    </div>
  )
}

export function Skeleton({ h = 'h-16' }: { h?: string }) {
  return <div className={`bg-gray-100 rounded ${h} animate-pulse`} />
}

export function TabBtn({ id, active, label, onClick }: { id: TabId; active: boolean; label: string; onClick: (id: TabId) => void }) {
  return (
    <button
      onClick={() => onClick(id)}
      className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
        active ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
      }`}
    >
      {label}
    </button>
  )
}

export function StatusPill({ status }: { status: DebtTranche['status'] }) {
  const cls = {
    active:           'bg-blue-50 text-blue-700',
    partially_repaid: 'bg-amber-50 text-amber-700',
    repaid:           'bg-emerald-50 text-emerald-700',
    overdue:          'bg-red-50 text-red-700',
  }[status]
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${cls}`}>
      {STATUS_LABELS[status]}
    </span>
  )
}

export function RoiBar({ pct: roiPct }: { pct: number }) {
  const capped = Math.min(roiPct, 200)
  const color  = roiPct >= 100 ? 'bg-emerald-500' : roiPct >= 50 ? 'bg-amber-400' : 'bg-red-400'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-100 rounded-full h-2 max-w-[120px]">
        <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${Math.max(2, capped / 2)}%` }} />
      </div>
      <span className={`text-xs font-bold tabular-nums ${roiPct >= 100 ? 'text-emerald-600' : roiPct >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
        {fmtPct(roiPct)}
      </span>
    </div>
  )
}
