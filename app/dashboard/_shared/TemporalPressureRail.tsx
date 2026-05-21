'use client'

// ─────────────────────────────────────────────────────────────────────────────
// TemporalPressureRail — 90-day timeline of time-pressured events
//
// Client component: fetches from /api/pressure/timeline
// Shows events grouped by week, color-coded by severity.
// Displays cash trajectory as a compressed sparkline.
// Shows "next critical event in N days" prominently.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { PressureEvent, PressureTimelineResponse, CashTrajectoryPoint } from '@/app/api/pressure/timeline/route'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtAmountCompact(n: number): string {
  if (n >= 1_000_000) return `₺${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `₺${Math.round(n / 1_000)}K`
  return `₺${Math.round(n).toLocaleString('tr-TR')}`
}

function daysBetween(fromISO: string, toISO: string): number {
  return Math.round((new Date(toISO).getTime() - new Date(fromISO).getTime()) / 86_400_000)
}

function weekLabel(dateISO: string): string {
  const d = new Date(dateISO)
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })
}

function getWeekKey(dateISO: string): string {
  const d = new Date(dateISO)
  const day = d.getUTCDay()
  // Start of the ISO week (Monday)
  const diffToMonday = (day === 0 ? -6 : 1 - day)
  const monday = new Date(d)
  monday.setUTCDate(d.getUTCDate() + diffToMonday)
  return monday.toISOString().slice(0, 10)
}

// ── Sub-components ─────────────────────────────────────────────────────────────

const EVENT_TYPE_LABEL: Record<string, string> = {
  collection_due:     'Tahsilat',
  tranche_due:        'Tranche',
  period_close:       'Dönem',
  expense_commitment: 'Gider',
  tax_due:            'Vergi',
  equity_call:        'Sermaye',
}

const EVENT_TYPE_ICON: Record<string, string> = {
  collection_due:     '↑',
  tranche_due:        '↓',
  period_close:       '○',
  expense_commitment: '↓',
  tax_due:            '↓',
  equity_call:        '↓',
}

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-neg',
  warning:  'bg-warn',
  normal:   'bg-[#94a3b8]',
}

const SEVERITY_BORDER: Record<string, string> = {
  critical: 'border-neg-light bg-neg-light/30',
  warning:  'border-warn-light bg-warn-light/30',
  normal:   'border-[#e2e8f0] bg-white',
}

const SEVERITY_LABEL_COLOR: Record<string, string> = {
  critical: 'text-neg-text',
  warning:  'text-warn-text',
  normal:   'text-[#64748b]',
}

function EventChip({ event, today }: { event: PressureEvent; today: string }) {
  const daysUntil = daysBetween(today, event.date)
  const isInflow  = event.type === 'collection_due'

  return (
    <Link href={event.action_href}
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded border text-[10px] font-medium transition-colors hover:opacity-80 ${SEVERITY_BORDER[event.severity]}`}>
      <span className={`font-bold ${isInflow ? 'text-pos-text' : SEVERITY_LABEL_COLOR[event.severity]}`}>
        {EVENT_TYPE_ICON[event.type]} {EVENT_TYPE_LABEL[event.type] ?? event.type}
      </span>
      <span className={SEVERITY_LABEL_COLOR[event.severity]}>
        {event.label.length > 28 ? event.label.slice(0, 28) + '…' : event.label}
      </span>
      {daysUntil <= 0
        ? <span className="text-neg font-black text-[9px]">bugün!</span>
        : daysUntil <= 7
          ? <span className="font-black text-[9px] text-neg">{daysUntil}g</span>
          : <span className="text-[#94a3b8] text-[9px]">{daysUntil}g</span>
      }
    </Link>
  )
}

function MiniSparkline({ points }: { points: CashTrajectoryPoint[] }) {
  if (points.length < 2) return null

  const values  = points.map(p => p.projected_cash)
  const minVal  = Math.min(...values)
  const maxVal  = Math.max(...values)
  const range   = maxVal - minVal || 1
  const W = 200
  const H = 28

  const svgPoints = points.map((p, i) => {
    const x = (i / (points.length - 1)) * W
    const y = H - ((p.projected_cash - minVal) / range) * H
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')

  // Color based on final vs initial
  const finalVal = values[values.length - 1]
  const initVal  = values[0]
  const lineColor = finalVal >= initVal ? '#22c55e' : '#ef4444'

  return (
    <svg width={W} height={H} className="flex-shrink-0 opacity-70">
      <polyline
        points={svgPoints}
        fill="none"
        stroke={lineColor}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* Zero line if applicable */}
      {minVal < 0 && maxVal > 0 && (
        <line
          x1={0} y1={H - ((0 - minVal) / range) * H}
          x2={W} y2={H - ((0 - minVal) / range) * H}
          stroke="#e2e8f0" strokeWidth="0.5" strokeDasharray="2,2"
        />
      )}
    </svg>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export function TemporalPressureRail({ days = 90 }: { days?: number }) {
  const [data,    setData]    = useState<PressureTimelineResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    fetch(`/api/pressure/timeline?days=${days}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then((d: PressureTimelineResponse) => { if (!cancelled) { setData(d); setLoading(false) } })
      .catch((e: unknown) => { if (!cancelled) { setError(String(e)); setLoading(false) } })

    return () => { cancelled = true }
  }, [days])

  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="bg-white border border-[#e2e8f0] rounded shadow-sm overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#f1f5f9]">
        <div className="flex items-center gap-3">
          <span className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">
            Zaman Baskısı Rayı
          </span>
          <span className="text-[9px] text-[#94a3b8]">{days} gün penceresi</span>
        </div>
        {data && (
          <div className="flex items-center gap-3">
            {data.summary.critical_events_count > 0 && (
              <span className="text-[9px] font-black bg-neg text-white px-2 py-0.5 rounded leading-none">
                {data.summary.critical_events_count} kritik
              </span>
            )}
            <div className="flex items-center gap-1.5">
              <MiniSparkline points={data.cash_trajectory} />
              <div className="text-right">
                <div className="text-[9px] text-[#94a3b8]">90g net</div>
                <div className={`text-[10px] font-black tabular-nums ${data.summary.net_90_day_try >= 0 ? 'text-pos-text' : 'text-neg-text'}`}>
                  {data.summary.net_90_day_try >= 0 ? '+' : ''}{fmtAmountCompact(data.summary.net_90_day_try)}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Body */}
      {loading && (
        <div className="px-4 py-3 text-[11px] text-[#94a3b8] animate-pulse">Yükleniyor…</div>
      )}

      {error && (
        <div className="px-4 py-3 text-[11px] text-neg-text">Veri yüklenemedi: {error}</div>
      )}

      {data && !loading && (
        <>
          {/* Next critical event banner */}
          {(() => {
            const nextCritical = data.events.find(e => e.severity === 'critical')
            if (!nextCritical) return null
            const daysUntil = daysBetween(today, nextCritical.date)
            return (
              <Link href={nextCritical.action_href}
                className="flex items-center justify-between gap-4 px-4 py-2 bg-neg-light/40 border-b border-neg-light hover:bg-neg-light/60 transition-colors">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-neg flex-shrink-0" />
                  <span className="text-[11px] font-bold text-neg-text truncate">
                    Sonraki kritik: {nextCritical.label}
                  </span>
                </div>
                <span className="flex-shrink-0 text-[11px] font-black text-neg tabular-nums">
                  {daysUntil <= 0 ? 'bugün!' : `${daysUntil} gün`}
                </span>
              </Link>
            )
          })()}

          {/* Weekly grouped timeline */}
          {data.events.length === 0 ? (
            <div className="flex items-center gap-3 px-4 py-4">
              <span className="w-2 h-2 rounded-full bg-pos flex-shrink-0" />
              <span className="text-xs text-[#64748b]">{days} günlük pencerede zamansal baskı yok</span>
            </div>
          ) : (
            <div className="px-4 py-3 space-y-3">
              {/* Group events by week */}
              {(() => {
                const weekMap = new Map<string, PressureEvent[]>()
                for (const ev of data.events) {
                  const wk = getWeekKey(ev.date)
                  if (!weekMap.has(wk)) weekMap.set(wk, [])
                  weekMap.get(wk)!.push(ev)
                }
                const weeks = Array.from(weekMap.entries()).sort(([a], [b]) => a.localeCompare(b))

                return weeks.map(([weekStart, evs]) => {
                  const weekEnd = new Date(weekStart)
                  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6)
                  const hasCritical = evs.some(e => e.severity === 'critical')
                  const hasWarning  = evs.some(e => e.severity === 'warning')
                  const dotColor    = hasCritical ? 'bg-neg' : hasWarning ? 'bg-warn' : 'bg-[#94a3b8]'

                  return (
                    <div key={weekStart}>
                      {/* Week label */}
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotColor}`} />
                        <span className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">
                          {weekLabel(weekStart)} — {weekLabel(weekEnd.toISOString().slice(0, 10))}
                        </span>
                        <div className="flex-1 border-t border-dashed border-[#f1f5f9]" />
                        <span className="text-[9px] text-[#94a3b8] tabular-nums">
                          {evs.length} olay
                        </span>
                      </div>
                      {/* Event chips */}
                      <div className="flex flex-wrap gap-1.5 pl-3.5">
                        {evs.map((ev, i) => (
                          <EventChip key={`${ev.type}-${ev.entity_id ?? i}`} event={ev} today={today} />
                        ))}
                      </div>
                    </div>
                  )
                })
              })()}
            </div>
          )}

          {/* Summary footer */}
          <div className="px-4 py-2 border-t border-[#f1f5f9] flex items-center gap-6 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] uppercase tracking-widest text-[#94a3b8]">Beklenen Tahsilat</span>
              <span className="text-[10px] font-black tabular-nums text-pos-text">
                +{fmtAmountCompact(data.summary.total_expected_collections_try)}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] uppercase tracking-widest text-[#94a3b8]">Toplam Yükümlülük</span>
              <span className="text-[10px] font-black tabular-nums text-neg-text">
                -{fmtAmountCompact(data.summary.total_obligations_try)}
              </span>
            </div>
            <div className="flex-1" />
            <Link href="/dashboard/planning?tab=cash-projection"
              className="text-[10px] font-semibold text-brand-light hover:text-brand">
              Projeksiyon →
            </Link>
          </div>
        </>
      )}
    </div>
  )
}
