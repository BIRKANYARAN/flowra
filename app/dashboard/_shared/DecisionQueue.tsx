'use client'

// ─────────────────────────────────────────────────────────────────────────────
// DecisionQueue — Top decisions requiring human action
//
// Receives DecisionAlert[] from AlertEngine, reformats as framed decisions.
// Max 7 items, sorted by severity (critical first).
// Each item: numbered + title + context sentence + action button.
// No alert card aesthetics — clean numbered list.
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link'
import type { DecisionAlert } from '@/lib/engines/alert.engine'

export interface DecisionQueueProps {
  alerts: DecisionAlert[]
}

const SEVERITY_STYLES = {
  critical: {
    num:    'text-white bg-neg',
    title:  'text-[#0f172a] font-bold',
    detail: 'text-neg-text',
    btn:    'bg-neg text-white hover:bg-neg/90',
    border: 'border-l-neg',
  },
  warning: {
    num:    'text-white bg-warn',
    title:  'text-[#1e293b] font-semibold',
    detail: 'text-warn-text',
    btn:    'border border-warn text-warn-text hover:bg-warn-light',
    border: 'border-l-warn',
  },
  info: {
    num:    'text-[#64748b] bg-[#f1f5f9]',
    title:  'text-[#475569] font-medium',
    detail: 'text-[#94a3b8]',
    btn:    'border border-[#e2e8f0] text-[#64748b] hover:bg-[#f8fafc]',
    border: 'border-l-[#e2e8f0]',
  },
} satisfies Record<string, {
  num: string; title: string; detail: string; btn: string; border: string
}>

export function DecisionQueue({ alerts }: DecisionQueueProps) {
  const items = alerts.slice(0, 7)

  return (
    <div className="bg-white border border-[#e2e8f0] rounded shadow-sm overflow-hidden h-full flex flex-col">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#f1f5f9] flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <span className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">Karar Sırası</span>
          {items.filter(a => a.severity === 'critical').length > 0 && (
            <span className="inline-flex items-center text-[9px] font-black bg-neg text-white px-1.5 py-0.5 rounded leading-none">
              {items.filter(a => a.severity === 'critical').length} ACİL
            </span>
          )}
        </div>
        <span className="text-[10px] text-[#94a3b8]">{items.length} karar</span>
      </div>

      {/* Items */}
      {items.length === 0 ? (
        <div className="flex items-center gap-3 px-4 py-4 flex-1">
          <span className="w-2 h-2 rounded-full bg-pos flex-shrink-0" />
          <span className="text-xs text-[#64748b]">Tüm sistemler normal · Bekleyen karar yok</span>
        </div>
      ) : (
        <div className="divide-y divide-[#f1f5f9] flex-1 overflow-auto">
          {items.map((alert, idx) => {
            const s = SEVERITY_STYLES[alert.severity] ?? SEVERITY_STYLES.info
            return (
              <div key={alert.id}
                className={`flex items-start gap-3 px-4 py-3 border-l-[3px] ${s.border}`}>
                {/* Number */}
                <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black leading-none ${s.num}`}>
                  {idx + 1}
                </span>
                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className={`text-xs leading-tight ${s.title}`}>{alert.title}</div>
                  <div className={`text-[11px] mt-0.5 leading-snug ${s.detail}`}>{alert.detail}</div>
                </div>
                {/* Action */}
                <Link href={alert.actionHref}
                  className={`flex-shrink-0 text-[10px] font-bold px-2.5 py-1.5 rounded transition-colors whitespace-nowrap ${s.btn}`}>
                  {alert.actionLabel} →
                </Link>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
